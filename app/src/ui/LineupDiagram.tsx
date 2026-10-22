import { useMemo } from 'react';
import { ARCHETYPES } from '../engine/archetypes';
import type { DefenseCall } from '../engine/coverage';
import { OPPONENT } from '../engine/roster';
import { simulatePlay } from '../engine/sim';
import { FIELD, type Player } from '../engine/types';
import { dist } from '../engine/vec';
import { nameMap, RUSH_LABELS } from './labels';

// SVG y grows down, so downfield (+y) is drawn as -y.
const TOP = 19;
const BOTTOM = -7;
const W = FIELD.halfWidth;

interface Props {
  call: DefenseCall;
  roster: Player[];
}

/**
 * Where everyone lines up before the snap, against a trips formation: zone players with an arrow to
 * where they drop, man players with a line to their receiver, and the rusher.
 */
export function LineupDiagram({ call, roster }: Props) {
  const snap = useMemo(() => {
    const rec = simulatePlay({ offense: OPPONENT, tendencies: ARCHETYPES.balanced, defense: roster, call, seed: 1, record: true, formation: 'trips' });
    return rec.frames[0].pos;
  }, [call, roster]);

  const offense = [OPPONENT.qb, OPPONENT.center, ...OPPONENT.receivers];
  const names = nameMap(roster);
  const role = (id: string) => {
    if (id === call.rusherId) return `rush, ${RUSH_LABELS[call.rushMode].toLowerCase()}`;
    const job = call.jobs[id];
    if (!job) return '';
    if (job.kind === 'zone') return job.zone.label;
    return `on ${names.get(job.targetId)}${job.shade ? ` (${job.shade})` : ''}`;
  };
  const yards = [];
  for (let y = -5; y <= TOP; y += 5) yards.push(y);

  return (
    <svg className="field lineup-diagram" viewBox={`${-W - 0.5} ${-TOP} ${2 * W + 1} ${TOP - BOTTOM}`} role="img" aria-label="Where each defender lines up">
      <defs>
        <marker id="drop" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
          <path d="M0,0 L10,5 L0,10 z" className="drop-head" />
        </marker>
      </defs>
      <rect className="turf" x={-W} y={-TOP} width={2 * W} height={TOP - BOTTOM} />
      {yards.map((y) => <line key={y} className={y === 0 ? 'los' : 'yard'} x1={-W} x2={W} y1={-y} y2={-y} />)}

      {Object.entries(call.jobs).map(([id, job]) => {
        const p = snap[id];
        if (!p) return null;
        if (job.kind === 'zone') {
          const L = job.zone.landmark;
          // Only draw the drop when it's long enough to see past the landmark circle.
          return (
            <g key={`j-${id}`}>
              <circle className="landmark" cx={L.x} cy={-L.y} r={1.4} />
              {dist(p, L) > 2.5 && <line className="drop" x1={p.x} y1={-p.y} x2={L.x} y2={-L.y + (L.y > p.y ? 1.4 : -1.4)} markerEnd="url(#drop)" />}
            </g>
          );
        }
        const t = snap[job.targetId];
        return t ? <line key={`j-${id}`} className="man-line" x1={p.x} y1={-p.y} x2={t.x} y2={-t.y} /> : null;
      })}

      {offense.map((o) => {
        const p = snap[o.id];
        return p ? (
          <g key={o.id} transform={`translate(${p.x} ${-p.y})`}>
            <circle className={o.id === OPPONENT.qb.id ? 'qb' : 'off-muted'} r={0.5} />
            <text className="dot-label">{o.name.slice(0, 2)}</text>
          </g>
        ) : null;
      })}

      {roster.map((d) => {
        const p = snap[d.id];
        if (!p) return null;
        const rusher = d.id === call.rusherId;
        return (
          <g key={d.id} transform={`translate(${p.x} ${-p.y})`}>
            <circle className={rusher ? 'rusher' : 'def'} r={0.6} />
            <text className="name-label" y={-1}>{d.name}</text>
            <text className="role-label" y={1.25}>{role(d.id)}</text>
          </g>
        );
      })}
    </svg>
  );
}
