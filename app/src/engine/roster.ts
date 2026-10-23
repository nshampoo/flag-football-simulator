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

/** A preset type, or `custom` with the player's own ratings. */
export type SlotType = PlayerType | 'custom';
export const CUSTOM = { label: 'Custom', note: 'Your own ratings.' } as const;

/** One roster spot: a name and a type (custom spots carry their own ratings). */
export interface RosterSlot {
  name: string;
  type: SlotType;
  ratings?: Ratings;
}

export const typeInfo = (type: SlotType) => (type === 'custom' ? CUSTOM : PLAYER_TYPES[type]);

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
  return s.type === 'custom' ? cleanRatings(s.ratings) : { ...PLAYER_TYPES[s.type].ratings };
}

export const ROSTER_SIZE = 7;

/** One of each type, named after the type. */
export const DEFAULT_SLOTS: RosterSlot[] = PLAYER_TYPE_IDS.map((type) => ({ name: PLAYER_TYPES[type].label, type }));

// Share links: the roster as compact JSON ([name, type] or [name, 'custom', '9,7,5,5,6,4'] per spot),
// base64url-encoded so it survives in a URL.
type Packed = [string, string] | [string, 'custom', string];

export function encodeSlots(slots: RosterSlot[]): string {
  const packed: Packed[] = slots.map((s) =>
    s.type === 'custom' ? [s.name, 'custom', RATINGS.map((k) => cleanRatings(s.ratings)[k]).join(',')] : [s.name, s.type],
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
      if (!Array.isArray(p) || typeof p[0] !== 'string') throw new Error('bad spot');
      const name = p[0].slice(0, 20);
      if (p[1] === 'custom') {
        const values = String(p[2]).split(',').map(Number);
        return { name, type: 'custom', ratings: cleanRatings(Object.fromEntries(RATINGS.map((k, i) => [k, values[i]]))) };
      }
      if (!(p[1] in PLAYER_TYPES)) throw new Error('bad type');
      return { name, type: p[1] as PlayerType };
    });
  } catch {
    return undefined;
  }
}

/** Players for a roster; ids are p1 to p7 by spot, so the same type can appear more than once. */
export function buildRoster(slots: RosterSlot[]): Player[] {
  return slots.map((s, i) => {
    const t = typeInfo(s.type);
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
