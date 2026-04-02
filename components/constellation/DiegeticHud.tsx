"use client";

import type { ReactNode } from "react";
import type { FlightTelemetry } from "../../lib/layout/focusContext";
import type { GameSessionSnapshot } from "../../lib/game/types";

type HudStat = {
  key: string;
  label: string;
  value: number;
  icon: ReactNode;
};

function HudIcon({ children }: { children: ReactNode }) {
  return (
    <svg
      className="hud-chip__icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

export function DiegeticHud({
  telemetry: _telemetry,
  snapshot,
  selectedSkinLabel: _selectedSkinLabel,
  unlockedSkinCount: _unlockedSkinCount,
  totalSkinCount: _totalSkinCount,
  mode,
}: {
  telemetry: FlightTelemetry | null;
  snapshot: GameSessionSnapshot | null;
  selectedSkinLabel: string;
  unlockedSkinCount: number;
  totalSkinCount: number;
  mode: "compact" | "detailed";
}) {
  const stats: HudStat[] = [
    {
      key: "discoveries",
      label: "Deployments Found",
      value: snapshot?.discoveries ?? 0,
      icon: (
        <HudIcon>
          <path d="M5 12h14" />
          <path d="M12 5v14" />
          <circle cx="12" cy="12" r="7" />
        </HudIcon>
      ),
    },
    {
      key: "boosts",
      label: "Speed Boosts",
      value: snapshot?.speedBoostsCollected ?? 0,
      icon: (
        <HudIcon>
          <path d="M13 3 5 14h5l-1 7 8-11h-5z" />
        </HudIcon>
      ),
    },
    {
      key: "fuel",
      label: "Fuel Tanks Collected",
      value: snapshot?.fuelTanksCollected ?? 0,
      icon: (
        <HudIcon>
          <path d="M9 5h6v14H9z" />
          <path d="M15 8h2l1 2v7a2 2 0 0 1-2 2h-1" />
          <path d="M11 9h2" />
        </HudIcon>
      ),
    },
    {
      key: "rescues",
      label: "Rescues Made",
      value: snapshot?.rescues ?? 0,
      icon: (
        <HudIcon>
          <path d="M12 6a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5Z" />
          <path d="M6 20a6 6 0 0 1 12 0" />
        </HudIcon>
      ),
    },
  ];

  return (
    <div
      className={`diegetic-hud ${
        mode === "compact" ? "diegetic-hud--compact" : "diegetic-hud--detailed"
      }`}
      aria-label="Flight heads-up display"
    >
      {stats.map((stat) => (
        <div
          key={stat.key}
          className="hud-chip hud-chip--stat"
          aria-label={`${stat.label}: ${stat.value}`}
        >
          {stat.icon}
          <span className="hud-chip__label">{stat.label}</span>
          <strong>{stat.value}</strong>
        </div>
      ))}
    </div>
  );
}
