export const STRIDE = [
  ['S', 'Spoofing'], ['T', 'Tampering'], ['R', 'Repudiation'],
  ['I', 'Information Disclosure'], ['D', 'Denial of Service'], ['E', 'Elevation of Privilege'],
];

export const SEVERITIES = ['Critical', 'High', 'Medium', 'Low'];
export const RANK = { Low: 0, Medium: 1, High: 2, Critical: 3 };

export const DREAD = [
  ['damage', 'Damage'], ['reproducibility', 'Reproducibility'], ['exploitability', 'Exploitability'],
  ['affectedUsers', 'Affected users'], ['discoverability', 'Discoverability'],
];

/** OWASP Risk Rating severity matrix, [impact][likelihood]; mirrors src/engine/dread.js. */
export const RISK_MATRIX = {
  High: { Low: 'Medium', Medium: 'High', High: 'Critical' },
  Medium: { Low: 'Low', Medium: 'Medium', High: 'High' },
  Low: { Low: 'Low', Medium: 'Low', High: 'Medium' },
};

/** DFD shape per component type; mirrors KINDS in src/schema/architecture.js. */
export const KIND = {
  user: 'actor', external_service: 'actor',
  database: 'store', object_storage: 'store', cache: 'store', queue: 'store',
};
export const kindOf = (type) => KIND[type] || 'process';

export const SCORING_LABEL = { risk: 'likelihood × impact', mean: 'DREAD mean', weighted: 'weighted DREAD' };

export const worse = (a, b) => (!a || RANK[b] > RANK[a] ? b : a);
export const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
export const cut = (s, n) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
export const typeLabel = (t) => t.replace(/_/g, ' ');

/** Value of the model picker when the editor holds a hand-edited model. */
export const CUSTOM = '__custom__';
