"use client";

import type {
  FeatureFlags,
  FlightSettings,
  QualityMode,
  QualitySetting,
  EnemyDensitySetting,
} from "../../lib/game/types";

const qualityOptions: QualitySetting[] = ["auto", "low", "medium", "high"];
const densityOptions: EnemyDensitySetting[] = ["low", "medium", "high"];

const labelize = (value: string) =>
  value.charAt(0).toUpperCase() + value.slice(1).replace(/-/g, " ");

export function FlightSettingsPanel({
  open,
  settings,
  featureFlags,
  qualityMode,
  onClose,
  onUpdateSettings,
  onUpdateFeatureFlags,
}: {
  open: boolean;
  settings: FlightSettings;
  featureFlags: FeatureFlags;
  qualityMode: QualityMode;
  onClose: () => void;
  onUpdateSettings: (settings: Partial<FlightSettings>) => void;
  onUpdateFeatureFlags: (flags: Partial<FeatureFlags>) => void;
}) {
  if (!open) {
    return null;
  }

  return (
    <div className="flight-settings-panel" role="dialog" aria-label="Flight settings">
      <div className="flight-settings-panel__header">
        <div>
          <strong>Controls / Settings</strong>
          <span>Resolved quality: {labelize(qualityMode)}</span>
        </div>
        <button type="button" className="icon-button" onClick={onClose}>
          Close
        </button>
      </div>

      <div className="flight-settings-panel__section">
        <strong>Controls</strong>
        <p>
          Click the sky to focus flight controls. WASD or arrows steer, Space fires, scroll
          zooms, and mouse movement softly biases turning on desktop.
        </p>
      </div>

      <label className="flight-settings-panel__field">
        <span>Graphics quality</span>
        <select
          value={settings.quality}
          onChange={(event) =>
            onUpdateSettings({
              quality: event.target.value as QualitySetting,
            })
          }
        >
          {qualityOptions.map((option) => (
            <option key={option} value={option}>
              {labelize(option)}
            </option>
          ))}
        </select>
      </label>

      <label className="flight-settings-panel__field">
        <span>Enemy density</span>
        <select
          value={settings.enemyDensity}
          onChange={(event) =>
            onUpdateSettings({
              enemyDensity: event.target.value as EnemyDensitySetting,
            })
          }
        >
          {densityOptions.map((option) => (
            <option key={option} value={option}>
              {labelize(option)}
            </option>
          ))}
        </select>
      </label>

      <label className="flight-settings-panel__field">
        <span>Mouse steering sensitivity</span>
        <input
          type="range"
          min="0.2"
          max="1.4"
          step="0.05"
          value={settings.mouseSensitivity}
          onChange={(event) =>
            onUpdateSettings({
              mouseSensitivity: Number(event.target.value),
            })
          }
        />
        <small>{Math.round(settings.mouseSensitivity * 100)}%</small>
      </label>

      <div className="flight-settings-panel__section">
        <strong>Feature flags</strong>
        <p>Toggle subsystems individually when isolating bugs or perf issues.</p>
      </div>

      {(
        [
          ["fuelSystem", "Fuel system"],
          ["speedBoosts", "Speed boosts"],
          ["enemyPlanes", "Enemy planes"],
          ["combat", "Turrets / combat"],
          ["leaderboard", "Leaderboard"],
          ["advancedClouds", "Advanced clouds"],
          ["deploymentDensityLimits", "Deployment density limiting"],
        ] as const
      ).map(([key, label]) => (
        <label key={key} className="flight-settings-panel__field flight-settings-panel__field--toggle">
          <span>{label}</span>
          <input
            type="checkbox"
            checked={featureFlags[key]}
            onChange={(event) =>
              onUpdateFeatureFlags({
                [key]: event.target.checked,
              })
            }
          />
        </label>
      ))}
    </div>
  );
}
