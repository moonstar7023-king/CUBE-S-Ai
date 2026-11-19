/**
 * CUBE-S-AI | ai/ui.js
 * Settings > "AI providers & keys", the data-processing disclosure, and the vault unlock prompt.
 * Rendered inside the app's existing modal (#mo / #mc). All dynamic text uses textContent (no innerHTML).
 */
(function (g) {
  'use strict';
  const P = g.CSProviders, A = g.CSAI, $ = id => document.getElementById(id);

  function h(tag, props, kids) {
    const e = document.createElement(tag);
    Object.keys(props || {}).forEach(k => { if (k === 'text') e.textContent = props[k]; else if (k === 'class') e.className = props[k]; else if (k.startsWith('on')) e[k] = props[k]; else e.setAttribute(k, props[k]); });
    (kids || []).forEach(c => c && e.append(c)); return e;
  }
  const p = (text, cls) => h('p', { text, class: cls || 'aipp' });
  const btn = (text, onclick, cls) => h('button', { type: 'button', text, onclick, class: cls || 'ghost' });
  const link = (text, href) => h('a', { text, href, target: '_blank', rel: 'noopener noreferrer' });
  function show(nodes) { const mc = $('mc'); mc.textContent = ''; nodes.forEach(n => mc.append(n)); $('mo').hidden = false; }
  function close() { $('mo').hidden = true; $('mc').textContent = ''; }
  function say(t) { try { toast(t); } catch (e) { /* toast is defined by app.js */ } }

  /** Runs a dialog that resolves a promise; if the user closes the modal (X or backdrop) it resolves false. */
  function dialog(build) {
    return new Promise(resolve => {
      let done = false, mo = new MutationObserver(() => { if ($('mo').hidden) finish(false); });
      const finish = v => { if (done) return; done = true; mo.disconnect(); close(); resolve(v); }; // closes the popup; a following screen (if any) re-opens it
      mo.observe($('mo'), { attributes: true, attributeFilter: ['hidden'] });
      show(build(v => { finish(v); }));
    });
  }

  /* ---------- model list cache (non-secret) ---------- */
  const mk = id => 'cs_ai_models_' + id;
  function cachedModels(id) { try { const l = JSON.parse(localStorage.getItem(mk(id)) || 'null'); if (Array.isArray(l) && l.length) return l; } catch (e) {} return P.FALLBACK[id]; }
  function cacheModels(id, list) { try { localStorage.setItem(mk(id), JSON.stringify(list.slice(0, 80))); } catch (e) {} }
  function defaultModel(id, list) {
    const pref = { openai: /mini/, anthropic: /haiku/, gemini: /flash/ }[id];
    const f = list.find(m => pref.test(m.id) && !/preview|exp/.test(m.id)) || list.find(m => pref.test(m.id)) || list[0]; return f.id;
  }

  /* ---------- disclosure ---------- */
  const SENT = 'your message, your recent chat history (up to 20 messages), text from files you attach, your study profile, the memories you saved and your current project notes';
  function consent(id) {
    const cl = String(id).startsWith('cloud:'), by = !!P.byok[id], m = by ? P.META[id] : null;
    if (cl) {
      const pid = id.slice(6), info = A.cloudInfo(), prov = info && (info.providers || []).find(x => x.id === pid), co = prov ? prov.company : 'the AI provider';
      return dialog(done => [
        h('h3', { text: 'Before you use Cloud AI' }),
        p('When you chat, CUBE-S-AI sends ' + SENT + ' through the CUBE-S-AI Cloud proxy to ' + co + ', using the app owner\'s account. ' + co + ' processes it under its own terms and privacy policy.'),
        p('The proxy checks your sign-in, applies usage limits and keeps no copy of your messages or files. It stores only counts (requests, tokens, cost) tied to your account. If Cloud AI fails or runs out, nothing is silently sent anywhere else.'),
        prov && prov.privacyUrl ? h('p', { class: 'aipp' }, [link(co + ' privacy information', prov.privacyUrl)]) : null,
        h('button', { type: 'button', class: 'pb', text: 'I understand, continue', onclick: () => done(true) }),
        btn('Cancel', () => done(false), 'ghost aic')
      ]);
    }
    return dialog(done => [
      h('h3', { text: by ? 'Before you use ' + m.name : 'Who processes your messages' }),
      by ? p('When you chat, CUBE-S-AI sends ' + SENT + ' directly from your device to ' + m.company + '. ' + m.company + ' processes it under its own terms and privacy policy.')
         : p('The free AI sends ' + SENT + ' to Puter (puter.com), which passes it to AI vendors it works with. If Puter has no free credit left, the app automatically uses Pollinations (pollinations.ai), another free service, so your text would go there instead. Image creation and reading text from images also use Puter.'),
      by ? p('Your API key stays encrypted on this device. CUBE-S-AI never receives your key or a copy of this traffic. ' + m.company + ' bills usage to your own account, and its data retention settings apply.') : p('The line under the chat box always shows which service answered. You can switch to your own provider key or Cloud AI in Settings > AI providers.'),
      by ? h('p', { class: 'aipp' }, [link(m.name + ' privacy information', m.privacyUrl)]) : null,
      h('button', { type: 'button', class: 'pb', text: 'I understand, continue', onclick: () => done(true) }),
      btn('Cancel', () => done(false), 'ghost aic')
    ]);
  }

  /* ---------- unlock (passphrase mode) ---------- */
  function unlock() {
    return dialog(done => {
      const inp = h('input', { type: 'password', autocomplete: 'off', placeholder: 'Key vault passphrase', 'aria-label': 'Passphrase' }), err = p('', 'aipp err');
      const go = async () => { try { await A.vault().unlock(inp.value); done(true); } catch (e) { err.textContent = e.code === 'WRONG_PASSPHRASE' ? 'Wrong passphrase.' : e.message; } };
      inp.onkeydown = e => { if (e.key === 'Enter') go(); };
      return [h('h3', { text: '🔐 Unlock your keys' }), p('Enter the passphrase you chose for your key vault. It is never stored.'), inp, err,
        h('button', { type: 'button', class: 'pb', text: 'Unlock', onclick: go }), btn('Cancel', () => done(false), 'ghost aic')];
    });
  }

  /* ---------- add / replace a key ---------- */
  async function keyDialog(id) {
    const m = P.META[id], V = A.vault(), st = V.status();
    if (!V.supported()) { say('This browser cannot encrypt keys safely.'); return panel(); }
    if (st.exists && st.mode === 'pass' && !V.isUnlocked()) { if (!await unlock()) return panel(); }
    if (st.exists && st.mode === 'device' && !V.isUnlocked()) { try { await V.unlock(); } catch (e) { say(e.message); return panel(); } }
    const nodes = [h('h3', { text: 'Connect ' + m.name })];
    const key = h('input', { type: 'password', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', placeholder: 'Paste your API key (' + m.hint + ')', 'aria-label': m.name + ' API key' });
    const msg = p('', 'aipp'), pass1 = h('input', { type: 'password', autocomplete: 'new-password', placeholder: 'Choose a passphrase (8+ characters)' }), mode = { v: 'device' };
    nodes.push(p('Get a key from ' + m.company + ': '), h('p', { class: 'aipp' }, [link(m.keyUrl, m.keyUrl)]));
    nodes.push(key);
    let modeBox = null;
    if (!st.exists) {
      const dev = h('button', { type: 'button', class: 'mi on', text: '📱 This device only (easiest). The key is locked with a device-bound secret.' });
      const pas = h('button', { type: 'button', class: 'mi', text: '🔐 Passphrase (stronger). You type it once per session. It cannot be recovered.' });
      const pick = v => { mode.v = v; dev.classList.toggle('on', v === 'device'); pas.classList.toggle('on', v === 'pass'); pass1.hidden = v !== 'pass'; };
      dev.onclick = () => pick('device'); pas.onclick = () => pick('pass'); pass1.hidden = true;
      modeBox = h('div', {}, [p('How should your keys be protected on this device?'), dev, pas, pass1]); nodes.push(modeBox);
    }
    const save = h('button', { type: 'button', class: 'pb', text: 'Test and save' });
    const anyway = btn('Save without testing', () => commit(true), 'ghost'); anyway.hidden = true;
    async function commit(skipTest) {
      msg.className = 'aipp'; msg.textContent = ''; anyway.hidden = true;
      const k = key.value.trim(), chk = P.checkKeyShape(id, k);
      if (!chk.ok) { msg.className = 'aipp err'; msg.textContent = chk.msg; return; }
      save.disabled = true; anyway.disabled = true;
      try {
        if (!V.status().exists) await V.init(mode.v, pass1.value);
        let list = null;
        if (!skipTest) { msg.textContent = 'Testing your key with ' + m.company + '...'; list = await P.byok[id].listModels(k); if (!list.length) list = P.FALLBACK[id]; cacheModels(id, list); }
        await V.set(id, k); key.value = '';
        const L = list || cachedModels(id), cur = A.selection().models[id];
        if (!cur || !L.some(x => x.id === cur)) A.setModel(id, defaultModel(id, L));
        if (await consent(id)) { A.giveConsent(id); A.select(id); say(m.short + ' is now your AI'); } else say('Key saved. ' + m.short + ' is not active.');
        panel();
      } catch (e) {
        msg.className = 'aipp err'; msg.textContent = e.code === 'WEAK_PASSPHRASE' ? e.message : (e.message || 'Could not save the key.');
        anyway.hidden = e.code !== 'NETWORK';
      }
      save.disabled = false; anyway.disabled = false;
    }
    save.onclick = () => commit(false);
    nodes.push(msg, save, anyway, btn('Back', panel, 'ghost aic'));
    show(nodes);
  }

  /* ---------- main panel ---------- */
  function card(id) {
    const m = P.META[id], V = A.vault(), has = V.has(id), a = A.active(), on = a.id === id;
    const list = cachedModels(id), cur = A.modelFor(id), sel = h('select', { 'aria-label': m.name + ' model' });
    const all = list.some(x => x.id === cur) ? list : [{ id: cur, label: cur }].concat(list);
    all.forEach(x => { const o = document.createElement('option'); o.value = x.id; o.textContent = x.label; if (x.id === cur) o.selected = true; sel.append(o); });
    sel.onchange = () => { A.setModel(id, sel.value); say('Model: ' + sel.value); };
    const state = !has ? 'No key added' : V.isUnlocked() ? 'Key connected' : 'Key connected (locked until you use it)';
    const kids = [h('h4', { text: (on ? '✅ ' : '') + m.name }), p(state, 'aipp mute')];
    if (has) {
      kids.push(sel);
      const row = h('div', { class: 'aipr' });
      if (!on) row.append(btn('Use this', async () => { if (!A.hasConsent(id)) { if (!await consent(id)) return panel(); A.giveConsent(id); } A.select(id); panel(); }));
      row.append(btn('Refresh models', async () => {
        try { if (!V.isUnlocked()) { if (V.status().mode === 'pass') { if (!await unlock()) return panel(); } else await V.unlock(); }
          const l = await P.byok[id].listModels(V.get(id)); if (l.length) { cacheModels(id, l); say(l.length + ' models loaded'); } panel(); } catch (e) { say(e.message); } }));
      row.append(btn('Replace key', () => keyDialog(id)));
      row.append(btn('Remove key', async () => { if (!confirm('Remove your ' + m.name + ' key from this device?')) return;
        try { if (!V.isUnlocked()) { if (V.status().mode === 'pass') { if (!await unlock()) return panel(); } else await V.unlock(); } await V.remove(id); A.reconcile(); A.revokeConsent(id); panel(); } catch (e) { say(e.message); } }, 'ghost aic'));
      kids.push(row);
    } else kids.push(h('div', { class: 'aipr' }, [btn('Add key', () => keyDialog(id))]));
    return h('div', { class: 'aip' + (on ? ' on' : '') }, kids);
  }
  const STATE_MSG = { paused: 'Cloud AI is paused right now.', budget_exhausted: 'Cloud AI reached its monthly limit. It returns next month. The free AI and your own keys still work.', not_configured: 'Cloud AI is not set up yet.' };
  const clock = ms => { try { return new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); } catch (e) { return ''; } };
  function cloudCard(loadErr) {
    const a = A.active(), on = a.kind === 'cloud', me = A.cloudInfo(), kids = [h('h4', { text: (on ? '✅ ' : '') + '☁️ CUBE-S-AI Cloud' })];
    if (!me) { kids.push(p(loadErr || 'Loading status...', 'aipp mute')); kids.push(h('div', { class: 'aipr' }, [btn('Retry', () => panel(true))])); return h('div', { class: 'aip' + (on ? ' on' : ''), id: 'aiCloud' }, kids); }
    if (!me.enabled) { kids.push(p('Cloud AI is not switched on yet.', 'aipp mute')); return h('div', { class: 'aip', id: 'aiCloud' }, kids); }
    kids.push(p('Use AI models paid for by the app owner, with a daily allowance. Plan: ' + (me.plan === 'free' ? 'Free' : me.plan) + ' · ' + me.remaining + ' of ' + me.dailyRequests + ' requests left today' + (me.resetAt ? ' (resets ' + clock(me.resetAt) + ')' : '') + '.', 'aipp'));
    if (STATE_MSG[me.state]) { kids.push(p(STATE_MSG[me.state], 'aipp err')); return h('div', { class: 'aip' + (on ? ' on' : ''), id: 'aiCloud' }, kids); }
    const sel = h('select', { 'aria-label': 'Cloud model' }), cur = A.selection().models.cloud;
    (me.models || []).forEach(x => { const o = document.createElement('option'); o.value = x.id; o.textContent = x.label + ' · ' + x.company + (x.available ? '' : ' 🔒 Premium'); o.disabled = !x.available; if (x.id === cur && x.available) o.selected = true; sel.append(o); });
    if (!(me.models || []).some(x => x.available)) { kids.push(p('No Cloud models are available on your plan yet.', 'aipp mute')); return h('div', { class: 'aip', id: 'aiCloud' }, kids); }
    if (!sel.value || (sel.selectedOptions[0] && sel.selectedOptions[0].disabled)) { const f = (me.models || []).find(x => x.available); sel.value = f.id; }
    sel.onchange = () => { A.setModel('cloud', sel.value); say('Cloud model: ' + sel.options[sel.selectedIndex].text); };
    kids.push(sel);
    if (me.plan === 'free' && (me.models || []).some(x => !x.available)) kids.push(p('🔒 Premium models need a paid plan. Plans are not available yet.', 'aipp mute'));
    kids.push(p('Your text goes through the CUBE-S-AI proxy to the company shown next to the model. The proxy keeps no copy.', 'aipp mute'));
    const row = h('div', { class: 'aipr' });
    if (!on) row.append(btn('Use Cloud AI', async () => { A.setModel('cloud', sel.value); const cid = 'cloud:' + ((A.cloudModelInfo(sel.value) || {}).provider || ''); if (!A.hasConsent(cid)) { if (!await consent(cid)) return panel(); A.giveConsent(cid); } A.select('cloud'); panel(); }));
    row.append(btn('Refresh', () => panel(true)));
    kids.push(row); return h('div', { class: 'aip' + (on ? ' on' : ''), id: 'aiCloud' }, kids);
  }
  let panelSeq = 0;
  function panel(forceRefresh) {
    const a = A.active(), V = A.vault(), st = V.status(), nodes = [h('h3', { text: '🤖 AI providers' })], seq = ++panelSeq;
    nodes.push(p('The free AI is the default. You can optionally use Cloud AI (if the app owner enabled it) or connect your own key from OpenAI, Anthropic Claude or Google Gemini. Your own keys are encrypted on this device and never saved in your account or sent to CUBE-S-AI.'));
    nodes.push(h('div', { class: 'aip' + (a.kind === 'free' ? ' on' : '') }, [h('h4', { text: (a.kind === 'free' ? '✅ ' : '') + 'Free AI (Puter) · default' }),
      p('Messages are processed by Puter and the vendors it routes to. If Puter has no credit, Pollinations may answer instead. The line under the chat box shows who answered.', 'aipp mute'),
      a.kind !== 'free' ? h('div', { class: 'aipr' }, [btn('Use free AI', () => { A.select('puter'); panel(); })]) : null]));
    if (A.cloudConfigured()) nodes.push(cloudCard());
    Object.keys(P.byok).forEach(id => nodes.push(card(id)));
    nodes.push(p('Billing: your own provider charges your own account for BYOK usage. Meta Llama is not offered directly because Meta has no public chat API for this. It can be added to Cloud AI through an official host.', 'aipp mute'));
    if (st.exists) {
      const row = h('div', { class: 'aipr' });
      if (V.isUnlocked() && st.mode === 'pass') row.append(btn('Lock keys now', () => { V.lock(); say('Keys locked'); panel(); }));
      row.append(btn('Erase all keys', async () => { if (!confirm('Erase every saved API key from this device?')) return; await V.wipe(); A.reconcile(); panel(); say('All keys erased'); }, 'ghost aic'));
      nodes.push(p('Key vault: ' + (st.mode === 'pass' ? 'passphrase protected' : 'device protected') + '.', 'aipp mute'), row);
    }
    nodes.push(h('p', { class: 'aipp' }, [link('Privacy Policy & Terms', 'privacy.html')]));
    show(nodes);
    if (A.cloudConfigured() && (forceRefresh === true || !A.cloudInfo())) {
      A.refreshCloud().then(() => { if (seq === panelSeq && !$('mo').hidden && $('aiCloud')) panel(); })
        .catch(e => { if (seq === panelSeq && !$('mo').hidden && $('aiCloud')) $('aiCloud').replaceWith(cloudCard(e.message)); });
    }
  }

  g.CSAIUI = { open: () => panel(true), consent, unlock, problem: say, attach() { A.attachUI({ consent, unlock, problem: say }); } };
})(typeof window !== 'undefined' ? window : globalThis);
