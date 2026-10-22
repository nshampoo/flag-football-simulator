// Placeholder rosters until real ratings are in.
import type { Player, Ratings } from './types';

const r = (speed: number, agility: number, hands: number, catchHeight: number, man: number, zone: number): Ratings => ({
  speed, agility, hands, catchHeight, man, zone,
});

/** Our team, on defense. */
export const MY_TEAM: Player[] = [
  { id: 'burner', name: 'Burner', ratings: r(9, 7, 5, 5, 6, 4) },
  { id: 'glue', name: 'Glue', ratings: r(7, 8, 6, 5, 8, 6) },
  { id: 'tall', name: 'Tall', ratings: r(6, 5, 7, 9, 5, 7) },
  { id: 'hawk', name: 'Ballhawk', ratings: r(7, 6, 8, 7, 5, 8) },
  { id: 'steady', name: 'Steady', ratings: r(6, 6, 6, 6, 6, 6) },
  { id: 'quick', name: 'Quick', ratings: r(8, 9, 5, 4, 7, 5) },
  { id: 'vet', name: 'Vet', ratings: r(5, 5, 6, 6, 5, 8) },
];

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
