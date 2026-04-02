"use client";

import { useState } from "react";
import type { GameSessionSnapshot } from "../../lib/game/types";

const WARNING_FUEL_THRESHOLD = 40;
const CRITICAL_FUEL_THRESHOLD = 18;

export function FuelGauge({
  snapshot,
}: {
  snapshot: GameSessionSnapshot | null;
}) {
  const [expanded, setExpanded] = useState(false);
  const fuelMax = snapshot?.fuelMax ?? 100;
  const fuel = snapshot?.fuel ?? fuelMax;
  const pct = Math.max(0, Math.min(100, Math.round((fuel / Math.max(fuelMax, 1)) * 100)));
  const boostSeconds = Math.ceil((snapshot?.boostRemainingMs ?? 0) / 1000);
  const isCritical = pct <= CRITICAL_FUEL_THRESHOLD;
  const isWarning = !isCritical && pct <= WARNING_FUEL_THRESHOLD;
  const fuelState = isCritical ? "critical" : isWarning ? "warning" : "safe";
  const statusLabel = isCritical ? "LOW FUEL" : isWarning ? "Fuel dropping" : "Reserve healthy";
  const supportLabel =
    snapshot?.state === "landed"
      ? "Restart from hub"
      : snapshot?.state === "landing"
        ? "Engine out glide"
      : boostSeconds > 0
        ? `Boost ${boostSeconds}s`
        : "Collect red fuel cans";

  return (
    <div
      className={`fuel-gauge fuel-gauge--${fuelState} ${
        expanded ? "fuel-gauge--expanded" : ""
      }`}
      aria-label="Fuel gauge"
    >
      <div className="fuel-gauge-header">
        <div className="fuel-gauge-header__title">
          <svg
            className="fuel-gauge-icon"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            focusable="false"
          >
            <path d="M9 5h6v14H9z" />
            <path d="M15 8h2l1 2v7a2 2 0 0 1-2 2h-1" />
            <path d="M11 9h2" />
          </svg>
          <strong>Fuel Reserve</strong>
        </div>
        <div className="fuel-gauge-header__meta">
          <span>{pct}%</span>
          <button
            type="button"
            className="icon-button fuel-gauge-toggle"
            onClick={() => setExpanded((current) => !current)}
            aria-expanded={expanded}
          >
            {expanded ? "Hide" : "Details"}
          </button>
        </div>
      </div>
      <div className="fuel-gauge-status">
        <span>{statusLabel}</span>
        <span>{Math.round(fuel)} units</span>
      </div>
      <div className="fuel-gauge-track" aria-hidden="true">
        <span
          className={`fuel-gauge-fill ${isCritical ? "danger" : isWarning ? "warn" : ""}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="fuel-gauge-meta">
        <span>{supportLabel}</span>
        <span>
          {snapshot?.state === "landed"
            ? "Run ended"
            : snapshot?.state === "landing"
              ? "Crash imminent"
              : "Updates live"}
        </span>
      </div>
      {isCritical ? <div className="fuel-gauge-alert">LOW FUEL</div> : null}
    </div>
  );
}
