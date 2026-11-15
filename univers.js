/* =====================================================================
   CUTE-S AI - C-Univers-AI (univers.js)   "One Universe. Multiple AI Brains."
   Core: menu shell, shared helpers, AI Images, and the automatic (chat) mode.
   Other parts: univers-files.js, univers-tools.js (videos, coding, research), univers-data.js, univers-privacy.js.
   Needs: registry.js, safety.js and the globals of app.js / image.js.
   Exactly six categories: images, files, videos, coding, research, data.
   ===================================================================== */
(function () {
  const $ = id => document.getElementById(id);
  const h = (tag, p, ...kids) => {
    const e = document.createElement(tag);
    if (p) for (const k in p) {
      if (k === 'css') e.style.cssText = p[k];
      else if (k === 'on') for (const ev in p.on) e.addEventListener(ev, p.on[ev]);
      else if (k === 'html') e.innerHTML = p[k];            // only ever used with trusted static strings
      else e[k] = p[k];
    }
    kids.flat().forEach(n => { if (n != null && n !== false) e.append(n); });
    return e;
  };
  const ls = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  };

  const svg = p => '<svg viewBox="0 0 24 24" aria-hidden="true">' + p + '</svg>';
  const ICON = {
    images: svg('<rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="9" cy="10" r="1.8"/><path d="M4 18l5-5 4 4 3-3 4 4"/>'),
    files: svg('<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h6"/>'),
    videos: svg('<rect x="3" y="5" width="18" height="14" rx="3"/><path d="M10 9.5v5l4.5-2.5z"/>'),
    coding: svg('<path d="M8 8l-4 4 4 4M16 8l4 4-4 4M13.5 5l-3 14"/>'),
    research: svg('<circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5L21 21M8 10.5h5M10.5 8v5"/>'),
    data: svg('<path d="M4 20V4M4 20h16"/><rect x="7" y="11" width="3" height="6" rx="1"/><rect x="12" y="7" width="3" height="10" rx="1"/><rect x="17" y="13" width="3" height="4" rx="1"/>')
  };
  const CAT = {
    images: { name: 'AI Images', desc: 'Create and edit images with the model, style and shape you choose.' },
    files: { name: 'AI Files', desc: 'Create, read, analyze, summarize and convert documents.' },
    videos: { name: 'AI Videos', desc: 'Text-to-video, image-to-video, video editing and frame-based analysis.' },
    coding: { name: 'AI Coding', desc: 'Write, explain, debug, review and safely run code.' },
    research: { name: 'AI Research', desc: 'Sourced answers with citations. Verified and uncertain are kept apart.' },
    data: { name: 'AI Data', desc: 'Analyze CSV and Excel, clean data, make charts and reports.' }
  };

  const Uni = window.Uni = { pin: null, busy: false, panels: {}, hooks: [], CAT, ICON, h, ls, $, root: null, cur: null };

  /* ---------- shell ---------- */
  Uni.set = function (...nodes) { Uni.root.innerHTML = ''; Uni.root.append(...nodes.flat().filter(n => n != null && n !== false)); Uni.root.scrollTop = 0; };
  Uni.show = async function () {
    Uni.root = $('uni'); if (!Uni.root) return;
    if (Uni.cur) return;                                   // keep the open panel when the user comes back
    Uni.home();
  };
  Uni.home = async function () {
    Uni.cur = null;
    Uni.root = $('uni');
    Uni.set(h('div', { className: 'u-hero' }, h('div', { className: 'u-logo' }, h('img', { src: 'univers.svg', alt: '' })),
      h('p', { className: 'u-tag', textContent: 'Loading models...' })));
    await Registry.load();
    Registry.discover().then(() => { if (!Uni.cur) Uni.renderHome(); });   // adds models found live; never replaces any
    Uni.renderHome();
  };
  Uni.renderHome = async function () {
    const admin = Uni._admin == null ? (Uni._admin = await Registry.isAdmin()) : Uni._admin;
    const cards = Object.keys(CAT).map((k, i) => {
      const ok = Registry.list(k).filter(m => m._s.ok && (k !== 'videos' || m.video)).length;
      const badge = h('i', { className: ok ? 'ok' : 'no', textContent: ok ? ok + (ok === 1 ? ' model ready' : ' models ready') : 'Not available here' });
      return h('button', { className: 'u-card', css: 'animation-delay:' + (i * 0.05) + 's', on: { click: () => Uni.open(k) } },
        h('span', { html: ICON[k] }), h('b', { textContent: CAT[k].name }), h('small', { textContent: CAT[k].desc }), badge);
    });
    Uni.set(
      h('div', { className: 'u-hero' }, h('div', { className: 'u-logo' }, h('img', { src: 'univers.svg', alt: '' })),
        h('h2', { html: 'C-Univers-<b>AI</b>' }), h('p', { className: 'u-tag', textContent: 'One Universe. Multiple AI Brains.' }),
        h('p', { className: 'u-mode', textContent: 'Manual mode: you choose the category, model and every setting. In the normal CUTE-S-AI chat, the same tools run automatically and tell you what they chose.' })),
      Registry.loadError ? h('div', { className: 'u-err', textContent: Registry.loadError }) : null,
      h('div', { className: 'u-grid' }, cards),
      h('div', { className: 'u-links' },
        h('button', { className: 'chip', textContent: '🔒 Privacy & my data', on: { click: () => Uni.open('privacy') } }),
        h('button', { className: 'chip', textContent: '🧭 Models & providers', on: { click: () => Uni.open('models') } }),
        admin ? h('button', { className: 'chip', textContent: '🛠 Admin', on: { click: () => Uni.open('admin') } }) : null));
  };
  Uni.open = async function (k) {
    Uni.root = $('uni'); Uni.cur = k;
    if (!Registry.loaded) await Registry.load();
    const fn = Uni.panels[k];
    if (!fn) { Uni.set(Uni.top('Not available', null), h('div', { className: 'u-err', textContent: 'This section could not be loaded. Refresh the app.' })); return; }
    Uni.set(); try { fn(); } catch (e) { Uni.set(Uni.top('Error', null), h('div', { className: 'u-err', textContent: 'Could not open this section: ' + ((e && e.message) || e) })); }
  };
  Uni.top = (title, k) => h('div', { className: 'u-top' }, h('button', { className: 'u-back', textContent: '← Menu', on: { click: () => Uni.home() } }),
    h('h3', { textContent: (CAT[k] ? CAT[k].name : title) }));

  /* ---------- shared widgets ---------- */
  Uni.modelPicker = function (cat, opt) {
    opt = opt || {};
    const key = 'cs_uni_m_' + cat + (opt.key ? '_' + opt.key : ''), box = h('div', { className: 'u-sec' }), info = h('div');
    const all = Registry.list(cat).filter(opt.filter || (() => true));
    const saved = ls.get(key, ''), d = Registry.defaultFor(cat);
    let cur = all.find(m => m.id === saved && m._s.ok) || (d && all.find(m => m.id === d.id && m._s.ok)) || all.find(m => m._s.ok) || null;
    const sel = h('select', { 'aria-label': 'Model' }, all.map(m => h('option', { value: m.id, selected: cur && m.id === cur.id, disabled: !m._s.ok,
      textContent: m.name + ' · ' + (m.vendor || m.provider) + (m._s.ok ? '' : '  (' + m._s.label.toLowerCase() + ')') })));
    const cbs = [];
    const draw = () => {
      info.innerHTML = '';
      if (!all.length) { info.append(h('div', { className: 'u-warn', textContent: 'No model is registered for this category.' })); return; }
      if (!cur) { info.append(h('div', { className: 'u-warn', textContent: 'No model for this category is available on this device right now. ' + (all[0] ? all[0]._s.reason : '') })); return; }
      const prov = Registry.providers()[cur.provider] || {};
      info.append(h('p', { className: 'u-note', textContent: cur.description || '' }),
        h('div', { className: 'u-chips' }, cur.capabilities.map(c => h('span', { className: 'chip', textContent: c.replace(/-/g, ' ') })),
          h('span', { className: 'chip', textContent: '● ' + cur._s.label })),
        h('details', { className: 'u-note' }, h('summary', { textContent: 'Where does my data go?', css: 'cursor:pointer' }),
          h('p', { textContent: (prov.name ? prov.name + ': ' : '') + (prov.disclosure || 'Processed by an external AI provider.') })));
    };
    sel.onchange = () => { cur = all.find(m => m.id === sel.value) || null; if (cur) ls.set(key, cur.id); draw(); cbs.forEach(f => f(cur)); };
    box.append(h('h4', { textContent: 'Model' }), sel, info); draw();
    return { node: box, get: () => cur, onchange: f => cbs.push(f) };
  };
  Uni.err = (host, e) => {
    const m = (e && e.message) || String(e || 'Something went wrong');
    host.prepend(h('div', { className: e && e.safety ? 'u-warn' : 'u-err', textContent: (e && e.safety ? '🛡 ' : '⚠️ ') + m.slice(0, 320) }));
  };
  /* run one task with one busy flag, usage counters and visible errors (never a silent fallback) */
  Uni.task = async function (cat, model, btn, host, fn) {
    if (Uni.busy) { toast('Please wait...'); return; }
    if (!model) { host.prepend(h('div', { className: 'u-err', textContent: 'No available model is selected.' })); return; }
    Uni.busy = true; if (btn) btn.disabled = true;
    try { await fn(); Usage.log(cat, model.id, true); }
    catch (e) { if (!(e && e.safety)) Usage.log(cat, model.id, false, e && e.code); Uni.err(host, e); }
    finally { Uni.busy = false; if (btn) btn.disabled = false; }
  };
  Uni.progress = text => h('div', { className: 'u-res' }, h('div', { className: 'ldw' }, h('img', { className: 'ld', src: 'loading.gif', alt: '' }), h('span', { textContent: text })), h('div', { className: 'u-prog' }, h('i')));
  Uni.chat = (model, system, user, onTxt) => Adapters[model.provider].chat(model, [{ role: 'system', content: system }, { role: 'user', content: user }], onTxt);
  Uni.mdBox = text => { const d = h('div', { className: 'u-ans' }); const b = h('div', { className: 'b' }); b.innerHTML = md(text); d.append(b); try { rich(b); } catch (e) {} return d; };
  Uni.btns = (...pairs) => h('div', { className: 'u-btns' }, pairs.filter(Boolean).map(([t, f]) => t ? h('button', { textContent: t, on: { click: e => f(e.currentTarget) } }) : null));
  Uni.field = (label, node) => h('div', { className: 'u-row' }, h('label', { textContent: label }), node);
  Uni.select = (opts, cur, fn) => { const s = h('select', { on: { change: () => fn(s.value) } }, opts.map(o => { const v = Array.isArray(o) ? o[0] : o, t = Array.isArray(o) ? o[1] : o; return h('option', { value: v, textContent: t, selected: String(v) === String(cur) }); })); return s; };
  Uni.chips = (opts, cur, fn) => { const w = h('div', { className: 'u-chips' }); const draw = c => { w.innerHTML = ''; opts.forEach(o => { const v = Array.isArray(o) ? o[0] : o, t = Array.isArray(o) ? o[1] : o; w.append(h('button', { className: 'chip' + (String(v) === String(c) ? ' on' : ''), textContent: t, on: { click: () => { fn(v); draw(v); } } })); }); }; draw(cur); return w; };
  Uni.blobDl = (blob, name) => dl(blob, name);
  const sizeTxt = n => n < 1024 ? n + ' B' : n < 1048576 ? (n / 1024).toFixed(1) + ' KB' : (n / 1048576).toFixed(1) + ' MB';
  Uni.sizeTxt = sizeTxt;

  /* =====================================================================
     AI IMAGES
     ===================================================================== */
  const STY = {
    real: ['Realistic', 'photorealistic, natural lighting, sharp detail, true-to-life textures'],
    d3: ['3D', '3D render, soft studio lighting, smooth materials, high detail'],
    cart: ['Cartoon', 'colorful cartoon style, clean outlines'],
    anime: ['Anime', 'anime style, vibrant colors, detailed'],
    logo: ['Logo', 'minimal flat vector logo, clean, centered, plain background'],
    cine: ['Cinematic', 'cinematic still, dramatic lighting, shallow depth of field, subtle film grain'],
    illus: ['Illustration', 'detailed digital illustration, rich colors, clean composition'],
    dart: ['Digital Art', 'polished digital art, concept-art quality, painterly detail'],
    pro: ['Professional Photography', 'professional photograph, 85mm lens, studio-quality lighting, sharp focus'],
    prod: ['Product Photography', 'professional product photography, clean seamless backdrop, soft box lighting, sharp focus, commercial look']
  };
  const RAT = { '1:1': [1, 1, 'square composition'], '16:9': [16, 9, 'wide landscape composition'], '9:16': [9, 16, 'tall vertical composition'], '4:3': [4, 3, 'landscape composition'], '3:2': [3, 2, 'landscape composition'] };
  const LIGHT = [['', 'Auto'], ['natural daylight', 'Natural daylight'], ['golden hour sunlight', 'Golden hour'], ['soft studio lighting', 'Soft studio'], ['dramatic high-contrast lighting', 'Dramatic'], ['neon glow lighting', 'Neon glow'], ['moody low-key lighting', 'Moody low-key'], ['backlit with rim light', 'Backlit']];
  const BG = [['', 'Auto'], ['plain white background', 'Plain white'], ['smooth studio gradient background', 'Studio gradient'], ['blurred bokeh background', 'Blurred bokeh'], ['outdoor nature background', 'Nature'], ['city street background', 'City street'], ['dark minimal background', 'Dark minimal']];
  const CAM = [['', 'Auto'], ['eye-level shot', 'Eye level'], ['low-angle shot', 'Low angle'], ['high-angle shot', 'High angle'], ['top-down view', 'Top-down'], ['close-up shot', 'Close-up'], ['wide shot', 'Wide shot'], ['isometric view', 'Isometric']];
  const gcd = (a, b) => b ? gcd(b, a % b) : a;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, Math.round(+v) || a));
  const rb64 = blob => new Promise(ok => { const r = new FileReader(); r.onload = () => ok(String(r.result).split(',')[1]); r.readAsDataURL(blob); });

  async function fitImage(blob, rt, maxSide, wm) {
    const bm = await createImageBitmap(blob), tr = rt.w / rt.h, cr = bm.width / bm.height;
    let sx = 0, sy = 0, sw = bm.width, sh = bm.height;
    if (Math.abs(cr - tr) / tr > 0.01) { if (cr > tr) { sw = Math.round(bm.height * tr); sx = Math.round((bm.width - sw) / 2); } else { sh = Math.round(bm.width / tr); sy = Math.round((bm.height - sh) / 2); } }
    let tw = sw, th = sh;
    if (rt.exact) { tw = rt.w; th = rt.h; }
    else { const cap = maxSide === '1024' ? 1024 : 2048, m = Math.max(tw, th); if (m > cap) { tw = Math.round(tw * cap / m); th = Math.round(th * cap / m); } }
    const cv = document.createElement('canvas'); cv.width = tw; cv.height = th;
    const x = cv.getContext('2d'); x.imageSmoothingQuality = 'high'; x.drawImage(bm, sx, sy, sw, sh, 0, 0, tw, th);
    if (wm) { const fs = Math.max(12, Math.round(tw / 40)); x.font = '600 ' + fs + 'px Arial,sans-serif'; x.textAlign = 'right'; x.fillStyle = 'rgba(255,255,255,.75)'; x.strokeStyle = 'rgba(0,0,0,.45)'; x.lineWidth = fs / 8; x.strokeText('CUTE-S AI', tw - fs / 2, th - fs / 2); x.fillText('CUTE-S AI', tw - fs / 2, th - fs / 2); }
    const out = await new Promise(ok => cv.toBlob(b => ok(b || blob), 'image/png'));
    return { blob: out, w: tw, h: th, native: bm.width + '×' + bm.height };
  }

  /* one image, with the EXACT model chosen. Used by the manual panel and by automatic chat mode. */
  Uni.makeImage = async function (o) {
    const m = o.model, rt = o.ratio, base = [o.prompt];
    if (o.styleKey && STY[o.styleKey]) base.push(STY[o.styleKey][1]);
    ['light', 'bg', 'cam'].forEach(k => { if (o[k]) base.push(o[k]); });
    if (o.colors) base.push('color palette: ' + o.colors);
    base.push((RAT[rt.label] && RAT[rt.label][2]) || (rt.w >= rt.h ? 'landscape composition' : 'vertical composition'));
    const final = base.filter(Boolean).join(', ').slice(0, 1500);
    const raw = await Adapters[m.provider].image(m, final, { quality: o.quality, ref: o.ref });
    const f = await fitImage(raw, rt, o.maxSide, o.wm);
    const rec = { id: (user ? user.uid : 'x') + '_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6), uid: user && user.uid, ts: Date.now(),
      prompt: o.prompt, final, style: o.styleKey || 'auto', ratio: rt.label, blob: f.blob, fav: 0, w: f.w, h: f.h, native: f.native, model: m.name };
    try { if (typeof imSave === 'function') imSave(rec); } catch (e) {}
    return rec;
  };
  Uni.imgCard = function (rec, again) {
    const wrap = h('div', { className: 'u-res' }), url = URL.createObjectURL(rec.blob), nm = 'cute-s-ai-' + rec.id.slice(-6);
    const info = h('p', { className: 'u-meta', textContent: rec.model + ' · ' + (STY[rec.style] ? STY[rec.style][0] + ' · ' : '') + rec.ratio + ' · ' + rec.w + '×' + rec.h + ' px' });
    wrap.append(h('img', { src: url, alt: '' }), info, Uni.btns(
      ['⬇️ PNG', () => dl(rec.blob, nm + '.png')],
      ['⬇️ JPG', async () => dl(await imConvert(rec.blob, 'image/jpeg'), nm + '.jpg')],
      [rec.fav ? '❤️ Saved' : '🤍 Save', async b => { rec.fav = rec.fav ? 0 : 1; try { await imPut(rec); } catch (e) {} b.textContent = rec.fav ? '❤️ Saved' : '🤍 Save'; toast(rec.fav ? 'Saved to your private gallery (this device)' : 'Removed from favourites'); }],
      again ? ['🔁 Same settings', async b => { b.disabled = true; try { const n = await again(); wrap.replaceWith(Uni.imgCard(n, again)); } catch (e) { b.disabled = false; Uni.err(wrap, e); } }] : null,
      ['📤 Share', async () => { try { const f = new File([rec.blob], nm + '.png', { type: 'image/png' }); if (navigator.canShare && navigator.canShare({ files: [f] })) await navigator.share({ files: [f] }); else toast('Sharing is not supported on this device'); } catch (e) {} }],
      ['📝 Prompt', () => { const o = wrap.querySelector('.u-pr'); if (o) return o.remove(); wrap.append(h('p', { className: 'u-note u-pr', textContent: 'Prompt sent: ' + rec.final, css: 'user-select:text' })); }],
      ['🗑 Delete', async () => { try { await imDel(rec.id); } catch (e) {} URL.revokeObjectURL(url); wrap.remove(); toast('Deleted'); }]));
    return wrap;
  };

  Uni.panels.images = function () {
    const S = Object.assign({ style: 'real', ratio: '16:9', cw: 1024, ch: 1024, n: 1, quality: '', light: '', bg: '', cam: '', colors: '', pick: false, c1: '#ff4258', c2: '#1b6fe8', maxSide: 'native', smart: false, wm: false }, Uni.ls.get('cs_uni_img', {}));
    const save = () => Uni.ls.set('cs_uni_img', S);
    const mp = Uni.modelPicker('images'), dyn = h('div'), out = h('div', { className: 'u-out' });
    let ref = null;
    const ta = h('textarea', { rows: 4, maxLength: 600, placeholder: 'Describe the image you want... (any language)' });
    const go = h('button', { className: 'pb', textContent: '🎨 Generate' });

    const buildDyn = () => {
      dyn.innerHTML = ''; const m = mp.get(), im = (m && m.images) || {};
      const maxN = im.maxN || 1; if (S.n > maxN) S.n = maxN;
      // reference photo only if the model can edit
      if (im.edit) {
        const box = h('div', { className: 'u-sec' }, h('h4', { textContent: 'Edit a photo (optional)' }));
        const draw = () => { box.querySelectorAll('.u-refrow').forEach(x => x.remove()); if (ref) box.append(h('div', { className: 'u-row u-refrow' }, h('img', { src: 'data:' + ref.mime + ';base64,' + ref.b64, css: 'width:44px;height:44px;object-fit:cover;border-radius:8px' }), h('small', { className: 'u-note', textContent: 'This photo will be edited using your prompt.', css: 'flex:1' }), h('button', { className: 'u-pill', textContent: '✕', on: { click: () => { ref = null; draw(); } } }))); };
        const f = h('input', { type: 'file', accept: 'image/*', css: 'display:none', onchange: () => { const x = f.files[0]; f.value = ''; if (!x) return; if (x.size > 6 * 1024 * 1024) return toast('Photo is too big (max 6 MB)'); const r = new FileReader(); r.onload = () => { ref = { b64: String(r.result).split(',')[1], mime: x.type || 'image/png' }; draw(); }; r.readAsDataURL(x); } });
        box.append(h('button', { className: 'u-pill', textContent: '📷 Add photo', on: { click: () => f.click() } }), f); draw(); dyn.append(box);
      } else ref = null;

      const st = h('div', { className: 'u-sec' }, h('h4', { textContent: 'Style' }), Uni.chips(Object.entries(STY).map(([k, v]) => [k, v[0]]), S.style, v => { S.style = v; save(); }));
      const shapeBox = h('div', { className: 'u-sec' }, h('h4', { textContent: 'Shape' })), cust = h('div');
      const drawCust = () => { cust.innerHTML = ''; if (S.ratio !== 'custom') return; cust.append(h('div', { className: 'u-row' }, h('label', { textContent: 'Pixels' }),
        h('input', { type: 'number', min: 64, max: 4096, value: S.cw, 'aria-label': 'Width', on: { input: e => { S.cw = clamp(e.target.value, 64, 4096); save(); } } }), h('span', { textContent: '×' }),
        h('input', { type: 'number', min: 64, max: 4096, value: S.ch, 'aria-label': 'Height', on: { input: e => { S.ch = clamp(e.target.value, 64, 4096); save(); } } })),
        h('p', { className: 'u-note', textContent: 'The picture is cropped to this shape and resized to exactly these pixels. Sizes larger than the model\'s native size are enlarged and can look soft.' })); };
      shapeBox.append(Uni.chips([...Object.keys(RAT).map(k => [k, k]), ['custom', 'Custom']], S.ratio, v => { S.ratio = v; save(); drawCust(); }), cust); drawCust();
      const sz = h('div', { className: 'u-sec' }, h('h4', { textContent: 'Size and quantity' }),
        Uni.field('Max size', Uni.select([['native', 'Model native (up to 2048 px)'], ['1024', '1024 px (smaller file)']], S.maxSide, v => { S.maxSide = v; save(); })),
        Uni.field('How many', Uni.select(Array.from({ length: maxN }, (_, i) => [i + 1, (i + 1) + (i ? ' images' : ' image')]), S.n, v => { S.n = +v; save(); })),
        (im.qualities && im.qualities.length) ? Uni.field('Quality', Uni.select([['', 'Default'], ...im.qualities.map(q => [q, q[0].toUpperCase() + q.slice(1)])], S.quality, v => { S.quality = v; save(); })) : null,
        h('p', { className: 'u-note', textContent: 'Only settings that this model supports are shown. ' + (im.negativePrompt ? '' : 'This model has no negative-prompt option.') }));
      const sc = h('details', { className: 'u-sec' }, h('summary', { textContent: 'Scene: lighting, background, camera, colors', css: 'cursor:pointer;font-weight:600' }),
        Uni.field('Lighting', Uni.select(LIGHT, S.light, v => { S.light = v; save(); })), Uni.field('Background', Uni.select(BG, S.bg, v => { S.bg = v; save(); })),
        Uni.field('Camera', Uni.select(CAM, S.cam, v => { S.cam = v; save(); })),
        Uni.field('Colors', h('input', { maxLength: 80, placeholder: 'e.g. teal and orange', value: S.colors, on: { input: e => { S.colors = e.target.value; save(); } } })),
        h('div', { className: 'u-row' }, h('label', { textContent: 'Palette' }),
          h('input', { type: 'color', value: S.c1, on: { input: e => { S.c1 = e.target.value; S.pick = true; save(); } } }), h('input', { type: 'color', value: S.c2, on: { input: e => { S.c2 = e.target.value; S.pick = true; save(); } } }),
          h('button', { className: 'u-pill', textContent: 'Clear', on: { click: () => { S.pick = false; save(); toast('Picked colors cleared'); } } })));
      const op = h('div', { className: 'u-sec' }, h('h4', { textContent: 'Options' }), Uni.chips([[0, 'Smart prompt: off'], [1, 'Smart prompt: on']], S.smart ? 1 : 0, v => { S.smart = !!+v; save(); }),
        h('p', { className: 'u-note', textContent: 'Smart prompt asks a chat model to rewrite your description in more detail. Your text is then sent to that chat model as well.' }),
        Uni.chips([[0, 'Watermark: off'], [1, 'Watermark: on']], S.wm ? 1 : 0, v => { S.wm = !!+v; save(); }));
      dyn.append(st, shapeBox, sz, sc, op);
    };
    mp.onchange(buildDyn);
    const ratioObj = () => S.ratio === 'custom' ? { label: 'Custom ' + S.cw + '×' + S.ch, w: S.cw, h: S.ch, exact: true } : { label: S.ratio, w: RAT[S.ratio][0], h: RAT[S.ratio][1] };
    go.onclick = () => {
      const m = mp.get(), q = ta.value.trim(); if (!q) return toast('Describe the image first');
      Uni.task('images', m, go, out, async () => {
        Safety.guard(q);
        let prompt = q;
        if (S.smart) { const cm = Registry.defaultFor('files'); if (cm) { const ph = Uni.progress('Improving your prompt with ' + cm.name + '...'); out.prepend(ph); try { const r = (await Uni.chat(cm, 'You write prompts for an image generator.', 'Turn this request into ONE detailed English prompt (subject, setting, lighting, composition). Do not add written text in the image unless asked. Reply with ONLY the prompt.\nRequest: ' + q)).trim(); if (r && r.length < 1200) prompt = r; } finally { ph.remove(); } } }
        const colors = [S.colors.trim(), S.pick ? S.c1 + ', ' + S.c2 : ''].filter(Boolean).join(', ');
        const opts = () => ({ model: m, prompt, styleKey: S.style, ratio: ratioObj(), light: S.light, bg: S.bg, cam: S.cam, colors, quality: S.quality, maxSide: S.maxSide, wm: S.wm, ref });
        for (let i = 0; i < S.n; i++) {
          const ph = Uni.progress('Creating image ' + (i + 1) + ' of ' + S.n + ' with ' + m.name + '...'); out.prepend(ph);
          try { const rec = await Uni.makeImage(opts()); ph.replaceWith(Uni.imgCard(rec, () => Uni.makeImage(opts()))); }
          catch (e) { ph.remove(); throw e; }
        }
      });
    };
    Uni.set(Uni.top('', 'images'), mp.node, h('div', { className: 'u-sec' }, h('h4', { textContent: 'Prompt' }), ta,
      h('div', { className: 'u-btns' }, h('button', { textContent: '🎲 Idea', on: { click: () => { const I = ['A rabbit studying under a glowing lamp, cozy night room', 'The solar system as a colorful school poster', 'A friendly robot teaching math to kids', 'Lahore Badshahi Mosque at sunset, golden hour', 'A futuristic university library with floating books']; ta.value = I[Math.floor(Math.random() * I.length)]; } } }))),
      dyn, go, h('div', { className: 'u-btns' }, h('button', { textContent: '🗂 My gallery (this device)', on: { click: () => { if (typeof imGallery === 'function') imGallery(); } } })), out);
    buildDyn();
  };

  /* ---------- AUTOMATIC MODE (normal chat) ---------- */
  Uni.autoNote = (text) => { try { const n = h('div', { className: 'autonote', textContent: text }); M.append(n); M.scrollTop = M.scrollHeight; } catch (e) {} };
  Uni.parseImageIntent = function (q) {
    const t = q.toLowerCase(), n = {};
    const S = [[/\b(?:photo-?realistic|realistic|real photo)\b/, 'real'], [/\b3[- ]?d\b|\b3d render\b/, 'd3'], [/\bcartoon\b/, 'cart'], [/\b(?:anime|manga)\b/, 'anime'], [/\blogo\b/, 'logo'],
      [/\bcinematic\b|\bmovie still\b|\bfilm still\b/, 'cine'], [/\bdigital art\b|\bconcept art\b/, 'dart'], [/\billustrat(?:ion|ed)\b/, 'illus'], [/\bproduct (?:photo|shot|photography|mockup)\b/, 'prod'], [/\b(?:professional photo(?:graph|graphy)?|photography|dslr)\b/, 'pro']];
    n.style = (S.find(([re]) => re.test(t)) || [])[1]; n.styleExplicit = !!n.style;
    const m = t.match(/(?:^|[\s-])(16\s*[:x]\s*9|9\s*[:x]\s*16|4\s*[:x]\s*3|3\s*[:x]\s*2|1\s*[:x]\s*1)(?!\d)/);
    if (m) { n.ratio = m[1].replace(/\s/g, '').replace('x', ':'); n.ratioExplicit = true; }
    else if (/\b(?:thumbnail|youtube|banner|desktop wallpaper|landscape|cover photo)\b/.test(t)) n.ratio = '16:9';
    else if (/\b(?:wallpaper|phone|story|reel|tiktok|status|vertical|portrait mode)\b/.test(t)) n.ratio = '9:16';
    else if (/\bposter\b/.test(t)) n.ratio = 'custom34';
    else n.ratio = '1:1';
    if (!n.style) n.style = /\bthumbnail\b/.test(t) ? 'real' : /\bproduct\b/.test(t) ? 'prod' : /\bsticker\b/.test(t) ? 'cart' : 'real';
    const c = t.match(/--x(\d)\b/) || t.match(/\b(\d)\s+(?:images|pictures|variations|options)\b/); n.n = c ? clamp(c[1], 1, 4) : 1;
    n.hq = /\b(?:high quality|ultra|4k|hd)\b/.test(t);
    n.prompt = q.replace(/(?:^|\s)--\S+/g, ' ').replace(/\s+/g, ' ').trim();
    return n;
  };
  Uni.autoImage = async function (q) {
    const it = Uni.parseImageIntent(q), m = Registry.pick('images');
    if (!m) return false;
    if (busy) { toast('Please wait...'); return true; }
    const rt = it.ratio === 'custom34' ? { label: 'Custom 768×1024', w: 768, h: 1024, exact: true } : { label: it.ratio, w: RAT[it.ratio][0], h: RAT[it.ratio][1] };
    busy = true; $('send').disabled = true;
    try {
      if (!await puterReady()) return true;
      if (!hist.length) M.innerHTML = '';
      bub('user', q, q); hist.push({ role: 'user', content: q, shown: q });
      const b = bub('assistant', ''); pet('think'); b.innerHTML = '';
      const q2 = $('q'); q2.value = ''; q2.style.height = 'auto';
      let made = 0, lastErr = null;
      const quality = it.hq && m.images && m.images.qualities.includes('high') ? 'high' : '';
      const opts = () => ({ model: m, prompt: it.prompt, styleKey: it.style, ratio: rt, quality, maxSide: 'native', wm: false });
      for (let i = 0; i < Math.min(it.n, (m.images && m.images.maxN) || 1); i++) {
        const ph = h('div', { className: 'ldw' }, h('img', { className: 'ld', src: 'loading.gif', alt: '' }), h('span', { textContent: 'Creating your image with ' + m.name + '...' })); b.append(ph);
        try { const rec = await Uni.makeImage(opts()); ph.replaceWith(Uni.imgCard(rec, () => Uni.makeImage(opts()))); made++; Usage.log('images', m.id, true); }
        catch (e) { ph.remove(); lastErr = e; if (!(e && e.safety)) Usage.log('images', m.id, false, e && e.code); }
      }
      if (made) { hist.push({ role: 'assistant', content: '🎨 Image created: ' + it.prompt }); pet('happy', 3000); saveChat();
        Uni.autoNote('🤖 Auto mode · AI Images · ' + STY[it.style][0] + (it.styleExplicit ? '' : ' (default)') + ' · ' + rt.label + ' · ' + m.name + ' · open C-Univers-AI to choose these yourself'); }
      else { b.textContent = ((lastErr && lastErr.message) || 'Could not create the image.').slice(0, 300); hist.pop(); pet('sad', 3000); }
    } finally { busy = false; $('send').disabled = false; M.scrollTop = M.scrollHeight; }
    return true;
  };
  Uni.hooks.push(async q => (typeof isImg === 'function' && isImg(q) && !(typeof attach !== 'undefined' && attach)) ? Uni.autoImage(q) : false);

  /* automatic mode entry: runs before the old command router; explicit "/commands" are never touched */
  Uni.auto = async function (q) {
    q = String(q || '').trim(); if (!q || q[0] === '/') return false;
    try { await Registry.load(); } catch (e) {}
    for (const f of Uni.hooks) { try { if (await f(q)) return true; } catch (e) { return false; } }
    return false;
  };
  const origRoute = window.cmdRoute;
  window.cmdRoute = async function (q) { if (await Uni.auto(q)) return true; return typeof origRoute === 'function' ? origRoute.apply(this, arguments) : false; };

  /* make the nav button open the menu */
  const origGo = window.go;
  window.go = function (v) { origGo.apply(this, arguments); if (v === 'uni') Uni.show(); };
  Uni.STY = STY; Uni.RAT = RAT; Uni.clamp = clamp; Uni.rb64 = rb64;
})();
