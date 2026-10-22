# Flag Football Defense Simulator — Design

## 1. Goal

Scouting report in, game plan out. Input an opponent archetype ("loves go routes", "scared QB", etc.),
output a call card: best defense, runner-up and margin, who rushes, who covers their favorite, and what
to watch for.

Results and an interactive play viewer will be hosted on shampoe.com.

## 2. League rules (modeled exactly)

- 7v7: offense is QB, center, and 5 receivers. Center is an eligible receiver.
- Field is narrow: about half the width of a regulation field (~27 yards). The sideline acts like an
  extra defender; the field gets dense if the offense doesn't stretch it vertically.
- One rusher, who must line up on or within 2 yards of the line of scrimmage. The rusher cannot drop
  into coverage before the ball is thrown.
- Rusher has a 5 second count. After 5 seconds the rusher can rush and the QB can run. Before that the
  QB is a stationary passer.
- No pick plays allowed, but rubs happen naturally (especially from bunch and stack alignments).
- Result: coverage is effectively 6 on 6 (6 eligibles vs 6 non-rushing defenders).

## 3. Decisions

| Decision | Choice | Why |
|---|---|---|
| Engine | Pure TypeScript in `app/src/engine`, Vitest | Shared by the browser viewer and Node Monte Carlo batches |
| Frontend | React + Vite + TypeScript, static build | Same as the other shampoe.com apps; no backend |
| Results | Precomputed findings as JSON, plus live single-play sims in the browser (web worker if needed) | Static hosting |
| Coordinates | Yards; x across the field, y downfield, LOS at y = 0, relative to the ball | |
| Time | 2D tick sim, 0.1 s per tick | |
| Randomness | Seeded RNG (`mulberry32`) | Any play replays exactly from its seed |
| Field length | **Placeholder: 40 yards LOS to goal** | Real field length is an open question |

## 4. Player model

Every player has six 1 to 10 ratings, mapped to physical values in `engine/ratings.ts`:

| Rating | Drives |
|---|---|
| Speed | top speed (6.5 to 8.5 yd/s) and acceleration |
| Agility | change of direction (speed kept through a cut, scaled by cut angle), reaction time (0.2 to 0.5 s), route sharpness, flag pulling, and (with some Speed) **elusiveness**: the chance a flag pull on you misses (5 to 50%) |
| Hands | catch probability, contested catches |
| Catch Height | height × jump; max catch point (~8 ft at 1 to ~10.5 ft at 10). Used on contested/high balls, both receivers and defenders |
| Man | mirroring tightness in man coverage |
| Zone | reading threats, breaking on throws, reading QB eyes |

QBs add **Arm** (accuracy and range) and **Poise** (release time, read speed, accuracy under pressure,
and how long they lock on to their favorite). Scramble ability comes from Speed.

Small per-play noise on every rating so repeated reps vary. No fatigue in v1.

**Flag pulls** (sacks, scrambles, and runs after the catch all use the same rule): a defender within a
yard tries each tick with chance flag pull × (1 − carrier's elusiveness). A miss costs the defender
their momentum and a beat (0.3 s + reaction time) before they can try again, so an athletic QB can make
the rusher whiff and buy time even when the rusher is right in his way.

## 5. Routes and plays

- **Route library**: waypoint lists relative to the receiver's start, written for the right side and
  auto-mirrored: flat, slant, out, in, curl, comeback, corner, post, go, wheel, whip, shallow cross,
  out and up, plus a stick/sit for the center.
- **Formations**: 6 alignment sets for the 5 non-center eligibles (spread, trips, quads, bunch, stack,
  double stack). Center releases after a 0.5 to 1 s delay and is the natural checkdown.
- **Plays are sampled, not curated.** Sample a formation and a plausible route mix (usually one deep,
  a couple intermediate, someone short), shaped by the opponent archetype.

## 6. QB model

- Has a **primary (favorite)** and optional **secondary** target.
- Stays on the primary for a lock-on time (Poise), then **scans** each tick and throws to whoever looks
  open enough, with noise in how well they judge "open".
- **Urgency**: the "open enough" bar drops as the clock passes 5 s and pressure arrives.
- After 5 s: can scramble. Accuracy drops under pressure.

**Throw timing (from real play):** rec QBs throw either within ~0.5 s or somewhere between 4 and 8 s,
almost never in between. The sim models two modes:
- **Planned quick throw**: some plays carry a pre-snap plan to a short route (more for checkdown-minded
  QBs). It's taken at the release only if coverage is soft (≥ 1 yd of window), otherwise forgotten. A
  defense that closes up takes it away, which is a defense choice once alignment is modeled.
- **Otherwise, use the count**: before 5 s the QB only throws to someone wide open; after it, urgency
  and pressure drop the bar fast. Receivers who finish their route work to open space.
- "Open" is judged as the window when the ball arrives: defenders keep moving through their reaction
  time, then close. Misreads are mostly a per-receiver bias for the whole play (Poise), plus a little
  per-look wobble; fresh noise every tick makes someone look open by chance.
- **Obviously open gets thrown**, judged by what the QB sees right now rather than the arrival window
  (which knocks ~7 yds off a deep ball's look): a receiver **behind the defense** (12+ yds downfield,
  4+ yds of separation, everyone nearby trailing him by 3+ yds, nobody over the top within 12), or
  nobody within 8 yds. The QB sees it even while locked on his favorite, and it's hard to misread.
  Whether it's caught is still physics. A flat "5 yds from the nearest defender" rule was tried and
  dropped: in zones that's true of soft spots early in most plays, so everything got thrown before 4 s
  and interceptions tripled.

## 7. Defense model

Defense = coverage + rusher behavior + personnel.

**Coverages (v1)**
1. **Man (Cover 0)**: everyone has an assignment, no help.
2. **Man + bracket**: two defenders on their favorite, leaving their weakest eligible (often the center) uncovered.
3. **Cover 2**: 2 deep halves, 4 underneath zones. This is our base defense (two high), and our hooks
   play 3 yds deeper than a textbook Cover 2 (10 instead of 7), except on short yardage. Short
   yardage belongs to the v2 situational layer.
4. **Cover 3**: outside thirds at depth, middle safety deep.
5. **Cover 3 Aggressive**: squat thirds a touch inside (±7.5 yds, 5 deep) jump short breaks and
   hand verticals to the hook player right behind them (±7, 9 deep). Those hooks are dynamic: they
   play the hook, but run back to a full safety spot if someone passes them or a go comes at them.
   Middle safety is a lurker who drifts toward where the QB is looking and breaks on the throw, but
   still owns the deep middle; a middle hook sits underneath. (A free-robber variant was tried and
   dropped.)

**Zone mechanics** (`engine/coverage.ts`, `zoneStep` in `engine/sim.ts`): each zone has a landmark,
pre-snap alignment, radius, and carry depth. Zone defenders read receivers with a lag (Zone rating),
lean toward the QB's eyes, break on the throw sooner than man defenders, and ignore rubs. Four kinds:
- **deep**: stay on top of the deepest threat in their band and split multiple threats; never more
  than 8 yds past the landmark (chasing a go to 35 yds leaves a hole at 15). They read a vertical stem
  off the line as a threat right away and turn and run to carry it (only plain drops are a backpedal).
- **under**: undercut the receiver nearest the landmark; past the carry depth, pass him off. With no
  job: if someone sprinted past them, sit back to ~10 to 14 yds and fill the void; otherwise sink back
  2.5 yds. (From play: "if someone sprints past me, I'm more willing to sit back 10 yards.")
- **squat** (Cover 3 Aggressive corners): jump quick breaks in their band; leave verticals to the
  sink behind them.
- **sink** (Cover 3 Aggressive hooks): play a hook right behind the squat; if a receiver gets past
  them or a go comes at them, run back to a full safety spot over the top.
- **lurk**: drift toward whoever the QB is looking at; carry anything in the deep middle.

**Safety rule** (every defender with deep duty: deep zones, sinks, and the lurker): never let someone get behind you. Play the zone or lurk until someone looks like a go
(sprinting upfield over 5 yd/s, mostly vertical, anywhere in your area), then lock on and fall back:
3 yds over the top of where he'll be in half a second, never stepping forward, as deep as 30 yds. Each
tick they guard whichever sprinter will be deepest soon, and let go when he breaks off. The cost: a
safety who runs off with a go leaves the 13 to 18 yd hole behind the underneath zones.

Personnel is a fit heuristic for now: deep spots to fast, tall zone players, the lurker to the best
zone player with hands, squats to speed and agility, and underneath zones to whoever's left.

Receivers who finish a route while the play is alive: if open (3+ yds from every defender) they stay
put and are a target; if covered they run to the most open spot within ~8 yds (scored by room from
defenders, minus distance to run and crowding teammates), commit to it for ~1 s, and look again
straight away if they get there still covered.

**Man mechanics**: defenders steer toward where their receiver was a lag ago (lag from Man rating).
Receivers make planned cuts (losing speed by Agility); defenders react, so separation appears at breaks.

**Rubs**: each tick, if a man defender's path is blocked by another player within ~1 yard, they slow
down. Zone defenders mostly pass receivers off and aren't affected.

**Rusher modes**: rush hard at 5 s, or contain (stay ~3 yds off, cut off the scramble lane, less
pressure). After the throw, the rusher joins the pursuit, so rusher speed reduces YAC.

**Personnel**: the sim tries reasonable assignments of the roster into each scheme (who rushes, who
plays safety, who covers the favorite).

## 8. Opponent archetypes

Presets of five knobs (0 to 1): deep tendency, hold time, lock-on, QB mobility, checkdown habit.

| Archetype | Description | Hypothesized counter (verify with the sim) |
|---|---|---|
| Gunslinger | throws deep early, loves go routes and jump balls to their tallest guy | Cover 2 or 3, tall defenders deep |
| Dink and Dunk | quick release, short routes, checkdowns to the center | Cover 3 Aggressive |
| Hero Ball | forces it to one star receiver | Man + bracket |
| Scrambler | extends past 5 s, runs if nothing's there | contain rusher, probably zone |
| Scared QB | holds the ball, doesn't run, forces late | rush fastest player, man |
| Balanced | league-average baseline | n/a |

Expected rusher logic: quick-release QB means rush your weakest cover player; immobile QB who holds it
means rush your fastest; scrambler means fast and disciplined in contain.

## 9. Outputs

- Per matchup distributions: completion %, yards, big play %, interceptions, sacks/pressures,
  scramble yards.
- Heatmap: defense × archetype (and defense × play type).
- **Call card per archetype**: best defense, runner-up and margin, rusher, who covers their favorite,
  what to watch for.

## 10. Roadmap

**v1 (play by play)**
- [x] Placeholder rosters (swap in real ratings later)
- [x] Route library, formations, sampled plays per archetype
- [x] Tick sim: routes, man trailing, rubs, 5 s rush (hard/contain), QB reads, scramble, catch/INT, YAC (needs calibration, §11)
- [x] Monte Carlo summary (`engine/montecarlo.ts`)
- [x] Monte Carlo CLI (`npm run sim`): ranks rusher × rush mode in man coverage
- [x] Basic play viewer (animated field, scrubber, run 1,000)
- [x] Zones: landmarks, triggers, Cover 2, Cover 3, Cover 3 Aggressive, lurker (Robber tried and dropped)
- [x] Man + bracket
- [x] CLI ranks every defense × rusher × rush mode per archetype; viewer has a defense picker
- [ ] Personnel search across schemes
- [ ] JSON results, heatmap, and call cards
- [ ] Story page and app on shampoe.com (personal-website repo)

**v2 and later**
- Drive simulation layer: stop rate and points allowed per drive, situational call sheets (3rd and
  long, short yardage, red zone). Needs league down rules. Situations change what's available, e.g. on
  short yardage the defense closes up and the planned quick throw usually isn't there.
- Adaptation: offense leans on what works, defense mixes calls.
- In-game play logging that suggests which archetype the opponent is.
- Full interactive viewer: pick archetype, defense, and play; QB's current read; separation at the throw.
- Tap-to-draw play designer (possibly iOS) exporting route JSON.
- Calibration: log 20 to 30 real plays and tune the model until results roughly match.

## 11. Calibration status

**Update (underneath fill/sink + deeper Cover 2 hooks):** Cover 2 is now best vs Gunslinger,
Scrambler, and Scared QB (5.6 to 6.1 yds/play) and gives up the fewest big plays of anything (4 to 9%),
up from worst zone (9 to 12 yds/play). Cover 3 Aggressive is still best vs Dink and Dunk (4.1) and
Balanced; Cover 3 improved (Gunslinger 9.9 → 8.0).

**Update (safety rule + Cover 3 Aggressive rebuild):** Cover 3 Aggressive is now the best zone (4.2 to
7.3 yds/play) and best overall vs Dink and Dunk, Hero Ball, and Balanced. Go balls rarely beat any
zone. Cover 2 and Cover 3 got worse (Cover 3 vs Gunslinger 6.3 → 9.9): receivers who find space
settle in the hole behind the underneath zones (which pass off at 12) and in front of safeties
carrying gos.

**Update (after receivers find space and QBs see obvious open men):** yards per play 4 to 13 by
matchup, ~63% completion. Cover 3 is now best against every archetype (4.1 to 6.3 yds/play); Man fell
to 2nd to 4th. Tension: the 1.2 to 4 s throw band is back up to 38 to 64%, since wide-open deep balls
naturally come around 3 s. Worth checking against real games which observation should give.

Earlier notes:

Target: the throw timing above, plus rough rec numbers (~60% completion, 5 to 8 yds/play).

Current (1,000 plays per archetype, man coverage, fastest player rushing hard):
- Completion ~56 to 62%: OK.
- Throw timing: quick throws 5 to 27% of plays, 4 to 8 s band 24 to 65%, but still 25 to 53% in the
  1.2 to 4 s gap. Too many.
- Yards per play 3.7 to 5.9 and big plays (15+) 8 to 14% since elusiveness: closer, still a bit low.
- Scrambles now gain 1.6 to 3.7 yds, but still happen too often for mobile QBs (45% of plays for Scrambler).
- Sacks vs a Scared QB: 7.5% (agility 2) / 5.8% (6) / 4.2% (10).
- Backfield releases (flat, wheel) are ~6 yds open against man: plausible, worth checking on film.

First defense rankings (400 plays per call; margins under ~0.5 yds/play are within noise):

| Archetype | Best | Runner-up | Note |
|---|---|---|---|
| Gunslinger | Cover 3 (5.5) | Man (5.8) | C3 Aggressive / Robber get torched deep (37 to 41% big plays) |
| Dink and Dunk | Man (4.3) | Cover 2 (4.7) | Spec guessed C3 Aggressive; sim has it 4th (5.6) |
| Hero Ball | Man (4.3) | Cover 3 (5.1) | Spec guessed bracket; it's 4th (8.2) because the QB checks down to the uncovered center (59% of targets) |
| Scrambler | Cover 3 (3.4) | Cover 2 (3.7) | Rusher: Quick (fast and agile) |
| Scared QB | Man (3.8) | Cover 3 (5.2) | Rush hard, as the spec guessed |
| Balanced | Man (4.1) | Cover 3 (5.0) | |

Hard rush beats contain almost everywhere. Against C3 Aggressive, Robber, and the bracket, QBs throw at
2 to 3 s with no sacks: something is open early (holes under the squats, the uncovered center).

Next: watch plays in the viewer and compare against real games before more tuning.

## 12. Open questions

- Real roster ratings
- League down rules and any no-run zones (needed for v2 drives)
- Exact field length and end zone depth
