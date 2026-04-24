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
import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";
import { DebugHud } from "./DebugHud";
import { FlightSettingsPanel } from "./FlightSettingsPanel";
import { MobileDrawer } from "./MobileDrawer";
import { useMediaQuery } from "./useMediaQuery";
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
};

const GAME_STATE_EMIT_INTERVAL_MS = 80;
const WORLD_SCALE = 0.024;
const PLANE_ALTITUDE = 6.4;
const ISLAND_ALTITUDE = 1.2;
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
  });
  const gameEmitTsRef = useRef(0);
  const debugPerfRef = useRef({ lastSampleAtMs: 0, frames: 0, ticks: 0 });
  const [runtimeVersion, setRuntimeVersion] = useState(0);
  const [showSettingsPanel, setShowSettingsPanel] = useState(false);
  const [showActionMenu, setShowActionMenu] = useState(false);
  const [showFlightTip, setShowFlightTip] = useState(false);
  const [hudVisible, setHudVisible] = useState(true);
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
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", () => resetInputController({ controller, blur: true }));
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
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

      for (const system of visibility.detailSystems) {
        const distance = Math.hypot(system.x - nextFlight.x, system.y - nextFlight.y);
        if (distance <= GAME_CONFIG.discoveryRadius) {
          discoverDeployment(game, system.systemId);
        }
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
      selectedAppName,
      starsBySystem,
      systems,
    ],
  );

  const snapshot = runtimeRef.current;
  const debugHudVisible = featureFlags.debugHud || debugHudHotkey;
  const dismissFlightTip = () => {
    window.localStorage.setItem("flux-flight-tip-dismissed", "1");
    setShowFlightTip(false);
    focusInputController(inputControllerRef.current);
    window.requestAnimationFrame(() => wrapRef.current?.focus());
  };

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
            onClick={() => {
              runtimeRef.current.game = createGameState();
              runtimeRef.current.game.runStartedAtMs = performance.now();
              runtimeRef.current.flight = createFlightState(
                bounds.minX + bounds.width / 2,
                bounds.minY + bounds.height / 2,
              );
              setRunEndSnapshot(null);
              setRuntimeVersion((value) => value + 1);
            }}
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
          3D chase view | WASD or arrow keys | scroll changes camera distance
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
          const rect = event.currentTarget.getBoundingClientRect();
          const normalized = ((event.clientX - rect.left) / Math.max(rect.width, 1) - 0.5) * 2;
          setPointerTurnBias(inputControllerRef.current, normalized);
        }}
        onPointerDown={() => {
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
          shadows
          camera={{ position: [0, 18, 32], fov: 50, near: 0.1, far: 1800 }}
          gl={{ antialias: qualityMode !== "low", alpha: true }}
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
              focusTarget={focusTarget}
              cloudsEnabled={featureFlags.clouds}
              qualityMode={qualityMode}
              onSelectApp={onSelectApp}
              onFocusCluster={onFocusCluster}
              onHoverEntity={onHoverEntity}
              onTick={handleRuntimeTick}
            />
          </Suspense>
        </Canvas>

        <div className="scene-overlay-layer">
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
                  runtimeRef.current.game = createGameState();
                  runtimeRef.current.game.runStartedAtMs = performance.now();
                  setRunEndSnapshot(null);
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
  systems: AppSystem[];
  stars: Star[];
  selectedAppName: string | null;
  selectedSkinId: PlaneSkinId;
  searchMatches: Set<string>;
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

  useFrame((state, delta) => {
    onTick(Math.min(delta * 1000, GAME_CONFIG.maxFrameMs), state.clock.elapsedTime);
    const flight = runtime.flight;
    const planePosition = to3(flight, PLANE_ALTITUDE);
    const zoomRatio =
      (runtime.zoom - GAME_CONFIG.zoomMin) /
      Math.max(GAME_CONFIG.zoomMax - GAME_CONFIG.zoomMin, 0.001);
    const distance = THREE.MathUtils.lerp(42, 22, zoomRatio);
    const height = THREE.MathUtils.lerp(22, 12, zoomRatio);
    const behind = new THREE.Vector3(
      -Math.cos(flight.heading) * distance,
      height,
      -Math.sin(flight.heading) * distance,
    );
    const desired = planePosition.clone().add(behind);
    if (focusTarget) {
      desired.lerp(to3(focusTarget, PLANE_ALTITUDE + 18), 0.08);
    }
    const cameraBlend = 1 - Math.exp(-delta * 4.6);
    cameraVelocity.current.subVectors(desired, camera.position).multiplyScalar(cameraBlend);
    camera.position.add(cameraVelocity.current);
    lookTarget.current.lerp(planePosition, 1 - Math.exp(-delta * 7));
    camera.lookAt(lookTarget.current);
  });

  const visibleStars = useMemo(
    () =>
      stars
        .filter((star) => runtime.visibility.detailSystemIds.has(star.systemId))
        .slice(0, qualityMode === "high" ? 180 : qualityMode === "medium" ? 120 : 70),
    [qualityMode, runtime.visibility.detailSystemIds, stars],
  );

  return (
    <>
      <color attach="background" args={["#88d5ff"]} />
      <fog attach="fog" args={["#c6ebff", 42, 210]} />
      <hemisphereLight args={["#ffffff", "#88bde7", 1.25]} />
      <directionalLight
        position={[30, 48, 28]}
        intensity={2.15}
        castShadow={qualityMode !== "low"}
        shadow-mapSize={[1024, 1024]}
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
      <HologramPanel flight={runtime.flight} selectedAppName={selectedAppName} />
      <Biplane flight={runtime.flight} selectedSkinId={selectedSkinId} />
    </>
  );
}

function SkyDome() {
  return (
    <mesh scale={[1, 1, 1]} position={[0, -80, 0]}>
      <sphereGeometry args={[520, 32, 16]} />
      <meshBasicMaterial side={THREE.BackSide} color="#94dfff" transparent opacity={0.62} />
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
  onFocusCluster,
}: {
  cluster: Cluster;
  index: number;
  onFocusCluster: (cluster: Cluster) => void;
}) {
  const position = to3(cluster.centroid, ISLAND_ALTITUDE + (index % 5) * 0.12);
  const radius = clamp(cluster.radius * WORLD_SCALE * 0.32, 2.8, cluster.level === "region" ? 8 : 5);
  return (
    <group position={position} onClick={() => onFocusCluster(cluster)}>
      <mesh receiveShadow castShadow position={[0, 0, 0]}>
        <cylinderGeometry args={[radius * 0.82, radius * 1.05, 1.8, 24]} />
        <meshStandardMaterial color="#79c96e" roughness={0.8} metalness={0.02} />
      </mesh>
      <mesh position={[0, -1.15, 0]} castShadow>
        <coneGeometry args={[radius * 0.88, radius * 1.12, 7]} />
        <meshStandardMaterial color="#7d7470" roughness={0.95} />
      </mesh>
      <CloudPuff scale={radius * 0.32} />
      {cluster.level === "region" ? (
        <RobotAvatar
          position={[radius * 0.34, 1.2, radius * -0.2]}
          color={["#8f6df2", "#44c887", "#f0a33a", "#3fa7f5", "#ec6dc6"][index % 5]}
          scale={0.75}
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
  const position = to3(system, ISLAND_ALTITUDE + 5.5 + (index % 4) * 0.08);
  return (
    <group
      position={position}
      onClick={(event: ThreeEvent<MouseEvent>) => {
        event.stopPropagation();
        onSelectApp(system.appName);
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
      <mesh>
        <sphereGeometry args={[selected ? 0.8 : 0.58, 24, 16]} />
        <meshStandardMaterial
          color={colorway.main}
          emissive={colorway.beacon}
          emissiveIntensity={selected ? 1.25 : 0.62}
          roughness={0.22}
        />
      </mesh>
      <mesh position={[0, -1.1, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <coneGeometry args={[0.28, 1.6, 4]} />
        <meshStandardMaterial color={colorway.main} emissive={colorway.beacon} emissiveIntensity={0.7} />
      </mesh>
      <BillboardGroup position={[0, 1.55, 0]}>
        <BeaconPlaque color={colorway.beacon} compact />
      </BillboardGroup>
    </group>
  );
}

function StarMarker({ star, onSelectApp }: { star: Star; onSelectApp: (appName: string) => void }) {
  const position = to3(star, ISLAND_ALTITUDE + 4.2);
  return (
    <mesh position={position} onClick={() => onSelectApp(star.appName)}>
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

function Biplane({ flight, selectedSkinId }: { flight: FlightState; selectedSkinId: PlaneSkinId }) {
  const palette = planeSkinPalettes[selectedSkinId] ?? planeSkinPalettes.classic;
  const position = to3(flight, PLANE_ALTITUDE);
  const propRef = useRef<THREE.Mesh>(null);
  useFrame((_, delta) => {
    if (propRef.current) {
      propRef.current.rotation.z += delta * 26;
    }
  });
  return (
    <group position={position} rotation={[0, -flight.heading + Math.PI / 2, 0]} scale={1.15}>
      <RobotAvatar color={palette.bodyHi} scale={0.36} position={[0, 0.8, -0.45]} />
      <mesh castShadow rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.38, 0.48, 2.8, 20]} />
        <meshStandardMaterial color={palette.body} roughness={0.35} metalness={0.08} />
      </mesh>
      <mesh castShadow position={[0, 0.18, 0]}>
        <boxGeometry args={[4.8, 0.16, 0.82]} />
        <meshStandardMaterial color={palette.wing} roughness={0.34} />
      </mesh>
      <mesh castShadow position={[0, 1.0, -0.05]}>
        <boxGeometry args={[4.4, 0.16, 0.72]} />
        <meshStandardMaterial color={palette.wingHi} roughness={0.34} />
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
      <mesh ref={propRef} position={[0, 0, -1.58]}>
        <boxGeometry args={[0.12, 1.3, 0.08]} />
        <meshStandardMaterial color="#fff2ba" transparent opacity={0.56} />
      </mesh>
      <pointLight color="#ff9170" intensity={0.85} distance={8} position={[0, 0.5, -1.5]} />
    </group>
  );
}

function RobotAvatar({
  color,
  position,
  scale = 1,
}: {
  color: string;
  position: [number, number, number];
  scale?: number;
}) {
  return (
    <group position={position} scale={scale}>
      <mesh castShadow position={[0, 1.2, 0]}>
        <sphereGeometry args={[0.62, 24, 16]} />
        <meshStandardMaterial color={color} roughness={0.32} metalness={0.08} />
      </mesh>
      <mesh position={[-0.22, 1.28, -0.55]}>
        <sphereGeometry args={[0.12, 12, 8]} />
        <meshStandardMaterial color="#7df2ff" emissive="#4edfff" emissiveIntensity={1.2} />
      </mesh>
      <mesh position={[0.22, 1.28, -0.55]}>
        <sphereGeometry args={[0.12, 12, 8]} />
        <meshStandardMaterial color="#7df2ff" emissive="#4edfff" emissiveIntensity={1.2} />
      </mesh>
      <mesh castShadow position={[0, 0.42, 0]}>
        <capsuleGeometry args={[0.42, 0.6, 8, 16]} />
        <meshStandardMaterial color="#eef7ff" roughness={0.42} />
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
}: {
  flight: FlightState;
  selectedAppName: string | null;
}) {
  const position = to3(
    {
      x: flight.x + Math.cos(flight.heading) * 360,
      y: flight.y + Math.sin(flight.heading) * 360,
    },
    PLANE_ALTITUDE + 6,
  );
  return (
    <BillboardGroup position={position}>
      <group>
        <mesh>
          <planeGeometry args={[8, 4.4]} />
          <meshStandardMaterial
            color="#68dfff"
            emissive="#28bfff"
            emissiveIntensity={0.38}
            transparent
            opacity={0.18}
            side={THREE.DoubleSide}
          />
        </mesh>
        <mesh position={[0, 1.55, 0.06]}>
          <boxGeometry args={[4.2, 0.08, 0.02]} />
          <meshBasicMaterial color="#e7fbff" transparent opacity={0.88} />
        </mesh>
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
          </group>
        ))}
      </group>
    </BillboardGroup>
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

function BeaconPlaque({ color, compact = false }: { color: string; compact?: boolean }) {
  return (
    <group>
      <mesh>
        <planeGeometry args={compact ? [1.3, 0.28] : [2.2, 0.38]} />
        <meshBasicMaterial color="#0c1f38" transparent opacity={0.72} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0, 0, 0.02]}>
        <planeGeometry args={compact ? [0.86, 0.06] : [1.5, 0.08]} />
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
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
