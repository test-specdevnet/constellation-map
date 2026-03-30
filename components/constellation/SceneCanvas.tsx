"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent,
  type ReactNode,
  type WheelEvent,
} from "react";
import {
  drawFuelCanPickup,
  drawDeploymentBuoy,
  drawParallaxCloudLayers,
  drawProjectile,
  drawProximityHoverCard,
  drawSpeedBoostPickup,
  drawTopDownBiplane,
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
  type FlightTelemetry,
  type DisclosureBand,
} from "../../lib/layout/focusContext";
import type { AppSystem, Cluster, SceneBounds, Star } from "../../lib/types/star";
import {
  BOOST_DURATION_MS,
  DISCOVERY_SCORE,
  ENEMY_SCORE,
  FUEL_MAX,
  type EnemyPlane,
  type FloatingPickup,
  type GameSessionSnapshot,
  type Projectile,
  type RunRecord,
  type RunState,
  generateFloatingPickups,
  generateRunId,
  getWeeklyLeaderboardKey,
  makeProjectile,
  spawnEnemyAtEdge,
} from "../../lib/game/arcade";

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
  overlay?: ReactNode;
  onSelectApp: (appName: string) => void;
  onFocusCluster: (cluster: Cluster) => void;
  onHoverEntity: (entity: HoveredEntity | null) => void;
  onTelemetry: (telemetry: FlightTelemetry) => void;
  onGameStateChange?: (snapshot: GameSessionSnapshot) => void;
  onRunComplete?: (record: RunRecord) => void;
};

type CameraState = {
  x: number;
  y: number;
  zoom: number;
};

type FlightState = {
  x: number;
  y: number;
  heading: number;
  speed: number;
  angVel: number;
};

type Renderable = {
  entity: HoveredEntity;
  x: number;
  y: number;
  radius: number;
  cluster?: Cluster;
};

type GameState = {
  runId: string;
  fuel: number;
  fuelMax: number;
  boostUntilMs: number;
  score: number;
  kills: number;
  discoveries: Set<string>;
  state: RunState;
  crashReason: string | null;
  crashStartedAtMs: number | null;
  runStartedAtMs: number;
  fuelPacks: FloatingPickup[];
  boostPacks: FloatingPickup[];
  enemies: EnemyPlane[];
  projectiles: Projectile[];
  nextEnemySpawnAtMs: number;
  playerFireCooldownMs: number;
  runRecorded: boolean;
};

const ZOOM_DEFAULT = 0.178;
const ZOOM_MIN = 0.07;
const ZOOM_MAX = 0.42;
const FLIGHT_TIP_KEY = "flux-flight-tip-dismissed";
const PLAYER_PICKUP_RADIUS = 34;
const PLAYER_PROJECTILE_SPEED = 780;
const ENEMY_PROJECTILE_SPEED = 420;

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

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

const angleTo = (from: { x: number; y: number }, to: { x: number; y: number }) =>
  Math.atan2(to.y - from.y, to.x - from.x);

const angleDelta = (target: number, current: number) => {
  let delta = target - current;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  return delta;
};

const createGameState = (bounds: SceneBounds, systems: AppSystem[]): GameState => ({
  runId: generateRunId(),
  fuel: FUEL_MAX,
  fuelMax: FUEL_MAX,
  boostUntilMs: 0,
  score: 0,
  kills: 0,
  discoveries: new Set<string>(),
  state: "flying",
  crashReason: null,
  crashStartedAtMs: null,
  runStartedAtMs: 0,
  fuelPacks: generateFloatingPickups({
    bounds,
    systems,
    kind: "fuel",
    count: 12,
    seed: `fuel:${bounds.width}:${systems.length}`,
  }),
  boostPacks: generateFloatingPickups({
    bounds,
    systems,
    kind: "boost",
    count: 7,
    seed: `boost:${bounds.height}:${systems.length}`,
  }),
  enemies: [],
  projectiles: [],
  nextEnemySpawnAtMs: 4_000,
  playerFireCooldownMs: 0,
  runRecorded: false,
});

const centroidOfWorld = (
  stars: Star[],
  systems: AppSystem[],
  bounds: SceneBounds,
) => {
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
  const z = clamp(nextZoom, ZOOM_MIN, ZOOM_MAX);
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
  meta: _meta,
  active,
  rare,
  level,
  band,
  timestamp: _timestamp,
}: {
  ctx: CanvasRenderingContext2D;
  x: number;
  y: number;
  radius: number;
  alpha: number;
  label: string;
  meta?: string;
  active: boolean;
  rare: boolean;
  level: Cluster["level"];
  band: DisclosureBand;
  timestamp: number;
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
  ctx.scale(0.6, 0.6);
  ctx.lineJoin = "round";
  ctx.lineWidth = 3;
  ctx.strokeStyle = "#e3ebf7";

  ctx.fillStyle = "#0b0f18";
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

  ctx.fillStyle = "#dfe7f7";
  ctx.beginPath();
  ctx.arc(25, 0, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#0b0f18";
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.strokeStyle = "rgba(223, 231, 247, 0.66)";
  ctx.beginPath();
  ctx.arc(25, 0, 10, prop, prop + Math.PI * 1.15);
  ctx.stroke();
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
    const distance = Math.hypot(dx, dy);

    if (distance <= renderable.radius && (!closest || distance < closest.distance)) {
      closest = { renderable, distance };
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
  overlay,
  onSelectApp,
  onFocusCluster,
  onHoverEntity,
  onTelemetry,
  onGameStateChange,
  onRunComplete,
}: SceneCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const pointerRef = useRef<{ x: number; y: number } | null>(null);
  const hoveredRenderableRef = useRef<Renderable | null>(null);
  const currentCameraRef = useRef<CameraState>({
    x: 0,
    y: 0,
    zoom: ZOOM_DEFAULT,
  });
  const camFollowRef = useRef({ x: 0, y: 0 });
  const flightRef = useRef<FlightState>({
    x: 0,
    y: 0,
    heading: -Math.PI / 2,
    speed: 0,
    angVel: 0,
  });
  const keysRef = useRef<Set<string>>(new Set());
  const animationFrameRef = useRef<number | null>(null);
  const backgroundCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const lastAnimTsRef = useRef<number | null>(null);
  const focusKeyAppliedRef = useRef<string | null>(null);
  const telemetryEmitTsRef = useRef(0);
  const gameEmitTsRef = useRef(0);
  const flightSeededRef = useRef(false);
  const gameRef = useRef<GameState>(createGameState(bounds, systems));
  const enemySpawnCounterRef = useRef(0);
  const pointerInSceneRef = useRef(false);
  const [canvasSize, setCanvasSize] = useState({ width: 1200, height: 760 });
  const [showFlightTip, setShowFlightTip] = useState(false);

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
  const systemsByRegion = useMemo(() => {
    const map = new Map<string, AppSystem[]>();

    for (const system of systems) {
      const existing = map.get(system.regionClusterId);
      if (existing) {
        existing.push(system);
      } else {
        map.set(system.regionClusterId, [system]);
      }
    }

    return map;
  }, [systems]);
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
    flightRef.current.x = center.x;
    flightRef.current.y = center.y;
    flightRef.current.heading = -Math.PI / 2;
    flightRef.current.speed = 0;
    flightRef.current.angVel = 0;
    camFollowRef.current.x = center.x;
    camFollowRef.current.y = center.y;
    currentCameraRef.current.x = center.x;
    currentCameraRef.current.y = center.y;
    currentCameraRef.current.zoom = ZOOM_DEFAULT;
    gameRef.current = createGameState(bounds, systems);
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
    camFollowRef.current.x = focusTarget.x;
    camFollowRef.current.y = focusTarget.y;
    currentCameraRef.current.x = focusTarget.x;
    currentCameraRef.current.y = focusTarget.y;
    currentCameraRef.current.zoom = clamp(focusTarget.zoom, ZOOM_MIN, ZOOM_MAX);
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

    window.addEventListener("keydown", down, { passive: false });
    window.addEventListener("keyup", up);

    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

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
      sky.addColorStop(0, "#d7efff");
      sky.addColorStop(0.42, "#8fd5ff");
      sky.addColorStop(1, "#1aa3e7");
      backgroundContext.fillStyle = sky;
      backgroundContext.fillRect(0, 0, canvasSize.width, canvasSize.height);

      const sunGlow = backgroundContext.createRadialGradient(
        canvasSize.width * 0.14,
        canvasSize.height * 0.14,
        0,
        canvasSize.width * 0.14,
        canvasSize.height * 0.14,
        canvasSize.height * 0.42,
      );
      sunGlow.addColorStop(0, "rgba(255,255,255,0.3)");
      sunGlow.addColorStop(1, "rgba(255,255,255,0)");
      backgroundContext.fillStyle = sunGlow;
      backgroundContext.fillRect(0, 0, canvasSize.width, canvasSize.height);

      const lowerHaze = backgroundContext.createLinearGradient(0, canvasSize.height * 0.58, 0, canvasSize.height);
      lowerHaze.addColorStop(0, "rgba(255,255,255,0)");
      lowerHaze.addColorStop(1, "rgba(255,255,255,0.2)");
      backgroundContext.fillStyle = lowerHaze;
      backgroundContext.fillRect(0, canvasSize.height * 0.52, canvasSize.width, canvasSize.height * 0.48);
    }

    const draw = (timestamp: number) => {
      const keys = keysRef.current;
      const flight = flightRef.current;
      const game = gameRef.current;
      const lastTs = lastAnimTsRef.current ?? timestamp;
      const dt = clamp((timestamp - lastTs) / 1000, 0, 0.05);
      const dtMs = dt * 1000;
      lastAnimTsRef.current = timestamp;
      if (game.runStartedAtMs === 0) {
        game.runStartedAtMs = timestamp;
      }

      const boostActive = game.boostUntilMs > timestamp;
      const boostFactor = boostActive ? 1.22 : 1;
      const maxTurnRate = reducedMotion ? 2.3 : 4.35;
      const turnResponse = reducedMotion ? 9 : 15;
      const accel = (reducedMotion ? 360 : 1_020) * boostFactor;
      const brake = reducedMotion ? 700 : 1_520;
      const passiveDrag = reducedMotion ? 82 : 102;
      const maxSpeed = (reducedMotion ? 230 : 700) * (boostActive ? 1.18 : 1);

      let turnInput = 0;
      if (keys.has("ArrowLeft")) turnInput -= 1;
      if (keys.has("ArrowRight")) turnInput += 1;
      const targetTurnRate = turnInput * maxTurnRate;
      const turnBlend = Math.min(1, turnResponse * dt);
      flight.angVel += (targetTurnRate - flight.angVel) * turnBlend;
      flight.heading += flight.angVel * dt;

      if (game.state === "flying") {
        if (keys.has("ArrowUp")) {
          flight.speed += accel * dt;
        } else if (keys.has("ArrowDown")) {
          flight.speed -= brake * dt;
        } else {
          flight.speed -= passiveDrag * dt;
        }
      } else {
        flight.speed -= brake * 0.42 * dt;
        flight.angVel += (1.4 - flight.angVel) * Math.min(1, 2.2 * dt);
      }
      flight.speed = clamp(flight.speed, 0, maxSpeed);

      flight.x += Math.cos(flight.heading) * flight.speed * dt;
      flight.y += Math.sin(flight.heading) * flight.speed * dt;
      flight.x = clamp(flight.x, bounds.minX, bounds.maxX);
      flight.y = clamp(flight.y, bounds.minY, bounds.maxY);

      game.playerFireCooldownMs = Math.max(0, game.playerFireCooldownMs - dtMs);
      if (game.state === "flying" && keys.has("Fire") && game.playerFireCooldownMs <= 0) {
        game.projectiles.push(
          makeProjectile({
            owner: "player",
            x: flight.x + Math.cos(flight.heading) * 55,
            y: flight.y + Math.sin(flight.heading) * 55,
            heading: flight.heading,
            speed: PLAYER_PROJECTILE_SPEED,
          }),
        );
        game.playerFireCooldownMs = 240;
      }

      if (game.state === "flying") {
        const fuelDrainPerSecond = boostActive ? 1.8 : 3.3;
        game.fuel = clamp(game.fuel - fuelDrainPerSecond * dt, 0, game.fuelMax);
        if (game.fuel <= 0) {
          game.state = "crashing";
          game.crashReason = "Out of fuel";
          game.crashStartedAtMs = timestamp;
        }
      } else if (game.state === "crashing" && game.crashStartedAtMs !== null) {
        if (timestamp - game.crashStartedAtMs > 1_600) {
          game.state = "crashed";
          flight.speed = 0;
          flight.angVel = 0;
        }
      }

      const look = Math.min(460, flight.speed * 0.76);
      const desiredCamX = flight.x + Math.cos(flight.heading) * look * 0.12;
      const desiredCamY = flight.y + Math.sin(flight.heading) * look * 0.12;
      const camFollow = camFollowRef.current;
      const followK = Math.min(1, (reducedMotion ? 18 : 34) * dt);
      camFollow.x += (desiredCamX - camFollow.x) * followK;
      camFollow.y += (desiredCamY - camFollow.y) * followK;

      const camera = currentCameraRef.current;
      camera.x = camFollow.x;
      camera.y = camFollow.y;

      context.clearRect(0, 0, canvasSize.width, canvasSize.height);

      if (backgroundCanvasRef.current) {
        context.drawImage(
          backgroundCanvasRef.current,
          0,
          0,
          canvasSize.width,
          canvasSize.height,
        );
      } else {
        context.fillStyle = "#4C9BE9";
        context.fillRect(0, 0, canvasSize.width, canvasSize.height);
      }

      drawParallaxCloudLayers(
        context,
        canvasSize.width,
        canvasSize.height,
        timestamp,
        camFollow.x,
        camFollow.y,
        { layerMin: 0, layerMax: 1 },
      );

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

      const disclosure = getDisclosureState({
        zoom: camera.zoom,
        plane: { x: flight.x, y: flight.y },
        clusters,
        systems,
      });
      const lensRadius = getLensRadius(canvasSize);
      const focusPoint = { x: canvasSize.width / 2, y: canvasSize.height / 2 };
      const localSystems = systems.filter(
        (system) =>
          Math.hypot(system.x - flight.x, system.y - flight.y) <= 1_650 ||
          system.appName === selectedAppName ||
          matchSet.has(system.appName),
      );
      const regionSystems = disclosure.activeRegionId
        ? systemsByRegion.get(disclosure.activeRegionId) ?? []
        : [];
      const visibleSystemsMap = new Map<string, AppSystem>();
      for (const system of regionSystems) {
        visibleSystemsMap.set(system.systemId, system);
      }
      for (const system of localSystems) {
        visibleSystemsMap.set(system.systemId, system);
      }
      const visibleSystems = Array.from(visibleSystemsMap.values());
      const runtimeClusterById = new Map(
        runtimeClusters.map((cluster) => [cluster.clusterId, cluster] as const),
      );
      const runtimeFocusClusterMap = new Map<string, Cluster>();
      if (disclosure.activeRegionId) {
        for (const cluster of runtimeClustersByRegion.get(disclosure.activeRegionId) ?? []) {
          runtimeFocusClusterMap.set(cluster.clusterId, cluster);
        }
      }
      for (const system of visibleSystems) {
        const match = runtimeClusterById.get(system.runtimeClusterId);
        if (match) {
          runtimeFocusClusterMap.set(match.clusterId, match);
        }
      }
      const runtimeFocusClusters = Array.from(runtimeFocusClusterMap.values()).sort((left, right) =>
        left.label.localeCompare(right.label),
      );
      const detailSystemIds = new Set(
        visibleSystems
          .filter(
            (system) =>
              Math.hypot(system.x - flight.x, system.y - flight.y) <= 1_050 ||
              system.appName === selectedAppName ||
              matchSet.has(system.appName) ||
              (disclosure.activeRuntimeId !== null &&
                system.runtimeClusterId === disclosure.activeRuntimeId),
          )
          .map((system) => system.systemId),
      );
      const renderables: Renderable[] = [];

      const projectWorld = (world: { x: number; y: number }) => {
        const point = worldToScreen(world, canvasSize, camera);
        return applyFisheyeToPoint({
          point,
          focus: focusPoint,
          lensRadius,
        });
      };

      if (game.state === "flying") {
        for (const system of visibleSystems) {
          if (
            !game.discoveries.has(system.systemId) &&
            Math.hypot(system.x - flight.x, system.y - flight.y) <= 220
          ) {
            game.discoveries.add(system.systemId);
            game.score += DISCOVERY_SCORE;
          }
        }

        game.fuelPacks = game.fuelPacks.filter((pack) => {
          if (Math.hypot(pack.x - flight.x, pack.y - flight.y) <= PLAYER_PICKUP_RADIUS + pack.radius) {
            game.fuel = clamp(game.fuel + pack.value, 0, game.fuelMax);
            return false;
          }
          return true;
        });

        game.boostPacks = game.boostPacks.filter((pack) => {
          if (Math.hypot(pack.x - flight.x, pack.y - flight.y) <= PLAYER_PICKUP_RADIUS + pack.radius) {
            game.boostUntilMs = timestamp + BOOST_DURATION_MS;
            return false;
          }
          return true;
        });

        if (timestamp >= game.nextEnemySpawnAtMs && game.enemies.length < 4) {
          enemySpawnCounterRef.current += 1;
          game.enemies.push(
            spawnEnemyAtEdge({
              bounds,
              plane: flight,
              seed: `${enemySpawnCounterRef.current}:${Math.round(timestamp)}`,
            }),
          );
          game.nextEnemySpawnAtMs = timestamp + 4_200 + (enemySpawnCounterRef.current % 3) * 650;
        }
      }

      const removedEnemyIds = new Set<string>();
      for (const enemy of game.enemies) {
        enemy.ageMs += dtMs;
        const desiredHeading = angleTo(enemy, flight);
        const deltaHeading = angleDelta(desiredHeading, enemy.heading);
        const turnStep = clamp(deltaHeading, -1.5 * dt, 1.5 * dt);
        enemy.heading += turnStep;
        enemy.x += Math.cos(enemy.heading) * enemy.speed * dt;
        enemy.y += Math.sin(enemy.heading) * enemy.speed * dt;
        enemy.fireCooldown -= dtMs;

        const enemyDistance = Math.hypot(enemy.x - flight.x, enemy.y - flight.y);
        if (game.state === "flying" && enemy.fireCooldown <= 0 && enemyDistance < 1_900) {
          game.projectiles.push(
            makeProjectile({
              owner: "enemy",
              x: enemy.x + Math.cos(enemy.heading) * 40,
              y: enemy.y + Math.sin(enemy.heading) * 40,
              heading: desiredHeading,
              speed: ENEMY_PROJECTILE_SPEED,
            }),
          );
          enemy.fireCooldown = 1_050;
        }
      }

      game.projectiles = game.projectiles.filter((projectile) => {
        projectile.x += projectile.vx * dt;
        projectile.y += projectile.vy * dt;
        projectile.ttlMs -= dtMs;
        if (projectile.ttlMs <= 0) {
          return false;
        }

        if (projectile.owner === "player") {
          const hitEnemy = game.enemies.find(
            (enemy) =>
              !removedEnemyIds.has(enemy.id) &&
              Math.hypot(enemy.x - projectile.x, enemy.y - projectile.y) <=
                enemy.radius + projectile.radius,
          );
          if (hitEnemy) {
            removedEnemyIds.add(hitEnemy.id);
            game.kills += 1;
            game.score += ENEMY_SCORE;
            return false;
          }
          return true;
        }

        if (
          game.state === "flying" &&
          Math.hypot(projectile.x - flight.x, projectile.y - flight.y) <= 28 + projectile.radius
        ) {
          game.fuel = clamp(game.fuel - 18, 0, game.fuelMax);
          if (game.fuel <= 0) {
            game.state = "crashing";
            game.crashReason = "Shot down";
            game.crashStartedAtMs = timestamp;
          }
          return false;
        }

        return true;
      });

      if (removedEnemyIds.size > 0) {
        game.enemies = game.enemies.filter((enemy) => !removedEnemyIds.has(enemy.id));
      }
      game.enemies = game.enemies.filter(
        (enemy) =>
          enemy.x >= bounds.minX - 320 &&
          enemy.x <= bounds.maxX + 320 &&
          enemy.y >= bounds.minY - 320 &&
          enemy.y <= bounds.maxY + 320 &&
          enemy.ageMs <= 42_000,
      );

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
          meta: `${cluster.counts.systems} apps · ${cluster.counts.runtimes} runtimes`,
          active,
          rare: cluster.rarityFlags.hasRareArchetype,
          level: cluster.level,
          band: disclosure.band,
          timestamp,
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

      if (disclosure.band !== "overview" || visibleSystems.length > 0) {
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
            meta: `${cluster.counts.systems} apps · ${cluster.counts.instances} traces`,
            active,
            rare: cluster.rarityFlags.hasRareArchetype,
            level: cluster.level,
            band: disclosure.band,
            timestamp,
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

        for (const system of visibleSystems) {
          const projected = projectWorld(system);
          const jitter = scaleDensityJitter({
            jitterOffset: system.jitterOffset,
            density: visibleSystems.length,
            band: disclosure.band,
            multiplier: camera.zoom * 0.22,
          });
          const x = projected.x + jitter.x;
          const y = projected.y + jitter.y;
          const isSelected = selectedAppName === system.appName;
          const isSearchMatch = matchSet.has(system.appName);
          const isRare = system.rarityFlags.isRareArchetype;
          const radius =
            getAnchorRadius({
              instanceCount: system.instanceCount,
              band: disclosure.band,
              isRare,
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
            baseScale: Math.max(0.64, radius / 12.2),
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

      if (disclosure.band === "detail") {
        for (const systemId of detailSystemIds) {
          const systemStars = starsBySystem.get(systemId) ?? [];

          for (const star of systemStars) {
            const projected = projectWorld(star);
            const jitter = scaleDensityJitter({
              jitterOffset: star.jitterOffset,
              density: systemStars.length,
              band: disclosure.band,
              multiplier: camera.zoom * 0.32,
            });
            const x = projected.x + jitter.x;
            const y = projected.y + jitter.y;
            const isSelected = selectedAppName === star.appName;
            const isSearchMatch = matchSet.has(star.appName);
            const baseScale = Math.max(
              0.56,
              Math.min(2.55, star.size * camera.zoom * 0.12 + 0.26),
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

      for (const pack of game.fuelPacks) {
        const projected = projectWorld(pack);
        const bob = Math.sin(timestamp / 520 + pack.bobSeed) * 10;
        const px = projected.x;
        const py = projected.y + bob;
        if (offscreen({ x: px, y: py }, 48, canvasSize)) {
          continue;
        }
        drawFuelCanPickup(context, px, py, 0.7 * projected.radialScale, timestamp / 1800 + pack.spinSeed);
      }

      for (const pack of game.boostPacks) {
        const projected = projectWorld(pack);
        const bob = Math.sin(timestamp / 460 + pack.bobSeed) * 8;
        const px = projected.x;
        const py = projected.y + bob;
        if (offscreen({ x: px, y: py }, 44, canvasSize)) {
          continue;
        }
        drawSpeedBoostPickup(context, px, py, 0.8 * projected.radialScale, timestamp / 1600 + pack.spinSeed);
      }

      for (const enemy of game.enemies) {
        const projected = projectWorld(enemy);
        if (offscreen(projected, 46, canvasSize)) {
          continue;
        }
        drawEnemyPlaneMarker(context, projected.x, projected.y, enemy.heading, timestamp);
      }

      for (const projectile of game.projectiles) {
        const projected = projectWorld(projectile);
        if (offscreen(projected, 24, canvasSize)) {
          continue;
        }
        drawProjectile(context, projected.x, projected.y, projectile.radius, projectile.owner);
      }

      const hovered = findHoveredRenderable(pointerRef.current, renderables);
      const hoveredEntity = hovered?.entity ?? null;
      const previousHovered = hoveredRenderableRef.current?.entity;

      if (
        hoveredEntity?.id !== previousHovered?.id ||
        hoveredEntity?.kind !== previousHovered?.kind
      ) {
        hoveredRenderableRef.current = hovered;
        onHoverEntity(hoveredEntity);
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

      if (systems.length || clusters.length) {
        if (boostActive && game.state === "flying") {
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

        drawTopDownBiplane(
          context,
          canvasSize.width / 2,
          canvasSize.height / 2,
          flight.heading,
          clamp(flight.angVel * 0.38, -0.42, 0.42),
          timestamp,
          planeSkinPalettes[selectedSkinId],
        );

        if (game.state !== "flying") {
          context.save();
          context.globalAlpha = 0.9;
          context.fillStyle = "rgba(255, 126, 79, 0.24)";
          context.beginPath();
          context.arc(canvasSize.width / 2, canvasSize.height / 2, 42, 0, Math.PI * 2);
          context.fill();
          context.strokeStyle = "rgba(255, 196, 98, 0.8)";
          context.lineWidth = 4;
          context.beginPath();
          context.arc(canvasSize.width / 2, canvasSize.height / 2, 38, 0, Math.PI * 2);
          context.stroke();
          context.restore();
        }
      }

      if (timestamp - telemetryEmitTsRef.current > 140) {
        telemetryEmitTsRef.current = timestamp;
        onTelemetry({
          ...disclosure,
          plane: {
            x: flight.x,
            y: flight.y,
            heading: flight.heading,
            speed: flight.speed,
          },
          camera: {
            x: camera.x,
            y: camera.y,
            zoom: camera.zoom,
          },
        });
      }

      if (timestamp - gameEmitTsRef.current > 120) {
        gameEmitTsRef.current = timestamp;
        onGameStateChange?.({
          runId: game.runId,
          fuel: game.fuel,
          fuelMax: game.fuelMax,
          boostRemainingMs: Math.max(0, Math.round(game.boostUntilMs - timestamp)),
          score: game.score,
          kills: game.kills,
          discoveries: game.discoveries.size,
          state: game.state,
          crashReason: game.crashReason,
          durationMs: Math.max(0, Math.round(timestamp - game.runStartedAtMs)),
          enemyCount: game.enemies.length,
          fuelPackCount: game.fuelPacks.length,
          boostPackCount: game.boostPacks.length,
          leaderboardWeek: getWeeklyLeaderboardKey(),
        });
      }

      if (game.state === "crashed" && !game.runRecorded) {
        game.runRecorded = true;
        onRunComplete?.({
          score: game.score,
          kills: game.kills,
          discoveries: game.discoveries.size,
          durationMs: Math.max(0, Math.round(timestamp - game.runStartedAtMs)),
          weekKey: getWeeklyLeaderboardKey(),
          recordedAt: new Date().toISOString(),
        });
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
    mapDataLoading,
    matchSet,
    onHoverEntity,
    onGameStateChange,
    onRunComplete,
    onTelemetry,
    reducedMotion,
    runtimeClustersByRegion,
    selectedAppName,
    selectedSkinId,
    snapshotError,
    stars,
    starsBySystem,
    systems,
    systemsByRegion,
  ]);

  const resetFlight = () => {
    const center = centroidOfWorld(stars, systems, bounds);
    flightRef.current = {
      x: center.x,
      y: center.y,
      heading: -Math.PI / 2,
      speed: 0,
      angVel: 0,
    };
    camFollowRef.current.x = center.x;
    camFollowRef.current.y = center.y;
    currentCameraRef.current.x = center.x;
    currentCameraRef.current.y = center.y;
    currentCameraRef.current.zoom = ZOOM_DEFAULT;
    gameRef.current = createGameState(bounds, systems);
    keysRef.current.clear();
  };

  const bumpZoom = (factor: number) => {
    const camera = currentCameraRef.current;
    const flight = flightRef.current;
    zoomAtPoint(
      camera,
      flight,
      canvasSize,
      { x: canvasSize.width / 2, y: canvasSize.height / 2 },
      camera.zoom * factor,
    );
  };

  const dismissTip = () => {
    try {
      sessionStorage.setItem(FLIGHT_TIP_KEY, "1");
    } catch {
      /* ignore */
    }
    setShowFlightTip(false);
    wrapRef.current?.focus({ preventScroll: true });
  };

  const handlePointerMove = (event: PointerEvent<HTMLCanvasElement>) => {
    const boundsRect = canvasRef.current?.getBoundingClientRect();
    if (boundsRect) {
      pointerRef.current = {
        x: event.clientX - boundsRect.left,
        y: event.clientY - boundsRect.top,
      };
    }
  };

  const handlePointerLeave = () => {
    pointerRef.current = null;
    pointerInSceneRef.current = false;
    hoveredRenderableRef.current = null;
    onHoverEntity(null);
  };

  const handleCanvasPointerDown = () => {
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
    if (!boundsRect) return;
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
            onClick={() => bumpZoom(ZOOM_DEFAULT / currentCameraRef.current.zoom)}
          >
            Reset view
          </button>
          <button type="button" className="secondary-action" onClick={resetFlight}>
            Reset flight
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
                  /* noop */
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
                  /* noop */
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
                  /* noop */
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
                  /* noop */
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
                  /* noop */
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
