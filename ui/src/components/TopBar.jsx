import { CUSTOM } from '../constants.js';

export default function TopBar({
  examples, example, onExample, scoring, onScoring, drawerOpen, onEdit, canExport, onMarkdown, onJson,
}) {
  return (
    <header className="z-20 flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-grid bg-paper px-[clamp(16px,3vw,32px)] py-2.5 sm:sticky sm:top-0">
      <p className="w-full text-lg font-bold tracking-tight sm:w-auto">stride-engine</p>

      <div className="flex flex-1 flex-wrap items-center gap-x-4 gap-y-2.5">
        <label className="inline-flex items-center gap-2 text-xs text-ink-2">
          <span className="max-sm:sr-only">Model</span>
          <select className="field max-sm:max-w-[58vw]" aria-label="Architecture model" value={example} onChange={(e) => onExample(e.target.value)}>
            {examples.map((ex) => <option key={ex.name} value={ex.name} title={ex.description}>{ex.title}</option>)}
            <option value={CUSTOM} hidden>Custom model</option>
          </select>
        </label>
        <button type="button" className="btn" aria-expanded={drawerOpen} aria-controls="drawer" onClick={onEdit}>Edit model</button>
        <label className="inline-flex items-center gap-2 text-xs text-ink-2">
          <span className="max-sm:sr-only">Scoring</span>
          <select className="field" aria-label="Scoring method" value={scoring} onChange={(e) => onScoring(e.target.value)}>
            <option value="risk">Likelihood × impact</option>
            <option value="mean">DREAD mean</option>
            <option value="weighted">Weighted DREAD</option>
          </select>
        </label>
      </div>

      {canExport && (
        <div className="flex gap-1">
          <button type="button" className="btn btn-quiet" onClick={onMarkdown}>Download report</button>
          <button type="button" className="btn btn-quiet" onClick={onJson}>JSON</button>
        </div>
      )}
    </header>
  );
}
