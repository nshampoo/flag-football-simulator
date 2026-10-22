// Placeholder rosters until real ratings are in.
import type { Player, Ratings } from './types';

const r = (speed: number, agility: number, hands: number, catchHeight: number, man: number, zone: number): Ratings => ({
  speed, agility, hands, catchHeight, man, zone,
});

/** Preset types of player to build a roster from (no real ratings needed). */
export const PLAYER_TYPES = {
  burner: { label: 'Burner', note: 'Fastest player on the team.', ratings: r(9, 7, 5, 5, 6, 4) },
  glue: { label: 'Glue', note: 'Best man-to-man cover player.', ratings: r(7, 8, 6, 5, 8, 6) },
  tall: { label: 'Tall', note: 'Wins jump balls; slower.', ratings: r(6, 5, 7, 9, 5, 7) },
  hawk: { label: 'Ballhawk', note: 'Reads the QB and catches picks.', ratings: r(7, 6, 8, 7, 5, 8) },
  steady: { label: 'Steady', note: 'Average at everything.', ratings: r(6, 6, 6, 6, 6, 6) },
  quick: { label: 'Quick', note: 'Shifty; best flag puller.', ratings: r(8, 9, 5, 4, 7, 5) },
  vet: { label: 'Vet', note: 'Slow, but smart in zone.', ratings: r(5, 5, 6, 6, 5, 8) },
} as const satisfies Record<string, { label: string; note: string; ratings: Ratings }>;

export type PlayerType = keyof typeof PLAYER_TYPES;
export const PLAYER_TYPE_IDS = Object.keys(PLAYER_TYPES) as PlayerType[];

/** One roster spot: a name and a preset type. */
export interface RosterSlot {
  name: string;
  type: PlayerType;
}

export const ROSTER_SIZE = 7;

/** One of each type, named after the type. */
export const DEFAULT_SLOTS: RosterSlot[] = PLAYER_TYPE_IDS.map((type) => ({ name: PLAYER_TYPES[type].label, type }));

/** Players for a roster; ids are p1 to p7 by spot, so the same type can appear more than once. */
export function buildRoster(slots: RosterSlot[]): Player[] {
  return slots.map((s, i) => {
    const t = PLAYER_TYPES[s.type];
    return { id: `p${i + 1}`, name: s.name.trim() || `${t.label} ${i + 1}`, note: t.note, type: t.label, ratings: { ...t.ratings } };
  });
}

/** Our team, on defense: the default roster. */
export const MY_TEAM: Player[] = buildRoster(DEFAULT_SLOTS);

export interface Offense {
  qb: Player;
  center: Player;
  /** The 5 non-center eligibles. */
  receivers: Player[];
  /** Their favorite target (star). */
  favoriteId: string;
}

/** A league-average opponent; the archetype supplies their tendencies. */
export const OPPONENT: Offense = {
  qb: { id: 'qb', name: 'QB', ratings: r(6, 6, 5, 5, 4, 4), arm: 6, poise: 5 },
  center: { id: 'c', name: 'Center', ratings: r(5, 5, 7, 6, 4, 4) },
  receivers: [
    { id: 'star', name: 'Star', ratings: r(8, 8, 8, 7, 5, 5) },
    { id: 'big', name: 'Big', ratings: r(6, 5, 7, 10, 4, 4) },
    { id: 'jet', name: 'Jet', ratings: r(9, 7, 5, 5, 5, 4) },
    { id: 'slot', name: 'Slot', ratings: r(7, 8, 6, 5, 4, 5) },
    { id: 'avg', name: 'Average', ratings: r(6, 6, 6, 6, 5, 5) },
  ],
  favoriteId: 'star',
};
