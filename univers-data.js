/* =====================================================================
   CUTE-S AI - AI Data (univers-data.js)
   Privacy design: the spreadsheet is read and calculated ON YOUR DEVICE.
   Statistics, cleaning, charts and downloads need no AI at all. The AI
   only receives what is shown in "What will be sent" (column names, the
   computed numbers, and optionally the first 20 rows).
   ===================================================================== */
(function () {
  if (!window.Uni) return;
  const { h, $, ls } = Uni;
  const MAX_ROWS = 50000, MAX_COLS = 60;
  const colLetter = i => { let s = '', n = i + 1; while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); } return s; };
  const toNum = v => {
    if (typeof v === 'number') return isFinite(v) ? v : null;
    if (typeof v !== 'string') return null;
    const s = v.trim().replace(/[\s$€£¥₨,]/g, '').replace(/%$/, '');
    return /^[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?$/i.test(s) ? parseFloat(s) : null;
  };
  const isDateStr = v => typeof v === 'string' && (/^\d{4}[-/.]\d{1,2}[-/.]\d{1,2}/.test(v.trim()) || /^\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}$/.test(v.trim()));
  const empty = v => v === '' || v == null || (typeof v === 'string' && !v.trim());
  const fmt = n => n == null || !isFinite(n) ? '' : Math.abs(n) >= 1e6 || (Math.abs(n) < 0.001 && n !== 0) ? n.toExponential(3) : String(Math.round(n * 1000) / 1000);
  const median = a => { const s = a.slice().sort((x, y) => x - y), m = s.length >> 1; return s.length ? (s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2) : null; };

  /* ---------- analysis (all local) ---------- */
  function analyze(rows) {
    const head = (rows[0] || []).slice(0, MAX_COLS).map((x, i) => (String(x == null ? '' : x).trim() || 'Column ' + (i + 1)));
    const data = rows.slice(1).map(r => head.map((_, i) => r[i] == null ? '' : r[i]));
    const cols = head.map((name, i) => {
      const vals = data.map(r => r[i]), ne = vals.filter(v => !empty(v)), nums = ne.map(toNum), numOk = nums.filter(x => x != null);
      const type = !ne.length ? 'empty' : numOk.length >= 0.8 * ne.length ? 'number' : ne.filter(isDateStr).length >= 0.8 * ne.length ? 'date' : 'text';
      const c = { name, letter: colLetter(i), type, n: ne.length, missing: vals.length - ne.length, idx: i };
      if (type === 'number') {
        const a = numOk, mean = a.reduce((s, x) => s + x, 0) / a.length;
        c.sum = a.reduce((s, x) => s + x, 0); c.mean = mean; c.median = median(a); c.min = Math.min(...a); c.max = Math.max(...a);
        c.sd = a.length > 1 ? Math.sqrt(a.reduce((s, x) => s + (x - mean) * (x - mean), 0) / (a.length - 1)) : 0;
        // trend in FILE ORDER: least-squares slope over the row number
        const xs = []; const ys = []; nums.forEach((x, k) => { if (x != null) { xs.push(k); ys.push(x); } });
        if (ys.length >= 4) {
          const mx = xs.reduce((s, x) => s + x, 0) / xs.length, my = mean; let nu = 0, de = 0; xs.forEach((x, k) => { nu += (x - mx) * (ys[k] - my); de += (x - mx) * (x - mx); });
          const slope = de ? nu / de : 0, change = slope * (xs[xs.length - 1] - xs[0]), rel = Math.abs(my) > 1e-12 ? change / Math.abs(my) : 0;
          c.trend = Math.abs(rel) < 0.05 ? 'flat' : rel > 0 ? 'rising' : 'falling'; c.slope = slope; c.firstLast = ys[0] ? (ys[ys.length - 1] - ys[0]) / Math.abs(ys[0]) * 100 : null;
        }
      } else if (type === 'text' || type === 'date') {
        const cnt = new Map(); ne.forEach(v => { const k = String(v).trim(); cnt.set(k, (cnt.get(k) || 0) + 1); });
        c.unique = cnt.size; c.top = [...cnt.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
      }
      return c;
    });
    const seen = new Set(); let dups = 0; data.forEach(r => { const k = JSON.stringify(r); if (seen.has(k)) dups++; else seen.add(k); });
    return { head, data, cols, dups, emptyRows: data.filter(r => r.every(empty)).length };
  }
  function clean(A, ops) {
    let head = A.head.slice(), data = A.data.map(r => r.slice()); const log = [];
    if (ops.trim) { let n = 0; data = data.map(r => r.map(v => { if (typeof v === 'string') { const t = v.replace(/\s+/g, ' ').trim(); if (t !== v) n++; return t; } return v; })); log.push('Trimmed spaces in ' + n + ' cells'); }
    if (ops.headers) { head = head.map(x => String(x).trim().replace(/\s+/g, '_')); log.push('Tidied column names'); }
    if (ops.nums) { let n = 0; A.cols.forEach(c => { if (c.type === 'number') data.forEach(r => { const v = r[c.idx]; if (typeof v === 'string' && !empty(v)) { const x = toNum(v); if (x != null) { r[c.idx] = x; n++; } } }); }); log.push('Converted ' + n + ' text cells to numbers'); }
    if (ops.blank) { const b = data.length; data = data.filter(r => !r.every(empty)); log.push('Removed ' + (b - data.length) + ' empty rows'); }
    if (ops.fill) { let n = 0; A.cols.forEach(c => { if (c.type === 'number') { const med = median(data.map(r => toNum(r[c.idx])).filter(x => x != null)); if (med != null) data.forEach(r => { if (empty(r[c.idx])) { r[c.idx] = med; n++; } }); } }); log.push('Filled ' + n + ' missing numbers with the column median'); }
    if (ops.miss) { const b = data.length; data = data.filter(r => !r.some(empty)); log.push('Removed ' + (b - data.length) + ' rows that still had missing values'); }
    if (ops.dups) { const s = new Set(), b = data.length; data = data.filter(r => { const k = JSON.stringify(r); if (s.has(k)) return false; s.add(k); return true; }); log.push('Removed ' + (b - data.length) + ' duplicate rows'); }
    return { head, data, log };
  }
  function summaryText(A, sheetName, withRows) {
    const lines = ['Sheet: ' + sheetName + ' | rows: ' + A.data.length + ' | columns: ' + A.cols.length + ' | duplicate rows: ' + A.dups + ' | empty rows: ' + A.emptyRows, 'Columns (letter, name, type, filled, missing, stats):'];
    A.cols.forEach(c => {
      let s = c.letter + ' "' + c.name + '" ' + c.type + ', filled ' + c.n + ', missing ' + c.missing;
      if (c.type === 'number') s += ', sum ' + fmt(c.sum) + ', mean ' + fmt(c.mean) + ', median ' + fmt(c.median) + ', min ' + fmt(c.min) + ', max ' + fmt(c.max) + ', sd ' + fmt(c.sd) + (c.trend ? ', trend in file order: ' + c.trend + (c.firstLast != null ? ' (first to last ' + fmt(c.firstLast) + '%)' : '') : '');
      else if (c.top) s += ', ' + c.unique + ' different values; most common: ' + c.top.map(t => '"' + String(t[0]).slice(0, 30) + '" x' + t[1]).join(', ');
      lines.push(s);
    });
    if (withRows) { lines.push('First 20 rows:'); lines.push(Uni.csvOf([A.head].concat(A.data.slice(0, 20)))); }
    return lines.join('\n');
  }
  const DATA_SYS = 'You are a careful data analyst for a student. You only know what the DATASET SUMMARY says: its numbers were calculated exactly on the user\'s device. Do not invent rows, values or statistics that are not in the summary; if the question needs data you were not given, say exactly what is missing. Explain simply and show the key numbers. For spreadsheet formulas use the real column letters from the summary (row 1 = headers, data starts in row 2) and explain each formula. Reply in the language of the user.';
  const DATA_TASKS = [['insights', 'Insights'], ['trends', 'Trends'], ['formulas', 'Formulas'], ['report', 'Report'], ['ask', 'Ask a question']];
  const TASK_Q = { insights: 'Give the most important insights, problems in data quality, and what to check next.', trends: 'Describe the trends and patterns, and how reliable they are given the data.', formulas: 'Suggest useful spreadsheet formulas (Excel / Google Sheets) for this data, with the exact cell ranges, and say what each one gives.', report: 'Write a short professional report: overview, key numbers, findings, data quality issues, recommendations.' };

  /* ---------- chart ---------- */
  function chartData(A, xi, yi, agg, topN) {
    const g = new Map();
    A.data.forEach(r => { const k = String(r[xi] == null ? '' : r[xi]).trim() || '(blank)'; const v = yi < 0 ? 1 : toNum(r[yi]); if (yi >= 0 && v == null) return; const o = g.get(k) || { s: 0, n: 0 }; o.s += v; o.n++; g.set(k, o); });
    let a = [...g.entries()].map(([k, o]) => [k, agg === 'count' || yi < 0 ? o.n : agg === 'mean' ? o.s / o.n : o.s]);
    return a.slice(0, topN);
  }
  function svgToPng(svg, name) {
    const s = svg.replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" style="background:#161012" '), img = new Image();
    img.onload = () => { const c = document.createElement('canvas'); c.width = 960; c.height = 600; const g = c.getContext('2d'); g.fillStyle = '#161012'; g.fillRect(0, 0, 960, 600); g.drawImage(img, 0, 0, 960, 600); c.toBlob(b => b && Uni.blobDl(b, name), 'image/png'); };
    img.onerror = () => toast('Could not make the PNG'); img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(s);
  }
  const table = (head, rows) => h('div', { className: 'u-tbl' }, h('table', null, h('thead', null, h('tr', null, head.map(x => h('th', { textContent: x })))), h('tbody', null, rows.map(r => h('tr', null, r.map(x => h('td', { textContent: String(x == null ? '' : x).slice(0, 60) })))))));
  async function xlsxBlob(head, data, name) {
    const XL = await Uni.sheetsLib(), wb = XL.utils.book_new(); XL.utils.book_append_sheet(wb, XL.utils.aoa_to_sheet([head].concat(data)), String(name || 'Sheet1').replace(/[\[\]:*?\/\\]/g, ' ').slice(0, 31) || 'Sheet1');
    return new Blob([XL.write(wb, { bookType: 'xlsx', type: 'array' })], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  }

  /* ---------- the panel ---------- */
  Uni.panels.data = function () {
    const mp = Uni.modelPicker('data'), out = h('div', { className: 'u-out' }), host = h('div');
    let file = null, sheets = null, si = 0, A = null, cleaned = null;
    const S = Object.assign({ task: 'insights', rows: false }, ls.get('cs_uni_data', {})), save = () => ls.set('cs_uni_data', S);

    const load = async f => {
      host.innerHTML = ''; out.innerHTML = ''; host.append(h('div', { className: 'u-note', textContent: 'Reading on your device...' }));
      try {
        const r = await Uni.readUpload(f);
        if (r.kind !== 'sheet' || !r.rows || !r.rows.length) throw new Error('Please choose a CSV, XLSX, XLS, ODS or TSV file.');
        file = r; sheets = r.rows.filter(s => s.rows && s.rows.length > 1); if (!sheets.length) throw new Error('This file has no rows of data.');
        si = 0; pick();
      } catch (e) { host.innerHTML = ''; Uni.err(host, e); host.append(dropBox()); }
    };
    const dropBox = () => {
      const fi = h('input', { type: 'file', accept: '.csv,.tsv,.xlsx,.xls,.ods', css: 'display:none', onchange: () => { const x = fi.files[0]; fi.value = ''; if (x) load(x); } });
      return h('div', null, h('div', { className: 'u-drop', textContent: '📊 Choose a CSV / Excel / ODS file (max 10 MB)', on: { click: () => fi.click() } }), fi);
    };
    const pick = () => {
      const rows = sheets[si].rows; let cut = '';
      let use = rows; if (rows.length - 1 > MAX_ROWS) { use = rows.slice(0, MAX_ROWS + 1); cut += 'Only the first ' + MAX_ROWS + ' rows are used. '; }
      if ((rows[0] || []).length > MAX_COLS) cut += 'Only the first ' + MAX_COLS + ' columns are used. ';
      A = analyze(use); cleaned = null; render(cut);
    };

    function render(cut) {
      host.innerHTML = ''; out.innerHTML = '';
      const nm = sheets[si].name;
      host.append(h('div', { className: 'u-sec' }, h('h4', { textContent: 'File' }),
        h('div', { className: 'u-kv' }, h('span', { textContent: 'Name' }), h('span', { textContent: file.name }), h('span', { textContent: 'Rows' }), h('span', { textContent: String(A.data.length) }), h('span', { textContent: 'Columns' }), h('span', { textContent: String(A.cols.length) }), h('span', { textContent: 'Duplicates' }), h('span', { textContent: String(A.dups) }), h('span', { textContent: 'Empty rows' }), h('span', { textContent: String(A.emptyRows) })),
        sheets.length > 1 ? Uni.field('Sheet', Uni.select(sheets.map((s, i) => [i, s.name]), si, v => { si = +v; pick(); })) : null,
        cut ? h('div', { className: 'u-warn', textContent: cut }) : null, dropBox()));

      host.append(h('div', { className: 'u-sec' }, h('h4', { textContent: 'Preview (first 8 rows)' }), table(A.head, A.data.slice(0, 8))));
      host.append(h('div', { className: 'u-sec' }, h('h4', { textContent: 'Statistics (calculated on your device)' }),
        table(['', 'Column', 'Type', 'Missing', 'Mean', 'Median', 'Min', 'Max', 'Trend*'], A.cols.map(c => [c.letter, c.name, c.type, c.missing, fmt(c.mean), fmt(c.median), fmt(c.min), fmt(c.max), c.trend || ''])),
        h('p', { className: 'u-note', textContent: '*Trend follows the order of the rows in the file; it is a simple straight-line estimate, not a forecast.' })));

      // cleaning
      const ops = { trim: true, blank: true, dups: false, nums: true, fill: false, miss: false, headers: false };
      const OPN = [['trim', 'Trim extra spaces'], ['blank', 'Remove empty rows'], ['dups', 'Remove duplicate rows (' + A.dups + ')'], ['nums', 'Turn numbers stored as text into numbers'], ['fill', 'Fill missing numbers with the column median'], ['miss', 'Remove rows with missing values'], ['headers', 'Tidy column names (spaces → _)']];
      const cl = h('div', { className: 'u-sec' }, h('h4', { textContent: 'Clean data' }));
      OPN.forEach(([k, t]) => cl.append(h('label', { css: 'display:flex;gap:8px;align-items:center;font-size:13.5px;margin:5px 0' }, h('input', { type: 'checkbox', checked: ops[k], onchange: e => { ops[k] = e.target.checked; } }), t)));
      const clOut = h('div');
      cl.append(Uni.btns(['🧹 Clean', () => { cleaned = clean(A, ops); clOut.innerHTML = ''; clOut.append(h('div', { className: 'u-ok', textContent: cleaned.log.join('. ') + '. Result: ' + cleaned.data.length + ' rows.' }), table(cleaned.head, cleaned.data.slice(0, 6)),
        Uni.btns(['⬇ CSV', () => Uni.blobDl(new Blob(['\ufeff' + Uni.csvOf([cleaned.head].concat(cleaned.data))], { type: 'text/csv;charset=utf-8' }), 'cleaned.csv')], ['⬇ XLSX', async b => { try { Uni.blobDl(await xlsxBlob(cleaned.head, cleaned.data, nm), 'cleaned.xlsx'); } catch (e) { toast((e && e.message) || 'Could not build the XLSX'); } }])); }]), clOut,
        h('p', { className: 'u-note', textContent: 'Your original file is never changed. Cleaning makes a new file.' }));
      host.append(cl);

      // chart
      const nums = A.cols.filter(c => c.type === 'number'), cats = A.cols.filter(c => c.type !== 'number' && c.type !== 'empty').concat(A.cols.filter(c => c.type === 'number'));
      const C = { x: (cats[0] || A.cols[0]).idx, y: nums.length ? nums[0].idx : -1, agg: 'sum', type: 'bar', n: 12 };
      const chOut = h('div');
      const draw = () => {
        chOut.innerHTML = ''; const pts = chartData(A, C.x, C.y, C.agg, C.n);
        const svg = typeof chartSvg === 'function' ? chartSvg({ type: C.type, labels: pts.map(p => p[0]), values: pts.map(p => Math.round(p[1] * 100) / 100), title: (C.y < 0 ? 'Count' : A.head[C.y]) + ' by ' + A.head[C.x] }) : null;
        if (!svg) { chOut.append(h('div', { className: 'u-warn', textContent: 'Not enough data to draw this chart. Choose another column.' })); return; }
        const box = h('div', { className: 'chart' }); box.innerHTML = svg;      // svg built by chartSvg(), which escapes all labels
        chOut.append(box, Uni.btns(['⬇ SVG', () => Uni.blobDl(new Blob([svg.replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" ')], { type: 'image/svg+xml' }), 'chart.svg')], ['⬇ PNG', () => svgToPng(svg, 'chart.png')]));
        if (A.data.length > 0 && new Set(pts.map(p => p[0])).size >= 12) chOut.append(h('p', { className: 'u-note', textContent: 'Showing the first 12 groups only.' }));
      };
      const ch = h('div', { className: 'u-sec' }, h('h4', { textContent: 'Chart' }),
        Uni.field('Type', Uni.select([['bar', 'Bar'], ['line', 'Line'], ['pie', 'Pie']], C.type, v => { C.type = v; draw(); })),
        Uni.field('Group by', Uni.select(A.cols.map(c => [c.idx, c.letter + ' · ' + c.name]), C.x, v => { C.x = +v; draw(); })),
        Uni.field('Value', Uni.select([[-1, 'Count of rows']].concat(nums.map(c => [c.idx, c.letter + ' · ' + c.name])), C.y, v => { C.y = +v; draw(); })),
        Uni.field('Combine', Uni.select([['sum', 'Sum'], ['mean', 'Average'], ['count', 'Count']], C.agg, v => { C.agg = v; draw(); })), chOut);
      host.append(ch); draw();

      // AI
      const row = h('input', { type: 'checkbox', checked: !!S.rows, onchange: e => { S.rows = e.target.checked; save(); sent(); } });
      const q = h('textarea', { rows: 3, maxLength: 800, placeholder: 'Your question about the data (needed for "Ask a question")' });
      const sentBox = h('pre', { className: 'u-log', css: 'max-height:150px;overflow:auto' });
      const sent = () => { sentBox.textContent = summaryText(A, nm, S.rows).slice(0, 6000); };
      const btn = h('button', { className: 'pb', textContent: '🤖 Ask the AI' });
      btn.onclick = () => { const m = mp.get(); Uni.task('data', m, btn, out, async () => {
        if (S.task === 'ask' && q.value.trim().length < 3) throw new Error('Please write your question.');
        const ph = Uni.progress('Analyzing with ' + m.name + '...'); out.prepend(ph);
        try {
          const user = (S.task === 'ask' ? 'Question: ' + q.value.trim() : TASK_Q[S.task]) + '\n\nDATASET SUMMARY:\n' + summaryText(A, nm, S.rows);
          const ans = await Uni.chat(m, DATA_SYS, user);
          const mdOut = ans, card = h('div', { className: 'u-res' }, h('div', { className: 'u-meta', textContent: m.name + ' · only the summary was sent' }), Uni.mdBox(ans),
            Uni.btns(['⬇ Report (.md)', () => Uni.blobDl(new Blob([mdOut + '\n\n---\nStatistics:\n\n' + summaryText(A, nm, false)], { type: 'text/markdown;charset=utf-8' }), 'data-report.md')]));
          ph.replaceWith(card);
        } catch (e) { ph.remove(); throw e; }
      }); };
      host.append(mp.node, h('div', { className: 'u-sec' }, h('h4', { textContent: 'Ask the AI' }), h('div', { className: 'u-seg' }, Uni.chips(DATA_TASKS, S.task, v => { S.task = v; save(); })), q,
        h('label', { css: 'display:flex;gap:8px;align-items:center;font-size:13.5px;margin:6px 0' }, row, 'Also send the first 20 rows (more private if off)'),
        h('details', { className: 'u-note' }, h('summary', { textContent: 'What will be sent to the AI', css: 'cursor:pointer' }), sentBox,
          h('p', { textContent: 'It goes through Puter to the model provider. Your file itself is never uploaded by CUTE-S AI.' }))), btn);
      sent();
    }

    Uni.set(Uni.top('AI Data', 'data'), h('p', { className: 'u-note', textContent: 'Everything except "Ask the AI" runs on your device. Nothing is uploaded or saved by CUTE-S AI.' }), host, out); host.append(dropBox());
  };

  /* =====================================================================
     AUTOMATIC MODE: a spreadsheet is attached to the chat and the user
     asks for analysis. Exact numbers are calculated locally first, then
     the AI explains them. (The chat only keeps the first 12,000 characters
     of a file, so for big files we say so and point to AI Data.)
     ===================================================================== */
  function csvParse(t) {
    const rows = []; let r = [], f = '', q = false;
    for (let i = 0; i < t.length; i++) {
      const c = t[i];
      if (q) { if (c === '"') { if (t[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
      else if (c === '"') q = true;
      else if (c === ',' || c === '\t') { r.push(f); f = ''; }
      else if (c === '\n') { r.push(f); rows.push(r); r = []; f = ''; }
      else if (c !== '\r') f += c;
    }
    if (f || r.length) { r.push(f); rows.push(r); }
    return rows;
  }
  const DATA_INTENT = /\b(?:analy[sz]e|analysis|trend|chart|graph|statistic|statistics|clean|insight|insights|summary|summari[sz]e|formula|report|average|mean|median|numbers)\b/i;
  Uni.autoData = async function (q) {
    const m = Registry.pick('data'); if (!m) return false;
    if (busy) { toast('Please wait...'); return true; }
    const truncated = attach.text.length >= 12000;
    let lines = attach.text.split(/\r?\n/).filter(l => !/^\s*(?:sheet|##)\b.*:?\s*$/i.test(l) || l.includes(',')); // drop "Sheet: name" headers, keep data
    let rows = csvParse(lines.join('\n')).filter(r => r.some(x => String(x).trim()));
    if (rows.length < 2) return false;                          // cannot read it as a table: normal chat handles it
    rows = rows.map(r => r.map(x => { const n = toNum(x); return n != null && String(x).trim() !== '' ? n : x; }));
    const A = analyze(rows), nm = attach.name;
    busy = true; $('send').disabled = true;
    try {
      if (!await puterReady()) return true;
      if (!hist.length) M.innerHTML = '';
      bub('user', q, q + '\n📎 ' + nm); hist.push({ role: 'user', content: q + '\n[Attached file: ' + nm + ']', shown: q + '\n📎 ' + nm });
      clearAttach(); const q2 = $('q'); q2.value = ''; q2.style.height = 'auto';
      const b = bub('assistant', ''); pet('think'); b.innerHTML = '';
      const ph = Uni.progress('Calculating on your device, then asking ' + m.name + '...'); b.append(ph);
      try {
        const wantChart = /\b(?:chart|graph|plot|visuali[sz]e)\b/i.test(q);
        const user = 'Question: ' + q + (wantChart ? '\n(The app draws the chart itself; do not output chart code. Just explain what the chart shows.)' : '') + '\n\nDATASET SUMMARY:\n' + summaryText(A, nm, false) + (truncated ? '\n(NOTE: only the first part of the file was available, so these numbers describe only the rows read.)' : '');
        const ans = await Uni.chat(m, DATA_SYS, user);
        ph.remove(); b.append(Uni.mdBox(ans));
        if (wantChart) { const cat = A.cols.find(c => c.type !== 'number' && c.type !== 'empty'), num = A.cols.find(c => c.type === 'number'); if (cat && num) { const pts = chartData(A, cat.idx, num.idx, 'sum', 12), svg = typeof chartSvg === 'function' ? chartSvg({ type: 'bar', labels: pts.map(p => p[0]), values: pts.map(p => Math.round(p[1] * 100) / 100), title: num.name + ' by ' + cat.name }) : null; if (svg) { const box = h('div', { className: 'chart' }); box.innerHTML = svg; b.append(box); } } }
        if (truncated) b.append(h('div', { className: 'u-warn', textContent: 'Only the first part of this file could be used in chat. Open C-Univers-AI → AI Data for the whole file.' }));
        hist.push({ role: 'assistant', content: ans.slice(0, 6000) }); pet('happy', 3000); saveChat(); Usage.log('data', m.id, true);
        Uni.autoNote('🤖 Auto mode · AI Data · numbers calculated on your device · ' + m.name + ' · open C-Univers-AI to clean data and make charts yourself');
      } catch (e) { ph.remove(); b.textContent = ((e && e.message) || 'Could not analyze the data.').slice(0, 320); hist.pop(); pet('sad', 3000); if (!(e && e.safety)) Usage.log('data', m.id, false, e && e.code); }
    } finally { busy = false; $('send').disabled = false; M.scrollTop = M.scrollHeight; }
    return true;
  };
  Uni.hooks.push(async q => (typeof attach !== 'undefined' && attach && /\.(?:csv|xlsx|xls)$/i.test(attach.name) && DATA_INTENT.test(q)) ? Uni.autoData(q) : false);
  Uni.dataLib = { analyze, clean, summaryText, toNum };
})();
