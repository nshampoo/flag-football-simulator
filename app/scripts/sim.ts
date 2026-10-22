// Ranks every rusher and rush mode in man coverage against an archetype.
//   npm run sim -- [archetype, default: all] [plays per call, default 1000]
import { ARCHETYPE_LABELS, ARCHETYPE_NAMES, ARCHETYPES, type ArchetypeName } from '../src/engine/archetypes';
import { runMatchup, type Summary } from '../src/engine/montecarlo';
import { MY_TEAM, OPPONENT } from '../src/engine/roster';
import { defenseCall, type RushMode } from '../src/engine/coverage';

const [which, playsArg = '1000'] = process.argv.slice(2);
const plays = Number(playsArg);
if (which && !(which in ARCHETYPES)) throw new Error(`archetype must be one of ${ARCHETYPE_NAMES.join(', ')}`);
const archetypes = which ? [which as ArchetypeName] : ARCHETYPE_NAMES;

const pct = (n: number) => `${(n * 100).toFixed(0)}%`.padStart(4);
const num = (n: number) => n.toFixed(1).padStart(5);

for (const name of archetypes) {
  const rows: { label: string; s: Summary }[] = [];
  for (const rusher of MY_TEAM) {
    for (const mode of ['hard', 'contain'] as RushMode[]) {
      const call = defenseCall('man', MY_TEAM, OPPONENT, rusher.id, mode);
      const s = runMatchup({ offense: OPPONENT, tendencies: ARCHETYPES[name], defense: MY_TEAM, call }, plays);
      rows.push({ label: `${rusher.name} (${mode})`, s });
    }
  }
  rows.sort((a, b) => a.s.yardsPerPlay - b.s.yardsPerPlay);
  console.log(`\n${ARCHETYPE_LABELS[name]}: man coverage, ${plays} plays per call, best first (fewest yards per play)`);
  console.log('rusher               yds/play  cmp  big  int  sack  scr  throw s');
  for (const { label, s } of rows) {
    console.log(
      `${label.padEnd(20)} ${num(s.yardsPerPlay)}    ${pct(s.completionPct)} ${pct(s.bigPlayPct)} ${pct(s.intPct)}  ${pct(s.sackPct)} ${pct(s.scramblePct)}  ${num(s.timeToThrow)}`,
    );
  }
}
