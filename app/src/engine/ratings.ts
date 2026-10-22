// Maps 1 to 10 ratings onto physical values the sim uses.
import { gauss, type Rng } from './rng';
import { RATINGS, type Player, type Ratings } from './types';
import { clamp } from './vec';

/** Linear map of a 1 to 10 rating onto [lo, hi]. */
export const scale = (rating: number, lo: number, hi: number) => lo + ((clamp(rating, 1, 10) - 1) / 9) * (hi - lo);

export interface Physical {
  /** yd/s */
  topSpeed: number;
  /** Straight-line acceleration, yd/s². */
  accel: number;
  /** Sideways acceleration when changing direction, yd/s². */
  cutAccel: number;
  /** Share of speed lost on a 180° planned cut (receivers on routes); scales with the cut angle. */
  cutLoss: number;
  /** Seconds to react to something new (a break, a throw). */
  reaction: number;
  /** Chance per tick of pulling a flag when within reach. */
  flagPull: number;
  /** Chance a flag pull attempt on this player misses (they dodge it). Mostly Agility, some Speed. */
  elusiveness: number;
  /** Uncontested catch probability for a ball on target. */
  catchProb: number;
  /** Highest point the player can catch the ball, feet. */
  catchHeightFt: number;
  /** How far behind (seconds) a man defender trails their receiver's moves. */
  manLag: number;
  /** Zone read quality, 0 to 1: how much a zone defender leans on the QB's eyes and how fast they break on the throw. */
  zoneRead: number;
  /** How far behind (seconds) a zone defender reads receivers' moves. */
  zoneLag: number;
}

export function physical(r: Ratings): Physical {
  return {
    topSpeed: scale(r.speed, 6.5, 8.5),
    accel: scale(r.speed, 5, 8),
    cutAccel: scale(r.agility, 7, 15),
    cutLoss: scale(r.agility, 0.85, 0.45),
    reaction: scale(r.agility, 0.5, 0.2),
    flagPull: scale(r.agility, 0.3, 0.6),
    elusiveness: scale(0.75 * r.agility + 0.25 * r.speed, 0.05, 0.5),
    catchProb: scale(r.hands, 0.6, 0.95),
    catchHeightFt: scale(r.catchHeight, 8, 10.5),
    manLag: scale(r.man, 0.6, 0.15),
    zoneRead: scale(r.zone, 0, 1),
    zoneLag: scale(r.zone, 0.6, 0.15),
  };
}

export interface QbPhysical {
  /** Seconds from snap before the first throw is possible. */
  release: number;
  /** Seconds spent staring at the primary before scanning. */
  lockOn: number;
  /** Ball speed, yd/s. */
  throwSpeed: number;
  /** Longest throw, yards. */
  maxRange: number;
  /** Miss distance (1 sigma, yards) per 10 yards of throw, clean pocket. */
  missPer10: number;
  /** How noisy the QB's sense of "open" is (1 sigma, yards). */
  readNoise: number;
  /** Multiplier on misses at full pressure. */
  pressureMiss: number;
}

export function qbPhysical(p: Player): QbPhysical {
  const arm = p.arm ?? 5;
  const poise = p.poise ?? 5;
  return {
    release: scale(poise, 0.6, 0.3),
    lockOn: scale(poise, 2.0, 0.6),
    throwSpeed: scale(arm, 15, 24),
    maxRange: scale(arm, 25, 45),
    missPer10: scale(arm, 1.1, 0.35),
    readNoise: scale(poise, 1.0, 0.3),
    pressureMiss: scale(poise, 2.2, 1.3),
  };
}

/** Per-play wobble so repeated reps of the same matchup vary. */
export function jitter(p: Player, rng: Rng, sigma = 0.4): Player {
  const ratings = { ...p.ratings };
  for (const k of RATINGS) ratings[k] = clamp(ratings[k] + gauss(rng) * sigma, 1, 10);
  return {
    ...p,
    ratings,
    arm: p.arm === undefined ? undefined : clamp(p.arm + gauss(rng) * sigma, 1, 10),
    poise: p.poise === undefined ? undefined : clamp(p.poise + gauss(rng) * sigma, 1, 10),
  };
}
