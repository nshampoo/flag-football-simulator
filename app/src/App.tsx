import { useState } from 'react';
import { MY_TEAM } from './engine/roster';
import { BestSetup } from './ui/BestSetup';
import { Guide } from './ui/Guide';
import type { Picks } from './ui/labels';
import { Viewer } from './ui/Viewer';

type View = 'viewer' | 'best';

export default function App() {
  const [view, setView] = useState<View>('viewer');
  const [picks, setPicks] = useState<Picks>({ archetype: 'balanced', coverage: 'cover2', rusherId: MY_TEAM[0].id, rushMode: 'hard' });

  return (
    <div className="app">
      <header>
        <h1>Flag Football Defense Simulator</h1>
        <p>7v7, one rusher on a 5 second count. Watch single plays, or find the best setup for a matchup.</p>
        <nav className="tabs" aria-label="View">
          <button className={view === 'viewer' ? 'on' : undefined} onClick={() => setView('viewer')}>Play viewer</button>
          <button className={view === 'best' ? 'on' : undefined} onClick={() => setView('best')}>Best setup</button>
        </nav>
      </header>
      <Guide archetype={picks.archetype} coverage={picks.coverage} rusherId={picks.rusherId} rushMode={picks.rushMode} />
      {view === 'viewer' ? (
        <Viewer picks={picks} setPicks={setPicks} />
      ) : (
        <BestSetup
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
