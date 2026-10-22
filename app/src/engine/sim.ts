// One play, tick by tick: routes, coverage (man or zone), the 5 second rush, QB reads, the throw and
// catch, then run after catch (or a scramble).
import type { Tendencies } from './archetypes';
import type { DefenseCall, Job, Zone } from './coverage';
import { CENTER_SPOT, QB_SPOT } from './formations';
import { samplePlay, type Play } from './plays';
import { jitter, physical, qbPhysical, type Physical } from './ratings';
import { gauss, mulberry32, type Rng } from './rng';
import type { Offense } from './roster';
import { routePath } from './routes';
import { DT, FIELD, RUSH_COUNT, type Player, type Vec } from './types';
import { add, angleBetween, clamp, clampLen, dist, dot, len, mul, norm, sub } from './vec';

export type Outcome = 'complete' | 'incomplete' | 'interception' | 'sack' | 'scramble';

export interface PlayResult {
  outcome: Outcome;
  /** Offensive yards from the line of scrimmage (0 on incompletions and interceptions). */
  yards: number;
  touchdown: boolean;
  targetId?: string;
  throwTime?: number;
  /** How far downfield the ball was caught (or landed). */
  airYards?: number;
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
  /** After the route: where they're heading, and when they'll look again. */
  improvSpot?: Vec;
  improvUntil: number;
  /** Past positions, one per tick, for defenders reacting with a lag. */
  trail: Vec[];
}

interface Cover extends Body {
  job: Job;
  man?: Runner;
  zone?: Zone;
  cushion: number;
  rubbed: boolean;
  /** A safety carrying a go: who they're staying over the top of. */
  carry?: Runner;
}

const MAX_TIME = 20;
/** Room (yards) a planned quick throw needs: soft coverage. */
const QUICK_BAR = 1;
/**
 * Obviously open, judged by what the QB sees right now: behind the defense (downfield, with everyone
 * nearby trailing him and nobody over the top), or nobody within OBVIOUS yards. The QB sees it even
 * while staring down his favorite and throws it, whether or not the defense can close in time.
 */
const OBVIOUS = 8;
const BEHIND_DEPTH = 12;
const BEHIND_SEP = 4;
/** Everyone nearby must trail the receiver by at least this much (yards) for him to be "behind" them. */
const BEHIND_BY = 3;
/** A defender deeper than the receiver and within this many yards is "over the top". */
const OVER_TOP = 12;
const YAC_TIME = 8;
/** After their route, a receiver this far (yards) from every defender stays put and is a target. */
const OPEN = 3;
/** How far (yards) a covered receiver will go looking for open space. */
const IMPROV_RANGE = 8;
/** Seconds a receiver sticks with a spot before looking again. */
const IMPROV_COMMIT = 1;
/** Deep defenders go at most this far past their landmark. */
const DEEP_CAP = 8;
/** "Looks like a go": sprinting upfield faster than this (yd/s), mostly vertically. */
const GO_SPEED = 5;
/** Safeties pick up a go anywhere in their area once it's within this many yards of their depth (they read the stem). */
const GO_RANGE = 12;
/** Yards a safety stays over the top of a go, and the deepest they'll carry it. */
const GO_CUSHION = 3;
const GO_MAX_DEPTH = 30;

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

/**
 * Route's done, play's still alive: open receivers stay put; covered ones run to the most open spot
 * nearby, keeping their distance from teammates so they don't bunch into the same hole.
 */
function improvise(r: Runner, t: number, defenders: readonly Body[], teammates: readonly Runner[]) {
  const room = (p: Vec) => defenders.reduce((best, d) => Math.min(best, dist(d.pos, p)), Infinity);
  const covered = room(r.pos) < OPEN;
  // Covered and not going anywhere (got there, or was open until someone closed): look again now.
  const stuck = covered && (!r.improvSpot || dist(r.pos, r.improvSpot) < 0.5);
  if (!r.improvSpot || t >= r.improvUntil || stuck) {
    r.improvUntil = t + IMPROV_COMMIT;
    if (!covered) r.improvSpot = r.pos;
    else {
      let best = { spot: r.pos, score: -Infinity };
      for (let dx = -IMPROV_RANGE; dx <= IMPROV_RANGE; dx += 2) {
        for (let dy = -IMPROV_RANGE; dy <= IMPROV_RANGE; dy += 2) {
          if (Math.hypot(dx, dy) < 2) continue; // covered means move
          const spot = { x: clamp(r.pos.x + dx, -FIELD.halfWidth + 1, FIELD.halfWidth - 1), y: clamp(r.pos.y + dy, 1, 25) };
          const crowd = teammates.reduce((sum, m) => (m === r ? sum : sum + Math.max(0, 4 - dist(m.pos, spot)) * 0.5), 0);
          const score = room(spot) - 0.15 * dist(r.pos, spot) - crowd;
          if (score > best.score) best = { spot, score };
        }
      }
      r.improvSpot = best.spot;
    }
  }
  steer(r, r.improvSpot, r.phys.topSpeed * 0.8);
}

/** Planned cuts: the receiver knows the break, losing speed by cut angle and agility. */
function runRoute(r: Runner, t: number, defenders: readonly Body[], teammates: readonly Runner[]) {
  if (t < r.delay) {
    r.trail.push(r.pos);
    return;
  }
  if (r.sitting) {
    improvise(r, t, defenders, teammates);
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

/** Where a receiver was `lag` seconds ago, and how they were moving then. */
function seenAt(r: Runner, lag: number): { pos: Vec; vel: Vec } {
  const trail = r.trail;
  const i = Math.max(1, trail.length - 1 - Math.round(lag / DT));
  const pos = trail[Math.min(i, trail.length - 1)];
  return { pos, vel: mul(sub(pos, trail[i - 1] ?? pos), 1 / DT) };
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
      improvUntil: 0,
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
      const job = call.jobs[p.id];
      if (job.kind === 'zone') return { ...body(p, job.zone.align, rng), job, zone: job.zone, cushion: 0, rubbed: false };
      const man = runnerById.get(job.targetId);
      const s = man?.pos ?? CENTER_SPOT;
      const inside = s.x === 0 ? 0 : -Math.sign(s.x) * 0.7;
      const over = job.shade === 'over' ? 3 : 0;
      const start = { x: s.x + inside, y: 4 + over + Math.min(1.5, Math.max(0, -s.y) * 0.6) };
      return { ...body(p, start, rng), job, man, cushion: Math.min(start.y - s.y, 5 + over), rubbed: false };
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
  /** Who the QB is looking at; zone defenders read it. */
  let qbLook: Runner | undefined = runnerById.get(play.primaryId);

  /** Man: mirror what they saw a lag ago, projected forward: tight on straight lines, beaten at breaks. */
  const manStep = (c: Cover, m: Runner) => {
    const seen = seenAt(m, c.phys.manLag);
    const shade = c.job.kind === 'man' ? c.job.shade : undefined;
    const cushion = shade === 'over' ? Math.max(3, c.cushion - t * 2) : shade === 'under' ? -0.8 : Math.max(0.8, c.cushion - t * 3);
    const inside = shade === 'under' ? -Math.sign(seen.pos.x) * 0.8 : 0;
    const target = add(add(seen.pos, mul(seen.vel, c.phys.manLag)), { x: inside, y: cushion });
    const ahead = norm(sub(target, c.pos));
    const blocked = everyone.some(
      (o) => o !== c && o !== m && o !== qb && dist(o.pos, c.pos) < 1 && dot(sub(o.pos, c.pos), ahead) > 0,
    );
    if (blocked) c.rubbed = true;
    steer(c, target, c.phys.topSpeed * (blocked ? 0.55 : 1));
  };

  /** Zone: own an area, read receivers through it (with a lag), and lean toward the QB's eyes. */
  const zoneStep = (c: Cover, z: Zone) => {
    const L = z.landmark;
    const seen = runners.filter((r) => t >= r.delay).map((r) => ({ r, ...seenAt(r, c.phys.zoneLag) }));
    const inBand = (p: Vec) => Math.abs(p.x - L.x) <= z.radius;
    const deepest = (list: typeof seen) => list.reduce<(typeof seen)[number] | undefined>((a, b) => (!a || b.pos.y > a.pos.y ? b : a), undefined);
    // Stay deeper than the threat, but no deeper than is worth defending.
    /** Running straight upfield off the line, before any break. */
    const verticalStem = (x: (typeof seen)[number]) => x.pos.y > x.r.trail[0].y + 1.5 && x.vel.y > 4 && x.r.wp === 0;
    const onTop = (p: Vec, over: number, ref = L): Vec => ({ x: ref.x + (p.x - ref.x) * 0.7, y: clamp(p.y + over, ref.y - 2, ref.y + DEEP_CAP) });
    const undercut = (p: Vec, by: number) => add(p, mul(norm(sub(qb.pos, p)), by));
    const eyes = qbLook ? { x: (qbLook.pos.x - L.x) * c.phys.zoneRead * 0.25, y: 0 } : { x: 0, y: 0 };
    const home = add(L, eyes);

    // Safeties (anyone with deep duty) never let someone get behind them: play the zone until a go
    // shows up, then lock on and fall back, staying over the top until he breaks off.
    const safety = z.kind === 'deep' || z.kind === 'sink' || (z.kind === 'lurk' && !z.free);
    if (safety) {
      const looksLikeGo = (x: (typeof seen)[number]) => x.vel.y > GO_SPEED && Math.abs(x.vel.x) < 0.5 * x.vel.y && x.pos.y > x.r.trail[0].y + 1.5;
      const area = (p: Vec) => (z.kind === 'lurk' ? Math.abs(p.x - L.x) <= 6 : Math.abs(p.x - L.x) <= z.radius + 1.5);
      // Whoever is about to get behind them: the sprinter who'll be deepest in about a second. Whoever
      // they're already carrying stays a candidate (even drifting out of the area) until he breaks off.
      const stillGoing = (x: (typeof seen)[number]) => x.pos.y > c.pos.y - GO_CUSHION && (x.vel.y > 1 || x.pos.y > c.pos.y - 1);
      const candidates = seen.filter(
        (x) => (x.r === c.carry && stillGoing(x)) || (area(x.pos) && looksLikeGo(x) && x.pos.y > c.pos.y - GO_RANGE),
      );
      const soon = (x: (typeof seen)[number]) => x.pos.y + Math.max(0, x.vel.y) * 0.8;
      const go = candidates.reduce<(typeof seen)[number] | undefined>((a, b) => (!a || soon(b) > soon(a) ? b : a), undefined);
      c.carry = go?.r;
      if (go) {
        // Aim where he'll be in half a second, so they get moving before he's on them.
        const ahead = go.pos.y + Math.max(0, go.vel.y) * 0.5;
        const over = { x: go.pos.x + (L.x - go.pos.x) * 0.2, y: Math.min(GO_MAX_DEPTH, Math.max(ahead + GO_CUSHION, c.pos.y)) };
        steer(c, over);
        return;
      }
    }

    let target = home;
    if (z.kind === 'deep') {
      // Split everyone threatening the band, staying over the deepest.
      const band = seen.filter((s) => inBand(s.pos) && (s.pos.y >= 7 || verticalStem(s)));
      const th = deepest(band);
      if (th) {
        const top = onTop(th.pos, 3);
        const midX = band.reduce((sum, s) => sum + s.pos.x, 0) / band.length;
        target = { x: L.x + (midX - L.x) * 0.7, y: top.y };
      }
    } else if (z.kind === 'under' || z.kind === 'sink') {
      // Sink: a vertical is coming at them or already past them, so run back and play safety over him.
      const sinking = (s: (typeof seen)[number]) =>
        (s.pos.y > c.pos.y + 0.5 && (s.vel.y > 2 || s.pos.y > z.carryTo)) || (verticalStem(s) && s.pos.y > c.pos.y - 5);
      const passed = z.kind === 'sink' ? deepest(seen.filter((s) => inBand(s.pos) && sinking(s))) : undefined;
      const near = seen
        .filter((s) => dist(s.pos, L) <= z.radius && s.pos.y <= z.carryTo)
        .reduce<(typeof seen)[number] | undefined>((a, b) => (!a || dist(b.pos, L) < dist(a.pos, L) ? b : a), undefined);
      if (passed) target = onTop(passed.pos, 2, z.bailTo ?? L);
      else if (near) {
        const off = sub(undercut(near.pos, 1.5), L);
        target = add(L, clampLen(off, z.radius + 1));
      }
    } else if (z.kind === 'squat') {
      // Jump short breaks; anything vertical is the sink zone's, so stay home underneath.
      const short = seen.find((s) => inBand(s.pos) && s.pos.y <= z.carryTo && s.r.wp >= 1);
      if (short) target = undercut(short.pos, 0.8);
    } else {
      const deepMid = z.free ? undefined : deepest(seen.filter((s) => Math.abs(s.pos.x) <= 5 && s.pos.y >= 10));
      if (deepMid) target = onTop(deepMid.pos, 2.5);
      else if (qbLook) {
        const k = 0.35 + 0.4 * c.phys.zoneRead;
        const p = add(L, mul(sub(qbLook.pos, L), k));
        target = { x: p.x, y: Math.max(p.y, z.free ? 5 : 9) };
      }
    }
    // Dropping to the landmark is a backpedal; carrying a receiver deep, they turn and run.
    const carrying = target !== home;
    steer(c, target, c.phys.topSpeed * (!carrying && target.y > c.pos.y + 1 ? 0.85 : 1));
  };

  const coverStep = (c: Cover) => {
    if (c.man) manStep(c, c.man);
    else if (c.zone) zoneStep(c, c.zone);
  };
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
        if (holdCoverage && d !== rusher) coverStep(d as Cover);
        else {
          const lead = Math.min(1.2, dist(d.pos, carrier.pos) / d.phys.topSpeed);
          steer(d, add(carrier.pos, mul(carrier.vel, lead)));
        }
      }
      for (const r of runners) {
        if (r === carrier) continue;
        if (holdCoverage) runRoute(r, t, covers, runners);
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
  const obvious = (r: Runner) => {
    const separation = nearestCover(r.pos);
    if (separation >= OBVIOUS) return true;
    const behind = covers.every((c) => c.pos.y < r.pos.y - BEHIND_BY || dist(c.pos, r.pos) > OVER_TOP);
    return r.pos.y >= BEHIND_DEPTH && separation >= BEHIND_SEP && behind;
  };
  let quickPhase = false;
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
    let score = windowAt(catchPoint, travelTime) + misread.get(r.id)! + gauss(rng) * 0.25 - need;
    // Obviously open gets thrown (and is hard to misread).
    if (!quickPhase && obvious(r)) score = Math.max(score, 0.5 + separation * 0.1 + misread.get(r.id)! * 0.3);
    return { r, catchPoint, separation, score, travel: travelTime };
  };

  snapshot(0, qb.pos);
  // Pre-throw: routes, coverage, rush, and the QB's read.
  let thrown: (NonNullable<ReturnType<typeof evaluate>> & { forced: boolean; pressure: number }) | undefined;
  while (!thrown) {
    for (const r of runners) runRoute(r, t, covers, runners);

    for (const c of covers) coverStep(c);

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
      quickPhase = !!quick;
      const looking = quick
        ? [quick]
        : runners.filter((r) => ready(r) && (!locked || r.id === play.primaryId || obvious(r)));
      const reads = looking.map((r) => evaluate(r, locked, bar)).filter((x) => x !== undefined);
      const best = reads.reduce<(typeof reads)[number] | undefined>((a, b) => (!a || b.score > a.score ? b : a), undefined);

      qbLook = locked ? runnerById.get(play.primaryId) : (best?.r ?? qbLook);
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
  const extra = { targetId: target.id, throwTime, separation: thrown.separation, airYards: land.y };

  while (t < throwTime + thrown.travel) {
    for (const r of runners) {
      if (r === target && t >= throwTime + 0.1) steer(r, land);
      else runRoute(r, t, covers, runners);
    }
    qbLook = target;
    for (const c of covers) {
      // Zone defenders watch the QB, so they break on the ball sooner; man defenders are watching their man.
      const react = throwTime + (c.zone ? c.phys.reaction * (1.2 - 0.6 * c.phys.zoneRead) : c.phys.reaction + (c.man === target ? 0 : 0.3));
      if (t >= react && (c.man === target || dist(c.pos, land) < (c.zone ? 15 : 12))) steer(c, land);
      else coverStep(c);
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
