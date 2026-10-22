// Alignments for the 5 non-center eligibles, written strong to the right and mirrored per play.
// The center is always at the ball and the QB in shotgun.
import type { Vec } from './types';

export const CENTER_SPOT: Vec = { x: 0, y: 0 };
export const QB_SPOT: Vec = { x: 0, y: -5 };

const ON = -0.5; // on the line
const OFF = -1.8; // off the line

export const FORMATIONS = {
  spread: [{ x: -12, y: ON }, { x: -6.5, y: OFF }, { x: 6.5, y: OFF }, { x: 12, y: ON }, { x: 2, y: -5 }],
  trips: [{ x: -12, y: ON }, { x: -6, y: OFF }, { x: 5, y: OFF }, { x: 8.5, y: OFF }, { x: 12, y: ON }],
  quads: [{ x: -12, y: ON }, { x: 4, y: OFF }, { x: 7, y: OFF }, { x: 9.5, y: OFF }, { x: 12.5, y: ON }],
  bunch: [{ x: -12, y: ON }, { x: -6, y: OFF }, { x: 8, y: ON }, { x: 9.2, y: -1.8 }, { x: 10.4, y: ON }],
  stack: [{ x: -12, y: ON }, { x: -6, y: OFF }, { x: 4, y: OFF }, { x: 9, y: ON }, { x: 9, y: -2.3 }],
  doubleStack: [{ x: -9, y: ON }, { x: -9, y: -2.3 }, { x: 9, y: ON }, { x: 9, y: -2.3 }, { x: 3.5, y: OFF }],
} as const satisfies Record<string, readonly Vec[]>;

export type FormationName = keyof typeof FORMATIONS;
export const FORMATION_NAMES = Object.keys(FORMATIONS) as FormationName[];
