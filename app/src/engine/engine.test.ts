import { describe, expect, it } from 'vitest';
import { ARCHETYPES } from './archetypes';
import { COVERAGES, defenseCall } from './coverage';
import { runMatchup } from './montecarlo';
import { samplePlay } from './plays';
import { physical, scale } from './ratings';
import { mulberry32 } from './rng';
import { MY_TEAM, OPPONENT } from './roster';
import { ROUTE_NAMES, routePath } from './routes';
import { simulatePlay } from './sim';
import { FIELD, RUSH_COUNT } from './types';

const call = defenseCall('man', MY_TEAM, OPPONENT, 'burner', 'hard');
const base = { offense: OPPONENT, tendencies: ARCHETYPES.balanced, defense: MY_TEAM, call };

describe('ratings', () => {
  it('maps 1 and 10 onto the ends of each range', () => {
    expect(scale(1, 6.5, 8.5)).toBe(6.5);
    expect(scale(10, 6.5, 8.5)).toBe(8.5);
    const slow = physical({ speed: 1, agility: 1, hands: 1, catchHeight: 1, man: 1, zone: 1 });
    const fast = physical({ speed: 10, agility: 10, hands: 10, catchHeight: 10, man: 10, zone: 10 });
    expect(fast.topSpeed).toBeGreaterThan(slow.topSpeed);
    expect(fast.reaction).toBeLessThan(slow.reaction);
    expect(fast.manLag).toBeLessThan(slow.manLag);
  });
});

describe('routes', () => {
  it('mirrors for the left side and stays in bounds', () => {
    for (const name of ROUTE_NAMES) {
      const right = routePath(name, { x: 3, y: 0 }, 1);
      const left = routePath(name, { x: -3, y: 0 }, -1);
      right.forEach((p, i) => {
        expect(left[i].x).toBeCloseTo(-p.x);
        expect(left[i].y).toBeCloseTo(p.y);
        expect(Math.abs(p.x)).toBeLessThanOrEqual(FIELD.halfWidth);
      });
    }
  });
});

describe('plays', () => {
  it('assigns a route to all 6 eligibles and picks a primary among them', () => {
    const rng = mulberry32(7);
    for (let i = 0; i < 50; i++) {
      const play = samplePlay(rng, OPPONENT, ARCHETYPES.balanced);
      expect(play.assignments).toHaveLength(6);
      expect(play.assignments.map((a) => a.playerId)).toContain(play.primaryId);
    }
  });

  it('hero ball looks to the favorite more than dink and dunk', () => {
    const share = (t: (typeof ARCHETYPES)[keyof typeof ARCHETYPES]) => {
      const rng = mulberry32(3);
      let n = 0;
      for (let i = 0; i < 400; i++) if (samplePlay(rng, OPPONENT, t).primaryId === OPPONENT.favoriteId) n++;
      return n / 400;
    };
    expect(share(ARCHETYPES.heroBall)).toBeGreaterThan(share(ARCHETYPES.dinkAndDunk) + 0.2);
  });
});

describe('sim', () => {
  it('replays the same play from the same seed', () => {
    const a = simulatePlay({ ...base, seed: 42 }).result;
    const b = simulatePlay({ ...base, seed: 42 }).result;
    expect(a).toEqual(b);
  });

  it('never sacks before the rush count', () => {
    for (let seed = 1; seed <= 300; seed++) {
      const rec = simulatePlay({ ...base, tendencies: ARCHETYPES.scaredQb, seed, record: true });
      if (rec.result.outcome === 'sack') expect(rec.frames[rec.frames.length - 1].t).toBeGreaterThan(RUSH_COUNT);
    }
  });

  it('produces plausible rec league numbers', () => {
    const s = runMatchup(base, 500);
    expect(s.completionPct).toBeGreaterThan(0.35);
    expect(s.completionPct).toBeLessThan(0.9);
    expect(s.yardsPerPlay).toBeGreaterThan(2);
    expect(s.yardsPerPlay).toBeLessThan(20);
  });

  it('an elusive QB dodges more sacks than a slow one', () => {
    const withQb = (agility: number, speed: number) => ({
      ...OPPONENT,
      qb: { ...OPPONENT.qb, ratings: { ...OPPONENT.qb.ratings, agility, speed } },
    });
    const slow = runMatchup({ ...base, offense: withQb(2, 3), tendencies: ARCHETYPES.scaredQb }, 600);
    const elusive = runMatchup({ ...base, offense: withQb(10, 9), tendencies: ARCHETYPES.scaredQb }, 600);
    expect(elusive.sackPct).toBeLessThan(slow.sackPct * 0.8);
  });

  it('a scared QB gets sacked more than a dink and dunk QB', () => {
    const scared = runMatchup({ ...base, tendencies: ARCHETYPES.scaredQb }, 400);
    const quick = runMatchup({ ...base, tendencies: ARCHETYPES.dinkAndDunk }, 400);
    expect(scared.sackPct).toBeGreaterThan(quick.sackPct);
    expect(scared.timeToThrow).toBeGreaterThan(quick.timeToThrow);
  });
});

describe('coverages', () => {
  it('gives every non-rusher a job', () => {
    for (const coverage of COVERAGES) {
      const c = defenseCall(coverage, MY_TEAM, OPPONENT, 'burner', 'hard');
      expect(Object.keys(c.jobs).sort()).toEqual(MY_TEAM.filter((p) => p.id !== 'burner').map((p) => p.id).sort());
    }
  });

  it('bracket puts two on the favorite and leaves one eligible uncovered', () => {
    const c = defenseCall('manBracket', MY_TEAM, OPPONENT, 'burner', 'hard');
    const targets = Object.values(c.jobs).map((j) => (j.kind === 'man' ? j.targetId : ''));
    expect(targets.filter((id) => id === OPPONENT.favoriteId)).toHaveLength(2);
    expect(new Set(targets).size).toBe(5);
  });

  it('every coverage produces plausible numbers', () => {
    for (const coverage of COVERAGES) {
      const s = runMatchup({ ...base, call: defenseCall(coverage, MY_TEAM, OPPONENT, 'burner', 'hard') }, 300);
      expect(s.completionPct, coverage).toBeGreaterThan(0.3);
      expect(s.completionPct, coverage).toBeLessThan(0.92);
      expect(s.yardsPerPlay, coverage).toBeGreaterThan(1);
      expect(s.yardsPerPlay, coverage).toBeLessThan(20);
    }
  });

  it('squat corners give up more big plays to a gunslinger than a regular Cover 3', () => {
    const vs = (coverage: (typeof COVERAGES)[number]) =>
      runMatchup({ ...base, tendencies: ARCHETYPES.gunslinger, call: defenseCall(coverage, MY_TEAM, OPPONENT, 'burner', 'hard') }, 600);
    expect(vs('cover3Aggressive').bigPlayPct).toBeGreaterThan(vs('cover3').bigPlayPct);
  });

  it('the bracket takes targets away from their favorite', () => {
    const share = (coverage: (typeof COVERAGES)[number]) => {
      const call = defenseCall(coverage, MY_TEAM, OPPONENT, 'burner', 'hard');
      let n = 0;
      for (let seed = 1; seed <= 600; seed++) {
        if (simulatePlay({ ...base, tendencies: ARCHETYPES.heroBall, call, seed }).result.targetId === OPPONENT.favoriteId) n++;
      }
      return n;
    };
    expect(share('manBracket')).toBeLessThan(share('man'));
  });
});
