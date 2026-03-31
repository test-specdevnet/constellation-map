"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent,
  type ReactNode,
  type WheelEvent,
} from "react";
import { DebugHud } from "./DebugHud";
import { FlightSettingsPanel } from "./FlightSettingsPanel";
import {
  drawFuelCanPickup,
  drawDeploymentBuoy,
  drawParallaxCloudLayers,
  drawProjectile,
  drawProximityHoverCard,
  drawSpeedBoostPickup,
  drawTopDownBiplane,
  getParallaxCloudCount,
  planeSkinPalettes,
  type PlaneSkinId,
} from "../../lib/canvas/cartoonMarkers";
import { categoryLabel, getBuoyColorway } from "../../lib/canvas/buoyCategory";
import {
  applyFisheyeToPoint,
  getAnchorRadius,
  getClusterRenderRadius,
  getDensityAlpha,
  getDisclosureState,
  getLensRadius,
  scaleDensityJitter,
  type DisclosureBand,
  type FlightTelemetry,
} from "../../lib/layout/focusContext";
import type { AppSystem, Cluster, SceneBounds, Star } from "../../lib/types/star";
import {
  GAME_CONFIG,
  clamp,
  getEnemyCap,
  getEnemySpawnDelayMs,
  resolveQualityMode,
  type FeatureFlags,
  type FlightSettings,
} from "../../lib/game/config";
import { buildDeploymentVisibilityState } from "../../lib/game/deploymentVisibility";
import { updateEffects } from "../../lib/game/effects";
import {
  computeCameraFollowTarget,
  computeViewportWorldBounds,
  createFlightState,
  getDefaultZoom,
  integrateFlightState,
} from "../../lib/game/flightController";
import {
  createProjectile,
  resolveEnemyPlaneCollisions,
  scheduleNextEnemySpawn,
  spawnEnemyPlane,
  updateEnemies,
  updateProjectiles,
} from "../../lib/game/enemies";
import { clampFuel, collectNearbyPickups, maintainCollectibles } from "../../lib/game/pickups";
import {
  applyDeploymentDiscoveries,
  createGameState,
  createSessionSnapshot,
  toRunRecord,
  updateRunResources,
} from "../../lib/game/session";
import type {
  DeploymentVisibilityState,
  DebugHudSnapshot,
  FlightInputState,
  FlightState,
  GameSessionSnapshot,
  GameState,
  RunRecord,
  VisualEffect,
} from "../../lib/game/types";

export type HoveredEntity =
  | {
      kind: "cluster";
      id: string;
      label: string;
      subtitle: string;
    }
  | {
      kind: "system" | "star";
      id: string;
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

type CameraState = {
  x: number;
  y: number;
  zoom: number;
};

type Renderable = {
  entity: HoveredEntity;
  x: number;
  y: number;
  radius: number;
  cluster?: Cluster;
};

type SceneCanvasProps = {
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

const FLIGHT_TIP_KEY = "flux-flight-tip-dismissed";
const EMPTY_VISIBILITY: DeploymentVisibilityState = {
  visibleSystems: [],
  detailSystems: [],
  detailSystemIds: new Set<string>(),
  visibleStarsBySystem: new Map<string, Star[]>(),
  clusterMarkers: [],
};

const createInitialDebugHudSnapshot = (): DebugHudSnapshot => ({
  fps: 0,
  frameMs: 0,
  tickRate: 0,
  counts: {
    deployments: 0,
    clusters: 0,
    enemies: 0,
    bullets: 0,
    pickups: 0,
    clouds: 0,
  },
  input: {
    turnAxis: 0,
    throttleAxis: 0,
    firePressed: false,
  },
  player: {
    speed: 0,
    hull: GAME_CONFIG.hullMax,
    fuel: GAME_CONFIG.fuelMax,
    boostRemainingMs: 0,
  },
  lastPickupEvent: null,
});

const lerp = (from: number, to: number, amount: number) => from + (to - from) * amount;

const lerpAngle = (from: number, to: number, amount: number) => {
  let delta = to - from;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  return from + delta * amount;
};

const worldToScreen = (
  world: { x: number; y: number },
  canvasSize: { width: number; height: number },
  camera: CameraState,
) => ({
  x: (world.x - camera.x) * camera.zoom + canvasSize.width / 2,
  y: (world.y - camera.y) * camera.zoom + canvasSize.height / 2,
});

const screenToWorld = (
  screen: { x: number; y: number },
  canvasSize: { width: number; height: number },
  camera: CameraState,
) => ({
  x: (screen.x - canvasSize.width / 2) / camera.zoom + camera.x,
  y: (screen.y - canvasSize.height / 2) / camera.zoom + camera.y,
});

const normalizeWheel = (event: WheelEvent) => {
  let delta = event.deltaY;
  if (event.deltaMode === 1) {
    delta *= 16;
  } else if (event.deltaMode === 2) {
    delta *= 800;
  }
  return Math.max(-220, Math.min(220, delta));
};

const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  window.matchMedia &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const mapToControlKey = (raw: string): string | null => {
  if (
    raw === "ArrowUp" ||
    raw === "ArrowDown" ||
    raw === "ArrowLeft" ||
    raw === "ArrowRight"
  ) {
    return raw;
  }
  if (raw === "w" || raw === "W") return "ArrowUp";
  if (raw === "s" || raw === "S") return "ArrowDown";
  if (raw === "a" || raw === "A") return "ArrowLeft";
  if (raw === "d" || raw === "D") return "ArrowRight";
  if (raw === " " || raw === "Spacebar" || raw === "f" || raw === "F") return "Fire";
  return null;
};

const centroidOfWorld = (stars: Star[], systems: AppSystem[], bounds: SceneBounds) => {
  if (systems.length > 0) {
    const sum = systems.reduce(
      (acc, system) => ({
        x: acc.x + system.x,
        y: acc.y + system.y,
      }),
      { x: 0, y: 0 },
    );
    return {
      x: sum.x / systems.length,
      y: sum.y / systems.length,
    };
  }

  if (stars.length > 0) {
    const sum = stars.reduce(
      (acc, star) => ({
        x: acc.x + star.x,
        y: acc.y + star.y,
      }),
      { x: 0, y: 0 },
    );
    return {
      x: sum.x / stars.length,
      y: sum.y / stars.length,
    };
  }

  return {
    x: bounds.minX + bounds.width / 2,
    y: bounds.minY + bounds.height / 2,
  };
};

const zoomAtPoint = (
  camera: CameraState,
  flight: FlightState,
  canvasSize: { width: number; height: number },
  screen: { x: number; y: number },
  nextZoom: number,
) => {
  const z = clamp(nextZoom, GAME_CONFIG.zoomMin, GAME_CONFIG.zoomMax);
  const world = screenToWorld(screen, canvasSize, camera);
  flight.x = world.x - (screen.x - canvasSize.width / 2) / z;
  flight.y = world.y - (screen.y - canvasSize.height / 2) / z;
  camera.zoom = z;
};

const offscreen = (
  point: { x: number; y: number },
  radius: number,
  canvasSize: { width: number; height: number },
) =>
  point.x < -radius ||
  point.y < -radius ||
  point.x > canvasSize.width + radius ||
  point.y > canvasSize.height + radius;

const titleCase = (value: string) =>
  value
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");

const getClusterBadgeRadius = ({
  radius,
  level,
  band,
}: {
  radius: number;
  level: Cluster["level"];
  band: DisclosureBand;
}) => {
  const scale = band === "overview" ? 0.52 : band === "mid" ? 0.42 : 0.34;
  const min = level === "region" ? 16 : 12;
  const max = level === "region" ? (band === "overview" ? 54 : 32) : 24;
  return clamp(radius * scale, min, max);
};

const drawClusterCloud = ({
  ctx,
  x,
  y,
  radius,
  alpha,
  label,
  active,
  rare,
  level,
  band,
}: {
  ctx: CanvasRenderingContext2D;
  x: number;
  y: number;
  radius: number;
  alpha: number;
  label: string;
  active: boolean;
  rare: boolean;
  level: Cluster["level"];
  band: DisclosureBand;
}) => {
  const compact = band !== "overview";
  const displayRadius = getClusterBadgeRadius({ radius, level, band });
  const coreColor =
    level === "region"
      ? active
        ? "rgba(255, 255, 255, 0.98)"
        : "rgba(247, 251, 255, 0.95)"
      : active
        ? "rgba(255, 236, 197, 0.98)"
        : "rgba(255, 228, 192, 0.95)";
  const outline = rare ? "rgba(255, 246, 196, 0.92)" : "rgba(255, 255, 255, 0.82)";

  ctx.save();
  ctx.globalAlpha = Math.min(alpha, compact ? 0.84 : 0.78);

  const glowRadius = displayRadius * (compact ? 1.15 : 1.35);
  const glow = ctx.createRadialGradient(x, y, displayRadius * 0.08, x, y, glowRadius);
  glow.addColorStop(
    0,
    level === "runtime"
      ? active
        ? "rgba(255, 240, 214, 0.16)"
        : "rgba(255, 240, 214, 0.08)"
      : active
        ? "rgba(255,255,255,0.12)"
        : "rgba(255,255,255,0.06)",
  );
  glow.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(x, y, glowRadius, 0, Math.PI * 2);
  ctx.fill();

  ctx.lineWidth = active ? 2.1 : 1.5;
  ctx.strokeStyle = outline;
  ctx.beginPath();
  ctx.arc(x, y, displayRadius * 0.92, 0, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = coreColor;
  ctx.beginPath();
  ctx.arc(x, y, compact ? 4.2 : 5.2, 0, Math.PI * 2);
  ctx.fill();

  if (rare) {
    ctx.setLineDash([4, 6]);
    ctx.strokeStyle = "rgba(255, 246, 196, 0.88)";
    ctx.beginPath();
    ctx.arc(x, y, displayRadius + 8, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  ctx.fillStyle = "rgba(255,255,255,0.94)";
  ctx.font = active
    ? compact
      ? "700 12px Segoe UI, system-ui, sans-serif"
      : "700 13px Segoe UI, system-ui, sans-serif"
    : compact
      ? "600 11px Segoe UI, system-ui, sans-serif"
      : "600 12px Segoe UI, system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(label, x, y + displayRadius + 16);
  ctx.restore();
};

const drawEnemyPlaneMarker = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  heading: number,
  timestamp: number,
) => {
  const prop = (timestamp / 28) % (Math.PI * 2);
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(heading);
  ctx.scale(0.58, 0.58);
  ctx.lineJoin = "round";
  ctx.lineWidth = 3;
  ctx.strokeStyle = "#dce5f6";

  ctx.fillStyle = "#070a10";
  ctx.beginPath();
  ctx.moveTo(24, 0);
  ctx.bezierCurveTo(18, 10, 4, 10, -8, 8);
  ctx.bezierCurveTo(-20, 6, -28, 4, -30, 0);
  ctx.bezierCurveTo(-28, -4, -20, -6, -8, -8);
  ctx.bezierCurveTo(4, -10, 18, -10, 24, 0);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(-8, -30);
  ctx.lineTo(8, -30);
  ctx.lineTo(10, 30);
  ctx.lineTo(-10, 30);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = "#e7efff";
  ctx.beginPath();
  ctx.arc(25, 0, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#070a10";
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.strokeStyle = "rgba(223, 231, 247, 0.66)";
  ctx.beginPath();
  ctx.arc(25, 0, 10, prop, prop + Math.PI * 1.15);
  ctx.stroke();
  ctx.restore();
};

const drawDeploymentClusterMarker = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  count: number,
) => {
  const radius = Math.max(10, Math.min(18, 8 + Math.log2(count + 1) * 2.4));
  ctx.save();
  ctx.translate(x, y);

  const glow = ctx.createRadialGradient(0, 0, radius * 0.2, 0, 0, radius * 1.8);
  glow.addColorStop(0, "rgba(145, 239, 255, 0.28)");
  glow.addColorStop(1, "rgba(126, 210, 255, 0)");
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(0, 0, radius * 1.8, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "rgba(111, 196, 255, 0.9)";
  ctx.strokeStyle = "rgba(255,255,255,0.84)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(-radius, -radius, radius * 2, radius * 2, 6);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = "#07101f";
  ctx.font = "700 11px Segoe UI, system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(`${count}`, 0, 1);
  ctx.restore();
};

const drawVisualEffect = (
  ctx: CanvasRenderingContext2D,
  effect: VisualEffect,
  x: number,
  y: number,
) => {
  const progress = clamp(effect.ageMs / Math.max(effect.ttlMs, 1), 0, 1);
  const alpha = 1 - progress;

  ctx.save();
  ctx.globalAlpha = alpha;

  if (effect.kind === "tracer") {
    ctx.strokeStyle = effect.color;
    ctx.lineWidth = Math.max(2, effect.size * 0.18);
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x - effect.vx * 0.06, y - effect.vy * 0.06);
    ctx.stroke();
    ctx.restore();
    return;
  }

  const radius =
    effect.kind === "explosion"
      ? effect.size * (0.45 + progress * 0.7)
      : effect.size * (0.3 + progress * 0.4);
  const fill = ctx.createRadialGradient(x, y, radius * 0.1, x, y, radius);
  fill.addColorStop(0, effect.color);
  fill.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
};

const findHoveredRenderable = (
  pointer: { x: number; y: number } | null,
  renderables: Renderable[],
) => {
  if (!pointer) {
    return null;
  }

  let closest: { renderable: Renderable; distance: number } | null = null;
  for (const renderable of renderables) {
    const dx = renderable.x - pointer.x;
    const dy = renderable.y - pointer.y;
    const distanceToRenderable = Math.hypot(dx, dy);

    if (
      distanceToRenderable <= renderable.radius &&
      (!closest || distanceToRenderable < closest.distance)
    ) {
      closest = { renderable, distance: distanceToRenderable };
    }
  }

  return closest?.renderable ?? null;
};

export function SceneCanvas({
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
}: SceneCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const pointerRef = useRef<{ x: number; y: number } | null>(null);
  const hoveredRenderableRef = useRef<Renderable | null>(null);
  const currentCameraRef = useRef<CameraState>({ x: 0, y: 0, zoom: getDefaultZoom() });
  const previousCameraRef = useRef<CameraState>({ x: 0, y: 0, zoom: getDefaultZoom() });
  const camFollowRef = useRef({ x: 0, y: 0 });
  const flightRef = useRef<FlightState>(createFlightState(0, 0));
  const previousFlightRef = useRef<FlightState>(createFlightState(0, 0));
  const gameRef = useRef<GameState>(createGameState());
  const visibilityRef = useRef<DeploymentVisibilityState>(EMPTY_VISIBILITY);
  const lastVisibilityUpdateRef = useRef(0);
  const disclosureRef = useRef<{
    band: DisclosureBand;
    activeRegionId: string | null;
    activeRuntimeId: string | null;
    nearbySystemId: string | null;
    nearestRegionDistance: number | null;
    nearestSystemDistance: number | null;
  }>({
    band: "overview",
    activeRegionId: null,
    activeRuntimeId: null,
    nearbySystemId: null,
    nearestRegionDistance: null,
    nearestSystemDistance: null,
  });
  const onHoverEntityRef = useRef(onHoverEntity);
  const onTelemetryRef = useRef(onTelemetry);
  const onGameStateChangeRef = useRef(onGameStateChange);
  const onRunCompleteRef = useRef(onRunComplete);
  const keysRef = useRef<Set<string>>(new Set());
  const animationFrameRef = useRef<number | null>(null);
  const backgroundCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const lastAnimTsRef = useRef<number | null>(null);
  const accumulatorRef = useRef(0);
  const focusKeyAppliedRef = useRef<string | null>(null);
  const telemetryEmitTsRef = useRef(0);
  const gameEmitTsRef = useRef(0);
  const flightSeededRef = useRef(false);
  const pointerInSceneRef = useRef(false);
  const debugPerfRef = useRef({ lastSampleAtMs: 0, frames: 0, ticks: 0 });
  const debugInputRef = useRef({ turnAxis: 0, throttleAxis: 0, firePressed: false });
  const lastPickupEventRef = useRef<string | null>(null);
  const [canvasSize, setCanvasSize] = useState({ width: 1200, height: 760 });
  const [showFlightTip, setShowFlightTip] = useState(false);
  const [showSettingsPanel, setShowSettingsPanel] = useState(false);
  const [debugHudHotkey, setDebugHudHotkey] = useState(false);
  const [debugStats, setDebugStats] = useState<DebugHudSnapshot>(createInitialDebugHudSnapshot);

  const regionClusters = useMemo(
    () => clusters.filter((cluster) => cluster.level === "region"),
    [clusters],
  );
  const runtimeClusters = useMemo(
    () => clusters.filter((cluster) => cluster.level === "runtime"),
    [clusters],
  );
  const runtimeClustersByRegion = useMemo(() => {
    const map = new Map<string, Cluster[]>();

    for (const cluster of runtimeClusters) {
      const parentId = cluster.parentId ?? "";
      const existing = map.get(parentId);
      if (existing) {
        existing.push(cluster);
      } else {
        map.set(parentId, [cluster]);
      }
    }

    for (const value of map.values()) {
      value.sort((left, right) => left.label.localeCompare(right.label));
    }

    return map;
  }, [runtimeClusters]);
  const starsBySystem = useMemo(() => {
    const map = new Map<string, Star[]>();
    for (const star of stars) {
      const existing = map.get(star.systemId);
      if (existing) {
        existing.push(star);
      } else {
        map.set(star.systemId, [star]);
      }
    }
    return map;
  }, [stars]);
  const matchSet = useMemo(() => new Set(searchMatches), [searchMatches]);
  const reducedMotion = prefersReducedMotion();
  const qualityMode = useMemo(
    () =>
      resolveQualityMode({
        settings: flightSettings,
        reducedMotion,
        deviceMemory:
          typeof navigator !== "undefined" && "deviceMemory" in navigator
            ? Number((navigator as Navigator & { deviceMemory?: number }).deviceMemory)
            : undefined,
        hardwareConcurrency:
          typeof navigator !== "undefined" ? navigator.hardwareConcurrency : undefined,
      }),
    [flightSettings, reducedMotion],
  );
  const debugHudVisible = featureFlags.debugHud || debugHudHotkey;
  const resetTransientControls = useCallback(() => {
    keysRef.current.clear();
    pointerRef.current = null;
    pointerInSceneRef.current = false;
    debugInputRef.current = {
      turnAxis: 0,
      throttleAxis: 0,
      firePressed: false,
    };
  }, []);

  useEffect(() => {
    onHoverEntityRef.current = onHoverEntity;
  }, [onHoverEntity]);

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
    try {
      if (
        typeof sessionStorage !== "undefined" &&
        !sessionStorage.getItem(FLIGHT_TIP_KEY)
      ) {
        setShowFlightTip(true);
      }
    } catch {
      setShowFlightTip(true);
    }
  }, []);

  useEffect(() => {
    if ((!systems.length && !stars.length) || flightSeededRef.current) {
      return;
    }

    const center = centroidOfWorld(stars, systems, bounds);
    flightRef.current = createFlightState(center.x, center.y);
    previousFlightRef.current = { ...flightRef.current };
    camFollowRef.current = { x: center.x, y: center.y };
    currentCameraRef.current = {
      x: center.x,
      y: center.y,
      zoom: getDefaultZoom(),
    };
    previousCameraRef.current = { ...currentCameraRef.current };
    gameRef.current = createGameState();
    visibilityRef.current = EMPTY_VISIBILITY;
    lastVisibilityUpdateRef.current = 0;
    accumulatorRef.current = 0;
    flightSeededRef.current = true;
  }, [bounds, stars, systems]);

  useEffect(() => {
    const measure = () => {
      const boundsRect = wrapRef.current?.getBoundingClientRect();
      if (!boundsRect) {
        return;
      }
      setCanvasSize({
        width: Math.max(320, Math.floor(boundsRect.width)),
        height: Math.max(520, Math.floor(boundsRect.height)),
      });
    };

    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  useEffect(() => {
    if (!focusTarget || focusKeyAppliedRef.current === focusTarget.key) {
      return;
    }

    focusKeyAppliedRef.current = focusTarget.key;
    flightRef.current.x = focusTarget.x;
    flightRef.current.y = focusTarget.y;
    flightRef.current.speed *= 0.15;
    flightRef.current.angVel *= 0.25;
    previousFlightRef.current = { ...flightRef.current };
    camFollowRef.current = { x: focusTarget.x, y: focusTarget.y };
    currentCameraRef.current.x = focusTarget.x;
    currentCameraRef.current.y = focusTarget.y;
    currentCameraRef.current.zoom = clamp(
      focusTarget.zoom,
      GAME_CONFIG.zoomMin,
      GAME_CONFIG.zoomMax,
    );
    previousCameraRef.current = { ...currentCameraRef.current };
    accumulatorRef.current = 0;
  }, [focusTarget]);

  useEffect(() => {
    const flightKeysActive = () => {
      const wrap = wrapRef.current;
      if (!wrap) return pointerInSceneRef.current;
      const activeElement = document.activeElement;
      return (
        pointerInSceneRef.current ||
        activeElement === wrap ||
        (activeElement !== null && wrap.contains(activeElement))
      );
    };

    const down = (event: KeyboardEvent) => {
      if (event.key === "F3") {
        event.preventDefault();
        setDebugHudHotkey((current) => !current);
        return;
      }
      if (!flightKeysActive()) return;
      const mapped = mapToControlKey(event.key);
      if (!mapped) return;
      event.preventDefault();
      keysRef.current.add(mapped);
    };

    const up = (event: KeyboardEvent) => {
      const mapped = mapToControlKey(event.key);
      if (mapped) keysRef.current.delete(mapped);
    };

    const handleBlur = () => {
      resetTransientControls();
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        resetTransientControls();
      }
    };

    window.addEventListener("keydown", down, { passive: false });
    window.addEventListener("keyup", up);
    window.addEventListener("blur", handleBlur);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", handleBlur);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [resetTransientControls]);

  useEffect(() => {
    if (showSettingsPanel) {
      resetTransientControls();
    }
  }, [resetTransientControls, showSettingsPanel]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const context = canvas.getContext("2d");
    if (!context) {
      return;
    }

    const devicePixelRatio = window.devicePixelRatio || 1;
    canvas.width = Math.floor(canvasSize.width * devicePixelRatio);
    canvas.height = Math.floor(canvasSize.height * devicePixelRatio);
    canvas.style.width = `${canvasSize.width}px`;
    canvas.style.height = `${canvasSize.height}px`;
    context.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);

    const backgroundCanvas = document.createElement("canvas");
    const backgroundContext = backgroundCanvas.getContext("2d");
    backgroundCanvasRef.current = backgroundCanvas;

    if (backgroundContext) {
      backgroundCanvas.width = canvas.width;
      backgroundCanvas.height = canvas.height;
      backgroundContext.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);

      const sky = backgroundContext.createLinearGradient(0, canvasSize.height, 0, 0);
      sky.addColorStop(0, "#d5edff");
      sky.addColorStop(0.36, "#9ddcff");
      sky.addColorStop(0.7, "#55bbf4");
      sky.addColorStop(1, "#1e95ea");
      backgroundContext.fillStyle = sky;
      backgroundContext.fillRect(0, 0, canvasSize.width, canvasSize.height);

      const sunGlow = backgroundContext.createRadialGradient(
        canvasSize.width * 0.16,
        canvasSize.height * 0.16,
        0,
        canvasSize.width * 0.16,
        canvasSize.height * 0.16,
        canvasSize.height * 0.54,
      );
      sunGlow.addColorStop(0, "rgba(255,255,255,0.38)");
      sunGlow.addColorStop(0.4, "rgba(255,244,214,0.16)");
      sunGlow.addColorStop(1, "rgba(255,255,255,0)");
      backgroundContext.fillStyle = sunGlow;
      backgroundContext.fillRect(0, 0, canvasSize.width, canvasSize.height);

      const lowerHaze = backgroundContext.createLinearGradient(
        0,
        canvasSize.height * 0.58,
        0,
        canvasSize.height,
      );
      lowerHaze.addColorStop(0, "rgba(255,255,255,0)");
      lowerHaze.addColorStop(1, "rgba(241,249,255,0.26)");
      backgroundContext.fillStyle = lowerHaze;
      backgroundContext.fillRect(
        0,
        canvasSize.height * 0.52,
        canvasSize.width,
        canvasSize.height * 0.48,
      );
    }

    const draw = (timestamp: number) => {
      const flight = flightRef.current;
      const camera = currentCameraRef.current;
      const game = gameRef.current;

      if (game.runStartedAtMs === 0) {
        game.runStartedAtMs = timestamp;
      }

      const lastTs = lastAnimTsRef.current ?? timestamp;
      const frameMs = clamp(timestamp - lastTs, 0, GAME_CONFIG.maxFrameMs);
      lastAnimTsRef.current = timestamp;
      debugPerfRef.current.frames += 1;
      accumulatorRef.current = Math.min(
        accumulatorRef.current + frameMs,
        GAME_CONFIG.maxFrameMs,
      );

      while (accumulatorRef.current >= GAME_CONFIG.fixedStepMs) {
        const dtMs = GAME_CONFIG.fixedStepMs;
        debugPerfRef.current.ticks += 1;
        previousFlightRef.current = { ...flight };
        previousCameraRef.current = { ...camera };
        game.playerFireCooldownMs = Math.max(0, game.playerFireCooldownMs - dtMs);

        const mouseTurn =
          pointerRef.current && pointerInSceneRef.current
            ? clamp(
                ((pointerRef.current.x - canvasSize.width / 2) /
                  Math.max(canvasSize.width / 2, 1)) *
                  flightSettings.mouseSensitivity *
                  1.35,
                -1,
                1,
              )
            : 0;
        const input: FlightInputState = {
          accelerate: keysRef.current.has("ArrowUp"),
          brake: keysRef.current.has("ArrowDown"),
          turnLeft: keysRef.current.has("ArrowLeft"),
          turnRight: keysRef.current.has("ArrowRight"),
          fire: keysRef.current.has("Fire"),
          mouseTurn,
        };
        debugInputRef.current = {
          turnAxis: clamp(
            (input.turnRight ? 1 : 0) - (input.turnLeft ? 1 : 0) + mouseTurn,
            -1,
            1,
          ),
          throttleAxis: clamp(
            (input.accelerate ? 1 : 0) - (input.brake ? 1 : 0),
            -1,
            1,
          ),
          firePressed: input.fire,
        };

        const nextFlight = integrateFlightState({
          flight,
          input,
          bounds,
          dtMs,
          qualityMode,
          boostActive: featureFlags.pickups && game.boostUntilMs > timestamp,
        });
        Object.assign(flight, nextFlight);

        const disclosure = getDisclosureState({
          zoom: camera.zoom,
          plane: { x: flight.x, y: flight.y },
          clusters,
          systems,
        });
        disclosureRef.current = disclosure;

        if (timestamp - lastVisibilityUpdateRef.current >= 110) {
          visibilityRef.current = buildDeploymentVisibilityState({
            systems,
            starsBySystem,
            clusters,
            flight,
            disclosure,
            selectedAppName,
            searchMatches: matchSet,
            qualityMode,
            densityLimitsEnabled: featureFlags.deploymentClustering,
          });
          lastVisibilityUpdateRef.current = timestamp;
        }

        applyDeploymentDiscoveries({
          game,
          systems: visibilityRef.current.visibleSystems,
          flight,
        });

        if (featureFlags.pickups) {
          const maintained = maintainCollectibles({
            collectibles: game.collectibles,
            bounds,
            plane: flight,
            anchorSystems: visibilityRef.current.visibleSystems
              .slice(0, 10)
              .map((system) => ({ x: system.x, y: system.y })),
            activeEnemies: game.enemies,
            nowMs: timestamp,
            spawnCounter: game.spawnCounter,
            enableFuel: featureFlags.fuelSystem,
            enableBoosts: featureFlags.pickups,
          });
          game.collectibles = maintained.collectibles;
          game.spawnCounter = maintained.spawnCounter;
        } else {
          game.collectibles = [];
        }

        const viewportBounds = computeViewportWorldBounds({
          camera,
          canvasSize,
        });

        if (featureFlags.enemyPlanes) {
          if (game.nextEnemySpawnAtMs === 0) {
            game.nextEnemySpawnAtMs =
              game.runStartedAtMs +
              Math.min(
                GAME_CONFIG.initialEnemySpawnMaxMs,
                getEnemySpawnDelayMs({
                  elapsedMs: 0,
                  score: 0,
                  qualityMode,
                  seed: `initial:${systems.length}`,
                }),
              );
          }

          if (
            game.state === "flying" &&
            timestamp >= game.nextEnemySpawnAtMs &&
            game.enemies.length <
              getEnemyCap({
                elapsedMs: Math.max(0, timestamp - game.runStartedAtMs),
                score: game.score,
                qualityMode,
                enemyDensity: flightSettings.enemyDensity,
              })
          ) {
            game.spawnCounter += 1;
            const spawnedEnemy = spawnEnemyPlane({
              bounds,
              plane: flight,
              viewport: viewportBounds,
              nowMs: timestamp,
              seed: `enemy:${game.spawnCounter}:${Math.round(timestamp)}`,
              elapsedMs: Math.max(0, timestamp - game.runStartedAtMs),
              score: game.score,
              qualityMode,
            });

            if (spawnedEnemy) {
              game.enemies.push(spawnedEnemy);
            }

            game.nextEnemySpawnAtMs = scheduleNextEnemySpawn({
              nowMs: timestamp,
              elapsedMs: Math.max(0, timestamp - game.runStartedAtMs),
              score: game.score,
              qualityMode,
              spawnCounter: game.spawnCounter,
            });
          }
        } else {
          game.enemies = [];
          game.nextEnemySpawnAtMs = 0;
        }

        const stepEffects: VisualEffect[] = [];
        if (featureFlags.combat && game.state === "flying" && input.fire && game.playerFireCooldownMs <= 0) {
          game.projectiles.push(
            createProjectile({
              owner: "player",
              x: flight.x + Math.cos(flight.heading) * 55,
              y: flight.y + Math.sin(flight.heading) * 55,
              heading: flight.heading,
              speed: GAME_CONFIG.playerProjectileSpeed,
            }),
          );
          stepEffects.push({
            id: `muzzle:${timestamp}:${Math.random().toString(36).slice(2, 7)}`,
            kind: "muzzle",
            x: flight.x + Math.cos(flight.heading) * 46,
            y: flight.y + Math.sin(flight.heading) * 46,
            vx: 0,
            vy: 0,
            ttlMs: 150,
            ageMs: 0,
            size: 22,
            color: "rgba(255, 222, 143, 0.95)",
          });
          game.playerFireCooldownMs = 240;
        }

        if (featureFlags.enemyPlanes) {
          const enemyResult = updateEnemies({
            enemies: game.enemies,
            plane: flight,
            dtMs,
            nowMs: timestamp,
          });
          game.enemies = enemyResult.enemies;
          if (featureFlags.combat) {
            game.projectiles.push(...enemyResult.spawnedProjectiles);
          }
          stepEffects.push(...enemyResult.effects);
        }

        let destroyedEnemyIds = new Set<string>();
        let playerHullDamage = 0;

        if (featureFlags.combat) {
          const projectileResult = updateProjectiles({
            projectiles: game.projectiles,
            enemies: game.enemies,
            plane: flight,
            dtMs,
          });
          game.projectiles = projectileResult.projectiles;
          destroyedEnemyIds = new Set(projectileResult.destroyedEnemyIds);
          playerHullDamage += projectileResult.playerHullDamage;
          stepEffects.push(...projectileResult.effects);
        } else {
          game.projectiles = [];
        }

        const pickupResult = collectNearbyPickups({
          collectibles: game.collectibles,
          plane: flight,
          nowMs: timestamp,
        });
        game.collectibles = pickupResult.collectibles;
        game.fuel = clampFuel(game.fuel + pickupResult.fuelDelta, game.fuelMax);
        if (pickupResult.fuelDelta > 0) {
          lastPickupEventRef.current = `Fuel +${Math.round(pickupResult.fuelDelta)}`;
        }
        if (featureFlags.pickups && pickupResult.boostUntilMs > 0) {
          game.boostUntilMs = Math.max(game.boostUntilMs, pickupResult.boostUntilMs);
          lastPickupEventRef.current = `Boost ${(pickupResult.boostUntilMs - timestamp) / 1000}s`;
        }
        stepEffects.push(...pickupResult.effects);

        if (featureFlags.enemyPlanes) {
          const collisionResult = resolveEnemyPlaneCollisions({
            enemies: game.enemies,
            plane: flight,
          });
          destroyedEnemyIds = new Set([
            ...destroyedEnemyIds,
            ...collisionResult.destroyedEnemyIds,
          ]);
          playerHullDamage += collisionResult.playerHullDamage;
          stepEffects.push(...collisionResult.effects);
        }

        if (destroyedEnemyIds.size > 0) {
          const killsThisStep = game.enemies.filter((enemy) => destroyedEnemyIds.has(enemy.id)).length;
          game.kills += killsThisStep;
          game.score += killsThisStep * GAME_CONFIG.enemyScore;
          game.enemies = game.enemies.filter((enemy) => !destroyedEnemyIds.has(enemy.id));
        }

        if (playerHullDamage > 0) {
          game.hull = clamp(game.hull - playerHullDamage, 0, game.hullMax);
          game.lastDamageAtMs = timestamp;
        }

        updateRunResources({
          game,
          flight,
          dtMs,
          nowMs: timestamp,
          qualityMode,
          featureFlags,
        });

        if (!featureFlags.pickups) {
          game.boostUntilMs = 0;
        }

        game.effects = updateEffects({
          effects: [...game.effects, ...stepEffects],
          dtMs,
        });

        const desiredCamera = computeCameraFollowTarget({
          flight,
          qualityMode,
        });
        const followK = Math.min(1, (qualityMode === "high" ? 62 : 44) * (dtMs / 1000));
        camFollowRef.current.x += (desiredCamera.x - camFollowRef.current.x) * followK;
        camFollowRef.current.y += (desiredCamera.y - camFollowRef.current.y) * followK;
        camera.x = camFollowRef.current.x;
        camera.y = camFollowRef.current.y;

        accumulatorRef.current -= GAME_CONFIG.fixedStepMs;
      }

      const blend = accumulatorRef.current / GAME_CONFIG.fixedStepMs;
      const previousFlight = previousFlightRef.current;
      const previousCamera = previousCameraRef.current;
      const renderFlight: FlightState = {
        x: lerp(previousFlight.x, flight.x, blend),
        y: lerp(previousFlight.y, flight.y, blend),
        heading: lerpAngle(previousFlight.heading, flight.heading, blend),
        speed: lerp(previousFlight.speed, flight.speed, blend),
        angVel: lerp(previousFlight.angVel, flight.angVel, blend),
      };
      const renderCamera: CameraState = {
        x: lerp(previousCamera.x, camera.x, blend),
        y: lerp(previousCamera.y, camera.y, blend),
        zoom: lerp(previousCamera.zoom, camera.zoom, blend),
      };

      context.clearRect(0, 0, canvasSize.width, canvasSize.height);
      if (backgroundCanvasRef.current) {
        context.drawImage(backgroundCanvasRef.current, 0, 0, canvasSize.width, canvasSize.height);
      } else {
        context.fillStyle = "#4C9BE9";
        context.fillRect(0, 0, canvasSize.width, canvasSize.height);
      }

      if (featureFlags.clouds) {
        drawParallaxCloudLayers(
          context,
          canvasSize.width,
          canvasSize.height,
          timestamp,
          renderCamera.x,
          renderCamera.y,
          { layerMin: 0, layerMax: qualityMode === "low" ? 1 : 2 },
        );
      }

      if (!clusters.length && !systems.length && !stars.length) {
        context.save();
        context.textAlign = "center";
        context.font = "600 17px Segoe UI, system-ui, sans-serif";
        context.fillStyle = "rgba(255,255,255,0.92)";
        const message = snapshotError
          ? "Could not load the public snapshot."
          : mapDataLoading
            ? "Loading deployments..."
            : "No deployments match your filters. Try widening filters in the bar above.";
        context.fillText(message, canvasSize.width / 2, canvasSize.height / 2 - 40);
        context.restore();
      }

      const disclosure = disclosureRef.current;
      const lensRadius = getLensRadius(canvasSize);
      const focusPoint = { x: canvasSize.width / 2, y: canvasSize.height / 2 };
      const visibleScene = visibilityRef.current;
      const runtimeClusterById = new Map(
        runtimeClusters.map((cluster) => [cluster.clusterId, cluster] as const),
      );
      const runtimeFocusClusterMap = new Map<string, Cluster>();

      if (disclosure.activeRegionId) {
        for (const cluster of runtimeClustersByRegion.get(disclosure.activeRegionId) ?? []) {
          runtimeFocusClusterMap.set(cluster.clusterId, cluster);
        }
      }
      for (const system of visibleScene.visibleSystems) {
        const match = runtimeClusterById.get(system.runtimeClusterId);
        if (match) {
          runtimeFocusClusterMap.set(match.clusterId, match);
        }
      }

      const runtimeFocusClusters = Array.from(runtimeFocusClusterMap.values()).sort((left, right) =>
        left.label.localeCompare(right.label),
      );
      const renderables: Renderable[] = [];

      const projectWorld = (world: { x: number; y: number }) => {
        const point = worldToScreen(world, canvasSize, renderCamera);
        return applyFisheyeToPoint({
          point,
          focus: focusPoint,
          lensRadius,
        });
      };

      for (const cluster of regionClusters) {
        const projected = projectWorld(cluster.centroid);
        const active = disclosure.activeRegionId === cluster.clusterId;
        if (disclosure.band === "detail" && active) {
          continue;
        }
        const radius =
          getClusterRenderRadius({
            cluster,
            band: disclosure.band,
            isActive: active,
          }) * projected.radialScale;
        const alpha =
          getDensityAlpha({
            density: cluster.counts.systems,
            band: disclosure.band,
            emphasis: active ? 0.16 : disclosure.band === "overview" ? 0.08 : -0.06,
          }) * (disclosure.band === "overview" ? 1 : 0.7);

        if (offscreen(projected, radius + 120, canvasSize)) {
          continue;
        }

        drawClusterCloud({
          ctx: context,
          x: projected.x,
          y: projected.y,
          radius,
          alpha,
          label: cluster.label,
          active,
          rare: cluster.rarityFlags.hasRareArchetype,
          level: cluster.level,
          band: disclosure.band,
        });

        renderables.push({
          entity: {
            kind: "cluster",
            id: cluster.clusterId,
            label: cluster.label,
            subtitle: `${cluster.counts.systems} apps · ${cluster.counts.instances} instances`,
          },
          x: projected.x,
          y: projected.y,
          radius:
            getClusterBadgeRadius({
              radius,
              level: cluster.level,
              band: disclosure.band,
            }) + 12,
          cluster,
        });
      }

      if (disclosure.band !== "overview" || visibleScene.visibleSystems.length > 0) {
        for (const cluster of runtimeFocusClusters) {
          const projected = projectWorld(cluster.centroid);
          const active = disclosure.activeRuntimeId === cluster.clusterId;
          const radius =
            getClusterRenderRadius({
              cluster,
              band: disclosure.band,
              isActive: active,
            }) * projected.radialScale;
          const alpha = getDensityAlpha({
            density: cluster.counts.systems,
            band: disclosure.band,
            emphasis: active ? 0.18 : 0,
          }) * (disclosure.band === "detail" ? 0.42 : 1);

          if (offscreen(projected, radius + 80, canvasSize)) {
            continue;
          }

          drawClusterCloud({
            ctx: context,
            x: projected.x,
            y: projected.y,
            radius,
            alpha,
            label: cluster.label,
            active,
            rare: cluster.rarityFlags.hasRareArchetype,
            level: cluster.level,
            band: disclosure.band,
          });

          renderables.push({
            entity: {
              kind: "cluster",
              id: cluster.clusterId,
              label: cluster.label,
              subtitle: `${titleCase(cluster.runtimeFamily)} runtime cluster`,
            },
            x: projected.x,
            y: projected.y,
            radius:
              getClusterBadgeRadius({
                radius,
                level: cluster.level,
                band: disclosure.band,
              }) + 10,
            cluster,
          });
        }

        for (const system of visibleScene.visibleSystems) {
          const projected = projectWorld(system);
          const jitter = scaleDensityJitter({
            jitterOffset: system.jitterOffset,
            density: visibleScene.visibleSystems.length,
            band: disclosure.band,
            multiplier: renderCamera.zoom * 0.22,
          });
          const x = projected.x + jitter.x;
          const y = projected.y + jitter.y;
          const isSelected = selectedAppName === system.appName;
          const isSearchMatch = matchSet.has(system.appName);
          const radius =
            getAnchorRadius({
              instanceCount: system.instanceCount,
              band: disclosure.band,
              isRare: system.rarityFlags.isRareArchetype,
            }) * projected.radialScale;

          if (offscreen({ x, y }, radius + 80, canvasSize)) {
            continue;
          }

          context.save();
          context.globalAlpha = getDensityAlpha({
            density: system.instanceCount,
            band: disclosure.band,
            emphasis: isSelected || isSearchMatch ? 0.18 : 0,
          });
          drawDeploymentBuoy({
            ctx: context,
            x,
            y,
            colors: getBuoyColorway(system),
            baseScale: Math.max(0.58, radius / 12.8),
            seed: system.systemId,
            proximity: isSelected ? 2 : 0,
            selected: isSelected,
            searchOrPointer: isSearchMatch,
            timestamp,
          });
          context.restore();

          renderables.push({
            entity: {
              kind: "system",
              id: system.systemId,
              label: system.appName,
              subtitle: `${categoryLabel(system)} · ${titleCase(system.runtimeFamily)}`,
              appName: system.appName,
            },
            x,
            y,
            radius: radius + 16,
          });
        }
      }

      for (const clusterMarker of visibleScene.clusterMarkers) {
        const projected = projectWorld(clusterMarker);
        if (offscreen(projected, 48, canvasSize)) {
          continue;
        }
        drawDeploymentClusterMarker(context, projected.x, projected.y, clusterMarker.count);
      }

      if (disclosure.band === "detail") {
        for (const system of visibleScene.detailSystems) {
          const systemStars = visibilityRef.current.visibleStarsBySystem.get(system.systemId) ?? [];
          for (const star of systemStars) {
            const projected = projectWorld(star);
            const jitter = scaleDensityJitter({
              jitterOffset: star.jitterOffset,
              density: systemStars.length,
              band: disclosure.band,
              multiplier: renderCamera.zoom * 0.32,
            });
            const x = projected.x + jitter.x;
            const y = projected.y + jitter.y;
            const isSelected = selectedAppName === star.appName;
            const isSearchMatch = matchSet.has(star.appName);
            const baseScale = Math.max(
              0.5,
              Math.min(2.3, star.size * renderCamera.zoom * 0.11 + 0.24),
            );

            if (offscreen({ x, y }, 52, canvasSize)) {
              continue;
            }

            context.save();
            context.globalAlpha = getDensityAlpha({
              density: systemStars.length,
              band: disclosure.band,
              emphasis:
                isSelected || isSearchMatch
                  ? 0.18
                  : star.rarityFlags.isRareArchetype
                    ? 0.08
                    : 0,
            });
            drawDeploymentBuoy({
              ctx: context,
              x,
              y,
              colors: getBuoyColorway(star),
              baseScale: baseScale * projected.radialScale,
              seed: star.id,
              proximity: isSelected ? 2 : 1,
              selected: isSelected,
              searchOrPointer: isSearchMatch,
              timestamp,
            });
            context.restore();

            renderables.push({
              entity: {
                kind: "star",
                id: star.id,
                label: star.appName,
                subtitle: `${categoryLabel(star)} · ${star.region || "Unknown sector"}`,
                appName: star.appName,
              },
              x,
              y,
              radius: 18 + baseScale * 8,
            });
          }
        }
      }

      for (const collectible of game.collectibles) {
        if (!collectible.active) {
          continue;
        }
        const projected = projectWorld(collectible);
        const bob =
          Math.sin(timestamp / (collectible.kind === "fuel" ? 520 : 460) + collectible.bobSeed) *
          (collectible.kind === "fuel" ? 10 : 8);
        const px = projected.x;
        const py = projected.y + bob;
        if (offscreen({ x: px, y: py }, 48, canvasSize)) {
          continue;
        }
        if (collectible.kind === "fuel") {
          drawFuelCanPickup(
            context,
            px,
            py,
            0.7 * projected.radialScale,
            timestamp / 1800 + collectible.spinSeed,
          );
        } else {
          drawSpeedBoostPickup(
            context,
            px,
            py,
            0.8 * projected.radialScale,
            timestamp / 1600 + collectible.spinSeed,
          );
        }
      }

      for (const enemy of game.enemies) {
        const projected = projectWorld(enemy);
        if (!offscreen(projected, 46, canvasSize)) {
          drawEnemyPlaneMarker(context, projected.x, projected.y, enemy.heading, timestamp);
        }
      }

      for (const projectile of game.projectiles) {
        const projected = projectWorld(projectile);
        if (!offscreen(projected, 24, canvasSize)) {
          drawProjectile(context, projected.x, projected.y, projectile.radius, projectile.owner);
        }
      }

      for (const effect of game.effects) {
        const projected = projectWorld(effect);
        if (!offscreen(projected, effect.size * 1.6, canvasSize)) {
          drawVisualEffect(context, effect, projected.x, projected.y);
        }
      }

      if (clusters.length || systems.length || stars.length) {
        drawTopDownBiplane(
          context,
          canvasSize.width / 2,
          canvasSize.height / 2,
          renderFlight.heading,
          clamp(renderFlight.angVel * 0.38, -0.42, 0.42),
          timestamp,
          planeSkinPalettes[selectedSkinId],
        );

        if (featureFlags.pickups && game.boostUntilMs > timestamp && game.state === "flying") {
          context.save();
          context.strokeStyle = "rgba(111, 235, 255, 0.78)";
          context.lineWidth = 3;
          context.beginPath();
          context.moveTo(canvasSize.width / 2 - 44, canvasSize.height / 2 + 10);
          context.lineTo(canvasSize.width / 2 - 78, canvasSize.height / 2 + 18);
          context.moveTo(canvasSize.width / 2 - 40, canvasSize.height / 2 - 12);
          context.lineTo(canvasSize.width / 2 - 74, canvasSize.height / 2 - 18);
          context.stroke();
          context.restore();
        }
      }

      const hovered = findHoveredRenderable(pointerRef.current, renderables);
      const hoveredEntity = hovered?.entity ?? null;
      const previousHovered = hoveredRenderableRef.current?.entity;
      if (
        hoveredEntity?.id !== previousHovered?.id ||
        hoveredEntity?.kind !== previousHovered?.kind
      ) {
        hoveredRenderableRef.current = hovered;
        onHoverEntityRef.current(hoveredEntity);
      } else if (hovered) {
        hoveredRenderableRef.current = hovered;
      }

      if (hovered) {
        drawProximityHoverCard(
          context,
          hovered.x,
          hovered.y,
          hovered.entity.label,
          hovered.entity.subtitle,
          0.96,
        );
      }

      if (
        debugHudVisible &&
        (debugPerfRef.current.lastSampleAtMs === 0 ||
          timestamp - debugPerfRef.current.lastSampleAtMs >= 220)
      ) {
        const elapsed =
          debugPerfRef.current.lastSampleAtMs === 0
            ? 220
            : timestamp - debugPerfRef.current.lastSampleAtMs;
        const visibleDeployments =
          [...visibilityRef.current.visibleStarsBySystem.values()].reduce(
            (total, systemStars) => total + systemStars.length,
            0,
          ) + visibilityRef.current.visibleSystems.length;
        setDebugStats({
          fps: (debugPerfRef.current.frames * 1000) / Math.max(elapsed, 1),
          frameMs,
          tickRate: (debugPerfRef.current.ticks * 1000) / Math.max(elapsed, 1),
          counts: {
            deployments: visibleDeployments,
            clusters: visibilityRef.current.clusterMarkers.length,
            enemies: game.enemies.length,
            bullets: game.projectiles.length,
            pickups: game.collectibles.filter((collectible) => collectible.active).length,
            clouds: featureFlags.clouds
              ? getParallaxCloudCount({ layerMin: 0, layerMax: qualityMode === "low" ? 1 : 2 })
              : 0,
          },
          input: debugInputRef.current,
          player: {
            speed: flight.speed,
            hull: game.hull,
            fuel: game.fuel,
            boostRemainingMs: Math.max(0, game.boostUntilMs - timestamp),
          },
          lastPickupEvent: lastPickupEventRef.current,
        });
        debugPerfRef.current = {
          lastSampleAtMs: timestamp,
          frames: 0,
          ticks: 0,
        };
      }

      if (timestamp - telemetryEmitTsRef.current > 140) {
        telemetryEmitTsRef.current = timestamp;
        onTelemetryRef.current({
          ...disclosure,
          nearestRegionDistance: disclosure.nearestRegionDistance,
          nearestSystemDistance: disclosure.nearestSystemDistance,
          plane: {
            x: renderFlight.x,
            y: renderFlight.y,
            heading: renderFlight.heading,
            speed: renderFlight.speed,
          },
          camera: {
            x: renderCamera.x,
            y: renderCamera.y,
            zoom: renderCamera.zoom,
          },
        });
      }

      if (timestamp - gameEmitTsRef.current > 140) {
        gameEmitTsRef.current = timestamp;
        onGameStateChangeRef.current?.(
          createSessionSnapshot({
            game,
            nowMs: timestamp,
            qualityMode,
            featureFlags,
            clusterMarkers: visibilityRef.current.clusterMarkers,
          }),
        );
      }

      if (game.state === "crashed" && !game.runRecorded) {
        game.runRecorded = true;
        onRunCompleteRef.current?.(toRunRecord(game, timestamp));
      }

      animationFrameRef.current = window.requestAnimationFrame(draw);
    };

    animationFrameRef.current = window.requestAnimationFrame(draw);
    return () => {
      if (animationFrameRef.current !== null) {
        window.cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [
    bounds,
    canvasSize,
    clusters,
    debugHudVisible,
    flightSettings,
    featureFlags,
    mapDataLoading,
    matchSet,
    qualityMode,
    runtimeClusters,
    runtimeClustersByRegion,
    selectedAppName,
    selectedSkinId,
    snapshotError,
    stars,
    starsBySystem,
    systems,
  ]);

  const resetFlight = () => {
    const center = centroidOfWorld(stars, systems, bounds);
    flightRef.current = createFlightState(center.x, center.y);
    previousFlightRef.current = { ...flightRef.current };
    camFollowRef.current = { x: center.x, y: center.y };
    currentCameraRef.current = {
      x: center.x,
      y: center.y,
      zoom: getDefaultZoom(),
    };
    previousCameraRef.current = { ...currentCameraRef.current };
    gameRef.current = createGameState();
    visibilityRef.current = EMPTY_VISIBILITY;
    lastPickupEventRef.current = null;
    debugPerfRef.current = { lastSampleAtMs: 0, frames: 0, ticks: 0 };
    setDebugStats(createInitialDebugHudSnapshot());
    resetTransientControls();
    accumulatorRef.current = 0;
  };

  const bumpZoom = (factor: number) => {
    const camera = currentCameraRef.current;
    const flight = flightRef.current;
    previousCameraRef.current = { ...camera };
    previousFlightRef.current = { ...flight };
    zoomAtPoint(
      camera,
      flight,
      canvasSize,
      { x: canvasSize.width / 2, y: canvasSize.height / 2 },
      camera.zoom * factor,
    );
    accumulatorRef.current = 0;
  };

  const dismissTip = () => {
    try {
      sessionStorage.setItem(FLIGHT_TIP_KEY, "1");
    } catch {
      // Ignore storage errors.
    }
    setShowFlightTip(false);
    wrapRef.current?.focus({ preventScroll: true });
  };

  const handlePointerMove = (event: PointerEvent<HTMLCanvasElement>) => {
    const boundsRect = canvasRef.current?.getBoundingClientRect();
    if (!boundsRect) {
      return;
    }

    pointerRef.current = {
      x: event.clientX - boundsRect.left,
      y: event.clientY - boundsRect.top,
    };
  };

  const handlePointerLeave = () => {
    pointerRef.current = null;
    pointerInSceneRef.current = false;
    hoveredRenderableRef.current = null;
    onHoverEntityRef.current(null);
  };

  const handleCanvasPointerDown = () => {
    pointerInSceneRef.current = true;
    wrapRef.current?.focus({ preventScroll: true });
  };

  const handleClick = () => {
    const hovered = hoveredRenderableRef.current;
    if (!hovered) {
      return;
    }

    if (hovered.cluster) {
      onFocusCluster(hovered.cluster);
      return;
    }

    if (hovered.entity.kind === "system" || hovered.entity.kind === "star") {
      onSelectApp(hovered.entity.appName);
    }
  };

  const handleWheel = (event: WheelEvent<HTMLCanvasElement>) => {
    event.preventDefault();
    const boundsRect = canvasRef.current?.getBoundingClientRect();
    if (!boundsRect) {
      return;
    }

    const sx = event.clientX - boundsRect.left;
    const sy = event.clientY - boundsRect.top;
    const camera = currentCameraRef.current;
    const flight = flightRef.current;
    const delta = normalizeWheel(event);
    const intensity = event.ctrlKey ? 0.00135 : 0.001;
    const scale = Math.exp(-delta * intensity);
    zoomAtPoint(camera, flight, canvasSize, { x: sx, y: sy }, camera.zoom * scale);
  };

  const pressPad = (key: string) => {
    keysRef.current.add(key);
  };

  const releasePad = (key: string) => {
    keysRef.current.delete(key);
  };

  return (
    <div className="scene-shell">
      <div className="scene-toolbar">
        <div className="scene-toolbar-group">
          <button type="button" className="secondary-action" onClick={() => bumpZoom(1.12)}>
            Zoom in
          </button>
          <button
            type="button"
            className="secondary-action"
            onClick={() => bumpZoom(1 / 1.12)}
          >
            Zoom out
          </button>
          <button
            type="button"
            className="secondary-action"
            onClick={() => bumpZoom(getDefaultZoom() / currentCameraRef.current.zoom)}
          >
            Reset view
          </button>
          <button type="button" className="secondary-action" onClick={resetFlight}>
            Reset flight
          </button>
          <button
            type="button"
            className="secondary-action"
            onClick={() => setShowSettingsPanel((current) => !current)}
          >
            Controls / Settings
          </button>
        </div>
        <span className="scene-zoom-label scene-zoom-label--wrap">
          Fly with WASD or arrows. Scroll to zoom. Press Space or Fire to shoot.
        </span>
      </div>

      <div
        ref={wrapRef}
        className="scene-wrap"
        tabIndex={0}
        role="application"
        aria-label="FluxCloud map. Click here, then use arrow keys or WASD to fly; scroll to zoom."
        onPointerEnter={() => {
          pointerInSceneRef.current = true;
        }}
        onPointerLeave={() => {
          pointerInSceneRef.current = false;
        }}
      >
        {showFlightTip ? (
          <div className="scene-flight-tip" role="dialog" aria-labelledby="flight-tip-title">
            <h2 id="flight-tip-title" className="scene-flight-tip-title">
              Flight controls
            </h2>
            <p className="scene-flight-tip-copy">
              Click the sky, steer with WASD or arrows, tap Fire or Space to shoot, and
              scroll to zoom in on a cluster.
            </p>
            <button
              type="button"
              className="primary-action scene-flight-tip-dismiss"
              onClick={dismissTip}
            >
              Start flying
            </button>
          </div>
        ) : null}

        <FlightSettingsPanel
          open={showSettingsPanel}
          settings={flightSettings}
          featureFlags={featureFlags}
          qualityMode={qualityMode}
          onClose={() => setShowSettingsPanel(false)}
          onUpdateSettings={onUpdateFlightSettings}
          onUpdateFeatureFlags={onUpdateFeatureFlags}
        />

        <canvas
          ref={canvasRef}
          className="scene-canvas"
          onPointerDown={handleCanvasPointerDown}
          onPointerMove={handlePointerMove}
          onPointerLeave={handlePointerLeave}
          onClick={handleClick}
          onWheel={handleWheel}
        />

        {overlay ? <div className="scene-overlay-layer">{overlay}</div> : null}
        <DebugHud visible={debugHudVisible} stats={debugStats} />

        <div className="scene-flight-pad" aria-label="Touch flight controls">
          <div className="scene-flight-pad-row scene-flight-pad-row--top">
            <button
              type="button"
              className="scene-flight-pad-btn"
              aria-label="Thrust"
              onPointerDown={(event) => {
                event.preventDefault();
                pressPad("ArrowUp");
                event.currentTarget.setPointerCapture(event.pointerId);
              }}
              onPointerUp={(event) => {
                releasePad("ArrowUp");
                try {
                  event.currentTarget.releasePointerCapture(event.pointerId);
                } catch {
                  // Ignore capture errors.
                }
              }}
              onPointerCancel={() => releasePad("ArrowUp")}
            >
              ↑
            </button>
          </div>
          <div className="scene-flight-pad-row">
            <button
              type="button"
              className="scene-flight-pad-btn"
              aria-label="Turn left"
              onPointerDown={(event) => {
                event.preventDefault();
                pressPad("ArrowLeft");
                event.currentTarget.setPointerCapture(event.pointerId);
              }}
              onPointerUp={(event) => {
                releasePad("ArrowLeft");
                try {
                  event.currentTarget.releasePointerCapture(event.pointerId);
                } catch {
                  // Ignore capture errors.
                }
              }}
              onPointerCancel={() => releasePad("ArrowLeft")}
            >
              ←
            </button>
            <button
              type="button"
              className="scene-flight-pad-btn"
              aria-label="Brake"
              onPointerDown={(event) => {
                event.preventDefault();
                pressPad("ArrowDown");
                event.currentTarget.setPointerCapture(event.pointerId);
              }}
              onPointerUp={(event) => {
                releasePad("ArrowDown");
                try {
                  event.currentTarget.releasePointerCapture(event.pointerId);
                } catch {
                  // Ignore capture errors.
                }
              }}
              onPointerCancel={() => releasePad("ArrowDown")}
            >
              ↓
            </button>
            <button
              type="button"
              className="scene-flight-pad-btn"
              aria-label="Turn right"
              onPointerDown={(event) => {
                event.preventDefault();
                pressPad("ArrowRight");
                event.currentTarget.setPointerCapture(event.pointerId);
              }}
              onPointerUp={(event) => {
                releasePad("ArrowRight");
                try {
                  event.currentTarget.releasePointerCapture(event.pointerId);
                } catch {
                  // Ignore capture errors.
                }
              }}
              onPointerCancel={() => releasePad("ArrowRight")}
            >
              →
            </button>
          </div>
          <div className="scene-flight-pad-row scene-flight-pad-row--fire">
            <button
              type="button"
              className="scene-flight-pad-btn scene-flight-pad-btn--fire"
              aria-label="Fire"
              onPointerDown={(event) => {
                event.preventDefault();
                pressPad("Fire");
                event.currentTarget.setPointerCapture(event.pointerId);
              }}
              onPointerUp={(event) => {
                releasePad("Fire");
                try {
                  event.currentTarget.releasePointerCapture(event.pointerId);
                } catch {
                  // Ignore capture errors.
                }
              }}
              onPointerCancel={() => releasePad("Fire")}
            >
              Fire
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
