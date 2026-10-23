// Placeholder rosters until real ratings are in.
import { RATINGS, type Player, type Ratings } from './types';

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

/**
 * One roster spot: a name and a type. With `ratings` the player is a custom version of that type
 * ("Custom Burner"): the type is where the ratings started.
 */
export interface RosterSlot {
  name: string;
  type: PlayerType;
  ratings?: Ratings;
}

/** How a spot's type reads: "Burner", or "Custom Burner" with its own ratings. */
export function typeInfo(s: RosterSlot): { label: string; note: string } {
  const t = PLAYER_TYPES[s.type];
  return s.ratings ? { label: `Custom ${t.label}`, note: `Custom ratings, starting from a ${t.label}.` } : t;
}

/** Saved or linked spots from before custom became a checkbox had type 'custom'; they become a custom Steady. */
export function upgradeSlot(s: { name: string; type: string; ratings?: Partial<Ratings> }): RosterSlot | undefined {
  if (s.type === 'custom') return { name: s.name, type: 'steady', ratings: cleanRatings(s.ratings) };
  if (!(s.type in PLAYER_TYPES)) return undefined;
  return s.ratings ? { name: s.name, type: s.type as PlayerType, ratings: cleanRatings(s.ratings) } : { name: s.name, type: s.type as PlayerType };
}

/** Whole numbers from 1 to 10; anything missing is a 5. */
export function cleanRatings(r: Partial<Ratings> | undefined): Ratings {
  const out = {} as Ratings;
  for (const k of RATINGS) {
    const v = Math.round(Number(r?.[k]));
    out[k] = Number.isFinite(v) ? Math.min(10, Math.max(1, v)) : 5;
  }
  return out;
}

/** The ratings a spot plays with. */
export function slotRatings(s: RosterSlot): Ratings {
  return s.ratings ? cleanRatings(s.ratings) : { ...PLAYER_TYPES[s.type].ratings };
}

export const ROSTER_SIZE = 7;

/** One of each type, named after the type. */
export const DEFAULT_SLOTS: RosterSlot[] = PLAYER_TYPE_IDS.map((type) => ({ name: PLAYER_TYPES[type].label, type }));

// Share links: the roster as compact JSON ([name, type], plus '9,7,5,5,6,4' for a custom player, per
// spot), base64url-encoded so it survives in a URL.
type Packed = [string, string] | [string, string, string];

export function encodeSlots(slots: RosterSlot[]): string {
  const packed: Packed[] = slots.map((s) =>
    s.ratings ? [s.name, s.type, RATINGS.map((k) => cleanRatings(s.ratings)[k]).join(',')] : [s.name, s.type],
  );
  const bytes = new TextEncoder().encode(JSON.stringify(packed));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** The roster in a share link, or undefined if it isn't a valid one. */
export function decodeSlots(code: string): RosterSlot[] | undefined {
  try {
    const bin = atob(code.replace(/-/g, '+').replace(/_/g, '/'));
    const packed = JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)))) as unknown;
    if (!Array.isArray(packed) || packed.length !== ROSTER_SIZE) return undefined;
    return packed.map((p): RosterSlot => {
      if (!Array.isArray(p) || typeof p[0] !== 'string' || typeof p[1] !== 'string') throw new Error('bad spot');
      const values = p[2] === undefined ? undefined : String(p[2]).split(',').map(Number);
      const ratings = values && Object.fromEntries(RATINGS.map((k, i) => [k, values[i]]));
      const slot = upgradeSlot({ name: p[0].slice(0, 20), type: p[1], ratings });
      if (!slot) throw new Error('bad type');
      return slot;
    });
  } catch {
    return undefined;
  }
}

/** Players for a roster; ids are p1 to p7 by spot, so the same type can appear more than once. */
export function buildRoster(slots: RosterSlot[]): Player[] {
  return slots.map((s, i) => {
    const t = typeInfo(s);
    return { id: `p${i + 1}`, name: s.name.trim() || `${t.label} ${i + 1}`, note: t.note, type: t.label, ratings: slotRatings(s) };
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
