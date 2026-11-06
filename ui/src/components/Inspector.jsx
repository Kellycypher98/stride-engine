import { DREAD, RISK_MATRIX, SCORING_LABEL } from '../constants.js';

const LEVELS = ['Low', 'Medium', 'High'];
const WASH = { Critical: 'bg-critical-wash', High: 'bg-high-wash', Medium: 'bg-medium-wash', Low: 'bg-low-wash' };

function Block({ title, children }) {
  return (
    <section className="mt-5">
      <h3 className="mb-1.5 font-bold">{title}</h3>
      {children}
    </section>
  );
}

function RiskMatrix({ finding }) {
  const { risk } = finding.dread;
  return (
    <div>
      <span className="text-xs text-ink-2">Impact</span>
      <div
        role="img"
        aria-label={`Risk matrix: likelihood ${risk.likelihoodLevel}, impact ${risk.impactLevel}, severity ${finding.severity}`}
        className="grid auto-rows-[34px] grid-cols-[52px_repeat(3,60px)] gap-0.5 text-[11px]"
      >
        {['High', 'Medium', 'Low'].map((imp) => [
          <span key={`${imp}-ax`} className="flex items-center text-ink-2">{imp}</span>,
          ...LEVELS.map((lik) => {
            const sev = RISK_MATRIX[imp][lik];
            const here = imp === risk.impactLevel && lik === risk.likelihoodLevel;
            return (
              <span
                key={`${imp}-${lik}`}
                title={`Impact ${imp}, likelihood ${lik}: ${sev}`}
                className={`flex items-center justify-center rounded-[3px] font-bold ${WASH[sev]} ${here ? 'outline-2 -outline-offset-2 outline-ink' : ''}`}
              >
                {here ? '●' : sev}
              </span>
            );
          }),
        ])}
        <span />
        {LEVELS.map((l) => <span key={l} className="flex items-center justify-center text-ink-2">{l}</span>)}
        <span />
        <span className="col-span-3 text-center text-ink-2">Likelihood</span>
      </div>
    </div>
  );
}

function Risk({ finding, scoring }) {
  const { risk } = finding.dread;
  if (!risk) {
    return (
      <Block title={`Risk score ${finding.score.toFixed(1)}`}>
        <p className="text-xs text-ink-2">
          {SCORING_LABEL[scoring]} of the five DREAD ratings below. Bands: Critical from 9, High from 7, Medium from 4.
        </p>
      </Block>
    );
  }
  return (
    <Block title={`Risk: ${finding.severity}, score ${finding.score.toFixed(1)}`}>
      <div className="grid items-start gap-x-5 gap-y-4 sm:grid-cols-[auto_minmax(0,1fr)]">
        <RiskMatrix finding={finding} />
        <div className="space-y-1 text-xs text-ink-2">
          <p>Likelihood <b className="text-ink">{risk.likelihoodLevel} ({risk.likelihood})</b>, the average of reproducibility, exploitability and discoverability.</p>
          <p>Impact <b className="text-ink">{risk.impactLevel} ({risk.impact})</b>, the average of damage and affected users.</p>
          <p>The OWASP risk matrix places this in <b className="text-ink">{finding.severity}</b>. The score, likelihood × impact ÷ 10, orders threats within a band.</p>
        </div>
      </div>
    </Block>
  );
}

function Dread({ finding }) {
  const { base, final, adjustments } = finding.dread;
  const nameOf = (k) => DREAD.find((d) => d[0] === k)[1].toLowerCase();
  return (
    <Block title="DREAD ratings">
      <div className="grid grid-cols-[120px_minmax(0,1fr)_28px] items-center gap-x-2.5 gap-y-1.5 text-xs max-sm:grid-cols-[104px_minmax(0,1fr)_24px]">
        {DREAD.map(([k, label]) => {
          const moved = final[k] - base[k];
          return [
            <span key={`${k}-l`} className="text-ink-2">{label}</span>,
            <span key={`${k}-t`} className="relative h-2 rounded bg-grid-soft" aria-hidden="true">
              <span className="absolute inset-y-0 left-0 rounded bg-ink-2" style={{ width: `${final[k] * 10}%` }} />
              <span className="absolute -inset-y-[3px] w-0.5 bg-ink" style={{ left: `calc(${base[k] * 10}% - 1px)` }} title={`Rule baseline ${base[k]}`} />
            </span>,
            <span
              key={`${k}-v`}
              aria-label={`${label} ${final[k]}, rule baseline ${base[k]}`}
              className={`text-right font-bold tabular-nums ${moved > 0 ? 'text-critical' : moved < 0 ? 'text-low' : ''}`}
            >
              {final[k]}
            </span>,
          ];
        })}
      </div>
      <div className="mt-2.5 text-xs">
        {adjustments.length ? (
          <ul className="list-disc pl-[18px] text-ink-2">
            {adjustments.map((a) => (
              <li key={a.id}>
                <span className="text-ink">{a.reason}</span>
                {`: ${Object.entries(a.delta).map(([k, v]) => `${nameOf(k)} ${v > 0 ? '+' : ''}${v}`).join(', ')}`}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-ink-2">No context adjustments. These are the rule’s baseline ratings.</p>
        )}
        <p className="mt-1 text-ink-2">The black tick marks the rule’s baseline; the bar shows the rating after adjusting for this model.</p>
      </div>
    </Block>
  );
}

export default function Inspector({ finding, scoring, onTarget }) {
  if (!finding) return null;
  const f = finding;
  const kind = f.target.type === 'dataFlow' ? 'data flow' : f.target.type;
  return (
    <article
      aria-live="polite"
      className="max-h-[calc(100vh-96px)] overflow-auto rounded-lg border border-grid bg-sheet px-[22px] pt-5 pb-6 min-[900px]:sticky min-[900px]:top-[76px] max-[899px]:max-h-none"
    >
      <p className="inline-flex items-center gap-2 text-xs font-bold">
        <i className={`bg-sev-${f.severity} size-2.5 rounded-full`} aria-hidden="true" />
        {f.severity} {f.category} threat, rule {f.ruleId}
      </p>
      <h2 className="mt-1.5 mb-1 text-xl leading-tight font-bold tracking-tight">{f.title}</h2>
      <p className="text-ink-2">
        On the {kind}{' '}
        {f.target.type === 'system'
          ? <b className="text-ink">{f.target.name}</b>
          : <button type="button" className="text-action underline underline-offset-2" onClick={() => onTarget(f.target.id)}>{f.target.name}</button>}
        .
      </p>

      <Block title="What can happen"><p className="max-w-[66ch]">{f.description}</p></Block>
      <Block title="How to fix it">
        <ul className="max-w-[66ch] list-disc space-y-1 pl-[18px]">{f.remediation.map((r) => <li key={r}>{r}</li>)}</ul>
      </Block>
      <Risk finding={f} scoring={scoring} />
      <Dread finding={f} />
      {f.references.length > 0 && <p className="mt-2 text-xs text-ink-2">References: {f.references.join(', ')}</p>}
    </article>
  );
}
