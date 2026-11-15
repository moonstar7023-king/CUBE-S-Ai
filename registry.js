/* =====================================================================
   CUTE-S AI - Model Registry (registry.js)
   Loaded after cmd.js. Provides: Registry, Adapters, Usage
   - Models and providers come from models.json (+ optional Firestore doc
     config/models edited by an admin). Nothing is hardcoded in the UI.
   - Availability is checked at runtime (is the provider API really there?).
   - No model is ever replaced silently: if a model fails, the error names it.
   ===================================================================== */
(function () {
  const CATS = ['images', 'files', 'videos', 'coding', 'research', 'data'];
  const isObj = v => v && typeof v === 'object' && !Array.isArray(v);
  const str = (v, max) => typeof v === 'string' ? v.slice(0, max) : '';

  /* ---------- registry ---------- */
  const Registry = {
    data: null, cfg: { disabled: [], defaults: {}, extra: [] }, discovered: [], loaded: false, loadError: '',

    async load(force) {
      if (this.loaded && !force) return this;
      try {
        const r = await fetch('models.json', { cache: 'no-store' });
        if (!r.ok) throw new Error('HTTP ' + r.status);
        this.data = await r.json();
      } catch (e) {
        this.loadError = 'The model list could not be loaded (' + ((e && e.message) || e) + '). Check your connection and refresh.';
        this.data = this.data || { providers: {}, defaults: {}, models: [] };
      }
      try { // optional admin overrides (readable by verified users, writable by admins only)
        const s = await db.collection('config').doc('models').get();
        if (s.exists) {
          const d = s.data() || {};
          this.cfg = {
            disabled: Array.isArray(d.disabled) ? d.disabled.filter(x => typeof x === 'string').slice(0, 200) : [],
            defaults: isObj(d.defaults) ? d.defaults : {},
            extra: Array.isArray(d.extra) ? d.extra.map(m => this.clean(m)).filter(Boolean).slice(0, 100) : []
          };
        }
      } catch (e) { /* rules not deployed yet, or offline: the bundled list is used */ }
      this.loaded = true;
      return this;
    },

    /* accept only well-formed model entries (admin config must not be able to inject anything odd) */
    clean(m) {
      if (!isObj(m)) return null;
      const id = str(m.id, 120), name = str(m.name, 80), provider = str(m.provider, 30);
      if (!id || !name || /\s/.test(id) || !this.data || !this.data.providers[provider]) return null;
      const categories = (Array.isArray(m.categories) ? m.categories : []).filter(c => CATS.includes(c));
      if (!categories.length) return null;
      const o = { id, name, provider, vendor: str(m.vendor, 60), categories, description: str(m.description, 200),
        capabilities: (Array.isArray(m.capabilities) ? m.capabilities : []).map(x => str(x, 30)).filter(Boolean).slice(0, 8), vision: !!m.vision };
      if (isObj(m.images)) o.images = { qualities: (Array.isArray(m.images.qualities) ? m.images.qualities : []).map(x => str(x, 12)).filter(Boolean).slice(0, 6),
        maxN: Math.min(4, Math.max(1, +m.images.maxN || 1)), edit: !!m.images.edit, negativePrompt: !!m.images.negativePrompt };
      if (isObj(m.video)) { const v = m.video, sec = isObj(v.seconds) ? { min: +v.seconds.min || 4, max: +v.seconds.max || 8, default: +v.seconds.default || 5 } : null;
        o.video = { mode: ['t2v', 'i2v', 'both'].includes(v.mode) ? v.mode : 't2v', edit: !!v.edit, seconds: sec,
          sizes: (Array.isArray(v.sizes) ? v.sizes : []).map(x => str(x, 12)).filter(Boolean).slice(0, 8),
          ratios: (Array.isArray(v.ratios) ? v.ratios : []).map(x => str(x, 8)).filter(Boolean).slice(0, 8),
          negativePrompt: !!v.negativePrompt, audio: ['none', 'optional', 'always'].includes(v.audio) ? v.audio : 'none' }; }
      return o;
    },

    providers() { return (this.data && this.data.providers) || {}; },
    all() {
      const base = (this.data && this.data.models || []).map(m => this.clean(m)).filter(Boolean);
      const seen = new Set(base.map(m => m.id));
      const extra = this.cfg.extra.filter(m => !seen.has(m.id)); extra.forEach(m => seen.add(m.id));
      const disc = this.discovered.filter(m => !seen.has(m.id));
      return [...base, ...extra, ...disc];
    },
    get(id) { return this.all().find(m => m.id === id) || null; },
    isDisabled(id) { return this.cfg.disabled.includes(id); },

    /* runtime availability: is the provider API really present on this device? */
    status(m) {
      if (!m) return { ok: false, label: 'Unknown model', reason: 'This model is not in the registry.' };
      if (this.isDisabled(m.id)) return { ok: false, label: 'Turned off', reason: 'An administrator turned this model off.' };
      const A = Adapters[m.provider];
      if (!A) return { ok: false, label: 'No provider', reason: 'The provider "' + m.provider + '" is not installed.' };
      const kind = m.categories.includes('images') ? 'image' : m.categories.includes('videos') && m.video ? 'video' : 'chat';
      if (!A.has(kind)) return { ok: false, label: 'Unavailable', reason: 'The ' + (A.name || m.provider) + ' ' + kind + ' feature could not be loaded on this device. Check your internet or VPN and refresh.' };
      return { ok: true, label: m.discovered ? 'Available (found live)' : 'Available', reason: '' };
    },
    list(cat, includeOff) {
      return this.all().filter(m => m.categories.includes(cat) && (includeOff || !this.isDisabled(m.id)))
        .map(m => Object.assign({}, m, { _s: this.status(m) }));
    },
    defaultFor(cat) {
      const l = this.list(cat), want = this.cfg.defaults[cat] || (this.data && this.data.defaults[cat]);
      return l.find(m => m.id === want && m._s.ok) || l.find(m => m._s.ok) || null;
    },
    /* automatic mode: the default model if it can do the job, else the first available model that can */
    pick(cat, need) {
      const l = this.list(cat).filter(m => m._s.ok && (!need || m.capabilities.includes(need)));
      const d = this.defaultFor(cat);
      return (d && l.find(m => m.id === d.id)) || l[0] || null;
    },

    /* models Puter reports live (chat models only). Added to the list, never replacing anything */
    async discover() {
      try {
        if (typeof puter === 'undefined' || !puter.ai || typeof puter.ai.listModels !== 'function') return 0;
        const r = await puter.ai.listModels();
        const arr = Array.isArray(r) ? r : (r && Array.isArray(r.models) ? r.models : []);
        const have = new Set(this.all().map(m => m.id)); let n = 0;
        for (const x of arr.slice(0, 400)) {
          const o = typeof x === 'string' ? { id: x } : x; const id = o && str(o.id || o.name, 100);
          if (!id || /\s/.test(id) || have.has(id) || n >= 60) continue;
          have.add(id); n++;
          this.discovered.push({ id, name: str(o.name || id, 80), provider: 'puter', vendor: str(o.provider || '', 40), categories: ['files', 'coding', 'research', 'data'],
            description: 'Found live from the provider. Capabilities are not verified.', capabilities: ['text'], vision: false, discovered: true });
        }
        return n;
      } catch (e) { return 0; }
    },

    /* ---------- admin ---------- */
    async isAdmin() {
      try { if (!user) return false; const s = await db.collection('admins').doc(user.uid).get(); return s.exists; } catch (e) { return false; }
    },
    async saveConfig(cfg) {
      const clean = {
        disabled: (cfg.disabled || []).filter(x => typeof x === 'string').slice(0, 200),
        defaults: isObj(cfg.defaults) ? cfg.defaults : {},
        extra: (cfg.extra || []).map(m => this.clean(m)).filter(Boolean).slice(0, 100)
      };
      await db.collection('config').doc('models').set(Object.assign({}, clean, { updatedAt: firebase.firestore.FieldValue.serverTimestamp() }));
      this.cfg = clean;
    }
  };

  /* ---------- provider error handling ---------- */
  function explain(e, m) {
    const body = (e && e.error && typeof e.error === 'object') ? e.error : e || {};
    const code = String(body.code || body.errorCode || (e && e.code) || ''), raw = String(body.message || (e && e.message) || (typeof e === 'string' ? e : '') || '').slice(0, 200);
    const nm = m ? '"' + m.name + '"' : 'This model';
    let t;
    if (body.errorCode === 'moderation_flagged' || /moderation/i.test(code)) t = 'The provider\'s own content filter refused this request. Please change the prompt.';
    else if (code === 'insufficient_funds') t = 'Not enough Puter credits for this request. Try a shorter or smaller request, or another model.';
    else if (code === 'upstream_timeout') t = nm + ' took too long. Try again, or use a shorter request.';
    else if (/Model not found|model_not_found/i.test(raw + code)) t = nm + ' is not available right now.';
    else if (/auth|sign ?in|token|401|403/i.test(code + raw)) t = 'Please sign in to Puter (allow pop-ups) and try again.';
    else t = nm + ' could not finish this request' + (raw ? ' (' + raw + ')' : '') + '.';
    const er = new Error(t + ' CUTE-S AI did not switch to another model. Choose another one and try again.');
    er.code = code; er.model = m && m.id; er.provider = true; return er;
  }

  /* ---------- provider adapters ---------- */
  const Adapters = {
    puter: {
      name: 'Puter',
      has(kind) {
        try {
          if (typeof puter === 'undefined' || !puter.ai) return false;
          return ({ chat: 'chat', image: 'txt2img', video: 'txt2vid' })[kind] ? typeof puter.ai[({ chat: 'chat', image: 'txt2img', video: 'txt2vid' })[kind]] === 'function' : false;
        } catch (e) { return false; }
      },
      /* chat with EXACTLY the chosen model (no fallback list) */
      async chat(m, msgs, onTxt, extra) {
        if (!await puterReady()) throw new Error('Puter sign-in is needed to use the AI.');
        Safety.guard(msgs.filter(x => x.role === 'user').map(x => typeof x.content === 'string' ? x.content : '').join('\n'), 'input');
        let full = '';
        try {
          const r = await puter.ai.chat(msgs, Object.assign({ model: m.id, stream: true }, extra || {}));
          for await (const p of r) { full += (p && p.text) || ''; if (onTxt) onTxt(full); }
        } catch (e) { throw explain(e, m); }
        if (!full) throw explain({ message: 'empty answer' }, m);
        Safety.guardOutput(full);
        return full;
      },
      async image(m, prompt, o) {
        o = o || {};
        if (!await puterReady()) throw new Error('Puter sign-in is needed to use the AI.');
        Safety.guard(prompt, 'input');
        const opt = { model: m.id };
        if (o.quality && m.images && m.images.qualities.includes(o.quality)) opt.quality = o.quality;
        if (o.ref && m.images && m.images.edit) { opt.input_image = o.ref.b64; opt.input_image_mime_type = o.ref.mime; }
        try { const im = await puter.ai.txt2img(prompt, opt); return await (await fetch(im.src)).blob(); }
        catch (e) { throw explain(e, m); }
      },
      async video(m, prompt, o) {
        o = o || {}; const v = m.video || {};
        if (!await puterReady()) throw new Error('Puter sign-in is needed to use the AI.');
        Safety.guard(prompt, 'input');
        const opt = { model: m.id };
        if (o.test) opt.test_mode = true;
        if (o.seconds && v.seconds) opt.seconds = o.seconds;
        if (o.size && v.sizes && v.sizes.includes(o.size)) opt.size = o.size;
        if (o.negative && v.negativePrompt) opt.negative_prompt = o.negative;
        if (v.audio === 'optional') opt.generate_audio = !!o.audio;
        if (o.image && v.mode !== 't2v') opt.input_reference = o.image;
        if (o.video && v.edit) opt.inputVideo = o.video;
        try { return await puter.ai.txt2vid(Object.assign({ prompt }, opt)); }
        catch (e) { throw explain(e, m); }
      }
    }
  };

  /* ---------- usage tracking: private per-user counters, never any content ---------- */
  const Usage = {
    errors: [],
    async log(cat, modelId, ok, code) {
      try {
        if (!ok) { this.errors.unshift({ t: Date.now(), cat, model: modelId, code: String(code || '').slice(0, 40) }); this.errors.length = Math.min(this.errors.length, 30); }
        if (typeof user === 'undefined' || !user) return;
        const day = new Date().toISOString().slice(0, 10), safe = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 40), inc = firebase.firestore.FieldValue.increment(1);
        const d = { updatedAt: firebase.firestore.FieldValue.serverTimestamp() };
        d[safe(cat) + (ok ? '_ok' : '_err')] = inc; d['m_' + safe(modelId)] = inc;
        await db.collection('users').doc(user.uid).collection('usage').doc(day).set(d, { merge: true });
      } catch (e) { /* tracking must never break a task */ }
    },
    async mine(days) {
      try {
        const s = await db.collection('users').doc(user.uid).collection('usage').orderBy(firebase.firestore.FieldPath.documentId(), 'desc').limit(days || 30).get();
        return s.docs.map(d => Object.assign({ day: d.id }, d.data()));
      } catch (e) { return []; }
    }
  };

  window.Registry = Registry; window.Adapters = Adapters; window.Usage = Usage; window.explainProviderError = explain;
})();
