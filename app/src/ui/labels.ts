import type { ArchetypeName } from '../engine/archetypes';
import type { Coverage, DefenseCall, Job, RushMode } from '../engine/coverage';
import { MY_TEAM, OPPONENT } from '../engine/roster';

export const names = new Map([...MY_TEAM, OPPONENT.qb, OPPONENT.center, ...OPPONENT.receivers].map((p) => [p.id, p.name]));
export const defenseIds = new Set(MY_TEAM.map((p) => p.id));
export const RUSH_LABELS: Record<RushMode, string> = { hard: 'Hard at 5s', contain: 'Contain' };

/** What the viewer is showing. `call` is a searched setup (who plays where) that stays until the picks change. */
export interface Picks {
  archetype: ArchetypeName;
  coverage: Coverage;
  rusherId: string;
  rushMode: RushMode;
  call?: DefenseCall;
}

export function jobLabel(job: Job): string {
  if (job.kind === 'man') return `Man on ${names.get(job.targetId)}${job.shade ? ` (${job.shade === 'over' ? 'over the top' : 'underneath'})` : ''}`;
  const x = job.zone.landmark.x;
  return `${job.zone.label}${x < -0.5 ? ', left' : x > 0.5 ? ', right' : ''}`;
}

export function ratingsLine(id: string): string {
  const r = MY_TEAM.find((m) => m.id === id)!.ratings;
  return `Speed ${r.speed} · Agility ${r.agility} · Hands ${r.hands} · Height ${r.catchHeight} · Man ${r.man} · Zone ${r.zone}`;
}

export const pct = (n: number, digits = 0) => `${(n * 100).toFixed(digits)}%`;
