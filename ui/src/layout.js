/*
 * Data flow diagram layout.
 *
 * Pure function of the validated architecture, so it is deterministic and
 * unit-testable without a browser. Trust zones become columns ordered by trust
 * level (internet on the left); components are ordered within a column by a
 * barycentre heuristic to reduce crossing flows; each flow gets its own port on
 * the node side it leaves or enters, ordered by the height of the other end.
 */

import { linkHorizontal } from 'd3-shape';
import { path as d3path } from 'd3-path';
import { cut } from './constants.js';

export const GEOMETRY = Object.freeze({
  NODE_W: 176, NODE_H: 58, COL_W: 214, ROW_GAP: 24, HEAD: 120, PAD_X: 8, PAD_BOTTOM: 52,
});

const link = linkHorizontal().x((p) => p.x).y((p) => p.y);

/** Word-wrap to at most two lines of about n characters; the second line is truncated. */
export function wrap(text, n) {
  if (text.length <= n) return [text];
  const words = text.split(/\s+/);
  let first = '';
  while (words.length && `${first} ${words[0]}`.trim().length <= n) first = `${first} ${words.shift()}`.trim();
  if (!first) return [cut(text, n)];
  return [first, cut(words.join(' '), n)];
}

function cubicPoint(p0, c1, c2, p1, t) {
  const u = 1 - t;
  return {
    x: u * u * u * p0.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * p1.x,
    y: u * u * u * p0.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * p1.y,
  };
}

export function layoutDfd(arch) {
  const { NODE_W, NODE_H, COL_W, ROW_GAP, HEAD, PAD_X, PAD_BOTTOM } = GEOMETRY;
  const comps = new Map(arch.components.map((c) => [c.id, c]));

  const zones = arch.trustBoundaries.map((z, i) => ({ ...z, order: i }))
    .sort((a, b) => (a.level - b.level) || (a.order - b.order));
  const colOf = new Map(zones.map((z, i) => [z.id, i]));
  const columns = zones.map(() => []);
  for (const c of arch.components) columns[colOf.get(c.trustBoundary)].push(c.id);

  // Barycentre ordering: a few sweeps reduce crossings without a layout engine.
  const nbrs = new Map(arch.components.map((c) => [c.id, []]));
  for (const f of arch.dataFlows) { nbrs.get(f.from).push(f.to); nbrs.get(f.to).push(f.from); }
  const colOfNode = (id) => colOf.get(comps.get(id).trustBoundary);
  for (let sweep = 0; sweep < 6; sweep += 1) {
    const rel = new Map();
    columns.forEach((ids) => ids.forEach((id, k) => rel.set(id, (k + 0.5) / ids.length)));
    columns.forEach((ids, ci) => {
      const key = new Map(ids.map((id) => {
        const ext = nbrs.get(id).filter((o) => colOfNode(o) !== ci);
        return [id, ext.length ? ext.reduce((s, o) => s + rel.get(o), 0) / ext.length : rel.get(id)];
      }));
      ids.sort((a, b) => (key.get(a) - key.get(b)) || (a < b ? -1 : 1));
    });
  }

  const maxRows = Math.max(1, ...columns.map((c) => c.length));
  const bodyH = maxRows * NODE_H + (maxRows - 1) * ROW_GAP;
  const nodes = new Map();
  columns.forEach((ids, ci) => {
    const h = ids.length * NODE_H + (ids.length - 1) * ROW_GAP;
    const top = HEAD + (bodyH - h) / 2;
    ids.forEach((id, k) => {
      const c = comps.get(id);
      nodes.set(id, {
        id, component: c, col: ci,
        x: PAD_X + ci * COL_W + (COL_W - NODE_W) / 2, y: top + k * (NODE_H + ROW_GAP), w: NODE_W, h: NODE_H,
      });
    });
  });

  // Ports: flows leave/enter on the side facing the other end; same-zone flows loop on the right.
  const sides = new Map();
  for (const f of arch.dataFlows) {
    const a = nodes.get(f.from); const b = nodes.get(f.to);
    const same = a.col === b.col;
    const fromSide = same || b.col > a.col ? 'r' : 'l';
    const toSide = same ? 'r' : b.col > a.col ? 'l' : 'r';
    for (const [node, side, other, end] of [[a, fromSide, b, 'from'], [b, toSide, a, 'to']]) {
      const key = `${node.id}:${side}`;
      if (!sides.has(key)) sides.set(key, []);
      sides.get(key).push({ flow: f.id, end, otherY: other.y, node, side });
    }
  }
  const ports = new Map();
  for (const list of sides.values()) {
    list.sort((u, v) => (u.otherY - v.otherY) || (u.flow < v.flow ? -1 : 1));
    list.forEach((item, k) => {
      const { node, side } = item;
      ports.set(`${item.flow}:${item.end}`, {
        x: side === 'r' ? node.x + node.w : node.x, y: node.y + (node.h * (k + 1)) / (list.length + 1), side,
      });
    });
  }

  const flows = arch.dataFlows.map((f) => {
    const p1 = ports.get(`${f.id}:from`);
    const p2 = ports.get(`${f.id}:to`);
    let d; let mid;
    if (p1.side === p2.side) {
      // Same-zone loop, kept inside the gap between zones.
      const reach = Math.min(24, 14 + Math.abs(p2.y - p1.y) * 0.05);
      const c1 = { x: p1.x + reach, y: p1.y }; const c2 = { x: p2.x + reach, y: p2.y };
      const p = d3path();
      p.moveTo(p1.x, p1.y);
      p.bezierCurveTo(c1.x, c1.y, c2.x, c2.y, p2.x, p2.y);
      d = p.toString();
      mid = cubicPoint(p1, c1, c2, p2, 0.5);
    } else {
      d = link({ source: p1, target: p2 });
      const mx = (p1.x + p2.x) / 2;
      mid = cubicPoint(p1, { x: mx, y: p1.y }, { x: mx, y: p2.y }, p2, 0.5);
    }
    return { id: f.id, flow: f, from: comps.get(f.from), to: comps.get(f.to), d, mid };
  });

  return {
    zones: zones.map((z, i) => ({ ...z, x: PAD_X + i * COL_W })),
    axisY: 18,
    zoneY: 52,
    nodes: [...nodes.values()],
    flows,
    width: PAD_X * 2 + zones.length * COL_W,
    height: HEAD + bodyH + PAD_BOTTOM,
  };
}
