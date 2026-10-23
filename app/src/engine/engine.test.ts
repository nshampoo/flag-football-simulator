import { describe, expect, it } from 'vitest';
import { ARCHETYPES } from './archetypes';
import { COVERAGES, defenseCall } from './coverage';
import { runMatchup } from './montecarlo';
import { samplePlay } from './plays';
import { physical, scale } from './ratings';
import { mulberry32 } from './rng';
import { buildRoster, decodeSlots, DEFAULT_SLOTS, encodeSlots, MY_TEAM, OPPONENT, type RosterSlot } from './roster';
import { ROUTE_NAMES, routePath } from './routes';
import { searchBestSetup } from './search';
import { simulatePlay } from './sim';
import { FIELD, RUSH_COUNT } from './types';

const RUSHER = MY_TEAM[0].id;
const call = defenseCall('man', MY_TEAM, OPPONENT, RUSHER, 'hard');
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
      const c = defenseCall(coverage, MY_TEAM, OPPONENT, RUSHER, 'hard');
      expect(Object.keys(c.jobs).sort()).toEqual(MY_TEAM.filter((p) => p.id !== RUSHER).map((p) => p.id).sort());
    }
  });

  it('bracket puts two on the favorite and leaves one eligible uncovered', () => {
    const c = defenseCall('manBracket', MY_TEAM, OPPONENT, RUSHER, 'hard');
    const targets = Object.values(c.jobs).map((j) => (j.kind === 'man' ? j.targetId : ''));
    expect(targets.filter((id) => id === OPPONENT.favoriteId)).toHaveLength(2);
    expect(new Set(targets).size).toBe(5);
  });

  it('every coverage produces plausible numbers', () => {
    for (const coverage of COVERAGES) {
      const s = runMatchup({ ...base, call: defenseCall(coverage, MY_TEAM, OPPONENT, RUSHER, 'hard') }, 300);
      expect(s.completionPct, coverage).toBeGreaterThan(0.3);
      expect(s.completionPct, coverage).toBeLessThan(0.92);
      expect(s.yardsPerPlay, coverage).toBeGreaterThan(1);
      expect(s.yardsPerPlay, coverage).toBeLessThan(20);
    }
  });

  it('safeties keep go routes in front of them', () => {
    // Big completions on go routes, per 1,000 plays against a gunslinger.
    const goBombs = (coverage: (typeof COVERAGES)[number]) => {
      const call = defenseCall(coverage, MY_TEAM, OPPONENT, RUSHER, 'hard');
      let n = 0;
      for (let seed = 1; seed <= 1000; seed++) {
        const rec = simulatePlay({ ...base, tendencies: ARCHETYPES.gunslinger, call, seed });
        const route = rec.play.assignments.find((a) => a.playerId === rec.result.targetId)?.route;
        if (route === 'go' && rec.result.outcome === 'complete' && rec.result.yards >= 15) n++;
      }
      return n;
    };
    const man = goBombs('man');
    for (const coverage of ['cover2', 'cover3', 'cover3Aggressive'] as const) expect(goBombs(coverage), coverage).toBeLessThan(man);
  });

  it('the bracket takes targets away from their favorite', () => {
    const share = (coverage: (typeof COVERAGES)[number]) => {
      const call = defenseCall(coverage, MY_TEAM, OPPONENT, RUSHER, 'hard');
      let n = 0;
      for (let seed = 1; seed <= 600; seed++) {
        if (simulatePlay({ ...base, tendencies: ARCHETYPES.heroBall, call, seed }).result.targetId === OPPONENT.favoriteId) n++;
      }
      return n;
    };
    expect(share('manBracket')).toBeLessThan(share('man'));
  });
});

describe('search', () => {
  it('ranks a tuned setup for every defense, with every player placed', () => {
    const r = searchBestSetup(
      { offense: OPPONENT, tendencies: ARCHETYPES.balanced, defense: MY_TEAM },
      { screenPlays: 20, tunePlays: 20, rounds: 1, finalPlays: 60 },
    );
    expect(r.ranked.map((s) => s.call.coverage).sort()).toEqual([...COVERAGES].sort());
    for (let i = 1; i < r.ranked.length; i++) expect(r.ranked[i].summary.yardsPerPlay).toBeGreaterThanOrEqual(r.ranked[i - 1].summary.yardsPerPlay);
    for (const s of r.ranked) {
      expect([s.call.rusherId, ...Object.keys(s.call.jobs)].sort()).toEqual(MY_TEAM.map((p) => p.id).sort());
    }
    expect(r.watchFor.length).toBeGreaterThan(0);
  });
});

describe('roster', () => {
  it('builds custom players from their own ratings, kept to whole numbers from 1 to 10', () => {
    const [p] = buildRoster([{ name: 'Nick', type: 'burner', ratings: { speed: 12, agility: 0, hands: 7.6, catchHeight: 4, man: 6, zone: NaN } }]);
    expect(p.type).toBe('Custom Burner');
    expect(p.ratings).toEqual({ speed: 10, agility: 1, hands: 8, catchHeight: 4, man: 6, zone: 5 });
  });

  it('round-trips a roster through a share link, including custom ratings and any name', () => {
    const slots: RosterSlot[] = [
      { name: 'Nick', type: 'burner', ratings: { speed: 9, agility: 10, hands: 5, catchHeight: 5, man: 3, zone: 1 } },
      { name: 'José ⚡', type: 'burner' },
      ...DEFAULT_SLOTS.slice(2),
    ];
    const code = encodeSlots(slots);
    expect(code).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(decodeSlots(code)).toEqual(slots);
  });

  it('still opens links from before custom was a checkbox, as a custom Steady', () => {
    const old = btoa(JSON.stringify([['Nick', 'custom', '9,10,5,5,3,1'], ...DEFAULT_SLOTS.slice(1).map((s) => [s.name, s.type])]));
    expect(decodeSlots(old)?.[0]).toEqual({ name: 'Nick', type: 'steady', ratings: { speed: 9, agility: 10, hands: 5, catchHeight: 5, man: 3, zone: 1 } });
  });

  it('rejects broken share links', () => {
    expect(decodeSlots('not-a-team')).toBeUndefined();
    expect(decodeSlots(encodeSlots(DEFAULT_SLOTS.slice(0, 3)))).toBeUndefined();
    expect(decodeSlots(btoa(JSON.stringify(DEFAULT_SLOTS.map((s) => [s.name, 'wizard']))))).toBeUndefined();
  });

  it('gives the same type the same ratings, with ids by spot', () => {
    const team = buildRoster([{ name: 'A', type: 'burner' }, { name: 'B', type: 'burner' }]);
    expect(team.map((p) => p.id)).toEqual(['p1', 'p2']);
    expect(team[0].ratings).toEqual(team[1].ratings);
  });
});
