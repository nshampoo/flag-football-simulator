// Ranks defenses against an archetype: every coverage with every rusher and rush mode.
//   npm run sim -- [archetype, default: all] [plays per call, default 400] [coverage: show its full rusher table]
import { ARCHETYPE_LABELS, ARCHETYPE_NAMES, ARCHETYPES, type ArchetypeName } from '../src/engine/archetypes';
import { COVERAGE_LABELS, COVERAGES, defenseCall, type Coverage, type RushMode } from '../src/engine/coverage';
import { runMatchup, type Summary } from '../src/engine/montecarlo';
import { MY_TEAM, OPPONENT } from '../src/engine/roster';

const [which, playsArg = '400', detail] = process.argv.slice(2);
const plays = Number(playsArg);
if (which && which !== 'all' && !(which in ARCHETYPES)) throw new Error(`archetype must be all or one of ${ARCHETYPE_NAMES.join(', ')}`);
if (detail && !COVERAGES.includes(detail as Coverage)) throw new Error(`coverage must be one of ${COVERAGES.join(', ')}`);
const archetypes = which && which !== 'all' ? [which as ArchetypeName] : ARCHETYPE_NAMES;

const pct = (n: number) => `${(n * 100).toFixed(0)}%`.padStart(4);
const num = (n: number) => n.toFixed(1).padStart(5);
const names = new Map(MY_TEAM.map((p) => [p.id, p.name]));
const header = 'yds/play  cmp  big  int  sack  scr  throw s';
const stats = (s: Summary) =>
  `${num(s.yardsPerPlay)}    ${pct(s.completionPct)} ${pct(s.bigPlayPct)} ${pct(s.intPct)}  ${pct(s.sackPct)} ${pct(s.scramblePct)}  ${num(s.timeToThrow)}`;

for (const name of archetypes) {
  const tendencies = ARCHETYPES[name];
  const best: { coverage: Coverage; rusher: string; mode: RushMode; s: Summary }[] = [];
  for (const coverage of COVERAGES) {
    const rows = MY_TEAM.flatMap((rusher) =>
      (['hard', 'contain'] as RushMode[]).map((mode) => {
        const call = defenseCall(coverage, MY_TEAM, OPPONENT, rusher.id, mode);
        return { coverage, rusher: rusher.id, mode, s: runMatchup({ offense: OPPONENT, tendencies, defense: MY_TEAM, call }, plays) };
      }),
    );
    rows.sort((a, b) => a.s.yardsPerPlay - b.s.yardsPerPlay);
    best.push(rows[0]);
    if (coverage === detail) {
      console.log(`\n${ARCHETYPE_LABELS[name]}, ${COVERAGE_LABELS[coverage]}: every rusher`);
      console.log(`rusher               ${header}`);
      for (const r of rows) console.log(`${`${names.get(r.rusher)} (${r.mode})`.padEnd(20)} ${stats(r.s)}`);
    }
  }
  best.sort((a, b) => a.s.yardsPerPlay - b.s.yardsPerPlay);
  const margin = best[1].s.yardsPerPlay - best[0].s.yardsPerPlay;
  console.log(`\n${ARCHETYPE_LABELS[name]}: best defense first, each with its best rusher (${plays} plays per call)`);
  console.log(`defense              rusher               ${header}`);
  for (const b of best) {
    console.log(`${COVERAGE_LABELS[b.coverage].padEnd(20)} ${`${names.get(b.rusher)} (${b.mode})`.padEnd(20)} ${stats(b.s)}`);
  }
  console.log(`→ ${COVERAGE_LABELS[best[0].coverage]} with ${names.get(best[0].rusher)} rushing (${best[0].mode}), by ${margin.toFixed(1)} yds/play over ${COVERAGE_LABELS[best[1].coverage]}`);
}
