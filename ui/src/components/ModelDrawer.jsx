import { useEffect, useRef } from 'react';
import { looksLikeJson } from '../api.js';
import starter from '../../../templates/starter.yaml?raw';

const GUIDE = 'https://github.com/Kellycypher98/stride-engine/blob/master/docs/modelling-guide.md';

export default function ModelDrawer({ open, draft, onDraft, onClose, onAnalyse, error, onError, busy }) {
  const textarea = useRef(null);
  const opener = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    opener.current = document.activeElement;
    textarea.current?.focus();
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      opener.current?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;

  const readFile = (file) => {
    if (!file) return;
    if (file.size > 1024 * 1024) {
      onError({ title: 'That file is larger than 1 MB.', details: ['Split the model or remove unused components.'] });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => { onDraft(String(reader.result)); onError(null); };
    reader.readAsText(file);
  };

  const format = !draft.trim() ? '' : looksLikeJson(draft) ? 'Reading as JSON' : 'Reading as YAML';

  return (
    <>
      <div className="fixed inset-0 z-30 bg-[rgb(10_16_14/.35)]" onClick={onClose} aria-hidden="true" />
      <aside
        id="drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="drawer-h"
        className="drawer-in fixed inset-y-0 left-0 z-40 flex w-[min(640px,100vw)] flex-col gap-3 border-r border-grid bg-sheet px-[clamp(16px,3vw,32px)] py-5"
      >
        <div className="flex items-center justify-between">
          <h2 id="drawer-h" className="text-lg font-bold">Architecture model</h2>
          <button type="button" className="btn btn-quiet" onClick={onClose}>Close</button>
        </div>
        <p className="text-xs text-ink-2">
          Describe your system as trust boundaries, components and data flows, in JSON or YAML. Controls you leave out
          count as missing. New to this? Start from the template and read the{' '}
          <a className="text-action underline underline-offset-2" href={GUIDE} target="_blank" rel="noopener noreferrer">modelling guide</a>.
          Models are analysed in memory and never stored.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" className="btn" onClick={() => {
              onDraft(starter);
              onError(null);
              requestAnimationFrame(() => { const t = textarea.current; if (t) { t.scrollTop = 0; t.setSelectionRange(0, 0); t.focus(); } });
            }}>Start from template</button>
          <label className="btn relative focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-action">
            Upload file
            <input
              type="file"
              className="absolute inset-0 cursor-pointer opacity-0"
              accept=".json,.yaml,.yml,application/json,text/yaml"
              onChange={(e) => readFile(e.target.files[0])}
            />
          </label>
          <span className="text-xs text-ink-2">{format}</span>
        </div>
        <label htmlFor="model-input" className="sr-only">Model source</label>
        <textarea
          id="model-input"
          ref={textarea}
          value={draft}
          onChange={(e) => onDraft(e.target.value)}
          onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') onAnalyse(); }}
          spellCheck={false}
          autoComplete="off"
          autoCapitalize="off"
          className="min-h-[200px] w-full flex-1 resize-none rounded-md border border-grid bg-paper p-3 font-mono text-[13px] leading-[1.55] [tab-size:2]"
        />
        {error && (
          <div role="alert" className="max-h-[30vh] overflow-auto border-l-[3px] border-critical bg-critical-wash px-3 py-2.5 text-xs">
            <strong className="mb-1 block">{error.title}</strong>
            {error.details.length > 0 && (
              <ul className="m-0 list-disc pl-[18px] font-mono text-[12px]">
                {error.details.map((d) => <li key={d}>{d}</li>)}
              </ul>
            )}
          </div>
        )}
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs text-ink-2">Ctrl + Enter also runs the analysis</span>
          <button type="button" className="btn btn-primary" disabled={busy} onClick={onAnalyse}>
            {busy ? 'Analysing…' : 'Analyse model'}
          </button>
        </div>
      </aside>
    </>
  );
}
