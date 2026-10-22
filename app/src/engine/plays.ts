// Samples a play the way rec offenses actually call them: a formation and a plausible route mix
// (usually one deep, a couple intermediate, someone short), shaped by the archetype.
import type { Tendencies } from './archetypes';
import { FORMATIONS, type FormationName, FORMATION_NAMES } from './formations';
import { pick, shuffle, type Rng } from './rng';
import type { Offense } from './roster';
import { DEEP_ROUTES, MID_ROUTES, ROUTES, SHORT_ROUTES, type RouteName } from './routes';
import type { Vec } from './types';

export interface Assignment {
  playerId: string;
  route: RouteName;
  start: Vec;
  side: 1 | -1;
  /** Seconds after the snap before the route starts (the center snaps first). */
  delay: number;
}

export interface Play {
  formation: FormationName;
  /** Strong side: 1 = right. */
  strong: 1 | -1;
  assignments: Assignment[];
  primaryId: string;
  secondaryId?: string;
  /** Planned quick throw: taken right at the release if the coverage is soft, else forgotten. */
  quickId?: string;
}

const BACKFIELD_ROUTES: RouteName[] = ['flat', 'wheel', 'shallow'];
const CENTER_ROUTES: RouteName[] = ['stick', 'stick', 'shallow', 'flat'];

function routeMix(rng: Rng, t: Tendencies): RouteName[] {
  const deepCount = rng() < t.deep ? (rng() < t.deep * 0.6 ? 2 : 1) : rng() < 0.5 ? 1 : 0;
  const shortCount = rng() < t.checkdown ? 2 : 1;
  const mix: RouteName[] = [];
  for (let i = 0; i < deepCount; i++) mix.push(pick(rng, DEEP_ROUTES));
  for (let i = 0; i < shortCount; i++) mix.push(pick(rng, SHORT_ROUTES));
  while (mix.length < 5) mix.push(pick(rng, MID_ROUTES));
  return shuffle(rng, mix.slice(0, 5));
}

export function samplePlay(rng: Rng, offense: Offense, t: Tendencies): Play {
  const formation = pick(rng, FORMATION_NAMES);
  const strong: 1 | -1 = rng() < 0.5 ? 1 : -1;
  const spots = shuffle<Vec>(rng, FORMATIONS[formation]);
  const routes = routeMix(rng, t);

  const assignments: Assignment[] = offense.receivers.map((p, i) => {
    const start = { x: spots[i].x * strong, y: spots[i].y };
    const inBackfield = start.y < -3;
    return {
      playerId: p.id,
      route: inBackfield && !BACKFIELD_ROUTES.includes(routes[i]) ? pick(rng, BACKFIELD_ROUTES) : routes[i],
      start,
      side: start.x < 0 ? -1 : 1,
      delay: 0,
    };
  });
  assignments.push({
    playerId: offense.center.id,
    route: pick(rng, CENTER_ROUTES),
    start: { x: 0, y: 0 },
    side: rng() < 0.5 ? 1 : -1,
    delay: 0.5 + rng() * 0.5,
  });

  // Primary: the favorite as often as they lock on to them; otherwise a deep shot as often as they
  // like going deep; otherwise anyone but the center.
  const nonCenter = assignments.filter((a) => a.playerId !== offense.center.id);
  let primary: Assignment;
  if (rng() < 0.35 + 0.6 * t.lockOn) primary = nonCenter.find((a) => a.playerId === offense.favoriteId)!;
  else {
    const deep = nonCenter.filter((a) => ROUTES[a.route].depth === 'deep');
    primary = deep.length && rng() < t.deep ? pick(rng, deep) : pick(rng, nonCenter);
  }
  // Deep-minded QBs send their primary deep (jump balls to their guy).
  if (ROUTES[primary.route].depth !== 'deep' && rng() < t.deep * 0.6 && primary.start.y > -3) {
    primary.route = pick(rng, DEEP_ROUTES);
  }
  const others = assignments.filter((a) => a !== primary);
  const secondary = rng() < 0.6 ? pick(rng, others) : undefined;

  // Quick-game plan: mostly checkdown-minded QBs, to someone on a short route.
  const short = assignments.filter((a) => ROUTES[a.route].depth === 'short' && a.delay === 0);
  const quick = short.length && rng() < 0.1 + 0.5 * t.checkdown * (1 - 0.5 * t.deep) ? pick(rng, short) : undefined;

  return { formation, strong, assignments, primaryId: primary.playerId, secondaryId: secondary?.playerId, quickId: quick?.playerId };
}
