import { useEffect, useMemo, useRef, useState } from 'react';
import { ARCHETYPE_DESCRIPTIONS, ARCHETYPE_LABELS, ARCHETYPE_NAMES, ARCHETYPES, type ArchetypeName } from '../engine/archetypes';
import { COVERAGE_DESCRIPTIONS, COVERAGE_LABELS, COVERAGES, defenseCall, RUSH_DESCRIPTIONS, type Coverage, type RushMode } from '../engine/coverage';
import { runMatchup, type Summary } from '../engine/montecarlo';
import { MY_TEAM, OPPONENT } from '../engine/roster';
import { simulatePlay, type PlayResult } from '../engine/sim';
import { DT } from '../engine/types';
import { Field } from './Field';
import { defenseIds, names, pct, ratingsLine, RUSH_LABELS, type Picks } from './labels';

const SPEEDS = [0.25, 0.5, 1];

function describe(r: PlayResult): string {
  const who = r.targetId ? names.get(r.targetId) : undefined;
  const yds = `${r.yards >= 0 ? '+' : ''}${r.yards.toFixed(1)} yds`;
  switch (r.outcome) {
    case 'complete': return `Complete to ${who}, ${yds}${r.touchdown ? ', touchdown' : ''}`;
    case 'incomplete': return who ? `Incomplete, intended for ${who}` : 'Thrown away';
    case 'interception': return `Intercepted, intended for ${who}`;
    case 'sack': return `Sacked, ${yds}`;
    case 'scramble': return `Scramble, ${yds}${r.touchdown ? ', touchdown' : ''}`;
  }
}

interface Props {
  picks: Picks;
  setPicks: (update: (p: Picks) => Picks) => void;
}

export function Viewer({ picks, setPicks }: Props) {
  const { archetype, coverage, rusherId, rushMode } = picks;
  const [seed, setSeed] = useState(1);
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(0.5);
  const [summary, setSummary] = useState<Summary>();

  const input = useMemo(
    () => ({
      offense: OPPONENT,
      tendencies: ARCHETYPES[archetype],
      defense: MY_TEAM,
      call: picks.call ?? defenseCall(coverage, MY_TEAM, OPPONENT, rusherId, rushMode),
    }),
    [archetype, coverage, rusherId, rushMode, picks.call],
  );
  const rec = useMemo(() => simulatePlay({ ...input, seed, record: true }), [input, seed]);
  const end = rec.frames[rec.frames.length - 1].t;
  const frame = rec.frames[Math.min(rec.frames.length - 1, Math.round(time / DT))];

  // Restart the animation whenever the play changes; drop stale Monte Carlo numbers when the matchup does.
  useEffect(() => {
    setTime(0);
    setPlaying(true);
  }, [rec]);
  useEffect(() => setSummary(undefined), [input]);

  const last = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (!playing) return;
    let id = 0;
    const tick = (now: number) => {
      const dt = last.current === undefined ? 0 : (now - last.current) / 1000;
      last.current = now;
      setTime((t) => {
        const next = t + dt * speed;
        if (next >= end) setPlaying(false);
        return Math.min(next, end);
      });
      id = requestAnimationFrame(tick);
    };
    id = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(id);
      last.current = undefined;
    };
  }, [playing, speed, end]);

  // Changing the defense, rusher, or rush drops a searched setup; changing the opponent keeps it.
  const pick = (update: Partial<Picks>) => setPicks((p) => ({ ...p, ...update, call: 'archetype' in update ? p.call : undefined }));

  const r = rec.result;
  return (
    <div className="layout">
      <div className="card">
        <Field rec={rec} frame={frame} time={time} dodges={rec.dodges} call={input.call} defenseIds={defenseIds} rusherId={rusherId} qbId={OPPONENT.qb.id} names={names} />
        <div className="legend">
          <span style={{ '--c': 'var(--wr-ink)' } as React.CSSProperties}>Offense</span>
          <span style={{ '--c': 'var(--qb-ink)' } as React.CSSProperties}>QB</span>
          <span style={{ '--c': 'var(--bad)' } as React.CSSProperties}>Coverage</span>
          <span style={{ '--c': 'var(--te-ink)' } as React.CSSProperties}>Rusher</span>
          <span>Bold route: QB's primary · dashed circles: zone landmarks</span>
        </div>
        <div className="scrub">
          <button onClick={() => (time >= end ? (setTime(0), setPlaying(true)) : setPlaying(!playing))}>
            {playing ? 'Pause' : time >= end ? 'Replay' : 'Play'}
          </button>
          <input type="range" min={0} max={end} step={DT} value={time} onChange={(e) => (setPlaying(false), setTime(Number(e.target.value)))} />
          <span>{time.toFixed(1)}s</span>
        </div>
        <div className="result">
          <b>{describe(r)}</b>
          <div className="muted">
            {rec.play.formation} formation · {r.throwTime !== undefined ? `thrown at ${r.throwTime.toFixed(1)}s` : 'no throw'}
            {r.separation !== undefined && ` · ${r.separation.toFixed(1)} yds of separation`}
            {r.rubs > 0 && ` · ${r.rubs} rubbed`}
            {r.dodges > 0 && ` · ${r.dodges} missed flag pull${r.dodges > 1 ? 's' : ''}`} · seed {seed}
          </div>
        </div>
      </div>

      <div className="card controls">
        {picks.call && (
          <div className="notice">
            Showing a searched setup: who plays where comes from the search.{' '}
            <button className="link" onClick={() => pick({})}>Use default spots</button>
          </div>
        )}
        <label>
          Opponent
          <select value={archetype} onChange={(e) => pick({ archetype: e.target.value as ArchetypeName })}>
            {ARCHETYPE_NAMES.map((a) => <option key={a} value={a}>{ARCHETYPE_LABELS[a]}</option>)}
          </select>
          <span className="hint">{ARCHETYPE_DESCRIPTIONS[archetype]}</span>
        </label>
        <label>
          Defense
          <select value={coverage} onChange={(e) => pick({ coverage: e.target.value as Coverage })}>
            {COVERAGES.map((c) => <option key={c} value={c}>{COVERAGE_LABELS[c]}</option>)}
          </select>
          <span className="hint">{COVERAGE_DESCRIPTIONS[coverage]}</span>
        </label>
        <label>
          Rusher
          <select value={rusherId} onChange={(e) => pick({ rusherId: e.target.value })}>
            {MY_TEAM.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <span className="hint">
            {MY_TEAM.find((p) => p.id === rusherId)!.note}
            <br />
            {ratingsLine(rusherId)}
          </span>
        </label>
        <label>
          Rush
          <select value={rushMode} onChange={(e) => pick({ rushMode: e.target.value as RushMode })}>
            {(Object.keys(RUSH_LABELS) as RushMode[]).map((m) => <option key={m} value={m}>{RUSH_LABELS[m]}</option>)}
          </select>
          <span className="hint">{RUSH_DESCRIPTIONS[rushMode]}</span>
        </label>
        <label>
          Speed
          <select value={speed} onChange={(e) => setSpeed(Number(e.target.value))}>
            {SPEEDS.map((s) => <option key={s} value={s}>{s}x</option>)}
          </select>
        </label>
        <div className="row">
          <button className="primary" onClick={() => setSeed((s) => s + 1)}>New play</button>
          <button onClick={() => setSummary(runMatchup(input, 1000))}>Run 1,000</button>
        </div>
        {summary && (
          <table className="stats">
            <tbody>
              <tr><td>Yards per play</td><td>{summary.yardsPerPlay.toFixed(1)}</td></tr>
              <tr><td>Completion</td><td>{pct(summary.completionPct)}</td></tr>
              <tr><td>Big plays (15+)</td><td>{pct(summary.bigPlayPct)}</td></tr>
              <tr><td>Interceptions</td><td>{pct(summary.intPct, 1)}</td></tr>
              <tr><td>Sacks</td><td>{pct(summary.sackPct)}</td></tr>
              <tr><td>Scrambles</td><td>{pct(summary.scramblePct)}</td></tr>
              <tr><td>Avg time to throw</td><td>{summary.timeToThrow.toFixed(1)}s</td></tr>
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
