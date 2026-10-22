import { useEffect, useRef, useState } from 'react';
import { ARCHETYPE_DESCRIPTIONS, ARCHETYPE_LABELS, ARCHETYPE_NAMES, type ArchetypeName } from '../engine/archetypes';
import { COVERAGE_DESCRIPTIONS, COVERAGE_LABELS, type DefenseCall } from '../engine/coverage';
import { MY_TEAM } from '../engine/roster';
import type { SearchResult, Setup } from '../engine/search';
import { jobLabel, names, pct, RUSH_LABELS } from './labels';
import type { SearchMessage } from './search.worker';

const ROUTE_LABELS: Record<string, string> = {
  flat: 'flats', slant: 'slants', shallow: 'shallow crosses', whip: 'whips', stick: 'sticks', out: 'outs', in: 'ins',
  curl: 'curls', comeback: 'comebacks', corner: 'corners', post: 'posts', go: 'go routes', wheel: 'wheels', outAndUp: 'out and ups',
};

interface Props {
  archetype: ArchetypeName;
  setArchetype: (a: ArchetypeName) => void;
  onWatch: (call: DefenseCall) => void;
}

type State = { status: 'idle' } | { status: 'running'; fraction: number; label: string } | { status: 'done'; result: SearchResult };

export function BestSetup({ archetype, setArchetype, onWatch }: Props) {
  // Results are kept per opponent for the visit, so flipping between opponents doesn't rerun.
  const [results, setResults] = useState<Partial<Record<ArchetypeName, SearchResult>>>({});
  const [state, setState] = useState<State>({ status: 'idle' });
  const worker = useRef<Worker | undefined>(undefined);

  useEffect(() => () => worker.current?.terminate(), []);

  const simulate = () => {
    worker.current?.terminate();
    const w = new Worker(new URL('./search.worker.ts', import.meta.url), { type: 'module' });
    worker.current = w;
    const target = archetype;
    setState({ status: 'running', fraction: 0, label: 'Starting' });
    w.onmessage = (e: MessageEvent<SearchMessage>) => {
      if (e.data.type === 'progress') setState({ status: 'running', fraction: e.data.fraction, label: e.data.label });
      else {
        const result = e.data.result;
        setResults((r) => ({ ...r, [target]: result }));
        setState({ status: 'done', result });
        w.terminate();
      }
    };
    w.postMessage({ archetype: target });
  };

  const result = results[archetype];
  const running = state.status === 'running';

  return (
    <div className="best">
      <div className="card best-controls">
        <label>
          Opponent
          <select value={archetype} disabled={running} onChange={(e) => setArchetype(e.target.value as ArchetypeName)}>
            {ARCHETYPE_NAMES.map((a) => <option key={a} value={a}>{ARCHETYPE_LABELS[a]}</option>)}
          </select>
          <span className="hint">{ARCHETYPE_DESCRIPTIONS[archetype]}</span>
        </label>
        <button className="primary" disabled={running} onClick={simulate}>
          {result ? 'Simulate again' : 'Simulate best setup'}
        </button>
        <p className="hint">
          Tries every defense with every rusher and rush mode, then swaps players between spots to find the best
          lineup for each defense, and ranks them on fresh plays. Takes about 10 seconds.
        </p>
        {running && (
          <div className="progress" role="progressbar" aria-valuenow={Math.round(state.fraction * 100)}>
            <div style={{ width: `${state.fraction * 100}%` }} />
            <span>{state.label}…</span>
          </div>
        )}
      </div>

      {result && <CallCard archetype={archetype} result={result} onWatch={onWatch} />}
    </div>
  );
}

function CallCard({ archetype, result, onWatch }: { archetype: ArchetypeName; result: SearchResult; onWatch: (c: DefenseCall) => void }) {
  const [best, next] = result.ranked;
  const margin = next.summary.yardsPerPlay - best.summary.yardsPerPlay;
  const close = margin < Math.hypot(best.se, next.se);
  const s = best.summary;

  return (
    <div className="callcard">
      <div className="card">
        <div className="eyebrow">Call vs {ARCHETYPE_LABELS[archetype]}</div>
        <h2>{COVERAGE_LABELS[best.call.coverage]}</h2>
        <p className="muted">{COVERAGE_DESCRIPTIONS[best.call.coverage]}</p>
        <div className="kpis">
          <div><b>{best.summary.yardsPerPlay.toFixed(1)}</b><span>yds/play allowed (±{best.se.toFixed(1)})</span></div>
          <div><b>{names.get(best.call.rusherId)}</b><span>rushes, {RUSH_LABELS[best.call.rushMode].toLowerCase()}</span></div>
          <div>
            <b>+{margin.toFixed(1)}</b>
            <span>yds/play for the runner-up, {COVERAGE_LABELS[next.call.coverage]}{close ? ' (close: within noise)' : ''}</span>
          </div>
        </div>
        <table className="stats">
          <tbody>
            <tr><td>Completion</td><td>{pct(s.completionPct)}</td></tr>
            <tr><td>Big plays (15+)</td><td>{pct(s.bigPlayPct)}</td></tr>
            <tr><td>Interceptions</td><td>{pct(s.intPct, 1)}</td></tr>
            <tr><td>Sacks</td><td>{pct(s.sackPct)}</td></tr>
            <tr><td>Avg time to throw</td><td>{s.timeToThrow.toFixed(1)}s</td></tr>
          </tbody>
        </table>
        {result.watchFor.length > 0 && (
          <p className="watch">
            <b>Watch for:</b>{' '}
            {result.watchFor.map((w, i) => (
              <span key={w.route}>
                {i > 0 && ', '}
                {ROUTE_LABELS[w.route] ?? w.route} ({pct(w.yardShare)} of yards)
              </span>
            ))}
            . That's where this setup gives up the most.
          </p>
        )}
        <button className="primary" onClick={() => onWatch(best.call)}>Watch it in the play viewer</button>
      </div>

      <div className="card">
        <h3>Lineup</h3>
        <Lineup setup={best} />
      </div>

      <div className="card wide">
        <h3>Every defense, with its best lineup</h3>
        <div className="scroll">
          <table className="rank">
            <thead>
              <tr><th>Defense</th><th>Rusher</th><th className="num">Yds/play</th><th className="num">Cmp</th><th className="num">Big</th><th className="num">INT</th><th className="num">Sack</th><th /></tr>
            </thead>
            <tbody>
              {result.ranked.map((r, i) => (
                <tr key={r.call.coverage} className={i === 0 ? 'current' : undefined}>
                  <td>{COVERAGE_LABELS[r.call.coverage]}</td>
                  <td>{names.get(r.call.rusherId)} ({RUSH_LABELS[r.call.rushMode].toLowerCase()})</td>
                  <td className="num">{r.summary.yardsPerPlay.toFixed(1)} <span className="faint">±{r.se.toFixed(1)}</span></td>
                  <td className="num">{pct(r.summary.completionPct)}</td>
                  <td className="num">{pct(r.summary.bigPlayPct)}</td>
                  <td className="num">{pct(r.summary.intPct, 1)}</td>
                  <td className="num">{pct(r.summary.sackPct)}</td>
                  <td><button className="link" onClick={() => onWatch(r.call)}>Watch</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="hint">Yards per play allowed, lower is better. ± is one standard error; gaps smaller than that are within noise.</p>
      </div>
    </div>
  );
}

function Lineup({ setup }: { setup: Setup }) {
  const rows = MY_TEAM.map((p) => ({
    name: p.name,
    job: p.id === setup.call.rusherId ? `Rusher (${RUSH_LABELS[setup.call.rushMode].toLowerCase()})` : jobLabel(setup.call.jobs[p.id]),
  }));
  return (
    <table className="stats lineup">
      <tbody>
        {rows.map((r) => <tr key={r.name}><td>{r.name}</td><td>{r.job}</td></tr>)}
      </tbody>
    </table>
  );
}
