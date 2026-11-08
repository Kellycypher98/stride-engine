import { useEffect, useRef } from 'react';

const DOCS = 'https://github.com/Kellycypher98/stride-engine/blob/master/docs';

function Step({ n, title, children }) {
  return (
    <li className="grid grid-cols-[28px_minmax(0,1fr)] gap-x-3">
      <span className="flex size-7 items-center justify-center rounded-full border border-grid font-bold" aria-hidden="true">{n}</span>
      <div>
        <h4 className="font-bold">{title}</h4>
        <div className="mt-0.5 text-ink-2">{children}</div>
      </div>
    </li>
  );
}

/** Plain-language explainer; mirrors docs/how-it-works.md. */
export default function HowItWorks({ open, onClose, onTry }) {
  const panel = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const opener = document.activeElement;
    panel.current?.focus();
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('keydown', onKey); opener?.focus?.(); };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <>
      <div className="fixed inset-0 z-30 bg-[rgb(10_16_14/.35)]" onClick={onClose} aria-hidden="true" />
      <aside
        ref={panel}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="how-h"
        className="fixed inset-y-0 right-0 z-40 w-[min(620px,100vw)] overflow-y-auto border-l border-grid bg-sheet px-[clamp(16px,3vw,32px)] py-5 outline-none"
      >
        <div className="flex items-center justify-between">
          <h2 id="how-h" className="text-lg font-bold">How stride-engine works</h2>
          <button type="button" className="btn btn-quiet" onClick={onClose}>Close</button>
        </div>

        <section className="mt-5">
          <h3 className="text-xl leading-tight font-bold tracking-tight">It reads a description, not your system</h3>
          <p className="mt-2 max-w-[62ch]">
            stride-engine <b>never connects to your APIs, servers or cloud account</b>. It doesn’t scan or test anything
            that is running. It reads a short file that <i>describes</i> how your system is built, and works out what
            could go wrong with that design.
          </p>
          <p className="mt-2 max-w-[62ch] text-ink-2">
            Like a building inspector reviewing blueprints: “the vault door has no lock” can be spotted from the
            drawing, before anything is built. Your model file is the blueprint.
          </p>

          <div className="mt-4 grid grid-cols-[1fr_auto_1fr_auto_1fr] items-center gap-2 text-center text-xs" aria-hidden="true">
            <span className="rounded-md border border-grid bg-paper px-2 py-3">Your model file<br /><span className="text-ink-2">how it’s built</span></span>
            <span className="text-ink-2">→</span>
            <span className="rounded-md border border-ink bg-paper px-2 py-3 font-bold">stride-engine<br /><span className="font-normal text-ink-2">18 STRIDE rules</span></span>
            <span className="text-ink-2">→</span>
            <span className="rounded-md border border-grid bg-paper px-2 py-3">Threats<br /><span className="text-ink-2">with fixes</span></span>
          </div>
        </section>

        <section className="mt-7">
          <h3 className="font-bold">How it differs from a scanner</h3>
          <table className="mt-2 w-full border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-grid text-ink-2">
                <th className="py-1.5 pr-3 font-normal" scope="col"><span className="sr-only">Aspect</span></th>
                <th className="py-1.5 pr-3 font-bold text-ink" scope="col">stride-engine</th>
                <th className="py-1.5 font-bold text-ink" scope="col">Scanners (ZAP, Burp)</th>
              </tr>
            </thead>
            <tbody>
              {[
                ['Looks at', 'A description of the design', 'A running application'],
                ['When', 'Before or while you build', 'After it is deployed'],
                ['Finds', 'Design flaws: missing controls, risky data paths', 'Bugs in the live code'],
                ['Needs access to your system', 'No', 'Yes'],
              ].map(([k, a, b]) => (
                <tr key={k} className="border-b border-grid-soft align-top">
                  <th scope="row" className="py-1.5 pr-3 font-normal text-ink-2">{k}</th>
                  <td className="py-1.5 pr-3">{a}</td>
                  <td className="py-1.5">{b}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="mt-7">
          <h3 className="font-bold">What you do</h3>
          <ol className="mt-3 space-y-4">
            <Step n={1} title="Describe your system">
              In a model file: who uses it, which services and databases exist, how data moves between them, and which
              security controls each one has. Start from the template; a typical service takes 20–30 minutes.
            </Step>
            <Step n={2} title="Analyse it">
              Here in the browser, from the command line, or automatically in your CI pipeline.
            </Step>
            <Step n={3} title="Read the threats">
              Each one names its STRIDE category, how serious it is and why, and how to fix it. For example:
              “Order database is a single point of failure. Deploy it across availability zones.”
            </Step>
            <Step n={4} title="Fix the design, or accept the risk">
              Then update the model so it matches reality.
            </Step>
            <Step n={5} title="Keep the file with your code">
              When the design changes, update the model. Your pipeline re-runs the analysis and fails the build if a
              serious new threat appears.
            </Step>
          </ol>
        </section>

        <section className="mt-7 border-l-[3px] border-medium bg-medium-wash px-3 py-2.5">
          <h3 className="font-bold">The one thing to get right</h3>
          <p className="mt-1 max-w-[62ch]">
            The result is only as accurate as the description. Any control you don’t mention counts as{' '}
            <b>missing</b>, and anything you say is in place is believed. Describe the system as it really is.
          </p>
        </section>

        <section className="mt-7">
          <h3 className="font-bold">Try it in two minutes</h3>
          <ol className="mt-2 max-w-[62ch] list-decimal space-y-1 pl-5">
            <li>Open the template and analyse it. It describes a well-protected system, so no threats appear.</li>
            <li>Change <code className="font-mono text-[13px]">encryptionAtRest: true</code> to <code className="font-mono text-[13px]">false</code> on the database and analyse again. A new threat appears.</li>
          </ol>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button type="button" className="btn btn-primary" onClick={onTry}>Open the template</button>
            <a className="text-action underline underline-offset-2" href={`${DOCS}/modelling-guide.md`} target="_blank" rel="noopener noreferrer">Read the modelling guide</a>
          </div>
        </section>
      </aside>
    </>
  );
}
