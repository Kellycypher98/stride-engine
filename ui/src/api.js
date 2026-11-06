/** Thin client for the stride-engine REST API (same origin). */

export const looksLikeJson = (text) => /^\s*[{[]/.test(text);

export class ModelError extends Error {
  constructor(title, details = []) {
    super(title);
    this.details = details;
  }
}

export async function listExamples() {
  try {
    const res = await fetch('examples');
    return res.ok ? res.json() : [];
  } catch {
    return [];
  }
}

export async function getExample(name) {
  const res = await fetch(`examples/${encodeURIComponent(name)}`);
  if (!res.ok) throw new ModelError('Could not load that example. Paste a model instead.');
  return JSON.stringify(await res.json(), null, 2);
}

function body(text) {
  if (!looksLikeJson(text)) return { type: 'application/yaml', body: text };
  try {
    return { type: 'application/json', body: JSON.stringify(JSON.parse(text)) };
  } catch (e) {
    throw new ModelError('The JSON could not be read.', [e.message]);
  }
}

/** Analyse a model; resolves to { report, architecture }. */
export async function analyse(text, scoring) {
  if (!text.trim()) throw new ModelError('Paste a model, upload a file, or choose an example.');
  const req = body(text);
  let res;
  try {
    res = await fetch(`analyze?include=architecture&scoring=${encodeURIComponent(scoring)}`, {
      method: 'POST', headers: { 'content-type': req.type }, body: req.body,
    });
  } catch (e) {
    throw new ModelError('Could not reach the stride-engine server.', [e.message]);
  }
  const data = await res.json().catch(() => ({}));
  if (res.status === 422) throw new ModelError('The model has problems. Fix these and analyse again:', data.details || []);
  if (res.status === 429) throw new ModelError('Too many analyses in a short time. Wait a minute, then try again.');
  if (!res.ok) throw new ModelError(`The server rejected the model: ${data.error || `status ${res.status}`}.`, data.details || []);
  const { architecture, ...report } = data;
  return { report, architecture };
}

export async function markdownReport(text, scoring) {
  const req = body(text);
  const res = await fetch(`analyze?format=md&scoring=${encodeURIComponent(scoring)}`, {
    method: 'POST', headers: { 'content-type': req.type }, body: req.body,
  });
  if (!res.ok) throw new ModelError('Could not build the Markdown report. Analyse the model again, then retry.');
  return res.text();
}

export function download(name, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const slug = (s) => String(s || 'architecture').toLowerCase()
  .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'architecture';
