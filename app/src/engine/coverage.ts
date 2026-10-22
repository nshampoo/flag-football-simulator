// Coverages: each one is 6 jobs for the non-rushers (man on someone, or a zone), filled from the roster.
import type { Offense } from './roster';
import type { Player, Vec } from './types';

export type RushMode = 'hard' | 'contain';

/** A zone: where the defender drops and what they own. Landmarks are yards from the ball. */
export interface Zone {
  label: string;
  /**
   * deep: stay on top of the deepest threat in their band.
   * under: undercut the nearest threat near the landmark; past `carryTo` it's the deep zone's problem.
   *   With no job: if someone sprinted past them, sit back ~10 yds to fill the void; otherwise sink a bit.
   * squat: sit shallow and drive on short breaks; anything vertical goes to the sink zone behind them.
   * sink: play a hook right behind the squat, but if a receiver gets past them, run back and become a
   *   full safety over the top (at `bailTo`).
   * lurk: drift toward where the QB is looking and break on the throw; still owns the deep middle.
   */
  kind: 'deep' | 'under' | 'squat' | 'sink' | 'lurk';
  landmark: Vec;
  /** Pre-snap alignment. */
  align: Vec;
  /** How far from the landmark (across the field, for deep and squat zones) they'll take a receiver. */
  radius: number;
  carryTo: number;
  /** Sink zones: the safety spot they run back to. */
  bailTo?: Vec;
}

export type Job =
  | { kind: 'man'; targetId: string; shade?: 'over' | 'under' }
  | { kind: 'zone'; zone: Zone };

export const COVERAGES = ['man', 'manBracket', 'cover2', 'cover3', 'cover3Aggressive'] as const;
export type Coverage = (typeof COVERAGES)[number];

export const COVERAGE_LABELS: Record<Coverage, string> = {
  man: 'Man (Cover 0)',
  manBracket: 'Man + bracket',
  cover2: 'Cover 2',
  cover3: 'Cover 3',
  cover3Aggressive: 'Cover 3 Aggressive',
};

export const COVERAGE_DESCRIPTIONS: Record<Coverage, string> = {
  man: 'Everyone has a man and no help. Their favorite gets your best cover player.',
  manBracket: 'Two on their favorite (one under, one over the top); their weakest receiver is left open.',
  cover2: 'Two deep safeties split the field; four play underneath zones.',
  cover3: 'Three deep (two outside thirds and a middle safety); three underneath.',
  cover3Aggressive:
    'Squat thirds jump short routes, hooks behind them run back if passed, and a lurker follows the QB’s eyes but still owns the deep middle.',
};

export const RUSH_DESCRIPTIONS: Record<RushMode, string> = {
  hard: 'Goes straight at the QB on the 5 second count.',
  contain: 'Stays about 3 yards off and cuts off the scramble lane; less pressure.',
};

export interface DefenseCall {
  coverage: Coverage;
  rusherId: string;
  rushMode: RushMode;
  /** Defender id → job. */
  jobs: Record<string, Job>;
}

type Side = 1 | -1;

const deepHalf = (s: Side): Zone => ({ label: 'Deep half', kind: 'deep', landmark: { x: 6.5 * s, y: 15 }, align: { x: 6.5 * s, y: 10 }, radius: 7, carryTo: Infinity });
const deepThird = (s: Side): Zone => ({ label: 'Deep third', kind: 'deep', landmark: { x: 9 * s, y: 14 }, align: { x: 9 * s, y: 8 }, radius: 4.5, carryTo: Infinity });
const deepMiddle: Zone = { label: 'Deep middle', kind: 'deep', landmark: { x: 0, y: 16 }, align: { x: 0, y: 11 }, radius: 4.5, carryTo: Infinity };
const flat = (s: Side): Zone => ({ label: 'Flat', kind: 'under', landmark: { x: 10 * s, y: 5 }, align: { x: 9 * s, y: 4 }, radius: 7, carryTo: 12 });
const hook = (s: Side, depth = 7): Zone => ({ label: 'Hook', kind: 'under', landmark: { x: 4 * s, y: depth }, align: { x: 3.5 * s, y: depth - 2 }, radius: 5.5, carryTo: depth + 5 });
const hookMiddle: Zone = { label: 'Middle hook', kind: 'under', landmark: { x: 0, y: 7 }, align: { x: 0, y: 5 }, radius: 6, carryTo: 12 };
const squat = (s: Side): Zone => ({ label: 'Squat third', kind: 'squat', landmark: { x: 7.5 * s, y: 5 }, align: { x: 7.5 * s, y: 5 }, radius: 5, carryTo: 8 });
const sink = (s: Side): Zone => ({
  label: 'Hook (sinks)', kind: 'sink', landmark: { x: 7 * s, y: 9 }, align: { x: 6.5 * s, y: 8 }, radius: 5, carryTo: 14, bailTo: { x: 8.5 * s, y: 15 },
});
const lurker: Zone = { label: 'Lurker', kind: 'lurk', landmark: { x: 0, y: 12 }, align: { x: 0, y: 10 }, radius: 8, carryTo: Infinity };

export const ZONE_SETS: Record<Exclude<Coverage, 'man' | 'manBracket'>, Zone[]> = {
  // Two-high hooks sit 3 yds deeper (short yardage would pull them up; that's for the situational layer).
  cover2: [deepHalf(-1), deepHalf(1), flat(-1), flat(1), hook(-1, 10), hook(1, 10)],
  cover3: [deepThird(-1), deepThird(1), deepMiddle, flat(-1), flat(1), hookMiddle],
  cover3Aggressive: [squat(-1), squat(1), lurker, sink(-1), sink(1), hookMiddle],
};

// Who fits each zone. Scarce, important zones are filled first.
const ZONE_FIT: Record<Zone['kind'], (r: Player['ratings']) => number> = {
  deep: (r) => r.zone * 2 + r.speed * 1.5 + r.catchHeight,
  lurk: (r) => r.zone * 2 + r.hands + r.agility,
  sink: (r) => r.zone * 1.5 + r.speed * 1.5 + r.catchHeight * 0.5,
  squat: (r) => r.speed * 1.5 + r.agility + r.zone,
  under: (r) => r.zone + r.agility + r.speed * 0.5,
};
const FILL_ORDER: Zone['kind'][] = ['deep', 'lurk', 'sink', 'squat', 'under'];

const manScore = (p: Player) => p.ratings.man * 2 + p.ratings.speed + p.ratings.agility;
const threat = (p: Player) => p.ratings.speed + p.ratings.agility + p.ratings.hands;

/** Fills a coverage's jobs from the roster with simple fit heuristics. */
export function defenseCall(coverage: Coverage, defense: Player[], offense: Offense, rusherId: string, rushMode: RushMode, shadowId?: string): DefenseCall {
  const pool = defense.filter((p) => p.id !== rusherId);
  const jobs: Record<string, Job> = {};
  const take = (score: (p: Player) => number) => {
    const best = pool.reduce((a, b) => (score(b) > score(a) ? b : a));
    pool.splice(pool.indexOf(best), 1);
    return best;
  };
  const others = [...offense.receivers, offense.center].filter((p) => p.id !== offense.favoriteId).sort((a, b) => threat(b) - threat(a));

  if (coverage === 'man' || coverage === 'manBracket') {
    const shadow = pool.find((p) => p.id === shadowId) ?? take(manScore);
    if (pool.includes(shadow)) pool.splice(pool.indexOf(shadow), 1);
    if (coverage === 'man') {
      jobs[shadow.id] = { kind: 'man', targetId: offense.favoriteId };
    } else {
      // Two on their favorite: the shadow underneath, someone fast and tall over the top. Their
      // weakest eligible (often the center) goes uncovered.
      jobs[shadow.id] = { kind: 'man', targetId: offense.favoriteId, shade: 'under' };
      const over = take((p) => p.ratings.speed * 1.5 + p.ratings.man + p.ratings.catchHeight);
      jobs[over.id] = { kind: 'man', targetId: offense.favoriteId, shade: 'over' };
    }
    const rest = [...pool].sort((a, b) => manScore(b) - manScore(a));
    rest.forEach((d, i) => (jobs[d.id] = { kind: 'man', targetId: others[i].id }));
    return { coverage, rusherId, rushMode, jobs };
  }

  const zones = ZONE_SETS[coverage];
  for (const kind of FILL_ORDER) {
    for (const zone of zones.filter((z) => z.kind === kind)) jobs[take((p) => ZONE_FIT[kind](p.ratings)).id] = { kind: 'zone', zone };
  }
  return { coverage, rusherId, rushMode, jobs };
}
