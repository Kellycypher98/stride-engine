import { SEVERITIES, STRIDE, SCORING_LABEL, plural } from '../constants.js';

export default function Summary({ report, filters, onToggle }) {
  if (!report) {
    return (
      <section className="py-7">
        <h1 className="text-xl font-bold">Loading model…</h1>
      </section>
    );
  }
  const { model, summary, scoring } = report;

  return (
    <section
      aria-labelledby="model-name"
      className="grid items-end gap-x-10 gap-y-5 py-7 [grid-template-areas:'title'_'stride'_'severity'] min-[1100px]:grid-cols-[minmax(0,1fr)_auto] min-[1100px]:[grid-template-areas:'title_title'_'stride_severity']"
    >
      <div className="[grid-area:title]">
        <h1 id="model-name" className="max-w-[40ch] text-xl leading-tight font-bold tracking-tight">{model.name}</h1>
        <p className="mt-1 text-ink-2">
          {plural(model.components, 'component')}, {plural(model.dataFlows, 'data flow')} and{' '}
          {plural(model.trustBoundaries, 'trust boundary', 'trust boundaries')}.{' '}
          {summary.coverage.rulesTriggered} of {summary.coverage.rulesEvaluated} rules raised a threat.
          Scored by {SCORING_LABEL[scoring.method] || scoring.method}.
        </p>
      </div>

      {/* The STRIDE acronym is the category filter: one letter per category. */}
      <div role="group" aria-label="Filter threats by STRIDE category" className="flex flex-wrap gap-1 [grid-area:stride]">
        {STRIDE.map(([letter, name]) => {
          const inCat = report.findings.filter((f) => f.category === name);
          const n = inCat.length;
          return (
            <button
              key={name}
              type="button"
              className="toggle grid min-w-[112px] justify-items-start px-2.5 pt-1.5 pb-2.5 max-sm:min-w-0 max-sm:flex-[1_1_30%]"
              aria-pressed={filters.category === name}
              aria-label={`${name}: ${plural(n, 'threat')}`}
              onClick={() => onToggle('category', name)}
            >
              <span className={`text-glyph leading-none font-bold tracking-tight max-sm:text-[2.25rem] ${n ? '' : 'text-grid'}`}>{letter}</span>
              <span className="mt-0.5 text-xs text-ink-2">{name}</span>
              <span className={`mt-1.5 text-xs ${n ? 'font-bold' : 'text-ink-2'}`}>{n ? plural(n, 'threat') : 'None found'}</span>
              {n > 0 && (
                <span className="mt-1.5 flex h-1 w-full gap-px" aria-hidden="true">
                  {SEVERITIES.map((s) => {
                    const k = inCat.filter((f) => f.severity === s).length;
                    return k ? <i key={s} className={`bg-sev-${s} block h-full`} style={{ flex: k }} /> : null;
                  })}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div role="group" aria-label="Filter threats by severity" className="flex gap-0.5 self-end [grid-area:severity]">
        {SEVERITIES.map((s) => {
          const n = summary.bySeverity[s] || 0;
          return (
            <button
              key={s}
              type="button"
              className="toggle flex min-w-[84px] flex-col items-start px-3 py-2 max-sm:min-w-0 max-sm:flex-1 max-sm:px-2"
              aria-pressed={filters.severity === s}
              aria-label={`${s}: ${plural(n, 'threat')}`}
              onClick={() => onToggle('severity', s)}
            >
              <span className={`text-xl leading-tight font-bold ${n ? '' : 'text-grid'}`}>{n}</span>
              <span className="flex items-center gap-1.5 text-xs text-ink-2">
                <i className={`bg-sev-${s} size-2 rounded-full`} aria-hidden="true" />{s}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
