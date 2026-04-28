"use client";

import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Canvas, useFrame, useLoader, useThree, type ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
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
import {
  GAME_CONFIG,
  clamp,
  resolveQualityMode,
  type FeatureFlags,
  type FlightSettings,
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
  discoverDeployment,
  syncGameScore,
  toRunRecord,
  updateRunResources,
} from "../../lib/game/session";
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
  selectedSkinId: PlaneSkinId;
  searchMatches: string[];
  focusTarget: CameraTarget | null;
  mapDataLoading: boolean;
  snapshotError: boolean;
  flightSettings: FlightSettings;
  featureFlags: FeatureFlags;
  overlay?: ReactNode;
  onSelectApp: (appName: string) => void;
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

type PlayerMode = "flying" | "landed" | "onFoot" | "shop";

type LandingStation = {
  id: string;
  kind: "refuel" | "upgrade";
  label: string;
  x: number;
  y: number;
  radius: number;
};

type StationLayout = LandingStation & {
  cluster: Cluster;
};

const GAME_STATE_EMIT_INTERVAL_MS = 80;
const WORLD_SCALE = 0.024;
const PLANE_ALTITUDE = 6.4;
const ISLAND_ALTITUDE = 1.2;
const LANDING_RADIUS_WORLD = 520;
const LANDING_MAX_SPEED = 145;
const DEPLOYMENT_DOCK_RADIUS_WORLD = GAME_CONFIG.discoveryRadius * 1.18;
const DEPLOYMENT_CREDIT_VALUE = 12;
const UPGRADE_COST_BASE = 24;
const MAX_DEPLOYMENT_GLB_MODELS = {
  low: 0,
  medium: 4,
  high: 7,
} as const;
const MAX_STATION_GLB_MODELS = {
  low: 0,
  medium: 3,
  high: 5,
} as const;
const MAX_STAR_MARKERS = {
  low: 40,
  medium: 70,
  high: 100,
} as const;
const MODEL_PATHS = {
  biplane: "/models/biplane.glb",
  drone: "/models/floatingdrone.glb",
  upgradeLab: "/models/floatingupgradelab.glb",
  refuelStation: "/models/refuelstation.glb",
  serviceRobot: "/models/servicerobot.glb",
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
};

const to3 = (point: { x: number; y: number }, altitude = 0) =>
  new THREE.Vector3(point.x * WORLD_SCALE, altitude, point.y * WORLD_SCALE);

const getStationKind = (index: number): LandingStation["kind"] =>
  index % 2 === 0 ? "refuel" : "upgrade";

const getStationLabel = (kind: LandingStation["kind"]) =>
  kind === "refuel" ? "Refuel station" : "Upgrade lab";

const getRefuelAmount = (discoveries: number, fuelMax: number) =>
  clamp(fuelMax * (0.28 + discoveries * 0.035), fuelMax * 0.28, fuelMax);

const getUpgradeCost = (level: number) => UPGRADE_COST_BASE * (level + 1);

const scheduleSceneAction = (action: () => void) => {
  window.requestAnimationFrame(() => {
    void Promise.resolve().then(action);
  });
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
  selectedSkinId,
  searchMatches,
  focusTarget,
  mapDataLoading,
  snapshotError,
  flightSettings,
  featureFlags,
  overlay,
  onSelectApp,
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
  const debugPerfRef = useRef({ lastSampleAtMs: 0, frames: 0, ticks: 0 });
  const modelEnableQueuedRef = useRef(false);
  const [runtimeVersion, setRuntimeVersion] = useState(0);
  const [showSettingsPanel, setShowSettingsPanel] = useState(false);
  const [showActionMenu, setShowActionMenu] = useState(false);
  const [showFlightTip, setShowFlightTip] = useState(false);
  const [hudVisible, setHudVisible] = useState(true);
  const [debugHudHotkey, setDebugHudHotkey] = useState(false);
  const [debugStats, setDebugStats] = useState(createInitialDebugHudSnapshot);
  const [pickupNotice, setPickupNotice] = useState<string | null>(null);
  const [runEndSnapshot, setRunEndSnapshot] = useState<GameSessionSnapshot | null>(null);
  const [modelsReady, setModelsReady] = useState(false);

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
    () =>
      regionClusters.map((cluster, index) => {
        const kind = getStationKind(index);
        return {
          id: cluster.clusterId,
          kind,
          label: getStationLabel(kind),
          x: cluster.centroid.x,
          y: cluster.centroid.y,
          radius: Math.max(LANDING_RADIUS_WORLD, cluster.radius * 0.28),
          cluster,
        };
      }),
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
    setRunEndSnapshot(null);
    setRuntimeVersion((value) => value + 1);
  }, [bounds]);

  useEffect(() => {
    setShowFlightTip(window.localStorage.getItem("flux-flight-tip-dismissed") !== "1");
  }, []);

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
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
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
          runtime.playerMode === "shop"
            ? "Upgrade shop open"
            : runtime.playerMode === "onFoot"
              ? "Robot avatar active"
              : runtime.landedStation.kind === "refuel"
                ? "Refuel station docked"
                : "Upgrade lab docked";
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

      const nearbyStation = stationLayout
        .map((station) => ({
          ...station,
          distance: Math.hypot(station.x - nextFlight.x, station.y - nextFlight.y),
        }))
        .filter((station) => station.distance <= station.radius)
        .sort((left, right) => left.distance - right.distance)[0] ?? null;
      runtime.nearbyStation = nearbyStation;

      if (inputSample.flightInput.brake && nextFlight.speed <= LANDING_MAX_SPEED) {
        if (nearbyStation) {
          runtime.landedStation = {
            id: nearbyStation.id,
            kind: nearbyStation.kind,
            label: nearbyStation.label,
            x: nearbyStation.x,
            y: nearbyStation.y,
            radius: nearbyStation.radius,
          };
          runtime.playerMode = "landed";
          nextFlight.speed = 0;
          nextFlight.angVel = 0;
          if (nearbyStation.kind === "refuel") {
            const refuelAmount = getRefuelAmount(game.discoveries.size, game.fuelMax);
            game.fuel = clamp(game.fuel + refuelAmount, 0, game.fuelMax);
          }
          setPickupNotice(nearbyStation.kind === "refuel" ? "Landed: refueled" : "Landed: upgrade bank");
          window.setTimeout(() => setPickupNotice(null), 1400);
        }
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

      const disclosure = getDisclosureState({
        zoom: runtime.zoom,
        plane: nextFlight,
        clusters,
        systems,
      });
      const visibility = buildDeploymentVisibilityState({
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

      let nearestDeployment: { id: string; appName: string; distance: number } | null = null;
      for (const system of visibility.visibleSystems) {
        const distance = Math.hypot(system.x - nextFlight.x, system.y - nextFlight.y);
        if (distance <= DEPLOYMENT_DOCK_RADIUS_WORLD) {
          if (!nearestDeployment || distance < nearestDeployment.distance) {
            nearestDeployment = { id: system.systemId, appName: system.appName, distance };
          }
          if (distance <= GAME_CONFIG.discoveryRadius) {
            if (discoverDeployment(game, system.systemId)) {
              game.upgradeCredits += DEPLOYMENT_CREDIT_VALUE;
            }
          }
        }
      }
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
  const enableModelsAfterFirstPaint = useCallback(() => {
    if (modelEnableQueuedRef.current) return;
    modelEnableQueuedRef.current = true;
    window.setTimeout(() => {
      const idleWindow = window as Window & {
        requestIdleCallback?: (callback: () => void, options?: { timeout?: number }) => number;
      };
      if (idleWindow.requestIdleCallback) {
        idleWindow.requestIdleCallback(() => setModelsReady(true), { timeout: 1800 });
      } else {
        setModelsReady(true);
      }
    }, 900);
  }, []);
  const resetRun = useCallback(() => {
    runtimeRef.current.game = createGameState();
    runtimeRef.current.game.runStartedAtMs = performance.now();
    runtimeRef.current.landedStation = null;
    runtimeRef.current.nearbyStation = null;
    runtimeRef.current.nearbyDeploymentId = null;
    runtimeRef.current.playerMode = "flying";
    runtimeRef.current.flight = createFlightState(
      bounds.minX + bounds.width / 2,
      bounds.minY + bounds.height / 2,
    );
    runtimeRef.current.flight.speed = 180;
    setRunEndSnapshot(null);
    setRuntimeVersion((value) => value + 1);
  }, [bounds]);
  const setLandedMode = (mode: PlayerMode) => {
    if (!runtimeRef.current.landedStation) return;
    runtimeRef.current.playerMode = mode;
    setRuntimeVersion((value) => value + 1);
  };
  const buyUpgrade = (kind: "thruster" | "fuel") => {
    const game = runtimeRef.current.game;
    const level = kind === "thruster" ? game.thrusterLevel : game.fuelEfficiencyLevel;
    const cost = getUpgradeCost(level);
    if (game.upgradeCredits < cost) {
      setPickupNotice("Need more deployment data");
      window.setTimeout(() => setPickupNotice(null), 1200);
      return;
    }
    game.upgradeCredits -= cost;
    if (kind === "thruster") {
      game.thrusterLevel += 1;
      runtimeRef.current.flight.speed = Math.max(runtimeRef.current.flight.speed, 210 + game.thrusterLevel * 18);
      setPickupNotice("Thrusters upgraded");
    } else {
      game.fuelEfficiencyLevel += 1;
      game.fuelMax = Math.min(GAME_CONFIG.fuelMax * 1.45, game.fuelMax + 12);
      game.fuel = game.fuelMax;
      setPickupNotice("Fuel system upgraded");
    }
    window.setTimeout(() => setPickupNotice(null), 1200);
    setRuntimeVersion((value) => value + 1);
  };
  const dismissFlightTip = () => {
    window.localStorage.setItem("flux-flight-tip-dismissed", "1");
    setShowFlightTip(false);
    boostLaunchSpeed();
    enableModelsAfterFirstPaint();
    focusInputController(inputControllerRef.current);
    window.requestAnimationFrame(() => wrapRef.current?.focus());
  };

  useEffect(() => {
    if (!showFlightTip) {
      enableModelsAfterFirstPaint();
    }
  }, [enableModelsAfterFirstPaint, showFlightTip]);

  return (
    <section className="scene-shell scene-shell--three">
      <div className={`scene-toolbar ${isCompactLayout ? "scene-toolbar--mobile" : ""}`}>
        <div className="scene-toolbar-group">
          <button
            type="button"
            className="secondary-action"
            onClick={() => setShowSettingsPanel((value) => !value)}
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
            onClick={() => setHudVisible((value) => !value)}
          >
            {hudVisible ? "Hide HUD" : "Show HUD"}
          </button>
          <button
            type="button"
            className="secondary-action"
            onClick={() => setShowSettingsPanel(true)}
          >
            Customize
          </button>
        </div>
        <span className="scene-zoom-label scene-zoom-label--wrap">
          3D chase view | build {BUILD_STAMP} | GLBs {modelsReady ? "streaming" : "paused"}
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
          dpr={qualityMode === "high" ? [1, 1.25] : 1}
          gl={{
            antialias: qualityMode === "high",
            alpha: false,
            powerPreference: "high-performance",
          }}
        >
          <Suspense fallback={null}>
            <ThreeWorld
              runtime={snapshot}
              runtimeVersion={runtimeVersion}
              clusters={activeClusters}
              regionClusters={regionClusters}
              systems={systems}
              stars={stars}
              selectedAppName={selectedAppName}
              selectedSkinId={selectedSkinId}
              searchMatches={matchSet}
              stations={stationByClusterId}
              focusTarget={showFlightTip ? focusTarget : null}
              cloudsEnabled={featureFlags.clouds}
              modelsEnabled={modelsReady}
              qualityMode={qualityMode}
              onSelectApp={onSelectApp}
              onFocusCluster={onFocusCluster}
              onHoverEntity={onHoverEntity}
              onTick={handleRuntimeTick}
            />
          </Suspense>
        </Canvas>

        <div
          className={`scene-overlay-layer ${
            showFlightTip || runEndSnapshot ? "scene-overlay-layer--modal" : ""
          }`}
          onPointerDown={(event) => event.stopPropagation()}
          onPointerMove={(event) => event.stopPropagation()}
          onWheel={(event) => event.stopPropagation()}
        >
          {hudVisible ? overlay : null}
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
          <DebugHud visible={debugHudVisible} stats={debugStats} />
          {pickupNotice ? <div className="pickup-notice">{pickupNotice}</div> : null}
          {snapshot.landedStation ? (
            <StationDockPanel
              station={snapshot.landedStation}
              playerMode={snapshot.playerMode}
              game={snapshot.game}
              onExitPlane={() => setLandedMode("onFoot")}
              onEnterPlane={() => setLandedMode("landed")}
              onOpenShop={() => setLandedMode("shop")}
              onCloseShop={() => setLandedMode("onFoot")}
              onBuyUpgrade={buyUpgrade}
              onTakeOff={() => {
                runtimeRef.current.landedStation = null;
                runtimeRef.current.playerMode = "flying";
                runtimeRef.current.flight.speed = Math.max(190, runtimeRef.current.flight.speed);
                setRuntimeVersion((value) => value + 1);
              }}
            />
          ) : null}
          {showFlightTip ? (
            <div className="scene-flight-tip">
              <p className="scene-flight-tip-title">Welcome to the 3D sky map.</p>
              <ul className="scene-flight-tip-list">
                <li>Use WASD or arrow keys to steer the biplane through deployments.</li>
                <li>Fly close to glowing markers to discover systems and collect pickups.</li>
                <li>Scroll to pull the chase camera closer or farther away.</li>
              </ul>
              <button
                type="button"
                className="primary-action scene-flight-tip-dismiss"
                onPointerDown={(event) => {
                  event.stopPropagation();
                  dismissFlightTip();
                }}
                onClick={dismissFlightTip}
              >
                Start flying
              </button>
            </div>
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

        <TouchFlightPad controllerRef={inputControllerRef} />
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
  systems,
  stars,
  selectedAppName,
  selectedSkinId,
  searchMatches,
  stations,
  focusTarget,
  cloudsEnabled,
  modelsEnabled,
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
  systems: AppSystem[];
  stars: Star[];
  selectedAppName: string | null;
  selectedSkinId: PlaneSkinId;
  searchMatches: Set<string>;
  stations: Map<string, StationLayout>;
  focusTarget: CameraTarget | null;
  cloudsEnabled: boolean;
  modelsEnabled: boolean;
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
  const activeStationModelIds = useMemo(() => {
    if (!modelsEnabled || MAX_STATION_GLB_MODELS[qualityMode] <= 0) {
      return new Set<string>();
    }
    const maxModels = MAX_STATION_GLB_MODELS[qualityMode];
    return new Set(
      [...stations.values()]
        .map((station) => ({
          id: station.id,
          distance: Math.hypot(station.x - runtime.flight.x, station.y - runtime.flight.y),
        }))
        .sort((left, right) => left.distance - right.distance)
        .slice(0, maxModels)
        .map((station) => station.id),
    );
  }, [modelsEnabled, qualityMode, runtime.flight.x, runtime.flight.y, stations]);

  return (
    <>
      <color attach="background" args={["#54b9ff"]} />
      <fog attach="fog" args={["#b7e7ff", 70, 260]} />
      <hemisphereLight args={["#ffffff", "#6ab1df", 1.45]} />
      <directionalLight
        position={[30, 48, 28]}
        intensity={1.85}
      />
      <ambientLight intensity={0.48} />
      <SkyDome />
      {cloudsEnabled ? <CloudFields clusters={regionClusters} /> : null}
      <group>
        {clusters.map((cluster, index) => (
          <CloudIsland
            key={cluster.clusterId}
            cluster={cluster}
            index={index}
            station={stations.get(cluster.clusterId) ?? null}
            modelsEnabled={modelsEnabled && activeStationModelIds.has(cluster.clusterId)}
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
            modelsEnabled={modelsEnabled && index < MAX_DEPLOYMENT_GLB_MODELS[qualityMode]}
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
      {runtime.pickupNotice || selectedAppName ? (
        <HologramPanel
          flight={runtime.flight}
          selectedAppName={selectedAppName}
          notice={runtime.pickupNotice}
        />
      ) : (
        <HologramPanel flight={runtime.flight} selectedAppName={selectedAppName} notice="Find a deployment" />
      )}
      <Biplane
        flight={runtime.flight}
        selectedSkinId={selectedSkinId}
        modelsEnabled={modelsEnabled}
        playerMode={runtime.playerMode}
      />
    </>
  );
}

function ModelInstance(props: {
  src: string;
  scale?: number | [number, number, number];
  position?: [number, number, number];
  rotation?: [number, number, number];
  fallbackColor?: string;
}) {
  return (
    <Suspense fallback={<ModelFallback color={props.fallbackColor} scale={props.scale} position={props.position} />}>
      <LoadedModel {...props} />
    </Suspense>
  );
}

function StationDockPanel({
  station,
  playerMode,
  game,
  onExitPlane,
  onEnterPlane,
  onOpenShop,
  onCloseShop,
  onBuyUpgrade,
  onTakeOff,
}: {
  station: LandingStation;
  playerMode: PlayerMode;
  game: GameState;
  onExitPlane: () => void;
  onEnterPlane: () => void;
  onOpenShop: () => void;
  onCloseShop: () => void;
  onBuyUpgrade: (kind: "thruster" | "fuel") => void;
  onTakeOff: () => void;
}) {
  const refuelAmount = Math.round(getRefuelAmount(game.discoveries.size, game.fuelMax));
  const thrusterCost = getUpgradeCost(game.thrusterLevel);
  const fuelCost = getUpgradeCost(game.fuelEfficiencyLevel);
  const isShop = playerMode === "shop";
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
      {station.kind === "upgrade" && isShop ? (
        <div className="station-shop">
          <button type="button" onClick={() => onBuyUpgrade("thruster")}>
            <span>Thrusters Mk {game.thrusterLevel + 1}</span>
            <strong>{thrusterCost} data</strong>
          </button>
          <button type="button" onClick={() => onBuyUpgrade("fuel")}>
            <span>Fuel system Mk {game.fuelEfficiencyLevel + 1}</span>
            <strong>{fuelCost} data</strong>
          </button>
        </div>
      ) : (
        <p className="station-dock__copy">
          {station.kind === "refuel"
            ? "Refuelling scales with confirmed deployments."
            : "Bank deployment data and fit new parts before takeoff."}
        </p>
      )}
      <div className="station-dock__actions">
        {playerMode === "landed" ? (
          <button type="button" onClick={onExitPlane}>Exit plane</button>
        ) : (
          <button type="button" onClick={onEnterPlane}>Enter plane</button>
        )}
        {station.kind === "upgrade" ? (
          <button type="button" onClick={isShop ? onCloseShop : onOpenShop}>
            {isShop ? "Close shop" : "Open shop"}
          </button>
        ) : null}
        <button type="button" className="station-dock__takeoff" onClick={onTakeOff}>
          Take off
        </button>
      </div>
    </div>
  );
}

function LoadedModel({
  src,
  scale = 1,
  position = [0, 0, 0],
  rotation = [0, 0, 0],
}: {
  src: string;
  scale?: number | [number, number, number];
  position?: [number, number, number];
  rotation?: [number, number, number];
}) {
  const gltf = useLoader(GLTFLoader, src);
  const model = useMemo(() => {
    const clone = gltf.scene.clone(true);
    clone.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(clone);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    clone.position.sub(center);
    clone.position.y += size.y / 2;
    clone.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.castShadow = false;
        child.receiveShadow = false;
        child.frustumCulled = true;
        if (child.material) {
          const materials = Array.isArray(child.material) ? child.material : [child.material];
          materials.forEach((material) => {
            material.needsUpdate = true;
          });
        }
      }
    });
    return clone;
  }, [gltf.scene]);

  return <primitive object={model} scale={scale} position={position} rotation={rotation} />;
}

function ModelFallback({
  color = "#dff8ff",
  scale = 1,
  position = [0, 0, 0],
}: {
  color?: string;
  scale?: number | [number, number, number];
  position?: [number, number, number];
}) {
  const normalizedScale = Array.isArray(scale)
    ? Math.max(scale[0], scale[1], scale[2]) * 28
    : Math.max(0.4, scale * 28);
  return (
    <mesh position={position} scale={normalizedScale}>
      <octahedronGeometry args={[0.5, 0]} />
      <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.16} roughness={0.5} />
    </mesh>
  );
}

function SkyDome() {
  return (
    <mesh scale={[1, 1, 1]} position={[0, -80, 0]}>
      <sphereGeometry args={[520, 32, 16]} />
      <meshBasicMaterial side={THREE.BackSide} color="#46b8ff" transparent opacity={0.76} />
    </mesh>
  );
}

function CloudFields({ clusters }: { clusters: Cluster[] }) {
  return (
    <group>
      {clusters.slice(0, 34).map((cluster, index) => {
        const position = to3(cluster.centroid, -2 - (index % 4) * 0.25);
        return (
          <group key={cluster.clusterId} position={position}>
            <CloudPuff scale={2.2 + Math.min(5.2, cluster.radius * WORLD_SCALE * 0.06)} />
          </group>
        );
      })}
    </group>
  );
}

function CloudPuff({ scale = 1 }: { scale?: number }) {
  return (
    <group scale={scale}>
      {[
        [-1.4, 0, 0],
        [-0.4, 0.35, 0.1],
        [0.7, 0.15, -0.2],
        [1.45, -0.05, 0.1],
      ].map(([x, y, z], index) => (
        <mesh key={index} position={[x, y, z]}>
          <sphereGeometry args={[1.25 - index * 0.08, 16, 10]} />
          <meshStandardMaterial color="#ffffff" transparent opacity={0.48} roughness={0.9} />
        </mesh>
      ))}
    </group>
  );
}

function CloudIsland({
  cluster,
  index,
  station,
  modelsEnabled,
  onFocusCluster,
}: {
  cluster: Cluster;
  index: number;
  station: StationLayout | null;
  modelsEnabled: boolean;
  onFocusCluster: (cluster: Cluster) => void;
}) {
  const position = to3(cluster.centroid, ISLAND_ALTITUDE + (index % 5) * 0.12);
  const radius = clamp(cluster.radius * WORLD_SCALE * 0.38, 3.4, cluster.level === "region" ? 10 : 6.5);
  return (
    <group position={position} onClick={() => scheduleSceneAction(() => onFocusCluster(cluster))}>
      <mesh receiveShadow position={[0, -0.08, 0]}>
        <cylinderGeometry args={[radius * 0.88, radius * 0.96, 0.22, 40]} />
        <meshStandardMaterial color="#dff8ff" emissive="#78e5ff" emissiveIntensity={0.1} roughness={0.48} />
      </mesh>
      <mesh position={[0, 0.08, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[radius * 0.72, 0.08, 8, 48]} />
        <meshStandardMaterial color="#b9f28f" emissive="#62d973" emissiveIntensity={0.18} roughness={0.5} />
      </mesh>
      <CloudPuff scale={radius * 0.26} />
      {station && modelsEnabled ? (
        <group position={[radius * 0.08, 0.18, radius * -0.04]} rotation={[0, index * 0.72, 0]}>
          <ModelInstance
            src={station.kind === "refuel" ? MODEL_PATHS.refuelStation : MODEL_PATHS.upgradeLab}
            scale={station.kind === "refuel" ? radius * 0.44 : radius * 0.4}
          />
          <ModelInstance
            src={MODEL_PATHS.serviceRobot}
            position={[radius * 0.42, 0, radius * 0.28]}
            rotation={[0, Math.PI * 0.2, 0]}
            scale={radius * 0.2}
          />
        </group>
      ) : station ? (
        <RobotAvatar
          position={[radius * 0.34, 2.1, radius * -0.2]}
          color={["#8f6df2", "#44c887", "#f0a33a", "#3fa7f5", "#ec6dc6"][index % 5]}
          scale={1.05}
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
  modelsEnabled,
  onSelectApp,
  onHoverEntity,
}: {
  system: AppSystem;
  selected: boolean;
  index: number;
  modelsEnabled: boolean;
  onSelectApp: (appName: string) => void;
  onHoverEntity: (entity: HoveredEntity | null) => void;
}) {
  const colorway = getBuoyColorway(system);
  const position = to3(system, ISLAND_ALTITUDE + 6.1 + (index % 4) * 0.08);
  return (
    <group
      position={position}
      onClick={(event: ThreeEvent<MouseEvent>) => {
        event.stopPropagation();
        scheduleSceneAction(() => onSelectApp(system.appName));
      }}
      onPointerOver={(event: ThreeEvent<PointerEvent>) => {
        event.stopPropagation();
        onHoverEntity({
          kind: "system",
          id: system.systemId,
          discoveryId: system.systemId,
          label: system.label,
          subtitle: `${system.runtimeFamily} | ${system.projectCategory}`,
          appName: system.appName,
        });
      }}
      onPointerOut={() => onHoverEntity(null)}
    >
      <pointLight color={colorway.beacon} intensity={selected ? 2.9 : 1.35} distance={12} />
      <mesh position={[0, -0.9, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.82, 0.045, 8, 36]} />
        <meshBasicMaterial color={colorway.beacon} transparent opacity={selected ? 0.9 : 0.62} />
      </mesh>
      {modelsEnabled ? <group position={[0, -0.72, 0]} rotation={[0, index * 0.38, 0]}>
        <ModelInstance src={MODEL_PATHS.drone} scale={1.7} />
      </group> : <RobotAvatar color={colorway.main} accent={colorway.beacon} scale={1.02} position={[0, -0.72, 0]} />}
      <mesh position={[0, -1.08, 0]}>
        <cylinderGeometry args={[0.92, 1.12, 0.18, 24]} />
        <meshStandardMaterial color="#dff8ff" emissive={colorway.beacon} emissiveIntensity={0.18} roughness={0.5} />
      </mesh>
      <BillboardGroup position={[0, 2.72, 0]}>
        <BeaconPlaque color={colorway.beacon} compact selected={selected} />
      </BillboardGroup>
    </group>
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
        <RobotAvatar color="#f7d56d" scale={0.42} position={[0, 0, 0]} />
      )}
      <pointLight color={color} intensity={1.1} distance={8} />
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
  flight,
  selectedSkinId,
  modelsEnabled,
  playerMode,
}: {
  flight: FlightState;
  selectedSkinId: PlaneSkinId;
  modelsEnabled: boolean;
  playerMode?: PlayerMode;
}) {
  const palette = selectedSkinId === "classic" ? planeSkinPalettes.classic : planeSkinPalettes[selectedSkinId] ?? planeSkinPalettes.classic;
  const position = to3(flight, PLANE_ALTITUDE);
  return (
    <group position={position} rotation={[0, -flight.heading + Math.PI / 2, 0]} scale={1.42}>
      {modelsEnabled ? (
        <ModelInstance src={MODEL_PATHS.biplane} scale={5.2} />
      ) : null}
      <pointLight color={palette.bodyHi} intensity={0.35} distance={6} position={[0, 0.8, -0.3]} />
      <group visible={!modelsEnabled}>
      <RobotAvatar color={palette.bodyHi} scale={0.36} position={[0, 0.8, -0.45]} visible={playerMode !== "onFoot" && playerMode !== "shop"} />
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
      {playerMode === "onFoot" || playerMode === "shop" ? (
        <RobotAvatar color={palette.bodyHi} scale={0.48} position={[2.1, -0.24, -0.65]} />
      ) : null}
      <pointLight color="#ff9170" intensity={0.85} distance={8} position={[0, 0.5, -1.5]} />
    </group>
  );
}

function RobotAvatar({
  color,
  accent = "#4edfff",
  position,
  scale = 1,
  visible = true,
}: {
  color: string;
  accent?: string;
  position: [number, number, number];
  scale?: number;
  visible?: boolean;
}) {
  return (
    <group position={position} scale={scale} visible={visible}>
      <mesh castShadow position={[0, 1.22, 0]}>
        <sphereGeometry args={[0.68, 28, 18]} />
        <meshStandardMaterial color="#f4fbff" roughness={0.28} metalness={0.04} />
      </mesh>
      <mesh castShadow position={[0, 1.13, -0.08]}>
        <boxGeometry args={[1.04, 0.48, 0.16]} />
        <meshStandardMaterial color="#18395f" emissive={accent} emissiveIntensity={0.18} roughness={0.32} />
      </mesh>
      <mesh position={[-0.24, 1.2, -0.2]}>
        <sphereGeometry args={[0.14, 14, 10]} />
        <meshStandardMaterial color="#7df2ff" emissive={accent} emissiveIntensity={1.2} />
      </mesh>
      <mesh position={[0.24, 1.2, -0.2]}>
        <sphereGeometry args={[0.14, 14, 10]} />
        <meshStandardMaterial color="#7df2ff" emissive={accent} emissiveIntensity={1.2} />
      </mesh>
      <mesh castShadow position={[0, 0.42, 0]}>
        <capsuleGeometry args={[0.46, 0.68, 8, 18]} />
        <meshStandardMaterial color={color} roughness={0.38} />
      </mesh>
      <mesh position={[0, 0.46, -0.36]}>
        <sphereGeometry args={[0.12, 12, 8]} />
        <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={0.9} />
      </mesh>
      <mesh position={[0, 1.92, 0]}>
        <torusGeometry args={[0.18, 0.025, 8, 18]} />
        <meshStandardMaterial color="#d7f1ff" metalness={0.2} />
      </mesh>
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
  useFrame((state) => {
    if (panelRef.current) {
      panelRef.current.position.y += Math.sin(state.clock.elapsedTime * 1.8) * 0.002;
    }
  });
  const position = to3(
    {
      x: flight.x + Math.cos(flight.heading) * 360,
      y: flight.y + Math.sin(flight.heading) * 360,
    },
    PLANE_ALTITUDE + 6,
  );
  return (
    <BillboardGroup position={position}>
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
    ref.current?.quaternion.copy(camera.quaternion);
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
