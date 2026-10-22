import type { ArchetypeName } from '../engine/archetypes';
import type { Coverage, DefenseCall, Job, RushMode } from '../engine/coverage';
import { OPPONENT } from '../engine/roster';
import type { Player } from '../engine/types';

const offenseNames = new Map([OPPONENT.qb, OPPONENT.center, ...OPPONENT.receivers].map((p) => [p.id, p.name]));

/** Everyone's display name: the opponent's players plus this roster. */
export function nameMap(roster: Player[]): Map<string, string> {
  return new Map([...offenseNames, ...roster.map((p) => [p.id, p.name] as const)]);
}

export const RUSH_LABELS: Record<RushMode, string> = { hard: 'Hard at 5s', contain: 'Contain' };

/** What the viewer is showing. `call` is a searched setup (who plays where) that stays until the picks change. */
export interface Picks {
  archetype: ArchetypeName;
  coverage: Coverage;
  rusherId: string;
  rushMode: RushMode;
  call?: DefenseCall;
}

/** "Nick (Burner)", or just "Burner" when the name is the type. */
export function withType(name: string, type?: string): string {
  return !type || name === type ? name : `${name} (${type})`;
}

export function jobLabel(job: Job): string {
  if (job.kind === 'man') return `Man on ${offenseNames.get(job.targetId)}${job.shade ? ` (${job.shade === 'over' ? 'over the top' : 'underneath'})` : ''}`;
  const x = job.zone.landmark.x;
  return `${job.zone.label}${x < -0.5 ? ', left' : x > 0.5 ? ', right' : ''}`;
}

export function ratingsLine(p: Player): string {
  const r = p.ratings;
  return `Speed ${r.speed} · Agility ${r.agility} · Hands ${r.hands} · Height ${r.catchHeight} · Man ${r.man} · Zone ${r.zone}`;
}

export const pct = (n: number, digits = 0) => `${(n * 100).toFixed(digits)}%`;
