// Coordinates are yards relative to the ball: x across the field (right is +), y downfield,
// line of scrimmage at y = 0.
export type Vec = { x: number; y: number };

export const RATINGS = ['speed', 'agility', 'hands', 'catchHeight', 'man', 'zone'] as const;
export type Rating = (typeof RATINGS)[number];
/** Each rating is 1 to 10. */
export type Ratings = Record<Rating, number>;

export interface Player {
  id: string;
  name: string;
  ratings: Ratings;
  /** One-line description of their game. */
  note?: string;
  /** The preset type they were built from (e.g. "Burner"). */
  type?: string;
  /** QB ratings (1 to 10). Anyone without them throws like a 5. */
  arm?: number;
  poise?: number;
}

export interface Field {
  /** Sideline is at x = ±halfWidth. */
  halfWidth: number;
  /** Distance from the line of scrimmage to the goal line. Placeholder until the real field is known. */
  goalLine: number;
}

export const FIELD: Field = { halfWidth: 13.5, goalLine: 40 };

/** Seconds per sim tick. */
export const DT = 0.1;
/** The rusher's count; after it the rusher can go and the QB can run. */
export const RUSH_COUNT = 5;
