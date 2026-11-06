import { useRef } from 'react';
import { cut } from '../constants.js';

function targetName(report, architecture, id) {
  const f = report.findings.find((x) => x.target.id === id);
  if (f) return f.target.name;
  return architecture?.components.find((c) => c.id === id)?.name || id;
}

export default function ThreatList({ report, architecture, visible, filters, onClear, selected, onSelect }) {
  const list = useRef(null);
  const total = report.findings.length;

  const move = (e, index) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const next = visible[index + (e.key === 'ArrowDown' ? 1 : -1)];
    if (!next) return;
    onSelect(next.id);
    list.current.querySelector(`[data-id="${CSS.escape(next.id)}"]`)?.focus();
  };

  const chips = [
    filters.category && ['category', 'Category', filters.category],
    filters.severity && ['severity', 'Severity', filters.severity],
    filters.target && ['target', 'On', targetName(report, architecture, filters.target)],
  ].filter(Boolean);

  return (
    <div id="threats">
      <div className="mb-2.5 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
        <h2 id="threats-h" className="text-lg font-bold">
          Threats <span className="font-normal text-ink-2">({visible.length === total ? total : `${visible.length} of ${total}`})</span>
        </h2>
        <div className="flex flex-wrap gap-1.5">
          {chips.map(([key, label, value]) => (
            <button
              key={key}
              type="button"
              aria-label={`Remove filter ${label} ${value}`}
              className="inline-flex min-h-7 items-center gap-1.5 rounded-full border border-grid bg-sheet px-2.5 text-xs hover:border-ink-2"
              onClick={() => onClear(key)}
            >
              <span className="text-ink-2">{label}</span>{cut(value, 28)} ✕
            </button>
          ))}
        </div>
      </div>

      <ol ref={list} className="m-0 list-none border-t border-grid p-0" aria-label="Threats, highest risk first">
        {total === 0 && (
          <li className="py-6 text-ink-2">
            <strong className="mb-1 block text-ink">No threats found.</strong>
            All {report.summary.coverage.rulesEvaluated} rules passed. Undeclared controls count as missing, so this
            model declares every control the rules check.
          </li>
        )}
        {total > 0 && visible.length === 0 && (
          <li className="py-6 text-ink-2">
            <strong className="mb-1 block text-ink">Nothing matches these filters.</strong>
            Remove a filter above to see more threats.
          </li>
        )}
        {visible.map((f, i) => (
          <li key={f.id}>
            <button
              type="button"
              data-id={f.id}
              aria-current={f.id === selected ? 'true' : undefined}
              onClick={() => onSelect(f.id)}
              onKeyDown={(e) => move(e, i)}
              className="grid w-full grid-cols-[6px_52px_minmax(0,1fr)_auto] items-center gap-x-3 border-b border-grid-soft py-2.5 pr-2.5 text-left hover:bg-sheet aria-[current=true]:bg-sheet aria-[current=true]:shadow-[inset_0_0_0_1px_var(--grid)] max-sm:grid-cols-[6px_44px_minmax(0,1fr)]"
            >
              <span className={`bg-sev-${f.severity} self-stretch rounded-r-sm`} aria-hidden="true" />
              <span className="text-right font-bold tabular-nums">
                {f.score.toFixed(1)}
                <small className="block text-[11px] font-normal text-ink-2">{f.severity}</small>
              </span>
              <span className="min-w-0">
                <span className="block font-bold">{f.title}</span>
                <span className="block truncate text-xs text-ink-2">{f.category} on {f.target.name}</span>
              </span>
              <span className="font-mono text-[12px] text-ink-2 max-sm:hidden">{f.ruleId}</span>
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
}
