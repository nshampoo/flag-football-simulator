// Runs many plays of one matchup and summarizes the outcome distribution.
import { simulatePlay, type PlayResult, type SimInput } from './sim';

export interface Summary {
  plays: number;
  /** Completions per pass attempt. */
  completionPct: number;
  yardsPerPlay: number;
  /** Plays of 15+ yards. */
  bigPlayPct: number;
  tdPct: number;
  intPct: number;
  sackPct: number;
  pressurePct: number;
  scramblePct: number;
  scrambleYards: number;
  /** Average seconds to the throw, on throws. */
  timeToThrow: number;
}

export function summarize(results: PlayResult[]): Summary {
  const n = results.length;
  const count = (f: (r: PlayResult) => boolean) => results.filter(f).length;
  const attempts = count((r) => r.outcome === 'complete' || r.outcome === 'incomplete' || r.outcome === 'interception');
  const scrambles = results.filter((r) => r.outcome === 'scramble');
  const throws = results.filter((r) => r.throwTime !== undefined);
  return {
    plays: n,
    completionPct: attempts ? count((r) => r.outcome === 'complete') / attempts : 0,
    yardsPerPlay: results.reduce((s, r) => s + r.yards, 0) / n,
    bigPlayPct: count((r) => r.yards >= 15) / n,
    tdPct: count((r) => r.touchdown) / n,
    intPct: count((r) => r.outcome === 'interception') / n,
    sackPct: count((r) => r.outcome === 'sack') / n,
    pressurePct: count((r) => r.pressured) / n,
    scramblePct: scrambles.length / n,
    scrambleYards: scrambles.length ? scrambles.reduce((s, r) => s + r.yards, 0) / scrambles.length : 0,
    timeToThrow: throws.length ? throws.reduce((s, r) => s + r.throwTime!, 0) / throws.length : 0,
  };
}

/** `plays` reps of a matchup; play i uses seed `seed + i`, so any single rep can be replayed. */
export function runMatchup(input: Omit<SimInput, 'seed' | 'record'>, plays: number, seed = 1): Summary {
  const results: PlayResult[] = [];
  for (let i = 0; i < plays; i++) results.push(simulatePlay({ ...input, seed: seed + i }).result);
  return summarize(results);
}
