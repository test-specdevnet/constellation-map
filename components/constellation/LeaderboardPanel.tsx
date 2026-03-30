"use client";

import type { GameSessionSnapshot, LeaderboardEntry } from "../../lib/game/arcade";
import type { LeaderboardWeekView } from "./ProgressProvider";

const renderEntry = (entry: LeaderboardEntry, index: number) => (
  <li key={entry.id}>
    <strong>
      {index + 1}. {entry.callsign}
    </strong>
    <span>{entry.score.toLocaleString()} pts</span>
    <small>
      {entry.kills} takedowns · {entry.discoveries} discoveries
    </small>
  </li>
);

export function LeaderboardPanel({
  callsign,
  onChangeCallsign,
  leaderboard,
  snapshot,
}: {
  callsign: string;
  onChangeCallsign: (callsign: string) => void;
  leaderboard: {
    currentWeekKey: string;
    weeks: LeaderboardWeekView[];
  };
  snapshot: GameSessionSnapshot | null;
}) {
  const currentWeek =
    leaderboard.weeks.find((week) => week.weekKey === leaderboard.currentWeekKey) ??
    leaderboard.weeks[0] ??
    null;
  const archiveWeeks = leaderboard.weeks.filter((week) => week.weekKey !== leaderboard.currentWeekKey);

  return (
    <section className="panel-card panel-card--compact leaderboard-panel">
      <div className="panel-card-header panel-card-header--compact">
        <h2>Leaderboard</h2>
        <span>{currentWeek?.label ?? "This week"}</span>
      </div>

      <label className="leaderboard-callsign">
        <span>Pilot callsign</span>
        <input
          type="text"
          maxLength={18}
          value={callsign}
          onChange={(event) => onChangeCallsign(event.target.value)}
          placeholder="Pilot"
        />
      </label>

      <div className="leaderboard-live">
        <strong>{(snapshot?.score ?? 0).toLocaleString()} pts</strong>
        <span>
          {snapshot?.kills ?? 0} takedowns · {snapshot?.discoveries ?? 0} discoveries
        </span>
      </div>

      {currentWeek?.entries.length ? (
        <ol className="leaderboard-list">
          {currentWeek.entries.slice(0, 5).map((entry, index) => renderEntry(entry, index))}
        </ol>
      ) : (
        <p className="leaderboard-empty">No runs logged for this week yet.</p>
      )}

      {archiveWeeks.length ? (
        <div className="leaderboard-archive">
          {archiveWeeks.slice(0, 3).map((week) => (
            <details key={week.weekKey}>
              <summary>{week.label}</summary>
              <ol className="leaderboard-list leaderboard-list--archive">
                {week.entries.slice(0, 3).map((entry, index) => renderEntry(entry, index))}
              </ol>
            </details>
          ))}
        </div>
      ) : null}
    </section>
  );
}
