import { useEffect, useMemo, useState } from 'react';
import { buildRoster, DEFAULT_SLOTS, PLAYER_TYPES, ROSTER_SIZE, type RosterSlot } from './engine/roster';
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
    const saved = JSON.parse(localStorage.getItem(ROSTER_KEY) ?? 'null') as RosterSlot[] | null;
    if (Array.isArray(saved) && saved.length === ROSTER_SIZE && saved.every((s) => typeof s?.name === 'string' && s.type in PLAYER_TYPES)) return saved;
  } catch {
    // fall through to the default
  }
  return DEFAULT_SLOTS;
}

export default function App() {
  const [view, setView] = useState<View>('viewer');
  const [slots, setSlots] = useState<RosterSlot[]>(loadSlots);
  const roster = useMemo(() => buildRoster(slots), [slots]);
  const rosterKey = useMemo(() => JSON.stringify(slots), [slots]);
  const [picks, setPicks] = useState<Picks>({ archetype: 'balanced', coverage: 'cover2', rusherId: 'p1', rushMode: 'hard' });

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
        <p>7v7, one rusher on a 5 second count. Watch single plays, or find the best setup for a matchup.</p>
      </header>
      <Guide archetype={picks.archetype} coverage={picks.coverage} rusherType={rusherType} rushMode={picks.rushMode} />
      <Roster
        slots={slots}
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
