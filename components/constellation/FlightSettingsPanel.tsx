"use client";

import { MobileDrawer } from "./MobileDrawer";
import type { PlaneSkinId } from "../../lib/canvas/cartoonMarkers";
import type {
  FeatureFlags,
  FlightSettings,
  QualityMode,
  QualitySetting,
} from "../../lib/game/types";

const qualityOptions: QualitySetting[] = ["auto", "low", "medium", "high"];
const skinSwatches: Record<PlaneSkinId, string> = {
  classic: "#f23b3f",
  "sunset-scout": "#ffd45a",
  "mint-radar": "#48bf79",
  "midnight-courier": "#4f86f2",
};

type SkinOption = {
  id: PlaneSkinId;
  label: string;
  description: string;
  unlocked: boolean;
  selected: boolean;
};

const labelize = (value: string) =>
  value.charAt(0).toUpperCase() + value.slice(1).replace(/-/g, " ");

export function FlightSettingsPanel({
  open,
  settings,
  featureFlags,
  qualityMode,
  skins = [],
  selectedSkinId = "classic",
  onClose,
  onUpdateSettings,
  onUpdateFeatureFlags,
  onSelectSkin = () => undefined,
  mobile = false,
}: {
  open: boolean;
  settings: FlightSettings;
  featureFlags: FeatureFlags;
  qualityMode: QualityMode;
  skins?: SkinOption[];
  selectedSkinId?: PlaneSkinId;
  onClose: () => void;
  onUpdateSettings: (settings: Partial<FlightSettings>) => void;
  onUpdateFeatureFlags: (flags: Partial<FeatureFlags>) => void;
  onSelectSkin?: (skinId: PlaneSkinId) => void;
  mobile?: boolean;
}) {
  if (!open) {
    return null;
  }

  const content = (
    <>
      <div className="flight-settings-panel__section flight-settings-panel__section--intro">
        <strong>Resolved quality</strong>
        <p>{labelize(qualityMode)}</p>
      </div>

      <div className="flight-settings-panel__section">
        <strong>Controls</strong>
        <p>
          Click the sky to focus flight controls. WASD or arrows steer, scroll zooms,
          and mouse movement softly biases turning on desktop.
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

      <label className="flight-settings-panel__field flight-settings-panel__field--toggle">
        <span>Responsive camera</span>
        <input
          type="checkbox"
          checked={settings.responsiveCamera}
          onChange={(event) =>
            onUpdateSettings({
              responsiveCamera: event.target.checked,
            })
          }
        />
      </label>

      {skins.length > 0 ? (
      <div className="flight-settings-panel__section">
        <strong>Biplane livery</strong>
        <div className="flight-settings-panel__skins" role="list" aria-label="Biplane liveries">
          {skins.map((skin) => (
            <button
              key={skin.id}
              type="button"
              className={`flight-settings-panel__skin ${
                selectedSkinId === skin.id ? "flight-settings-panel__skin--selected" : ""
              }`}
              onClick={() => onSelectSkin(skin.id)}
              disabled={!skin.unlocked}
              aria-pressed={selectedSkinId === skin.id}
              title={skin.description}
            >
              <span
                className="flight-settings-panel__skin-swatch"
                style={{ background: skinSwatches[skin.id] }}
                aria-hidden="true"
              />
              <span>{skin.label}</span>
            </button>
          ))}
        </div>
      </div>
      ) : null}

      <div className="flight-settings-panel__section">
        <strong>Feature flags</strong>
        <p>Toggle exploration systems individually when isolating bugs or perf issues.</p>
      </div>

      {(
        [
          ["debugHud", "Debug HUD"],
          ["pickups", "Fuel and boost pickups"],
          ["leaderboard", "Leaderboard"],
          ["clouds", "Clouds"],
          ["weather", "Weather"],
          ["dogfights", "Dogfights"],
          ["multiplayerGhosts", "Multiplayer ghosts"],
          ["deploymentClustering", "Deployment clustering"],
        ] as const
      ).map(([key, label]) => (
        <label
          key={key}
          className="flight-settings-panel__field flight-settings-panel__field--toggle"
        >
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
    </>
  );

  if (mobile) {
    return (
      <MobileDrawer
        open={open}
        title="Controls and settings"
        description="Adjust flight controls, HUD density, and exploration systems for touch play."
        onClose={onClose}
        placement="bottom"
        className="mobile-drawer--panel"
      >
        <div className="flight-settings-panel flight-settings-panel--mobile">{content}</div>
      </MobileDrawer>
    );
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
      {content}
    </div>
  );
}
