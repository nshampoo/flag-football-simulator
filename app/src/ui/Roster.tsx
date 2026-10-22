import { DEFAULT_SLOTS, PLAYER_TYPE_IDS, PLAYER_TYPES, type PlayerType, type RosterSlot } from '../engine/roster';
import { RATINGS } from '../engine/types';

const RATING_LABELS = { speed: 'Spd', agility: 'Agi', hands: 'Hnd', catchHeight: 'Ht', man: 'Man', zone: 'Zone' } as const;

interface Props {
  slots: RosterSlot[];
  setSlots: (slots: RosterSlot[]) => void;
}

/** Build the team from preset player types: a name and a type for each of the 7 spots. */
export function Roster({ slots, setSlots }: Props) {
  const update = (i: number, change: Partial<RosterSlot>) => setSlots(slots.map((s, j) => (j === i ? { ...s, ...change } : s)));

  return (
    <div className="card roster">
      <h2>Your roster</h2>
      <p className="muted">
        Pick a type for each of your 7 players (the same type can appear more than once) and give them a name. The play
        viewer and the best-setup search both use this team. It's saved in this browser.
      </p>
      <div className="scroll">
        <table className="rank">
          <thead>
            <tr>
              <th>#</th>
              <th>Name</th>
              <th>Type</th>
              {RATINGS.map((k) => <th key={k} className="num">{RATING_LABELS[k]}</th>)}
            </tr>
          </thead>
          <tbody>
            {slots.map((s, i) => {
              const t = PLAYER_TYPES[s.type];
              return (
                <tr key={i}>
                  <td className="faint">{i + 1}</td>
                  <td>
                    <input aria-label={`Player ${i + 1} name`} value={s.name} maxLength={20} onChange={(e) => update(i, { name: e.target.value })} />
                  </td>
                  <td>
                    <select aria-label={`Player ${i + 1} type`} value={s.type} onChange={(e) => update(i, { type: e.target.value as PlayerType })}>
                      {PLAYER_TYPE_IDS.map((id) => <option key={id} value={id}>{PLAYER_TYPES[id].label}</option>)}
                    </select>
                    <div className="hint">{t.note}</div>
                  </td>
                  {RATINGS.map((k) => <td key={k} className="num">{t.ratings[k]}</td>)}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <button onClick={() => setSlots(DEFAULT_SLOTS)}>Reset to one of each type</button>
    </div>
  );
}
