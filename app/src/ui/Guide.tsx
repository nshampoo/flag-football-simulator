import { ARCHETYPE_DESCRIPTIONS, ARCHETYPE_LABELS, ARCHETYPE_NAMES, type ArchetypeName } from '../engine/archetypes';
import { COVERAGE_DESCRIPTIONS, COVERAGE_LABELS, COVERAGES, RUSH_DESCRIPTIONS, type Coverage, type RushMode } from '../engine/coverage';
import { MY_TEAM } from '../engine/roster';
import { RATINGS } from '../engine/types';

const RATING_LABELS = { speed: 'Spd', agility: 'Agi', hands: 'Hnd', catchHeight: 'Ht', man: 'Man', zone: 'Zone' } as const;
const RUSH_LABELS: Record<RushMode, string> = { hard: 'Hard at 5s', contain: 'Contain' };

interface Props {
  archetype: ArchetypeName;
  coverage: Coverage;
  rusherId: string;
  rushMode: RushMode;
}

/** Reference for everything in the pickers; the current picks are highlighted. */
export function Guide({ archetype, coverage, rusherId, rushMode }: Props) {
  return (
    <details className="card guide">
      <summary>Guide: opponents, defenses, and players</summary>
      <div className="guide-grid">
        <table>
          <thead><tr><th>Opponent</th><th>What they do</th></tr></thead>
          <tbody>
            {ARCHETYPE_NAMES.map((a) => (
              <tr key={a} className={a === archetype ? 'current' : undefined}>
                <td>{ARCHETYPE_LABELS[a]}</td>
                <td>{ARCHETYPE_DESCRIPTIONS[a]}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <table>
          <thead><tr><th>Defense</th><th>How it plays</th></tr></thead>
          <tbody>
            {COVERAGES.map((c) => (
              <tr key={c} className={c === coverage ? 'current' : undefined}>
                <td>{COVERAGE_LABELS[c]}</td>
                <td>{COVERAGE_DESCRIPTIONS[c]}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="scroll">
          <table>
            <thead>
              <tr>
                <th>Player</th>
                <th>Game</th>
                {RATINGS.map((k) => <th key={k} className="num">{RATING_LABELS[k]}</th>)}
              </tr>
            </thead>
            <tbody>
              {MY_TEAM.map((p) => (
                <tr key={p.id} className={p.id === rusherId ? 'current' : undefined}>
                  <td>{p.name}</td>
                  <td>{p.note}</td>
                  {RATINGS.map((k) => <td key={k} className="num">{p.ratings[k]}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="hint">Ratings are 1 to 10, placeholders until the real roster is in. Highlighted: the rusher.</p>
        </div>
        <table>
          <thead><tr><th>Rush</th><th>What the rusher does</th></tr></thead>
          <tbody>
            {(Object.keys(RUSH_LABELS) as RushMode[]).map((m) => (
              <tr key={m} className={m === rushMode ? 'current' : undefined}>
                <td>{RUSH_LABELS[m]}</td>
                <td>{RUSH_DESCRIPTIONS[m]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
