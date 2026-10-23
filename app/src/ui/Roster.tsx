import { useState } from 'react';
import { DEFAULT_SLOTS, PLAYER_TYPE_IDS, PLAYER_TYPES, slotRatings, typeInfo, type RosterSlot, type SlotType } from '../engine/roster';
import { RATINGS, type Rating } from '../engine/types';
import { withType } from './labels';

const RATING_LABELS = { speed: 'Spd', agility: 'Agi', hands: 'Hnd', catchHeight: 'Ht', man: 'Man', zone: 'Zone' } as const;

interface Props {
  slots: RosterSlot[];
  setSlots: (slots: RosterSlot[]) => void;
  /** The page was opened with this team in a share link. */
  fromLink: boolean;
  shareLink: () => string;
}

type Share = { state: 'idle' } | { state: 'copied' } | { state: 'manual'; link: string };

/** Build the team from preset player types: a name and a type for each of the 7 spots. Collapsed, it lists the team. */
export function Roster({ slots, setSlots, fromLink, shareLink }: Props) {
  const [share, setShare] = useState<Share>({ state: 'idle' });
  const copy = async () => {
    const link = shareLink();
    try {
      await navigator.clipboard.writeText(link);
      setShare({ state: 'copied' });
    } catch {
      // No clipboard access (old browser, or blocked in a frame): show it to copy by hand.
      setShare({ state: 'manual', link });
    }
  };
  const edit = (next: RosterSlot[]) => {
    setShare({ state: 'idle' });
    setSlots(next);
  };
  const update = (i: number, change: Partial<RosterSlot>) => edit(slots.map((s, j) => (j === i ? { ...s, ...change } : s)));
  const team = slots.map((s, i) => withType(s.name.trim() || `${typeInfo(s.type).label} ${i + 1}`, typeInfo(s.type).label)).join(', ');
  // Switching to Custom starts from the ratings the player had.
  const setType = (i: number, type: SlotType) =>
    update(i, type === 'custom' ? { type, ratings: slotRatings(slots[i]) } : { type, ratings: undefined });
  const setRating = (i: number, k: Rating, value: string) => {
    const v = Number(value);
    if (!Number.isInteger(v) || v < 1 || v > 10) return;
    update(i, { ratings: { ...slotRatings(slots[i]), [k]: v } });
  };

  return (
    <details className="card roster" open={fromLink || undefined}>
      <summary>
        Roster: <span className="team">{team}</span>
      </summary>
      {fromLink && <div className="notice">Loaded a team from a shared link. It's saved in this browser now, so edit away.</div>}
      <p className="muted">
        Pick a type for each of your 7 players (the same type can appear more than once) and give them a name, or pick
        Custom to set a player's own ratings (1 to 10). The play viewer and the best-setup search both use this team. It's
        saved in this browser.
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
              const t = typeInfo(s.type);
              const ratings = slotRatings(s);
              return (
                <tr key={i}>
                  <td className="faint">{i + 1}</td>
                  <td>
                    <input aria-label={`Player ${i + 1} name`} value={s.name} maxLength={20} onChange={(e) => update(i, { name: e.target.value })} />
                  </td>
                  <td>
                    <select aria-label={`Player ${i + 1} type`} value={s.type} onChange={(e) => setType(i, e.target.value as SlotType)}>
                      {PLAYER_TYPE_IDS.map((id) => <option key={id} value={id}>{PLAYER_TYPES[id].label}</option>)}
                      <option value="custom">Custom</option>
                    </select>
                    <div className="hint">{t.note}</div>
                  </td>
                  {RATINGS.map((k) => (
                    <td key={k} className="num">
                      {s.type === 'custom' ? (
                        <input
                          className="rating"
                          type="number"
                          inputMode="numeric"
                          min={1}
                          max={10}
                          step={1}
                          aria-label={`Player ${i + 1} ${k}`}
                          value={ratings[k]}
                          onFocus={(e) => e.target.select()}
                          onChange={(e) => setRating(i, k, e.target.value)}
                        />
                      ) : (
                        ratings[k]
                      )}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="row">
        <button className="primary" onClick={copy}>Copy share link</button>
        <button onClick={() => edit(DEFAULT_SLOTS)}>Reset to one of each type</button>
        {share.state === 'copied' && <span className="hint">Copied. Anyone who opens it gets this team.</span>}
      </div>
      {share.state === 'manual' && (
        <label className="share-manual">
          Copy this link:
          <input readOnly value={share.link} onFocus={(e) => e.target.select()} autoFocus />
        </label>
      )}
    </details>
  );
}
