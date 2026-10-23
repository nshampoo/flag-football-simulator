// Opponent archetypes: presets of five 0 to 1 knobs.
export interface Tendencies {
  /** How often they push the ball deep, and how willing they are to throw into tight deep windows. */
  deep: number;
  /** How long they wait for someone to come open (pickier = holds longer). */
  holdTime: number;
  /** How long and how often they stare down their favorite. */
  lockOn: number;
  /** Willingness to scramble after the count. */
  mobility: number;
  /** Willingness to dump it to the center or a short route. */
  checkdown: number;
}

export const ARCHETYPES = {
  gunslinger: { deep: 0.85, holdTime: 0.3, lockOn: 0.6, mobility: 0.3, checkdown: 0.1 },
  dinkAndDunk: { deep: 0.1, holdTime: 0.1, lockOn: 0.3, mobility: 0.2, checkdown: 0.9 },
  heroBall: { deep: 0.5, holdTime: 0.5, lockOn: 1, mobility: 0.3, checkdown: 0.2 },
  scrambler: { deep: 0.5, holdTime: 0.8, lockOn: 0.4, mobility: 0.95, checkdown: 0.3 },
  scaredQb: { deep: 0.3, holdTime: 0.95, lockOn: 0.5, mobility: 0.05, checkdown: 0.3 },
  balanced: { deep: 0.5, holdTime: 0.5, lockOn: 0.5, mobility: 0.4, checkdown: 0.5 },
} as const satisfies Record<string, Tendencies>;

export type ArchetypeName = keyof typeof ARCHETYPES;
export const ARCHETYPE_NAMES = Object.keys(ARCHETYPES) as ArchetypeName[];

export const ARCHETYPE_LABELS: Record<ArchetypeName, string> = {
  gunslinger: 'Gunslinger',
  dinkAndDunk: 'Dink and Dunk',
  heroBall: 'Hero Ball',
  scrambler: 'Scrambler',
  scaredQb: 'Scared QB',
  balanced: 'Balanced',
};

export const ARCHETYPE_DESCRIPTIONS: Record<ArchetypeName, string> = {
  gunslinger: 'Throws deep early and often; loves go routes and jump balls to their tallest receiver.',
  dinkAndDunk: 'Quick release, short routes, and checkdowns to the center.',
  heroBall: 'Locks onto their star and forces it to him.',
  scrambler: 'Holds it past the count of five and runs if nothing is open.',
  scaredQb: "Holds the ball, won't run, and throws late under pressure.",
  balanced: 'League-average baseline: a bit of everything.',
};
