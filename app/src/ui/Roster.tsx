import { useState } from 'react';
import { DEFAULT_SLOTS, PLAYER_TYPE_IDS, PLAYER_TYPES, slotRatings, typeInfo, type PlayerType, type RosterSlot } from '../engine/roster';
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
  const team = slots.map((s, i) => withType(s.name.trim() || `${typeInfo(s).label} ${i + 1}`, typeInfo(s).label)).join(', ');
  // A custom player is based on their type, so a new type starts their ratings over from it.
  const setType = (i: number, type: PlayerType) =>
    update(i, { type, ratings: slots[i].ratings ? { ...PLAYER_TYPES[type].ratings } : undefined });
  const setCustom = (i: number, on: boolean) => update(i, { ratings: on ? { ...PLAYER_TYPES[slots[i].type].ratings } : undefined });
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
        Pick a type for each of your 7 players (the same type can appear more than once) and give them a name. Tick Custom
        to tweak a player's ratings (1 to 10), starting from their type. The play viewer and the best-setup search both use
        this team. It's saved in this browser.
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
              const t = typeInfo(s);
              const ratings = slotRatings(s);
              return (
                <tr key={i}>
                  <td className="faint">{i + 1}</td>
                  <td>
                    <input aria-label={`Player ${i + 1} name`} value={s.name} maxLength={20} onChange={(e) => update(i, { name: e.target.value })} />
                  </td>
                  <td>
                    <div className="type-pick">
                      <select aria-label={`Player ${i + 1} type`} value={s.type} onChange={(e) => setType(i, e.target.value as PlayerType)}>
                        {PLAYER_TYPE_IDS.map((id) => <option key={id} value={id}>{PLAYER_TYPES[id].label}</option>)}
                      </select>
                      <label className="custom-check">
                        <input type="checkbox" checked={!!s.ratings} onChange={(e) => setCustom(i, e.target.checked)} />
                        Custom
                      </label>
                    </div>
                    <div className="hint">{t.note}</div>
                  </td>
                  {RATINGS.map((k) => (
                    <td key={k} className="num">
                      {s.ratings ? (
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
