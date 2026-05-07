"use client";

import { useEffect, useMemo, useState } from "react";
import type { LeaderboardEntry } from "../../lib/game/types";
import { PROGRESS_STORAGE_KEY } from "../../lib/game/progressStorage";
import styles from "./LandingPage.module.css";

type StoredProgress = {
  weeklyLeaderboards?: Record<string, Array<Partial<LeaderboardEntry>> | undefined>;
};

const isValidEntry = (entry: Partial<LeaderboardEntry>): entry is LeaderboardEntry =>
  typeof entry.id === "string" &&
  typeof entry.callsign === "string" &&
  typeof entry.score === "number" &&
  typeof entry.discoveries === "number" &&
  typeof entry.distance === "number" &&
  typeof entry.durationMs === "number" &&
  typeof entry.weekKey === "string" &&
  typeof entry.recordedAt === "string";

const formatFlightDate = (recordedAt: string) => {
  const date = new Date(recordedAt);
  if (Number.isNaN(date.getTime())) {
    return "Recent flight";
  }

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
  }).format(date);
};

const loadLeaderboardEntries = () => {
  try {
    const raw = window.localStorage.getItem(PROGRESS_STORAGE_KEY);
    if (!raw) {
      return [];
    }

    const progress = JSON.parse(raw) as StoredProgress;
    return Object.values(progress.weeklyLeaderboards ?? {})
      .flatMap((entries) => entries ?? [])
      .filter(isValidEntry)
      .sort(
        (left, right) =>
          right.discoveries - left.discoveries ||
          right.distance - left.distance ||
          right.score - left.score ||
          left.durationMs - right.durationMs,
      )
      .slice(0, 5);
  } catch {
    return [];
  }
};

export function LandingLeaderboard() {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setEntries(loadLeaderboardEntries());
    setLoaded(true);
  }, []);

  const topDiscoveryCount = useMemo(
    () => entries[0]?.discoveries ?? 0,
    [entries],
  );

  return (
    <section className={styles.leaderboard} aria-labelledby="landing-leaderboard-title">
      <div className={styles.leaderboardHeader}>
        <div>
          <span>Flight leaderboard</span>
          <h2 id="landing-leaderboard-title">Top Discovery Flights</h2>
        </div>
        <strong>{topDiscoveryCount.toLocaleString()} best</strong>
      </div>

      {entries.length > 0 ? (
        <ol className={styles.leaderboardList}>
          {entries.map((entry, index) => (
            <li key={entry.id} className={styles.leaderboardRow}>
              <span className={styles.leaderboardRank}>{index + 1}</span>
              <span className={styles.leaderboardPilot}>{entry.callsign}</span>
              <strong>{entry.discoveries.toLocaleString()}</strong>
              <span>{entry.distance.toLocaleString()} route</span>
              <span>{formatFlightDate(entry.recordedAt)}</span>
            </li>
          ))}
        </ol>
      ) : (
        <p className={styles.leaderboardEmpty}>
          {loaded
            ? "No completed flights recorded yet. Your best discovery runs will appear here."
            : "Loading leaderboard..."}
        </p>
      )}
    </section>
  );
}
