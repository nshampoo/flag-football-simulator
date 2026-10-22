import type { Frame, PlayRecording } from '../engine/sim';
import { FIELD } from '../engine/types';

// SVG y grows down, so downfield (+y) is drawn as -y.
const TOP = 30;
const BOTTOM = -8;
const W = FIELD.halfWidth;

interface Props {
  rec: PlayRecording;
  frame: Frame;
  defenseIds: Set<string>;
  rusherId: string;
  qbId: string;
  names: Map<string, string>;
}

export function Field({ rec, frame, defenseIds, rusherId, qbId, names }: Props) {
  const yards = [];
  for (let y = -5; y <= TOP; y += 5) yards.push(y);
  const kind = (id: string) => (id === rusherId ? 'rusher' : defenseIds.has(id) ? 'def' : id === qbId ? 'qb' : 'off');

  return (
    <svg className="field" viewBox={`${-W - 0.5} ${-TOP} ${2 * W + 1} ${TOP - BOTTOM}`} role="img" aria-label="Play diagram">
      <rect className="turf" x={-W} y={-TOP} width={2 * W} height={TOP - BOTTOM} />
      {yards.map((y) => (
        <line key={y} className={y === 0 ? 'los' : 'yard'} x1={-W} x2={W} y1={-y} y2={-y} />
      ))}
      {FIELD.goalLine <= TOP && <line className="goal" x1={-W} x2={W} y1={-FIELD.goalLine} y2={-FIELD.goalLine} />}
      {Object.entries(rec.paths).map(([id, pts]) => (
        <polyline
          key={id}
          className={`route${id === rec.play.primaryId ? ' primary' : ''}`}
          points={pts.map((p) => `${p.x},${-Math.min(p.y, TOP)}`).join(' ')}
        />
      ))}
      {Object.entries(frame.pos).map(([id, p]) => (
        <g key={id} transform={`translate(${p.x} ${-p.y})`}>
          <circle className={kind(id)} r={0.55} />
          <text>{(names.get(id) ?? id).slice(0, 2)}</text>
        </g>
      ))}
      <ellipse className="ball" cx={frame.ball.x} cy={-frame.ball.y} rx={0.35} ry={0.22} />
    </svg>
  );
}
