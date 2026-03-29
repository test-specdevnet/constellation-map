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
  drawDeploymentBuoy,
  drawParallaxCloudLayers,
  drawProximityHoverCard,
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
} from "../../lib/layout/focusContext";
import type { AppSystem, Cluster, SceneBounds, Star } from "../../lib/types/star";

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

const ZOOM_DEFAULT = 0.178;
const ZOOM_MIN = 0.07;
const ZOOM_MAX = 0.42;
const FLIGHT_TIP_KEY = "flux-flight-tip-dismissed";

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

const mapToArrowKey = (raw: string): string | null => {
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
  return null;
};

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
  timestamp,
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
  timestamp: number;
}) => {
  const phase = timestamp / 3000;
  const puffColor =
    level === "region"
      ? active
        ? "rgba(255, 255, 255, 0.98)"
        : "rgba(246, 250, 255, 0.94)"
      : active
        ? "rgba(255, 240, 214, 0.98)"
        : "rgba(255, 233, 206, 0.92)";
  const outline = rare ? "rgba(255, 246, 196, 0.72)" : "rgba(255, 255, 255, 0.34)";

  ctx.save();
  ctx.globalAlpha = alpha;

  const puffs = [
    { ox: -radius * 0.45, oy: radius * 0.04, r: radius * 0.55 },
    { ox: radius * 0.08, oy: -radius * 0.14, r: radius * 0.62 },
    { ox: radius * 0.45, oy: radius * 0.08, r: radius * 0.5 },
    { ox: 0, oy: radius * 0.2, r: radius * 0.54 },
  ];

  for (let index = 0; index < puffs.length; index += 1) {
    const puff = puffs[index];
    const drift = Math.sin(phase + index * 0.8) * 4;
    const gradient = ctx.createRadialGradient(
      x + puff.ox,
      y + puff.oy,
      radius * 0.18,
      x + puff.ox,
      y + puff.oy,
      puff.r,
    );
    gradient.addColorStop(0, puffColor);
    gradient.addColorStop(1, "rgba(255,255,255,0.18)");
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(x + puff.ox, y + puff.oy + drift, puff.r, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.lineWidth = active ? 2.2 : 1.2;
  ctx.strokeStyle = outline;
  ctx.beginPath();
  ctx.arc(x, y, radius * 0.88, 0, Math.PI * 2);
  ctx.stroke();

  if (rare) {
    ctx.setLineDash([4, 6]);
    ctx.strokeStyle = "rgba(255, 246, 196, 0.88)";
    ctx.beginPath();
    ctx.arc(x, y, radius + 8, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  ctx.fillStyle = "rgba(255,255,255,0.94)";
  ctx.font = active
    ? "700 13px Segoe UI, system-ui, sans-serif"
    : "600 12px Segoe UI, system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(label, x, y + 4);
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
  const flightSeededRef = useRef(false);
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
      const mapped = mapToArrowKey(event.key);
      if (!mapped) return;
      event.preventDefault();
      keysRef.current.add(mapped);
    };

    const up = (event: KeyboardEvent) => {
      const mapped = mapToArrowKey(event.key);
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
      sky.addColorStop(0, "#F0FBFF");
      sky.addColorStop(0.28, "#D6F1FF");
      sky.addColorStop(0.62, "#9AD8FF");
      sky.addColorStop(1, "#67BBF8");
      backgroundContext.fillStyle = sky;
      backgroundContext.fillRect(0, 0, canvasSize.width, canvasSize.height);

      const horizonGlow = backgroundContext.createLinearGradient(
        0,
        canvasSize.height * 0.46,
        0,
        canvasSize.height,
      );
      horizonGlow.addColorStop(0, "rgba(255, 255, 255, 0)");
      horizonGlow.addColorStop(0.55, "rgba(255, 255, 255, 0.08)");
      horizonGlow.addColorStop(1, "rgba(255, 249, 233, 0.18)");
      backgroundContext.fillStyle = horizonGlow;
      backgroundContext.fillRect(0, 0, canvasSize.width, canvasSize.height);

      const mist = backgroundContext.createLinearGradient(0, 0, canvasSize.width, 0);
      mist.addColorStop(0, "rgba(255, 255, 255, 0.08)");
      mist.addColorStop(0.5, "rgba(255, 255, 255, 0)");
      mist.addColorStop(1, "rgba(255, 255, 255, 0.08)");
      backgroundContext.fillStyle = mist;
      backgroundContext.fillRect(0, 0, canvasSize.width, canvasSize.height);
    }

    const draw = (timestamp: number) => {
      const keys = keysRef.current;
      const flight = flightRef.current;
      const lastTs = lastAnimTsRef.current ?? timestamp;
      const dt = clamp((timestamp - lastTs) / 1000, 0, 0.05);
      lastAnimTsRef.current = timestamp;

      const turnAccel = reducedMotion ? 5.2 : 14.5;
      const turnDamp = Math.exp(-(reducedMotion ? 9 : 10.8) * dt);
      const accel = reducedMotion ? 280 : 680;
      const brake = reducedMotion ? 460 : 1_040;
      const maxSpeed = reducedMotion ? 165 : 460;
      const coast = reducedMotion ? 0.994 : 0.9975;

      let turnInput = 0;
      if (keys.has("ArrowLeft")) turnInput -= 1;
      if (keys.has("ArrowRight")) turnInput += 1;
      flight.angVel += turnInput * turnAccel * dt;
      flight.angVel *= turnDamp;
      flight.angVel = clamp(flight.angVel, -3.4, 3.4);
      flight.heading += flight.angVel * dt;

      if (keys.has("ArrowUp")) {
        flight.speed += accel * dt;
      } else if (keys.has("ArrowDown")) {
        flight.speed -= brake * dt;
      } else {
        flight.speed *= coast;
      }
      flight.speed = clamp(flight.speed, 0, maxSpeed);

      flight.x += Math.cos(flight.heading) * flight.speed * dt;
      flight.y += Math.sin(flight.heading) * flight.speed * dt;
      flight.x = clamp(flight.x, bounds.minX, bounds.maxX);
      flight.y = clamp(flight.y, bounds.minY, bounds.maxY);

      const look = Math.min(320, flight.speed * 0.72);
      const desiredCamX = flight.x + Math.cos(flight.heading) * look * 0.11;
      const desiredCamY = flight.y + Math.sin(flight.heading) * look * 0.11;
      const camFollow = camFollowRef.current;
      const followK = Math.min(1, (reducedMotion ? 12 : 10.6) * dt);
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
      const runtimeFocusClusters = disclosure.activeRegionId
        ? runtimeClustersByRegion.get(disclosure.activeRegionId) ?? []
        : [];
      const regionSystems = disclosure.activeRegionId
        ? systemsByRegion.get(disclosure.activeRegionId) ?? []
        : [];
      const detailSystemIds = new Set(
        regionSystems
          .filter(
            (system) =>
              Math.hypot(system.x - flight.x, system.y - flight.y) <= 920 ||
              system.appName === selectedAppName ||
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

      for (const cluster of regionClusters) {
        const projected = projectWorld(cluster.centroid);
        const active = disclosure.activeRegionId === cluster.clusterId;
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
          radius: radius + 16,
          cluster,
        });
      }

      if (disclosure.band !== "overview") {
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
          });

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
            radius: radius + 12,
            cluster,
          });
        }

        for (const system of regionSystems) {
          const projected = projectWorld(system);
          const jitter = scaleDensityJitter({
            jitterOffset: system.jitterOffset,
            density: regionSystems.length,
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
        drawTopDownBiplane(
          context,
          canvasSize.width / 2,
          canvasSize.height / 2,
          flight.heading,
          clamp(flight.angVel * 0.38, -0.42, 0.42),
          timestamp,
          planeSkinPalettes[selectedSkinId],
        );
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
          Fly with WASD or arrows. Scroll to zoom.
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
              Click the sky, steer with WASD or arrows, and scroll to zoom in on a cluster.
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
        </div>
      </div>
    </div>
  );
}
