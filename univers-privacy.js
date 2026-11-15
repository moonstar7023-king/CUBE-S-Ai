/* =====================================================================
   CUTE-S AI - Privacy & data controls, Models overview, Admin (univers-privacy.js)
   - Privacy: plain-language disclosure, retention, deletion of chats, files,
     images, usage counters and the whole account.
   - Models: what is installed and what is really available on this device.
   - Admin: only for UIDs listed in the Firestore "admins" collection. Admins
     can switch models on/off, set defaults and add model entries. They get NO
     access to anyone's chats or files (the Firestore rules forbid it) and
     they cannot switch off the safety checks (those are frozen in code).
   ===================================================================== */
(function () {
  if (!window.Uni) return;
  const { h, ls } = Uni;
  const FV = () => firebase.firestore.FieldValue;
  const UDoc = () => db.collection('users').doc(user.uid);

  async function delCollection(ref, withMsgs) {
    let n = 0;
    for (let guard = 0; guard < 50; guard++) {
      const s = await ref.limit(200).get(); if (s.empty) break;
      for (const d of s.docs) { if (withMsgs) { try { await d.ref.collection('msgs').doc('main').delete(); } catch (e) {} } await d.ref.delete(); n++; }
    }
    return n;
  }
  async function wipeLocal() {
    try { if (typeof imAll === 'function') for (const r of await imAll()) await imDel(r.id); } catch (e) {}
    try { if (Uni.FH) await Uni.FH.clear(); } catch (e) {}
    try { Object.keys(localStorage).filter(k => /^cs_/.test(k)).forEach(k => localStorage.removeItem(k)); } catch (e) {}
  }

  /* ---------- retention: runs when the app opens (the app must be opened for it to run) ---------- */
  Uni.enforceRetention = async function () {
    try {
      if (!user) return; const p = await UDoc().collection('prefs').doc('privacy').get(), days = p.exists ? +p.data().retentionDays || 0 : 0;
      if (!days) return;
      const cutoff = firebase.firestore.Timestamp.fromMillis(Date.now() - days * 864e5);
      const s = await UDoc().collection('chats').where('updatedAt', '<', cutoff).limit(60).get();
      for (const d of s.docs) { if (typeof cid !== 'undefined' && d.id === cid) continue; try { await d.ref.collection('msgs').doc('main').delete(); } catch (e) {} await d.ref.delete(); }
      if (s.size && typeof loadChats === 'function') loadChats();
    } catch (e) { /* retention must never break the app */ }
  };
  try { firebase.auth().onAuthStateChanged(u => { if (u) setTimeout(Uni.enforceRetention, 5000); }); } catch (e) {}

  /* =====================================================================
     PRIVACY & MY DATA
     ===================================================================== */
  Uni.panels.privacy = function () {
    const out = h('div'), say = (t, bad) => { out.innerHTML = ''; out.append(h('div', { className: bad ? 'u-err' : 'u-ok', textContent: t })); };
    const provs = Registry.providers(), pv = Object.keys(provs).map(k => h('div', { className: 'u-note' }, h('b', { textContent: provs[k].name + ': ' }), provs[k].disclosure || ''));

    const sel = h('select', { 'aria-label': 'Keep chats' }, [[0, 'Keep until I delete them'], [30, 'Delete after 30 days'], [90, 'Delete after 90 days'], [365, 'Delete after 1 year']].map(([v, t]) => h('option', { value: v, textContent: t })));
    UDoc().collection('prefs').doc('privacy').get().then(s => { if (s.exists) sel.value = String(+s.data().retentionDays || 0); }).catch(() => {});
    sel.onchange = async () => { try { await UDoc().collection('prefs').doc('privacy').set({ retentionDays: +sel.value, updatedAt: FV().serverTimestamp() }); say(+sel.value ? 'Saved. Chats older than ' + sel.value + ' days are deleted when you open the app.' : 'Saved. Chats are kept until you delete them.'); if (+sel.value) Uni.enforceRetention(); } catch (e) { say('Could not save this setting.', true); } };

    const act = (label, fn, danger) => h('button', { textContent: label, css: danger ? 'border-color:#c40f25' : '', on: { click: async e => { const b = e.currentTarget; b.disabled = true; try { await fn(); } catch (x) { say('Something went wrong: ' + ((x && x.message) || x), true); } finally { b.disabled = false; } } } });
    const sure = (msg, word) => (prompt(msg + '\n\nType ' + word + ' to confirm.') || '').trim().toUpperCase() === word;

    const delChats = async () => { if (!sure('Delete ALL your chats from the cloud?', 'DELETE')) return; const n = await delCollection(UDoc().collection('chats'), true); if (typeof newChat === 'function') newChat(); say(n + ' chats deleted.'); };
    const delFiles = async () => { if (!sure('Delete the file history on this device?', 'DELETE')) return; if (Uni.FH) await Uni.FH.clear(); say('File history deleted from this device.'); };
    const delImgs = async () => { if (!sure('Delete all generated images stored on this device?', 'DELETE')) return; let n = 0; if (typeof imAll === 'function') for (const r of await imAll()) { await imDel(r.id); n++; } say(n + ' images deleted from this device.'); };
    const delUsage = async () => { await delCollection(UDoc().collection('usage'), false); say('Usage counters deleted.'); };
    const delAll = async keepAccount => {
      if (!sure(keepAccount ? 'Delete ALL your data (chats, projects, saved items, notes you published, settings, local images and files) but keep your login?' : 'Delete ALL your data AND your CUTE-S AI account? This cannot be undone.', 'DELETE')) return;
      say('Deleting... please keep this page open.');
      for (const c of ['chats', 'projects', 'saved', 'usage', 'prefs']) await delCollection(UDoc().collection(c), c === 'chats');
      try { const ns = await db.collection('notes').where('uid', '==', user.uid).get(); for (const d of ns.docs) await d.ref.delete(); } catch (e) {}
      try { const l = await firebase.storage().ref('notes/' + user.uid).listAll(); for (const i of l.items) await i.delete(); } catch (e) {}
      try { await UDoc().delete(); } catch (e) {}
      await wipeLocal();
      if (keepAccount) { say('All your data was deleted. Your login is kept.'); if (typeof newChat === 'function') newChat(); return; }
      try { await firebase.auth().currentUser.delete(); location.reload(); }
      catch (e) { say(e && e.code === 'auth/requires-recent-login' ? 'Your data is deleted. To remove the login itself, log out, log in again and press this button once more.' : 'Your data is deleted, but the login could not be removed (' + ((e && e.message) || e) + '). Email moonstar7023@gmail.com to finish.', true); }
    };

    const usage = h('div', { className: 'u-note', textContent: 'Loading...' });
    Usage.mine(30).then(d => { const tot = {}; d.forEach(x => Object.keys(x).forEach(k => { if (/_ok$|_err$/.test(k)) tot[k] = (tot[k] || 0) + (+x[k] || 0); })); usage.textContent = Object.keys(tot).length ? Object.keys(tot).sort().map(k => k.replace('_ok', ': ok ').replace('_err', ': failed ') + tot[k]).join(' · ') : 'No usage recorded yet.'; });

    Uni.set(h('div', { className: 'u-top' }, h('button', { className: 'u-back', textContent: '← Menu', on: { click: () => Uni.home() } }), h('h3', { textContent: 'Privacy & my data' })),
      h('div', { className: 'u-sec' }, h('h4', { textContent: 'The honest picture' }),
        h('p', { className: 'u-note', textContent: 'CUTE-S AI is a free app built on outside services. Your data does NOT stay only inside CUTE-S AI.' }),
        h('ul', { className: 'u-note', css: 'padding-left:18px' },
          h('li', { textContent: 'Everything you send to an AI model (prompts, text from files, video frames, photos) goes through Puter to the company that runs that model.' }),
          h('li', { textContent: 'Your chats, projects and saved items are stored in Google Firebase, under your own user ID. Other users cannot read them, but they are not end-to-end encrypted.' }),
          h('li', { textContent: 'Generated images, file history and spreadsheets you open here stay on THIS device (browser storage) and are not uploaded by CUTE-S AI.' }),
          h('li', { textContent: 'Text from files you attach is used for the answer and is not saved in your chat history.' }),
          h('li', { textContent: 'We do not use your content for AI training. The model companies have their own rules; read their policies.' }),
          h('li', { textContent: 'Admins can switch models on or off. They cannot read your chats or files, and they cannot turn off the safety checks.' }),
          h('li', { textContent: 'Safety checks run in your browser (best effort). They are not a replacement for server-side moderation.' }))),
      h('div', { className: 'u-sec' }, h('h4', { textContent: 'Who processes my data' }), pv, h('p', { className: 'u-note' }, h('a', { href: 'privacy.html', target: '_blank', rel: 'noopener', textContent: 'Full privacy policy', css: 'color:var(--hi)' }))),
      h('div', { className: 'u-sec' }, h('h4', { textContent: 'How long to keep my chats' }), sel, h('p', { className: 'u-note', textContent: 'Old chats are deleted when you open the app after the time has passed.' })),
      h('div', { className: 'u-sec' }, h('h4', { textContent: 'Delete' }), h('div', { className: 'u-btns' }, act('🗑 All chats', delChats), act('🗑 File history (this device)', delFiles), act('🗑 Images (this device)', delImgs), act('🗑 Usage counters', delUsage))),
      h('div', { className: 'u-sec' }, h('h4', { textContent: 'My usage (last 30 days, counts only, no content)' }), usage),
      h('div', { className: 'u-sec' }, h('h4', { textContent: 'Delete everything' }), h('p', { className: 'u-note', textContent: 'Removes chats, projects, saved items, notes you published, settings, and local images and files.' }),
        h('div', { className: 'u-btns' }, act('Delete my data, keep login', () => delAll(true), true), act('Delete my data AND account', () => delAll(false), true))),
      out);
  };

  /* =====================================================================
     MODELS & PROVIDERS (read-only overview for everyone)
     ===================================================================== */
  Uni.panels.models = function () {
    const provs = Registry.providers(), root = [];
    root.push(h('div', { className: 'u-top' }, h('button', { className: 'u-back', textContent: '← Menu', on: { click: () => Uni.home() } }), h('h3', { textContent: 'Models & providers' })));
    root.push(h('p', { className: 'u-note', textContent: 'This list comes from the model registry, not from the screen code. A model is "Available" only if its provider works on this device right now. CUTE-S AI never swaps a model without telling you.' }));
    Object.keys(Uni.CAT).forEach(k => {
      const l = Registry.list(k, true), box = h('div', { className: 'u-sec' }, h('h4', { textContent: Uni.CAT[k].name }));
      if (!l.length) box.append(h('p', { className: 'u-note', textContent: 'No model registered.' }));
      l.forEach(m => box.append(h('div', { className: 'u-note', css: 'margin:8px 0' }, h('b', { textContent: m.name }), ' · ' + (m.vendor || m.provider) + ' · ', h('span', { className: m._s.ok ? 'u-cite' : 'u-unv', textContent: m._s.label }),
        h('div', { textContent: m.capabilities.map(c => c.replace(/-/g, ' ')).join(', ') }), h('div', { textContent: 'ID: ' + m.id, css: 'font-size:11px;opacity:.8;word-break:break-all' }), m._s.ok ? null : h('div', { textContent: m._s.reason }))));
      root.push(box);
    });
    root.push(h('div', { className: 'u-sec' }, h('h4', { textContent: 'Providers' }), Object.keys(provs).map(k => h('div', { className: 'u-note' }, h('b', { textContent: provs[k].name + ': ' }), provs[k].disclosure || '', provs[k].docs ? h('span', null, ' ', h('a', { href: provs[k].docs, target: '_blank', rel: 'noopener', textContent: 'docs', css: 'color:var(--hi)' })) : null))));
    Uni.set(...root);
  };

  /* =====================================================================
     ADMIN (only for UIDs in the Firestore "admins" collection)
     ===================================================================== */
  Uni.panels.admin = async function () {
    if (!await Registry.isAdmin()) { Uni.set(Uni.top('Admin', null), h('div', { className: 'u-err', textContent: 'This area is only for administrators.' })); return; }
    const cfg = JSON.parse(JSON.stringify(Registry.cfg)), msg = h('div');
    const all = Registry.all(), box = h('div', { className: 'u-sec' }, h('h4', { textContent: 'Models: on / off and defaults' }));
    Object.keys(Uni.CAT).forEach(k => {
      const l = all.filter(m => m.categories.includes(k)); if (!l.length) return;
      box.append(h('div', { className: 'u-note', css: 'margin-top:10px' }, h('b', { textContent: Uni.CAT[k].name })));
      l.forEach(m => {
        const on = h('input', { type: 'checkbox', checked: !cfg.disabled.includes(m.id), onchange: () => { cfg.disabled = cfg.disabled.filter(x => x !== m.id); if (!on.checked) cfg.disabled.push(m.id); } });
        const def = h('input', { type: 'radio', name: 'def_' + k, checked: (cfg.defaults[k] || (Registry.data.defaults || {})[k]) === m.id, onchange: () => { cfg.defaults[k] = m.id; } });
        box.append(h('div', { className: 'u-row' }, h('label', { css: 'display:flex;gap:6px;align-items:center;width:auto' }, on, m.name), h('label', { css: 'display:flex;gap:4px;align-items:center;width:auto;font-size:12px' }, def, 'default')));
      });
    });
    const add = h('textarea', { rows: 6, placeholder: '{"id":"model-id","name":"Name","provider":"puter","vendor":"Vendor","categories":["research"],"description":"...","capabilities":["text"],"vision":false}' });
    const save = h('button', { className: 'pb', textContent: 'Save model settings', on: { click: async () => {
      try { if (add.value.trim()) { const m = Registry.clean(JSON.parse(add.value)); if (!m) throw new Error('That model entry is not valid (needs id, name, a known provider and categories).'); cfg.extra = cfg.extra.filter(x => x.id !== m.id).concat([m]); add.value = ''; }
        await Registry.saveConfig(cfg); msg.innerHTML = ''; msg.append(h('div', { className: 'u-ok', textContent: 'Saved. Users get the change the next time they open C-Univers-AI.' })); }
      catch (e) { msg.innerHTML = ''; msg.append(h('div', { className: 'u-err', textContent: (e && e.message) || 'Could not save (are the Firestore rules deployed?).' })); } } } });
    const errs = Usage.errors.length ? Usage.errors.map(e => new Date(e.t).toLocaleTimeString() + ' · ' + e.cat + ' · ' + e.model + (e.code ? ' · ' + e.code : '')).join('\n') : 'No errors on this device in this session.';
    Uni.set(Uni.top('Admin', null),
      h('div', { className: 'u-sec' }, h('h4', { textContent: 'What admins can and cannot do' }), h('p', { className: 'u-note', textContent: 'Admins manage which models exist and which are on. They cannot read anyone\'s chats or files, and the safety checks are fixed in code: no setting here can remove them. Fleet-wide usage and safety statistics need a server (Cloud Functions); this screen shows only what this device saw.' })),
      box, h('div', { className: 'u-sec' }, h('h4', { textContent: 'Add a model entry (JSON)' }), add, h('p', { className: 'u-note', textContent: 'Only models from an installed, officially supported provider are accepted. New providers need a small adapter in registry.js.' })),
      save, msg, h('div', { className: 'u-sec' }, h('h4', { textContent: 'Recent errors on this device' }), h('pre', { className: 'u-log', textContent: errs })));
  };
})();
