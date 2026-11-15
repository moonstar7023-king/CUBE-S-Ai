/* =====================================================================
   CUTE-S AI - C-Univers-AI tools (univers-tools.js)
   AI Videos, AI Coding, AI Research (+ their automatic chat mode).
   Needs: univers.js, registry.js, safety.js and the app.js globals.
   Honest scope:
   - Videos: text-to-video / image-to-video / video-edit ONLY on models the
     registry marks for it. "Analysis" reads sampled frames (no audio).
   - Coding: HTML/JS run in a locked iframe (no network, no storage access);
     Python runs in a Web Worker (Pyodide, standard library only, network
     blocked, 15 s limit). Java and SQL are written/reviewed but NOT run.
     Nothing is ever executed on a server.
   - Research: the only live source is Wikipedia. Every claim must cite a
     numbered source, and anything without a source is marked uncertain.
   ===================================================================== */
(function () {
  if (!window.Uni) return;
  const { h, $, ls } = Uni;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const TA = (ph, rows, max) => h('textarea', { rows: rows || 4, maxLength: max || 4000, placeholder: ph });
  const clampN = (v, a, b) => Math.min(b, Math.max(a, Math.round(+v) || a));
  const drop = (label, accept, onFile) => {
    const f = h('input', { type: 'file', accept, css: 'display:none' });
    f.onchange = () => { const x = f.files[0]; f.value = ''; if (x) onFile(x); };
    return h('div', null, h('div', { className: 'u-drop', textContent: label, on: { click: () => f.click() } }), f);
  };
  const once = (el, ev, ms) => new Promise((ok, no) => {
    const t = setTimeout(() => no(new Error('The video could not be read in this browser.')), ms || 20000);
    el.addEventListener(ev, () => { clearTimeout(t); ok(); }, { once: true });
    el.addEventListener('error', () => { clearTimeout(t); no(new Error('This video format cannot be opened in this browser.')); }, { once: true });
  });
  const download = (blob, name) => Uni.blobDl(blob, name);
  const ofZipSafe = files => { if (typeof ofZip !== 'function') throw new Error('The ZIP engine is not loaded.'); return ofZip(files); };

  /* =====================================================================
     AI VIDEOS
     ===================================================================== */
  const vidNode = res => {
    if (res && res.nodeType === 1 && /video/i.test(res.tagName)) { res.controls = true; res.setAttribute('playsinline', ''); return res; }
    const src = typeof res === 'string' ? res : (res && (res.src || res.currentSrc || res.url)) || '';
    if (!src) throw new Error('The provider returned no video.');
    return h('video', { src, controls: true, playsInline: true, preload: 'metadata' });
  };
  const vidCard = (res, meta, again) => {
    const v = vidNode(res), card = h('div', { className: 'u-res' }, v, h('div', { className: 'u-meta', textContent: meta }));
    const src = v.currentSrc || v.src;
    card.append(Uni.btns(
      ['⬇ Download', async b => { try { const r = await fetch(src); if (!r.ok) throw 0; download(await r.blob(), 'cutes-video-' + Date.now() + '.mp4'); } catch (e) { window.open(src, '_blank', 'noopener'); toast('Opening the video; use the player menu to save it.'); } }],
      again ? ['🔁 Again', again] : null));
    return card;
  };

  async function sampleFrames(file, n) {
    const url = URL.createObjectURL(file), v = document.createElement('video');
    v.muted = true; v.preload = 'auto'; v.playsInline = true; v.src = url;
    try {
      await once(v, 'loadedmetadata'); const d = v.duration;
      if (!isFinite(d) || d <= 0) throw new Error('This video has no readable length.');
      const sc = Math.min(1, 768 / Math.max(v.videoWidth || 768, v.videoHeight || 768)), w = Math.max(2, Math.round((v.videoWidth || 640) * sc)), hh = Math.max(2, Math.round((v.videoHeight || 360) * sc));
      const c = document.createElement('canvas'); c.width = w; c.height = hh; const g = c.getContext('2d'), out = [];
      for (let i = 0; i < n; i++) {
        const t = d * (i + 0.5) / n; v.currentTime = t; await once(v, 'seeked');
        g.drawImage(v, 0, 0, w, hh);
        const blob = await new Promise(ok => c.toBlob(ok, 'image/jpeg', 0.72)); if (blob) out.push({ t, blob });
      }
      return { frames: out, duration: d };
    } finally { URL.revokeObjectURL(url); }
  }
  const mmss = t => Math.floor(t / 60) + ':' + String(Math.floor(t % 60)).padStart(2, '0');

  Uni.panels.videos = function () {
    const S = Object.assign({ mode: 't2v', seconds: 0, size: '', ratio: '', test: false, audio: false }, ls.get('cs_uni_vid', {}));
    const save = () => ls.set('cs_uni_vid', S);
    const gen = Uni.modelPicker('videos', { filter: m => !!m.video, key: 'gen' }), ana = Uni.modelPicker('videos', { filter: m => !m.video && m.vision, key: 'ana' });
    const body = h('div'), out = h('div', { className: 'u-out' });
    let imgFile = null, vidFile = null;

    const modesFor = m => {
      const v = (m && m.video) || {}, a = [];
      if (v.mode === 't2v' || v.mode === 'both') a.push(['t2v', 'Text → video']);
      if (v.mode === 'i2v' || v.mode === 'both') a.push(['i2v', 'Image → video']);
      if (v.edit) a.push(['edit', 'Edit video']);
      a.push(['analyze', 'Analyze video'], ['summary', 'Summarize video']);
      return a;
    };
    const draw = () => {
      body.innerHTML = ''; const gm = gen.get(), modes = modesFor(gm);
      if (!modes.some(x => x[0] === S.mode)) S.mode = modes[0][0];
      body.append(h('div', { className: 'u-seg' }, Uni.chips(modes, S.mode, v => { S.mode = v; save(); draw(); })));
      if (S.mode === 'analyze' || S.mode === 'summary') return drawAnalyze();
      if (!gm) { body.append(h('div', { className: 'u-warn', textContent: 'No video-generation model is available on this device right now. Nothing is faked: analysis of your own videos still works.' })); return; }
      const v = gm.video, sec = h('div', { className: 'u-sec' }, h('h4', { textContent: 'Settings' }));
      body.append(gen.node);
      const prompt = TA(S.mode === 'edit' ? 'Describe the change, e.g. "make the dog a dinosaur"' : 'Describe the video: subject, action, camera, mood...', 4, 800);
      if (S.mode === 'i2v' || S.mode === 'edit') {
        const isV = S.mode === 'edit', st = h('div', { className: 'u-note', textContent: (isV ? vidFile : imgFile) ? '✔ ' + (isV ? vidFile : imgFile).name : 'Nothing chosen yet' });
        body.append(h('div', { className: 'u-sec' }, h('h4', { textContent: isV ? 'Video to edit' : 'Start image' }),
          drop(isV ? '🎞 Choose a video (max 50 MB)' : '🖼 Choose an image (max 6 MB)', isV ? 'video/*' : 'image/*', f => {
            if (f.size > (isV ? 50 : 6) * 1024 * 1024) return toast('File is too big');
            if (isV) vidFile = f; else imgFile = f; st.textContent = '✔ ' + f.name; }), st,
          h('p', { className: 'u-note', textContent: 'The file is sent through Puter to the model provider. I cannot scan uploaded images or videos for safety here; the provider\'s own filters apply.' })));
      }
      if (v.seconds) { // only when the model really offers a length range
        const d = clampN(S.seconds || v.seconds.default, v.seconds.min, v.seconds.max); S.seconds = d;
        const lab = h('span', { textContent: d + ' s' }), r = h('input', { type: 'range', min: v.seconds.min, max: v.seconds.max, value: d, on: { input: () => { S.seconds = +r.value; lab.textContent = r.value + ' s'; save(); } } });
        sec.append(Uni.field('Length', h('div', { css: 'display:flex;gap:8px;align-items:center;flex:1' }, r, lab)));
      }
      if (v.sizes && v.sizes.length) { if (!v.sizes.includes(S.size)) S.size = v.sizes[0]; sec.append(Uni.field('Resolution', Uni.select(v.sizes, S.size, x => { S.size = x; save(); }))); }
      if (v.ratios && v.ratios.length) { if (S.ratio && !v.ratios.includes(S.ratio)) S.ratio = ''; sec.append(Uni.field('Shape', Uni.select([['', 'Auto']].concat(v.ratios.map(r => [r, r])), S.ratio, x => { S.ratio = x; save(); })), h('p', { className: 'u-note', textContent: 'Shape is passed to the model as a prompt hint; this provider has no separate ratio switch, so it is not guaranteed.' })); }
      let neg = null; if (v.negativePrompt) { neg = h('input', { type: 'text', maxLength: 200, placeholder: 'Avoid: blur, text, watermark...' }); sec.append(Uni.field('Avoid', neg)); }
      let aud = null; if (v.audio === 'optional') { aud = h('input', { type: 'checkbox', checked: !!S.audio, onchange: () => { S.audio = aud.checked; save(); } }); sec.append(Uni.field('Sound', h('label', { css: 'display:flex;gap:6px;align-items:center' }, aud, 'Generate audio'))); }
      else if (v.audio === 'always') sec.append(h('p', { className: 'u-note', textContent: 'This model decides the sound itself (it cannot be switched).' }));
      const tm = h('input', { type: 'checkbox', checked: !!S.test, onchange: () => { S.test = tm.checked; save(); } });
      sec.append(Uni.field('Test mode', h('label', { css: 'display:flex;gap:6px;align-items:center' }, tm, 'Free sample clip (not your prompt)')));
      body.append(sec, h('div', { className: 'u-sec' }, h('h4', { textContent: S.mode === 'edit' ? 'Change' : 'Prompt' }), prompt,
        h('p', { className: 'u-note', textContent: 'Real generation uses your Puter credits. Turn on Test mode to try the screen for free.' })));
      const btn = h('button', { className: 'pb', textContent: '🎬 Generate' });
      const run = () => Uni.task('videos', gm, btn, out, async () => {
        const p = prompt.value.trim(); if (p.length < 3) throw new Error('Please write what you want.');
        if (S.mode === 'i2v' && !imgFile && !S.test) throw new Error('Choose a start image first.');
        if (S.mode === 'edit' && !vidFile && !S.test) throw new Error('Choose the video to edit first.');
        const ph = Uni.progress('Making your video with ' + gm.name + '. This can take a few minutes...'); out.prepend(ph);
        const full = p + (S.ratio ? ', ' + S.ratio + ' composition' : '');
        const res = await Adapters[gm.provider].video(gm, full, { seconds: S.seconds, size: S.size, negative: neg && neg.value.trim(), audio: aud && aud.checked, image: S.mode === 'i2v' ? imgFile : null, video: S.mode === 'edit' ? vidFile : null, test: S.test });
        ph.replaceWith(vidCard(res, gm.name + (S.test ? ' · TEST SAMPLE' : '') + (S.seconds ? ' · ' + S.seconds + ' s' : '') + (S.size ? ' · ' + S.size : ''), run));
      }).finally(() => { out.querySelectorAll('.u-res .ldw').forEach(x => x.closest('.u-res').remove()); });
      btn.onclick = run; body.append(btn);
    };

    const drawAnalyze = () => {
      body.append(ana.node);
      const m = ana.get(), st = h('div', { className: 'u-note', textContent: vidFile ? '✔ ' + vidFile.name + ' (' + Uni.sizeTxt(vidFile.size) + ')' : 'No video chosen yet' });
      const nf = h('select', null, [4, 6, 8, 12].map(n => h('option', { value: n, textContent: n + ' frames', selected: n === 6 })));
      const q = TA(S.mode === 'summary' ? 'Optional: what should the summary focus on?' : 'What do you want to know about this video?', 3, 500);
      body.append(h('div', { className: 'u-sec' }, h('h4', { textContent: 'Your video' }), drop('🎞 Choose a video (max 80 MB)', 'video/*', f => { if (f.size > 80 * 1024 * 1024) return toast('Video is too big'); vidFile = f; st.textContent = '✔ ' + f.name + ' (' + Uni.sizeTxt(f.size) + ')'; }), st,
        Uni.field('Sample', nf), q,
        h('p', { className: 'u-note', textContent: 'How it works: frames are cut out on your device, each frame is read by Puter\'s image-reading service, then the model you chose writes the answer. Sound and motion between frames are NOT analyzed. Frames are not stored by CUTE-S AI.' })));
      const b1 = h('button', { className: 'pb', textContent: S.mode === 'summary' ? '📝 Summarize' : '🔍 Analyze' });
      b1.onclick = () => Uni.task('videos', m, b1, out, async () => {
        if (!vidFile) throw new Error('Choose a video first.');
        const ph = Uni.progress('Cutting frames...'); out.prepend(ph);
        try {
          const { frames, duration } = await sampleFrames(vidFile, +nf.value);
          if (!frames.length) throw new Error('No frames could be read from this video.');
          const desc = []; let i = 0;
          for (const f of frames) { i++; ph.querySelector('span').textContent = 'Reading frame ' + i + ' of ' + frames.length + '...'; let t = ''; try { t = await imgText(new File([f.blob], 'frame.jpg', { type: 'image/jpeg' })); } catch (e) { t = '(this frame could not be read)'; } desc.push('[' + mmss(f.t) + '] ' + String(t).slice(0, 900)); }
          ph.querySelector('span').textContent = 'Writing the answer with ' + m.name + '...';
          const sys = 'You analyse a video that you can only know through ' + frames.length + ' sampled frames (given as text descriptions with timestamps). There is NO audio and NO motion information. Say clearly what you can and cannot know. Never invent scenes, speech or details that are not in the descriptions. Reply in the language of the user.';
          const user = (S.mode === 'summary' ? 'Summarize this video (video length ' + mmss(duration) + ').' : 'Question: ' + (q.value.trim() || 'Describe and analyze this video.')) + (S.mode === 'summary' && q.value.trim() ? ' Focus: ' + q.value.trim() : '') + '\n\nFRAMES:\n' + desc.join('\n');
          const ans = await Uni.chat(m, sys, user);
          const box = Uni.mdBox(ans);
          box.append(Uni.btns(['⬇ Download frames (ZIP)', async () => { const files = []; for (let k = 0; k < frames.length; k++) files.push({ name: 'frame-' + (k + 1) + '-' + mmss(frames[k].t).replace(':', 'm') + 's.jpg', data: new Uint8Array(await frames[k].blob.arrayBuffer()) }); download(ofZipSafe(files), 'frames.zip'); }],
            ['⬇ Save answer (.md)', () => download(new Blob([ans], { type: 'text/markdown;charset=utf-8' }), 'video-' + S.mode + '.md')]));
          ph.replaceWith(h('div', { className: 'u-res' }, h('div', { className: 'u-meta', textContent: m.name + ' · ' + frames.length + ' frames · ' + mmss(duration) }), box));
        } finally { if (ph.isConnected) ph.remove(); }
      });
      body.append(b1);
    };
    gen.onchange(draw);
    Uni.set(Uni.top('AI Videos', 'videos'), h('p', { className: 'u-note', textContent: 'Only what the selected model really supports is shown.' }), body, out); draw();
  };

  /* ---------- automatic mode: video ---------- */
  const VID = /\b(?:make|create|generate|produce|render)\b[^.?!]{0,40}\b(?:video|clip|animation)\b|\bvideo\s+(?:ban[ao]+|bna\w*)\b/i;
  const VIDX = /\b(?:script|idea|ideas|title|caption|description|plan|outline|essay|tips|editing|thumbnail|storyboard|course|tutorial)\b/i;
  Uni.autoVideo = async function (q) {
    const m = Registry.pick('videos', 'text-to-video');
    if (!m || !m.video) return false;                      // not available here: the normal chat answers instead
    if (busy) { toast('Please wait...'); return true; }
    const v = m.video, t = q.toLowerCase();
    const sm = t.match(/\b(\d{1,2})\s*(?:s|sec|secs|seconds?)\b/);
    const secs = v.seconds ? clampN(sm ? sm[1] : v.seconds.default, v.seconds.min, v.seconds.max) : 0;
    const size = v.sizes ? ((/\b4k\b/.test(t) && v.sizes.find(x => /4k/i.test(x))) || (/\b(?:1080p|full hd)\b/.test(t) && v.sizes.find(x => /1080/i.test(x))) || v.sizes[0]) : '';
    const ratio = /\b(?:reel|reels|tiktok|story|vertical|shorts|9\s*:\s*16)\b/.test(t) ? '9:16' : /\b(?:youtube|landscape|widescreen|16\s*:\s*9)\b/.test(t) ? '16:9' : '';
    const prompt = q.replace(/\s+/g, ' ').trim().slice(0, 800) + (ratio && v.ratios && v.ratios.includes(ratio) ? ', ' + ratio + ' composition' : '');
    busy = true; $('send').disabled = true;
    try {
      if (!await puterReady()) return true;
      if (!hist.length) M.innerHTML = '';
      bub('user', q, q); hist.push({ role: 'user', content: q, shown: q });
      const b = bub('assistant', ''); pet('think'); b.innerHTML = '';
      const q2 = $('q'); q2.value = ''; q2.style.height = 'auto';
      const ph = Uni.progress('Making your video with ' + m.name + '. This can take a few minutes...'); b.append(ph);
      try {
        const res = await Adapters[m.provider].video(m, prompt, { seconds: secs, size });
        ph.replaceWith(vidCard(res, m.name + (secs ? ' · ' + secs + ' s' : '') + (size ? ' · ' + size : '')));
        hist.push({ role: 'assistant', content: '🎬 Video created: ' + q.slice(0, 200) }); pet('happy', 3000); saveChat(); Usage.log('videos', m.id, true);
        Uni.autoNote('🤖 Auto mode · AI Videos · text-to-video · ' + m.name + (secs ? ' · ' + secs + ' s' : '') + (size ? ' · ' + size : '') + ' · open C-Univers-AI to choose these yourself');
      } catch (e) { ph.remove(); b.textContent = ((e && e.message) || 'Could not create the video.').slice(0, 320); hist.pop(); pet('sad', 3000); if (!(e && e.safety)) Usage.log('videos', m.id, false, e && e.code); }
    } finally { busy = false; $('send').disabled = false; M.scrollTop = M.scrollHeight; }
    return true;
  };
  Uni.hooks.push(async q => (VID.test(q) && !VIDX.test(q) && !(typeof attach !== 'undefined' && attach)) ? Uni.autoVideo(q) : false);

  /* =====================================================================
     AI CODING
     ===================================================================== */
  const LANGS = [['html', 'HTML / CSS / JavaScript'], ['python', 'Python'], ['java', 'Java'], ['sql', 'SQL'], ['other', 'Other']];
  const CODE_TASKS = [['gen', 'Generate'], ['explain', 'Explain'], ['debug', 'Debug'], ['opt', 'Optimize'], ['review', 'Review'], ['project', 'Project (ZIP)']];
  const CODE_SYS = 'You are a careful senior software engineer helping a student. Write correct, readable, safe code with short comments. Never write malware, credential stealers, exploits, or code that attacks or spies on others. Put code in fenced blocks with the language name. Reply in the language of the user.';
  const TASK_PROMPT = {
    gen: (l, r) => 'Write ' + l + ' code for this request. Give the code first in one fenced block, then a short explanation.\n\nRequest:\n' + r,
    explain: (l, r, c) => 'Explain this ' + l + ' code step by step for a student. Mention what it does, how it works and any problem you notice.\n\n' + (r ? 'Focus: ' + r + '\n\n' : '') + '```\n' + c + '\n```',
    debug: (l, r, c) => 'Find the bugs in this ' + l + ' code. For each bug: what is wrong, why, and the fix. Then give the full corrected code in one fenced block.\n\n' + (r ? 'Problem / error message: ' + r + '\n\n' : '') + '```\n' + c + '\n```',
    opt: (l, r, c) => 'Optimize this ' + l + ' code for speed, memory and readability without changing what it does. Explain each change briefly and give the full optimized code in one fenced block.\n\n' + (r ? 'Goal: ' + r + '\n\n' : '') + '```\n' + c + '\n```',
    review: (l, r, c) => 'Do a code review of this ' + l + ' code: correctness, security, readability, edge cases and style. Use short bullet points ordered by importance, then list the 3 best improvements.\n\n' + (r ? 'Context: ' + r + '\n\n' : '') + '```\n' + c + '\n```',
    project: (l, r) => 'Create a small complete ' + l + ' project for this request. Output EVERY file in exactly this format and nothing else outside it:\n=== FILE: path/name.ext ===\n(file content)\n=== END FILE ===\nUse at most 12 files, relative paths only, no binary files. Include a README.md with run steps.\n\nRequest:\n' + r
  };
  const guessLang = c => /^\s*<(?:!doctype|html|head|body|div|h1|p|style|script|canvas|button|svg)/i.test(c) ? 'html'
    : /^\s*(?:def |import |from \w+ import |print\(|class \w+[:(]|for \w+ in |if __name__)/m.test(c) ? 'python'
    : /(?:console\.log|document\.|=>|\bconst |\blet |\bfunction\b)/.test(c) ? 'js' : '';
  const blocksOf = t => { const a = []; String(t).replace(/```(\w*)\n?([\s\S]*?)```/g, (m, l, c) => { a.push({ lang: (l || '').toLowerCase(), code: c.replace(/\n$/, '') }); return m; }); return a; };

  /* ----- sandboxes ----- */
  const CSP = "default-src 'none'; img-src data: blob:; media-src data: blob:; font-src data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'";
  const BOOT = '<script>(function(){var P=function(t,a){try{parent.postMessage({uniRun:1,t:t,m:Array.prototype.map.call(a,function(x){try{return typeof x==="object"?JSON.stringify(x):String(x)}catch(e){return String(x)}}).join(" ")},"*")}catch(e){}};["log","info","warn","error"].forEach(function(k){console[k]=function(){P(k,arguments)}});addEventListener("error",function(e){P("error",[e.message])});addEventListener("unhandledrejection",function(e){P("error",[String(e.reason)])})})()<\/script>';
  function sandboxHtml(code, isJs) {
    const meta = '<meta http-equiv="Content-Security-Policy" content="' + CSP + '">';
    const body = isJs ? '<!DOCTYPE html><html><body><script>' + String(code).replace(/<\/script/gi, '<\\/script') + '<\/script></body></html>' : String(code);
    return meta + BOOT + body;
  }
  let msgHandler = null;
  function runWeb(code, isJs, host) {
    host.innerHTML = '';
    const log = h('pre', { className: 'u-log', textContent: '' }), fr = h('iframe', { className: 'u-sbx', title: 'Safe preview' });
    fr.sandbox = 'allow-scripts';                     // no same-origin, no forms, no popups, no top navigation
    if (msgHandler) removeEventListener('message', msgHandler);
    msgHandler = e => { if (e.source !== fr.contentWindow || !e.data || !e.data.uniRun) return; log.textContent += (e.data.t === 'error' ? '⚠ ' : '') + String(e.data.m).slice(0, 500) + '\n'; if (log.textContent.length > 20000) log.textContent = log.textContent.slice(-20000); };
    addEventListener('message', msgHandler);
    host.append(h('div', { className: 'u-ok', textContent: '🔒 Running in a locked box: no network, no access to your account or this page.' }), fr, log,
      Uni.btns(['■ Stop', () => { fr.remove(); host.append(h('div', { className: 'u-note', textContent: 'Stopped.' })); }]));
    fr.srcdoc = sandboxHtml(code, isJs);
  }
  const PYB = 'https://cdn.jsdelivr.net/pyodide/v0.26.4/full/';
  function runPy(code, host) {
    host.innerHTML = '';
    const log = h('pre', { className: 'u-log', textContent: 'Starting Python (the first run downloads about 10 MB)...\n' });
    host.append(h('div', { className: 'u-ok', textContent: '🔒 Python runs inside your browser in a locked worker: standard library only, network blocked, 15 second limit.' }), log);
    const src = 'importScripts("' + PYB + 'pyodide.js");let py;onmessage=async e=>{try{if(!py){py=await loadPyodide({indexURL:"' + PYB + '"});self.fetch=function(){return Promise.reject(new Error("Network is blocked in the sandbox"))};self.XMLHttpRequest=undefined;self.WebSocket=undefined;}' +
      'py.setStdout({batched:function(s){postMessage({o:s})}});py.setStderr({batched:function(s){postMessage({o:s})}});await py.runPythonAsync(e.data);postMessage({done:1})}catch(x){postMessage({err:String((x&&x.message)||x).split("\\n").slice(-6).join("\\n")})}};';
    let w; try { w = new Worker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' }))); } catch (e) { log.textContent = 'This browser cannot start the Python sandbox.'; return; }
    let first = true; const end = msg => { clearTimeout(tm); w.terminate(); if (msg) log.textContent += msg + '\n'; };
    const tm = setTimeout(() => end('⏱ Stopped after 15 seconds.'), 60000);        // the first start may need the download
    let lim = null;
    w.onmessage = e => { const d = e.data || {}; if (first) { first = false; log.textContent = ''; clearTimeout(tm); lim = setTimeout(() => end('⏱ Stopped after 15 seconds.'), 15000); }
      if (d.o != null) { log.textContent += d.o + '\n'; if (log.textContent.length > 20000) log.textContent = log.textContent.slice(-20000); }
      if (d.err) { clearTimeout(lim); end('⚠ ' + d.err); } if (d.done) { clearTimeout(lim); end('✔ Finished.'); } };
    w.onerror = () => { clearTimeout(lim); end('⚠ The Python engine could not load. Check your internet and try again.'); };
    host.append(Uni.btns(['■ Stop', () => { clearTimeout(lim); end('Stopped.'); }]));
    w.postMessage(code);
  }
  Uni.runCode = function (lang, code, host) {
    if (lang === 'python' || lang === 'py') return runPy(code, host);
    if (lang === 'html' || lang === 'css') return runWeb(code, false, host);
    if (lang === 'js' || lang === 'javascript') return runWeb(code, true, host);
    host.innerHTML = ''; host.append(h('div', { className: 'u-warn', textContent: (lang || 'This language') + ' cannot be run here. Only HTML, JavaScript and Python run safely in your browser. Nothing is executed on a server.' }));
  };

  function parseProject(text) {
    const files = []; let total = 0;
    String(text).replace(/=== FILE: ([^\n=]+?) ===\n([\s\S]*?)\n=== END FILE ===/g, (m, p, c) => {
      p = p.trim().replace(/\\/g, '/');
      if (!p || p.startsWith('/') || p.split('/').some(x => x === '..' || x === '') || /[\u0000-\u001f]/.test(p) || p.length > 120) return m;
      if (files.length >= 40 || c.length > 200000 || total + c.length > 2000000) return m;
      total += c.length; files.push({ name: p, data: c }); return m;
    });
    return files;
  }
  function codeResult(ans, lang, task) {
    const wrap = h('div', { className: 'u-res' }), runHost = h('div');
    if (task === 'project') {
      const files = parseProject(ans);
      if (files.length) {
        wrap.append(h('div', { className: 'u-meta', textContent: files.length + ' files' }), Uni.mdBox('**Files:**\n' + files.map(f => '- ' + f.name).join('\n')),
          Uni.btns(['⬇ Download ZIP', () => download(ofZipSafe(files), 'project.zip')], ['👁 View README', () => { const r = files.find(f => /readme/i.test(f.name)); toast(r ? 'Shown below' : 'No README'); if (r) wrap.append(Uni.mdBox(r.data)); }]));
        wrap.append(h('div', { className: 'u-note', textContent: 'Review the code before you run it on your own computer.' }));
        return wrap;
      }
    }
    wrap.append(Uni.mdBox(ans));
    const bl = blocksOf(ans).filter(b => b.code.trim());
    bl.slice(0, 4).forEach((b, i) => {
      const L = b.lang || guessLang(b.code) || lang, runnable = ['html', 'css', 'js', 'javascript', 'python', 'py'].includes(L);
      wrap.append(Uni.btns(['📋 Copy code ' + (bl.length > 1 ? (i + 1) : ''), () => { navigator.clipboard && navigator.clipboard.writeText(b.code).then(() => toast('Copied')); }], runnable ? ['▶ Run safely ' + (bl.length > 1 ? (i + 1) : ''), () => Uni.runCode(L, b.code, runHost)] : null));
    });
    wrap.append(runHost); return wrap;
  }

  Uni.panels.coding = function () {
    const S = Object.assign({ task: 'gen', lang: 'html' }, ls.get('cs_uni_code', {})), save = () => ls.set('cs_uni_code', S);
    const mp = Uni.modelPicker('coding'), out = h('div', { className: 'u-out' });
    const req = TA('', 4, 3000), code = TA('Paste your code here...', 8, 20000); code.style.fontFamily = 'ui-monospace,Menlo,monospace'; code.style.fontSize = '12.5px';
    const codeBox = h('div', { className: 'u-sec' }, h('h4', { textContent: 'Your code' }), code);
    const sync = () => {
      const t = S.task; codeBox.hidden = !(t === 'explain' || t === 'debug' || t === 'opt' || t === 'review');
      req.placeholder = t === 'gen' ? 'What should the code do?' : t === 'project' ? 'Describe the project (e.g. "to-do app with HTML, CSS and JavaScript")' : t === 'debug' ? 'Error message or what goes wrong (optional)' : 'Extra context (optional)';
    };
    const btn = h('button', { className: 'pb', textContent: '⚡ Run task' });
    btn.onclick = () => { const m = mp.get(); Uni.task('coding', m, btn, out, async () => {
      const L = (LANGS.find(x => x[0] === S.lang) || [])[1] || S.lang, t = S.task, r = req.value.trim(), c = code.value;
      if ((t === 'gen' || t === 'project') && r.length < 3) throw new Error('Please describe what you want.');
      if (!codeBox.hidden && c.trim().length < 3) throw new Error('Please paste your code.');
      const ph = Uni.progress('Working with ' + m.name + '...'); out.prepend(ph);
      let live = null;
      try { const ans = await Uni.chat(m, CODE_SYS, TASK_PROMPT[t](L, r, c), txt => { if (!live) { live = h('div', { className: 'u-res' }); ph.replaceWith(live); } live.innerHTML = ''; live.append(h('pre', { css: 'white-space:pre-wrap;font-size:12.5px', textContent: txt.slice(-3000) })); });
        const res = codeResult(ans, S.lang, t); (live || ph).replaceWith(res); }
      catch (e) { (live || ph).remove(); throw e; }
    }); };
    Uni.set(Uni.top('AI Coding', 'coding'), mp.node,
      h('div', { className: 'u-sec' }, h('h4', { textContent: 'Task' }), h('div', { className: 'u-seg' }, Uni.chips(CODE_TASKS, S.task, v => { S.task = v; save(); sync(); })),
        Uni.field('Language', Uni.select(LANGS, S.lang, v => { S.lang = v; save(); })), req,
        h('p', { className: 'u-note', textContent: 'Run safely: HTML, JavaScript (locked box) and Python (locked worker). Java and SQL are written and reviewed but not run. Code never runs on a server.' })),
      codeBox, btn, out); sync();
  };

  /* chat: add "Run safely" buttons under code blocks the AI writes (browser sandbox only) */
  try {
    const mo = new MutationObserver(() => {
      M.querySelectorAll('.m.a .b pre:not([data-uni])').forEach(pre => {
        const c = pre.textContent || ''; if (c.trim().length < 12) return; pre.setAttribute('data-uni', '1');
        const L = guessLang(c); if (!L) return;
        const host = h('div'), bar = Uni.btns([L === 'python' ? '▶ Run safely (Python)' : '▶ Run safely', () => Uni.runCode(L, pre.textContent, host)]);
        pre.after(bar, host);
      });
    });
    mo.observe(M, { childList: true, subtree: true });
  } catch (e) { /* chat container not ready: manual coding mode still works */ }

  /* =====================================================================
     AI RESEARCH
     ===================================================================== */
  const R_TASKS = [['research', 'Research'], ['deep', 'Deep research'], ['compare', 'Compare sources'], ['fact', 'Fact check'], ['report', 'Report']];
  async function gatherSources(q, deep, model) {
    let qs = [q];
    if (deep) { try { const j = await Uni.chat(model, 'Return ONLY a JSON array of 3 short, different Wikipedia search queries that would help answer the question. No other text.', q); const a = JSON.parse((j.match(/\[[\s\S]*\]/) || ['[]'])[0]); qs = qs.concat(a.filter(x => typeof x === 'string' && x.length < 100).slice(0, 3)); } catch (e) { /* plain search only */ } }
    const seen = new Map();
    for (const s of qs) { try { (await wiki(s, deep ? 4 : 5)).forEach(x => { if (x.url && /^https:\/\/[a-z-]+\.wikipedia\.org\//.test(x.url) && !seen.has(x.url) && x.text) seen.set(x.url, x); }); } catch (e) { /* offline: no sources */ } }
    return [...seen.values()].slice(0, deep ? 10 : 6);
  }
  function researchPrompt(task, q, srcs, doc) {
    const S = srcs.map((s, i) => '[' + (i + 1) + '] ' + s.title + ' (' + s.url + ')\n' + String(s.text).slice(0, 1200)).join('\n\n');
    const sys = 'You are a careful research assistant. RULES: (1) Every factual claim must end with a citation like [1] that points to the numbered SOURCES' + (doc ? ' or [D] for the DOCUMENT' : '') + '. (2) Use ONLY the sources' + (doc ? ' and the document' : '') + ' for facts. (3) Never invent sources, links, quotes, numbers or studies. (4) Anything the sources do not cover goes under "Uncertain / not verified" and must be clearly marked as not verified. (5) If sources disagree, say so. ' +
      (srcs.length || doc ? '' : 'NO SOURCES were found: say this first, then answer briefly from general knowledge and mark EVERYTHING as unverified. ') + 'Reply in the language of the user. Use these headings: "## Answer", "## ✅ Supported by sources", "## ⚠️ Uncertain / not verified", "## Conclusion".';
    const ask = { research: 'Research this question.', deep: 'Do a thorough, structured research of this question.', compare: 'Compare what the different sources say about this. Include a table: claim | source | agreement or conflict.', fact: 'Fact-check this statement. Give a verdict: Supported, Contradicted, or Not enough evidence, then the evidence for each part.', report: 'Write a clear research report with: title, summary, key findings, limitations.' }[task];
    return [sys, ask + '\n\nQUESTION:\n' + q + (doc ? '\n\nDOCUMENT [D]:\n' + doc.slice(0, 18000) : '') + '\n\nSOURCES:\n' + (S || '(none found)')];
  }
  function sourceList(srcs) {
    const box = h('div', { className: 'u-sec' }, h('h4', { textContent: 'Sources (' + srcs.length + ')' }));
    if (!srcs.length) box.append(h('div', { className: 'u-warn', textContent: 'No source was found. The answer above is NOT verified.' }));
    srcs.forEach((s, i) => box.append(h('div', { className: 'u-note' }, h('span', { className: 'u-cite', textContent: '[' + (i + 1) + ']' }), h('a', { href: s.url, target: '_blank', rel: 'noopener noreferrer', textContent: s.title, css: 'color:var(--hi)' }), ' · Wikipedia')));
    box.append(h('p', { className: 'u-note', textContent: 'Live search covers Wikipedia only. Wikipedia can be incomplete or wrong, so check important facts in a second source.' }));
    return box;
  }
  const reportBlobs = (ans, srcs, title) => {
    const list = srcs.map((s, i) => '[' + (i + 1) + '] ' + s.title + ' - ' + s.url).join('\n');
    const mdText = ans + '\n\n## Sources\n' + (list || 'No source was found. Everything above is unverified.') + '\n';
    const html = '<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' + esc(title) + '</title><style>body{font-family:system-ui,sans-serif;max-width:760px;margin:24px auto;padding:0 16px;line-height:1.6}</style></head><body>' + (typeof md === 'function' ? md(ans) : '<pre>' + esc(ans) + '</pre>') + '<h2>Sources</h2><ol>' + srcs.map(s => '<li><a href="' + esc(s.url) + '">' + esc(s.title) + '</a></li>').join('') + '</ol></body></html>';
    return { md: new Blob([mdText], { type: 'text/markdown;charset=utf-8' }), html: new Blob([html], { type: 'text/html;charset=utf-8' }) };
  };
  async function doResearch(model, task, q, docText, onStage) {
    const deep = task === 'deep'; onStage && onStage('Searching Wikipedia...');
    const srcs = await gatherSources(q, deep, model);
    onStage && onStage('Writing with ' + model.name + ' (' + srcs.length + ' sources)...');
    const [sys, user] = researchPrompt(task, q, srcs, docText);
    const ans = await Uni.chat(model, sys, user);
    return { ans, srcs };
  }

  Uni.panels.research = function () {
    const S = Object.assign({ task: 'research', web: true }, ls.get('cs_uni_res', {})), save = () => ls.set('cs_uni_res', S);
    const mp = Uni.modelPicker('research'), out = h('div', { className: 'u-out' }); let doc = null;
    const q = TA('Your question, topic or the statement to fact-check...', 4, 1500);
    const st = h('div', { className: 'u-note', textContent: 'No document attached' });
    const web = h('input', { type: 'checkbox', checked: !!S.web, onchange: () => { S.web = web.checked; save(); } });
    const btn = h('button', { className: 'pb', textContent: '🔎 Research' });
    btn.onclick = () => { const m = mp.get(); Uni.task('research', m, btn, out, async () => {
      const text = q.value.trim(); if (text.length < 3) throw new Error('Please write your question.');
      const ph = Uni.progress('Starting...'); out.prepend(ph);
      try {
        const r = await (async () => { if (S.web) return doResearch(m, S.task, text, doc && doc.text, t => { ph.querySelector('span').textContent = t; });
          const [sys, user] = researchPrompt(S.task, text, [], doc && doc.text); return { ans: await Uni.chat(m, sys, user), srcs: [] }; })();
        const bl = reportBlobs(r.ans, r.srcs, text.slice(0, 60)), card = h('div', { className: 'u-res' }, h('div', { className: 'u-meta', textContent: m.name + ' · ' + (S.web ? r.srcs.length + ' Wikipedia sources' : 'no live search') + (doc ? ' · + your document' : '') }), Uni.mdBox(r.ans), sourceList(r.srcs),
          Uni.btns(['⬇ Report (.md)', () => download(bl.md, 'research.md')], ['⬇ Report (.html)', () => download(bl.html, 'research.html')]));
        ph.replaceWith(card);
      } catch (e) { ph.remove(); throw e; }
    }); };
    Uni.set(Uni.top('AI Research', 'research'), mp.node,
      h('div', { className: 'u-sec' }, h('h4', { textContent: 'Task' }), h('div', { className: 'u-seg' }, Uni.chips(R_TASKS, S.task, v => { S.task = v; save(); })), q,
        Uni.field('Sources', h('label', { css: 'display:flex;gap:6px;align-items:center' }, web, 'Search Wikipedia (sends your question words to Wikipedia)')),
        drop('📎 Add a document to research (optional)', '.pdf,.docx,.pptx,.txt,.md,.rtf,.csv,.xlsx,.html', async f => { st.textContent = 'Reading...'; try { doc = await Uni.readUpload(f); st.textContent = '✔ ' + doc.name; } catch (e) { doc = null; st.textContent = '⚠ ' + (e.message || e); } }), st,
        h('p', { className: 'u-note', textContent: 'Green [n] = backed by a numbered source. Anything under "Uncertain / not verified" is NOT confirmed. This is not full web search: only Wikipedia (and your document) are used as evidence.' })),
      btn, out);
  };

  /* ---------- automatic mode: research ---------- */
  const RES = /\b(?:deep research|research report|do (?:some |a )?research|fact[- ]?check|compare (?:the )?sources|research (?:about|on))\b/i;
  Uni.autoResearch = async function (q) {
    const m = Registry.pick('research'); if (!m) return false;
    if (busy) { toast('Please wait...'); return true; }
    const t = q.toLowerCase(), task = /fact[- ]?check/.test(t) ? 'fact' : /compare (?:the )?sources/.test(t) ? 'compare' : /deep research|comprehensive|detailed/.test(t) ? 'deep' : /report/.test(t) ? 'report' : 'research';
    busy = true; $('send').disabled = true;
    try {
      if (!await puterReady()) return true;
      if (!hist.length) M.innerHTML = '';
      bub('user', q, q); hist.push({ role: 'user', content: q, shown: q });
      const b = bub('assistant', ''); pet('think'); b.innerHTML = '';
      const q2 = $('q'); q2.value = ''; q2.style.height = 'auto';
      const ph = Uni.progress('Researching...'); b.append(ph);
      try {
        const r = await doResearch(m, task, q.replace(/^\s*(?:please\s+)?(?:do (?:some |a )?research (?:on|about)|research (?:on|about))\s*/i, '').slice(0, 1500) || q, null, x => { ph.querySelector('span').textContent = x; });
        ph.remove(); b.append(Uni.mdBox(r.ans), sourceList(r.srcs));
        hist.push({ role: 'assistant', content: r.ans.slice(0, 6000) + '\n\nSources:\n' + r.srcs.map((s, i) => '[' + (i + 1) + '] ' + s.title + ' ' + s.url).join('\n') }); pet('happy', 3000); saveChat(); Usage.log('research', m.id, true);
        Uni.autoNote('🤖 Auto mode · AI Research · ' + (R_TASKS.find(x => x[0] === task) || [])[1] + ' · ' + m.name + ' · ' + r.srcs.length + ' sources · open C-Univers-AI to choose these yourself');
      } catch (e) { ph.remove(); b.textContent = ((e && e.message) || 'Research failed.').slice(0, 320); hist.pop(); pet('sad', 3000); if (!(e && e.safety)) Usage.log('research', m.id, false, e && e.code); }
    } finally { busy = false; $('send').disabled = false; M.scrollTop = M.scrollHeight; }
    return true;
  };
  Uni.hooks.push(async q => (RES.test(q) && !(typeof attach !== 'undefined' && attach)) ? Uni.autoResearch(q) : false);
})();
