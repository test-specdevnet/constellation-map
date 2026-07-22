"use client";

import { memo, type ReactNode } from "react";
import type { FlightTelemetry } from "../../lib/layout/focusContext";
import type { GameSessionSnapshot } from "../../lib/game/types";

type HudStat = {
  key: string;
  label: string;
  value: number | string;
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

export const DiegeticHud = memo(function DiegeticHud({
  telemetry: _telemetry,
  snapshot,
  mode,
}: {
  telemetry: FlightTelemetry | null;
  snapshot: GameSessionSnapshot | null;
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
      key: "hull",
      label: "Hull",
      value: `${Math.round(snapshot?.playerHealth ?? 100)}%`,
      icon: (
        <HudIcon>
          <path d="M12 3 5 6v5c0 4 3 7 7 9 4-2 7-5 7-9V6z" />
        </HudIcon>
      ),
    },
    {
      key: "enemy-downs",
      label: "Enemy Downs",
      value: snapshot?.enemiesDefeated ?? 0,
      icon: (
        <HudIcon>
          <path d="M4 14h16" />
          <path d="M7 11 4 14l3 3" />
          <path d="M17 11l3 3-3 3" />
          <path d="M12 6v12" />
        </HudIcon>
      ),
    },
    {
      key: "storm",
      label: "Storm",
      value: `${Math.round((snapshot?.weatherSeverity ?? 0) * 100)}%`,
      icon: (
        <HudIcon>
          <path d="M7 16a4 4 0 0 1 .7-7.9 5 5 0 0 1 9.6 1.8A3.2 3.2 0 0 1 17 16" />
          <path d="m12 13-2 4h3l-1 4 3-5h-3z" />
        </HudIcon>
      ),
    },
    {
      key: "squadron",
      label: "Squadron",
      value: snapshot?.multiplayerPeers ?? 0,
      icon: (
        <HudIcon>
          <path d="M7 12h10" />
          <path d="m4 15 3-3-3-3" />
          <path d="m20 9-3 3 3 3" />
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
}, (previous, next) => previous.snapshot === next.snapshot && previous.mode === next.mode);
