/**
 * CUBE-S-AI | ai/providers.js
 * Direct (browser -> provider) integrations for OpenAI, Anthropic Claude and Google Gemini.
 * Every provider exposes the same interface:
 *   stream({ key, model, messages, signal, onText }) -> { text, truncated }
 *   listModels(key, signal) -> [{ id, label }]   (also proves the key works)
 * `messages` are [{role:'system'|'user'|'assistant', content:string}] and onText gets the CUMULATIVE text.
 * API keys are only ever put in request headers to the provider's own HTTPS endpoint.
 */
(function (g) {
  'use strict';

  /* ---------- errors ---------- */
  class AIError extends Error {
    constructor(code, message, extra) { super(message); this.name = 'AIError'; this.code = code; Object.assign(this, extra || {}); }
  }
  const META = {
    openai: { id: 'openai', name: 'OpenAI', company: 'OpenAI', short: 'OpenAI',
      keyUrl: 'https://platform.openai.com/api-keys', privacyUrl: 'https://openai.com/policies/privacy-policy',
      hint: 'Starts with sk-', prefix: 'sk-' },
    anthropic: { id: 'anthropic', name: 'Anthropic Claude', company: 'Anthropic', short: 'Claude',
      keyUrl: 'https://console.anthropic.com/settings/keys', privacyUrl: 'https://www.anthropic.com/legal/privacy',
      hint: 'Starts with sk-ant-', prefix: 'sk-ant-' },
    gemini: { id: 'gemini', name: 'Google Gemini', company: 'Google', short: 'Gemini',
      keyUrl: 'https://aistudio.google.com/apikey', privacyUrl: 'https://ai.google.dev/gemini-api/terms',
      hint: 'Starts with AIza', prefix: 'AIza' },
    cloud: { id: 'cloud', name: 'CUBE-S-AI Cloud', company: 'CUBE-S-AI Cloud', short: 'Cloud' }
  };
  /* Used only until the live list loads from the provider with the user's key. */
  const FALLBACK = {
    openai: [{ id: 'gpt-4o-mini', label: 'gpt-4o-mini' }, { id: 'gpt-4o', label: 'gpt-4o' }],
    anthropic: [{ id: 'claude-haiku-5-5', label: 'claude-haiku-5-5' }, { id: 'claude-sonnet-5-5', label: 'claude-sonnet-5-5' }, { id: 'claude-opus-5-5', label: 'claude-opus-5-5' }],
    gemini: [{ id: 'gemini-2.5-flash', label: 'gemini-2.5-flash' }, { id: 'gemini-2.5-pro', label: 'gemini-2.5-pro' }]
  };

  /** Light sanity check so typos are caught before a network call. Never logs the key. */
  function checkKeyShape(provider, key) {
    const m = META[provider]; key = String(key || '').trim();
    if (!m) return { ok: false, msg: 'Unknown provider' };
    if (key.length < 20 || key.length > 400) return { ok: false, msg: 'That does not look like a full API key.' };
    if (/\s/.test(key) || /[^\x21-\x7e]/.test(key)) return { ok: false, msg: 'The key has spaces or strange characters. Paste only the key.' };
    if (!key.startsWith(m.prefix)) return { ok: true, warn: m.name + ' keys usually start with "' + m.prefix + '". Double-check it.' };
    return { ok: true };
  }

  /* ---------- HTTP helpers ---------- */
  function friendly(provider, status, apiMsg) {
    const n = META[provider].name, tail = apiMsg ? ' (' + String(apiMsg).slice(0, 200) + ')' : '';
    if (status === 401 || status === 403) return { code: 'AUTH', msg: n + ' did not accept your API key. Open Settings > AI providers and check or replace it.' + tail };
    if (status === 429) return { code: 'RATE', msg: n + ' says you hit a rate limit or ran out of quota/credit. Wait a bit or check your ' + n + ' billing.' + tail };
    if (status === 404) return { code: 'MODEL', msg: n + ' could not find that model for your account. Pick another model in Settings > AI providers.' + tail };
    if (status === 400) return { code: 'BAD_REQUEST', msg: n + ' rejected the request.' + tail };
    if (status === 413) return { code: 'TOO_LONG', msg: 'The conversation is too long for this model. Start a new chat.' + tail };
    if (status >= 500) return { code: 'SERVER', msg: n + ' is having trouble right now. Try again shortly.' + tail };
    return { code: 'HTTP', msg: n + ' returned an error (HTTP ' + status + ').' + tail };
  }
  async function errorFrom(provider, res) {
    if (provider === 'cloud') {
      let j = null; try { j = await res.json(); } catch (e) {}
      const e = (j && j.error) || {};
      return new AIError(e.code || 'HTTP', e.message || 'CUBE-S-AI Cloud returned an error (HTTP ' + res.status + ').', { status: res.status, provider, resetAt: e.resetAt, retryAfter: e.retryAfter });
    }
    let apiMsg = ''; try { const j = await res.json(); apiMsg = (j && (j.error && (j.error.message || j.error) || j.message)) || ''; if (typeof apiMsg !== 'string') apiMsg = JSON.stringify(apiMsg); } catch (e) {}
    const f = friendly(provider, res.status, apiMsg); return new AIError(f.code, f.msg, { status: res.status, provider });
  }
  /** fetch with: connect timeout, caller abort, and network errors turned into readable messages. */
  async function request(provider, url, init, signal, connectMs) {
    const ctl = new AbortController(); let timedOut = false;
    const t = setTimeout(() => { timedOut = true; ctl.abort(); }, connectMs || 45000);
    const onAbort = () => ctl.abort(); if (signal) { if (signal.aborted) ctl.abort(); else signal.addEventListener('abort', onAbort, { once: true }); }
    try {
      const res = await fetch(url, Object.assign({}, init, { signal: ctl.signal, credentials: 'omit', referrerPolicy: 'no-referrer' }));
      if (!res.ok) throw await errorFrom(provider, res);
      return res;
    } catch (e) {
      if (e instanceof AIError) throw e;
      if (signal && signal.aborted) throw new AIError('ABORTED', 'Stopped.', { provider });
      if (timedOut) throw new AIError('TIMEOUT', META[provider].name + ' took too long to respond. Check your connection and try again.', { provider });
      throw new AIError('NETWORK', 'Could not reach ' + META[provider].name + '. Check your internet or VPN. Some networks block this service.', { provider });
    } finally { clearTimeout(t); if (signal) signal.removeEventListener('abort', onAbort); }
  }
  /** Reads a Server-Sent-Events body. Handles events split across chunks and \r\n line endings. */
  async function readSSE(res, onEvent) {
    if (!res.body || !res.body.getReader) throw new AIError('NO_STREAM', 'This browser cannot stream responses.');
    const rd = res.body.getReader(), td = new TextDecoder(); let buf = '';
    const flush = raw => {
      let ev = 'message'; const d = [];
      raw.split(/\r?\n/).forEach(l => { if (l.startsWith('event:')) ev = l.slice(6).trim(); else if (l.startsWith('data:')) d.push(l.slice(5).replace(/^ /, '')); });
      if (d.length) return onEvent(ev, d.join('\n'));
    };
    for (;;) {
      const { done, value } = await rd.read(); if (done) break;
      buf += td.decode(value, { stream: true });
      for (let m; (m = /\r?\n\r?\n/.exec(buf));) { const raw = buf.slice(0, m.index); buf = buf.slice(m.index + m[0].length); if (flush(raw) === 'stop') { try { await rd.cancel(); } catch (e) {} return; } }
    }
    buf += td.decode(); if (buf.trim()) flush(buf);
  }
  const J = s => { try { return JSON.parse(s); } catch (e) { return null; } };

  /* ---------- message shaping ---------- */
  /** Splits system text out and merges consecutive same-role turns (Claude and Gemini require alternation). */
  function shape(messages, assistantRole) {
    const sys = [], turns = [];
    (messages || []).forEach(m => {
      const text = String(m && m.content != null ? m.content : '').trim(); if (!text) return;
      if (m.role === 'system') { sys.push(text); return; }
      const role = m.role === 'assistant' ? assistantRole : 'user', last = turns[turns.length - 1];
      if (last && last.role === role) last.text += '\n\n' + text; else turns.push({ role, text });
    });
    while (turns.length && turns[0].role !== 'user') turns.shift();
    if (!turns.length) throw new AIError('EMPTY', 'There is nothing to send.');
    return { system: sys.join('\n\n'), turns };
  }

  /* ---------- OpenAI ---------- */
  const openai = {
    meta: META.openai,
    async stream({ key, model, messages, signal, onText }) {
      const body = { model, stream: true, messages: messages.filter(m => String(m.content || '').trim()).map(m => ({ role: m.role, content: String(m.content) })) };
      const res = await request('openai', 'https://api.openai.com/v1/chat/completions', { method: 'POST', headers: { 'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }, signal);
      let text = '', truncated = false;
      await readSSE(res, (ev, data) => {
        if (data === '[DONE]') return 'stop';
        const j = J(data); if (!j) return;
        if (j.error) throw new AIError('STREAM', META.openai.name + ' stopped: ' + (j.error.message || 'unknown error'), { provider: 'openai' });
        const c = j.choices && j.choices[0]; if (!c) return;
        const t = c.delta && c.delta.content; if (t) { text += t; onText && onText(text); }
        if (c.finish_reason === 'length') truncated = true;
        if (c.finish_reason === 'content_filter' && !text) throw new AIError('BLOCKED', 'OpenAI filtered this reply. Try rephrasing.', { provider: 'openai' });
      });
      return { text, truncated };
    },
    async listModels(key, signal) {
      const res = await request('openai', 'https://api.openai.com/v1/models', { headers: { 'Authorization': 'Bearer ' + key } }, signal, 20000);
      const j = await res.json();
      return (j.data || []).filter(m => /^(gpt-|o\d|chatgpt-)/.test(m.id) && !/(audio|realtime|transcribe|tts|image|embedding|moderation|search|instruct|codex|diarize|whisper)/.test(m.id))
        .sort((a, b) => (b.created || 0) - (a.created || 0)).map(m => ({ id: m.id, label: m.id }));
    }
  };

  /* ---------- Anthropic Claude ---------- */
  const anthropic = {
    meta: META.anthropic,
    async stream({ key, model, messages, signal, onText }) {
      const { system, turns } = shape(messages, 'assistant');
      const body = { model, max_tokens: 8192, stream: true, messages: turns.map(t => ({ role: t.role, content: t.text })) };
      if (system) body.system = system;
      const res = await request('anthropic', 'https://api.anthropic.com/v1/messages', { method: 'POST', headers: {
        'x-api-key': key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true', 'content-type': 'application/json' }, body: JSON.stringify(body) }, signal);
      let text = '', truncated = false;
      await readSSE(res, (ev, data) => {
        const j = J(data); if (!j) return;
        if (ev === 'error' || j.type === 'error') throw new AIError('STREAM', META.anthropic.name + ' stopped: ' + ((j.error && j.error.message) || 'unknown error'), { provider: 'anthropic' });
        if (j.type === 'content_block_delta' && j.delta && j.delta.type === 'text_delta' && j.delta.text) { text += j.delta.text; onText && onText(text); }
        if (j.type === 'message_delta' && j.delta) { if (j.delta.stop_reason === 'max_tokens') truncated = true; if (j.delta.stop_reason === 'refusal' && !text) throw new AIError('BLOCKED', 'Claude declined this request. Try rephrasing.', { provider: 'anthropic' }); }
        if (j.type === 'message_stop') return 'stop';
      });
      return { text, truncated };
    },
    async listModels(key, signal) {
      const res = await request('anthropic', 'https://api.anthropic.com/v1/models?limit=100', { headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' } }, signal, 20000);
      const j = await res.json();
      return (j.data || []).filter(m => m.id).map(m => ({ id: m.id, label: m.display_name ? m.display_name + ' (' + m.id + ')' : m.id }));
    }
  };

  /* ---------- Google Gemini ---------- */
  const geminiName = id => String(id).replace(/^models\//, '');
  const gemini = {
    meta: META.gemini,
    async stream({ key, model, messages, signal, onText }) {
      const { system, turns } = shape(messages, 'model');
      const body = { contents: turns.map(t => ({ role: t.role, parts: [{ text: t.text }] })) };
      if (system) body.systemInstruction = { parts: [{ text: system }] };
      const url = 'https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(geminiName(model)) + ':streamGenerateContent?alt=sse';
      const res = await request('gemini', url, { method: 'POST', headers: { 'x-goog-api-key': key, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }, signal);
      let text = '', truncated = false, block = '';
      await readSSE(res, (ev, data) => {
        const j = J(data); if (!j) return;
        if (j.error) throw new AIError('STREAM', META.gemini.name + ' stopped: ' + (j.error.message || 'unknown error'), { provider: 'gemini' });
        if (j.promptFeedback && j.promptFeedback.blockReason) block = j.promptFeedback.blockReason;
        const c = j.candidates && j.candidates[0]; if (!c) return;
        ((c.content && c.content.parts) || []).forEach(p => { if (p.text && !p.thought) { text += p.text; onText && onText(text); } });
        if (c.finishReason === 'MAX_TOKENS') truncated = true;
        if (/^(SAFETY|PROHIBITED_CONTENT|BLOCKLIST|SPII|RECITATION)$/.test(c.finishReason || '')) block = block || c.finishReason;
      });
      if (!text && block) throw new AIError('BLOCKED', 'Gemini blocked this reply (' + block + '). Try rephrasing.', { provider: 'gemini' });
      return { text, truncated };
    },
    async listModels(key, signal) {
      const res = await request('gemini', 'https://generativelanguage.googleapis.com/v1beta/models?pageSize=200', { headers: { 'x-goog-api-key': key } }, signal, 20000);
      const j = await res.json();
      return (j.models || []).filter(m => /^models\/gemini/.test(m.name) && (m.supportedGenerationMethods || []).includes('generateContent') && !/(embedding|tts|image|live|native-audio|robotics|computer-use)/.test(m.name))
        .map(m => ({ id: geminiName(m.name), label: m.displayName ? m.displayName + ' (' + geminiName(m.name) + ')' : geminiName(m.name) }));
    }
  };

  /* ---------- CUBE-S-AI Cloud (Cloudflare Worker proxy; shared keys live on the server, we send a Firebase ID token) ---------- */
  const cloudBase = () => String(g.CS_CLOUD_URL || '').replace(/\/+$/, '');
  const cloud = {
    meta: META.cloud,
    configured: () => !!cloudBase(),
    async me(token, signal) {
      const res = await request('cloud', cloudBase() + '/v1/me', { headers: { 'Authorization': 'Bearer ' + token } }, signal, 20000);
      return res.json();
    },
    async stream({ token, model, messages, signal, onText }) {
      const res = await request('cloud', cloudBase() + '/v1/chat', { method: 'POST', headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, messages: messages.filter(m => String(m.content || '').trim()).map(m => ({ role: m.role, content: String(m.content) })) }) }, signal);
      let text = '', truncated = false, info = null;
      await readSSE(res, (ev, data) => {
        const j = J(data); if (!j) return;
        if (j.error) throw new AIError(j.error.code || 'STREAM', j.error.message || 'Cloud AI stopped.', { provider: 'cloud' });
        if (j.t) { text += j.t; onText && onText(text); }
        if (j.done) { truncated = !!j.truncated; info = j; }
      });
      return { text, truncated, info };
    }
  };

  g.CSProviders = { AIError, META, FALLBACK, byok: { openai, anthropic, gemini }, cloud, checkKeyShape, shape, readSSE };
})(typeof window !== 'undefined' ? window : globalThis);
