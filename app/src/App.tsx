import { useEffect, useMemo, useState } from 'react';
import { buildRoster, decodeSlots, DEFAULT_SLOTS, encodeSlots, ROSTER_SIZE, upgradeSlot, type RosterSlot } from './engine/roster';
import { BestSetup } from './ui/BestSetup';
import { Guide } from './ui/Guide';
import type { Picks } from './ui/labels';
import { Roster } from './ui/Roster';
import { Viewer } from './ui/Viewer';

type View = 'viewer' | 'best';
const ROSTER_KEY = 'ffs-roster';

/** The saved roster, if it's still valid; storage can be missing or blocked. */
function loadSlots(): RosterSlot[] {
  try {
    const saved = JSON.parse(localStorage.getItem(ROSTER_KEY) ?? 'null') as unknown;
    if (Array.isArray(saved) && saved.length === ROSTER_SIZE) {
      const slots = saved.map((s) => (typeof s?.name === 'string' && typeof s?.type === 'string' ? upgradeSlot(s) : undefined));
      if (slots.every((s) => s !== undefined)) return slots;
    }
  } catch {
    // fall through to the default
  }
  return DEFAULT_SLOTS;
}

const TEAM_PARAM = 'team';

/**
 * The page people should land on: on shampoe.com the app runs in a same-origin frame under
 * /flag/open/, which passes its query string through, so links point there.
 */
function hostWindow(): Window {
  try {
    if (window.parent !== window && window.parent.location.origin === location.origin) return window.parent;
  } catch {
    // cross-origin parent; use this window
  }
  return window;
}

/** A team from a share link (`?team=…`), if the page was opened with one. */
function linkedSlots(): RosterSlot[] | undefined {
  const code = new URLSearchParams(location.search).get(TEAM_PARAM);
  return code ? decodeSlots(code) : undefined;
}

/** Drop `?team=` from the address bar, so later edits aren't undone by a refresh. */
function clearTeamParam() {
  for (const w of new Set([window, hostWindow()])) {
    try {
      const url = new URL(w.location.href);
      if (!url.searchParams.has(TEAM_PARAM)) continue;
      url.searchParams.delete(TEAM_PARAM);
      w.history.replaceState(w.history.state, '', url);
    } catch {
      // leave it
    }
  }
}

function shareLink(slots: RosterSlot[]): string {
  const host = hostWindow().location;
  return `${host.origin}${host.pathname}?${TEAM_PARAM}=${encodeSlots(slots)}`;
}

export default function App() {
  const [view, setView] = useState<View>('viewer');
  const [linked] = useState(linkedSlots);
  const [slots, setSlots] = useState<RosterSlot[]>(() => linked ?? loadSlots());
  const roster = useMemo(() => buildRoster(slots), [slots]);
  const rosterKey = useMemo(() => JSON.stringify(slots), [slots]);
  const [picks, setPicks] = useState<Picks>({ archetype: 'balanced', coverage: 'cover2', rusherId: 'p1', rushMode: 'hard' });

  useEffect(() => {
    if (linked) clearTeamParam();
  }, [linked]);

  useEffect(() => {
    try {
      localStorage.setItem(ROSTER_KEY, rosterKey);
    } catch {
      // not saved; the roster still works for this visit
    }
  }, [rosterKey]);

  const rusherType = roster.find((p) => p.id === picks.rusherId)?.type;
  const tab = (v: View, label: string) => (
    <button className={view === v ? 'on' : undefined} onClick={() => setView(v)}>{label}</button>
  );

  return (
    <div className="app">
      <header>
        <h1>Flag Football Defense Simulator</h1>
        <p>7v7, one rusher on a count of five. Watch single plays, or find the best setup for a matchup.</p>
      </header>
      <Guide archetype={picks.archetype} coverage={picks.coverage} rusherType={rusherType} rushMode={picks.rushMode} />
      <Roster
        slots={slots}
        fromLink={!!linked}
        shareLink={() => shareLink(slots)}
        setSlots={(next) => {
          setSlots(next);
          // A searched setup was built for the old roster.
          setPicks((p) => ({ ...p, call: undefined }));
        }}
      />
      <nav className="tabs" aria-label="View">
        {tab('viewer', 'Play viewer')}
        {tab('best', 'Best setup')}
      </nav>
      {view === 'viewer' && <Viewer roster={roster} picks={picks} setPicks={setPicks} />}
      {view === 'best' && (
        <BestSetup
          roster={roster}
          rosterKey={rosterKey}
          archetype={picks.archetype}
          setArchetype={(archetype) => setPicks((p) => ({ ...p, archetype }))}
          onWatch={(call) => {
            setPicks((p) => ({ ...p, coverage: call.coverage, rusherId: call.rusherId, rushMode: call.rushMode, call }));
            setView('viewer');
            window.scrollTo({ top: 0 });
          }}
        />
      )}
    </div>
  );
}
