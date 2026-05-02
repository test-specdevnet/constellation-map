"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";
import { DebugHud } from "./DebugHud";
import { FlightSettingsPanel } from "./FlightSettingsPanel";
import { MobileDrawer } from "./MobileDrawer";
import { useMediaQuery } from "./useMediaQuery";
import { BUILD_STAMP } from "../../lib/buildStamp";
import { getBuoyColorway } from "../../lib/canvas/buoyCategory";
import { planeSkinPalettes, type PlaneSkinId } from "../../lib/canvas/cartoonMarkers";
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
  syncGameScore,
  toRunRecord,
  updateRunResources,
} from "../../lib/game/session";
import {
  discoverNearbyDeployments,
  resolveLandingAttempt,
} from "../../lib/game/collision";
import {
  buildDeploymentDocks,
  buildStationLayout,
  type LandingStation,
  type StationLayout,
} from "../../lib/game/worldLayout";
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
  selectedSkinId: PlaneSkinId;
  searchMatches: string[];
  focusTarget: CameraTarget | null;
  mapDataLoading: boolean;
  snapshotError: boolean;
  flightSettings: FlightSettings;
  featureFlags: FeatureFlags;
  hudOverlay?: ReactNode;
  customizePanel?: ReactNode;
  onSelectApp: (appName: string) => void;
  onClearSelectedApp: () => void;
  onFocusCluster: (cluster: Cluster) => void;
  onHoverEntity: (entity: HoveredEntity | null) => void;
  onTelemetry: (telemetry: FlightTelemetry) => void;
  onUpdateFlightSettings: (settings: Partial<FlightSettings>) => void;
  onUpdateFeatureFlags: (flags: Partial<FeatureFlags>) => void;
  onGameStateChange?: (snapshot: GameSessionSnapshot) => void;
  onRunComplete?: (record: RunRecord) => void;
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
};

type PlayerMode = "flying" | "landed" | "onFoot";
type DisclosureSnapshot = Pick<
  FlightTelemetry,
  | "band"
  | "activeRegionId"
  | "activeRuntimeId"
  | "nearbySystemId"
  | "nearestRegionDistance"
  | "nearestSystemDistance"
>;

const GAME_STATE_EMIT_INTERVAL_MS = 220;
const TELEMETRY_EMIT_INTERVAL_MS = 160;
const VISIBILITY_UPDATE_INTERVAL_MS = 180;
const VISIBILITY_UPDATE_DISTANCE_WORLD = 260;
const WORLD_SCALE = 0.024;
const PLANE_ALTITUDE = 6.4;
const ISLAND_ALTITUDE = 1.2;
const MAX_STAR_MARKERS = {
  low: 18,
  medium: 32,
  high: 48,
} as const;
const MAX_ISLAND_MARKERS = {
  low: 14,
  medium: 24,
  high: 34,
} as const;
const CLOUD_FIELD_MARKERS = {
  low: 20,
  medium: 38,
  high: 62,
} as const;
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
  mouseTurn: 0,
  moveX: 0,
  moveY: 0,
};
let softCloudTexture: THREE.CanvasTexture | null = null;

const to3 = (point: { x: number; y: number }, altitude = 0) =>
  new THREE.Vector3(point.x * WORLD_SCALE, altitude, point.y * WORLD_SCALE);

const getRefuelAmount = (discoveries: number, fuelMax: number) =>
  clamp(fuelMax * (0.28 + discoveries * 0.035), fuelMax * 0.28, fuelMax);

const scheduleSceneAction = (action: () => void) => {
  window.requestAnimationFrame(() => {
    void Promise.resolve().then(action);
  });
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
  gradient.addColorStop(0, "rgba(255, 255, 255, 0.98)");
  gradient.addColorStop(0.34, "rgba(255, 255, 255, 0.94)");
  gradient.addColorStop(0.58, "rgba(246, 252, 255, 0.68)");
  gradient.addColorStop(0.78, "rgba(217, 239, 252, 0.28)");
  gradient.addColorStop(1, "rgba(190, 224, 244, 0)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, 192, 192);
  softCloudTexture = new THREE.CanvasTexture(canvas);
  softCloudTexture.colorSpace = THREE.SRGBColorSpace;
  softCloudTexture.needsUpdate = true;
  return softCloudTexture;
};

const shouldIgnoreFlightPointer = (target: EventTarget | null) =>
  target instanceof Element
    ? Boolean(
        target.closest(
          "button, a, input, select, textarea, [role='button'], .scene-overlay-layer, .scene-toolbar, .scene-flight-pad",
        ),
      )
    : false;

const controlKeyFromEvent = (key: string): ControlKey | null => {
  const normalized = key.toLowerCase();
  if (key === "ArrowUp" || normalized === "w") return "ArrowUp";
  if (key === "ArrowDown" || normalized === "s") return "ArrowDown";
  if (key === "ArrowLeft" || normalized === "a") return "ArrowLeft";
  if (key === "ArrowRight" || normalized === "d") return "ArrowRight";
  return null;
};

const createInitialDebugHudSnapshot = (): DebugHudSnapshot => ({
  fps: 0,
  frameMs: 0,
  tickRate: 0,
  counts: { deployments: 0, clusters: 0, parachuters: 0, powerUps: 0, clouds: 0 },
  input: { turnAxis: 0, throttleAxis: 0 },
  player: {
    speed: 0,
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
  selectedSkinId,
  searchMatches,
  focusTarget,
  mapDataLoading,
  snapshotError,
  flightSettings,
  featureFlags,
  hudOverlay,
  customizePanel,
  onSelectApp,
  onClearSelectedApp,
  onFocusCluster,
  onHoverEntity,
  onTelemetry,
  onUpdateFlightSettings,
  onUpdateFeatureFlags,
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
  });
  const gameEmitTsRef = useRef(0);
  const telemetryEmitTsRef = useRef(0);
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
  const debugPerfRef = useRef({ lastSampleAtMs: 0, frames: 0, ticks: 0 });
  const [runtimeVersion, setRuntimeVersion] = useState(0);
  const [showSettingsPanel, setShowSettingsPanel] = useState(false);
  const [showCustomizePanel, setShowCustomizePanel] = useState(false);
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
  const regionClusters = useMemo(
    () => clusters.filter((cluster) => cluster.level === "region"),
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
  const runtimeClusters = useMemo(
    () => clusters.filter((cluster) => cluster.level === "runtime"),
    [clusters],
  );
  const activeClusters = featureFlags.deploymentClustering ? clusters : runtimeClusters;

  useEffect(() => {
    const center = {
      x: bounds.minX + bounds.width / 2,
      y: bounds.minY + bounds.height / 2,
    };
    runtimeRef.current.flight = createFlightState(center.x, center.y);
    runtimeRef.current.previousFlight = createFlightState(center.x, center.y);
    runtimeRef.current.game = createGameState();
    runtimeRef.current.game.runStartedAtMs = performance.now();
    runtimeRef.current.landedStation = null;
    runtimeRef.current.nearbyStation = null;
    runtimeRef.current.nearbyDeploymentId = null;
    runtimeRef.current.playerMode = "flying";
    runtimeRef.current.visibility = EMPTY_VISIBILITY;
    visibilityUpdateRef.current.lastAtMs = 0;
    telemetryEmitTsRef.current = 0;
    setRunEndSnapshot(null);
    setRuntimeVersion((value) => value + 1);
  }, [bounds]);

  useEffect(() => {
    const controller = inputControllerRef.current;
    const down = (event: KeyboardEvent) => {
      const mapped = controlKeyFromEvent(event.key);
      if (mapped) {
        focusInputController(controller);
        pressControlKey(controller, mapped);
        event.preventDefault();
      }
      if (event.key.toLowerCase() === "g") setDebugHudHotkey((value) => !value);
    };
    const up = (event: KeyboardEvent) => {
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
      const nextFlight =
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
        const disclosure = getDisclosureState({
          zoom: runtime.zoom,
          plane: nextFlight,
          clusters,
          systems,
        });
        disclosureRef.current = disclosure;
        runtime.visibility = buildDeploymentVisibilityState({
          systems,
          starsBySystem,
          clusters,
          flight: nextFlight,
          disclosure,
          selectedAppName,
          searchMatches: matchSet,
          qualityMode,
          densityLimitsEnabled: featureFlags.deploymentClustering,
        });
        visibilityUpdateRef.current = {
          lastAtMs: nowMs,
          x: nextFlight.x,
          y: nextFlight.y,
          zoom: runtime.zoom,
          selectedAppName,
          searchSignature,
          qualityMode,
          deploymentClustering: featureFlags.deploymentClustering,
        };
      }

      const disclosure = disclosureRef.current;
      const visibility = runtime.visibility;

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
        enableParachuters: featureFlags.pickups,
        fuelRatio: game.fuel / Math.max(game.fuelMax, 1),
        boostActive,
      });
      game.collectibles = maintained.collectibles;
      game.spawnCounter = maintained.spawnCounter;

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
        rescues: game.rescues,
        fuelTanksCollected: game.fuelTanksCollected,
        speedBoostsCollected: game.speedBoostsCollected,
        collectibleResult,
        pickupsEnabled: featureFlags.pickups,
      });
      game.fuel = pickupOutcome.fuel;
      game.boostUntilMs = pickupOutcome.boostUntilMs;
      game.rescues = pickupOutcome.rescues;
      game.fuelTanksCollected = pickupOutcome.fuelTanksCollected;
      game.speedBoostsCollected = pickupOutcome.speedBoostsCollected;

      const nearestDeployment = discoverNearbyDeployments({
        game,
        plane: nextFlight,
        deployments: buildDeploymentDocks(visibility.visibleSystems),
      });
      runtime.nearbyDeploymentId = nearestDeployment?.id ?? null;
      syncGameScore(game);
      game.effects = updateEffects({ effects: game.effects, dtMs });

      runtime.previousFlight = previousFlight;
      runtime.flight = nextFlight;
      runtime.visibility = visibility;
      runtime.input = inputSample.flightInput;
      runtime.effects = game.effects;
      runtime.nowMs = nowMs;
      runtime.pickupNotice = pickupOutcome.pickupLabel;

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
          },
          camera: {
            x: cameraFollow.x,
            y: cameraFollow.y,
            zoom: runtime.zoom,
          },
        };
        onTelemetry(telemetry);
      }

      if (nowMs - gameEmitTsRef.current >= GAME_STATE_EMIT_INTERVAL_MS) {
        gameEmitTsRef.current = nowMs;
        const snapshot = createSessionSnapshot({
          game,
          nowMs,
          qualityMode,
          featureFlags,
          clusterMarkers: visibility.clusterMarkers,
        });
        onGameStateChange?.(snapshot);
        if (game.state === "landed" && !game.runRecorded) {
          game.runRecorded = true;
          setRunEndSnapshot(snapshot);
          onRunComplete?.(toRunRecord(game, nowMs));
        }
        setRuntimeVersion((value) => value + 1);
      }

      debugPerfRef.current.frames += 1;
      debugPerfRef.current.ticks += 1;
      if (nowMs - debugPerfRef.current.lastSampleAtMs > 500) {
        const seconds = (nowMs - debugPerfRef.current.lastSampleAtMs) / 1000 || 1;
        setDebugStats({
          fps: Math.round(debugPerfRef.current.frames / seconds),
          frameMs: Math.round(dtMs * 10) / 10,
          tickRate: Math.round(debugPerfRef.current.ticks / seconds),
          counts: {
            deployments: visibility.visibleSystems.length,
            clusters: activeClusters.length,
            parachuters: game.collectibles.filter((item) => item.active && item.kind === "parachuter")
              .length,
            powerUps: game.collectibles.filter((item) => item.active && item.kind !== "parachuter")
              .length,
            clouds: regionClusters.length,
          },
          input: inputSample,
          player: {
            speed: Math.round(nextFlight.speed),
            fuel: Math.round(game.fuel),
            boostRemainingMs: Math.max(0, Math.round(game.boostUntilMs - nowMs)),
            distanceUnits: game.distanceUnits,
          },
          lastPickupEvent: pickupOutcome.pickupLabel,
        });
        debugPerfRef.current = { lastSampleAtMs: nowMs, frames: 0, ticks: 0 };
      }
    },
    [
      activeClusters.length,
      bounds,
      clusters,
      featureFlags,
      flightSettings.mouseSensitivity,
      matchSet,
      onGameStateChange,
      onRunComplete,
      onTelemetry,
      qualityMode,
      regionClusters.length,
      searchSignature,
      stationLayout,
      selectedAppName,
      starsBySystem,
      systems,
    ],
  );

  const snapshot = runtimeRef.current;
  const debugHudVisible = featureFlags.debugHud || debugHudHotkey;
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
          rescues: runtime.game.rescues,
          upgradeCredits: runtime.game.upgradeCredits,
          thrusterLevel: runtime.game.thrusterLevel,
          fuelEfficiencyLevel: runtime.game.fuelEfficiencyLevel,
        },
        player: {
          x: Math.round(runtime.flight.x),
          y: Math.round(runtime.flight.y),
          heading: Number(runtime.flight.heading.toFixed(3)),
          speed: Math.round(runtime.flight.speed),
          fuel: Math.round(runtime.game.fuel),
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

  const boostLaunchSpeed = () => {
    runtimeRef.current.flight = {
      ...runtimeRef.current.flight,
      speed: Math.max(runtimeRef.current.flight.speed, 240),
    };
  };
  const resetRun = useCallback(() => {
    runtimeRef.current.game = createGameState();
    runtimeRef.current.game.runStartedAtMs = performance.now();
    runtimeRef.current.landedStation = null;
    runtimeRef.current.nearbyStation = null;
    runtimeRef.current.nearbyDeploymentId = null;
    runtimeRef.current.playerMode = "flying";
    runtimeRef.current.visibility = EMPTY_VISIBILITY;
    runtimeRef.current.flight = createFlightState(
      bounds.minX + bounds.width / 2,
      bounds.minY + bounds.height / 2,
    );
    runtimeRef.current.flight.speed = 180;
    visibilityUpdateRef.current.lastAtMs = 0;
    telemetryEmitTsRef.current = 0;
    setRunEndSnapshot(null);
    setRuntimeVersion((value) => value + 1);
  }, [bounds]);
  const setLandedMode = (mode: PlayerMode) => {
    if (!runtimeRef.current.landedStation) return;
    runtimeRef.current.playerMode = mode;
    setRuntimeVersion((value) => value + 1);
  };
  useEffect(() => {
    const kickoff = window.setTimeout(() => {
      boostLaunchSpeed();
      focusInputController(inputControllerRef.current);
      wrapRef.current?.focus();
    }, 250);
    return () => window.clearTimeout(kickoff);
  }, []);

  return (
    <section className="scene-shell scene-shell--three">
      <div className={`scene-toolbar ${isCompactLayout ? "scene-toolbar--mobile" : ""}`}>
        <div className="scene-toolbar-group">
          <button
            type="button"
            className="secondary-action"
            onClick={() => {
              setShowCustomizePanel(false);
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
          <button
            type="button"
            className="secondary-action"
            onClick={() => {
              setShowSettingsPanel(false);
              setShowCustomizePanel((value) => !value);
            }}
          >
            Customize
          </button>
        </div>
        <span className="scene-zoom-label scene-zoom-label--wrap">
            3D chase view | build {BUILD_STAMP} | GLB mode
        </span>
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
            powerPreference: "high-performance",
          }}
        >
          <ThreeWorld
            runtime={snapshot}
            runtimeVersion={runtimeVersion}
            clusters={activeClusters}
            regionClusters={regionClusters}
            bounds={bounds}
            systems={systems}
            stars={stars}
            selectedAppName={selectedAppName}
            selectedSkinId={selectedSkinId}
            searchMatches={matchSet}
            stations={stationByClusterId}
            focusTarget={focusTarget}
            cloudsEnabled={featureFlags.clouds}
            qualityMode={qualityMode}
            onSelectApp={onSelectApp}
            onFocusCluster={onFocusCluster}
            onHoverEntity={onHoverEntity}
            onTick={handleRuntimeTick}
          />
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
              onUpdateSettings={onUpdateFlightSettings}
              onUpdateFeatureFlags={onUpdateFeatureFlags}
              onClose={() => setShowSettingsPanel(false)}
            />
          ) : null}
          {showCustomizePanel && customizePanel ? (
            <section className="scene-customize-panel" aria-label="Plane customization">
              <div className="scene-customize-panel__header">
                <strong>Customize aircraft</strong>
                <button type="button" className="secondary-action" onClick={() => setShowCustomizePanel(false)}>
                  Close
                </button>
              </div>
              {customizePanel}
            </section>
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
                setRuntimeVersion((value) => value + 1);
              }}
            />
          ) : null}
          {runEndSnapshot ? (
            <div className="scene-run-end">
              <p className="scene-run-end__title">{runEndSnapshot.endReason ?? "Run complete"}</p>
              <p className="scene-run-end__copy">
                Score {runEndSnapshot.score.toLocaleString()} with{" "}
                {runEndSnapshot.discoveries.toLocaleString()} discoveries and{" "}
                {runEndSnapshot.rescues.toLocaleString()} rescues.
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
              onUpdateSettings={onUpdateFlightSettings}
              onUpdateFeatureFlags={onUpdateFeatureFlags}
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
  clusters,
  regionClusters,
  bounds,
  systems,
  stars,
  selectedAppName,
  selectedSkinId,
  searchMatches,
  stations,
  focusTarget,
  cloudsEnabled,
  qualityMode,
  onSelectApp,
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
  selectedSkinId: PlaneSkinId;
  searchMatches: Set<string>;
  stations: Map<string, StationLayout>;
  focusTarget: CameraTarget | null;
  cloudsEnabled: boolean;
  qualityMode: "low" | "medium" | "high";
  onSelectApp: (appName: string) => void;
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
    const flight = runtime.flight;
    planePosition.current.set(flight.x * WORLD_SCALE, PLANE_ALTITUDE, flight.y * WORLD_SCALE);
    const zoomRatio =
      (runtime.zoom - GAME_CONFIG.zoomMin) /
      Math.max(GAME_CONFIG.zoomMax - GAME_CONFIG.zoomMin, 0.001);
    const distance = THREE.MathUtils.lerp(42, 22, zoomRatio);
    const height = THREE.MathUtils.lerp(22, 12, zoomRatio);
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
          PLANE_ALTITUDE + 18,
          focusTarget.y * WORLD_SCALE,
        ),
        0.08,
      );
    }
    const cameraBlend = 1 - Math.exp(-delta * 4.6);
    cameraVelocity.current.subVectors(desiredCamera.current, camera.position).multiplyScalar(cameraBlend);
    camera.position.add(cameraVelocity.current);
    lookTarget.current.lerp(planePosition.current, 1 - Math.exp(-delta * 7));
    camera.lookAt(lookTarget.current);
  });

  const visibleStars = useMemo(
    () =>
      stars
        .filter((star) => runtime.visibility.detailSystemIds.has(star.systemId))
        .slice(0, MAX_STAR_MARKERS[qualityMode]),
    [qualityMode, runtime.visibility.detailSystemIds, stars],
  );
  const visibleClusters = useMemo(
    () =>
      [...clusters]
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
        .map((item) => item.cluster),
    [clusters, qualityMode, runtime.flight.x, runtime.flight.y],
  );
  return (
    <>
      <color attach="background" args={["#238ce8"]} />
      <fog attach="fog" args={["#79c9ff", 90, 330]} />
      <hemisphereLight args={["#ffffff", "#2988d3", 1.5]} />
      <directionalLight
        position={[30, 48, 28]}
        intensity={1.85}
      />
      <ambientLight intensity={0.48} />
      <SkyDome />
      {cloudsEnabled ? <CloudFields clusters={regionClusters} qualityMode={qualityMode} /> : null}
      {cloudsEnabled ? <AmbientCloudLayer bounds={bounds} qualityMode={qualityMode} /> : null}
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
        {runtime.visibility.visibleSystems.map((system, index) => (
          <DeploymentMarker
            key={system.systemId}
            system={system}
            selected={system.appName === selectedAppName || searchMatches.has(system.appName)}
            index={index}
            onSelectApp={onSelectApp}
            onHoverEntity={onHoverEntity}
          />
        ))}
        {visibleStars.map((star) => (
          <StarMarker key={star.id} star={star} onSelectApp={onSelectApp} />
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
      <Biplane runtime={runtime} selectedSkinId={selectedSkinId} />
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

function SkyDome() {
  return (
    <mesh scale={[1, 1, 1]} position={[0, -80, 0]}>
      <sphereGeometry args={[520, 16, 8]} />
      <meshBasicMaterial side={THREE.BackSide} color="#1688ea" transparent opacity={0.9} />
    </mesh>
  );
}

function CloudFields({
  clusters,
  qualityMode,
}: {
  clusters: Cluster[];
  qualityMode: "low" | "medium" | "high";
}) {
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
            [13, 4.25, 0.5],
          ]
        : [
            [0, 0, 1],
            [7.5, -4.5, 0.78],
            [-6.25, 5.75, 0.68],
            [13, 4.25, 0.54],
            [-12, -7.5, 0.48],
          ];
  return (
    <group>
      {clusters.slice(0, CLOUD_FIELD_MARKERS[qualityMode]).flatMap((cluster, index) =>
        layeredOffsets.map(([offsetX, offsetY, scaleFactor], layerIndex) => {
          const position = to3(
            {
              x: cluster.centroid.x + offsetX * 70,
              y: cluster.centroid.y + offsetY * 70,
            },
            -4.4 - ((index + layerIndex) % 6) * 0.28,
          );
          return (
            <group key={`${cluster.clusterId}:${layerIndex}`} position={position}>
              <CloudPuff
                scale={(3.2 + Math.min(8.4, cluster.radius * WORLD_SCALE * 0.09)) * scaleFactor}
                variant={(index + layerIndex) % 4}
              />
            </group>
          );
        }),
      )}
    </group>
  );
}

function AmbientCloudLayer({
  bounds,
  qualityMode,
}: {
  bounds: SceneBounds;
  qualityMode: "low" | "medium" | "high";
}) {
  const count = qualityMode === "low" ? 42 : qualityMode === "medium" ? 78 : 118;
  const clouds = useMemo(
    () => {
      const centerX = bounds.minX + bounds.width / 2;
      const centerY = bounds.minY + bounds.height / 2;
      const width = Math.min(Math.max(bounds.width * 0.52, 1_850), 2_950);
      const height = Math.min(Math.max(bounds.height * 0.52, 1_350), 2_300);
      const columns = Math.max(8, Math.ceil(Math.sqrt(count * (width / height))));
      const rows = Math.max(5, Math.ceil(count / columns));
      return Array.from({ length: count }, (_, index) => {
        const column = index % columns;
        const row = Math.floor(index / columns);
        const jitterX = (((index * 73) % 100) - 50) / 100;
        const jitterY = (((index * 47) % 100) - 50) / 100;
        return {
          x: centerX - width / 2 + ((column + 0.5 + jitterX * 0.56) / columns) * width,
          y: centerY - height / 2 + ((row + 0.5 + jitterY * 0.5) / rows) * height,
          scale: 1.18 + ((index * 37) % 100) / 105,
          variant: index % 4,
        };
      });
    },
    [bounds.height, bounds.minX, bounds.minY, bounds.width, count],
  );

  return (
    <group>
      {clouds.map((cloud, index) => {
        const position = to3(
          {
            x: cloud.x,
            y: cloud.y,
          },
          -3.3 - (index % 6) * 0.2,
        );
        return (
          <group key={index} position={position}>
            <CloudPuff scale={cloud.scale} variant={cloud.variant} />
            {index % 3 === 0 ? (
              <group position={[2.4, 4.7, -0.2]}>
                <CloudPuff scale={cloud.scale * 1.28} variant={(cloud.variant + 2) % 4} />
              </group>
            ) : null}
            {index % 5 === 0 ? (
              <group position={[-3.8, 2.2, 0.34]}>
                <CloudPuff scale={cloud.scale * 0.86} variant={(cloud.variant + 1) % 4} />
              </group>
            ) : null}
          </group>
        );
      })}
    </group>
  );
}

function CloudPuff({ scale = 1, variant = 0 }: { scale?: number; variant?: number }) {
  const lobes = [
    [-2.35, -0.22, 0.02, 2.4, 1.42, "#ffffff", 0.72],
    [-1.42, 0.22, 0.05, 2.25, 1.55, "#ffffff", 0.9],
    [-0.26, 0.44, 0.08, 2.76, 1.82, "#ffffff", 0.96],
    [1.18, 0.22, 0.04, 2.46, 1.55, "#ffffff", 0.92],
    [2.36, -0.14, 0.02, 2.08, 1.22, "#ffffff", 0.76],
    [-0.92, -0.56, 0.1, 3.35, 1.18, "#ffffff", 0.72],
    [0.95, -0.58, 0.1, 3.55, 1.16, "#ffffff", 0.68],
    [0.08, -0.08, 0.16, 4.65, 1.42, "#ffffff", 0.48],
  ] as const;
  const cloudMap = useMemo(() => getSoftCloudTexture(), []);
  const rotation = variant * 0.18;
  return (
    <BillboardGroup position={[0, 0, 0]}>
      <group scale={scale} rotation={[0, 0, rotation]}>
        {lobes.map(([x, y, z, width, height, color, opacity], index) => (
          <mesh key={index} position={[x, y, z]} renderOrder={-20 + index}>
            <planeGeometry args={[width, height]} />
            <meshBasicMaterial
              map={cloudMap}
              alphaMap={cloudMap}
            color={color}
              transparent
              opacity={opacity}
              depthWrite={false}
              depthTest
              side={THREE.DoubleSide}
              toneMapped={false}
            />
          </mesh>
        ))}
      </group>
    </BillboardGroup>
  );
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
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.18} roughness={0.42} />
      </mesh>
      <mesh position={[0, 0.82, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[radius * 0.38, 0.07, 8, 36]} />
        <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={0.32} roughness={0.34} />
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
      <CloudPuff scale={radius * 0.32} variant={index % 4} />
      <group position={[radius * 0.28, -0.06, radius * -0.14]}>
        <CloudPuff scale={radius * 0.18} variant={(index + 1) % 4} />
      </group>
      <group position={[radius * -0.22, -0.1, radius * 0.16]}>
        <CloudPuff scale={radius * 0.16} variant={(index + 2) % 4} />
      </group>
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

function DeploymentMarker({
  system,
  selected,
  index,
  onSelectApp,
  onHoverEntity,
}: {
  system: AppSystem;
  selected: boolean;
  index: number;
  onSelectApp: (appName: string) => void;
  onHoverEntity: (entity: HoveredEntity | null) => void;
}) {
  const colorway = getBuoyColorway(system);
  const position = to3(system, ISLAND_ALTITUDE + 6.1 + (index % 4) * 0.08);
  const groupRef = useRef<THREE.Group>(null);
  const beaconRef = useRef<THREE.Mesh>(null);
  const lightRef = useRef<THREE.PointLight>(null);
  const mountProgressRef = useRef(0);
  useFrame((state, delta) => {
    const bob = Math.sin(state.clock.elapsedTime * 1.25 + index * 0.83) * 0.24;
    const spin = Math.sin(state.clock.elapsedTime * 0.34 + index) * 0.08;
    mountProgressRef.current = Math.min(1, mountProgressRef.current + delta * 2.8);
    if (groupRef.current) {
      groupRef.current.position.y = position.y + bob;
      groupRef.current.rotation.y = spin;
      groupRef.current.scale.setScalar(0.62 + mountProgressRef.current * 0.38);
    }
    const flash = 0.45 + Math.max(0, Math.sin(state.clock.elapsedTime * 5.6 + index)) * 0.95;
    if (beaconRef.current) {
      const material = beaconRef.current.material;
      if (material instanceof THREE.MeshStandardMaterial) {
        material.emissiveIntensity = flash;
      }
    }
    if (lightRef.current) {
      lightRef.current.intensity = selected ? 1.8 + flash : 0.55 + flash * 0.55;
    }
  });
  return (
    <group
      ref={groupRef}
      position={position}
      onClick={(event: ThreeEvent<MouseEvent>) => {
        event.stopPropagation();
        scheduleSceneAction(() => onSelectApp(system.appName));
      }}
      onPointerOver={(event: ThreeEvent<PointerEvent>) => {
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
      <mesh>
        <sphereGeometry args={[2.35, 12, 8]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
      <pointLight ref={lightRef} color="#fff2a8" intensity={selected ? 1.8 : 0.65} distance={10} />
      <DeploymentFallback selected={selected} colorway={colorway} />
      <mesh ref={beaconRef} position={[0, 1.68, 0]}>
        <sphereGeometry args={[0.14, 10, 8]} />
        <meshStandardMaterial
          color="#fff4a8"
          emissive="#ffd84a"
          emissiveIntensity={1.1}
          metalness={0.15}
          roughness={0.22}
        />
      </mesh>
      <BillboardGroup position={[0, 2.72, 0]}>
        <BeaconPlaque color={colorway.beacon} compact selected={selected} />
      </BillboardGroup>
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
      <mesh position={[0, -0.9, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.82, 0.045, 6, 18]} />
        <meshBasicMaterial color="#f4fbff" transparent opacity={selected ? 0.92 : 0.7} />
      </mesh>
      {selected ? (
        <mesh position={[0, -0.42, 0]}>
          <sphereGeometry args={[0.76, 12, 9]} />
          <meshStandardMaterial
            color="#f7fbff"
            emissive={colorway.beacon}
            emissiveIntensity={0.22}
            metalness={0.72}
            roughness={0.25}
          />
        </mesh>
      ) : (
        <mesh position={[0, -0.44, 0]}>
          <sphereGeometry args={[0.62, 10, 8]} />
          <meshStandardMaterial
            color="#d9e1e7"
            emissive="#8fb4ca"
            emissiveIntensity={0.12}
            metalness={0.78}
            roughness={0.3}
          />
        </mesh>
      )}
      <mesh position={[0, -1.08, 0]}>
        <cylinderGeometry args={[0.92, 1.12, 0.18, 12]} />
        <meshStandardMaterial color="#dff8ff" emissive={colorway.beacon} emissiveIntensity={0.18} roughness={0.5} />
      </mesh>
    </>
  );
}

function StarMarker({ star, onSelectApp }: { star: Star; onSelectApp: (appName: string) => void }) {
  const position = to3(star, ISLAND_ALTITUDE + 4.2);
  return (
    <mesh position={position} onClick={() => scheduleSceneAction(() => onSelectApp(star.appName))}>
      <sphereGeometry args={[clamp(star.size * 0.08, 0.1, 0.32), 12, 8]} />
      <meshStandardMaterial color="#fff3a3" emissive="#8ee8ff" emissiveIntensity={0.55} />
    </mesh>
  );
}

function CollectibleMesh({ collectible, nowMs }: { collectible: Collectible; nowMs: number }) {
  const bob = Math.sin(nowMs / 360 + collectible.bobSeed) * 0.35;
  const position = to3(collectible, PLANE_ALTITUDE + 1.2 + bob);
  const color =
    collectible.kind === "fuel" ? "#ff7166" : collectible.kind === "boost" ? "#65eaff" : "#fff2a4";
  return (
    <group position={position} rotation={[0, nowMs / 800 + collectible.spinSeed, 0]}>
      {collectible.kind === "fuel" ? (
        <mesh>
          <boxGeometry args={[0.65, 0.9, 0.4]} />
          <meshStandardMaterial color={color} emissive="#ff4d46" emissiveIntensity={0.32} />
        </mesh>
      ) : collectible.kind === "boost" ? (
        <mesh>
          <octahedronGeometry args={[0.6, 0]} />
          <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.72} />
        </mesh>
      ) : (
        <mesh>
          <dodecahedronGeometry args={[0.62, 0]} />
          <meshStandardMaterial color={color} emissive="#ffe680" emissiveIntensity={0.62} roughness={0.3} />
        </mesh>
      )}
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

function Biplane({
  runtime,
  selectedSkinId,
}: {
  runtime: SceneRuntime;
  selectedSkinId: PlaneSkinId;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const flight = runtime.flight;
  const palette = selectedSkinId === "classic" ? planeSkinPalettes.classic : planeSkinPalettes[selectedSkinId] ?? planeSkinPalettes.classic;
  useFrame(() => {
    const group = groupRef.current;
    if (!group) return;
    const latestFlight = runtime.flight;
    group.position.set(
      latestFlight.x * WORLD_SCALE,
      PLANE_ALTITUDE,
      latestFlight.y * WORLD_SCALE,
    );
    group.rotation.y = -latestFlight.heading + Math.PI / 2;
  });

  return (
    <group
      ref={groupRef}
      position={[flight.x * WORLD_SCALE, PLANE_ALTITUDE, flight.y * WORLD_SCALE]}
      rotation={[0, -flight.heading + Math.PI / 2, 0]}
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
      <pointLight color={palette.bodyHi} intensity={0.35} distance={6} position={[0, 0.8, -0.3]} />
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
      <pointLight color="#ff9170" intensity={0.85} distance={8} position={[0, 0.5, -1.5]} />
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
}: {
  color: string;
  compact?: boolean;
  selected?: boolean;
}) {
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
    </div>
  );
}
