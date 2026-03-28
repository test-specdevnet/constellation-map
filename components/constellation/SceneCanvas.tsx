"use client";

import { useEffect, useMemo, useRef, useState, type PointerEvent, type WheelEvent } from "react";
import {
  drawDeploymentBuoy,
  drawParallaxCloudLayers,
  drawProximityHoverCard,
  drawTopDownBiplane,
  drawUpperSparkles,
  snapPixel,
} from "../../lib/canvas/cartoonMarkers";
import { categoryLabel, getBuoyColorway } from "../../lib/canvas/buoyCategory";
import type { AppSystem, Cluster, Star } from "../../lib/types/star";

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
  selectedAppName: string | null;
  searchMatches: string[];
  focusTarget: CameraTarget | null;
  /** True while /api/stars is loading (empty map may mean still fetching). */
  mapDataLoading: boolean;
  /** True when the snapshot request failed (empty map is not “filters”). */
  snapshotError: boolean;
  onSelectApp: (appName: string) => void;
  onHoverStar: (star: Star | null) => void;
};

type CameraState = {
  x: number;
  y: number;
  zoom: number;
};

/** Default “camera height”; wheel adjusts between min/max. */
const ZOOM_DEFAULT = 0.152;
const ZOOM_MIN = 0.07;
const ZOOM_MAX = 0.42;

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const screenToWorld = (
  screen: { x: number; y: number },
  canvasSize: { width: number; height: number },
  camera: CameraState,
) => ({
  x: (screen.x - canvasSize.width / 2) / camera.zoom + camera.x,
  y: (screen.y - canvasSize.height / 2) / camera.zoom + camera.y,
});

const worldToScreen = (
  world: { x: number; y: number },
  canvasSize: { width: number; height: number },
  camera: CameraState,
) => ({
  x: (world.x - camera.x) * camera.zoom + canvasSize.width / 2,
  y: (world.y - camera.y) * camera.zoom + canvasSize.height / 2,
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

const FLIGHT_TIP_KEY = "flux-flight-tip-dismissed";

/** World units: show hover card when plane enters this radius */
const PROX_CARD_IN = 340;
const PROX_CARD_OUT = 460;
const PROX_NEAR = 560;
const PROX_SWITCH_HYST = 90;

const mapToArrowKey = (raw: string): string | null => {
  if (raw === "ArrowUp" || raw === "ArrowDown" || raw === "ArrowLeft" || raw === "ArrowRight") {
    return raw;
  }
  if (raw === "w" || raw === "W") return "ArrowUp";
  if (raw === "s" || raw === "S") return "ArrowDown";
  if (raw === "a" || raw === "A") return "ArrowLeft";
  if (raw === "d" || raw === "D") return "ArrowRight";
  return null;
};

type SpatialGrid = {
  cellSize: number;
  cells: Map<string, Star[]>;
};

const gridKey = (cx: number, cy: number) => `${cx},${cy}`;

const buildSpatialGrid = (stars: Star[], cellSize: number): SpatialGrid => {
  const cells = new Map<string, Star[]>();
  const inv = 1 / cellSize;

  for (const star of stars) {
    const cx = Math.floor(star.x * inv);
    const cy = Math.floor(star.y * inv);
    const key = gridKey(cx, cy);
    const existing = cells.get(key);
    if (existing) {
      existing.push(star);
    } else {
      cells.set(key, [star]);
    }
  }

  return { cellSize, cells };
};

const findHoveredStarInGrid = ({
  grid,
  pointer,
  canvasSize,
  camera,
  radiusPadding,
  hitScale = 1,
}: {
  grid: SpatialGrid;
  pointer: { x: number; y: number };
  canvasSize: { width: number; height: number };
  camera: CameraState;
  radiusPadding: number;
  hitScale?: number;
}) => {
  const pointerWorld = screenToWorld(pointer, canvasSize, camera);
  const inv = 1 / grid.cellSize;
  const cx = Math.floor(pointerWorld.x * inv);
  const cy = Math.floor(pointerWorld.y * inv);

  let closest: { star: Star; distance: number } | null = null;

  for (let dx = -1; dx <= 1; dx += 1) {
    for (let dy = -1; dy <= 1; dy += 1) {
      const key = gridKey(cx + dx, cy + dy);
      const bucket = grid.cells.get(key);
      if (!bucket) continue;

      for (const star of bucket) {
        const point = worldToScreen({ x: star.x, y: star.y }, canvasSize, camera);
        const sx = point.x - pointer.x;
        const sy = point.y - pointer.y;
        const distance = Math.sqrt(sx * sx + sy * sy);
        const radius =
          Math.max(14, star.size * camera.zoom + radiusPadding) * hitScale;

        if (distance <= radius && (!closest || distance < closest.distance)) {
          closest = { star, distance };
        }
      }
    }
  }

  return closest?.star ?? null;
};

const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  window.matchMedia &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

type FlightState = {
  x: number;
  y: number;
  heading: number;
  speed: number;
  angVel: number;
};

const centroidOfStars = (list: Star[]) => {
  if (!list.length) return { x: 0, y: 0 };
  let sx = 0;
  let sy = 0;
  for (const s of list) {
    sx += s.x;
    sy += s.y;
  }
  return { x: sx / list.length, y: sy / list.length };
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

export function SceneCanvas({
  stars,
  clusters,
  systems: _systems,
  selectedAppName,
  searchMatches,
  focusTarget,
  mapDataLoading,
  snapshotError,
  onSelectApp,
  onHoverStar,
}: SceneCanvasProps) {
  void _systems;
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const pointerRef = useRef<{ x: number; y: number } | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const currentCameraRef = useRef<CameraState>({
    x: 0,
    y: 0,
    zoom: ZOOM_DEFAULT,
  });
  /** Smoothed camera position (lags slightly behind plane + look-ahead). */
  const camFollowRef = useRef({ x: 0, y: 0 });
  const proximityStickyIdRef = useRef<string | null>(null);
  const cardAlphaRef = useRef(0);
  /** Nearest buoy for tap-to-select when not using pointer hit. */
  const proximitySelectRef = useRef<Star | null>(null);
  const hoveredStarIdRef = useRef<string | null>(null);
  const [hudLine, setHudLine] = useState("WASD / arrows · wheel zoom · click map to focus");
  const [canvasSize, setCanvasSize] = useState({ width: 1200, height: 760 });
  const backgroundCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const backgroundContextRef = useRef<CanvasRenderingContext2D | null>(null);
  const lastHudUpdateRef = useRef(0);
  const lastHoverEvalRef = useRef({ x: 0, y: 0, cameraX: 0, cameraY: 0, cameraZoom: 0 });
  const flightRef = useRef<FlightState>({
    x: 0,
    y: 0,
    heading: -Math.PI / 2,
    speed: 0,
    angVel: 0,
  });
  const keysRef = useRef<Set<string>>(new Set());
  const pointerInSceneRef = useRef(false);
  const lastAnimTsRef = useRef<number | null>(null);
  const flightSeededRef = useRef(false);
  const focusKeyAppliedRef = useRef<string | null>(null);
  const [showFlightTip, setShowFlightTip] = useState(false);

  const starsById = useMemo(() => new Map(stars.map((star) => [star.id, star])), [stars]);
  const matchSet = useMemo(() => new Set(searchMatches), [searchMatches]);
  const spatialGrid = useMemo(() => buildSpatialGrid(stars, 300), [stars]);

  const reducedMotion = prefersReducedMotion();

  useEffect(() => {
    try {
      if (typeof sessionStorage !== "undefined" && !sessionStorage.getItem(FLIGHT_TIP_KEY)) {
        setShowFlightTip(true);
      }
    } catch {
      setShowFlightTip(true);
    }
  }, []);

  useEffect(() => {
    if (!stars.length || flightSeededRef.current) {
      return;
    }
    const c = centroidOfStars(stars);
    flightRef.current.x = c.x;
    flightRef.current.y = c.y;
    flightRef.current.heading = -Math.PI / 2;
    flightRef.current.speed = 0;
    flightRef.current.angVel = 0;
    camFollowRef.current.x = c.x;
    camFollowRef.current.y = c.y;
    currentCameraRef.current.x = c.x;
    currentCameraRef.current.y = c.y;
    currentCameraRef.current.zoom = ZOOM_DEFAULT;
    flightSeededRef.current = true;
  }, [stars]);

  useEffect(() => {
    const measure = () => {
      const bounds = wrapRef.current?.getBoundingClientRect();
      if (!bounds) {
        return;
      }
      setCanvasSize({
        width: Math.max(320, Math.floor(bounds.width)),
        height: Math.max(520, Math.floor(bounds.height)),
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
    flightRef.current.speed *= 0.2;
    flightRef.current.angVel *= 0.3;
    camFollowRef.current.x = focusTarget.x;
    camFollowRef.current.y = focusTarget.y;
    currentCameraRef.current.x = focusTarget.x;
    currentCameraRef.current.y = focusTarget.y;
  }, [focusTarget]);

  useEffect(() => {
    const flightKeysActive = () => {
      const wrap = wrapRef.current;
      if (!wrap) return pointerInSceneRef.current;
      const ae = document.activeElement;
      return (
        pointerInSceneRef.current ||
        ae === wrap ||
        (ae !== null && wrap.contains(ae))
      );
    };

    const down = (e: KeyboardEvent) => {
      if (!flightKeysActive()) return;
      const mapped = mapToArrowKey(e.key);
      if (!mapped) return;
      e.preventDefault();
      keysRef.current.add(mapped);
    };
    const up = (e: KeyboardEvent) => {
      const mapped = mapToArrowKey(e.key);
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
    backgroundContextRef.current = backgroundContext;

    if (backgroundContext) {
      backgroundCanvas.width = canvas.width;
      backgroundCanvas.height = canvas.height;
      backgroundContext.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);

      const sky = backgroundContext.createLinearGradient(
        0,
        canvasSize.height,
        0,
        0,
      );
      sky.addColorStop(0, "#8EC8F5");
      sky.addColorStop(0.35, "#5B9AE8");
      sky.addColorStop(0.62, "#2B61D1");
      sky.addColorStop(1, "#0C2248");
      backgroundContext.fillStyle = sky;
      backgroundContext.fillRect(0, 0, canvasSize.width, canvasSize.height);

      const bloom = backgroundContext.createRadialGradient(
        canvasSize.width * 0.5,
        canvasSize.height * 0.92,
        20,
        canvasSize.width * 0.5,
        canvasSize.height * 1.05,
        Math.max(canvasSize.width, canvasSize.height) * 0.85,
      );
      bloom.addColorStop(0, "rgba(255, 255, 255, 0.35)");
      bloom.addColorStop(0.4, "rgba(120, 170, 235, 0.12)");
      bloom.addColorStop(1, "rgba(12, 34, 72, 0)");
      backgroundContext.fillStyle = bloom;
      backgroundContext.fillRect(0, 0, canvasSize.width, canvasSize.height);
    }

    const draw = (timestamp: number) => {
      const keys = keysRef.current;
      const flight = flightRef.current;
      const lastTs = lastAnimTsRef.current ?? timestamp;
      const dt = clamp((timestamp - lastTs) / 1000, 0, 0.05);
      lastAnimTsRef.current = timestamp;

      const turnAccel = reducedMotion ? 4.2 : 9.5;
      const turnDamp = Math.exp(-6.2 * dt);
      const accel = reducedMotion ? 260 : 520;
      const brake = reducedMotion ? 380 : 720;
      const maxSpeed = reducedMotion ? 150 : 340;
      const coast = reducedMotion ? 0.992 : 0.996;

      let turnInput = 0;
      if (keys.has("ArrowLeft")) turnInput -= 1;
      if (keys.has("ArrowRight")) turnInput += 1;
      flight.angVel += turnInput * turnAccel * dt;
      flight.angVel *= turnDamp;
      flight.angVel = clamp(flight.angVel, -2.4, 2.4);
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

      const look = Math.min(280, flight.speed * 0.72);
      const desiredCamX = flight.x + Math.cos(flight.heading) * look * 0.24;
      const desiredCamY = flight.y + Math.sin(flight.heading) * look * 0.24;
      const camFollow = camFollowRef.current;
      const followK = Math.min(1, (reducedMotion ? 10 : 6.2) * dt);
      camFollow.x += (desiredCamX - camFollow.x) * followK;
      camFollow.y += (desiredCamY - camFollow.y) * followK;

      const camera = currentCameraRef.current;
      camera.x = camFollow.x;
      camera.y = camFollow.y;

      const bankRad = clamp(flight.angVel * 0.38, -0.42, 0.42);

      context.clearRect(0, 0, canvasSize.width, canvasSize.height);

      if (backgroundCanvasRef.current) {
        context.drawImage(backgroundCanvasRef.current, 0, 0, canvasSize.width, canvasSize.height);
      } else {
        context.fillStyle = "#2B61D1";
        context.fillRect(0, 0, canvasSize.width, canvasSize.height);
      }

      drawUpperSparkles(context, canvasSize.width, canvasSize.height, timestamp);
      drawParallaxCloudLayers(
        context,
        canvasSize.width,
        canvasSize.height,
        timestamp,
        camFollow.x,
        camFollow.y,
        { layerMin: 0, layerMax: 1 },
      );

      if (!stars.length) {
        context.save();
        context.textAlign = "center";
        context.font = "600 17px Segoe UI, system-ui, sans-serif";
        context.fillStyle = "rgba(255,255,255,0.92)";
        const msg = snapshotError
          ? "Could not load the public snapshot."
          : mapDataLoading
            ? "Loading deployments…"
            : "No deployments match your filters. Try widening filters in the bar above.";
        context.fillText(msg, canvasSize.width / 2, canvasSize.height / 2 - 40);
        context.font = "14px Segoe UI, system-ui, sans-serif";
        context.fillStyle = "rgba(255,255,255,0.7)";
        if (snapshotError) {
          context.fillText('Click "Retry loading snapshot" below.', canvasSize.width / 2, canvasSize.height / 2 - 12);
        } else if (!mapDataLoading) {
          context.fillText(
            "Use search or the featured list below to jump on the map.",
            canvasSize.width / 2,
            canvasSize.height / 2 - 12,
          );
        }
        context.textAlign = "start";
        context.restore();
      }

      for (const cluster of clusters) {
        const point = worldToScreen(cluster.centroid, canvasSize, camera);
        if (
          point.x < -120 ||
          point.y < -120 ||
          point.x > canvasSize.width + 120 ||
          point.y > canvasSize.height + 120
        ) {
          continue;
        }
        context.beginPath();
        context.strokeStyle = "rgba(255, 255, 255, 0.08)";
        context.lineWidth = 1;
        context.arc(point.x, point.y, 36 + cluster.summaryMetrics.instances * 0.05, 0, Math.PI * 2);
        context.stroke();

        context.fillStyle = "rgba(255, 255, 255, 0.78)";
        context.font = "600 12px Segoe UI, system-ui, sans-serif";
        context.fillText(cluster.label, point.x + 10, point.y - 10);
        context.fillStyle = "rgba(255, 255, 255, 0.55)";
        context.font = "11px Segoe UI, system-ui, sans-serif";
        context.fillText(
          `${cluster.summaryMetrics.apps} apps`,
          point.x + 10,
          point.y + 6,
        );
      }

      const pointer = pointerRef.current;
      const lastHoverEval = lastHoverEvalRef.current;
      const hoverNeedsEval =
        !!pointer &&
        (Math.abs(pointer.x - lastHoverEval.x) > 1.2 ||
          Math.abs(pointer.y - lastHoverEval.y) > 1.2 ||
          Math.abs(camera.x - lastHoverEval.cameraX) > 2.2 ||
          Math.abs(camera.y - lastHoverEval.cameraY) > 2.2 ||
          Math.abs(camera.zoom - lastHoverEval.cameraZoom) > 0.004);

      const hovered =
        pointer && hoverNeedsEval && stars.length
          ? findHoveredStarInGrid({
              grid: spatialGrid,
              pointer,
              canvasSize,
              camera,
              radiusPadding: 8,
              hitScale: 1.55,
            })
          : hoveredStarIdRef.current
            ? starsById.get(hoveredStarIdRef.current) ?? null
            : null;

      if (pointer && hoverNeedsEval) {
        lastHoverEvalRef.current = {
          x: pointer.x,
          y: pointer.y,
          cameraX: camera.x,
          cameraY: camera.y,
          cameraZoom: camera.zoom,
        };
      }

      if (hovered?.id !== hoveredStarIdRef.current) {
        hoveredStarIdRef.current = hovered?.id ?? null;
        onHoverStar(hovered ?? null);
      }

      let nearestIn: { star: Star; d: number } | null = null;
      for (const star of stars) {
        const dx = star.x - flight.x;
        const dy = star.y - flight.y;
        const d = Math.hypot(dx, dy);
        if (d < PROX_CARD_IN && (!nearestIn || d < nearestIn.d)) {
          nearestIn = { star, d };
        }
      }

      const stickyId = proximityStickyIdRef.current;
      let cardStar: Star | null = null;
      if (nearestIn) {
        if (!stickyId || stickyId === nearestIn.star.id) {
          proximityStickyIdRef.current = nearestIn.star.id;
          cardStar = nearestIn.star;
        } else {
          const old = starsById.get(stickyId);
          const dOld = old ? Math.hypot(old.x - flight.x, old.y - flight.y) : 1e9;
          if (old && dOld < PROX_CARD_OUT && dOld < nearestIn.d + PROX_SWITCH_HYST) {
            cardStar = old;
          } else {
            proximityStickyIdRef.current = nearestIn.star.id;
            cardStar = nearestIn.star;
          }
        }
      } else if (stickyId) {
        const old = starsById.get(stickyId);
        const dOld = old ? Math.hypot(old.x - flight.x, old.y - flight.y) : 1e9;
        if (old && dOld < PROX_CARD_OUT) {
          cardStar = old;
        } else {
          proximityStickyIdRef.current = null;
        }
      }

      const cardTarget = cardStar ? 1 : 0;
      cardAlphaRef.current += (cardTarget - cardAlphaRef.current) * Math.min(1, 5 * dt);
      proximitySelectRef.current =
        cardStar && cardAlphaRef.current > 0.35 ? cardStar : null;

      for (const star of stars) {
        const point = worldToScreen({ x: star.x, y: star.y }, canvasSize, camera);
        if (
          point.x < -80 ||
          point.y < -80 ||
          point.x > canvasSize.width + 80 ||
          point.y > canvasSize.height + 80
        ) {
          continue;
        }

        const selected = selectedAppName === star.appName;
        const hoveredMatch = hovered?.id === star.id;
        const searchMatch = matchSet.has(star.appName);
        const dx = star.x - flight.x;
        const dy = star.y - flight.y;
        const distW = Math.hypot(dx, dy);

        let proximity: 0 | 1 | 2 = 0;
        if (cardStar?.id === star.id && cardAlphaRef.current > 0.2) {
          proximity = 2;
        } else if (distW < PROX_NEAR) {
          proximity = 1;
        }

        const colors = getBuoyColorway(star);
        const baseScale = Math.max(
          1.02,
          Math.min(2.85, star.size * camera.zoom * 0.1 + 0.18),
        );
        drawDeploymentBuoy({
          ctx: context,
          x: point.x,
          y: point.y,
          colors,
          baseScale,
          seed: star.id,
          proximity,
          selected,
          searchOrPointer: hoveredMatch || searchMatch,
          timestamp,
        });
      }

      drawParallaxCloudLayers(
        context,
        canvasSize.width,
        canvasSize.height,
        timestamp,
        camFollow.x,
        camFollow.y,
        { layerMin: 2, layerMax: 2 },
      );

      if (cardStar && cardAlphaRef.current > 0.04) {
        const p = worldToScreen({ x: cardStar.x, y: cardStar.y }, canvasSize, camera);
        drawProximityHoverCard(
          context,
          p.x,
          p.y,
          cardStar.appName,
          categoryLabel(cardStar),
          cardAlphaRef.current,
        );
      }

      if (stars.length) {
        drawTopDownBiplane(
          context,
          canvasSize.width / 2,
          canvasSize.height / 2,
          flight.heading,
          bankRad,
          timestamp,
        );
      }

      if (timestamp - lastHudUpdateRef.current > 120) {
        lastHudUpdateRef.current = timestamp;
        const spd = Math.round(flight.speed);
        const zoomPct = Math.round((camera.zoom / ZOOM_DEFAULT) * 100);
        const nextLine = `↑/W · ↓/S · ←/A · →/D · scroll zoom · ${spd} kt · view ${zoomPct}%`;
        setHudLine((cur) => (cur === nextLine ? cur : nextLine));
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
    canvasSize.height,
    canvasSize.width,
    clusters,
    mapDataLoading,
    snapshotError,
    matchSet,
    onHoverStar,
    reducedMotion,
    selectedAppName,
    stars,
    starsById,
    spatialGrid,
  ]);

  const resetFlight = () => {
    const c = centroidOfStars(stars);
    flightRef.current = {
      x: c.x,
      y: c.y,
      heading: -Math.PI / 2,
      speed: 0,
      angVel: 0,
    };
    camFollowRef.current.x = c.x;
    camFollowRef.current.y = c.y;
    currentCameraRef.current.x = c.x;
    currentCameraRef.current.y = c.y;
    currentCameraRef.current.zoom = ZOOM_DEFAULT;
    proximityStickyIdRef.current = null;
    cardAlphaRef.current = 0;
  };

  const bumpZoom = (factor: number) => {
    const camera = currentCameraRef.current;
    const flight = flightRef.current;
    zoomAtPoint(camera, flight, canvasSize, { x: canvasSize.width / 2, y: canvasSize.height / 2 }, camera.zoom * factor);
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
    const bounds = canvasRef.current?.getBoundingClientRect();
    if (bounds) {
      pointerRef.current = {
        x: event.clientX - bounds.left,
        y: event.clientY - bounds.top,
      };
    }
  };

  const handlePointerLeave = () => {
    pointerRef.current = null;
    pointerInSceneRef.current = false;
    hoveredStarIdRef.current = null;
    onHoverStar(null);
  };

  const handleCanvasPointerDown = () => {
    wrapRef.current?.focus({ preventScroll: true });
  };

  const handleClick = () => {
    const id = hoveredStarIdRef.current;
    if (id) {
      const star = starsById.get(id);
      if (star) {
        onSelectApp(star.appName);
        return;
      }
    }
    const near = proximitySelectRef.current;
    if (near) {
      onSelectApp(near.appName);
    }
  };

  const handleWheel = (event: WheelEvent<HTMLCanvasElement>) => {
    event.preventDefault();
    const bounds = canvasRef.current?.getBoundingClientRect();
    if (!bounds) return;
    const sx = event.clientX - bounds.left;
    const sy = event.clientY - bounds.top;
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
          <button type="button" className="secondary-action" onClick={() => bumpZoom(1 / 1.12)}>
            Zoom out
          </button>
          <button type="button" className="secondary-action" onClick={() => bumpZoom(ZOOM_DEFAULT / currentCameraRef.current.zoom)}>
            Reset view
          </button>
          <button type="button" className="secondary-action" onClick={resetFlight}>
            Reset flight
          </button>
        </div>
        <span className="scene-zoom-label scene-zoom-label--wrap">{hudLine}</span>
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
              How to fly
            </h2>
            <ul className="scene-flight-tip-list">
              <li>
                <strong>Click the blue map</strong> (or tap below on phones) so keys work.
              </li>
              <li>
                <strong>Arrow keys</strong> or <strong>W A S D</strong>: turn and thrust; <strong>down</strong> or <strong>S</strong> to slow.
              </li>
              <li>
                <strong>Scroll</strong> (or pinch on a trackpad) to zoom; centers stay under your cursor.
              </li>
              <li>
                <strong>Fly close</strong> to a buoy for its name; <strong>click</strong> or tap to open details.
              </li>
            </ul>
            <button type="button" className="primary-action scene-flight-tip-dismiss" onClick={dismissTip}>
              Got it
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

        <div className="scene-flight-pad" aria-label="Touch flight controls">
          <div className="scene-flight-pad-row scene-flight-pad-row--top">
            <button
              type="button"
              className="scene-flight-pad-btn"
              aria-label="Thrust"
              onPointerDown={(e) => {
                e.preventDefault();
                pressPad("ArrowUp");
                e.currentTarget.setPointerCapture(e.pointerId);
              }}
              onPointerUp={(e) => {
                releasePad("ArrowUp");
                try {
                  e.currentTarget.releasePointerCapture(e.pointerId);
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
              onPointerDown={(e) => {
                e.preventDefault();
                pressPad("ArrowLeft");
                e.currentTarget.setPointerCapture(e.pointerId);
              }}
              onPointerUp={(e) => {
                releasePad("ArrowLeft");
                try {
                  e.currentTarget.releasePointerCapture(e.pointerId);
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
              onPointerDown={(e) => {
                e.preventDefault();
                pressPad("ArrowDown");
                e.currentTarget.setPointerCapture(e.pointerId);
              }}
              onPointerUp={(e) => {
                releasePad("ArrowDown");
                try {
                  e.currentTarget.releasePointerCapture(e.pointerId);
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
              onPointerDown={(e) => {
                e.preventDefault();
                pressPad("ArrowRight");
                e.currentTarget.setPointerCapture(e.pointerId);
              }}
              onPointerUp={(e) => {
                releasePad("ArrowRight");
                try {
                  e.currentTarget.releasePointerCapture(e.pointerId);
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
