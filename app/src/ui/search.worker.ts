// Runs the best-setup search off the main thread so the page stays responsive.
import { ARCHETYPES, type ArchetypeName } from '../engine/archetypes';
import { OPPONENT } from '../engine/roster';
import { BROWSER_SEARCH, searchBestSetup, type SearchResult } from '../engine/search';
import type { Player } from '../engine/types';

export type SearchMessage =
  | { type: 'progress'; fraction: number; label: string }
  | { type: 'done'; result: SearchResult };

const ctx = self as unknown as Worker;

ctx.onmessage = (e: MessageEvent<{ archetype: ArchetypeName; roster: Player[] }>) => {
  const result = searchBestSetup(
    { offense: OPPONENT, tendencies: ARCHETYPES[e.data.archetype], defense: e.data.roster },
    { ...BROWSER_SEARCH, onProgress: (fraction, label) => ctx.postMessage({ type: 'progress', fraction, label } satisfies SearchMessage) },
  );
  ctx.postMessage({ type: 'done', result } satisfies SearchMessage);
};
