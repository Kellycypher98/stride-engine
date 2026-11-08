import { useCallback, useEffect, useMemo, useState } from 'react';
import * as api from './api.js';
import { CUSTOM } from './constants.js';
import TopBar from './components/TopBar.jsx';
import ModelDrawer from './components/ModelDrawer.jsx';
import Summary from './components/Summary.jsx';
import Diagram from './components/Diagram.jsx';
import ThreatList from './components/ThreatList.jsx';
import Inspector from './components/Inspector.jsx';
import HowItWorks from './components/HowItWorks.jsx';
import starter from '../../templates/starter.yaml?raw';

const NO_FILTERS = { category: '', severity: '', target: '' };
const INTRO_KEY = 'stride-engine:intro-dismissed';

function readFlag(key) {
  try { return window.localStorage.getItem(key) === '1'; } catch { return false; }
}
function writeFlag(key) {
  try { window.localStorage.setItem(key, '1'); } catch { /* storage unavailable: show again next time */ }
}

export default function App() {
  const [examples, setExamples] = useState([]);
  const [example, setExample] = useState('');
  const [draft, setDraft] = useState('');          // text in the editor
  const [source, setSource] = useState('');        // text behind the current report
  const [scoring, setScoring] = useState('risk');
  const [result, setResult] = useState(null);      // { report, architecture }
  const [filters, setFilters] = useState(NO_FILTERS);
  const [selected, setSelected] = useState(null);
  const [pulse, setPulse] = useState(0);
  const [drawer, setDrawer] = useState(false);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [help, setHelp] = useState(false);
  const [intro, setIntro] = useState(() => !readFlag(INTRO_KEY));

  // Stable handlers: the dialogs restore focus when these change.
  const closeDrawer = useCallback(() => setDrawer(false), []);
  const closeHelp = useCallback(() => setHelp(false), []);
  const dismissIntro = () => { setIntro(false); writeFlag(INTRO_KEY); };
  const tryTemplate = () => {
    setHelp(false);
    dismissIntro();
    setDraft(starter);
    setExample(CUSTOM);
    setError(null);
    setDrawer(true);
  };

  const report = result?.report;

  const run = useCallback(async (text, method) => {
    setBusy(true);
    setError(null);
    try {
      const next = await api.analyse(text, method);
      setResult(next);
      setSource(text);
      setFilters(NO_FILTERS);
      setSelected(next.report.findings[0]?.id ?? null);
      setDrawer(false);
    } catch (e) {
      setError({ title: e.message, details: e.details || [] });
      setDrawer(true);
    } finally {
      setBusy(false);
    }
  }, []);

  const loadExample = useCallback(async (name) => {
    setExample(name);
    try {
      const text = await api.getExample(name);
      setDraft(text);
      await run(text, scoring);
    } catch (e) {
      setError({ title: e.message, details: [] });
      setDrawer(true);
    }
  }, [run, scoring]);

  useEffect(() => {
    let live = true;
    api.listExamples().then((list) => {
      if (!live) return;
      setExamples(list);
      const first = list.find((x) => x.name === 'healthcare') || list[0];
      if (first) loadExample(first.name);
      else setDrawer(true);
    });
    return () => { live = false; };
    // Run once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (report) document.title = `${report.model.name} | stride-engine`;
  }, [report]);

  const visible = useMemo(() => {
    if (!report) return [];
    const { category, severity, target } = filters;
    return report.findings.filter((f) => (!category || f.category === category)
      && (!severity || f.severity === severity) && (!target || f.target.id === target));
  }, [report, filters]);

  // Keep a visible threat selected whenever the filters change.
  useEffect(() => {
    if (visible.length && !visible.some((f) => f.id === selected)) setSelected(visible[0].id);
  }, [visible, selected]);

  const toggleFilter = useCallback((key, value) => {
    setFilters((f) => ({ ...f, [key]: f[key] === value ? '' : value }));
  }, []);
  const clearFilter = useCallback((key) => setFilters((f) => ({ ...f, [key]: '' })), []);

  const select = useCallback((id) => { setSelected(id); setPulse((n) => n + 1); }, []);

  const finding = report?.findings.find((f) => f.id === selected) || null;

  const exportMarkdown = async () => {
    try {
      const md = await api.markdownReport(source, report.scoring.method);
      api.download(`${api.slug(report.model.name)}-threat-report.md`, md, 'text/markdown');
    } catch (e) {
      setError({ title: e.message, details: [] });
      setDrawer(true);
    }
  };
  const exportJson = () => api.download(`${api.slug(report.model.name)}-threat-report.json`,
    `${JSON.stringify(report, null, 2)}\n`, 'application/json');

  return (
    <>
      <a href="#threats" className="absolute -left-[9999px] top-2 z-50 bg-action px-3 py-2 text-action-ink focus:left-2">Skip to threats</a>

      <TopBar
        examples={examples}
        example={example}
        onExample={(name) => (name === CUSTOM ? null : loadExample(name))}
        scoring={scoring}
        onScoring={(m) => { setScoring(m); run(source || draft, m); }}
        drawerOpen={drawer}
        onEdit={() => { setDraft(source || draft); setDrawer((d) => !d); }}
        canExport={Boolean(report)}
        onMarkdown={exportMarkdown}
        onJson={exportJson}
        onHelp={() => setHelp(true)}
      />

      <HowItWorks open={help} onClose={closeHelp} onTry={tryTemplate} />

      <ModelDrawer
        open={drawer}
        draft={draft}
        onDraft={(t) => { setDraft(t); setExample(CUSTOM); }}
        onClose={closeDrawer}
        onAnalyse={() => run(draft, scoring)}
        error={error}
        onError={setError}
        busy={busy}
      />

      <main className="px-[clamp(16px,3vw,32px)] pb-10">
        {intro && (
          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-md border border-grid bg-sheet px-4 py-2.5">
            <p className="min-w-0 flex-1">
              <b>New here?</b> stride-engine reads a <i>description</i> of your system and finds design threats. It never
              connects to your APIs or servers.
            </p>
            <div className="flex gap-2">
              <button type="button" className="btn btn-primary" onClick={() => setHelp(true)}>How it works</button>
              <button type="button" className="btn btn-quiet" onClick={dismissIntro}>Dismiss</button>
            </div>
          </div>
        )}
        <Summary report={report} filters={filters} onToggle={toggleFilter} />

        <Diagram
          report={report}
          architecture={result?.architecture}
          filters={filters}
          selected={finding}
          pulse={pulse}
          onPick={(id) => toggleFilter('target', id)}
        />

        {report && (
          <section aria-labelledby="threats-h" className="grid items-start gap-8 border-t border-grid pt-6 min-[900px]:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
            <ThreatList
              report={report}
              architecture={result.architecture}
              visible={visible}
              filters={filters}
              onClear={clearFilter}
              selected={selected}
              onSelect={select}
            />
            <Inspector finding={finding} scoring={report.scoring.method} onTarget={(id) => toggleFilter('target', id)} />
          </section>
        )}
      </main>

      <footer className="border-t border-grid px-[clamp(16px,3vw,32px)] pt-5 pb-8 text-xs text-ink-2">
        <p>
          MSc Cyber Security artefact, Arden University. Rule base {report?.tool.ruleBaseVersion ?? '–'}.{' '}
          <a className="text-action underline underline-offset-2" href="rules" target="_blank" rel="noopener noreferrer">View the rules</a>
        </p>
      </footer>
    </>
  );
}
