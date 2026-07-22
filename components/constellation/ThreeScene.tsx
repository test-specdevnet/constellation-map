"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  startTransition,
  type ReactNode,
} from "react";
import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { clone as cloneSkeleton } from "three/examples/jsm/utils/SkeletonUtils.js";
import { DebugHud } from "./DebugHud";
import { FlightSettingsPanel } from "./FlightSettingsPanel";
import { MobileDrawer } from "./MobileDrawer";
import { useMediaQuery } from "./useMediaQuery";
import { categoryLabel, getBuoyColorway } from "../../lib/canvas/buoyCategory";
import {
  planeSkinPalettes,
  type PlaneSkinId,
  type PlaneSkinPalette,
} from "../../lib/canvas/cartoonMarkers";
import {
  getDisclosureState,
  type FlightTelemetry,
} from "../../lib/layout/focusContext";
import type { AppSystem, Cluster, SceneBounds, Star } from "../../lib/types/star";
import type { AppDetail } from "../../lib/types/star";
import {
  GAME_CONFIG,
  clamp,
  resolveQualityMode,
  type FeatureFlags,
  type FlightSettings,
  type QualityMode,
} from "../../lib/game/config";
import { buildDeploymentVisibilityState } from "../../lib/game/deploymentVisibility";
import { updateEffects } from "../../lib/game/effects";
import {
  computeCameraFollowTarget,
  createFlightState,
  getDefaultZoom,
  integrateFlightState,
  resolveCameraFollowRates,
} from "../../lib/game/flightController";
import {
  createInputController,
  focusInputController,
  pressControlKey,
  releaseControlKey,
  resetInputController,
  sampleInputController,
  setMouseSteerActive,
  setPointerTurnBias,
  type ControlKey,
} from "../../lib/game/inputController";
import {
  applyCollectibleOutcome,
  collectNearbyCollectibles,
  maintainCollectibles,
} from "../../lib/game/collectibles";
import {
  accumulateDistanceFlown,
  createGameState,
  createSessionSnapshot,
  discoverDeployment,
  syncGameScore,
  toRunRecord,
  updateRunResources,
} from "../../lib/game/session";
import { updateCombatState } from "../../lib/game/combat";
import { applyWeatherInfluence, updateWeatherState } from "../../lib/game/weather";
import {
  findNearbyDeployment,
  resolveLandingAttempt,
} from "../../lib/game/collision";
import {
  DEPLOYMENT_CREDIT_VALUE,
  buildDeploymentDocks,
  buildStationLayout,
  type LandingStation,
  type StationLayout,
} from "../../lib/game/worldLayout";
import {
  getBiplaneMaterialRole,
  getRuntimeModelConfig,
  type RuntimeModelId,
} from "../../lib/game/modelAssets";
import type {
  Collectible,
  DebugHudSnapshot,
  DeploymentVisibilityState,
  FlightInputState,
  FlightState,
  GameSessionSnapshot,
  GameState,
  RunRecord,
  VisualEffect,
} from "../../lib/game/types";

export type HoveredEntity =
  | { kind: "cluster"; id: string; label: string; subtitle: string }
  | {
      kind: "system" | "star";
      id: string;
      discoveryId: string;
      label: string;
      subtitle: string;
      appName: string;
    };

type CameraTarget = {
  key: string;
  x: number;
  y: number;
  zoom: number;
};

type ThreeSceneProps = {
  stars: Star[];
  clusters: Cluster[];
  systems: AppSystem[];
  bounds: SceneBounds;
  selectedAppName: string | null;
  selectedAppDetail: AppDetail | null;
  selectedAppDetailLoading: boolean;
  selectedAppDetailError: string;
  searchMatches: string[];
  focusTarget: CameraTarget | null;
  mapDataLoading: boolean;
  snapshotError: boolean;
  flightSettings: FlightSettings;
  featureFlags: FeatureFlags;
  playerCallsign: string;
  skins: Array<{
    id: PlaneSkinId;
    label: string;
    description: string;
    unlocked: boolean;
    selected: boolean;
  }>;
  selectedSkinId: PlaneSkinId;
  hudOverlay?: ReactNode;
  onSelectApp: (appName: string) => void;
  onClearSelectedApp: () => void;
  onFocusCluster: (cluster: Cluster) => void;
  onHoverEntity: (entity: HoveredEntity | null) => void;
  onTelemetry: (telemetry: FlightTelemetry) => void;
  onUpdateFlightSettings: (settings: Partial<FlightSettings>) => void;
  onUpdateFeatureFlags: (flags: Partial<FeatureFlags>) => void;
  onSelectSkin: (skinId: PlaneSkinId) => void;
  onGameStateChange?: (snapshot: GameSessionSnapshot) => void;
  onRunComplete?: (record: RunRecord) => void;
};

type MultiplayerPeer = {
  id: string;
  callsign: string;
  skinId: PlaneSkinId;
  x: number;
  y: number;
  heading: number;
  altitude: number;
  speed: number;
  updatedAtMs: number;
};

type SceneRuntime = {
  flight: FlightState;
  previousFlight: FlightState;
  game: GameState;
  visibility: DeploymentVisibilityState;
  input: FlightInputState;
  effects: VisualEffect[];
  nowMs: number;
  zoom: number;
  pickupNotice: string | null;
  landedStation: LandingStation | null;
  nearbyStation: LandingStation | null;
  nearbyDeploymentId: string | null;
  playerMode: PlayerMode;
  multiplayerPeers: MultiplayerPeer[];
  performance: {
    fps: number;
    frameMs: number;
    drawCalls: number;
    triangles: number;
  };
};

type PlayerMode = "flying" | "landed" | "onFoot";
type RuntimeModelLoadState =
  | { status: "idle" | "loading" | "error"; scene: null }
  | { status: "ready"; scene: THREE.Group };
type DisclosureSnapshot = Pick<
  FlightTelemetry,
  | "band"
  | "activeRegionId"
  | "activeRuntimeId"
  | "nearbySystemId"
  | "nearestRegionDistance"
  | "nearestSystemDistance"
>;
type VisibilityRefreshRequest = {
  flight: FlightState;
  nowMs: number;
  zoom: number;
  selectedAppName: string | null;
  searchSignature: string;
  qualityMode: QualityMode;
  deploymentClustering: boolean;
};
type IdleWorkHandle =
  | { kind: "idle"; id: number }
  | { kind: "timeout"; id: number };

const GAME_STATE_EMIT_INTERVAL_MS = 760;
const TELEMETRY_EMIT_INTERVAL_MS = 80;
const COLLECTIBLE_MAINTENANCE_INTERVAL_MS = 240;
const DEPLOYMENT_PROXIMITY_INTERVAL_MS = 100;
const VISIBILITY_UPDATE_INTERVAL_MS = 4_000;
const VISIBILITY_UPDATE_DISTANCE_WORLD = 2_200;
const VISIBILITY_CANDIDATE_RADIUS_WORLD = GAME_CONFIG.localSystemRadius + 1_080;
const SYSTEM_SPATIAL_CELL_WORLD = 1_400;
const WORLD_SCALE = 0.024;
const PLANE_ALTITUDE = 6.4;
const ISLAND_ALTITUDE = 1.2;
const MAX_STAR_MARKERS = {
  low: 16,
  medium: 28,
  high: 42,
} as const;
const MAX_ISLAND_MARKERS = {
  low: 12,
  medium: 20,
  high: 30,
} as const;
const CLOUD_FIELD_MARKERS = {
  low: 10,
  medium: 18,
  high: 28,
} as const;
const DEPLOYMENT_MARKER_INSTANCE_CAP = GAME_CONFIG.maxVisibleSystems.high;
const DEPLOYMENT_LABEL_CAP = {
  low: 4,
  medium: 6,
  high: 8,
} as const;
const DEFAULT_DEPLOYMENT_COLORWAY = {
  main: "#6B7F9E",
  light: "#8FA4BE",
  trim: "#1B2744",
  beacon: "#A8B8D8",
  core: "#F2F6FF",
} as const;
const RUNTIME_GLB_MODELS_ENABLED = true;
const EMPTY_VISIBILITY: DeploymentVisibilityState = {
  visibleSystems: [],
  detailSystems: [],
  detailSystemIds: new Set<string>(),
  visibleStarsBySystem: new Map<string, Star[]>(),
  clusterMarkers: [],
};
const IDLE_FLIGHT_INPUT: FlightInputState = {
  accelerate: false,
  brake: false,
  turnLeft: false,
  turnRight: false,
  fire: false,
  mouseTurn: 0,
  moveX: 0,
  moveY: 0,
  climb: false,
  dive: false,
  verticalAxis: 0,
};
const runtimeModelCache = new Map<
  RuntimeModelId,
  { status: "loading"; promise: Promise<THREE.Group> } | { status: "ready"; scene: THREE.Group } | { status: "error" }
>();
let runtimeModelLoader: GLTFLoader | null = null;
let softCloudTexture: THREE.CanvasTexture | null = null;
let skyDomeCloudTexture: THREE.CanvasTexture | null = null;

type SystemSpatialIndex = {
  cellSize: number;
  cells: Map<string, AppSystem[]>;
};

const to3 = (point: { x: number; y: number }, altitude = 0) =>
  new THREE.Vector3(point.x * WORLD_SCALE, altitude, point.y * WORLD_SCALE);

const spatialCellKey = (x: number, y: number) => `${x}:${y}`;

const buildSystemSpatialIndex = (systems: AppSystem[]): SystemSpatialIndex => {
  const cells = new Map<string, AppSystem[]>();
  for (const system of systems) {
    const cellX = Math.floor(system.x / SYSTEM_SPATIAL_CELL_WORLD);
    const cellY = Math.floor(system.y / SYSTEM_SPATIAL_CELL_WORLD);
    const key = spatialCellKey(cellX, cellY);
    const bucket = cells.get(key);
    if (bucket) {
      bucket.push(system);
    } else {
      cells.set(key, [system]);
    }
  }
  return { cellSize: SYSTEM_SPATIAL_CELL_WORLD, cells };
};

const querySystemSpatialIndex = ({
  index,
  point,
  radius,
}: {
  index: SystemSpatialIndex;
  point: { x: number; y: number };
  radius: number;
}) => {
  const radiusSq = radius * radius;
  const minCellX = Math.floor((point.x - radius) / index.cellSize);
  const maxCellX = Math.floor((point.x + radius) / index.cellSize);
  const minCellY = Math.floor((point.y - radius) / index.cellSize);
  const maxCellY = Math.floor((point.y + radius) / index.cellSize);
  const candidates: AppSystem[] = [];

  for (let cellX = minCellX; cellX <= maxCellX; cellX += 1) {
    for (let cellY = minCellY; cellY <= maxCellY; cellY += 1) {
      const bucket = index.cells.get(spatialCellKey(cellX, cellY));
      if (!bucket) {
        continue;
      }
      for (const system of bucket) {
        const dx = system.x - point.x;
        const dy = system.y - point.y;
        if (dx * dx + dy * dy <= radiusSq) {
          candidates.push(system);
        }
      }
    }
  }

  return candidates;
};

const mergeSystemsById = (...groups: AppSystem[][]) => {
  const seen = new Set<string>();
  const merged: AppSystem[] = [];

  for (const group of groups) {
    for (const system of group) {
      if (seen.has(system.systemId)) {
        continue;
      }
      seen.add(system.systemId);
      merged.push(system);
    }
  }

  return merged;
};

const getSceneRenderSignature = (runtime: SceneRuntime) => {
  const visibility = runtime.visibility;
  const game = runtime.game;
  return [
    visibility.visibleSystems.map((system) => system.systemId).join(","),
    [...visibility.detailSystemIds].join(","),
    visibility.clusterMarkers.map((marker) => `${marker.id}:${marker.count}`).join(","),
    game.collectibles
      .filter((item) => item.active)
      .map((item) => item.id)
      .join(","),
    game.effects.map((effect) => effect.id).join(","),
    game.weather.cells.length,
    game.combat.enemies.filter((enemy) => enemy.active).length,
    game.combat.enemiesDefeated,
    runtime.multiplayerPeers.length,
    runtime.landedStation?.id ?? "",
    runtime.playerMode,
    game.state,
  ].join(";");
};

const BOOST_BOLT_SHAPE = (() => {
  const shape = new THREE.Shape();
  shape.moveTo(-0.18, 0.72);
  shape.lineTo(0.46, 0.08);
  shape.lineTo(0.08, 0.08);
  shape.lineTo(0.34, -0.72);
  shape.lineTo(-0.48, -0.02);
  shape.lineTo(-0.1, -0.02);
  shape.closePath();
  return shape;
})();
const DEPLOYMENT_MARKER_SLOT_IDS = Array.from(
  { length: DEPLOYMENT_MARKER_INSTANCE_CAP },
  (_, index) => index,
);

const getRefuelAmount = (discoveries: number, fuelMax: number) =>
  clamp(fuelMax * (0.28 + discoveries * 0.035), fuelMax * 0.28, fuelMax);

const scheduleSceneAction = (action: () => void) => {
  window.requestAnimationFrame(() => {
    void Promise.resolve().then(action);
  });
};

const getRuntimeModelLoader = () => {
  runtimeModelLoader ??= new GLTFLoader();
  return runtimeModelLoader;
};

const getSoftCloudTexture = () => {
  if (softCloudTexture) return softCloudTexture;
  const canvas = document.createElement("canvas");
  canvas.width = 192;
  canvas.height = 192;
  const context = canvas.getContext("2d");
  if (!context) {
    softCloudTexture = new THREE.CanvasTexture(canvas);
    return softCloudTexture;
  }
  const gradient = context.createRadialGradient(96, 90, 8, 96, 96, 92);
  gradient.addColorStop(0, "rgba(255, 255, 255, 1)");
  gradient.addColorStop(0.34, "rgba(255, 255, 255, 0.98)");
  gradient.addColorStop(0.58, "rgba(246, 252, 255, 0.78)");
  gradient.addColorStop(0.78, "rgba(217, 239, 252, 0.38)");
  gradient.addColorStop(1, "rgba(190, 224, 244, 0)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, 192, 192);
  softCloudTexture = new THREE.CanvasTexture(canvas);
  softCloudTexture.colorSpace = THREE.SRGBColorSpace;
  softCloudTexture.needsUpdate = true;
  return softCloudTexture;
};

const drawCloudLobe = ({
  context,
  x,
  y,
  radius,
  opacity,
}: {
  context: CanvasRenderingContext2D;
  x: number;
  y: number;
  radius: number;
  opacity: number;
}) => {
  const gradient = context.createRadialGradient(x, y, radius * 0.08, x, y, radius);
  gradient.addColorStop(0, `rgba(255, 255, 255, ${opacity})`);
  gradient.addColorStop(0.38, `rgba(248, 253, 255, ${opacity * 0.9})`);
  gradient.addColorStop(0.68, `rgba(210, 235, 252, ${opacity * 0.42})`);
  gradient.addColorStop(1, "rgba(178, 215, 238, 0)");
  context.fillStyle = gradient;
  context.beginPath();
  context.arc(x, y, radius, 0, Math.PI * 2);
  context.fill();
};

const getSkyDomeCloudTexture = () => {
  if (skyDomeCloudTexture) return skyDomeCloudTexture;
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 512;
  const context = canvas.getContext("2d");
  if (!context) {
    skyDomeCloudTexture = new THREE.CanvasTexture(canvas);
    return skyDomeCloudTexture;
  }

  const skyGradient = context.createLinearGradient(0, 0, 0, canvas.height);
  skyGradient.addColorStop(0, "#0e5f9f");
  skyGradient.addColorStop(0.42, "#227fbd");
  skyGradient.addColorStop(1, "#7cc4e5");
  context.fillStyle = skyGradient;
  context.fillRect(0, 0, canvas.width, canvas.height);

  for (let bank = 0; bank < 9; bank += 1) {
    const baseX = -90 + bank * 142 + ((bank * 37) % 54);
    const baseY = 245 + ((bank * 29) % 124);
    const lobes = 14 + (bank % 4) * 3;
    for (let lobe = 0; lobe < lobes; lobe += 1) {
      const offsetX = ((lobe * 71 + bank * 23) % 210) - 70;
      const offsetY = Math.sin((lobe + bank) * 0.82) * 34 + ((lobe * 17) % 26);
      const radius = 56 + ((lobe * 19 + bank * 11) % 58);
      drawCloudLobe({
        context,
        x: baseX + offsetX,
        y: baseY + offsetY,
        radius,
        opacity: 0.46,
      });
    }
  }

  for (let wisp = 0; wisp < 42; wisp += 1) {
    const x = ((wisp * 97) % 1160) - 70;
    const y = 54 + ((wisp * 53) % 250);
    const radius = 28 + ((wisp * 31) % 72);
    drawCloudLobe({
      context,
      x,
      y,
      radius,
      opacity: 0.18 + (wisp % 5) * 0.026,
    });
  }

  skyDomeCloudTexture = new THREE.CanvasTexture(canvas);
  skyDomeCloudTexture.colorSpace = THREE.SRGBColorSpace;
  skyDomeCloudTexture.needsUpdate = true;
  return skyDomeCloudTexture;
};

const scheduleIdleModelLoad = (callback: () => void) => {
  const idleCallback = (window as Window & {
    requestIdleCallback?: (cb: IdleRequestCallback, options?: IdleRequestOptions) => number;
  }).requestIdleCallback;
  if (idleCallback) {
    idleCallback(callback, { timeout: 900 });
    return;
  }
  window.setTimeout(callback, 16);
};

const scheduleIdleSceneWork = (callback: () => void): IdleWorkHandle => {
  const browserWindow = window as Window & {
    requestIdleCallback?: (cb: IdleRequestCallback, options?: IdleRequestOptions) => number;
  };
  if (browserWindow.requestIdleCallback) {
    return {
      kind: "idle",
      id: browserWindow.requestIdleCallback(callback, { timeout: 240 }),
    };
  }

  return { kind: "timeout", id: window.setTimeout(callback, 24) };
};

const cancelIdleSceneWork = (handle: IdleWorkHandle | null) => {
  if (!handle) return;
  if (handle.kind === "idle") {
    const browserWindow = window as Window & {
      cancelIdleCallback?: (id: number) => void;
    };
    browserWindow.cancelIdleCallback?.(handle.id);
    return;
  }
  window.clearTimeout(handle.id);
};

const requestRuntimeModel = (modelId: RuntimeModelId) => {
  const cached = runtimeModelCache.get(modelId);
  if (cached) return cached;
  const config = getRuntimeModelConfig(modelId);
  const entry = {
    status: "loading" as const,
    promise: getRuntimeModelLoader()
      .loadAsync(config.path)
      .then((gltf) => {
        const scene = gltf.scene;
        runtimeModelCache.set(modelId, { status: "ready", scene });
        return scene;
      })
      .catch((error) => {
        console.warn(`Failed to load ${config.fallbackLabel}`, error);
        runtimeModelCache.set(modelId, { status: "error" });
        throw error;
      }),
  };
  runtimeModelCache.set(modelId, entry);
  return entry;
};

const fitCanvasText = ({
  context,
  text,
  maxWidth,
  maxFontSize,
  minFontSize,
  weight,
}: {
  context: CanvasRenderingContext2D;
  text: string;
  maxWidth: number;
  maxFontSize: number;
  minFontSize: number;
  weight: number;
}) => {
  let fontSize = maxFontSize;
  const fontFamily = "Segoe UI, system-ui, sans-serif";
  while (fontSize > minFontSize) {
    context.font = `${weight} ${fontSize}px ${fontFamily}`;
    if (context.measureText(text).width <= maxWidth) {
      return fontSize;
    }
    fontSize -= 2;
  }
  context.font = `${weight} ${minFontSize}px ${fontFamily}`;
  return minFontSize;
};

const clampLabelText = (text: string, maxLength: number) =>
  text.length > maxLength ? `${text.slice(0, Math.max(0, maxLength - 3))}...` : text;

type BeaconPlaqueTextureOptions = {
  label: string;
  subtitle?: string;
  color: string;
  compact: boolean;
  selected: boolean;
};

const createBeaconPlaqueTexture = ({
  label,
  subtitle,
  color,
  compact,
  selected,
}: BeaconPlaqueTextureOptions) => {
  const canvas = document.createElement("canvas");
  canvas.width = compact ? 640 : 720;
  canvas.height = compact ? 184 : 196;
  const context = canvas.getContext("2d");
  if (!context) {
    return null;
  }

  const width = canvas.width;
  const height = canvas.height;
  const radius = compact ? 32 : 34;
  context.clearRect(0, 0, width, height);
  context.fillStyle = selected ? "#fbfeff" : "#f4fbff";
  context.strokeStyle = selected ? "#ffe592" : "#8dbce0";
  context.lineWidth = selected ? 8 : 5;
  context.beginPath();
  context.roundRect(6, 6, width - 12, height - 12, radius);
  context.fill();
  context.stroke();

  context.fillStyle = color;
  context.beginPath();
  context.roundRect(32, 24, width - 64, compact ? 20 : 22, 12);
  context.fill();

  const title = clampLabelText(label, compact ? 30 : 34);
  const titleFontSize = fitCanvasText({
    context,
    text: title,
    maxWidth: width - 88,
    maxFontSize: compact ? 42 : 46,
    minFontSize: 24,
    weight: 850,
  });
  context.font = `850 ${titleFontSize}px Segoe UI, system-ui, sans-serif`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillStyle = "#123557";
  context.fillText(title, width / 2, compact ? 88 : 92);

  if (subtitle) {
    const subtitleText = clampLabelText(subtitle, compact ? 38 : 42);
    const subtitleFontSize = fitCanvasText({
      context,
      text: subtitleText,
      maxWidth: width - 104,
      maxFontSize: compact ? 24 : 26,
      minFontSize: 17,
      weight: 750,
    });
    context.font = `750 ${subtitleFontSize}px Segoe UI, system-ui, sans-serif`;
    context.fillStyle = "rgba(18, 53, 87, 0.78)";
    context.fillText(subtitleText, width / 2, compact ? 132 : 140);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  return texture;
};

const shouldIgnoreFlightPointer = (target: EventTarget | null) =>
  target instanceof Element
    ? Boolean(
        target.closest(
          "button, a, input, select, textarea, [role='button'], .scene-overlay-layer, .scene-toolbar, .scene-flight-pad",
        ),
      )
    : false;

const shouldIgnoreFlightKeyboard = (target: EventTarget | null) =>
  target instanceof Element
    ? Boolean(
        target.closest(
          "input, select, textarea, [contenteditable='true'], [role='textbox'], .control-bar, .flight-settings-panel",
        ),
      )
    : false;

const controlKeyFromEvent = (key: string): ControlKey | null => {
  const normalized = key.toLowerCase();
  if (key === "ArrowUp" || normalized === "w") return "ArrowUp";
  if (key === "ArrowDown" || normalized === "s") return "ArrowDown";
  if (key === "ArrowLeft" || normalized === "a") return "ArrowLeft";
  if (key === "ArrowRight" || normalized === "d") return "ArrowRight";
  if (normalized === "r" || normalized === "q") return "Climb";
  if (normalized === "f" || normalized === "e") return "Dive";
  if (key === " " || normalized === "spacebar") return "Fire";
  return null;
};

const createInitialDebugHudSnapshot = (): DebugHudSnapshot => ({
  fps: 0,
  frameMs: 0,
  tickRate: 0,
  counts: { deployments: 0, clusters: 0, powerUps: 0, clouds: 0 },
  input: { turnAxis: 0, throttleAxis: 0, verticalAxis: 0 },
  player: {
    speed: 0,
    altitude: GAME_CONFIG.altitudeDefault,
    verticalVelocity: 0,
    pitch: 0,
    fuel: GAME_CONFIG.fuelMax,
    boostRemainingMs: 0,
    distanceUnits: 0,
  },
  lastPickupEvent: null,
});

function prefersReducedMotion() {
  return typeof window !== "undefined"
    ? window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false
    : false;
}

export function ThreeScene({
  stars,
  clusters,
  systems,
  bounds,
  selectedAppName,
  selectedAppDetail,
  selectedAppDetailLoading,
  selectedAppDetailError,
  searchMatches,
  focusTarget,
  mapDataLoading,
  snapshotError,
  flightSettings,
  featureFlags,
  playerCallsign,
  skins,
  selectedSkinId,
  hudOverlay,
  onSelectApp,
  onClearSelectedApp,
  onFocusCluster,
  onHoverEntity,
  onTelemetry,
  onUpdateFlightSettings,
  onUpdateFeatureFlags,
  onSelectSkin,
  onGameStateChange,
  onRunComplete,
}: ThreeSceneProps) {
  const isCompactLayout = useMediaQuery("(max-width: 768px)");
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const inputControllerRef = useRef(createInputController());
  const runtimeRef = useRef<SceneRuntime>({
    flight: createFlightState(0, 0),
    previousFlight: createFlightState(0, 0),
    game: createGameState(),
    visibility: EMPTY_VISIBILITY,
    input: IDLE_FLIGHT_INPUT,
    effects: [],
    nowMs: 0,
    zoom: getDefaultZoom(),
    pickupNotice: null,
    landedStation: null,
    nearbyStation: null,
    nearbyDeploymentId: null,
    playerMode: "flying",
    multiplayerPeers: [],
    performance: {
      fps: 0,
      frameMs: 0,
      drawCalls: 0,
      triangles: 0,
    },
  });
  const multiplayerClientIdRef = useRef(
    `pilot:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 8)}`,
  );
  const multiplayerChannelRef = useRef<BroadcastChannel | null>(null);
  const multiplayerPeersRef = useRef(new Map<string, MultiplayerPeer>());
  const lastMultiplayerBroadcastRef = useRef(0);
  const worldMaintenanceRef = useRef<{
    lastCollectiblesAtMs: number;
    lastDeploymentAtMs: number;
    deploymentDocks: ReturnType<typeof buildDeploymentDocks>;
  }>({
    lastCollectiblesAtMs: 0,
    lastDeploymentAtMs: 0,
    deploymentDocks: [],
  });
  const gameEmitTsRef = useRef(0);
  const telemetryEmitTsRef = useRef(0);
  const sceneRenderSignatureRef = useRef("");
  const sceneSeededRef = useRef(false);
  const disclosureRef = useRef<DisclosureSnapshot>({
    band: "overview",
    activeRegionId: null,
    activeRuntimeId: null,
    nearbySystemId: null,
    nearestRegionDistance: null,
    nearestSystemDistance: null,
  });
  const visibilityUpdateRef = useRef<{
    lastAtMs: number;
    x: number;
    y: number;
    zoom: number;
    selectedAppName: string | null;
    searchSignature: string;
    qualityMode: QualityMode;
    deploymentClustering: boolean;
  }>({
    lastAtMs: 0,
    x: Number.NaN,
    y: Number.NaN,
    zoom: Number.NaN,
    selectedAppName: null,
    searchSignature: "",
    qualityMode: "medium",
    deploymentClustering: true,
  });
  const pendingVisibilityRequestRef = useRef<VisibilityRefreshRequest | null>(null);
  const visibilityWorkHandleRef = useRef<IdleWorkHandle | null>(null);
  const debugPerfRef = useRef({ lastSampleAtMs: 0, frames: 0, ticks: 0 });
  const onTelemetryRef = useRef(onTelemetry);
  const onGameStateChangeRef = useRef(onGameStateChange);
  const onRunCompleteRef = useRef(onRunComplete);
  const onFocusClusterRef = useRef(onFocusCluster);
  const onHoverEntityRef = useRef(onHoverEntity);
  const [runtimeVersion, setRuntimeVersion] = useState(0);
  const [showSettingsPanel, setShowSettingsPanel] = useState(false);
  const [showActionMenu, setShowActionMenu] = useState(false);
  const [debugHudHotkey, setDebugHudHotkey] = useState(false);
  const [debugStats, setDebugStats] = useState(createInitialDebugHudSnapshot);
  const [pickupNotice, setPickupNotice] = useState<string | null>(null);
  const [runEndSnapshot, setRunEndSnapshot] = useState<GameSessionSnapshot | null>(null);

  const reducedMotion = prefersReducedMotion();
  const qualityMode = useMemo(
    () =>
      resolveQualityMode({
        settings: flightSettings,
        reducedMotion,
        deviceMemory:
          typeof navigator !== "undefined"
            ? (navigator as Navigator & { deviceMemory?: number }).deviceMemory
            : undefined,
        hardwareConcurrency:
          typeof navigator !== "undefined" ? navigator.hardwareConcurrency : undefined,
      }),
    [flightSettings, reducedMotion],
  );
  const matchSet = useMemo(() => new Set(searchMatches), [searchMatches]);
  const searchSignature = useMemo(() => searchMatches.join("|"), [searchMatches]);
  const starsBySystem = useMemo(() => {
    const map = new Map<string, Star[]>();
    for (const star of stars) {
      const existing = map.get(star.systemId);
      if (existing) existing.push(star);
      else map.set(star.systemId, [star]);
    }
    return map;
  }, [stars]);
  const systemById = useMemo(
    () => new Map(systems.map((system) => [system.systemId, system])),
    [systems],
  );
  const systemSpatialIndex = useMemo(() => buildSystemSpatialIndex(systems), [systems]);
  const regionClusters = useMemo(
    () => clusters.filter((cluster) => cluster.level === "region"),
    [clusters],
  );
  const runtimeClusters = useMemo(
    () => clusters.filter((cluster) => cluster.level === "runtime"),
    [clusters],
  );
  const stationLayout = useMemo<StationLayout[]>(
    () => buildStationLayout(regionClusters),
    [regionClusters],
  );
  const stationByClusterId = useMemo(
    () => new Map(stationLayout.map((station) => [station.id, station])),
    [stationLayout],
  );
  const activeClusters = featureFlags.deploymentClustering ? clusters : runtimeClusters;
  const priorityVisibilitySystems = useMemo(
    () =>
      systems.filter(
        (system) => system.appName === selectedAppName || matchSet.has(system.appName),
      ),
    [matchSet, selectedAppName, systems],
  );
  const debugHudVisible = featureFlags.debugHud || debugHudHotkey;
  const boundsSignature = `${bounds.minX}:${bounds.minY}:${bounds.maxX}:${bounds.maxY}:${bounds.width}:${bounds.height}`;
  const sceneHasData = systems.length > 0 || stars.length > 0 || clusters.length > 0;

  useEffect(() => {
    onTelemetryRef.current = onTelemetry;
  }, [onTelemetry]);

  useEffect(() => {
    onGameStateChangeRef.current = onGameStateChange;
  }, [onGameStateChange]);

  useEffect(() => {
    onRunCompleteRef.current = onRunComplete;
  }, [onRunComplete]);

  useEffect(() => {
    onFocusClusterRef.current = onFocusCluster;
  }, [onFocusCluster]);

  useEffect(() => {
    onHoverEntityRef.current = onHoverEntity;
  }, [onHoverEntity]);

  const handleFocusCluster = useCallback(
    (cluster: Cluster) => onFocusClusterRef.current(cluster),
    [],
  );
  const handleHoverEntity = useCallback(
    (entity: HoveredEntity | null) => onHoverEntityRef.current(entity),
    [],
  );

  useEffect(() => {
    if (!sceneSeededRef.current) {
      if (mapDataLoading && !snapshotError && !sceneHasData) {
        return;
      }

      cancelIdleSceneWork(visibilityWorkHandleRef.current);
      visibilityWorkHandleRef.current = null;
      pendingVisibilityRequestRef.current = null;
      const center = {
        x: bounds.minX + bounds.width / 2,
        y: bounds.minY + bounds.height / 2,
      };
      const initialFlight = createFlightState(center.x, center.y);
      initialFlight.speed = Math.max(runtimeRef.current.flight.speed, 180);
      runtimeRef.current.flight = initialFlight;
      runtimeRef.current.previousFlight = { ...initialFlight };
      runtimeRef.current.game = createGameState();
      runtimeRef.current.game.runStartedAtMs = performance.now();
      runtimeRef.current.landedStation = null;
      runtimeRef.current.nearbyStation = null;
      runtimeRef.current.nearbyDeploymentId = null;
      runtimeRef.current.playerMode = "flying";
      runtimeRef.current.visibility = EMPTY_VISIBILITY;
      worldMaintenanceRef.current = {
        lastCollectiblesAtMs: 0,
        lastDeploymentAtMs: 0,
        deploymentDocks: [],
      };
      visibilityUpdateRef.current.lastAtMs = 0;
      telemetryEmitTsRef.current = 0;
      sceneRenderSignatureRef.current = "";
      sceneSeededRef.current = true;
      setRunEndSnapshot(null);
      startTransition(() => setRuntimeVersion((value) => value + 1));
      return;
    }

    const runtime = runtimeRef.current;
    cancelIdleSceneWork(visibilityWorkHandleRef.current);
    visibilityWorkHandleRef.current = null;
    pendingVisibilityRequestRef.current = null;
    const clampedX = clamp(runtime.flight.x, bounds.minX, bounds.maxX);
    const clampedY = clamp(runtime.flight.y, bounds.minY, bounds.maxY);
    if (clampedX !== runtime.flight.x || clampedY !== runtime.flight.y) {
      runtime.flight = { ...runtime.flight, x: clampedX, y: clampedY };
      runtime.previousFlight = { ...runtime.previousFlight, x: clampedX, y: clampedY };
    }
    visibilityUpdateRef.current.lastAtMs = 0;
    sceneRenderSignatureRef.current = "";
  }, [boundsSignature, mapDataLoading, sceneHasData, snapshotError]);

  useEffect(() => {
    const controller = inputControllerRef.current;
    const down = (event: KeyboardEvent) => {
      if (shouldIgnoreFlightKeyboard(event.target)) {
        return;
      }

      const mapped = controlKeyFromEvent(event.key);
      if (mapped) {
        focusInputController(controller);
        pressControlKey(controller, mapped);
        event.preventDefault();
      }
      if (event.key.toLowerCase() === "g") setDebugHudHotkey((value) => !value);
    };
    const up = (event: KeyboardEvent) => {
      if (shouldIgnoreFlightKeyboard(event.target)) {
        return;
      }

      const mapped = controlKeyFromEvent(event.key);
      if (mapped) releaseControlKey(controller, mapped);
    };
    const blur = () => resetInputController({ controller, blur: true });
    const pointerRelease = () => setMouseSteerActive(controller, false);
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    window.addEventListener("pointerup", pointerRelease);
    window.addEventListener("pointercancel", pointerRelease);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
      window.removeEventListener("pointerup", pointerRelease);
      window.removeEventListener("pointercancel", pointerRelease);
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || typeof BroadcastChannel === "undefined") {
      return;
    }

    const channel = new BroadcastChannel("fluxcloud-flight-sim");
    multiplayerChannelRef.current = channel;
    const handleMessage = (event: MessageEvent) => {
      const payload = event.data as
        | {
            type?: string;
            clientId?: string;
            callsign?: string;
            skinId?: PlaneSkinId;
            flight?: Pick<FlightState, "x" | "y" | "heading" | "altitude" | "speed">;
            sentAt?: number;
          }
        | undefined;

      if (
        payload?.type !== "flight-state" ||
        !payload.clientId ||
        payload.clientId === multiplayerClientIdRef.current ||
        !payload.flight
      ) {
        return;
      }

      multiplayerPeersRef.current.set(payload.clientId, {
        id: payload.clientId,
        callsign: payload.callsign?.trim().slice(0, 18) || "Pilot",
        skinId:
          payload.skinId && payload.skinId in planeSkinPalettes
            ? payload.skinId
            : "midnight-courier",
        x: payload.flight.x,
        y: payload.flight.y,
        heading: payload.flight.heading,
        altitude: payload.flight.altitude,
        speed: payload.flight.speed,
        updatedAtMs: performance.now(),
      });
    };

    channel.addEventListener("message", handleMessage);
    return () => {
      channel.removeEventListener("message", handleMessage);
      channel.close();
      if (multiplayerChannelRef.current === channel) {
        multiplayerChannelRef.current = null;
      }
    };
  }, []);

  const queueVisibilityRefresh = useCallback(
    (request: VisibilityRefreshRequest) => {
      pendingVisibilityRequestRef.current = request;
      visibilityUpdateRef.current = {
        lastAtMs: request.nowMs,
        x: request.flight.x,
        y: request.flight.y,
        zoom: request.zoom,
        selectedAppName: request.selectedAppName,
        searchSignature: request.searchSignature,
        qualityMode: request.qualityMode,
        deploymentClustering: request.deploymentClustering,
      };

      if (visibilityWorkHandleRef.current) {
        return;
      }

      visibilityWorkHandleRef.current = scheduleIdleSceneWork(() => {
        visibilityWorkHandleRef.current = null;
        const pendingRequest = pendingVisibilityRequestRef.current;
        pendingVisibilityRequestRef.current = null;
        if (!pendingRequest) {
          return;
        }

        const runtime = runtimeRef.current;
        const candidateSystems = mergeSystemsById(
          querySystemSpatialIndex({
            index: systemSpatialIndex,
            point: pendingRequest.flight,
            radius: VISIBILITY_CANDIDATE_RADIUS_WORLD,
          }),
          priorityVisibilitySystems,
          runtime.visibility.visibleSystems,
        );
        const disclosure = getDisclosureState({
          zoom: pendingRequest.zoom,
          plane: pendingRequest.flight,
          clusters,
          systems: candidateSystems,
          regionClusters,
          runtimeClusters,
        });
        disclosureRef.current = disclosure;
        runtime.visibility = buildDeploymentVisibilityState({
          systems,
          candidateSystems,
          systemById,
          starsBySystem,
          clusters,
          flight: pendingRequest.flight,
          disclosure,
          selectedAppName: pendingRequest.selectedAppName,
          searchMatches: matchSet,
          qualityMode: pendingRequest.qualityMode,
          densityLimitsEnabled: pendingRequest.deploymentClustering,
          previousVisibility: runtime.visibility,
        });
        worldMaintenanceRef.current.deploymentDocks = buildDeploymentDocks(
          runtime.visibility.visibleSystems,
        );

        const nextSceneRenderSignature = getSceneRenderSignature(runtime);
        if (sceneRenderSignatureRef.current !== nextSceneRenderSignature) {
          sceneRenderSignatureRef.current = nextSceneRenderSignature;
          startTransition(() => setRuntimeVersion((value) => value + 1));
        }
      });
    },
    [
      clusters,
      matchSet,
      priorityVisibilitySystems,
      regionClusters,
      runtimeClusters,
      starsBySystem,
      systemById,
      systemSpatialIndex,
      systems,
    ],
  );

  useEffect(
    () => () => {
      cancelIdleSceneWork(visibilityWorkHandleRef.current);
      visibilityWorkHandleRef.current = null;
      pendingVisibilityRequestRef.current = null;
    },
    [],
  );

  const handleRuntimeTick = useCallback(
    (dtMs: number, elapsedSeconds: number) => {
      const nowMs = performance.now();
      const runtime = runtimeRef.current;
      const game = runtime.game;
      const inputSample = sampleInputController({
        controller: inputControllerRef.current,
        mouseSensitivity: flightSettings.mouseSensitivity,
      });
      if (runtime.landedStation) {
        runtime.flight = { ...runtime.flight, speed: 0, angVel: 0 };
        runtime.previousFlight = runtime.flight;
        runtime.input = inputSample.flightInput;
        runtime.nowMs = nowMs;
        runtime.nearbyStation = runtime.landedStation;
        runtime.pickupNotice =
          runtime.playerMode === "onFoot"
              ? "Robot avatar active"
              : "Refuel station docked";
        if (inputSample.flightInput.accelerate) {
          runtime.landedStation = null;
          runtime.playerMode = "flying";
          runtime.flight = { ...runtime.flight, speed: 180, heading: runtime.flight.heading };
          setPickupNotice("Taking off");
          window.setTimeout(() => setPickupNotice(null), 1000);
        }
        return;
      }
      const boostActive = game.boostUntilMs > nowMs;
      const previousFlight = runtime.flight;
      let nextFlight =
        game.state === "flying"
          ? integrateFlightState({
              flight: runtime.flight,
              input: inputSample.flightInput,
              bounds,
              dtMs,
              qualityMode,
              boostActive,
            })
          : runtime.flight;
      if (game.state === "flying") {
        const weatherInfluence = updateWeatherState({
          weather: game.weather,
          bounds,
          flight: nextFlight,
          nowMs,
          dtMs,
          qualityMode,
          enabled: featureFlags.weather,
        });
        nextFlight = applyWeatherInfluence({
          flight: nextFlight,
          bounds,
          dtMs,
          weather: game.weather,
          influence: weatherInfluence,
        });
      } else {
        updateWeatherState({
          weather: game.weather,
          bounds,
          flight: nextFlight,
          nowMs,
          dtMs,
          qualityMode,
          enabled: featureFlags.weather,
        });
      }

      const landingAttempt = resolveLandingAttempt({
        game,
        plane: nextFlight,
        stations: stationLayout,
        brakePressed: inputSample.flightInput.brake,
        getRefuelAmount,
      });
      runtime.nearbyStation = landingAttempt.station;

      if (landingAttempt.landed) {
        runtime.landedStation = landingAttempt.station;
        runtime.playerMode = "landed";
        nextFlight.speed = 0;
        nextFlight.angVel = 0;
        setPickupNotice("Landed: refueled");
        window.setTimeout(() => setPickupNotice(null), 1400);
      }

      accumulateDistanceFlown({ game, from: previousFlight, to: nextFlight });
      updateRunResources({
        game,
        flight: nextFlight,
        dtMs,
        nowMs,
        qualityMode,
        featureFlags,
      });

      const visibilityUpdate = visibilityUpdateRef.current;
      const movedSinceVisibilityUpdate = Math.hypot(
        nextFlight.x - visibilityUpdate.x,
        nextFlight.y - visibilityUpdate.y,
      );
      const shouldRefreshVisibility =
        visibilityUpdate.lastAtMs === 0 ||
        nowMs - visibilityUpdate.lastAtMs >= VISIBILITY_UPDATE_INTERVAL_MS ||
        movedSinceVisibilityUpdate >= VISIBILITY_UPDATE_DISTANCE_WORLD ||
        Math.abs(runtime.zoom - visibilityUpdate.zoom) >= 0.035 ||
        selectedAppName !== visibilityUpdate.selectedAppName ||
        searchSignature !== visibilityUpdate.searchSignature ||
        qualityMode !== visibilityUpdate.qualityMode ||
        featureFlags.deploymentClustering !== visibilityUpdate.deploymentClustering;

      if (shouldRefreshVisibility) {
        queueVisibilityRefresh({
          flight: { ...nextFlight },
          nowMs,
          zoom: runtime.zoom,
          selectedAppName,
          searchSignature,
          qualityMode,
          deploymentClustering: featureFlags.deploymentClustering,
        });
      }

      const disclosure = disclosureRef.current;
      const visibility = runtime.visibility;

      const maintenance = worldMaintenanceRef.current;
      if (
        game.collectibles.length === 0 ||
        nowMs - maintenance.lastCollectiblesAtMs >= COLLECTIBLE_MAINTENANCE_INTERVAL_MS
      ) {
        maintenance.lastCollectiblesAtMs = nowMs;
        const anchorSystems = visibility.visibleSystems.slice(0, 16).map((system) => ({
          x: system.x,
          y: system.y,
        }));
        const maintained = maintainCollectibles({
          collectibles: game.collectibles,
          bounds,
          plane: nextFlight,
          anchorSystems,
          nowMs,
          spawnCounter: game.spawnCounter,
          enableFuel: featureFlags.fuelSystem,
          enableBoosts: featureFlags.pickups,
          fuelRatio: game.fuel / Math.max(game.fuelMax, 1),
          boostActive,
        });
        game.collectibles = maintained.collectibles;
        game.spawnCounter = maintained.spawnCounter;
      }

      const collectibleResult = collectNearbyCollectibles({
        collectibles: game.collectibles,
        plane: nextFlight,
        nowMs,
        fuelRatio: game.fuel / Math.max(game.fuelMax, 1),
      });
      game.collectibles = collectibleResult.collectibles;
      game.effects = [...game.effects, ...collectibleResult.effects];
      const pickupOutcome = applyCollectibleOutcome({
        fuel: game.fuel,
        fuelMax: game.fuelMax,
        boostUntilMs: game.boostUntilMs,
        fuelTanksCollected: game.fuelTanksCollected,
        speedBoostsCollected: game.speedBoostsCollected,
        collectibleResult,
        pickupsEnabled: featureFlags.pickups,
      });
      game.fuel = pickupOutcome.fuel;
      game.boostUntilMs = pickupOutcome.boostUntilMs;
      game.fuelTanksCollected = pickupOutcome.fuelTanksCollected;
      game.speedBoostsCollected = pickupOutcome.speedBoostsCollected;

      const combatOutcome = updateCombatState({
        combat: game.combat,
        flight: nextFlight,
        input: inputSample.flightInput,
        bounds,
        nowMs,
        dtMs,
        qualityMode,
        enabled: featureFlags.dogfights && game.state === "flying",
      });
      if (combatOutcome.effects.length > 0) {
        game.effects = [...game.effects, ...combatOutcome.effects];
      }
      if (combatOutcome.enemiesDefeatedThisTick > 0) {
        game.upgradeCredits +=
          combatOutcome.enemiesDefeatedThisTick * GAME_CONFIG.enemyDefeatCreditValue;
        setPickupNotice(
          combatOutcome.enemiesDefeatedThisTick > 1
            ? "Enemy patrol cleared"
            : "Enemy biplane down",
        );
        window.setTimeout(() => setPickupNotice(null), 1300);
      }
      if (combatOutcome.playerDamageThisTick > 0) {
        setPickupNotice("Incoming fire");
        window.setTimeout(() => setPickupNotice(null), 900);
      }
      if (game.combat.playerHealth <= 0 && game.state === "flying") {
        game.state = "landing";
        game.endReason = "Shot down by enemy patrol";
        game.landingStartedAtMs = nowMs;
      }

      if (
        nowMs - maintenance.lastDeploymentAtMs >= DEPLOYMENT_PROXIMITY_INTERVAL_MS
      ) {
        maintenance.lastDeploymentAtMs = nowMs;
        const nearestDeployment = findNearbyDeployment({
          plane: nextFlight,
          deployments: maintenance.deploymentDocks,
        });
        runtime.nearbyDeploymentId = nearestDeployment?.id ?? null;
      }
      syncGameScore(game);
      game.effects = updateEffects({ effects: game.effects, dtMs });

      runtime.previousFlight = previousFlight;
      runtime.flight = nextFlight;
      runtime.visibility = visibility;
      runtime.input = inputSample.flightInput;
      runtime.effects = game.effects;
      runtime.nowMs = nowMs;
      runtime.pickupNotice = pickupOutcome.pickupLabel;

      if (featureFlags.multiplayerGhosts) {
        if (nowMs - lastMultiplayerBroadcastRef.current >= 80) {
          lastMultiplayerBroadcastRef.current = nowMs;
          multiplayerChannelRef.current?.postMessage({
            type: "flight-state",
            clientId: multiplayerClientIdRef.current,
            callsign: playerCallsign,
            skinId: selectedSkinId,
            flight: {
              x: nextFlight.x,
              y: nextFlight.y,
              heading: nextFlight.heading,
              altitude: nextFlight.altitude,
              speed: nextFlight.speed,
            },
            sentAt: Date.now(),
          });
          for (const [peerId, peer] of multiplayerPeersRef.current) {
            if (nowMs - peer.updatedAtMs > 2_400) {
              multiplayerPeersRef.current.delete(peerId);
            }
          }
          runtime.multiplayerPeers = [...multiplayerPeersRef.current.values()];
        }
      } else {
        multiplayerPeersRef.current.clear();
        runtime.multiplayerPeers = [];
      }

      if (pickupOutcome.pickupLabel) {
        setPickupNotice(pickupOutcome.pickupLabel);
        window.setTimeout(() => setPickupNotice(null), 1300);
      }

      const cameraFollow = computeCameraFollowTarget({
        flight: nextFlight,
        qualityMode,
      });
      if (nowMs - telemetryEmitTsRef.current >= TELEMETRY_EMIT_INTERVAL_MS) {
        telemetryEmitTsRef.current = nowMs;
        const telemetry: FlightTelemetry = {
          ...disclosure,
          plane: {
            x: nextFlight.x,
            y: nextFlight.y,
            heading: nextFlight.heading,
            speed: nextFlight.speed,
            altitude: nextFlight.altitude,
            pitch: nextFlight.pitch,
          },
          camera: {
            x: cameraFollow.x,
            y: cameraFollow.y,
            zoom: runtime.zoom,
          },
        };
        onTelemetryRef.current(telemetry);
      }

      if (nowMs - gameEmitTsRef.current >= GAME_STATE_EMIT_INTERVAL_MS) {
        gameEmitTsRef.current = nowMs;
        const snapshot = {
          ...createSessionSnapshot({
            game,
            nowMs,
            qualityMode,
            featureFlags,
            clusterMarkers: visibility.clusterMarkers,
          }),
          multiplayerPeers: runtime.multiplayerPeers.length,
        };
        onGameStateChangeRef.current?.(snapshot);
        if (game.state === "landed" && !game.runRecorded) {
          game.runRecorded = true;
          setRunEndSnapshot(snapshot);
          onRunCompleteRef.current?.(toRunRecord(game, nowMs));
        }
        const nextSceneRenderSignature = getSceneRenderSignature(runtime);
        if (
          game.state !== "flying" ||
          sceneRenderSignatureRef.current !== nextSceneRenderSignature
        ) {
          sceneRenderSignatureRef.current = nextSceneRenderSignature;
          startTransition(() => setRuntimeVersion((value) => value + 1));
        }
      }

      debugPerfRef.current.frames += 1;
      debugPerfRef.current.ticks += 1;
      if (nowMs - debugPerfRef.current.lastSampleAtMs > 500) {
        const seconds = (nowMs - debugPerfRef.current.lastSampleAtMs) / 1000 || 1;
        const fps = Math.round(debugPerfRef.current.frames / seconds);
        const frameMs = Math.round(dtMs * 10) / 10;
        runtime.performance.fps = fps;
        runtime.performance.frameMs = frameMs;
        if (debugHudVisible) {
          setDebugStats({
            fps,
            frameMs,
            tickRate: Math.round(debugPerfRef.current.ticks / seconds),
            counts: {
              deployments: visibility.visibleSystems.length,
              clusters: activeClusters.length,
              powerUps: game.collectibles.filter((item) => item.active).length,
              clouds: regionClusters.length,
            },
            input: inputSample,
            player: {
              speed: Math.round(nextFlight.speed),
              altitude: Math.round(nextFlight.altitude * 10) / 10,
              verticalVelocity: Math.round(nextFlight.verticalVelocity * 10) / 10,
              pitch: Math.round(nextFlight.pitch * 100) / 100,
              fuel: Math.round(game.fuel),
              boostRemainingMs: Math.max(0, Math.round(game.boostUntilMs - nowMs)),
              distanceUnits: game.distanceUnits,
            },
            lastPickupEvent: pickupOutcome.pickupLabel,
          });
        }
        debugPerfRef.current = { lastSampleAtMs: nowMs, frames: 0, ticks: 0 };
      }
    },
    [
      activeClusters.length,
      bounds,
      clusters,
      debugHudVisible,
      featureFlags,
      flightSettings.mouseSensitivity,
      matchSet,
      playerCallsign,
      qualityMode,
      queueVisibilityRefresh,
      regionClusters.length,
      searchSignature,
      selectedSkinId,
      stationLayout,
      selectedAppName,
      starsBySystem,
      systems,
    ],
  );

  const snapshot = runtimeRef.current;
  useEffect(() => {
    const browserWindow = window as Window & {
      render_game_to_text?: () => string;
      advanceTime?: (ms: number) => void;
    };
    browserWindow.render_game_to_text = () => {
      const runtime = runtimeRef.current;
      return JSON.stringify({
        coordinateSystem: "world x/y map units; y increases south; render uses x/z with altitude y",
        mode: runtime.landedStation ? runtime.playerMode : runtime.game.state,
        landedStation: runtime.landedStation,
        nearbyStation: runtime.nearbyStation
          ? {
              id: runtime.nearbyStation.id,
              kind: runtime.nearbyStation.kind,
              label: runtime.nearbyStation.label,
            }
          : null,
        nearbyDeploymentId: runtime.nearbyDeploymentId,
        counters: {
          deploymentsFound: runtime.game.discoveries.size,
          speedBoosts: runtime.game.speedBoostsCollected,
          fuelTanks: runtime.game.fuelTanksCollected,
          upgradeCredits: runtime.game.upgradeCredits,
          thrusterLevel: runtime.game.thrusterLevel,
          fuelEfficiencyLevel: runtime.game.fuelEfficiencyLevel,
        },
        player: {
          x: Math.round(runtime.flight.x),
          y: Math.round(runtime.flight.y),
          heading: Number(runtime.flight.heading.toFixed(3)),
          speed: Math.round(runtime.flight.speed),
          altitude: Number(runtime.flight.altitude.toFixed(2)),
          pitch: Number(runtime.flight.pitch.toFixed(3)),
          fuel: Math.round(runtime.game.fuel),
          health: Math.round(runtime.game.combat.playerHealth),
        },
        combat: {
          enemiesActive: runtime.game.combat.enemies.filter((enemy) => enemy.active).length,
          enemiesDefeated: runtime.game.combat.enemiesDefeated,
          projectiles: runtime.game.combat.projectiles.length,
          shotsFired: runtime.game.combat.shotsFired,
        },
        weather: {
          severity: Number(runtime.game.weather.severity.toFixed(3)),
          windX: Number(runtime.game.weather.windX.toFixed(3)),
          windY: Number(runtime.game.weather.windY.toFixed(3)),
          lightning: runtime.game.weather.lightningUntilMs > runtime.nowMs,
        },
        performance: runtime.performance,
        multiplayer: {
          clientId: multiplayerClientIdRef.current,
          peers: runtime.multiplayerPeers.map((peer) => ({
            callsign: peer.callsign,
            x: Math.round(peer.x),
            y: Math.round(peer.y),
          })),
        },
        visibleDeployments: runtime.visibility.visibleSystems.length,
        collectibles: runtime.game.collectibles
          .filter((item) => item.active)
          .slice(0, 12)
          .map((item) => ({
            kind: item.kind,
            x: Math.round(item.x),
            y: Math.round(item.y),
          })),
      });
    };
    browserWindow.advanceTime = (ms: number) => {
      const steps = Math.max(1, Math.min(30, Math.round(ms / GAME_CONFIG.fixedStepMs)));
      for (let index = 0; index < steps; index += 1) {
        handleRuntimeTick(GAME_CONFIG.fixedStepMs, runtimeRef.current.nowMs / 1000);
      }
    };
    return () => {
      delete browserWindow.render_game_to_text;
      delete browserWindow.advanceTime;
    };
  }, [handleRuntimeTick]);

  const handleSelectDeployment = useCallback(
    (appName: string, deploymentId: string) => {
      const game = runtimeRef.current.game;
      const discovered = discoverDeployment(game, deploymentId);
      if (discovered) {
        game.upgradeCredits += DEPLOYMENT_CREDIT_VALUE;
        syncGameScore(game);
        setPickupNotice("Deployment discovered");
        window.setTimeout(() => setPickupNotice(null), 1300);
      }
      onSelectApp(appName);
    },
    [onSelectApp],
  );

  const boostLaunchSpeed = () => {
    runtimeRef.current.flight = {
      ...runtimeRef.current.flight,
      speed: Math.max(runtimeRef.current.flight.speed, 240),
    };
  };
  const resetRun = useCallback(() => {
    cancelIdleSceneWork(visibilityWorkHandleRef.current);
    visibilityWorkHandleRef.current = null;
    pendingVisibilityRequestRef.current = null;
    runtimeRef.current.game = createGameState();
    runtimeRef.current.game.runStartedAtMs = performance.now();
    runtimeRef.current.landedStation = null;
    runtimeRef.current.nearbyStation = null;
    runtimeRef.current.nearbyDeploymentId = null;
    runtimeRef.current.playerMode = "flying";
    runtimeRef.current.visibility = EMPTY_VISIBILITY;
    worldMaintenanceRef.current = {
      lastCollectiblesAtMs: 0,
      lastDeploymentAtMs: 0,
      deploymentDocks: [],
    };
    runtimeRef.current.flight = createFlightState(
      bounds.minX + bounds.width / 2,
      bounds.minY + bounds.height / 2,
    );
    runtimeRef.current.flight.speed = 180;
    visibilityUpdateRef.current.lastAtMs = 0;
    telemetryEmitTsRef.current = 0;
    sceneRenderSignatureRef.current = "";
    setRunEndSnapshot(null);
    startTransition(() => setRuntimeVersion((value) => value + 1));
  }, [bounds]);
  const setLandedMode = (mode: PlayerMode) => {
    if (!runtimeRef.current.landedStation) return;
    runtimeRef.current.playerMode = mode;
    startTransition(() => setRuntimeVersion((value) => value + 1));
  };
  useEffect(() => {
    const kickoff = window.setTimeout(() => {
      boostLaunchSpeed();
      focusInputController(inputControllerRef.current);
      wrapRef.current?.focus();
    }, 250);
    return () => window.clearTimeout(kickoff);
  }, []);

  const threeWorld = useMemo(
    () => (
      <ThreeWorld
        runtime={runtimeRef.current}
        runtimeVersion={runtimeVersion}
        clusters={activeClusters}
        regionClusters={regionClusters}
        bounds={bounds}
        systems={systems}
        stars={stars}
        selectedAppName={selectedAppName}
        searchMatches={matchSet}
        stations={stationByClusterId}
        focusTarget={focusTarget}
        cloudsEnabled={featureFlags.clouds}
        weatherEnabled={featureFlags.weather}
        dogfightsEnabled={featureFlags.dogfights}
        multiplayerEnabled={featureFlags.multiplayerGhosts}
        modelsEnabled={RUNTIME_GLB_MODELS_ENABLED}
        responsiveCamera={flightSettings.responsiveCamera}
        qualityMode={qualityMode}
        selectedSkinId={selectedSkinId}
        onSelectDeployment={handleSelectDeployment}
        onFocusCluster={handleFocusCluster}
        onHoverEntity={handleHoverEntity}
        onTick={handleRuntimeTick}
      />
    ),
    [
      activeClusters,
      bounds,
      featureFlags.clouds,
      featureFlags.dogfights,
      featureFlags.multiplayerGhosts,
      featureFlags.weather,
      flightSettings.responsiveCamera,
      focusTarget,
      handleFocusCluster,
      handleHoverEntity,
      handleRuntimeTick,
      handleSelectDeployment,
      matchSet,
      qualityMode,
      regionClusters,
      runtimeVersion,
      selectedAppName,
      selectedSkinId,
      stars,
      stationByClusterId,
      systems,
    ],
  );

  return (
    <section className="scene-shell scene-shell--three">
      <div className={`scene-toolbar ${isCompactLayout ? "scene-toolbar--mobile" : ""}`}>
        <div className="scene-toolbar-group">
          <button
            type="button"
            className="secondary-action"
            onClick={() => {
              setShowSettingsPanel((value) => !value);
            }}
          >
            Flight settings
          </button>
          <button
            type="button"
            className="secondary-action"
            onClick={resetRun}
          >
            New run
          </button>
          {isCompactLayout ? (
            <button
              type="button"
              className="secondary-action scene-toolbar__menu"
              onClick={() => setShowActionMenu(true)}
            >
              Actions
            </button>
          ) : null}
        </div>
      </div>

      <div
        ref={wrapRef}
        className="scene-wrap scene-wrap--three"
        tabIndex={0}
        role="application"
        aria-label="3D FluxCloud flight simulator"
        onPointerEnter={() => focusInputController(inputControllerRef.current)}
        onPointerMove={(event) => {
          if (shouldIgnoreFlightPointer(event.target)) return;
          const rect = event.currentTarget.getBoundingClientRect();
          const normalized = ((event.clientX - rect.left) / Math.max(rect.width, 1) - 0.5) * 2;
          setPointerTurnBias(inputControllerRef.current, normalized);
        }}
        onPointerDown={(event) => {
          if (shouldIgnoreFlightPointer(event.target)) return;
          focusInputController(inputControllerRef.current);
          setMouseSteerActive(inputControllerRef.current, true);
        }}
        onPointerUp={() => setMouseSteerActive(inputControllerRef.current, false)}
        onPointerLeave={() => setMouseSteerActive(inputControllerRef.current, false)}
        onWheel={(event) => {
          const nextZoom = clamp(
            runtimeRef.current.zoom + (event.deltaY > 0 ? -0.025 : 0.025),
            GAME_CONFIG.zoomMin,
            GAME_CONFIG.zoomMax,
          );
          runtimeRef.current.zoom = nextZoom;
        }}
      >
        <Canvas
          className="scene-canvas scene-canvas--three"
          shadows={false}
          camera={{ position: [0, 18, 32], fov: 50, near: 0.1, far: 1800 }}
          dpr={1}
          gl={{
            antialias: false,
            alpha: false,
            stencil: false,
            powerPreference: "high-performance",
          }}
        >
          {threeWorld}
        </Canvas>

        <div
          className={`scene-overlay-layer ${
            runEndSnapshot ? "scene-overlay-layer--modal" : ""
          }`}
          onPointerDown={(event) => event.stopPropagation()}
          onPointerMove={(event) => event.stopPropagation()}
          onWheel={(event) => event.stopPropagation()}
        >
          {hudOverlay}
          {showSettingsPanel ? (
            <FlightSettingsPanel
              open={showSettingsPanel}
              settings={flightSettings}
              featureFlags={featureFlags}
              qualityMode={qualityMode}
              skins={skins}
              selectedSkinId={selectedSkinId}
              onUpdateSettings={onUpdateFlightSettings}
              onUpdateFeatureFlags={onUpdateFeatureFlags}
              onSelectSkin={onSelectSkin}
              onClose={() => setShowSettingsPanel(false)}
            />
          ) : null}
          {selectedAppName ? (
            <SceneDeploymentPanel
              appName={selectedAppName}
              detail={selectedAppDetail}
              loading={selectedAppDetailLoading}
              error={selectedAppDetailError}
              onClose={onClearSelectedApp}
            />
          ) : null}
          <DebugHud visible={debugHudVisible} stats={debugStats} />
          {pickupNotice ? <div className="pickup-notice">{pickupNotice}</div> : null}
          {snapshot.landedStation ? (
            <StationDockPanel
              station={snapshot.landedStation}
              playerMode={snapshot.playerMode}
              game={snapshot.game}
              onExitPlane={() => setLandedMode("onFoot")}
              onEnterPlane={() => setLandedMode("landed")}
              onTakeOff={() => {
                runtimeRef.current.landedStation = null;
                runtimeRef.current.playerMode = "flying";
                runtimeRef.current.flight.speed = Math.max(190, runtimeRef.current.flight.speed);
                startTransition(() => setRuntimeVersion((value) => value + 1));
              }}
            />
          ) : null}
          {runEndSnapshot ? (
            <div className="scene-run-end">
              <p className="scene-run-end__title">{runEndSnapshot.endReason ?? "Run complete"}</p>
              <p className="scene-run-end__copy">
                Score {runEndSnapshot.score.toLocaleString()} with{" "}
                {runEndSnapshot.discoveries.toLocaleString()} discoveries.
              </p>
              <button
                type="button"
                className="primary-action scene-run-end__action"
                onClick={() => {
                  resetRun();
                }}
              >
                Fly again
              </button>
            </div>
          ) : null}
        </div>

        {isCompactLayout ? <TouchFlightPad controllerRef={inputControllerRef} /> : null}
      </div>

      {isCompactLayout ? (
        <MobileDrawer
          open={showActionMenu}
          title="Flight actions"
          description="Tune flight behavior or reset the current run."
          onClose={() => setShowActionMenu(false)}
          placement="bottom"
          className="mobile-drawer--panel"
        >
          <div className="mobile-scene-actions">
            <FlightSettingsPanel
              open
              settings={flightSettings}
              featureFlags={featureFlags}
              qualityMode={qualityMode}
              skins={skins}
              selectedSkinId={selectedSkinId}
              onUpdateSettings={onUpdateFlightSettings}
              onUpdateFeatureFlags={onUpdateFeatureFlags}
              onSelectSkin={onSelectSkin}
              onClose={() => setShowActionMenu(false)}
            />
          </div>
        </MobileDrawer>
      ) : null}

      {mapDataLoading || snapshotError ? (
        <p className={`scene-status ${snapshotError ? "scene-status--error" : ""}`}>
          {snapshotError ? "Snapshot unavailable." : "Loading FluxCloud constellation..."}
        </p>
      ) : null}
    </section>
  );
}

function ThreeWorld({
  runtime,
  runtimeVersion,
  clusters,
  regionClusters,
  bounds,
  systems,
  stars,
  selectedAppName,
  searchMatches,
  stations,
  focusTarget,
  cloudsEnabled,
  weatherEnabled,
  dogfightsEnabled,
  multiplayerEnabled,
  modelsEnabled,
  responsiveCamera,
  qualityMode,
  selectedSkinId,
  onSelectDeployment,
  onFocusCluster,
  onHoverEntity,
  onTick,
}: {
  runtime: SceneRuntime;
  runtimeVersion: number;
  clusters: Cluster[];
  regionClusters: Cluster[];
  bounds: SceneBounds;
  systems: AppSystem[];
  stars: Star[];
  selectedAppName: string | null;
  searchMatches: Set<string>;
  stations: Map<string, StationLayout>;
  focusTarget: CameraTarget | null;
  cloudsEnabled: boolean;
  weatherEnabled: boolean;
  dogfightsEnabled: boolean;
  multiplayerEnabled: boolean;
  modelsEnabled: boolean;
  responsiveCamera: boolean;
  qualityMode: "low" | "medium" | "high";
  selectedSkinId: PlaneSkinId;
  onSelectDeployment: (appName: string, deploymentId: string) => void;
  onFocusCluster: (cluster: Cluster) => void;
  onHoverEntity: (entity: HoveredEntity | null) => void;
  onTick: (dtMs: number, elapsedSeconds: number) => void;
}) {
  const { camera } = useThree();
  const cameraVelocity = useRef(new THREE.Vector3());
  const lookTarget = useRef(new THREE.Vector3());
  const planePosition = useRef(new THREE.Vector3());
  const desiredCamera = useRef(new THREE.Vector3());
  const behindOffset = useRef(new THREE.Vector3());

  useFrame((state, delta) => {
    onTick(Math.min(delta * 1000, GAME_CONFIG.maxFrameMs), state.clock.elapsedTime);
    runtime.performance.drawCalls = state.gl.info.render.calls;
    runtime.performance.triangles = state.gl.info.render.triangles;
    const flight = runtime.flight;
    const flightAltitude = PLANE_ALTITUDE + flight.altitude;
    planePosition.current.set(flight.x * WORLD_SCALE, flightAltitude, flight.y * WORLD_SCALE);
    const zoomRatio =
      (runtime.zoom - GAME_CONFIG.zoomMin) /
      Math.max(GAME_CONFIG.zoomMax - GAME_CONFIG.zoomMin, 0.001);
    const distance = THREE.MathUtils.lerp(42, 22, zoomRatio);
    const height = THREE.MathUtils.lerp(22, 12, zoomRatio) + flight.altitude * 0.52;
    behindOffset.current.set(
      -Math.cos(flight.heading) * distance,
      height,
      -Math.sin(flight.heading) * distance,
    );
    desiredCamera.current.copy(planePosition.current).add(behindOffset.current);
    if (focusTarget && runtime.flight.speed < 5) {
      desiredCamera.current.lerp(
        behindOffset.current.set(
          focusTarget.x * WORLD_SCALE,
          flightAltitude + 18,
          focusTarget.y * WORLD_SCALE,
        ),
        0.08,
      );
    }
    const directionalInput =
      Math.abs(runtime.input.moveX) > 0.01 ||
      Math.abs(runtime.input.moveY) > 0.01 ||
      Math.abs(runtime.input.verticalAxis) > 0.01;
    const followRates = resolveCameraFollowRates({
      responsive: responsiveCamera,
      directionalInput,
      speed: flight.speed,
    });
    const cameraBlend = 1 - Math.exp(-delta * followRates.position);
    cameraVelocity.current.subVectors(desiredCamera.current, camera.position).multiplyScalar(cameraBlend);
    camera.position.add(cameraVelocity.current);
    lookTarget.current.lerp(
      planePosition.current,
      1 - Math.exp(-delta * followRates.look),
    );
    camera.lookAt(lookTarget.current);
  });

  const visibleStars = useMemo(
    () =>
      stars
        .filter((star) => runtime.visibility.detailSystemIds.has(star.systemId))
        .slice(0, MAX_STAR_MARKERS[qualityMode]),
    [qualityMode, runtime.visibility.detailSystemIds, stars],
  );
  const clusterById = useMemo(
    () => new Map(clusters.map((cluster) => [cluster.clusterId, cluster])),
    [clusters],
  );
  const visibleClusters = useMemo(
    () => {
      const visibleClusterIds = new Set<string>();
      for (const system of runtime.visibility.visibleSystems) {
        visibleClusterIds.add(system.regionClusterId);
        visibleClusterIds.add(system.runtimeClusterId);
      }

      const candidates: Cluster[] = [];
      const seen = new Set<string>();
      const pushCluster = (cluster: Cluster | undefined) => {
        if (!cluster || seen.has(cluster.clusterId)) return;
        seen.add(cluster.clusterId);
        candidates.push(cluster);
      };

      for (const cluster of regionClusters) {
        pushCluster(cluster);
      }
      for (const clusterId of visibleClusterIds) {
        pushCluster(clusterById.get(clusterId));
      }

      return candidates
        .map((cluster) => ({
          cluster,
          distance: Math.hypot(cluster.centroid.x - runtime.flight.x, cluster.centroid.y - runtime.flight.y),
        }))
        .sort((left, right) => {
          if (left.cluster.level !== right.cluster.level) {
            return left.cluster.level === "region" ? -1 : 1;
          }
          return left.distance - right.distance;
        })
        .slice(0, MAX_ISLAND_MARKERS[qualityMode])
        .map((item) => item.cluster);
    },
    [clusterById, qualityMode, regionClusters, runtimeVersion],
  );
  return (
    <>
      <color attach="background" args={["#0f4a84"]} />
      <fog attach="fog" args={["#2682c7", 108, 430]} />
      <hemisphereLight args={["#dcf4ff", "#0a3470", 1.52]} />
      <directionalLight
        position={[30, 48, 28]}
        color="#e4f5ff"
        intensity={1.98}
      />
      <ambientLight color="#68adf2" intensity={0.54} />
      <SkyDome cloudsVisible={cloudsEnabled} />
      <CloudFields clusters={regionClusters} qualityMode={qualityMode} visible={cloudsEnabled} />
      <AmbientCloudLayer bounds={bounds} qualityMode={qualityMode} visible={cloudsEnabled} />
      <WeatherLayer runtime={runtime} qualityMode={qualityMode} visible={weatherEnabled} />
      <group>
        {visibleClusters.map((cluster, index) => (
          <CloudIsland
            key={cluster.clusterId}
            cluster={cluster}
            index={index}
            station={stations.get(cluster.clusterId) ?? null}
            onFocusCluster={onFocusCluster}
          />
        ))}
      </group>
      <group>
        <DeploymentMarkerLayer
          systems={runtime.visibility.visibleSystems}
          selectedAppName={selectedAppName}
          searchMatches={searchMatches}
          onSelectDeployment={onSelectDeployment}
          onHoverEntity={onHoverEntity}
        />
        <DeploymentMarkerLabels
          systems={runtime.visibility.visibleSystems}
          flight={runtime.flight}
          selectedAppName={selectedAppName}
          searchMatches={searchMatches}
          qualityMode={qualityMode}
        />
        {visibleStars.map((star) => (
          <StarMarker key={star.id} star={star} onSelectDeployment={onSelectDeployment} />
        ))}
      </group>
      <group>
        {runtime.game.collectibles
          .filter((item) => item.active)
          .map((item) => (
            <CollectibleMesh key={item.id} collectible={item} nowMs={runtime.nowMs} />
          ))}
      </group>
      <Effects effects={runtime.effects} />
      <CombatLayer runtime={runtime} visible={dogfightsEnabled} />
      <MultiplayerGhostLayer runtime={runtime} visible={multiplayerEnabled} />
      <Biplane runtime={runtime} modelsEnabled={modelsEnabled} skinId={selectedSkinId} />
    </>
  );
}

function StationDockPanel({
  station,
  playerMode,
  game,
  onExitPlane,
  onEnterPlane,
  onTakeOff,
}: {
  station: LandingStation;
  playerMode: PlayerMode;
  game: GameState;
  onExitPlane: () => void;
  onEnterPlane: () => void;
  onTakeOff: () => void;
}) {
  const refuelAmount = Math.round(getRefuelAmount(game.discoveries.size, game.fuelMax));
  return (
    <div className={`station-dock station-dock--${station.kind}`} role="dialog" aria-label={station.label}>
      <div className="station-dock__header">
        <span>{playerMode === "flying" ? "Approach" : playerMode}</span>
        <strong>{station.label}</strong>
      </div>
      <div className="station-dock__grid">
        <div>
          <span>Deployment data</span>
          <strong>{game.upgradeCredits}</strong>
        </div>
        <div>
          <span>Discovered</span>
          <strong>{game.discoveries.size}</strong>
        </div>
        <div>
          <span>Fuel service</span>
          <strong>+{refuelAmount}</strong>
        </div>
      </div>
      <p className="station-dock__copy">Refuelling scales with confirmed deployments.</p>
      <div className="station-dock__actions">
        {playerMode === "landed" ? (
          <button type="button" onClick={onExitPlane}>Exit plane</button>
        ) : (
          <button type="button" onClick={onEnterPlane}>Enter plane</button>
        )}
        <button type="button" className="station-dock__takeoff" onClick={onTakeOff}>
          Take off
        </button>
      </div>
    </div>
  );
}

function SceneDeploymentPanel({
  appName,
  detail,
  loading,
  error,
  onClose,
}: {
  appName: string;
  detail: AppDetail | null;
  loading: boolean;
  error: string;
  onClose: () => void;
}) {
  return (
    <aside className="scene-deployment-panel" aria-label="Deployment detail" aria-live="polite">
      <div className="scene-deployment-panel__header">
        <div>
          <span>Deployment</span>
          <strong>{appName}</strong>
        </div>
        <button type="button" className="secondary-action" onClick={onClose}>
          Close
        </button>
      </div>

      {loading ? <p className="scene-deployment-panel__message">Loading deployment data...</p> : null}
      {error ? <p className="scene-deployment-panel__message scene-deployment-panel__message--error">{error}</p> : null}

      {detail ? (
        <>
          <div className="scene-deployment-panel__status">
            <span>{detail.summary.liveStatus}</span>
            <span>{detail.app.runtimeFamily}</span>
            <span>{detail.app.projectCategory}</span>
          </div>
          <p className="scene-deployment-panel__copy">
            {detail.app.description || "No public description was available for this deployment."}
          </p>
          <dl className="scene-deployment-panel__grid">
            <div>
              <dt>Owner</dt>
              <dd>{detail.summary.owner}</dd>
            </div>
            <div>
              <dt>Instances</dt>
              <dd>{detail.summary.instanceCount}</dd>
            </div>
            <div>
              <dt>Resource tier</dt>
              <dd>{detail.app.resourceTier}</dd>
            </div>
            <div>
              <dt>Active nodes</dt>
              <dd>{detail.summary.runtimeUsage.activeNodes}</dd>
            </div>
            <div>
              <dt>CPU</dt>
              <dd>
                {detail.summary.runtimeUsage.estimatedCpuCores !== null
                  ? `${detail.summary.runtimeUsage.estimatedCpuCores} cores`
                  : "Unknown"}
              </dd>
            </div>
            <div>
              <dt>Memory</dt>
              <dd>
                {detail.summary.runtimeUsage.estimatedMemoryMb !== null
                  ? `${detail.summary.runtimeUsage.estimatedMemoryMb} MB`
                  : "Unknown"}
              </dd>
            </div>
          </dl>
          {detail.summary.regions.length > 0 ? (
            <p className="scene-deployment-panel__regions">
              {detail.summary.regions.slice(0, 5).join(", ")}
            </p>
          ) : null}
        </>
      ) : null}
    </aside>
  );
}

function SkyDome({ cloudsVisible }: { cloudsVisible: boolean }) {
  const cloudMap = useMemo(() => getSkyDomeCloudTexture(), []);
  return (
    <mesh scale={[1, 1, 1]} position={[0, -80, 0]} renderOrder={-120}>
      <sphereGeometry args={[520, 16, 8]} />
      <meshBasicMaterial
        side={THREE.BackSide}
        color={cloudsVisible ? "#ffffff" : "#155b99"}
        map={cloudsVisible ? cloudMap : null}
        depthWrite={false}
      />
    </mesh>
  );
}

type CloudInstance = {
  x: number;
  y: number;
  z: number;
  scale: number;
  rotation: number;
};

function InstancedCloudLayer({
  clouds,
  visible,
}: {
  clouds: CloudInstance[];
  visible: boolean;
}) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const cloudMap = useMemo(() => getSoftCloudTexture(), []);
  const dummy = useMemo(() => new THREE.Object3D(), []);

  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;

    for (let index = 0; index < clouds.length; index += 1) {
      const cloud = clouds[index];
      dummy.position.set(cloud.x, cloud.y, cloud.z);
      dummy.rotation.set(-Math.PI / 2, 0, cloud.rotation);
      dummy.scale.setScalar(cloud.scale);
      dummy.updateMatrix();
      mesh.setMatrixAt(index, dummy.matrix);
    }
    mesh.count = clouds.length;
    mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [clouds, dummy]);

  return (
    <instancedMesh
      ref={meshRef}
      args={[undefined, undefined, Math.max(1, clouds.length)]}
      visible={visible}
      renderOrder={-20}
    >
      <planeGeometry args={[8.6, 4.12]} />
      <meshBasicMaterial
        map={cloudMap}
        alphaMap={cloudMap}
        color="#f1fbff"
        transparent
        opacity={0.94}
        depthWrite={false}
        depthTest
        toneMapped={false}
        side={THREE.DoubleSide}
      />
    </instancedMesh>
  );
}

function CloudFields({
  clusters,
  qualityMode,
  visible,
}: {
  clusters: Cluster[];
  qualityMode: "low" | "medium" | "high";
  visible: boolean;
}) {
  const clouds = useMemo<CloudInstance[]>(() => {
    const layeredOffsets =
      qualityMode === "low"
        ? [
            [0, 0, 1],
            [7.5, -4.5, 0.72],
          ]
        : qualityMode === "medium"
          ? [
              [0, 0, 1],
              [7.5, -4.5, 0.76],
              [-6.25, 5.75, 0.64],
            ]
          : [
              [0, 0, 1],
              [7.5, -4.5, 0.78],
              [-6.25, 5.75, 0.68],
              [13, 4.25, 0.54],
            ];
    const next: CloudInstance[] = [];
    clusters.slice(0, CLOUD_FIELD_MARKERS[qualityMode]).forEach((cluster, index) => {
      layeredOffsets.forEach(([offsetX, offsetY, scaleFactor], layerIndex) => {
        next.push({
          x: (cluster.centroid.x + offsetX * 70) * WORLD_SCALE,
          y: -4.4 - ((index + layerIndex) % 6) * 0.28,
          z: (cluster.centroid.y + offsetY * 70) * WORLD_SCALE,
          scale:
            (3.2 + Math.min(8.4, cluster.radius * WORLD_SCALE * 0.09)) *
            scaleFactor,
          rotation: ((index + layerIndex) % 4) * 0.18,
        });
      });
    });
    return next;
  }, [clusters, qualityMode]);

  return <InstancedCloudLayer clouds={clouds} visible={visible} />;
}

function AmbientCloudLayer({
  bounds,
  qualityMode,
  visible,
}: {
  bounds: SceneBounds;
  qualityMode: "low" | "medium" | "high";
  visible: boolean;
}) {
  const count = qualityMode === "low" ? 24 : qualityMode === "medium" ? 40 : 64;
  const clouds = useMemo(
    () => {
      const centerX = bounds.minX + bounds.width / 2;
      const centerY = bounds.minY + bounds.height / 2;
      const width = Math.min(Math.max(bounds.width * 0.72, 2_600), 4_200);
      const height = Math.min(Math.max(bounds.height * 0.68, 1_900), 3_450);
      const columns = Math.max(8, Math.ceil(Math.sqrt(count * (width / height))));
      const rows = Math.max(5, Math.ceil(count / columns));
      return Array.from({ length: count }, (_, index) => {
        const column = index % columns;
        const row = Math.floor(index / columns);
        const jitterX = (((index * 73) % 100) - 50) / 100;
        const jitterY = (((index * 47) % 100) - 50) / 100;
        return {
          x:
            (centerX - width / 2 +
              ((column + 0.5 + jitterX * 0.56) / columns) * width) *
            WORLD_SCALE,
          y: -3.3 - (index % 6) * 0.2,
          z:
            (centerY - height / 2 +
              ((row + 0.5 + jitterY * 0.5) / rows) * height) *
            WORLD_SCALE,
          scale: 1.18 + ((index * 37) % 100) / 105,
          rotation: (index % 4) * 0.18,
        };
      }).flatMap((cloud, index) => {
        const instances: CloudInstance[] = [cloud];
        if (index % 4 === 0) {
          instances.push({
            ...cloud,
            x: cloud.x + 2.4,
            y: cloud.y + 0.18,
            z: cloud.z - 0.2,
            scale: cloud.scale * 1.28,
            rotation: ((index + 2) % 4) * 0.18,
          });
        }
        if (index % 7 === 0) {
          instances.push({
            ...cloud,
            x: cloud.x - 3.8,
            y: cloud.y + 0.1,
            z: cloud.z + 0.34,
            scale: cloud.scale * 0.86,
            rotation: ((index + 1) % 4) * 0.18,
          });
        }
        return instances;
      });
    },
    [bounds.height, bounds.minX, bounds.minY, bounds.width, count],
  );

  return <InstancedCloudLayer clouds={clouds} visible={visible} />;
}

function CloudPuff({ scale = 1, variant = 0 }: { scale?: number; variant?: number }) {
  const cloudMap = useMemo(() => getSoftCloudTexture(), []);
  const rotation = variant * 0.18;
  return (
    <sprite scale={[scale * 8.6, scale * 4.12, 1]} renderOrder={-20}>
      <spriteMaterial
        map={cloudMap}
        alphaMap={cloudMap}
        color="#f1fbff"
        transparent
        opacity={0.98}
        rotation={rotation}
        depthWrite={false}
        depthTest
        toneMapped={false}
      />
    </sprite>
  );
}

function RuntimeModelAsset({
  modelId,
  targetSize,
  position = [0, 0, 0],
  rotation = [0, 0, 0],
  fallback,
  prepareModel,
}: {
  modelId: RuntimeModelId;
  targetSize?: number;
  position?: [number, number, number];
  rotation?: [number, number, number];
  fallback?: ReactNode;
  prepareModel?: (root: THREE.Object3D) => void;
}) {
  const config = getRuntimeModelConfig(modelId);
  const [asset, setAsset] = useState<RuntimeModelLoadState>(() => {
    const cached = runtimeModelCache.get(modelId);
    return cached?.status === "ready"
      ? { status: "ready", scene: cached.scene }
      : cached?.status === "error"
        ? { status: "error", scene: null }
        : { status: "idle", scene: null };
  });

  useEffect(() => {
    let cancelled = false;
    const cached = runtimeModelCache.get(modelId);
    if (cached?.status === "ready") {
      setAsset({ status: "ready", scene: cached.scene });
      return;
    }
    if (cached?.status === "error") {
      setAsset({ status: "error", scene: null });
      return;
    }

    setAsset({ status: "loading", scene: null });
    scheduleIdleModelLoad(() => {
      if (cancelled) return;
      const entry = requestRuntimeModel(modelId);
      if (entry.status === "ready") {
        setAsset({ status: "ready", scene: entry.scene });
        return;
      }
      if (entry.status === "error") {
        setAsset({ status: "error", scene: null });
        return;
      }
      entry.promise
        .then((scene) => {
          if (!cancelled) setAsset({ status: "ready", scene });
        })
        .catch(() => {
          if (!cancelled) setAsset({ status: "error", scene: null });
        });
    });

    return () => {
      cancelled = true;
    };
  }, [modelId]);

  const normalized = useMemo(() => {
    if (asset.status !== "ready") return null;
    const root = cloneSkeleton(asset.scene);
    const box = new THREE.Box3().setFromObject(root);
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);
    const maxDimension = Math.max(size.x, size.y, size.z, 0.001);
    const scale = (targetSize ?? config.scale) / maxDimension;
    const bottomY = box.min.y;

    root.position.set(-center.x * scale, -bottomY * scale + config.groundOffset, -center.z * scale);
    root.scale.setScalar(scale);
    root.rotation.y += config.rotationY;
    root.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.castShadow = false;
        child.receiveShadow = true;
        child.frustumCulled = true;
        child.geometry.computeBoundingSphere();
      }
    });
    prepareModel?.(root);
    return root;
  }, [asset, config.groundOffset, config.rotationY, config.scale, prepareModel, targetSize]);

  if (!normalized) {
    return <>{fallback}</>;
  }

  return (
    <group position={position} rotation={rotation}>
      <primitive object={normalized} />
    </group>
  );
}

function RuntimeModel(props: {
  modelId: RuntimeModelId;
  targetSize?: number;
  position?: [number, number, number];
  rotation?: [number, number, number];
  fallback?: ReactNode;
  prepareModel?: (root: THREE.Object3D) => void;
}) {
  return <RuntimeModelAsset {...props} />;
}

function StationStructure({
  radius,
  index,
}: {
  radius: number;
  index: number;
}) {
  const color = "#64e5ff";
  const accent = "#54f0a8";
  return (
    <group
      position={[radius * 0.08, 0.38, radius * -0.04]}
      rotation={[0, index * 0.72, 0]}
      userData={{ modelId: "proceduralStation" }}
    >
      <StationFallback radius={radius} color={color} accent={accent} />
    </group>
  );
}

function StationFallback({ radius, color, accent }: { radius: number; color: string; accent: string }) {
  return (
    <>
      <mesh position={[0, 0.22, 0]}>
        <cylinderGeometry args={[radius * 0.38, radius * 0.48, 0.42, 28]} />
        <meshStandardMaterial color="#2bc7ff" emissive={color} emissiveIntensity={0.28} roughness={0.38} metalness={0.16} />
      </mesh>
      <mesh position={[0, 0.82, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[radius * 0.38, 0.07, 8, 36]} />
        <meshStandardMaterial color="#55ecff" emissive={accent} emissiveIntensity={0.48} roughness={0.3} metalness={0.08} />
      </mesh>
      <group position={[0, 1.14, 0]}>
        <mesh rotation={[0, 0, Math.PI / 2]}>
          <capsuleGeometry args={[radius * 0.17, radius * 0.56, 8, 16]} />
          <meshStandardMaterial color="#e9fbff" emissive="#45d4ff" emissiveIntensity={0.18} roughness={0.32} />
        </mesh>
        <mesh position={[radius * 0.36, 0, 0]}>
          <sphereGeometry args={[radius * 0.16, 16, 10]} />
          <meshStandardMaterial color="#54f0a8" emissive="#54f0a8" emissiveIntensity={0.35} roughness={0.3} />
        </mesh>
      </group>
    </>
  );
}

function CloudIsland({
  cluster,
  index,
  station,
  onFocusCluster,
}: {
  cluster: Cluster;
  index: number;
  station: StationLayout | null;
  onFocusCluster: (cluster: Cluster) => void;
}) {
  const position = to3(cluster.centroid, ISLAND_ALTITUDE + (index % 5) * 0.12);
  const baseRadius = clamp(cluster.radius * WORLD_SCALE * 0.38, 3.4, cluster.level === "region" ? 10 : 6.5);
  const radius = station ? Math.max(baseRadius, 6.8) : baseRadius;
  return (
    <group position={position} onClick={() => scheduleSceneAction(() => onFocusCluster(cluster))}>
      <CloudPuff scale={radius * 0.38} variant={index % 4} />
      {station ? (
        <StationStructure
          radius={radius}
          index={index}
        />
      ) : null}
      <BillboardGroup position={[0, radius * 0.08 + 2.6, 0]}>
        <BeaconPlaque color={cluster.level === "region" ? "#61d7ff" : "#9b82ff"} />
      </BillboardGroup>
    </group>
  );
}

function DeploymentMarkerLayer({
  systems,
  selectedAppName,
  searchMatches,
  onSelectDeployment,
  onHoverEntity,
}: {
  systems: AppSystem[];
  selectedAppName: string | null;
  searchMatches: Set<string>;
  onSelectDeployment: (appName: string, deploymentId: string) => void;
  onHoverEntity: (entity: HoveredEntity | null) => void;
}) {
  const visibleSystems = systems.slice(0, DEPLOYMENT_MARKER_INSTANCE_CAP);
  return (
    <group>
      {DEPLOYMENT_MARKER_SLOT_IDS.map((slotIndex) => {
        const system = visibleSystems[slotIndex] ?? null;
        return (
          <DeploymentMarkerSlot
            key={slotIndex}
            system={system}
            selected={
              system ? system.appName === selectedAppName || searchMatches.has(system.appName) : false
            }
            index={slotIndex}
            onSelectDeployment={onSelectDeployment}
            onHoverEntity={onHoverEntity}
          />
        );
      })}
    </group>
  );
}

function DeploymentMarkerSlot({
  system,
  selected,
  index,
  onSelectDeployment,
  onHoverEntity,
}: {
  system: AppSystem | null;
  selected: boolean;
  index: number;
  onSelectDeployment: (appName: string, deploymentId: string) => void;
  onHoverEntity: (entity: HoveredEntity | null) => void;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const mountProgressRef = useRef(1);
  const systemIdRef = useRef<string | null>(null);
  const colorway = system ? getBuoyColorway(system) : DEFAULT_DEPLOYMENT_COLORWAY;

  useFrame((state, delta) => {
    const group = groupRef.current;
    if (!group) return;

    if (!system) {
      group.visible = false;
      systemIdRef.current = null;
      mountProgressRef.current = 1;
      return;
    }

    if (systemIdRef.current !== system.systemId) {
      systemIdRef.current = system.systemId;
      mountProgressRef.current = 0.72;
    }

    const bob = Math.sin(state.clock.elapsedTime * 1.25 + index * 0.83) * 0.24;
    const spin = Math.sin(state.clock.elapsedTime * 0.34 + index) * 0.08;
    mountProgressRef.current = Math.min(1, mountProgressRef.current + delta * 2.2);
    group.visible = true;
    group.position.set(
      system.x * WORLD_SCALE,
      ISLAND_ALTITUDE + 6.1 + (index % 4) * 0.08 + bob,
      system.y * WORLD_SCALE,
    );
    group.rotation.y = spin;
    group.scale.setScalar(0.5 + mountProgressRef.current * 0.5);

  });

  return (
    <group
      ref={groupRef}
      visible={Boolean(system)}
      onClick={(event: ThreeEvent<MouseEvent>) => {
        if (!system) return;
        event.stopPropagation();
        scheduleSceneAction(() => onSelectDeployment(system.appName, system.systemId));
      }}
      onPointerOver={(event: ThreeEvent<PointerEvent>) => {
        if (!system) return;
        event.stopPropagation();
        document.body.style.cursor = "pointer";
        onHoverEntity({
          kind: "system",
          id: system.systemId,
          discoveryId: system.systemId,
          label: system.label,
          subtitle: `${system.runtimeFamily} | ${system.projectCategory}`,
          appName: system.appName,
        });
      }}
      onPointerOut={() => {
        document.body.style.cursor = "";
        onHoverEntity(null);
      }}
    >
      <DeploymentFallback selected={selected} colorway={colorway} />
    </group>
  );
}

function DeploymentFallback({
  selected,
  colorway,
}: {
  selected: boolean;
  colorway: ReturnType<typeof getBuoyColorway>;
}) {
  return (
    <>
      <mesh position={[0, -0.42, 0]}>
        <sphereGeometry args={[selected ? 0.82 : 0.7, 10, 8]} />
        <meshStandardMaterial
          color={selected ? "#d9f6ff" : "#9eb4c9"}
          emissive={selected ? colorway.beacon : "#2a8ce8"}
          emissiveIntensity={selected ? 0.78 : 0.34}
          metalness={0.72}
          roughness={0.28}
        />
      </mesh>
      <mesh position={[0, -1.08, 0]}>
        <cylinderGeometry args={[0.92, 1.12, 0.18, 10]} />
        <meshStandardMaterial color="#5ed8ff" emissive={colorway.beacon} emissiveIntensity={0.38} roughness={0.42} metalness={0.18} />
      </mesh>
    </>
  );
}

function DeploymentMarkerLabels({
  systems,
  flight,
  selectedAppName,
  searchMatches,
  qualityMode,
}: {
  systems: AppSystem[];
  flight: FlightState;
  selectedAppName: string | null;
  searchMatches: Set<string>;
  qualityMode: "low" | "medium" | "high";
}) {
  const labeledSystems = useMemo(() => {
    const cap = DEPLOYMENT_LABEL_CAP[qualityMode];
    const selectedOrMatched = systems.filter(
      (system) => system.appName === selectedAppName || searchMatches.has(system.appName),
    );
    const nearby = [...systems]
      .sort((left, right) => {
        const leftDistance = Math.hypot(left.x - flight.x, left.y - flight.y);
        const rightDistance = Math.hypot(right.x - flight.x, right.y - flight.y);
        return leftDistance - rightDistance;
      });
    return mergeSystemsById(selectedOrMatched, nearby).slice(0, cap);
  }, [flight.x, flight.y, qualityMode, searchMatches, selectedAppName, systems]);

  return (
    <group>
      {labeledSystems.map((system, index) => {
        const colorway = getBuoyColorway(system);
        const selected = system.appName === selectedAppName || searchMatches.has(system.appName);
        return (
          <BillboardGroup
            key={system.systemId}
            position={[
              system.x * WORLD_SCALE,
              ISLAND_ALTITUDE + 8.82 + (index % 4) * 0.08,
              system.y * WORLD_SCALE,
            ]}
          >
            <BeaconPlaque
              color={colorway.beacon}
              compact
              selected={selected}
              label={system.appName}
              subtitle={`${system.runtimeFamily} | ${categoryLabel(system)}`}
            />
          </BillboardGroup>
        );
      })}
    </group>
  );
}

function StarMarker({
  star,
  onSelectDeployment,
}: {
  star: Star;
  onSelectDeployment: (appName: string, deploymentId: string) => void;
}) {
  const position = to3(star, ISLAND_ALTITUDE + 4.2);
  return (
    <mesh
      position={position}
      onClick={() => scheduleSceneAction(() => onSelectDeployment(star.appName, star.systemId))}
    >
      <sphereGeometry args={[clamp(star.size * 0.08, 0.1, 0.32), 12, 8]} />
      <meshStandardMaterial color="#c7f4ff" emissive="#48bcff" emissiveIntensity={0.8} />
    </mesh>
  );
}

function CollectibleMesh({ collectible, nowMs }: { collectible: Collectible; nowMs: number }) {
  const bob = Math.sin(nowMs / 360 + collectible.bobSeed) * 0.35;
  const position = to3(collectible, PLANE_ALTITUDE + 1.2 + bob);
  const spin = nowMs / 800 + collectible.spinSeed;

  if (collectible.kind === "boost") {
    const pulse = 1 + Math.sin(nowMs / 240 + collectible.spinSeed) * 0.08;
    return (
      <BillboardGroup position={position}>
        <group scale={pulse}>
          <mesh position={[0, 0, -0.03]}>
            <circleGeometry args={[0.86, 28]} />
            <meshBasicMaterial color="#8beeff" transparent opacity={0.26} depthWrite={false} />
          </mesh>
          <mesh>
            <shapeGeometry args={[BOOST_BOLT_SHAPE]} />
            <meshStandardMaterial
              color="#ffed8a"
              emissive="#ffe14a"
              emissiveIntensity={1.25}
              roughness={0.26}
              metalness={0.08}
            />
          </mesh>
        </group>
      </BillboardGroup>
    );
  }

  return (
    <group position={position} rotation={[0, spin, 0]} scale={1.18}>
      <mesh position={[0, 0, 0]}>
        <boxGeometry args={[0.82, 1.05, 0.42]} />
        <meshStandardMaterial color="#ff413a" emissive="#ff5948" emissiveIntensity={0.5} roughness={0.32} metalness={0.06} />
      </mesh>
      <mesh position={[0, 0.08, 0.235]}>
        <boxGeometry args={[0.48, 0.42, 0.035]} />
        <meshStandardMaterial color="#fff5df" emissive="#ffe0b4" emissiveIntensity={0.24} roughness={0.26} />
      </mesh>
      <mesh position={[0.24, 0.64, 0]} rotation={[0, 0, -0.28]}>
        <boxGeometry args={[0.46, 0.18, 0.46]} />
        <meshStandardMaterial color="#ffd65d" emissive="#ffbf38" emissiveIntensity={0.45} roughness={0.28} />
      </mesh>
      <mesh position={[-0.22, 0.62, 0]} rotation={[0, 0, 0.42]}>
        <torusGeometry args={[0.22, 0.045, 8, 18]} />
        <meshStandardMaterial color="#ffd65d" emissive="#ffbf38" emissiveIntensity={0.34} roughness={0.28} />
      </mesh>
    </group>
  );
}

function Effects({ effects }: { effects: VisualEffect[] }) {
  return (
    <group>
      {effects.map((effect) => {
        const progress = clamp(effect.ageMs / Math.max(effect.ttlMs, 1), 0, 1);
        return (
          <mesh key={effect.id} position={to3(effect, PLANE_ALTITUDE + 0.4 + progress * 0.7)}>
            <sphereGeometry args={[effect.size * WORLD_SCALE * (0.6 + progress), 12, 8]} />
            <meshBasicMaterial color={effect.color} transparent opacity={1 - progress} />
          </mesh>
        );
      })}
    </group>
  );
}

function WeatherLayer({
  runtime,
  qualityMode,
  visible,
}: {
  runtime: SceneRuntime;
  qualityMode: QualityMode;
  visible: boolean;
}) {
  const rainRef = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const rainCount = qualityMode === "low" ? 42 : qualityMode === "medium" ? 76 : 112;
  const drops = useMemo(
    () =>
      Array.from({ length: rainCount }, (_, index) => ({
        x: ((index * 83) % 1000) / 1000,
        z: ((index * 47) % 1000) / 1000,
        y: ((index * 131) % 1000) / 1000,
        speed: 0.7 + ((index * 29) % 100) / 160,
      })),
    [rainCount],
  );

  useFrame(() => {
    const mesh = rainRef.current;
    if (!mesh) return;
    const weather = runtime.game.weather;
    const count = visible && weather.severity > 0.035 ? drops.length : 0;
    mesh.count = count;
    const flight = runtime.flight;
    const span = qualityMode === "low" ? 44 : qualityMode === "medium" ? 58 : 72;
    const time = runtime.nowMs / 1000;

    for (let index = 0; index < count; index += 1) {
      const drop = drops[index];
      const driftX = weather.windX * 7;
      const driftZ = weather.windY * 7;
      const x = (flight.x * WORLD_SCALE) + (drop.x - 0.5) * span + driftX;
      const z = (flight.y * WORLD_SCALE) + (drop.z - 0.5) * span + driftZ;
      const fall = ((drop.y - time * drop.speed) % 1 + 1) % 1;
      const y = PLANE_ALTITUDE + 17 - fall * 22;
      dummy.position.set(x, y, z);
      dummy.rotation.set(0.42, 0, -0.22 + weather.windX * 0.1);
      dummy.scale.setScalar(0.68 + weather.severity * 0.54);
      dummy.updateMatrix();
      mesh.setMatrixAt(index, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  });

  return (
    <group visible={visible}>
      {runtime.game.weather.cells.map((cell) => (
        <WeatherCellMesh key={cell.id} cell={cell} runtime={runtime} />
      ))}
      <instancedMesh ref={rainRef} args={[undefined, undefined, rainCount]}>
        <boxGeometry args={[0.035, 1.28, 0.035]} />
        <meshBasicMaterial
          color="#d9f7ff"
          transparent
          opacity={0.36}
          depthWrite={false}
          toneMapped={false}
        />
      </instancedMesh>
      <WeatherFlash runtime={runtime} />
    </group>
  );
}

function WeatherCellMesh({
  cell,
  runtime,
}: {
  cell: GameState["weather"]["cells"][number];
  runtime: SceneRuntime;
}) {
  const groupRef = useRef<THREE.Group>(null);
  useFrame(() => {
    const group = groupRef.current;
    if (!group) return;
    group.position.set(cell.x * WORLD_SCALE, PLANE_ALTITUDE - 5.2, cell.y * WORLD_SCALE);
    const pulse = 1 + Math.sin(runtime.nowMs / 1_500 + cell.phase) * 0.04;
    group.scale.setScalar(pulse);
  });

  const color = cell.kind === "storm" ? "#2d76ff" : cell.kind === "gust" ? "#7fffd1" : "#b9f2ff";
  const opacity = cell.kind === "storm" ? 0.16 : cell.kind === "gust" ? 0.1 : 0.075;
  return (
    <group ref={groupRef}>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[cell.radius * WORLD_SCALE, 36]} />
        <meshBasicMaterial color={color} transparent opacity={opacity} depthWrite={false} />
      </mesh>
    </group>
  );
}

function WeatherFlash({ runtime }: { runtime: SceneRuntime }) {
  const lightRef = useRef<THREE.PointLight>(null);
  useFrame(() => {
    const light = lightRef.current;
    if (!light) return;
    const active = runtime.game.weather.lightningUntilMs > runtime.nowMs;
    light.intensity = active ? 7.5 : 0;
    const storm = runtime.game.weather.cells.find((cell) => cell.kind === "storm");
    if (storm) {
      light.position.set(storm.x * WORLD_SCALE, PLANE_ALTITUDE + 26, storm.y * WORLD_SCALE);
    }
  });
  return <pointLight ref={lightRef} color="#dff6ff" intensity={0} distance={140} />;
}

function CombatLayer({ runtime, visible }: { runtime: SceneRuntime; visible: boolean }) {
  return (
    <group visible={visible}>
      {runtime.game.combat.enemies.map((enemy) => (
        <EnemyBiplane key={enemy.id} enemy={enemy} />
      ))}
      <ProjectileInstances runtime={runtime} owner="player" />
      <ProjectileInstances runtime={runtime} owner="enemy" />
    </group>
  );
}

function EnemyBiplane({ enemy }: { enemy: GameState["combat"]["enemies"][number] }) {
  const groupRef = useRef<THREE.Group>(null);
  const palette = planeSkinPalettes["mint-radar"];
  useFrame(() => {
    const group = groupRef.current;
    if (!group) return;
    group.visible = enemy.active;
    if (!enemy.active) return;
    group.position.set(enemy.x * WORLD_SCALE, PLANE_ALTITUDE + 0.4, enemy.y * WORLD_SCALE);
    group.rotation.set(0.05, -enemy.heading + Math.PI / 2, 0);
  });

  return (
    <group ref={groupRef} scale={0.62}>
      <EnemyBiplaneFallback palette={palette} />
    </group>
  );
}

function EnemyBiplaneFallback({ palette }: { palette: PlaneSkinPalette }) {
  return (
    <group scale={1.42}>
      <mesh rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.38, 0.48, 2.8, 12]} />
        <meshStandardMaterial
          color={palette.body}
          emissive={palette.bodyHi}
          emissiveIntensity={0.24}
          roughness={0.38}
        />
      </mesh>
      <mesh position={[0, 0.18, 0]}>
        <boxGeometry args={[5.4, 0.2, 0.92]} />
        <meshStandardMaterial color={palette.wing} roughness={0.36} />
      </mesh>
      <mesh position={[0, 1.0, -0.05]}>
        <boxGeometry args={[5.0, 0.18, 0.82]} />
        <meshStandardMaterial color={palette.wingHi} roughness={0.36} />
      </mesh>
    </group>
  );
}

function ProjectileInstances({
  runtime,
  owner,
}: {
  runtime: SceneRuntime;
  owner: "player" | "enemy";
}) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  useFrame(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const projectiles = runtime.game.combat.projectiles.filter(
      (projectile) => projectile.owner === owner,
    );
    mesh.count = projectiles.length;
    for (let index = 0; index < projectiles.length; index += 1) {
      const projectile = projectiles[index];
      dummy.position.set(projectile.x * WORLD_SCALE, PLANE_ALTITUDE + 0.55, projectile.y * WORLD_SCALE);
      dummy.scale.setScalar(owner === "player" ? 1 : 0.8);
      dummy.updateMatrix();
      mesh.setMatrixAt(index, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, GAME_CONFIG.maxProjectiles]}>
      <sphereGeometry args={[owner === "player" ? 0.16 : 0.13, 8, 6]} />
      <meshBasicMaterial
        color={owner === "player" ? "#ffe986" : "#7cff9c"}
        transparent
        opacity={0.94}
        toneMapped={false}
      />
    </instancedMesh>
  );
}

function MultiplayerGhostLayer({
  runtime,
  visible,
}: {
  runtime: SceneRuntime;
  visible: boolean;
}) {
  return (
    <group visible={visible}>
      {runtime.multiplayerPeers.slice(0, 6).map((peer) => (
        <GhostBiplane key={peer.id} peer={peer} />
      ))}
    </group>
  );
}

function GhostBiplane({ peer }: { peer: MultiplayerPeer }) {
  const groupRef = useRef<THREE.Group>(null);
  useFrame(() => {
    const group = groupRef.current;
    if (!group) return;
    group.position.set(peer.x * WORLD_SCALE, PLANE_ALTITUDE + peer.altitude + 0.8, peer.y * WORLD_SCALE);
    group.rotation.set(0, -peer.heading + Math.PI / 2, 0);
  });
  return (
    <group ref={groupRef} scale={0.86}>
      <mesh rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.28, 0.36, 2.35, 16]} />
        <meshBasicMaterial color="#9fd2ff" transparent opacity={0.38} />
      </mesh>
      <mesh position={[0, 0.12, 0]}>
        <boxGeometry args={[4.5, 0.13, 0.78]} />
        <meshBasicMaterial color="#9fd2ff" transparent opacity={0.32} />
      </mesh>
      <mesh position={[0, 0.76, -0.02]}>
        <boxGeometry args={[4.1, 0.12, 0.68]} />
        <meshBasicMaterial color="#d7efff" transparent opacity={0.28} />
      </mesh>
    </group>
  );
}

function Biplane({
  runtime,
  modelsEnabled,
  skinId,
}: {
  runtime: SceneRuntime;
  modelsEnabled: boolean;
  skinId: PlaneSkinId;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const flight = runtime.flight;
  const palette = planeSkinPalettes[skinId] ?? planeSkinPalettes.classic;
  const tintBiplaneModel = useCallback(
    (root: THREE.Object3D) => {
      root.traverse((child) => {
        if (!(child instanceof THREE.Mesh)) return;

        const materials = Array.isArray(child.material) ? child.material : [child.material];
        const tintedMaterials = materials.map((material) => {
          if (!(material instanceof THREE.MeshStandardMaterial)) return material;

          const role = getBiplaneMaterialRole(child.name, material.name);
          const tint =
            role === "cockpit"
              ? "#eef6ff"
              : role === "prop"
                ? palette.prop
                : palette[role];
          const nextMaterial = material.clone();
          nextMaterial.color = new THREE.Color(tint);
          if (role === "cockpit") {
            nextMaterial.transparent = true;
            nextMaterial.opacity = 0.72;
            nextMaterial.roughness = 0.18;
            nextMaterial.metalness = 0.05;
          } else {
            nextMaterial.roughness = role === "trim" ? 0.5 : 0.34;
            nextMaterial.metalness = role === "trim" ? 0.08 : 0.04;
          }
          return nextMaterial;
        });

        child.material = Array.isArray(child.material) ? tintedMaterials : tintedMaterials[0];
      });
    },
    [palette],
  );
  useFrame(() => {
    const group = groupRef.current;
    if (!group) return;
    const latestFlight = runtime.flight;
    group.position.set(
      latestFlight.x * WORLD_SCALE,
      PLANE_ALTITUDE + latestFlight.altitude,
      latestFlight.y * WORLD_SCALE,
    );
    group.rotation.set(latestFlight.pitch, -latestFlight.heading + Math.PI / 2, 0);
  });

  if (modelsEnabled) {
    return (
      <group
        ref={groupRef}
        position={[flight.x * WORLD_SCALE, PLANE_ALTITUDE + flight.altitude, flight.y * WORLD_SCALE]}
        rotation={[flight.pitch, -flight.heading + Math.PI / 2, 0]}
      >
        <RuntimeModel
          modelId="biplane"
          fallback={<BiplaneFallback palette={palette} />}
          prepareModel={tintBiplaneModel}
        />
      </group>
    );
  }

  return (
    <group
      ref={groupRef}
      position={[flight.x * WORLD_SCALE, PLANE_ALTITUDE + flight.altitude, flight.y * WORLD_SCALE]}
      rotation={[flight.pitch, -flight.heading + Math.PI / 2, 0]}
    >
      <BiplaneFallback palette={palette} />
    </group>
  );
}

function BiplaneFallback({
  palette,
}: {
  palette: (typeof planeSkinPalettes)[keyof typeof planeSkinPalettes];
}) {
  return (
    <group scale={1.42}>
      <group>
      <mesh castShadow rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.38, 0.48, 2.8, 20]} />
        <meshStandardMaterial color={palette.body} roughness={0.35} metalness={0.08} />
      </mesh>
      <mesh castShadow position={[0, 0.08, -1.52]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.46, 0.34, 0.34, 24]} />
        <meshStandardMaterial color={palette.bodyHi} roughness={0.3} metalness={0.08} />
      </mesh>
      <mesh castShadow position={[0, 0.18, 0]}>
        <boxGeometry args={[5.4, 0.2, 0.92]} />
        <meshStandardMaterial color={palette.wing} roughness={0.34} />
      </mesh>
      <mesh castShadow position={[0, 1.0, -0.05]}>
        <boxGeometry args={[5.0, 0.18, 0.82]} />
        <meshStandardMaterial color={palette.wingHi} roughness={0.34} />
      </mesh>
      <mesh castShadow position={[-2.55, 0.58, -0.04]} rotation={[0, 0, 0.12]}>
        <cylinderGeometry args={[0.035, 0.035, 1.22, 8]} />
        <meshStandardMaterial color={palette.trim} roughness={0.5} />
      </mesh>
      <mesh castShadow position={[2.55, 0.58, -0.04]} rotation={[0, 0, -0.12]}>
        <cylinderGeometry args={[0.035, 0.035, 1.22, 8]} />
        <meshStandardMaterial color={palette.trim} roughness={0.5} />
      </mesh>
      <mesh castShadow position={[-1.7, -0.42, 0.84]}>
        <torusGeometry args={[0.22, 0.055, 8, 16]} />
        <meshStandardMaterial color="#111827" roughness={0.62} />
      </mesh>
      <mesh castShadow position={[1.7, -0.42, 0.84]}>
        <torusGeometry args={[0.22, 0.055, 8, 16]} />
        <meshStandardMaterial color="#111827" roughness={0.62} />
      </mesh>
      <mesh castShadow position={[0, 0.2, 1.2]}>
        <boxGeometry args={[1.7, 0.12, 0.5]} />
        <meshStandardMaterial color={palette.trim} roughness={0.42} />
      </mesh>
      <mesh castShadow position={[0, 0.75, 1.55]}>
        <boxGeometry args={[0.25, 1.35, 0.18]} />
        <meshStandardMaterial color={palette.body} roughness={0.38} />
      </mesh>
      <mesh position={[0, 0, -1.55]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.42, 0.035, 8, 28]} />
        <meshStandardMaterial color="#f7d06c" emissive="#ffaf44" emissiveIntensity={0.18} />
      </mesh>
      <mesh position={[0, 0, -1.58]}>
        <boxGeometry args={[0.12, 1.3, 0.08]} />
        <meshStandardMaterial color="#fff2ba" transparent opacity={0.56} />
      </mesh>
      </group>
    </group>
  );
}

function HologramPanel({
  flight,
  selectedAppName,
  notice,
}: {
  flight: FlightState;
  selectedAppName: string | null;
  notice: string | null;
}) {
  const panelRef = useRef<THREE.Group>(null);
  const billboardPosition = useRef(
    new THREE.Vector3(
      (flight.x + Math.cos(flight.heading) * 360) * WORLD_SCALE,
      PLANE_ALTITUDE + 6,
      (flight.y + Math.sin(flight.heading) * 360) * WORLD_SCALE,
    ),
  );
  useFrame((state) => {
    billboardPosition.current.set(
      (flight.x + Math.cos(flight.heading) * 360) * WORLD_SCALE,
      PLANE_ALTITUDE + 6,
      (flight.y + Math.sin(flight.heading) * 360) * WORLD_SCALE,
    );
    if (panelRef.current) {
      panelRef.current.position.y = Math.sin(state.clock.elapsedTime * 1.8) * 0.08;
    }
  });
  return (
    <BillboardGroup position={billboardPosition.current}>
      <group ref={panelRef}>
        <mesh>
          <planeGeometry args={[8.8, 4.8]} />
          <meshStandardMaterial
            color="#68dfff"
            emissive="#28bfff"
            emissiveIntensity={0.55}
            transparent
            opacity={0.26}
            side={THREE.DoubleSide}
          />
        </mesh>
        <mesh position={[0, 1.68, 0.06]}>
          <boxGeometry args={[4.8, 0.1, 0.02]} />
          <meshBasicMaterial color="#e7fbff" transparent opacity={0.88} />
        </mesh>
        <mesh position={[0, -1.76, 0.07]}>
          <boxGeometry args={[5.6, 0.12, 0.02]} />
          <meshBasicMaterial color={notice ? "#ffe178" : "#78efff"} transparent opacity={0.72} />
        </mesh>
        {[
          [-1.2, -0.02, 1.6, 0.82, 0.86],
          [1.08, 0.0, 1.55, -0.78, -0.72],
          [-1.22, -0.86, 1.2, 0.52, -0.8],
          [1.85, -0.38, 0.74, -0.8, 0.86],
        ].map(([x, y, width, rotation, opacity], index) => (
          <mesh key={`holo-line-${index}`} position={[x, y, 0.055]} rotation={[0, 0, rotation]}>
            <boxGeometry args={[width, 0.035, 0.02]} />
            <meshBasicMaterial color="#9df4ff" transparent opacity={opacity} />
          </mesh>
        ))}
        {[
          [-2.4, 0.42, "#5fe3ff"],
          [0, -0.45, "#9f83ff"],
          [2.25, 0.5, "#77e6a0"],
          [1.8, -1.25, "#ffd36a"],
          [-1.9, -1.2, "#66c7ff"],
        ].map(([x, y, color], index) => (
          <group key={index} position={[x as number, y as number, 0.08]}>
            <mesh>
              <circleGeometry args={[0.42, 24]} />
              <meshStandardMaterial color={color as string} emissive={color as string} emissiveIntensity={0.72} />
            </mesh>
            <mesh position={[0, 0, 0.06]}>
              <boxGeometry args={[0.34, 0.08, 0.02]} />
              <meshBasicMaterial color="#06233a" transparent opacity={0.72} />
            </mesh>
            <mesh position={[0, -0.62, 0.04]}>
              <planeGeometry args={[0.76, 0.08]} />
              <meshBasicMaterial color={color as string} transparent opacity={0.64} side={THREE.DoubleSide} />
            </mesh>
          </group>
        ))}
        <HologramNotice active={Boolean(notice || selectedAppName)} color={notice ? "#ffe178" : "#a5f3ff"} />
      </group>
    </BillboardGroup>
  );
}

function HologramNotice({ active, color }: { active: boolean; color: string }) {
  return (
    <group position={[0, -2.18, 0.1]}>
      <mesh>
        <planeGeometry args={[3.8, 0.48]} />
        <meshBasicMaterial
          color={active ? color : "#79dfff"}
          transparent
          opacity={active ? 0.34 : 0.18}
          side={THREE.DoubleSide}
        />
      </mesh>
      <mesh position={[0, 0, 0.03]}>
        <planeGeometry args={[2.7, 0.08]} />
        <meshBasicMaterial color="#f3fbff" transparent opacity={0.78} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

function BillboardGroup({
  children,
  position,
}: {
  children: ReactNode;
  position: [number, number, number] | THREE.Vector3;
}) {
  const ref = useRef<THREE.Group>(null);
  const { camera } = useThree();
  useFrame(() => {
    const group = ref.current;
    if (!group) return;
    group.quaternion.copy(camera.quaternion);
    if (position instanceof THREE.Vector3) {
      group.position.copy(position);
    }
  });
  return (
    <group ref={ref} position={position}>
      {children}
    </group>
  );
}

function BeaconPlaque({
  color,
  compact = false,
  selected = false,
  label,
  subtitle,
}: {
  color: string;
  compact?: boolean;
  selected?: boolean;
  label?: string;
  subtitle?: string;
}) {
  const labelTexture = useMemo(
    () =>
      label && typeof document !== "undefined"
        ? createBeaconPlaqueTexture({
            label,
            subtitle,
            color,
            compact,
            selected,
          })
        : null,
    [color, compact, label, selected, subtitle],
  );

  useEffect(() => () => labelTexture?.dispose(), [labelTexture]);

  if (labelTexture) {
    return (
      <group>
        <mesh renderOrder={30}>
          <planeGeometry args={compact ? [3.25, 0.94] : [3.8, 1.0]} />
          <meshBasicMaterial
            map={labelTexture}
            color="#ffffff"
            transparent
            opacity={selected ? 0.98 : 0.92}
            side={THREE.DoubleSide}
            toneMapped={false}
            depthTest={false}
          />
        </mesh>
      </group>
    );
  }

  return (
    <group>
      <mesh>
        <planeGeometry args={compact ? [1.45, 0.36] : [2.2, 0.38]} />
        <meshBasicMaterial color="#f5fbff" transparent opacity={selected ? 0.82 : 0.62} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0, 0, 0.02]}>
        <planeGeometry args={compact ? [0.94, 0.08] : [1.5, 0.08]} />
        <meshBasicMaterial color={color} transparent opacity={0.86} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

function TouchFlightPad({
  controllerRef,
}: {
  controllerRef: React.MutableRefObject<ReturnType<typeof createInputController>>;
}) {
  const press = (key: ControlKey) => {
    focusInputController(controllerRef.current);
    pressControlKey(controllerRef.current, key);
  };
  const release = (key: ControlKey) => releaseControlKey(controllerRef.current, key);
  return (
    <div className="scene-flight-pad" aria-label="Touch flight controls">
      <div className="scene-flight-pad-row scene-flight-pad-row--top">
        <button
          type="button"
          className="scene-flight-pad-btn"
          data-label="Up"
          onPointerDown={() => press("ArrowUp")}
          onPointerUp={() => release("ArrowUp")}
          onPointerCancel={() => release("ArrowUp")}
          onPointerLeave={() => release("ArrowUp")}
        >
          Accelerate
        </button>
      </div>
      <div className="scene-flight-pad-row">
        {[
          ["ArrowLeft", "Left"],
          ["ArrowDown", "Down"],
          ["ArrowRight", "Right"],
        ].map(([key, label]) => (
          <button
            key={key}
            type="button"
            className="scene-flight-pad-btn"
            data-label={label}
            onPointerDown={() => press(key as ControlKey)}
            onPointerUp={() => release(key as ControlKey)}
            onPointerCancel={() => release(key as ControlKey)}
            onPointerLeave={() => release(key as ControlKey)}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="scene-flight-pad-row">
        {[
          ["Climb", "Climb"],
          ["Dive", "Dive"],
          ["Fire", "Fire"],
        ].map(([key, label]) => (
          <button
            key={key}
            type="button"
            className="scene-flight-pad-btn"
            data-label={label}
            onPointerDown={() => press(key as ControlKey)}
            onPointerUp={() => release(key as ControlKey)}
            onPointerCancel={() => release(key as ControlKey)}
            onPointerLeave={() => release(key as ControlKey)}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
