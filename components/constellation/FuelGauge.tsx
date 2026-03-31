"use client";

import type { GameSessionSnapshot } from "../../lib/game/types";

export function FuelGauge({
  snapshot,
}: {
  snapshot: GameSessionSnapshot | null;
}) {
  const fuel = snapshot?.fuel ?? 100;
  const pct = Math.max(0, Math.min(100, Math.round((fuel / (snapshot?.fuelMax ?? 100)) * 100)));
  const hullPct = Math.max(
    0,
    Math.min(100, Math.round(((snapshot?.hull ?? 100) / (snapshot?.hullMax ?? 100)) * 100)),
  );
  const boostSeconds = Math.ceil((snapshot?.boostRemainingMs ?? 0) / 1000);
  const repairSeconds = Math.ceil((snapshot?.repairCooldownMs ?? 0) / 1000);

  return (
    <div className="fuel-gauge" aria-label="Fuel gauge">
      <div className="fuel-gauge-header">
        <strong>Fuel</strong>
        <span>{pct}%</span>
      </div>
      <div className="fuel-gauge-track" aria-hidden="true">
        <span className={`fuel-gauge-fill ${pct < 25 ? "danger" : pct < 50 ? "warn" : ""}`} style={{ width: `${pct}%` }} />
      </div>
      <div className="fuel-gauge-header fuel-gauge-header--sub">
        <strong>Hull</strong>
        <span>{hullPct}%</span>
      </div>
      <div className="fuel-gauge-track fuel-gauge-track--hull" aria-hidden="true">
        <span
          className={`fuel-gauge-fill fuel-gauge-fill--hull ${hullPct < 25 ? "danger" : hullPct < 50 ? "warn" : ""}`}
          style={{ width: `${hullPct}%` }}
        />
      </div>
      <div className="fuel-gauge-meta">
        <span>{fuel.toFixed(0)} units</span>
        <span>
          {boostSeconds > 0
            ? `Boost ${boostSeconds}s`
            : repairSeconds > 0
              ? `Repair in ${repairSeconds}s`
              : "Repair active"}
        </span>
      </div>
    </div>
  );
}
