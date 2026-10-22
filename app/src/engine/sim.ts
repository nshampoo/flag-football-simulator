// One play, tick by tick: routes, man coverage, the 5 second rush, QB reads, the throw and catch,
// then run after catch (or a scramble).
import type { Tendencies } from './archetypes';
import { CENTER_SPOT, QB_SPOT } from './formations';
import { samplePlay, type Play } from './plays';
import { jitter, physical, qbPhysical, type Physical } from './ratings';
import { gauss, mulberry32, type Rng } from './rng';
import type { Offense } from './roster';
import { routePath } from './routes';
import { DT, FIELD, RUSH_COUNT, type Player, type Vec } from './types';
import { add, angleBetween, clamp, clampLen, dist, dot, len, mul, norm, sub } from './vec';

export type RushMode = 'hard' | 'contain';

export interface DefenseCall {
  coverage: 'man';
  rusherId: string;
  rushMode: RushMode;
  /** Defender id → id of the offensive player they cover. */
  man: Record<string, string>;
}

export type Outcome = 'complete' | 'incomplete' | 'interception' | 'sack' | 'scramble';

export interface PlayResult {
  outcome: Outcome;
  /** Offensive yards from the line of scrimmage (0 on incompletions and interceptions). */
  yards: number;
  touchdown: boolean;
  targetId?: string;
  throwTime?: number;
  /** Yards from the target's catch point to the nearest defender, at the throw. */
  separation?: number;
  /** The rusher got close (inside ~2.5 yds) before the ball was out. */
  pressured: boolean;
  /** Man defenders slowed by traffic. */
  rubs: number;
  /** Flag pulls the ball carrier (QB included) dodged. */
  dodges: number;
}

/** A missed flag pull. */
export interface Dodge {
  t: number;
  carrierId: string;
  defenderId: string;
}

export interface Frame {
  t: number;
  pos: Record<string, Vec>;
  ball: Vec;
}

export interface PlayRecording {
  play: Play;
  result: PlayResult;
  /** Route waypoints per receiver, starting at their alignment. */
  paths: Record<string, Vec[]>;
  frames: Frame[];
  dodges: Dodge[];
}

export interface SimInput {
  offense: Offense;
  tendencies: Tendencies;
  defense: Player[];
  call: DefenseCall;
  seed: number;
  /** Keep per-tick positions for the viewer. */
  record?: boolean;
}

interface Body {
  id: string;
  player: Player;
  phys: Physical;
  pos: Vec;
  vel: Vec;
  /** After missing a flag pull, no new attempt until this time. */
  nextPull: number;
}

interface Runner extends Body {
  path: Vec[];
  wp: number;
  speed: number;
  heading: Vec;
  delay: number;
  sitting: boolean;
  /** Past positions, one per tick, for defenders reacting with a lag. */
  trail: Vec[];
}

interface Cover extends Body {
  man?: Runner;
  cushion: number;
  rubbed: boolean;
}

const MAX_TIME = 20;
/** Room (yards) a planned quick throw needs: soft coverage. */
const QUICK_BAR = 1;
const YAC_TIME = 8;

const body = (player: Player, pos: Vec, rng: Rng): Body => {
  const p = jitter(player, rng);
  return { id: p.id, player: p, phys: physical(p.ratings), pos, vel: { x: 0, y: 0 }, nextPull: 0 };
};

/**
 * One flag pull attempt by a defender within reach. Elusive carriers make it miss, and a defender
 * who misses stumbles: momentum gone, and a beat before they can try again.
 */
function pullsFlag(d: Body, carrier: Body, t: number, rng: Rng, dodges: Dodge[]): boolean {
  if (t < d.nextPull) return false;
  if (rng() < d.phys.flagPull * (1 - carrier.phys.elusiveness)) return true;
  d.vel = mul(d.vel, 0.3);
  d.nextPull = t + 0.3 + d.phys.reaction;
  dodges.push({ t, carrierId: carrier.id, defenderId: d.id });
  return false;
}

/** Move toward `target`, limited by acceleration forward and by agility sideways. */
function steer(b: Body, target: Vec, maxSpeed = b.phys.topSpeed) {
  const to = sub(target, b.pos);
  const want = mul(norm(to), Math.min(maxSpeed, len(to) / 0.3));
  const dv = sub(want, b.vel);
  const speed = len(b.vel);
  let change: Vec;
  if (speed < 0.5) change = clampLen(dv, b.phys.accel * DT);
  else {
    const u = mul(b.vel, 1 / speed);
    const along = clamp(dot(dv, u), -3 * b.phys.accel * DT, b.phys.accel * DT); // planting is quicker than accelerating
    const across = clampLen(sub(dv, mul(u, dot(dv, u))), b.phys.cutAccel * DT);
    change = add(mul(u, along), across);
  }
  b.vel = clampLen(add(b.vel, change), maxSpeed);
  b.pos = add(b.pos, mul(b.vel, DT));
}

/** Planned cuts: the receiver knows the break, losing speed by cut angle and agility. */
function runRoute(r: Runner, t: number, defenders: readonly Body[]) {
  if (t < r.delay) {
    r.trail.push(r.pos);
    return;
  }
  if (r.sitting) {
    // Route's done: work away from the nearest defender, staying in bounds and past the line.
    const near = defenders.reduce((a, b) => (dist(b.pos, r.pos) < dist(a.pos, r.pos) ? b : a));
    let away = norm(sub(r.pos, near.pos));
    if (Math.abs(r.pos.x) > FIELD.halfWidth - 2) away = add(away, { x: -Math.sign(r.pos.x), y: 0 });
    if (r.pos.y < 2) away = add(away, { x: 0, y: 1 });
    steer(r, add(r.pos, mul(norm(away), 3)), r.phys.topSpeed * 0.5);
    r.trail.push(r.pos);
    return;
  }
  r.speed = Math.min(r.phys.topSpeed, r.speed + r.phys.accel * DT);
  let budget = r.speed * DT;
  let pos = r.pos;
  while (budget > 1e-6 && r.wp < r.path.length) {
    const target = r.path[r.wp];
    const d = dist(pos, target);
    if (d > budget) {
      r.heading = norm(sub(target, pos));
      pos = add(pos, mul(r.heading, budget));
      break;
    }
    pos = target;
    budget -= d;
    r.wp++;
    const next = r.path[r.wp];
    if (!next) {
      r.sitting = true;
      break;
    }
    const keep = 1 - r.phys.cutLoss * (angleBetween(r.heading, sub(next, target)) / Math.PI);
    r.speed *= keep;
    budget *= keep;
    r.heading = norm(sub(next, target));
  }
  r.vel = mul(sub(pos, r.pos), 1 / DT);
  r.pos = pos;
  r.trail.push(pos);
}

function inField(p: Vec): Vec {
  return { x: clamp(p.x, -FIELD.halfWidth, FIELD.halfWidth), y: p.y };
}

/** Man defenders assigned to the rest of the offense: the best cover player on their favorite. */
export function manCall(defense: Player[], offense: Offense, rusherId: string, rushMode: RushMode, shadowId?: string): DefenseCall {
  const cover = defense.filter((p) => p.id !== rusherId);
  const coverScore = (p: Player) => p.ratings.man * 2 + p.ratings.speed + p.ratings.agility;
  const threat = (p: Player) => p.ratings.speed + p.ratings.agility + p.ratings.hands;
  const shadow = cover.find((p) => p.id === shadowId) ?? [...cover].sort((a, b) => coverScore(b) - coverScore(a))[0];
  const restD = cover.filter((p) => p !== shadow).sort((a, b) => coverScore(b) - coverScore(a));
  const restO = [...offense.receivers, offense.center].filter((p) => p.id !== offense.favoriteId).sort((a, b) => threat(b) - threat(a));
  const man: Record<string, string> = { [shadow.id]: offense.favoriteId };
  restD.forEach((d, i) => (man[d.id] = restO[i].id));
  return { coverage: 'man', rusherId, rushMode, man };
}

export function simulatePlay(input: SimInput): PlayRecording {
  const { offense, tendencies: tend, call, record } = input;
  const rng = mulberry32(input.seed);
  const play = samplePlay(rng, offense, tend);

  const offensePlayers = new Map([...offense.receivers, offense.center].map((p) => [p.id, p]));
  const paths: Record<string, Vec[]> = {};
  const runners: Runner[] = play.assignments.map((a) => {
    const path = routePath(a.route, a.start, a.side);
    paths[a.playerId] = [a.start, ...path];
    return {
      ...body(offensePlayers.get(a.playerId)!, a.start, rng),
      path,
      wp: 0,
      speed: 0,
      heading: norm(sub(path[0], a.start)),
      delay: a.delay,
      sitting: false,
      trail: [a.start],
    };
  });
  const runnerById = new Map(runners.map((r) => [r.id, r]));
  const qb = body(offense.qb, QB_SPOT, rng);
  const qbp = qbPhysical(qb.player);

  const rusherPlayer = input.defense.find((p) => p.id === call.rusherId)!;
  const rusher: Body = body(rusherPlayer, { x: 1.5, y: 1 }, rng);
  const covers: Cover[] = input.defense
    .filter((p) => p.id !== call.rusherId)
    .map((p) => {
      const man = runnerById.get(call.man[p.id]);
      const s = man?.pos ?? CENTER_SPOT;
      const inside = s.x === 0 ? 0 : -Math.sign(s.x) * 0.7;
      const start = { x: s.x + inside, y: 4 + Math.min(1.5, Math.max(0, -s.y) * 0.6) };
      return { ...body(p, start, rng), man, cushion: Math.min(start.y - s.y, 5), rubbed: false };
    });
  const defenders: Body[] = [...covers, rusher];
  const everyone: Body[] = [...runners, ...covers, rusher, qb];

  const frames: Frame[] = [];
  const dodges: Dodge[] = [];
  const snapshot = (t: number, ball: Vec) => {
    if (!record) return;
    const pos: Record<string, Vec> = {};
    for (const b of everyone) pos[b.id] = b.pos;
    frames.push({ t, pos, ball });
  };

  let t = 0;
  let pressured = false;
  const done = (result: Omit<PlayResult, 'pressured' | 'rubs' | 'dodges'>): PlayRecording => ({
    play,
    paths,
    frames,
    dodges,
    result: { ...result, pressured, rubs: covers.filter((c) => c.rubbed).length, dodges: dodges.length },
  });

  // Run after catch or scramble: the carrier heads upfield away from nearby defenders; everyone pursues.
  const runWithBall = (carrier: Body, outcome: 'complete' | 'scramble', extra: Partial<PlayResult>) => {
    const start = t;
    while (t - start < YAC_TIME) {
      let dir: Vec = { x: 0, y: 1 };
      for (const d of defenders) {
        const away = sub(carrier.pos, d.pos);
        const dd = len(away);
        if (dd >= 6 || d.pos.y < carrier.pos.y - 1) continue;
        // Sidestep someone in front rather than backing away from them.
        const push = away.y < 0 ? { x: Math.sign(away.x) || 1, y: 0 } : norm(away);
        dir = add(dir, mul(push, ((6 - dd) / 6) * (away.y < 0 ? 2.5 : 1.2)));
      }
      if (Math.abs(carrier.pos.x) > FIELD.halfWidth - 2) dir = add(dir, { x: -Math.sign(carrier.pos.x) * 0.6, y: 0 });
      steer(carrier, add(carrier.pos, mul(norm(dir), 5)));
      // Behind the line a scrambling QB can still throw, so coverage stays on their men until he crosses it.
      const holdCoverage = carrier === qb && carrier.pos.y < 0;
      for (const d of defenders) {
        const man = (d as Cover).man;
        if (holdCoverage && man) steer(d, add(man.pos, { x: 0, y: 0.8 }));
        else {
          const lead = Math.min(1.2, dist(d.pos, carrier.pos) / d.phys.topSpeed);
          steer(d, add(carrier.pos, mul(carrier.vel, lead)));
        }
      }
      for (const r of runners) {
        if (r === carrier) continue;
        if (holdCoverage) runRoute(r, t, covers);
        else steer(r, r.pos, 2);
      }
      t += DT;
      snapshot(t, carrier.pos);
      const yards = carrier.pos.y;
      if (yards >= FIELD.goalLine) return done({ outcome, yards: FIELD.goalLine, touchdown: true, ...extra });
      if (Math.abs(carrier.pos.x) > FIELD.halfWidth) return done({ outcome, yards, touchdown: false, ...extra });
      for (const d of defenders) {
        if (dist(d.pos, carrier.pos) < 1 && pullsFlag(d, carrier, t, rng, dodges)) return done({ outcome, yards, touchdown: false, ...extra });
      }
    }
    return done({ outcome, yards: carrier.pos.y, touchdown: false, ...extra });
  };

  const isCenter = (r: Runner) => r.id === offense.center.id;
  const lockUntil = qbp.release + qbp.lockOn * (0.5 + tend.lockOn);
  const nearestCover = (p: Vec) => covers.reduce((best, c) => Math.min(best, dist(c.pos, p)), Infinity);
  /** Room left when the ball gets there: defenders keep moving as they are, then close once they react to the throw. */
  const windowAt = (p: Vec, travel: number) =>
    covers.reduce((best, c) => {
      const there = add(c.pos, mul(c.vel, Math.min(travel, c.phys.reaction)));
      return Math.min(best, dist(there, p) - c.phys.topSpeed * Math.max(0, travel - c.phys.reaction) * 0.7);
    }, Infinity);
  /** Into the route: past the first break, settled, or well downfield. */
  const ready = (r: Runner) => t >= r.delay && (r.wp >= 1 || r.sitting || r.pos.y - r.trail[0].y > 8);

  // How wrong this QB is about each receiver: mostly a misread that sticks for the play, plus a
  // little wobble per look (fresh noise every tick would make someone look open by chance).
  const misread = new Map(runners.map((r) => [r.id, gauss(rng) * qbp.readNoise]));

  /** Where the ball would meet the receiver, and how open that looks to this QB right now. */
  const evaluate = (r: Runner, locked: boolean, bar: number) => {
    const d0 = dist(qb.pos, r.pos);
    const travel = d0 / qbp.throwSpeed + 0.15;
    const catchPoint = inField(add(r.pos, mul(r.vel, travel)));
    const range = dist(qb.pos, catchPoint);
    if (range > qbp.maxRange) return undefined;
    const separation = nearestCover(r.pos);
    const travelTime = range / qbp.throwSpeed + 0.15;
    let need = bar;
    if (catchPoint.y > 15) need += 1.2 - 1.8 * tend.deep;
    if (isCenter(r) || catchPoint.y < 5) need -= tend.checkdown;
    if (locked && r.id === play.primaryId) need -= tend.lockOn * 0.8;
    const score = windowAt(catchPoint, travelTime) + misread.get(r.id)! + gauss(rng) * 0.25 - need;
    return { r, catchPoint, separation, score, travel: travelTime };
  };

  snapshot(0, qb.pos);
  // Pre-throw: routes, coverage, rush, and the QB's read.
  let thrown: (NonNullable<ReturnType<typeof evaluate>> & { forced: boolean; pressure: number }) | undefined;
  while (!thrown) {
    for (const r of runners) runRoute(r, t, covers);

    for (const c of covers) {
      if (!c.man) continue;
      // Mirror what they saw a lag ago, projected forward: tight on straight lines, beaten at breaks.
      const trail = c.man.trail;
      const i = Math.max(1, trail.length - 1 - Math.round(c.phys.manLag / DT));
      const seen = trail[Math.min(i, trail.length - 1)];
      const seenVel = mul(sub(seen, trail[i - 1] ?? seen), 1 / DT);
      const cushion = Math.max(0.8, c.cushion - t * 3);
      const target = add(add(seen, mul(seenVel, c.phys.manLag)), { x: 0, y: cushion });
      const ahead = norm(sub(target, c.pos));
      const blocked = everyone.some(
        (o) => o !== c && o !== c.man && o !== qb && dist(o.pos, c.pos) < 1 && dot(sub(o.pos, c.pos), ahead) > 0,
      );
      if (blocked) c.rubbed = true;
      steer(c, target, c.phys.topSpeed * (blocked ? 0.55 : 1));
    }

    if (t >= RUSH_COUNT) {
      if (call.rushMode === 'hard') steer(rusher, qb.pos);
      else steer(rusher, add(qb.pos, { x: Math.sign(rusher.pos.x - qb.pos.x || 1) * 0.5, y: 3 }), rusher.phys.topSpeed * 0.9);
    }

    t += DT;
    const gap = dist(rusher.pos, qb.pos);
    const pressure = clamp((4 - gap) / 3, 0, 1);
    if (pressure > 0.5) pressured = true;

    if (gap < 1 && pullsFlag(rusher, qb, t, rng, dodges)) {
      snapshot(t, qb.pos);
      return done({ outcome: 'sack', yards: qb.pos.y, touchdown: false });
    }

    if (t >= qbp.release) {
      // Rec QBs throw either right away (a planned quick throw against soft coverage) or once routes
      // have had time to get through, usually 4 to 8 s: before the count, the bar for "open" is high.
      const quick = play.quickId && t < qbp.release + 0.3 ? runnerById.get(play.quickId) : undefined;
      const urgency = t < RUSH_COUNT ? 1 : Math.max(0.2, 1 - 0.3 * (t - RUSH_COUNT));
      const bar = quick ? QUICK_BAR : (5 + 2 * tend.holdTime) * urgency * (1 - 0.6 * pressure);
      const locked = !quick && t < lockUntil;
      const looking = quick ? [quick] : runners.filter((r) => ready(r) && (!locked || r.id === play.primaryId));
      const reads = looking.map((r) => evaluate(r, locked, bar)).filter((x) => x !== undefined);
      const best = reads.reduce<(typeof reads)[number] | undefined>((a, b) => (!a || b.score > a.score ? b : a), undefined);

      if (best && best.score > 0) thrown = { ...best, forced: false, pressure };
      else if (t >= RUSH_COUNT && pressure > 0.4 && rng() < tend.mobility * 0.4) {
        return runWithBall(qb, 'scramble', {});
      } else if (t >= RUSH_COUNT + 0.3 && rng() < tend.mobility * 0.05) {
        return runWithBall(qb, 'scramble', {});
      } else if ((pressure > 0.85 && rng() < 0.4) || t > MAX_TIME) {
        const all = runners.map((r) => evaluate(r, false, bar)).filter((x) => x !== undefined);
        const forced = all.reduce<(typeof all)[number] | undefined>((a, b) => (!a || b.score > a.score ? b : a), undefined);
        if (forced) thrown = { ...forced, forced: true, pressure };
        else if (t > MAX_TIME) return done({ outcome: 'incomplete', yards: 0, touchdown: false });
      }
    }
    if (!thrown) snapshot(t, qb.pos);
  }

  // The throw: aim at the catch point and miss by arm, distance, and pressure.
  const throwTime = t;
  const from = qb.pos;
  const range = dist(from, thrown.catchPoint);
  const sigma = qbp.missPer10 * (range / 10) * (1 + thrown.pressure * (qbp.pressureMiss - 1)) * (thrown.forced ? 1.3 : 1);
  const land = inField(add(thrown.catchPoint, { x: gauss(rng) * sigma, y: gauss(rng) * sigma }));
  const target = thrown.r;
  const extra = { targetId: target.id, throwTime, separation: thrown.separation };

  while (t < throwTime + thrown.travel) {
    for (const r of runners) {
      if (r === target && t >= throwTime + 0.1) steer(r, land);
      else runRoute(r, t, covers);
    }
    for (const c of covers) {
      const react = throwTime + c.phys.reaction + (c.man === target ? 0 : 0.3);
      if (t >= react && (c.man === target || dist(c.pos, land) < 12)) steer(c, land);
      else if (c.man) steer(c, add(c.man.pos, { x: 0, y: 0.8 }));
    }
    steer(rusher, land);
    t += DT;
    const k = clamp((t - throwTime) / thrown.travel, 0, 1);
    snapshot(t, add(from, mul(sub(land, from), k)));
  }

  // The catch point: closest receiver and defender reach for it.
  const deep = range > 18;
  const reach = (b: Body) => 1 + (deep ? ((b.phys.catchHeightFt - 8) / 2.5) * 0.6 : 0.3);
  const dR = dist(target.pos, land);
  const defender = covers.reduce((a, b) => (dist(b.pos, land) < dist(a.pos, land) ? b : a));
  const dD = dist(defender.pos, land);
  const recCan = dR <= reach(target);
  const defCan = dD <= reach(defender);
  const height = (b: Body) => b.player.ratings.catchHeight * (deep ? 1.2 : 0.4);

  let caught = false;
  if (recCan && !defCan) caught = rng() < target.phys.catchProb * (1 - (0.3 * dR) / reach(target));
  else if (defCan && !recCan) {
    if (rng() < defender.phys.catchProb * 0.45) return done({ outcome: 'interception', yards: 0, touchdown: false, ...extra });
  } else if (recCan && defCan) {
    const r = target.player.ratings;
    const d = defender.player.ratings;
    const rScore = r.hands + height(target) + (dD - dR) * 2 + gauss(rng) * 2;
    const dScore = (d.hands + Math.max(d.man, d.zone)) / 2 + height(defender) + gauss(rng) * 2;
    if (rScore > dScore) caught = rng() < target.phys.catchProb * 0.85;
    else if (rng() < defender.phys.catchProb * 0.3) return done({ outcome: 'interception', yards: 0, touchdown: false, ...extra });
  }
  if (!caught) return done({ outcome: 'incomplete', yards: 0, touchdown: false, ...extra });

  target.pos = land;
  return runWithBall(target, 'complete', extra);
}
