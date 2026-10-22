// Searches for the best setup (defense, rusher, rush mode, who plays where) against an archetype.
//   npm run best -- [archetype, default: balanced]
import { ARCHETYPE_LABELS, ARCHETYPE_NAMES, ARCHETYPES, type ArchetypeName } from '../src/engine/archetypes';
import { COVERAGE_LABELS, type Job } from '../src/engine/coverage';
import { MY_TEAM, OPPONENT } from '../src/engine/roster';
import { BROWSER_SEARCH, searchBestSetup } from '../src/engine/search';

const name = (process.argv[2] ?? 'balanced') as ArchetypeName;
if (!(name in ARCHETYPES)) throw new Error(`archetype must be one of ${ARCHETYPE_NAMES.join(', ')}`);

const names = new Map([...MY_TEAM, OPPONENT.center, ...OPPONENT.receivers].map((p) => [p.id, p.name]));
const jobLabel = (job: Job) => {
  if (job.kind === 'man') return `Man on ${names.get(job.targetId)}${job.shade ? ` (${job.shade})` : ''}`;
  const x = job.zone.landmark.x;
  return `${job.zone.label}${x < -0.5 ? ' (left)' : x > 0.5 ? ' (right)' : ''}`;
};

const started = Date.now();
let last = -1;
const result = searchBestSetup(
  { offense: OPPONENT, tendencies: ARCHETYPES[name], defense: MY_TEAM },
  {
    ...BROWSER_SEARCH,
    onProgress: (f) => {
      const pct = Math.floor(f * 10) * 10;
      if (pct !== last) process.stderr.write(`${pct}% `), (last = pct);
    },
  },
);
process.stderr.write(`(${((Date.now() - started) / 1000).toFixed(1)}s)\n`);

const [best, next] = result.ranked;
console.log(`\n${ARCHETYPE_LABELS[name]}: ${COVERAGE_LABELS[best.call.coverage]}, ${names.get(best.call.rusherId)} rushing (${best.call.rushMode})`);
console.log(`  ${best.summary.yardsPerPlay.toFixed(2)} ± ${best.se.toFixed(2)} yds/play; runner-up ${COVERAGE_LABELS[next.call.coverage]} by ${(next.summary.yardsPerPlay - best.summary.yardsPerPlay).toFixed(2)}`);
for (const [id, job] of Object.entries(best.call.jobs)) console.log(`  ${names.get(id)!.padEnd(9)} ${jobLabel(job)}`);
console.log(`  Watch for: ${result.watchFor.map((w) => `${w.route} (${(w.yardShare * 100).toFixed(0)}% of yards)`).join(', ')}`);
console.log('\nEvery defense, tuned:');
for (const s of result.ranked) {
  console.log(`  ${COVERAGE_LABELS[s.call.coverage].padEnd(20)} ${s.summary.yardsPerPlay.toFixed(2).padStart(5)} ± ${s.se.toFixed(2)}  rusher ${names.get(s.call.rusherId)} (${s.call.rushMode})`);
}
