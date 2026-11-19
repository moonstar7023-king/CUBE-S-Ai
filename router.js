/**
 * CUBE-S-AI | ai/router.js
 * Chooses who answers: the free default (Puter, via the app's own freeCall), one of the user's own BYOK providers,
 * or CUBE-S-AI Cloud (shared keys on the owner's Cloudflare Worker). Also owns the per-user selection and the
 * "who processes my data" consent.
 *
 * Rules enforced here:
 *  - Free Puter stays the default. BYOK and Cloud are optional.
 *  - If a BYOK or Cloud call fails the error is shown. We NEVER silently re-send the chat to another provider.
 *  - A provider is only used after the user has seen the disclosure for it (one time per provider).
 */
(function (g) {
  'use strict';
  const P = g.CSProviders, V = g.CSVault;
  const FREE = { id: 'puter', name: 'Free AI (Puter)', company: 'Puter', short: 'Free (Puter)' };
  const lsGet = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} };

  let uid = null, vault = null, sel = { provider: 'puter', models: {} }, consent = {}, ui = null, viaCb = null, lastVia = '', tokenFn = null, cloudMe = null;
  let vaultOpts = null; // tests inject storage adapters

  const selKey = () => 'cs_ai_sel_' + uid, okKey = () => 'cs_ai_ok_' + uid, meKey = () => 'cs_ai_cloud_' + uid;
  const saveSel = () => lsSet(selKey(), JSON.stringify(sel));
  const saveOk = () => lsSet(okKey(), JSON.stringify(consent));
  const isByok = id => !!P.byok[id];
  const cloudOn = () => P.cloud.configured();
  const isCloud = id => id === 'cloud' && cloudOn();
  const cloudModel = id => ((cloudMe && cloudMe.models) || []).find(m => m.id === id);

  const CSAI = {
    FREE,
    _configure(o) { vaultOpts = o; },
    attachUI(x) { ui = x; },
    onVia(cb) { viaCb = cb; },
    setTokenProvider(fn) { tokenFn = fn; },
    cloudConfigured: cloudOn,

    setUser(id) {
      uid = String(id);
      try { sel = Object.assign({ provider: 'puter', models: {} }, JSON.parse(lsGet(selKey()) || '{}')); } catch (e) { sel = { provider: 'puter', models: {} }; }
      try { consent = JSON.parse(lsGet(okKey()) || '{}') || {}; } catch (e) { consent = {}; }
      try { cloudMe = JSON.parse(lsGet(meKey()) || 'null'); } catch (e) { cloudMe = null; }
      if (!isByok(sel.provider) && !isCloud(sel.provider)) sel.provider = 'puter';
      vault = V.create(Object.assign({ uid }, vaultOpts || {}));
      lastVia = ''; CSAI._badge();
    },
    vault() { return vault; },
    lock() { if (vault) vault.lock(); },

    selection() { return { provider: sel.provider, models: Object.assign({}, sel.models) }; },
    modelFor(id) { return sel.models[id] || (P.FALLBACK[id] || [{}])[0].id; },
    setModel(id, model) { if (!isByok(id) && id !== 'cloud') return; sel.models[id] = String(model); saveSel(); lastVia = ''; CSAI._badge(); },
    select(id) { sel.provider = (isByok(id) || isCloud(id)) ? id : 'puter'; saveSel(); lastVia = ''; CSAI._badge(); },
    /** Falls back to free if the active provider can no longer be used (key removed, Cloud switched off). */
    reconcile() {
      if (isByok(sel.provider) && vault && !vault.has(sel.provider)) { sel.provider = 'puter'; saveSel(); lastVia = ''; CSAI._badge(); }
      if (sel.provider === 'cloud' && !cloudOn()) { sel.provider = 'puter'; saveSel(); lastVia = ''; CSAI._badge(); }
    },

    /** What is active right now. kind: 'free' | 'byok' | 'cloud'. */
    active() {
      const id = sel.provider;
      if (isByok(id)) return { id, kind: 'byok', byok: true, name: P.META[id].name, company: P.META[id].company, model: CSAI.modelFor(id), provider: id };
      if (isCloud(id)) {
        const mid = sel.models.cloud || '', m = cloudModel(mid);
        return { id: 'cloud', kind: 'cloud', byok: false, name: 'CUBE-S-AI Cloud', company: m ? m.company : 'CUBE-S-AI Cloud', model: mid, modelLabel: m ? m.label : mid, provider: m ? m.provider : '' };
      }
      return { id: 'puter', kind: 'free', byok: false, name: FREE.name, company: FREE.company, model: '', provider: 'puter' };
    },
    label() { const a = CSAI.active(); return a.kind === 'byok' ? P.META[a.id].short + ' · ' + a.model : a.kind === 'cloud' ? 'Cloud · ' + (a.modelLabel || 'choose a model') : FREE.short; },
    /** Which disclosure the user must have accepted for the active choice. Cloud is per underlying provider. */
    consentId(a) { a = a || CSAI.active(); return a.kind === 'cloud' ? 'cloud:' + (a.provider || 'unknown') : a.id; },
    hasConsent(id) { return !!consent[id]; },
    giveConsent(id) { consent[id] = new Date().toISOString().slice(0, 10); saveOk(); },
    revokeConsent(id) { delete consent[id]; Object.keys(consent).forEach(k => { if (id === 'cloud' && k.startsWith('cloud:')) delete consent[k]; }); saveOk(); },

    /* ---- Cloud status (plan, allowance, usable models). Non-secret, cached for the UI. ---- */
    cloudInfo() { return cloudMe; },
    cloudModelInfo(id) { return cloudModel(id); },
    async refreshCloud() {
      if (!cloudOn() || !tokenFn) return null;
      const me = await P.cloud.me(await tokenFn(false));
      cloudMe = me; lsSet(meKey(), JSON.stringify(me));
      if (me && me.enabled && sel.provider === 'cloud') { const ok = (me.models || []).find(m => m.id === sel.models.cloud && m.available); if (!ok) { const f = (me.models || []).find(m => m.available); if (f) { sel.models.cloud = f.id; saveSel(); } } }
      CSAI._badge(); return me;
    },

    _badge() { const t = lastVia ? 'Answered by ' + lastVia : 'AI: ' + CSAI.label(); if (viaCb) try { viaCb(t, CSAI.active()); } catch (e) {} },

    /**
     * Call before every AI request.
     * -> 'byok' | 'cloud' : ready; the app must NOT require a Puter login
     * -> 'free'           : use the free default (the app then runs its normal Puter sign-in check)
     * -> 'cancel'         : user declined disclosure / unlock; do not send anything
     */
    async prepare() {
      if (!uid) return 'free';
      CSAI.reconcile();
      const a = CSAI.active(), cid = CSAI.consentId(a);
      if (a.kind === 'cloud' && !a.provider) { if (ui && ui.problem) ui.problem('Open Settings > AI providers and choose a Cloud model.'); return 'cancel'; }
      if (!CSAI.hasConsent(cid)) { const okc = ui && ui.consent ? await ui.consent(cid) : false; if (!okc) return 'cancel'; CSAI.giveConsent(cid); }
      if (a.kind === 'free') return 'free';
      if (a.kind === 'cloud') { if (!tokenFn) return 'cancel'; return 'cloud'; }
      if (!vault.has(a.id)) { CSAI.reconcile(); return 'cancel'; }
      if (!vault.isUnlocked()) {
        const st = vault.status();
        if (st.mode === 'device') { try { await vault.unlock(); } catch (e) { if (ui && ui.problem) ui.problem(e.message); return 'cancel'; } }
        else { const okp = ui && ui.unlock ? await ui.unlock() : false; if (!okp) return 'cancel'; }
      }
      return vault.get(a.id) ? 'byok' : 'cancel';
    },

    /**
     * Unified completion. opts.free = (msgs,onTxt) => Promise<{full,err,via}> (the app's Puter/free path).
     * Always resolves to { full, err, via }. Never throws.
     */
    async complete(msgs, onTxt, opts) {
      opts = opts || {}; const a = CSAI.active();
      if (a.kind === 'free') { const r = await opts.free(msgs, onTxt); lastVia = r.via || FREE.short; CSAI._badge(); return r; }
      try {
        let r, via;
        if (a.kind === 'cloud') {
          if (!tokenFn) throw new P.AIError('AUTH', 'Sign in again to use Cloud AI.');
          const run = async force => P.cloud.stream({ token: await tokenFn(force), model: a.model, messages: msgs, signal: opts.signal, onText: onTxt });
          try { r = await run(false); } catch (e) { if (e && (e.code === 'TOKEN_EXPIRED' || e.code === 'BAD_TOKEN')) r = await run(true); else throw e; }
          const left = r.info && typeof r.info.remaining === 'number' ? r.info.remaining : null;
          if (left !== null && cloudMe) { cloudMe.remaining = left; lsSet(meKey(), JSON.stringify(cloudMe)); }
          via = 'Cloud · ' + (a.modelLabel || a.model) + (a.company ? ' (' + a.company + ')' : '') + (left !== null ? ' · ' + left + ' left today' : '');
        } else {
          const key = vault && vault.get(a.id);
          if (!key) return { full: '', err: 'Your ' + a.name + ' key is locked. Open Settings > AI providers to unlock it.', via: '' };
          r = await P.byok[a.id].stream({ key, model: a.model, messages: msgs, signal: opts.signal, onText: onTxt });
          via = P.META[a.id].short + ' · ' + a.model;
        }
        let full = r.text; if (!full) throw new P.AIError('EMPTY', a.name + ' sent an empty reply. Try again or pick another model.');
        if (r.truncated) full += '\n\n_(The answer was cut off because it reached the length limit. Say "continue" to get the rest.)_';
        lastVia = via; CSAI._badge();
        return { full, err: '', via };
      } catch (e) {
        if (e && a.kind === 'cloud' && cloudMe && (e.code === 'DAILY_LIMIT' || e.code === 'BUDGET' || e.code === 'PAUSED')) {   // keep the Settings card truthful
          if (e.code === 'DAILY_LIMIT') cloudMe.remaining = 0; else cloudMe.state = e.code === 'PAUSED' ? 'paused' : 'budget_exhausted';
          lsSet(meKey(), JSON.stringify(cloudMe));
        }
        return { full: '', err: (e && e.message) || 'The AI request failed.', via: '' };
      }
    }
  };
  g.CSAI = CSAI;
})(typeof window !== 'undefined' ? window : globalThis);
