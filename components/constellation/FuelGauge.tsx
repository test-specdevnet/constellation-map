"use client";

import type { GameSessionSnapshot } from "../../lib/game/types";

const WARNING_FUEL_THRESHOLD = 40;
const CRITICAL_FUEL_THRESHOLD = 18;

export function FuelGauge({
  snapshot,
}: {
  snapshot: GameSessionSnapshot | null;
}) {
  const fuelMax = snapshot?.fuelMax ?? 100;
  const fuel = snapshot?.fuel ?? fuelMax;
  const pct = Math.max(0, Math.min(100, Math.round((fuel / Math.max(fuelMax, 1)) * 100)));
  const boostSeconds = Math.ceil((snapshot?.boostRemainingMs ?? 0) / 1000);
  const isCritical = pct <= CRITICAL_FUEL_THRESHOLD;
  const isWarning = !isCritical && pct <= WARNING_FUEL_THRESHOLD;
  const fuelState = isCritical ? "critical" : isWarning ? "warning" : "safe";
  const statusLabel = isCritical ? "LOW FUEL" : isWarning ? "Fuel dropping" : "Fuel stable";
  const supportLabel =
    snapshot?.state === "landing"
      ? "Engine out glide"
      : boostSeconds > 0
        ? `Boost ${boostSeconds}s`
        : "Collect red fuel cans";

  return (
    <div className={`fuel-gauge fuel-gauge--${fuelState}`} aria-label="Fuel gauge">
      <div className="fuel-gauge-header">
        <strong>Fuel Reserve</strong>
        <span>{pct}%</span>
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
        <span>{snapshot?.state === "landing" ? "Crash imminent" : "Updates live"}</span>
      </div>
      {isCritical ? <div className="fuel-gauge-alert">LOW FUEL</div> : null}
    </div>
  );
}
