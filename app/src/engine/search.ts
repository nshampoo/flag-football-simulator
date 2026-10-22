// Searches for the best setup against an opponent: defense, rusher, rush mode, and who plays where.
// Every setup is scored on the same sampled plays (same seeds), so comparisons are paired and far
// less noisy than independent runs.
import type { Tendencies } from './archetypes';
import { COVERAGES, defenseCall, type Coverage, type DefenseCall, type Job, type RushMode } from './coverage';
import { summarize, type Summary } from './montecarlo';
import type { Offense } from './roster';
import type { RouteName } from './routes';
import { simulatePlay, type PlayResult } from './sim';
import type { Player } from './types';

const RUSH_MODES: RushMode[] = ['hard', 'contain'];

export interface SearchOptions {
  /** Plays per setup when screening every defense × rusher × rush mode. */
  screenPlays: number;
  /** Plays per setup while tuning who plays where. */
  tunePlays: number;
  /** Rounds of swaps per defense. */
  rounds: number;
  /** Plays per setup for the final ranking. */
  finalPlays: number;
  onProgress?: (fraction: number, label: string) => void;
}

export const BROWSER_SEARCH: SearchOptions = { screenPlays: 100, tunePlays: 120, rounds: 2, finalPlays: 800 };

export interface Setup {
  call: DefenseCall;
  summary: Summary;
  /** Standard error of yards per play. */
  se: number;
}

export interface WatchFor {
  route: RouteName;
  /** Share of all yards allowed that came on throws to this route. */
  yardShare: number;
  /** Yards per throw to this route. */
  yardsPerThrow: number;
}

export interface SearchResult {
  /** Best tuned setup per defense, best first. */
  ranked: Setup[];
  /** Routes that produce the most yards against the best setup. */
  watchFor: WatchFor[];
}

interface Matchup {
  offense: Offense;
  tendencies: Tendencies;
  defense: Player[];
}

/** Seeds for the final ranking, separate from the ones setups were picked on (no winner's curse). */
const FINAL_SEEDS = 100_001;

function run(m: Matchup, call: DefenseCall, plays: number, firstSeed = 1) {
  const results: PlayResult[] = [];
  const routes: RouteName[] = [];
  for (let i = 0; i < plays; i++) {
    const rec = simulatePlay({ ...m, call, seed: firstSeed + i });
    results.push(rec.result);
    routes.push(rec.play.assignments.find((a) => a.playerId === rec.result.targetId)?.route as RouteName);
  }
  const summary = summarize(results);
  const mean = summary.yardsPerPlay;
  const variance = results.reduce((s, r) => s + (r.yards - mean) ** 2, 0) / Math.max(1, plays - 1);
  return { setup: { call, summary, se: Math.sqrt(variance / plays) }, results, routes };
}

/** Every setup one change away: two players swap jobs, the rusher swaps with a cover player, or the rush mode flips. */
function neighbors(call: DefenseCall): DefenseCall[] {
  const ids = Object.keys(call.jobs);
  const out: DefenseCall[] = [];
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const jobs = { ...call.jobs, [ids[i]]: call.jobs[ids[j]], [ids[j]]: call.jobs[ids[i]] };
      out.push({ ...call, jobs });
    }
  }
  for (const id of ids) {
    const jobs: Record<string, Job> = { ...call.jobs, [call.rusherId]: call.jobs[id] };
    delete jobs[id];
    out.push({ ...call, rusherId: id, jobs });
  }
  out.push({ ...call, rushMode: call.rushMode === 'hard' ? 'contain' : 'hard' });
  return out;
}

export function searchBestSetup(m: Matchup, opts: SearchOptions): SearchResult {
  const roster = m.defense;
  const screenCount = COVERAGES.length * roster.length * RUSH_MODES.length;
  const tuneCount = COVERAGES.length * opts.rounds * (15 + 6 + 1);
  const total = screenCount * opts.screenPlays + tuneCount * opts.tunePlays + COVERAGES.length * opts.finalPlays;
  let done = 0;
  const progress = (plays: number, label: string) => {
    done += plays;
    opts.onProgress?.(Math.min(1, done / total), label);
  };

  // 1. Screen every defense × rusher × rush mode, with the default fit for who plays where.
  const bestPerCoverage = new Map<Coverage, Setup>();
  for (const coverage of COVERAGES) {
    for (const rusher of roster) {
      for (const mode of RUSH_MODES) {
        const { setup } = run(m, defenseCall(coverage, roster, m.offense, rusher.id, mode), opts.screenPlays);
        const prev = bestPerCoverage.get(coverage);
        if (!prev || setup.summary.yardsPerPlay < prev.summary.yardsPerPlay) bestPerCoverage.set(coverage, setup);
        progress(opts.screenPlays, `Screening ${coverage}`);
      }
    }
  }

  // 2. Tune each defense's best: keep the best single change while it helps.
  const tuned: DefenseCall[] = [];
  for (const coverage of COVERAGES) {
    let current = run(m, bestPerCoverage.get(coverage)!.call, opts.tunePlays).setup;
    for (let round = 0; round < opts.rounds; round++) {
      let best = current;
      for (const call of neighbors(current.call)) {
        const { setup } = run(m, call, opts.tunePlays);
        if (setup.summary.yardsPerPlay < best.summary.yardsPerPlay - 0.05) best = setup;
        progress(opts.tunePlays, `Tuning ${coverage}`);
      }
      if (best === current) {
        progress((opts.rounds - round - 1) * 22 * opts.tunePlays, `Tuning ${coverage}`);
        break;
      }
      current = best;
    }
    tuned.push(current.call);
  }

  // 3. Final ranking on more plays, fresh ones.
  const finals = tuned.map((call) => {
    const r = run(m, call, opts.finalPlays, FINAL_SEEDS);
    progress(opts.finalPlays, 'Final ranking');
    return r;
  });
  finals.sort((a, b) => a.setup.summary.yardsPerPlay - b.setup.summary.yardsPerPlay);

  // What hurts the winner: yards by the route thrown to.
  const top = finals[0];
  const totalYards = top.results.reduce((s, r) => s + Math.max(0, r.yards), 0) || 1;
  const byRoute = new Map<RouteName, { yards: number; throws: number }>();
  top.results.forEach((r, i) => {
    const route = top.routes[i];
    if (!route) return;
    const e = byRoute.get(route) ?? { yards: 0, throws: 0 };
    e.yards += Math.max(0, r.yards);
    e.throws++;
    byRoute.set(route, e);
  });
  const watchFor = [...byRoute.entries()]
    .map(([route, e]) => ({ route, yardShare: e.yards / totalYards, yardsPerThrow: e.yards / e.throws }))
    .sort((a, b) => b.yardShare - a.yardShare)
    .slice(0, 3);

  return { ranked: finals.map((f) => f.setup), watchFor };
}
