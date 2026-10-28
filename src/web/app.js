'use strict';

/*
 * stride-engine web interface.
 *
 * Plain JavaScript, no third-party front-end code. All user-controlled text
 * (component names, descriptions, validation messages) is inserted with
 * textContent / createTextNode — never innerHTML — so a malicious model
 * cannot inject markup or script.
 */

(() => {
  const STRIDE = ['Spoofing', 'Tampering', 'Repudiation', 'Information Disclosure', 'Denial of Service', 'Elevation of Privilege'];
  const SEVERITIES = ['Critical', 'High', 'Medium', 'Low'];
  const RANK = { Low: 0, Medium: 1, High: 2, Critical: 3 };
  const DREAD = [
    ['damage', 'D', 'Damage'], ['reproducibility', 'R', 'Reproducibility'], ['exploitability', 'E', 'Exploitability'],
    ['affectedUsers', 'A', 'Affected users'], ['discoverability', 'Di', 'Discoverability'],
  ];
  const SVG_NS = 'http://www.w3.org/2000/svg';

  const $ = (id) => document.getElementById(id);
  const state = { report: null, model: null, filters: { severity: '', category: '', target: '' }, open: new Set() };

  // ------------------------------------------------------------- helpers

  /** Build an element. Children may be strings (inserted as text) or nodes. */
  function el(tag, attrs = {}, ...children) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v === undefined || v === null || v === false) continue;
      if (k === 'class') node.className = v;
      else if (k === 'text') node.textContent = v;
      else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
      else node.setAttribute(k, v === true ? '' : v);
    }
    for (const c of children.flat()) if (c !== null && c !== undefined) node.append(c instanceof Node ? c : document.createTextNode(String(c)));
    return node;
  }
  function svg(tag, attrs = {}, ...children) {
    const node = document.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs)) if (v !== undefined) node.setAttribute(k, v);
    for (const c of children.flat()) if (c !== null && c !== undefined) node.append(c instanceof Node ? c : document.createTextNode(String(c)));
    return node;
  }
  const clear = (node) => { while (node.firstChild) node.removeChild(node.firstChild); };
  const truncate = (s, n) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

  function download(name, text, type) {
    const url = URL.createObjectURL(new Blob([text], { type }));
    const a = el('a', { href: url, download: name });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function slug(s) {
    return String(s || 'architecture').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'architecture';
  }

  // ------------------------------------------------------------- input

  const looksLikeJson = (text) => /^\s*[{[]/.test(text);

  function updateFormatBadge() {
    const t = $('model-input').value;
    $('format-badge').textContent = !t.trim() ? 'JSON / YAML' : looksLikeJson(t) ? 'JSON' : 'YAML';
  }

  async function loadExampleList() {
    try {
      const res = await fetch('examples');
      if (!res.ok) return;
      const list = await res.json();
      const sel = $('example-select');
      for (const ex of list) sel.append(el('option', { value: ex.name, title: ex.description }, ex.title));
      if (list.length === 1) sel.value = list[0].name;
    } catch { /* examples are optional */ }
  }

  async function loadExample(name) {
    if (!name) return;
    const res = await fetch(`examples/${encodeURIComponent(name)}`);
    if (!res.ok) return showErrors('Could not load example', []);
    $('model-input').value = JSON.stringify(await res.json(), null, 2);
    updateFormatBadge();
    hideErrors();
  }

  function readFile(file) {
    if (!file) return;
    if (file.size > 1024 * 1024) return showErrors('File is larger than 1 MB', []);
    const reader = new FileReader();
    reader.onload = () => {
      $('model-input').value = String(reader.result);
      $('example-select').value = '';
      updateFormatBadge();
      hideErrors();
    };
    reader.readAsText(file);
  }

  // ------------------------------------------------------------- errors

  function showErrors(title, details) {
    const box = $('errors');
    clear(box);
    box.append(el('strong', { text: title }));
    if (details && details.length) box.append(el('ul', {}, details.map((d) => el('li', { text: d }))));
    box.hidden = false;
  }
  function hideErrors() { $('errors').hidden = true; }

  // ------------------------------------------------------------- analyse

  async function analyse() {
    const text = $('model-input').value;
    if (!text.trim()) return showErrors('Paste a model, choose an example or upload a file first.', []);
    hideErrors();

    const isJson = looksLikeJson(text);
    let body = text;
    if (isJson) {
      try { state.model = JSON.parse(text); } catch (e) { return showErrors('The JSON is not valid', [e.message]); }
      body = JSON.stringify(state.model);
    } else {
      state.model = null; // diagram is drawn from the report's model after a YAML round trip below
    }

    const btn = $('analyze-btn');
    btn.disabled = true;
    btn.textContent = 'Analysing…';
    try {
      const scoring = $('scoring-select').value;
      const res = await fetch(`analyze?scoring=${encodeURIComponent(scoring)}`, {
        method: 'POST',
        headers: { 'content-type': isJson ? 'application/json' : 'application/yaml' },
        body,
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 422) return showErrors('The model failed validation', data.details || []);
      if (res.status === 429) return showErrors('Too many requests — please wait a minute and try again.', []);
      if (!res.ok) return showErrors(data.error || `Request failed (${res.status})`, data.details || []);
      if (!state.model) state.model = parseYamlForDiagram(text);
      state.report = data;
      state.filters = { severity: '', category: '', target: '' };
      state.open.clear();
      renderReport();
    } catch (e) {
      showErrors('Could not reach the server', [e.message]);
    } finally {
      btn.disabled = false;
      btn.textContent = 'Analyse';
    }
  }

  /**
   * The diagram needs component/boundary/flow structure. For YAML input we
   * don't ship a YAML parser to the browser; instead we ask nothing extra of
   * the server and simply skip the diagram (the table still works).
   */
  function parseYamlForDiagram() { return null; }

  // ------------------------------------------------------------- render

  function renderReport() {
    const r = state.report;
    $('empty-state').hidden = true;
    $('report').hidden = false;
    $('downloads').hidden = false;

    const method = { risk: 'likelihood × impact (OWASP matrix)', mean: 'classic DREAD mean', weighted: 'weighted DREAD' }[r.scoring.method] || r.scoring.method;
    $('report-meta').textContent = `${r.model.name} · ${r.model.components} components, ${r.model.dataFlows} data flows, `
      + `${r.model.trustBoundaries} trust boundaries · ${r.summary.coverage.rulesTriggered}/${r.summary.coverage.rulesEvaluated} rules triggered · `
      + `scoring: ${method} · rule base ${r.tool.ruleBaseVersion}`;

    renderCards(r);
    renderBars(r);
    renderDiagram(r);
    renderFilters(r);
    renderFindings();
  }

  function renderCards(r) {
    const box = $('severity-cards');
    clear(box);
    for (const s of SEVERITIES) {
      const n = r.summary.bySeverity[s] || 0;
      box.append(el('button', {
        class: `card sev-${s}`, type: 'button', title: `Show ${s} findings`,
        onclick: () => { state.filters.severity = state.filters.severity === s ? '' : s; $('filter-severity').value = state.filters.severity; renderFindings(); },
      }, el('div', { class: 'n', text: String(n) }), el('div', { class: 'l', text: s })));
    }
  }

  function renderBars(r) {
    const box = $('stride-bars');
    clear(box);
    const max = Math.max(1, ...STRIDE.map((c) => r.summary.byCategory[c] || 0));
    for (const c of STRIDE) {
      const n = r.summary.byCategory[c] || 0;
      const fill = el('div', { class: 'fill' });
      fill.style.width = `${(n / max) * 100}%`;
      box.append(el('div', { class: `bar${n ? '' : ' zero'}` },
        el('span', { class: 'lbl', text: c }), el('div', { class: 'track' }, fill), el('span', { class: 'v', text: String(n) })));
    }
  }

  // ---------- architecture diagram (columns = trust boundaries, ordered by trust level)

  function renderDiagram(r) {
    const box = $('diagram');
    clear(box);
    const m = state.model;
    if (!m || !Array.isArray(m.components) || !Array.isArray(m.trustBoundaries)) {
      box.append(el('p', { class: 'muted small', text: 'Diagram is shown for JSON input.' }));
      return;
    }

    // worst severity per target
    const worst = new Map();
    for (const f of r.findings) {
      const cur = worst.get(f.target.id);
      if (!cur || RANK[f.severity] > RANK[cur]) worst.set(f.target.id, f.severity);
    }

    const zones = [...m.trustBoundaries].sort((a, b) => (a.level - b.level) || String(a.id).localeCompare(String(b.id)));
    const W = 168; const H = 46; const GAPX = 54; const GAPY = 16; const PAD = 14; const TOP = 34;
    const colOf = new Map(zones.map((z, i) => [z.id, i]));
    const pos = new Map();
    const perCol = zones.map(() => 0);
    for (const c of [...m.components].sort((a, b) => String(a.id).localeCompare(String(b.id)))) {
      const col = colOf.get(c.trustBoundary);
      if (col === undefined) continue;
      const row = perCol[col]++;
      pos.set(c.id, { x: PAD + col * (W + GAPX) + 10, y: TOP + row * (H + GAPY), c });
    }
    const rows = Math.max(1, ...perCol);
    const width = PAD * 2 + zones.length * (W + 20) + (zones.length - 1) * (GAPX - 20);
    const height = TOP + rows * (H + GAPY) + 8;

    const root = svg('svg', { viewBox: `0 0 ${width} ${height}`, role: 'img', 'aria-label': `Architecture diagram of ${m.name || 'the model'}` });
    root.append(svg('defs', {}, svg('marker', { id: 'arr', viewBox: '0 0 10 10', refX: '9', refY: '5', markerWidth: '7', markerHeight: '7', orient: 'auto-start-reverse' },
      svg('path', { d: 'M0,0 L10,5 L0,10 z', class: 'arrow' }))));

    zones.forEach((z, i) => {
      const x = PAD + i * (W + GAPX);
      root.append(svg('rect', { class: 'zone', x, y: 4, width: W + 20, height: height - 8, rx: 8 }));
      root.append(svg('text', { class: 'zone-label', x: x + 10, y: 22 }, truncate(`${z.name} · L${z.level}`, 28)));
    });

    for (const f of (m.dataFlows || [])) {
      const a = pos.get(f.from); const b = pos.get(f.to);
      if (!a || !b) continue;
      const sev = worst.get(f.id);
      let d;
      if (a.x === b.x) {
        const x = a.x + W; const y1 = a.y + H / 2; const y2 = b.y + H / 2;
        d = `M${x},${y1} C${x + 34},${y1} ${x + 34},${y2} ${x},${y2}`;
      } else {
        const fwd = b.x > a.x;
        const x1 = fwd ? a.x + W : a.x; const x2 = fwd ? b.x : b.x + W;
        const y1 = a.y + H / 2; const y2 = b.y + H / 2; const mx = (x1 + x2) / 2;
        d = `M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`;
      }
      const path = svg('path', { d, class: `flow${sev ? ` sev-${sev}` : ''}`, 'marker-end': 'url(#arr)' },
        svg('title', {}, `${f.id}: ${a.c.name} → ${b.c.name} (${f.protocol})${sev ? ` — ${sev}` : ''}`));
      root.append(path);
    }

    for (const { x, y, c } of pos.values()) {
      const sev = worst.get(c.id);
      const g = svg('g', { class: `node${sev ? ` sev-${sev}` : ''}${state.filters.target === c.id ? ' selected' : ''}`, tabindex: '0', role: 'button',
        'aria-label': `${c.name}${sev ? `, worst finding ${sev}` : ', no findings'}` });
      g.append(svg('title', {}, `${c.name} (${c.type})${sev ? ` — worst finding: ${sev}` : ' — no findings'}`));
      g.append(svg('rect', { x, y, width: W, height: H, rx: 7 }));
      if (sev) g.append(svg('circle', { class: 'dot', cx: x + W - 10, cy: y + 10, r: 4.5 }));
      g.append(svg('text', { x: x + 9, y: y + 19 }, truncate(c.name, 25)));
      g.append(svg('text', { class: 'type', x: x + 9, y: y + 35 }, c.type));
      const pick = () => { state.filters.target = state.filters.target === c.id ? '' : c.id; renderDiagram(state.report); renderFindings(); };
      g.addEventListener('click', pick);
      g.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } });
      root.append(g);
    }

    box.append(root);
    box.append(el('div', { class: 'legend' },
      SEVERITIES.map((s) => el('span', { class: `sev-${s}` }, el('i'), s)),
      el('span', {}, 'Dashed line = flow with a finding')));
  }

  // ---------- filters + findings table

  function renderFilters(r) {
    const sev = $('filter-severity');
    const cat = $('filter-category');
    for (const [sel, values, all] of [[sev, SEVERITIES, 'All severities'], [cat, STRIDE, 'All categories']]) {
      clear(sel);
      sel.append(el('option', { value: '' }, all));
      for (const v of values) sel.append(el('option', { value: v }, v));
    }
    sev.value = state.filters.severity;
    cat.value = state.filters.category;
  }

  function visibleFindings() {
    const { severity, category, target } = state.filters;
    return state.report.findings.filter((f) => (!severity || f.severity === severity)
      && (!category || f.category === category) && (!target || f.target.id === target));
  }

  function renderFindings() {
    const r = state.report;
    const body = $('findings-body');
    clear(body);
    const list = visibleFindings();
    $('findings-count').textContent = list.length === r.findings.length ? `(${list.length})` : `(${list.length} of ${r.findings.length})`;

    const chip = $('clear-target');
    if (state.filters.target) {
      const name = (r.findings.find((f) => f.target.id === state.filters.target) || { target: { name: state.filters.target } }).target.name;
      chip.textContent = `Target: ${truncate(name, 30)} ✕`;
      chip.hidden = false;
    } else chip.hidden = true;

    if (!r.findings.length) {
      body.append(el('tr', {}, el('td', { colspan: '5' }, el('div', { class: 'clean', text: 'No threats found by the current rule base.' }))));
      return;
    }
    if (!list.length) {
      body.append(el('tr', {}, el('td', { colspan: '5', class: 'no-results', text: 'No findings match these filters.' })));
      return;
    }

    for (const f of list) {
      const open = state.open.has(f.id);
      const row = el('tr', {
        class: `row${open ? ' open' : ''}`, tabindex: '0', 'aria-expanded': String(open),
        onclick: () => toggle(f.id),
        onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(f.id); } },
      },
      el('td', {}, el('span', { class: `pill sev-${f.severity}`, text: f.severity })),
      el('td', { class: 'num', text: f.score.toFixed(1) }),
      el('td', {}, el('span', { class: 'rule', text: f.ruleId })),
      el('td', {}, f.title, el('span', { class: 'cat', text: f.category })),
      el('td', { text: f.target.name }));
      body.append(row);
      if (open) body.append(detailRow(f));
    }
  }

  function toggle(id) {
    if (state.open.has(id)) state.open.delete(id); else state.open.add(id);
    renderFindings();
  }

  function detailRow(f) {
    const vec = el('div', { class: 'dread' }, DREAD.map(([k, abbr, label]) => el('div', {
      class: f.dread.final[k] !== f.dread.base[k] ? 'changed' : '', title: `${label}: base ${f.dread.base[k]} → final ${f.dread.final[k]}`,
    }, el('b', { text: String(f.dread.final[k]) }), el('span', { text: abbr }))));

    const left = el('div', {},
      el('h4', { text: 'Threat' }), el('p', { text: f.description }),
      el('h4', { text: 'Remediation' }), el('ul', {}, f.remediation.map((x) => el('li', { text: x }))),
      f.references.length ? el('p', { class: 'refs', text: `References: ${f.references.join(' · ')}` }) : null);

    const right = el('div', {},
      el('h4', { text: 'DREAD (final)' }), vec,
      f.dread.risk ? el('div', { class: 'li' },
        el('span', { text: `Likelihood ${f.dread.risk.likelihood} (${f.dread.risk.likelihoodLevel})` }),
        el('span', { text: `Impact ${f.dread.risk.impact} (${f.dread.risk.impactLevel})` })) : null,
      el('h4', { text: 'Why this score' }),
      f.dread.adjustments.length
        ? el('ul', {}, f.dread.adjustments.map((a) => el('li', { text: `${a.reason} (${Object.entries(a.delta).map(([k, v]) => `${k} ${v > 0 ? '+' : ''}${v}`).join(', ')})` })))
        : el('p', { class: 'muted', text: 'Base ratings from the rule; no context adjustments applied.' }),
      el('p', { class: 'muted small', text: `${f.target.type} · ${f.target.id}` }));

    return el('tr', { class: 'detail' }, el('td', { colspan: '5' }, el('div', { class: 'detail-grid' }, left, right)));
  }

  // ------------------------------------------------------------- downloads

  async function downloadMarkdown() {
    const text = $('model-input').value;
    const isJson = looksLikeJson(text);
    const res = await fetch(`analyze?format=md&scoring=${encodeURIComponent(state.report.scoring.method)}`, {
      method: 'POST', headers: { 'content-type': isJson ? 'application/json' : 'application/yaml' }, body: isJson ? JSON.stringify(JSON.parse(text)) : text,
    });
    if (!res.ok) return showErrors('Could not generate the Markdown report', []);
    download(`${slug(state.report.model.name)}-threat-report.md`, await res.text(), 'text/markdown');
  }

  // ------------------------------------------------------------- wire up

  document.addEventListener('DOMContentLoaded', () => {
    $('example-select').addEventListener('change', (e) => loadExample(e.target.value));
    $('file-input').addEventListener('change', (e) => readFile(e.target.files[0]));
    $('model-input').addEventListener('input', updateFormatBadge);
    $('model-input').addEventListener('keydown', (e) => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') analyse(); });
    $('analyze-btn').addEventListener('click', analyse);
    $('filter-severity').addEventListener('change', (e) => { state.filters.severity = e.target.value; renderFindings(); });
    $('filter-category').addEventListener('change', (e) => { state.filters.category = e.target.value; renderFindings(); });
    $('clear-target').addEventListener('click', () => { state.filters.target = ''; renderDiagram(state.report); renderFindings(); });
    $('dl-json').addEventListener('click', () => download(`${slug(state.report.model.name)}-threat-report.json`, `${JSON.stringify(state.report, null, 2)}\n`, 'application/json'));
    $('dl-md').addEventListener('click', downloadMarkdown);
    updateFormatBadge();
    loadExampleList().then(() => loadExample($('example-select').value));
  });
})();
