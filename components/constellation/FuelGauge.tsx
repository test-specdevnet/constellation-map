"use client";

import type { GameSessionSnapshot } from "../../lib/game/types";

export function FuelGauge({
  snapshot,
}: {
  snapshot: GameSessionSnapshot | null;
}) {
  const fuel = snapshot?.fuel ?? 100;
  const pct = Math.max(0, Math.min(100, Math.round((fuel / (snapshot?.fuelMax ?? 100)) * 100)));
  const boostSeconds = Math.ceil((snapshot?.boostRemainingMs ?? 0) / 1000);
  const powerUps = (snapshot?.fuelPackCount ?? 0) + (snapshot?.boostPackCount ?? 0);

  return (
    <div className="fuel-gauge" aria-label="Fuel gauge">
      <div className="fuel-gauge-header">
        <strong>Fuel</strong>
        <span>{pct}%</span>
      </div>
      <div className="fuel-gauge-track" aria-hidden="true">
        <span className={`fuel-gauge-fill ${pct < 25 ? "danger" : pct < 50 ? "warn" : ""}`} style={{ width: `${pct}%` }} />
      </div>
      <div className="fuel-gauge-meta">
        <span>{fuel.toFixed(0)} units</span>
        <span>
          {boostSeconds > 0
            ? `Boost ${boostSeconds}s`
            : `${snapshot?.parachuterCount ?? 0} rescue beacons · ${powerUps} supplies`}
        </span>
      </div>
    </div>
  );
}
