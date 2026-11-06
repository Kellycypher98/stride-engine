import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { select } from 'd3-selection';
import { zoom as d3zoom, zoomIdentity, zoomTransform } from 'd3-zoom';
import 'd3-transition';
import { layoutDfd, wrap } from '../layout.js';
import { SEVERITIES, cut, kindOf, plural, typeLabel, worse } from '../constants.js';

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function Legend() {
  const item = 'inline-flex items-center gap-[7px] before:inline-block before:h-3 before:w-[22px] before:border-[1.5px] before:border-ink-2 before:content-[""]';
  return (
    <div className="flex flex-wrap gap-x-[18px] gap-y-1.5 text-xs text-ink-2" aria-hidden="true">
      <span className={`${item} before:rounded-none`}>External entity</span>
      <span className={`${item} before:rounded-lg`}>Process</span>
      <span className={`${item} before:border-r-0`}>Data store</span>
      <span className="inline-flex items-center gap-[7px] before:inline-block before:h-3.5 before:border-l-2 before:border-dashed before:border-boundary before:content-['']">Trust boundary</span>
    </div>
  );
}

function Node({ node, count, sev, selected, lit, pulse, onPick }) {
  const { x, y, w, h, component: c } = node;
  const kind = kindOf(c.type);
  const lines = wrap(c.name, kind === 'process' ? 20 : 22);
  const tx = x + (kind === 'process' ? 18 : 12);
  const top = lines.length === 1 ? y + 25 : y + 19;
  const label = `${c.name}, ${typeLabel(c.type)}. ${count ? `${plural(count, 'threat')}, worst ${sev}` : 'No threats'}`;
  return (
    <g
      className={`node${selected ? ' selected' : ''}${lit ? ' lit' : ''}${pulse ? ' pulse' : ''}`}
      data-id={c.id}
      tabIndex={0}
      role="button"
      aria-label={label}
      onClick={() => onPick(c.id)}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onPick(c.id); } }}
    >
      <title>{`${c.name} (${typeLabel(c.type)})${c.description ? `\n${c.description}` : ''}`}</title>
      {kind === 'store' ? (
        <>
          <rect className="store-fill" x={x} y={y} width={w} height={h} />
          <path className="store-line" d={`M${x + w},${y} H${x} V${y + h} H${x + w}`} />
        </>
      ) : (
        <rect className="shape" x={x} y={y} width={w} height={h} rx={kind === 'actor' ? 2 : h / 2} />
      )}
      {lines.map((ln, k) => <text key={ln} className="name" x={tx} y={top + k * 15}>{ln}</text>)}
      <text className="type" x={tx} y={top + lines.length * 15 + 1}>{typeLabel(c.type)}</text>
      {count > 0 && (
        <>
          <circle className={`badge fill-${sev}`} cx={x + w - 6} cy={y + 4} r={10} />
          <text className="badge-n" x={x + w - 6} y={y + 4.5}>{count}</text>
        </>
      )}
    </g>
  );
}

export default function Diagram({ report, architecture, filters, selected, pulse, onPick }) {
  const layout = useMemo(() => (architecture ? layoutDfd(architecture) : null), [architecture]);
  const svgRef = useRef(null);
  const gRef = useRef(null);
  const zoomRef = useRef(null);
  const initial = useRef(zoomIdentity);
  const [height, setHeight] = useState(480);

  const { worst, count } = useMemo(() => {
    const w = new Map(); const n = new Map();
    for (const f of report?.findings || []) {
      w.set(f.target.id, worse(w.get(f.target.id), f.severity));
      n.set(f.target.id, (n.get(f.target.id) || 0) + 1);
    }
    return { worst: w, count: n };
  }, [report]);

  // d3-zoom: drag to pan, pinch or Ctrl/⌘ + wheel to zoom (plain wheel keeps scrolling the page).
  useEffect(() => {
    if (!layout) return undefined;
    const svg = select(svgRef.current);
    const z = d3zoom()
      .scaleExtent([0.3, 2.5])
      .clickDistance(4)
      .filter((e) => (e.type === 'wheel' ? e.ctrlKey || e.metaKey : !e.button))
      .on('zoom', (e) => select(gRef.current).attr('transform', e.transform));
    zoomRef.current = z;
    svg.call(z);

    const cw = svgRef.current.clientWidth;
    const k = Math.min(1, Math.max(0.55, cw / layout.width));
    const tx = Math.max(0, (cw - layout.width * k) / 2);
    initial.current = zoomIdentity.translate(tx, 0).scale(k);
    setHeight(Math.ceil(layout.height * k));
    svg.call(z.transform, initial.current);
    return () => svg.on('.zoom', null);
  }, [layout]);

  const zoomBy = (factor) => select(svgRef.current).transition().duration(reducedMotion() ? 0 : 200).call(zoomRef.current.scaleBy, factor);
  const fit = () => select(svgRef.current).transition().duration(reducedMotion() ? 0 : 250).call(zoomRef.current.transform, initial.current);

  // Bring the selected threat's target into view when it is chosen from the list.
  useEffect(() => {
    if (!layout || !selected || !pulse) return;
    const id = selected.target.id;
    const node = layout.nodes.find((n) => n.id === id);
    const flow = layout.flows.find((f) => f.id === id);
    const point = node ? { x: node.x + node.w / 2, y: node.y + node.h / 2 } : flow?.mid;
    if (!point) return;
    const svgEl = svgRef.current;
    const t = zoomTransform(svgEl);
    const sx = t.applyX(point.x);
    if (sx < 40 || sx > svgEl.clientWidth - 40) {
      select(svgEl).transition().duration(reducedMotion() ? 0 : 400)
        .call(zoomRef.current.translateTo, point.x, t.invertY(svgEl.clientHeight / 2));
    }
  }, [pulse, selected, layout]);

  const pick = useCallback((id) => onPick(id), [onPick]);

  if (!report || !layout) {
    return (
      <section className="border-t border-grid pt-5 pb-7">
        <h2 className="mb-2.5 text-lg font-bold">Data flow diagram</h2>
        <p className="rounded-lg border border-grid bg-sheet p-8 text-ink-2">The diagram appears after the model is analysed.</p>
      </section>
    );
  }

  const focus = filters.target;
  const litFlows = new Set(focus ? layout.flows.filter((f) => f.id === focus || f.flow.from === focus || f.flow.to === focus).map((f) => f.id) : []);
  const litNodes = new Set(focus ? [focus, ...layout.flows.filter((f) => litFlows.has(f.id)).flatMap((f) => [f.flow.from, f.flow.to])] : []);
  const selTarget = selected?.target.id;

  return (
    <section aria-labelledby="dfd-h" className="border-t border-grid pt-5 pb-7">
      <div className="mb-2.5 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
        <h2 id="dfd-h" className="text-lg font-bold">Data flow diagram</h2>
        <Legend />
      </div>

      <div className="relative overflow-hidden rounded-lg border border-grid bg-sheet">
        <svg
          ref={svgRef}
          className={`dfd dfd-canvas block w-full${focus ? ' dim' : ''}`}
          height={height}
          role="group"
          aria-label={`Data flow diagram of ${report.model.name}. Select a component or flow to filter its threats.`}
        >
          <defs>
            {['none', ...SEVERITIES].map((s) => (
              <marker key={s} id={`ah-${s}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                <path d="M0,1 L10,5 L0,9 z" className={s === 'none' ? 'arrowhead' : `fill-${s}`} />
              </marker>
            ))}
          </defs>
          <g ref={gRef}>
            {layout.zones.map((z, i) => (
              <g key={z.id}>
                {i > 0 && <line className="boundary" x1={z.x} y1={10} x2={z.x} y2={layout.height - 10} />}
                <text className="zone-label" x={z.x + 16} y={28}><title>{z.name}</title>{cut(z.name, 27)}</text>
                <text className="zone-level" x={z.x + 16} y={46}>{`Trust level ${z.level}`}</text>
              </g>
            ))}

            {layout.flows.map((f) => {
              const sev = worst.get(f.id);
              const lit = litFlows.has(f.id) || selTarget === f.id;
              return (
                <path key={f.id} d={f.d} className={`flow${sev ? ` has sev-${sev}` : ''}${lit ? ' lit' : ''}`} markerEnd={`url(#ah-${sev || 'none'})`}>
                  <title>{`${f.from.name} to ${f.to.name} over ${f.flow.protocol}, ${f.flow.encrypted ? 'encrypted' : 'not encrypted'}${sev ? `. ${plural(count.get(f.id), 'threat')}, worst ${sev}` : ''}`}</title>
                </path>
              );
            })}

            {layout.nodes.map((n) => (
              <Node
                key={selTarget === n.id ? `${n.id}-${pulse}` : n.id}
                node={n}
                count={count.get(n.id) || 0}
                sev={worst.get(n.id)}
                selected={focus === n.id || selTarget === n.id}
                lit={litNodes.has(n.id)}
                pulse={selTarget === n.id && pulse > 0}
                onPick={pick}
              />
            ))}

            {/* Threat markers on data flows, drawn last so they sit above nodes and lines. */}
            {layout.flows.filter((f) => worst.has(f.id)).map((f) => {
              const sev = worst.get(f.id);
              const n = count.get(f.id);
              const { x, y } = f.mid;
              const name = `${f.from.name} to ${f.to.name}`;
              return (
                <g
                  key={`${f.id}-mark-${selTarget === f.id ? pulse : 0}`}
                  className={`node${litFlows.has(f.id) || selTarget === f.id ? ' lit' : ''}${focus === f.id || selTarget === f.id ? ' selected' : ''}`}
                  data-id={f.id}
                  tabIndex={0}
                  role="button"
                  aria-label={`Data flow ${name}: ${plural(n, 'threat')}, worst ${sev}`}
                  onClick={() => pick(f.id)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(f.id); } }}
                >
                  <title>{`${name}: ${plural(n, 'threat')}`}</title>
                  <rect className={`badge fill-${sev}`} x={x - 9} y={y - 9} width={18} height={18} rx={3} transform={`rotate(45 ${x} ${y})`} />
                  <text className="badge-n" x={x} y={y + 0.5}>{n}</text>
                </g>
              );
            })}
          </g>
        </svg>

        <div className="absolute right-2 bottom-2 flex gap-1">
          <button type="button" className="btn min-h-8 bg-sheet/90 px-2.5" aria-label="Zoom out" onClick={() => zoomBy(0.8)}>−</button>
          <button type="button" className="btn min-h-8 bg-sheet/90 px-2.5" aria-label="Zoom in" onClick={() => zoomBy(1.25)}>+</button>
          <button type="button" className="btn min-h-8 bg-sheet/90 px-2.5" onClick={fit}>Fit</button>
        </div>
      </div>
      <p className="mt-2 text-xs text-ink-2">Drag to pan. Pinch, or hold Ctrl or ⌘ and scroll, to zoom.</p>
    </section>
  );
}
