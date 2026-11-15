/* =====================================================================
   CUTE-S AI - AI Files (univers-files.js)
   Architecture: AI models write and understand CONTENT. Separate document
   engines (office.js, SheetJS, the converters below) build and convert the
   FILES. PDF/Word/Excel/PowerPoint are never treated as AI models.
   ===================================================================== */
(function () {
  const { h, $, ls } = Uni;

  /* ---------- formats ---------- */
  const FMT = {
    pdf: { l: 'PDF', g: 'Documents', e: 'pdf', k: 'doc' }, docx: { l: 'DOCX (Word)', g: 'Documents', e: 'docx', k: 'doc' }, txt: { l: 'TXT', g: 'Documents', e: 'txt', k: 'doc' },
    rtf: { l: 'RTF', g: 'Documents', e: 'rtf', k: 'doc' }, html: { l: 'HTML', g: 'Documents', e: 'html', k: 'doc' }, md: { l: 'Markdown', g: 'Documents', e: 'md', k: 'doc' },
    xlsx: { l: 'XLSX (Excel)', g: 'Spreadsheets', e: 'xlsx', k: 'sheet' }, csv: { l: 'CSV', g: 'Spreadsheets', e: 'csv', k: 'sheet' }, ods: { l: 'ODS', g: 'Spreadsheets', e: 'ods', k: 'sheet' },
    pptx: { l: 'PPTX (PowerPoint)', g: 'Presentations', e: 'pptx', k: 'slides' }, odp: { l: 'ODP', g: 'Presentations', e: 'odp', k: 'slides' },
    json: { l: 'JSON', g: 'Additional', e: 'json', k: 'raw' }, xml: { l: 'XML', g: 'Additional', e: 'xml', k: 'raw' }, zip: { l: 'ZIP (project)', g: 'Additional', e: 'zip', k: 'zip' }
  };
  const MIME = { pdf: 'application/pdf', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', txt: 'text/plain;charset=utf-8', rtf: 'application/rtf', html: 'text/html;charset=utf-8', md: 'text/markdown;charset=utf-8',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', csv: 'text/csv;charset=utf-8', ods: 'application/vnd.oasis.opendocument.spreadsheet', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    odp: 'application/vnd.oasis.opendocument.presentation', json: 'application/json', xml: 'application/xml', zip: 'application/zip' };

  /* ---------- engines: converters that need no AI ---------- */
  const X = s => String(s == null ? '' : s).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const plain = md => String(md).replace(/```[\w]*\n?/g, '').replace(/\*\*|__|`/g, '').replace(/^\s*#{1,6}\s+/gm, '').replace(/\[([^\]]+)\]\(([^)]*)\)/g, '$1 ($2)');

  /* Markdown -> RTF (headings, bold/italic, bullets, Unicode-safe) */
  function rtfEsc(s) {
    let o = '';
    for (const ch of String(s)) {
      const c = ch.codePointAt(0);
      if (ch === '\\' || ch === '{' || ch === '}') o += '\\' + ch;
      else if (c < 128) o += ch;
      else if (c > 0xFFFF) { const v = c - 0x10000; for (const u of [0xD800 + (v >> 10), 0xDC00 + (v & 1023)]) o += '\\u' + (u > 32767 ? u - 65536 : u) + '?'; }
      else o += '\\u' + (c > 32767 ? c - 65536 : c) + '?';
    }
    return o;
  }
  function mdToRtf(md) {
    const inl = s => rtfEsc(s.replace(/\[([^\]]+)\]\(([^)]*)\)/g, '$1 ($2)').replace(/`/g, '')).replace(/\*\*([^*]+)\*\*/g, '{\\b $1}').replace(/(^|[^*])\*([^*]+)\*/g, '$1{\\i $2}');
    let b = '', first = true;
    for (let line of String(md).replace(/```[\w]*\n?/g, '').split('\n')) {
      let m;
      if ((m = line.match(/^\s*(#{1,6})\s+(.*)/))) { const sz = [0, 40, 32, 28, 26, 24, 24][m[1].length]; b += '{\\pard\\sa160\\sb' + (first ? 0 : 200) + '\\b\\fs' + sz + ' ' + inl(m[2]) + '\\par}\n'; first = false; }
      else if ((m = line.match(/^\s*[-*•]\s+(.*)/))) b += '{\\pard\\fi-300\\li600\\sa80 \\bullet\\tab ' + inl(m[1]) + '\\par}\n';
      else if ((m = line.match(/^\s*(\d+)[.)]\s+(.*)/))) b += '{\\pard\\fi-300\\li600\\sa80 ' + m[1] + '.\\tab ' + inl(m[2]) + '\\par}\n';
      else if (line.trim()) b += '{\\pard\\sa120 ' + inl(line) + '\\par}\n';
    }
    return '{\\rtf1\\ansi\\ansicpg1252\\deff0\\uc1{\\fonttbl{\\f0\\fswiss Arial;}}\\f0\\fs24\n' + b + '}';
  }
  const mdToHtml = (md, title) => '<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' + X(title || 'Document') + '</title><style>body{font-family:system-ui,Arial,sans-serif;max-width:760px;margin:24px auto;padding:0 16px;line-height:1.6;color:#1b1b1f}h4{font-size:1.15em;margin:1.2em 0 .3em}table{border-collapse:collapse}td,th{border:1px solid #ccc;padding:6px 10px}pre{background:#f4f4f6;padding:10px;border-radius:8px;overflow:auto}</style></head><body>' + md2(md) + '</body></html>';
  const md2 = t => { try { return md(t); } catch (e) { return '<pre>' + X(t) + '</pre>'; } };

  /* spreadsheets */
  const csvOf = rows => rows.map(r => r.map(c => { c = c == null ? '' : String(c); return /[",\n\r]/.test(c) ? '"' + c.replace(/"/g, '""') + '"' : c; }).join(',')).join('\r\n');
  async function sheetsLib() { if (!window.XLSX) await loadScript(XLS); if (!window.XLSX) throw new Error('The spreadsheet engine could not load. Check your internet.'); return window.XLSX; }
  async function specToOds(spec) {
    const XL = await sheetsLib(), wb = XL.utils.book_new();
    (spec.sheets || []).slice(0, 8).forEach((s, i) => {
      const rows = (s.rows || []).filter(Array.isArray).map(r => r.map(c => c == null ? '' : c));
      const ws = XL.utils.aoa_to_sheet(rows);
      rows.forEach((r, ri) => r.forEach((c, ci) => { if (typeof c === 'string' && /^=/.test(c)) ws[XL.utils.encode_cell({ r: ri, c: ci })] = { t: 'n', f: c.slice(1) }; }));
      XL.utils.book_append_sheet(wb, ws, String(s.name || 'Sheet' + (i + 1)).replace(/[\[\]:*?\/\\]/g, ' ').slice(0, 31) || 'Sheet' + (i + 1));
    });
    return new Blob([XL.write(wb, { bookType: 'ods', type: 'array' })], { type: MIME.ods });
  }
  const sheetPreview = spec => (spec.sheets || []).slice(0, 3).map(s => '### ' + (s.name || 'Sheet') + '\n' + tableMd((s.rows || []).filter(Array.isArray))).join('\n\n');
  const tableMd = rows => { if (!rows.length) return ''; const w = Math.max(...rows.map(r => r.length)), f = r => '| ' + Array.from({ length: w }, (_, i) => String(r[i] == null ? '' : r[i]).replace(/\|/g, '/')).join(' | ') + ' |'; return [f(rows[0]), '|' + ' --- |'.repeat(w), ...rows.slice(1, 40).map(f)].join('\n'); };

  /* presentations: ODP (OpenDocument) built directly, no library needed */
  function specToOdp(spec) {
    const NS = 'xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" xmlns:draw="urn:oasis:names:tc:opendocument:xmlns:drawing:1.0" xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0" xmlns:svg="urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0" xmlns:presentation="urn:oasis:names:tc:opendocument:xmlns:presentation:1.0"';
    const dark = (spec.theme || 'dark') !== 'light', bg = dark ? '#14141c' : '#ffffff', fg = dark ? '#ffffff' : '#1b1b1f', sub = dark ? '#c9c9d4' : '#555566';
    const slides = [{ title: spec.title || 'Presentation', bullets: spec.subtitle ? [spec.subtitle] : [], cover: true }, ...(spec.slides || []).slice(0, 30)];
    const frame = (st, x, y, w, hh, paras) => '<draw:frame draw:style-name="gr1" svg:x="' + x + 'cm" svg:y="' + y + 'cm" svg:width="' + w + 'cm" svg:height="' + hh + 'cm"><draw:text-box>' + paras.map(p => '<text:p text:style-name="' + st + '">' + X(p) + '</text:p>').join('') + '</draw:text-box></draw:frame>';
    const pages = slides.map((s, i) => {
      const bl = (Array.isArray(s.bullets) ? s.bullets : []).map(b => String(b).replace(/\*\*|__|`/g, '').slice(0, 220)).filter(Boolean).slice(0, 8);
      const body = s.cover ? frame('PSub', 2, 8, 24, 4, bl) : frame('PBul', 2, 4.2, 24, 10, bl.map(b => '• ' + b));
      return '<draw:page draw:name="page' + (i + 1) + '" draw:style-name="dp1" draw:master-page-name="Default">' + frame(s.cover ? 'PCov' : 'PTit', 2, s.cover ? 4 : 0.8, 24, s.cover ? 4 : 2.6, [String(s.title || '').replace(/\*\*|__|`/g, '').slice(0, 120)]) + body + '</draw:page>';
    }).join('');
    const content = '<?xml version="1.0" encoding="UTF-8"?>\n<office:document-content ' + NS + ' office:version="1.2"><office:automatic-styles>' +
      '<style:style style:name="dp1" style:family="drawing-page"><style:drawing-page-properties draw:background-size="border" draw:fill="solid" draw:fill-color="' + bg + '"/></style:style>' +
      '<style:style style:name="gr1" style:family="graphic"><style:graphic-properties draw:stroke="none" draw:fill="none" draw:textarea-vertical-align="top" fo:padding-top="0.2cm" fo:padding-left="0.2cm" fo:padding-right="0.2cm"/></style:style>' +
      '<style:style style:name="PCov" style:family="paragraph"><style:paragraph-properties fo:text-align="center"/><style:text-properties fo:font-size="40pt" fo:font-weight="bold" fo:color="' + fg + '"/></style:style>' +
      '<style:style style:name="PSub" style:family="paragraph"><style:paragraph-properties fo:text-align="center"/><style:text-properties fo:font-size="22pt" fo:color="' + sub + '"/></style:style>' +
      '<style:style style:name="PTit" style:family="paragraph"><style:text-properties fo:font-size="30pt" fo:font-weight="bold" fo:color="' + fg + '"/></style:style>' +
      '<style:style style:name="PBul" style:family="paragraph"><style:paragraph-properties fo:margin-bottom="0.35cm"/><style:text-properties fo:font-size="20pt" fo:color="' + fg + '"/></style:style>' +
      '</office:automatic-styles><office:body><office:presentation>' + pages + '</office:presentation></office:body></office:document-content>';
    const styles = '<?xml version="1.0" encoding="UTF-8"?>\n<office:document-styles ' + NS + ' office:version="1.2"><office:automatic-styles><style:page-layout style:name="PM1"><style:page-layout-properties fo:margin-top="0cm" fo:margin-bottom="0cm" fo:margin-left="0cm" fo:margin-right="0cm" fo:page-width="28cm" fo:page-height="15.75cm" style:print-orientation="landscape"/></style:page-layout></office:automatic-styles><office:master-styles><style:master-page style:name="Default" style:page-layout-name="PM1"/></office:master-styles></office:document-styles>';
    const mt = 'application/vnd.oasis.opendocument.presentation';
    const manifest = '<?xml version="1.0" encoding="UTF-8"?>\n<manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0" manifest:version="1.2"><manifest:file-entry manifest:full-path="/" manifest:media-type="' + mt + '"/><manifest:file-entry manifest:full-path="content.xml" manifest:media-type="text/xml"/><manifest:file-entry manifest:full-path="styles.xml" manifest:media-type="text/xml"/></manifest:manifest>';
    return ofZip([{ name: 'mimetype', data: mt }, { name: 'META-INF/manifest.xml', data: manifest }, { name: 'content.xml', data: content }, { name: 'styles.xml', data: styles }], mt);
  }
  const slidesPreview = spec => '## ' + (spec.title || '') + '\n' + (spec.slides || []).map((s, i) => '### ' + (i + 1) + '. ' + (s.title || '') + '\n' + (s.bullets || []).map(b => '- ' + b).join('\n')).join('\n');

  /* reading: pull plain text out of .docx / .pptx / .odt / .odp / .ods (zip + XML) */
  async function inflateRaw(bytes) {
    if (typeof DecompressionStream === 'undefined') throw new Error('This browser cannot open compressed Office files. Update your browser.');
    const ds = new DecompressionStream('deflate-raw'), w = ds.writable.getWriter(); w.write(bytes); w.close();
    return new Uint8Array(await new Response(ds.readable).arrayBuffer());
  }
  async function zipEntries(buf, want) {
    const u = new Uint8Array(buf), dv = new DataView(buf); let e = u.length - 22;
    while (e >= 0 && dv.getUint32(e, true) !== 0x06054b50) e--;
    if (e < 0) throw new Error('This file is not a valid Office/ZIP file.');
    const n = dv.getUint16(e + 10, true); let p = dv.getUint32(e + 16, true); const out = {};
    for (let i = 0; i < n; i++) {
      if (dv.getUint32(p, true) !== 0x02014b50) break;
      const method = dv.getUint16(p + 10, true), csz = dv.getUint32(p + 20, true), nl = dv.getUint16(p + 28, true), el = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true), off = dv.getUint32(p + 42, true);
      const name = new TextDecoder().decode(u.subarray(p + 46, p + 46 + nl)); p += 46 + nl + el + cl;
      if (!want(name)) continue;
      const lnl = dv.getUint16(off + 26, true), lel = dv.getUint16(off + 28, true), data = u.subarray(off + 30 + lnl + lel, off + 30 + lnl + lel + csz);
      out[name] = new TextDecoder().decode(method === 0 ? data : method === 8 ? await inflateRaw(data) : new Uint8Array());
    }
    return out;
  }
  const unx = s => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
  async function officeText(file, ext) {
    const buf = await file.arrayBuffer();
    if (ext === 'docx') { const z = await zipEntries(buf, n => n === 'word/document.xml'); const x = z['word/document.xml'] || ''; return unx(x.replace(/<w:tab\/>/g, '\t').replace(/<\/w:p>/g, '\n').replace(/<w:br[^>]*\/>/g, '\n').replace(/<[^>]+>/g, '')).replace(/\n{3,}/g, '\n\n').trim(); }
    if (ext === 'pptx') { const z = await zipEntries(buf, n => /^ppt\/slides\/slide\d+\.xml$/.test(n)); return Object.keys(z).sort((a, b) => +a.match(/\d+/)[0] - +b.match(/\d+/)[0]).map((k, i) => '## Slide ' + (i + 1) + '\n' + unx(z[k].replace(/<\/a:p>/g, '\n').replace(/<[^>]+>/g, '')).replace(/\n{2,}/g, '\n').trim()).join('\n\n'); }
    const z = await zipEntries(buf, n => n === 'content.xml'); const x = z['content.xml'] || '';
    return unx(x.replace(/<text:tab\/>/g, '\t').replace(/<\/text:(?:p|h)>/g, '\n').replace(/<text:line-break\/>/g, '\n').replace(/<\/draw:page>/g, '\n\n').replace(/<[^>]+>/g, '')).replace(/\n{3,}/g, '\n\n').trim();
  }
  /* RTF: drop whole groups that hold no text (fonts, colours, styles, document info) before reading */
  const rtfDrop = s => { for (const g of ['\\fonttbl', '\\colortbl', '\\stylesheet', '\\info', '\\*\\generator']) { let i; while ((i = s.indexOf('{' + g)) >= 0) { let d = 0, j = i; for (; j < s.length; j++) { if (s[j] === '{') d++; else if (s[j] === '}') { d--; if (!d) break; } } s = s.slice(0, i) + s.slice(j + 1); } } return s; };
  const rtfText = s => rtfDrop(s).replace(/\\par[d]?/g, '\n').replace(/\\u(-?\d+)\??/g, (m, n) => String.fromCharCode(+n < 0 ? +n + 65536 : +n)).replace(/\\'[0-9a-f]{2}/gi, '').replace(/\{\\\*[^{}]*\}/g, '').replace(/\\[a-z]+-?\d* ?/gi, '').replace(/[{}]/g, '').replace(/\n{3,}/g, '\n\n').trim();

  /* read ANY supported upload into plain text (private: stays in the browser unless you send it to a model) */
  async function readUpload(f) {
    const ext = (f.name.split('.').pop() || '').toLowerCase();
    if (f.size > 10 * 1024 * 1024) throw new Error('This file is too large. The maximum is 10 MB.');
    let text = '', kind = 'text', rows = null;
    if (f.type === 'application/pdf' || ext === 'pdf') { text = await pdfText(f); kind = 'pdf'; }
    else if ((f.type || '').startsWith('image/')) { kind = 'image'; text = await imgText(f); }
    else if (['docx', 'pptx', 'odt', 'odp'].includes(ext)) { text = await officeText(f, ext); kind = ext; }
    else if (['xlsx', 'xls', 'ods', 'csv', 'tsv'].includes(ext)) {
      const XL = await sheetsLib(), wb = XL.read(await f.arrayBuffer(), { type: 'array' }); kind = 'sheet';
      rows = wb.SheetNames.slice(0, 8).map(n => ({ name: n, rows: XL.utils.sheet_to_json(wb.Sheets[n], { header: 1, defval: '', blankrows: false }) }));
      text = rows.map(s => 'Sheet: ' + s.name + '\n' + csvOf(s.rows.slice(0, 200))).join('\n\n');
    }
    else if (ext === 'rtf') text = rtfText(await f.text());
    else if (['txt', 'md', 'json', 'xml', 'html', 'htm', 'log'].includes(ext) || (f.type || '').startsWith('text/')) { text = await f.text(); if (/html?/.test(ext)) text = text.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(); }
    else throw new Error('Unsupported file. Use PDF, Word, PowerPoint, Excel, CSV, ODS/ODT/ODP, RTF, text, HTML, JSON, XML or an image.');
    Safety.guard(text.slice(0, 40000));      // uploaded files are checked before any model sees them
    return { name: f.name, ext, kind, text, rows, size: f.size };
  }
  Uni.readUpload = readUpload;

  /* ---------- history (IndexedDB, this device, per user) ---------- */
  const FH = {
    db: null,
    open() { return new Promise((ok, no) => { if (this.db) return ok(this.db); const r = indexedDB.open('cute-s-files', 1); r.onupgradeneeded = () => r.result.createObjectStore('files', { keyPath: 'id' }); r.onsuccess = () => { this.db = r.result; ok(r.result); }; r.onerror = () => no(r.error); }); },
    async run(mode, fn) { const d = await this.open(); return new Promise((ok, no) => { const t = d.transaction('files', mode), s = t.objectStore('files'), r = fn(s); t.oncomplete = () => ok(r && r.result); t.onerror = () => no(t.error); }); },
    async all() { return ((await this.run('readonly', s => s.getAll())) || []).filter(r => r.uid === (user && user.uid)).sort((a, b) => b.ts - a.ts); },
    put(r) { return this.run('readwrite', s => s.put(r)); }, del(id) { return this.run('readwrite', s => s.delete(id)); },
    async clear() { for (const r of await this.all()) await this.del(r.id); },
    async trim(days) { const all = await this.all(), cut = days ? Date.now() - days * 864e5 : 0; for (const r of all.slice(30)) await this.del(r.id); if (cut) for (const r of all.filter(x => x.ts < cut)) await this.del(r.id); }
  };
  Uni.FH = FH;
  async function remember(rec) { try { await FH.put(Object.assign({ id: (user ? user.uid : 'x') + '_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6), uid: user && user.uid, ts: Date.now() }, rec)); await FH.trim(Uni.ls.get('cs_ret_files', 0)); } catch (e) {} }

  /* ---------- result card with preview / download ---------- */
  function fileCard(rec) {
    const card = h('div', { className: 'u-res' }, h('div', { className: 'u-row' }, h('b', { textContent: '📎 ' + rec.name, css: 'flex:1;word-break:break-all' })),
      h('p', { className: 'u-meta', textContent: (FMT[rec.fmt] ? FMT[rec.fmt].l : rec.fmt) + (rec.blob ? ' · ' + Uni.sizeTxt(rec.blob.size) : '') + (rec.model ? ' · written by ' + rec.model : '') }));
    const pv = h('div');
    card.append(Uni.btns(
      [rec.print ? '⬇️ Save as PDF' : '⬇️ Download', () => rec.print ? rec.print() : dl(rec.blob, rec.name)],
      ['👁 Preview', () => { if (pv.firstChild) { pv.innerHTML = ''; return; } pv.append(rec.preview && /^(?:#|\|)/m.test(rec.preview) ? Uni.mdBox(rec.preview.slice(0, 6000)) : h('pre', { textContent: (rec.preview || '(no text preview for this format)').slice(0, 6000) })); }],
      (rec.blob && navigator.share) ? ['📤 Share', async () => { try { const f = new File([rec.blob], rec.name, { type: rec.blob.type }); if (navigator.canShare && navigator.canShare({ files: [f] })) await navigator.share({ files: [f] }); else toast('Sharing is not supported here'); } catch (e) {} }] : null), pv);
    return card;
  }

  /* ---------- building each format from AI output ---------- */
  const TITLE = md => (String(md).match(/^\s*#\s+(.+)/m) || [])[1] || '';
  const safeName = (t, ext) => (String(t || 'file').replace(/[^\w\u0600-\u06FF -]+/g, ' ').trim().split(/\s+/).slice(0, 5).join('-') || 'file') + '.' + ext;
  const GEN_SYS = 'You are the content engine of CUTE-S AI, an assistant for students. Follow the requested output format EXACTLY. Output only the requested content, with no greeting and no commentary. Write in the same language and script as the request. Never invent facts, references or personal details; use [brackets] for unknown details.';
  const PROMPT = {
    doc: (req) => 'Create a professional document. Request: "' + req + '"\nFormat: Markdown only. One "# " title line first, then "## " sections, short paragraphs, "- " bullets and "| tables |" where useful. No code fence around the whole answer.',
    sheet: (req) => 'Create a spreadsheet. Request: "' + req + '"\nReply with ONLY valid JSON (no code fence): {"sheets":[{"name":"Sheet name","rows":[["Header 1","Header 2"],["value",123]]}]}. Use numbers for numeric cells and formulas like "=SUM(B2:B10)" where helpful. At most 3 sheets and 60 rows each.',
    slides: (req) => 'Create a presentation. Request: "' + req + '"\nReply with ONLY valid JSON (no code fence): {"title":"","subtitle":"","theme":"dark","slides":[{"title":"","bullets":["",""]}]}. 4 to 12 slides, 3 to 5 short bullets each.',
    raw: (req, ext) => 'Create a valid ' + ext.toUpperCase() + ' file. Request: "' + req + '"\nReply with ONLY the complete file content inside ONE fenced code block. No explanation.',
    zip: (req) => 'Create a small multi-file project. Request: "' + req + '"\nOutput EVERY file in exactly this format and nothing else:\n=== FILE: path/name.ext ===\n(file content)\n=== END ==='
  };
  const fenceless = t => { const m = String(t).trim().match(/^```(?:markdown|md)?\n([\s\S]*?)\n```$/); return m ? m[1] : String(t).trim(); };

  async function buildFrom(fmt, ai, req, modelName) {
    const F = FMT[fmt], base = { fmt, model: modelName };
    if (F.k === 'doc') {
      const md = fenceless(ai), title = TITLE(md) || req.slice(0, 40), name = safeName(title, F.e);
      const R = Object.assign(base, { name, preview: md, source: md });
      if (fmt === 'docx') R.blob = mdToDocx(md, { title: ofStrip(title) });
      else if (fmt === 'md') R.blob = new Blob([md], { type: MIME.md });
      else if (fmt === 'txt') R.blob = new Blob([plain(md)], { type: MIME.txt });
      else if (fmt === 'rtf') R.blob = new Blob([mdToRtf(md)], { type: MIME.rtf });
      else if (fmt === 'html') R.blob = new Blob([mdToHtml(md, title)], { type: MIME.html });
      else { R.print = () => toPdf(md); R.blob = null; }
      return R;
    }
    if (F.k === 'sheet') {
      let spec = parseJsonLoose(ai);
      if (!spec || !Array.isArray(spec.sheets)) throw new Error('The model did not return a valid table. Please try again or pick another model.');
      const name = safeName((spec.sheets[0] && spec.sheets[0].name) || req.slice(0, 40), F.e), pv = sheetPreview(spec);
      const R = Object.assign(base, { name, preview: pv, source: JSON.stringify(spec) });
      R.blob = fmt === 'xlsx' ? specToXlsx(spec) : fmt === 'ods' ? await specToOds(spec) : new Blob(['\ufeff' + csvOf((spec.sheets[0].rows || []).filter(Array.isArray))], { type: MIME.csv });
      return R;
    }
    if (F.k === 'slides') {
      const spec = parseJsonLoose(ai);
      if (!spec || !Array.isArray(spec.slides) || !spec.slides.length) throw new Error('The model did not return valid slides. Please try again or pick another model.');
      const name = safeName(spec.title || req.slice(0, 40), F.e), R = Object.assign(base, { name, preview: slidesPreview(spec), source: JSON.stringify(spec) });
      if (fmt === 'pptx') { if (!window.PptxGenJS) { try { await loadScript(PPT); } catch (e) { await loadScript('https://cdn.jsdelivr.net/npm/pptxgenjs@3.12.0/dist/pptxgen.bundle.js'); } } if (!window.PptxGenJS) throw new Error('The PowerPoint engine could not load. Check your internet.'); R.blob = await specToPptx(spec); }
      else R.blob = specToOdp(spec);
      return R;
    }
    if (F.k === 'zip') {
      const files = parseProject(ai); if (!files.length) throw new Error('No files were produced. Try again with more detail.');
      return Object.assign(base, { name: safeName(req.slice(0, 40), 'zip'), blob: ofZip(files), preview: '**' + files.length + ' files:**\n' + files.map(f => '- ' + f.name).join('\n') });
    }
    const code = extractCode(ai); if (fmt === 'json') { try { JSON.parse(code); } catch (e) { throw new Error('The model produced invalid JSON. Please try again.'); } }
    return Object.assign(base, { name: safeName(req.slice(0, 40), F.e), blob: new Blob([code], { type: MIME[fmt] }), preview: code, source: code });
  }
  Uni.buildFrom = buildFrom;

  /* conversions that need no AI at all */
  async function convert(file, to) {
    const rd = await readUpload(file), base = file.name.replace(/\.[^.]+$/, '') || 'converted';
    if (rd.rows) {                                           // spreadsheet group
      const spec = { sheets: rd.rows };
      if (to === 'xlsx') return { name: base + '.xlsx', blob: specToXlsx(spec), preview: sheetPreview(spec) };
      if (to === 'ods') return { name: base + '.ods', blob: await specToOds(spec), preview: sheetPreview(spec) };
      if (to === 'csv') return { name: base + '.csv', blob: new Blob(['\ufeff' + csvOf(rd.rows[0].rows)], { type: MIME.csv }), preview: sheetPreview(spec) };
      if (to === 'json') { const o = {}; rd.rows.forEach(s => { const [hd, ...r] = s.rows; o[s.name] = hd ? r.map(x => Object.fromEntries(hd.map((k, i) => [String(k || 'col' + (i + 1)), x[i] === undefined ? '' : x[i]]))) : []; }); const t = JSON.stringify(o, null, 2); return { name: base + '.json', blob: new Blob([t], { type: MIME.json }), preview: t.slice(0, 4000) }; }
    }
    if (rd.ext === 'json' && ['csv', 'xlsx', 'ods'].includes(to)) {
      let j; try { j = JSON.parse(rd.text); } catch (e) { throw new Error('This JSON file is not valid.'); }
      const arr = Array.isArray(j) ? j : (j && typeof j === 'object' ? Object.values(j).find(Array.isArray) : null);
      if (!arr || !arr.length || typeof arr[0] !== 'object') throw new Error('To convert JSON to a table, it must be a list of objects.');
      const keys = [...new Set(arr.slice(0, 500).flatMap(o => Object.keys(o)))], rows = [keys, ...arr.slice(0, 5000).map(o => keys.map(k => { const v = o[k]; return v && typeof v === 'object' ? JSON.stringify(v) : v; }))], spec = { sheets: [{ name: 'Sheet1', rows }] };
      if (to === 'xlsx') return { name: base + '.xlsx', blob: specToXlsx(spec), preview: sheetPreview(spec) };
      if (to === 'ods') return { name: base + '.ods', blob: await specToOds(spec), preview: sheetPreview(spec) };
      return { name: base + '.csv', blob: new Blob(['\ufeff' + csvOf(rows)], { type: MIME.csv }), preview: sheetPreview(spec) };
    }
    const md = rd.ext === 'md' ? rd.text : rd.text;          // text group: text and headings are kept, pictures and page styling are not
    const title = TITLE(md) || base;
    if (to === 'docx') return { name: base + '.docx', blob: mdToDocx(md, { title: ofStrip(title) }), preview: md };
    if (to === 'txt') return { name: base + '.txt', blob: new Blob([plain(md)], { type: MIME.txt }), preview: md };
    if (to === 'md') return { name: base + '.md', blob: new Blob([md], { type: MIME.md }), preview: md };
    if (to === 'rtf') return { name: base + '.rtf', blob: new Blob([mdToRtf(md)], { type: MIME.rtf }), preview: md };
    if (to === 'html') return { name: base + '.html', blob: new Blob([mdToHtml(md, title)], { type: MIME.html }), preview: md };
    if (to === 'pdf') return { name: base + '.pdf', print: () => toPdf(md), preview: md };
    throw new Error('This conversion is not supported.');
  }
  const OUT_FOR = f => {
    const ext = (f.name.split('.').pop() || '').toLowerCase();
    if (['xlsx', 'xls', 'ods', 'csv', 'tsv'].includes(ext)) return ['xlsx', 'ods', 'csv', 'json'].filter(x => x !== ext);
    if (ext === 'json') return ['csv', 'xlsx', 'ods', 'txt'];
    if (['docx', 'odt', 'pptx', 'odp', 'rtf', 'txt', 'md', 'html', 'htm', 'pdf'].includes(ext)) return ['docx', 'pdf', 'txt', 'rtf', 'html', 'md'].filter(x => x !== ext);
    return [];
  };

  /* ---------- the AI Files panel ---------- */
  Uni.panels.files = function () {
    const mp = Uni.modelPicker('files'), body = h('div'), out = h('div', { className: 'u-out' });
    let tab = Uni.ls.get('cs_uni_ftab', 'create'), fmt = Uni.ls.get('cs_uni_ffmt', 'docx');
    const tabs = [['create', '✍️ Create'], ['read', '📖 Read & analyze'], ['convert', '🔄 Convert'], ['history', '🗂 History']];
    const seg = h('div', { className: 'u-seg' });
    const drawSeg = () => { seg.innerHTML = ''; tabs.forEach(([k, t]) => seg.append(h('button', { className: 'chip' + (k === tab ? ' on' : ''), textContent: t, on: { click: () => { tab = k; Uni.ls.set('cs_uni_ftab', k); drawSeg(); draw(); } } }))); };
    const fmtSelect = (cur, fn, only) => { const s = h('select', { on: { change: () => fn(s.value) } }); const groups = {}; Object.entries(FMT).filter(([k]) => !only || only.includes(k)).forEach(([k, v]) => (groups[v.g] = groups[v.g] || []).push([k, v])); for (const g in groups) s.append(h('optgroup', { label: g }, groups[g].map(([k, v]) => h('option', { value: k, textContent: v.l, selected: k === cur })))); return s; };

    function create() {
      const ta = h('textarea', { rows: 4, maxLength: 2000, placeholder: 'What should the file contain? e.g. "Monthly student budget with totals" or "8-slide deck on climate change"' });
      let src = null; const srcInfo = h('p', { className: 'u-note' });
      const f = h('input', { type: 'file', css: 'display:none', accept: '.pdf,.docx,.pptx,.odt,.odp,.ods,.xlsx,.xls,.csv,.txt,.md,.rtf,.html,.json,.xml,image/*', onchange: async () => { const x = f.files[0]; f.value = ''; if (!x) return; srcInfo.textContent = 'Reading...'; try { src = await readUpload(x); srcInfo.textContent = '📎 ' + src.name + ' will be used as source material (its text is sent to the selected model).'; } catch (e) { src = null; srcInfo.textContent = ''; Uni.err(out, e); } } });
      const go = h('button', { className: 'pb', textContent: '✨ Create file' });
      go.onclick = () => {
        const req = ta.value.trim(); if (!req && !src) return toast('Tell me what to create');
        const m = mp.get();
        Uni.task('files', m, go, out, async () => {
          Safety.guard(req);
          const ph = Uni.progress('Writing the content with ' + m.name + '...'); out.prepend(ph);
          try {
            const F = FMT[fmt]; let p = PROMPT[F.k](req || 'Convert the attached material into this file.', F.e);
            if (src) p += '\n\nSource material (' + src.name + '):\n' + src.text.slice(0, 12000);
            const ai = await Uni.chat(m, GEN_SYS, p, t => { const s = ph.querySelector('span'); if (s) s.textContent = 'Writing the content with ' + m.name + '... ' + t.length + ' characters'; });
            ph.querySelector('span').textContent = 'Building the ' + F.l + ' file...';
            const R = await buildFrom(fmt, ai, req || (src && src.name) || 'file', m.name);
            ph.replaceWith(fileCard(R)); await remember({ name: R.name, fmt, size: R.blob ? R.blob.size : 0, blob: R.blob || null, preview: (R.preview || '').slice(0, 6000), model: m.name, printable: !!R.print, source: R.print ? R.source : undefined });
          } catch (e) { ph.remove(); throw e; }
        });
      };
      return [h('div', { className: 'u-sec' }, h('h4', { textContent: 'Format' }), fmtSelect(fmt, v => { fmt = v; Uni.ls.set('cs_uni_ffmt', v); }),
        h('p', { className: 'u-note', textContent: 'The AI model writes the content. A separate document engine then builds the real file. ZIP creates a small multi-file project.' })),
        h('div', { className: 'u-sec' }, h('h4', { textContent: 'Request' }), ta, h('div', { className: 'u-btns' }, h('button', { textContent: '📎 Use a file as source', on: { click: () => f.click() } }), f), srcInfo), go];
    }

    function read() {
      let doc = null; const info = h('div'), tools = h('div');
      const f = h('input', { type: 'file', css: 'display:none', accept: '.pdf,.docx,.pptx,.odt,.odp,.ods,.xlsx,.xls,.csv,.txt,.md,.rtf,.html,.json,.xml,image/*', onchange: async () => { const x = f.files[0]; f.value = ''; if (!x) return; info.innerHTML = ''; tools.innerHTML = ''; info.append(h('p', { className: 'u-note', textContent: 'Reading ' + x.name + ' on this device...' }));
        try { doc = await readUpload(x); info.innerHTML = ''; info.append(h('div', { className: 'u-ok', textContent: '✅ ' + doc.name + ' · ' + Uni.sizeTxt(doc.size) + ' · ' + doc.text.length + ' characters of text read' + (doc.kind === 'image' && !doc.text ? ' (no readable text found in the image)' : '') }));
          if (doc.rows) info.append(h('div', { className: 'u-tbl', html: '' }, ...[]));
          tools.append(h('p', { className: 'u-note', textContent: 'Choosing an action sends the text of this file to "' + ((mp.get() || {}).name || 'the selected model') + '". Nothing is uploaded until you do.' }), Uni.btns(['📝 Summarize', () => act('Summarize this file clearly: key points first, then details. Keep the language of the file.')], ['🔍 Analyze', () => act('Analyze this file: main ideas, strengths, problems, missing information and 5 questions a reader may ask.')], ['📌 Key facts', () => act('List the key facts, dates, names and numbers found in this file as bullet points.')]),
            h('div', { className: 'u-row' }, h('input', { id: 'u_ask', maxLength: 300, placeholder: 'Ask a question about this file' }), h('button', { className: 'u-pill', textContent: 'Ask', on: { click: () => { const v = $('u_ask').value.trim(); if (v) act('Answer this question using ONLY the file. If the file does not contain the answer, say so.\nQuestion: ' + v); } } })));
        } catch (e) { info.innerHTML = ''; doc = null; Uni.err(info, e); } } });
      const act = instr => {
        if (!doc) return; const m = mp.get();
        Uni.task('files', m, null, out, async () => {
          const ph = Uni.progress('Reading with ' + m.name + '...'); out.prepend(ph);
          try { const box = Uni.mdBox(''), res = h('div', { className: 'u-res' }, box); let last = ''; ph.replaceWith(res);
            const t = await Uni.chat(m, 'You are a careful document assistant. Use only the supplied file text. Do not invent content. Say clearly when something is not in the file.', instr + '\n\nFILE (' + doc.name + '):\n' + doc.text.slice(0, 14000), x => { last = x; box.querySelector('.b').innerHTML = md(x); });
            res.replaceChildren(Uni.mdBox(t), Uni.btns(['📋 Copy', b => { navigator.clipboard && navigator.clipboard.writeText(t); b.textContent = '✅ Copied'; }], ['📄 Save as Word', async () => { const R = await buildFrom('docx', t, doc.name, m.name); dl(R.blob, R.name); await remember({ name: R.name, fmt: 'docx', size: R.blob.size, blob: R.blob, preview: t.slice(0, 6000), model: m.name }); }]));
          } catch (e) { ph.remove(); throw e; }
        });
      };
      return [h('div', { className: 'u-sec' }, h('h4', { textContent: 'File to read' }), h('label', { className: 'u-drop', textContent: '📂 Choose a file (PDF, Word, PowerPoint, Excel, CSV, ODF, RTF, text, image)', on: { click: () => f.click() } }), f, info, tools)];
    }

    function convertTab() {
      const info = h('div'), box = h('div'); let file = null, to = '';
      const f = h('input', { type: 'file', css: 'display:none', accept: '.xlsx,.xls,.ods,.csv,.tsv,.json,.docx,.odt,.pptx,.odp,.rtf,.txt,.md,.html,.pdf', onchange: () => { file = f.files[0]; f.value = ''; draw(); } });
      const draw = () => { box.innerHTML = ''; if (!file) return; const opts = OUT_FOR(file); if (!opts.length) { box.append(h('div', { className: 'u-warn', textContent: 'This file type cannot be converted here.' })); return; } if (!to || !opts.includes(to)) to = opts[0];
        const go = h('button', { className: 'pb', textContent: '🔄 Convert' });
        go.onclick = async () => { if (Uni.busy) return; go.disabled = true; try { const R = await convert(file, to); const c = fileCard(Object.assign(R, { fmt: to })); out.prepend(c); await remember({ name: R.name, fmt: to, size: R.blob ? R.blob.size : 0, blob: R.blob || null, preview: (R.preview || '').slice(0, 6000), printable: !!R.print, source: R.print ? R.preview : undefined }); } catch (e) { Uni.err(out, e); } go.disabled = false; };
        box.append(h('p', { className: 'u-note', textContent: '📎 ' + file.name }), Uni.field('Convert to', Uni.select(opts.map(o => [o, FMT[o] ? FMT[o].l : o]), to, v => { to = v; })), h('p', { className: 'u-note', textContent: 'No AI is used here, so nothing leaves your device. Tables and text are kept; images, fonts and page layout are not.' }), go); };
      return [h('div', { className: 'u-sec' }, h('h4', { textContent: 'File to convert' }), h('label', { className: 'u-drop', textContent: '📂 Choose a file', on: { click: () => f.click() } }), f, box)];
    }

    function history() {
      const list = h('div', { className: 'u-out' });
      FH.all().then(all => {
        if (!all.length) { list.append(h('p', { className: 'u-note', textContent: 'No files yet. Files you create or convert are listed here, stored on this device only.' })); return; }
        all.forEach(r => { const c = fileCard({ name: r.name, fmt: r.fmt, blob: r.blob, preview: r.preview, model: r.model, print: r.printable ? () => toPdf(r.source || r.preview) : null });
          c.append(h('p', { className: 'u-meta', textContent: new Date(r.ts).toLocaleString() }), Uni.btns(['🗑 Delete', async () => { if (confirm('Delete this file from history?')) { await FH.del(r.id); c.remove(); } }])); list.append(c); });
        list.prepend(Uni.btns(['🗑 Delete all file history', async () => { if (confirm('Delete ALL file history on this device?')) { await FH.clear(); Uni.panels.files(); } }]));
      }).catch(e => Uni.err(list, e));
      return [h('p', { className: 'u-note', textContent: 'History is stored privately on this device only (not uploaded). Retention can be set in Privacy & my data.' }), list];
    }

    const draw = () => { mp.node.hidden = !(tab === 'create' || tab === 'read'); body.innerHTML = ''; body.append(...({ create, read, convert: convertTab, history })[tab]()); };
    Uni.set(Uni.top('', 'files'), seg, mp.node, body, out);
    drawSeg(); draw();
  };
  Uni.fileFmt = FMT; Uni.mdToRtf = mdToRtf; Uni.specToOdp = specToOdp; Uni.specToOds = specToOds; Uni.officeText = officeText; Uni.convertFile = convert; Uni.csvOf = csvOf; Uni.sheetsLib = sheetsLib;
})();
