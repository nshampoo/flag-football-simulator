// Route library. Waypoints are yards relative to the receiver's start, written for a receiver on the
// right side (+x is toward their sideline) and mirrored for the left.
import { FIELD, type Vec } from './types';
import { add, clamp, mul, norm, sub } from './vec';

export type Depth = 'short' | 'mid' | 'deep';

export interface Route {
  depth: Depth;
  points: readonly Vec[];
  /** After the last waypoint: settle in place, or keep running the last leg to the boundary. */
  end: 'sit' | 'continue';
}

export const ROUTES = {
  flat: { depth: 'short', points: [{ x: 3, y: 1 }, { x: 10, y: 2 }], end: 'continue' },
  slant: { depth: 'short', points: [{ x: 0, y: 3 }, { x: -6, y: 9 }], end: 'continue' },
  shallow: { depth: 'short', points: [{ x: -1, y: 2 }, { x: -8, y: 4 }], end: 'continue' },
  whip: { depth: 'short', points: [{ x: -2, y: 4 }, { x: 4, y: 5 }], end: 'continue' },
  stick: { depth: 'short', points: [{ x: 0, y: 5 }], end: 'sit' },
  out: { depth: 'mid', points: [{ x: 0, y: 7 }, { x: 6, y: 7 }], end: 'continue' },
  in: { depth: 'mid', points: [{ x: 0, y: 8 }, { x: -6, y: 8 }], end: 'continue' },
  curl: { depth: 'mid', points: [{ x: 0, y: 10 }, { x: -1, y: 8.5 }], end: 'sit' },
  comeback: { depth: 'mid', points: [{ x: 0, y: 13 }, { x: 2.5, y: 10.5 }], end: 'sit' },
  corner: { depth: 'deep', points: [{ x: 0, y: 10 }, { x: 7, y: 18 }], end: 'continue' },
  post: { depth: 'deep', points: [{ x: 0, y: 10 }, { x: -6, y: 18 }], end: 'continue' },
  go: { depth: 'deep', points: [{ x: 0, y: 20 }], end: 'continue' },
  wheel: { depth: 'deep', points: [{ x: 4, y: 1 }, { x: 7, y: 4 }, { x: 7, y: 12 }], end: 'continue' },
  outAndUp: { depth: 'deep', points: [{ x: 0, y: 6 }, { x: 3, y: 6.5 }, { x: 3, y: 14 }], end: 'continue' },
} as const satisfies Record<string, Route>;

export type RouteName = keyof typeof ROUTES;
export const ROUTE_NAMES = Object.keys(ROUTES) as RouteName[];

const routesAt = (depth: Depth) => ROUTE_NAMES.filter((n) => ROUTES[n].depth === depth);
export const SHORT_ROUTES = routesAt('short');
export const MID_ROUTES = routesAt('mid');
export const DEEP_ROUTES = routesAt('deep');

/** Margin receivers keep from the sideline. */
const SIDELINE_ROOM = 0.7;

/**
 * Absolute waypoints for a route run from `start`, mirrored when `side` is -1. `continue` routes get
 * one extra point carrying the last leg out to the sideline or past the goal line. Everything is
 * clamped inside the field: the sideline is the extra defender.
 */
export function routePath(name: RouteName, start: Vec, side: 1 | -1): Vec[] {
  const route: Route = ROUTES[name];
  const pts = route.points.map((p) => add(start, { x: p.x * side, y: p.y }));
  if (route.end === 'continue') {
    const last = pts[pts.length - 1];
    const prev = pts.length > 1 ? pts[pts.length - 2] : start;
    pts.push(add(last, mul(norm(sub(last, prev)), 40)));
  }
  const xMax = FIELD.halfWidth - SIDELINE_ROOM;
  return pts.map((p) => ({ x: clamp(p.x, -xMax, xMax), y: Math.min(p.y, FIELD.goalLine + 8) }));
}
