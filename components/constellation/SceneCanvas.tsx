"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent,
  type WheelEvent,
} from "react";
import {
  drawCartoonMarker,
  drawSkyCloudLayer,
  drawTourBiplane,
  getCartoonAccent,
  getMarkerVariant,
  snapPixel,
} from "../../lib/canvas/cartoonMarkers";
import type { AppSystem, Cluster, Star } from "../../lib/types/star";
import { buildTourWaypoints } from "../../lib/tour/buildTourWaypoints";

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
  onSelectApp: (appName: string) => void;
  onHoverStar: (star: Star | null) => void;
};

type CameraState = {
  x: number;
  y: number;
  zoom: number;
};

type CameraMotion = {
  velocityX: number;
  velocityY: number;
  velocityZoom: number;
};

const defaultCamera: CameraState = {
  x: 0,
  y: 0,
  zoom: 0.18,
};

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const lerp = (from: number, to: number, t: number) => from + (to - from) * t;

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
          Math.max(8, star.size * camera.zoom + radiusPadding) * hitScale;

        if (distance <= radius && (!closest || distance < closest.distance)) {
          closest = { star, distance };
        }
      }
    }
  }

  return closest?.star ?? null;
};

const normalizeWheel = (event: WheelEvent) => {
  let delta = event.deltaY;

  if (event.deltaMode === 1) {
    delta *= 16;
  } else if (event.deltaMode === 2) {
    delta *= 800;
  }

  delta = Math.max(-220, Math.min(220, delta));
  return delta;
};

const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  window.matchMedia &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const easeInOutCubic = (t: number) =>
  t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;

const TOUR_SEGMENT_MS = 5200;

export function SceneCanvas({
  stars,
  clusters,
  systems,
  selectedAppName,
  searchMatches,
  focusTarget,
  onSelectApp,
  onHoverStar,
}: SceneCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const pointerRef = useRef<{ x: number; y: number } | null>(null);
  const draggingRef = useRef(false);
  const lastPointerRef = useRef<{ x: number; y: number } | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const targetCameraRef = useRef<CameraState>({ ...defaultCamera });
  const currentCameraRef = useRef<CameraState>({ ...defaultCamera });
  const motionRef = useRef<CameraMotion>({
    velocityX: 0,
    velocityY: 0,
    velocityZoom: 0,
  });
  const hoveredStarIdRef = useRef<string | null>(null);
  const [cameraLabel, setCameraLabel] = useState(defaultCamera.zoom.toFixed(2));
  const [canvasSize, setCanvasSize] = useState({ width: 1200, height: 760 });
  const [hoveredStarId, setHoveredStarId] = useState<string | null>(null);
  const [tourMode, setTourMode] = useState(false);
  const backgroundCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const backgroundContextRef = useRef<CanvasRenderingContext2D | null>(null);
  const lastHudUpdateRef = useRef(0);
  const lastHoverEvalRef = useRef({ x: 0, y: 0, cameraX: 0, cameraY: 0, cameraZoom: 0 });
  const tourModeRef = useRef(false);
  const tourStartMsRef = useRef(0);
  const tourHeadingRef = useRef(0);
  const lastWheelAtRef = useRef(0);

  const starsById = useMemo(() => new Map(stars.map((star) => [star.id, star])), [stars]);
  const matchSet = useMemo(() => new Set(searchMatches), [searchMatches]);
  const spatialGrid = useMemo(() => buildSpatialGrid(stars, 220), [stars]);
  const tourWaypoints = useMemo(() => buildTourWaypoints(systems, stars), [systems, stars]);

  const reducedMotion = prefersReducedMotion();

  useEffect(() => {
    tourModeRef.current = tourMode;
    if (tourMode) {
      tourStartMsRef.current = performance.now();
      motionRef.current = { velocityX: 0, velocityY: 0, velocityZoom: 0 };
    }
  }, [tourMode]);

  useEffect(() => {
    if (focusTarget) {
      setTourMode(false);
    }
  }, [focusTarget]);

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
    if (!focusTarget) {
      return;
    }

    const reduceMotion = prefersReducedMotion();
    if (reduceMotion) {
      targetCameraRef.current = { x: focusTarget.x, y: focusTarget.y, zoom: focusTarget.zoom };
      currentCameraRef.current = { x: focusTarget.x, y: focusTarget.y, zoom: focusTarget.zoom };
      return;
    }

    const current = currentCameraRef.current;
    const dx = focusTarget.x - current.x;
    const dy = focusTarget.y - current.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const zoomDelta = Math.abs(focusTarget.zoom - current.zoom);
    const snap =
      distance < 8 &&
      zoomDelta < 0.03;

    targetCameraRef.current = { x: focusTarget.x, y: focusTarget.y, zoom: focusTarget.zoom };
    if (snap) {
      currentCameraRef.current = { x: focusTarget.x, y: focusTarget.y, zoom: focusTarget.zoom };
    }
  }, [focusTarget]);

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

      // Flux blue sky: primary #2B61D1, supporting #4F7AD4 / #86A1DA, deep corners for depth
      const sky = backgroundContext.createLinearGradient(0, 0, canvasSize.width, canvasSize.height);
      sky.addColorStop(0, "#4F7AD4");
      sky.addColorStop(0.35, "#2B61D1");
      sky.addColorStop(0.65, "#2554b8");
      sky.addColorStop(1, "#153d72");
      backgroundContext.fillStyle = sky;
      backgroundContext.fillRect(0, 0, canvasSize.width, canvasSize.height);

      const bloom = backgroundContext.createRadialGradient(
        canvasSize.width * 0.28,
        canvasSize.height * 0.28,
        8,
        canvasSize.width * 0.4,
        canvasSize.height * 0.38,
        Math.max(canvasSize.width, canvasSize.height) * 0.72,
      );
      bloom.addColorStop(0, "rgba(134, 161, 218, 0.45)");
      bloom.addColorStop(0.35, "rgba(79, 122, 212, 0.22)");
      bloom.addColorStop(0.65, "rgba(43, 97, 209, 0.08)");
      bloom.addColorStop(1, "rgba(21, 61, 114, 0)");
      backgroundContext.fillStyle = bloom;
      backgroundContext.fillRect(0, 0, canvasSize.width, canvasSize.height);

      const haze = backgroundContext.createRadialGradient(
        canvasSize.width * 0.78,
        canvasSize.height * 0.62,
        6,
        canvasSize.width * 0.72,
        canvasSize.height * 0.55,
        Math.max(canvasSize.width, canvasSize.height) * 0.9,
      );
      haze.addColorStop(0, "rgba(255, 255, 255, 0.08)");
      haze.addColorStop(0.45, "rgba(43, 97, 209, 0.06)");
      haze.addColorStop(1, "rgba(15, 47, 92, 0)");
      backgroundContext.fillStyle = haze;
      backgroundContext.fillRect(0, 0, canvasSize.width, canvasSize.height);

      for (let index = 0; index < 260; index += 1) {
        const x = (index * 97) % canvasSize.width;
        const y = (index * 193) % canvasSize.height;
        const size = index % 9 === 0 ? 1.8 : index % 4 === 0 ? 1.2 : 0.8;
        const alpha = index % 7 === 0 ? 0.42 : 0.26;
        backgroundContext.beginPath();
        backgroundContext.fillStyle = `rgba(255,255,255,${alpha})`;
        backgroundContext.arc(x, y, size, 0, Math.PI * 2);
        backgroundContext.fill();
      }
    }

    const draw = (timestamp: number) => {
      const camera = currentCameraRef.current;

      if (tourModeRef.current && !reducedMotion && tourWaypoints.length >= 2) {
        const elapsed = timestamp - tourStartMsRef.current;
        const n = tourWaypoints.length;
        const cycleLen = n * TOUR_SEGMENT_MS;
        const e = elapsed % cycleLen;
        const segIdx = Math.floor(e / TOUR_SEGMENT_MS) % n;
        const nextIdx = (segIdx + 1) % n;
        const u = easeInOutCubic((e % TOUR_SEGMENT_MS) / TOUR_SEGMENT_MS);
        const p0 = tourWaypoints[segIdx];
        const p1 = tourWaypoints[nextIdx];
        const dx = p1.x - p0.x;
        const dy = p1.y - p0.y;
        tourHeadingRef.current = Math.atan2(dy, dx);
        const swayX = 22 * Math.sin(timestamp / 1100 + segIdx * 0.5);
        const swayY = 18 * Math.cos(timestamp / 1250 + segIdx * 0.4);
        const tx = lerp(p0.x, p1.x, u) + swayX * 0.004;
        const ty = lerp(p0.y, p1.y, u) + swayY * 0.004;
        const zoomBreath = Math.sin(Math.PI * u);
        const tz = clamp(
          0.22 + zoomBreath * 0.22 + 0.03 * Math.sin(timestamp / 2400),
          0.18,
          0.52,
        );
        targetCameraRef.current = { x: tx, y: ty, zoom: tz };
      }

      const target = targetCameraRef.current;

      const dt = Math.min(40, Math.max(8, timestamp - (lastHudUpdateRef.current || timestamp)));
      const smooth = prefersReducedMotion() ? 1 : 1 - Math.pow(0.001, dt / 16);

      const motion = motionRef.current;
      const wheelRecent = performance.now() - lastWheelAtRef.current < 140;
      const tightFollow = wheelRecent || draggingRef.current;
      const stiffness = (tightFollow ? 0.52 : 0.28) * smooth;
      const damping = prefersReducedMotion() ? 0.9 : tightFollow ? 0.91 : 0.88;

      motion.velocityX = (motion.velocityX + (target.x - camera.x) * stiffness) * damping;
      motion.velocityY = (motion.velocityY + (target.y - camera.y) * stiffness) * damping;
      motion.velocityZoom = (motion.velocityZoom + (target.zoom - camera.zoom) * (stiffness * 0.95)) * damping;

      camera.x += motion.velocityX;
      camera.y += motion.velocityY;
      camera.zoom += motion.velocityZoom;

      context.clearRect(0, 0, canvasSize.width, canvasSize.height);

      if (backgroundCanvasRef.current) {
        context.drawImage(backgroundCanvasRef.current, 0, 0, canvasSize.width, canvasSize.height);
      } else {
        context.fillStyle = "#2B61D1";
        context.fillRect(0, 0, canvasSize.width, canvasSize.height);
      }

      drawSkyCloudLayer(
        context,
        canvasSize.width,
        canvasSize.height,
        timestamp,
        tourModeRef.current ? "tour" : "explore",
      );

      if (camera.zoom < 0.72 && !tourModeRef.current) {
        for (const cluster of clusters) {
          const point = worldToScreen(cluster.centroid, canvasSize, camera);
          context.beginPath();
          context.strokeStyle = "rgba(255, 255, 255, 0.1)";
          context.lineWidth = 1;
          context.arc(point.x, point.y, 40 + cluster.summaryMetrics.instances * 0.06, 0, Math.PI * 2);
          context.stroke();

          context.fillStyle = "rgba(255, 255, 255, 0.92)";
          context.font = "600 14px Segoe UI";
          context.fillText(cluster.label, point.x + 12, point.y - 12);
          context.fillStyle = "rgba(255, 255, 255, 0.72)";
          context.font = "12px Segoe UI";
          context.fillText(
            `${cluster.summaryMetrics.apps} apps`,
            point.x + 12,
            point.y + 8,
          );
        }
      }

      const pointer = pointerRef.current;
      const lastHoverEval = lastHoverEvalRef.current;
      const hoverNeedsEval =
        !!pointer &&
        (Math.abs(pointer.x - lastHoverEval.x) > 1.2 ||
          Math.abs(pointer.y - lastHoverEval.y) > 1.2 ||
          Math.abs(camera.x - lastHoverEval.cameraX) > 2.2 ||
          Math.abs(camera.y - lastHoverEval.cameraY) > 2.2 ||
          Math.abs(camera.zoom - lastHoverEval.cameraZoom) > 0.01);

      const hovered =
        pointer && hoverNeedsEval
          ? findHoveredStarInGrid({
              grid: spatialGrid,
              pointer,
              canvasSize,
              camera,
              radiusPadding: 5,
              hitScale: tourModeRef.current ? 1.55 : 1.15,
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
        setHoveredStarId(hovered?.id ?? null);
        onHoverStar(hovered ?? null);
      }

      const inTour = tourModeRef.current;

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

        const accent = getCartoonAccent(star.appName);
        const variant = getMarkerVariant(star.appName);
        const baseScale = Math.max(
          0.82,
          Math.min(2.4, star.size * camera.zoom * 0.095),
        );
        drawCartoonMarker({
          ctx: context,
          x: inTour ? snapPixel(point.x) : point.x,
          y: inTour ? snapPixel(point.y) : point.y,
          accent,
          variant,
          baseScale,
          highlight: selected || hoveredMatch || searchMatch,
          chunkyOutline: inTour,
        });

        if ((selected || hoveredMatch || searchMatch) && camera.zoom > 0.58) {
          const tx = point.x + 14;
          const ty = point.y - 12;
          context.font = selected ? "600 13px Segoe UI, system-ui, sans-serif" : "12px Segoe UI, system-ui, sans-serif";
          context.lineJoin = "round";
          context.strokeStyle = "rgba(10, 10, 18, 0.92)";
          context.lineWidth = 3;
          context.strokeText(star.appName, tx, ty);
          context.fillStyle = "#ffffff";
          context.fillText(star.appName, tx, ty);
        }
      }

      if (inTour) {
        drawTourBiplane(
          context,
          canvasSize.width,
          canvasSize.height,
          timestamp,
          tourHeadingRef.current,
        );
      }

      if (timestamp - lastHudUpdateRef.current > 90) {
        lastHudUpdateRef.current = timestamp;
        const nextLabel = camera.zoom.toFixed(2);
        setCameraLabel((currentLabel) =>
          currentLabel === nextLabel ? currentLabel : nextLabel,
        );
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
    matchSet,
    onHoverStar,
    reducedMotion,
    selectedAppName,
    stars,
    starsById,
    spatialGrid,
    systems,
    tourWaypoints,
  ]);

  const zoomAt = (nextZoom: number, anchorScreen?: { x: number; y: number }) => {
    const next = clamp(nextZoom, 0.12, 2.6);
    const target = targetCameraRef.current;
    const current = currentCameraRef.current;
    const anchor = anchorScreen ?? { x: canvasSize.width / 2, y: canvasSize.height / 2 };

    const anchorWorld = screenToWorld(anchor, canvasSize, current);
    const before = worldToScreen(anchorWorld, canvasSize, current);

    target.zoom = next;
    const afterCamera: CameraState = { x: target.x, y: target.y, zoom: next };
    const after = worldToScreen(anchorWorld, canvasSize, afterCamera);

    const dx = (after.x - before.x) / next;
    const dy = (after.y - before.y) / next;
    target.x += dx;
    target.y += dy;
  };

  const resetView = () => {
    targetCameraRef.current = { ...defaultCamera };
  };

  const handlePointerDown = (event: PointerEvent<HTMLCanvasElement>) => {
    draggingRef.current = true;
    lastPointerRef.current = { x: event.clientX, y: event.clientY };
  };

  const handlePointerMove = (event: PointerEvent<HTMLCanvasElement>) => {
    const bounds = canvasRef.current?.getBoundingClientRect();
    if (bounds) {
      pointerRef.current = {
        x: event.clientX - bounds.left,
        y: event.clientY - bounds.top,
      };
    }

    if (!draggingRef.current || !lastPointerRef.current) {
      return;
    }

    const movementX = event.clientX - lastPointerRef.current.x;
    const movementY = event.clientY - lastPointerRef.current.y;
    lastPointerRef.current = { x: event.clientX, y: event.clientY };

    if (tourMode && (Math.abs(movementX) > 4 || Math.abs(movementY) > 4)) {
      setTourMode(false);
    }

    targetCameraRef.current = {
      ...targetCameraRef.current,
      x: targetCameraRef.current.x - movementX / currentCameraRef.current.zoom,
      y: targetCameraRef.current.y - movementY / currentCameraRef.current.zoom,
    };
  };

  const handlePointerUp = () => {
    draggingRef.current = false;
    lastPointerRef.current = null;
  };

  const handlePointerLeave = () => {
    draggingRef.current = false;
    lastPointerRef.current = null;
    pointerRef.current = null;
    hoveredStarIdRef.current = null;
    setHoveredStarId(null);
    onHoverStar(null);
  };

  const handleClick = () => {
    if (hoveredStarId) {
      const star = starsById.get(hoveredStarId);
      if (star) {
        onSelectApp(star.appName);
      }
    }
  };

  const handleWheel = (event: WheelEvent<HTMLCanvasElement>) => {
    if (tourMode) {
      setTourMode(false);
    }
    lastWheelAtRef.current = performance.now();
    event.preventDefault();
    const bounds = canvasRef.current?.getBoundingClientRect();
    const anchor = bounds
      ? { x: event.clientX - bounds.left, y: event.clientY - bounds.top }
      : { x: canvasSize.width / 2, y: canvasSize.height / 2 };

    const delta = normalizeWheel(event);
    const intensity = event.ctrlKey ? 0.0019 : 0.00135;
    const scale = Math.exp(-delta * intensity);
    zoomAt(targetCameraRef.current.zoom * scale, anchor);
  };

  return (
    <div className="scene-shell">
      <div className="scene-toolbar">
        <div className="scene-toolbar-group">
          <button type="button" className="secondary-action" onClick={() => zoomAt(targetCameraRef.current.zoom * 1.14)}>
            Zoom in
          </button>
          <button type="button" className="secondary-action" onClick={() => zoomAt(targetCameraRef.current.zoom / 1.14)}>
            Zoom out
          </button>
          <button type="button" className="secondary-action" onClick={resetView}>
            Reset view
          </button>
          <button
            type="button"
            className={tourMode ? "primary-action" : "secondary-action"}
            onClick={() => setTourMode((active) => !active)}
            disabled={tourWaypoints.length < 2 || reducedMotion}
            title={
              reducedMotion
                ? "Tour mode uses motion; disabled when reduced motion is on."
                : tourWaypoints.length < 2
                  ? "Need at least two deployments in view for a tour path."
                  : tourMode
                    ? "Stop the guided fly-through."
                    : "Fly through deployments cartoon style."
            }
          >
            {tourMode ? "Exit tour" : "Tour mode"}
          </button>
        </div>
        <span className="scene-zoom-label">Zoom {cameraLabel}x</span>
      </div>

      <div ref={wrapRef} className="scene-wrap">
        <canvas
          ref={canvasRef}
          className="scene-canvas"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onPointerLeave={handlePointerLeave}
          onClick={handleClick}
          onWheel={handleWheel}
        />
      </div>
    </div>
  );
}
