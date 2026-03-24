"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent,
  type WheelEvent,
} from "react";
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
  onSelectApp: (appName: string) => void;
  onHoverStar: (star: Star | null) => void;
};

type CameraState = {
  x: number;
  y: number;
  zoom: number;
};

const defaultCamera: CameraState = {
  x: 0,
  y: 0,
  zoom: 0.24,
};

const colorMap: Record<string, string> = {
  api: "#64c8ff",
  website: "#f5f0ff",
  database: "#ffc777",
  infra: "#7bd8a6",
  tool: "#b0c7ff",
  media: "#f39fd1",
  ai: "#76f0ff",
  misc: "#94a8c6",
  node: "#8db4ff",
  python: "#a4d8ff",
  java: "#ffcc8d",
  dotnet: "#9fa5ff",
  php: "#dbb0ff",
  go: "#80f0cc",
  rust: "#f8b97c",
  bun: "#d7ffc2",
  unknown: "#8fa1bd",
  nano: "#7b90aa",
  small: "#90a8d0",
  medium: "#64c8ff",
  large: "#80f0cc",
  xlarge: "#ffc777",
  featured: "#ffffff",
};

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

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
  const didDragRef = useRef(false);
  const lastPointerRef = useRef<{ x: number; y: number } | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const targetCameraRef = useRef<CameraState>({ ...defaultCamera });
  const currentCameraRef = useRef<CameraState>({ ...defaultCamera });
  const hoveredStarIdRef = useRef<string | null>(null);
  const [cameraLabel, setCameraLabel] = useState(defaultCamera.zoom.toFixed(2));
  const [canvasSize, setCanvasSize] = useState({ width: 1200, height: 760 });
  const [hoveredStarId, setHoveredStarId] = useState<string | null>(null);
  const backgroundStars = useMemo(
    () =>
      Array.from({ length: 240 }, (_, index) => ({
        x: ((index * 137) % 1000) / 1000,
        y: ((index * 211) % 1000) / 1000,
        size: index % 7 === 0 ? 1.35 : 0.7,
        alpha: 0.15 + ((index * 17) % 60) / 300,
      })),
    [],
  );

  const starsById = useMemo(() => new Map(stars.map((star) => [star.id, star])), [stars]);
  const matchSet = useMemo(() => new Set(searchMatches), [searchMatches]);

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

    targetCameraRef.current = {
      x: focusTarget.x,
      y: focusTarget.y,
      zoom: focusTarget.zoom,
    };
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
    canvas.width = canvasSize.width * devicePixelRatio;
    canvas.height = canvasSize.height * devicePixelRatio;
    canvas.style.width = `${canvasSize.width}px`;
    canvas.style.height = `${canvasSize.height}px`;
    context.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);

    const worldToScreen = (x: number, y: number, camera: CameraState) => ({
      x: (x - camera.x) * camera.zoom + canvasSize.width / 2,
      y: (y - camera.y) * camera.zoom + canvasSize.height / 2,
    });

    const findHoveredStar = () => {
      const pointer = pointerRef.current;
      if (!pointer) {
        return null;
      }

      const camera = currentCameraRef.current;
      let closest: { star: Star; distance: number } | null = null;

      for (const star of stars) {
        const point = worldToScreen(star.x, star.y, camera);
        const dx = point.x - pointer.x;
        const dy = point.y - pointer.y;
        const radius = Math.max(8, star.size * camera.zoom + 5);
        const distanceSquared = dx * dx + dy * dy;
        const radiusSquared = radius * radius;

        if (distanceSquared <= radiusSquared && (!closest || distanceSquared < closest.distance)) {
          closest = { star, distance: distanceSquared };
        }
      }

      return closest?.star ?? null;
    };

    const draw = (timestamp: number) => {
      const camera = currentCameraRef.current;
      const target = targetCameraRef.current;

      camera.x += (target.x - camera.x) * 0.12;
      camera.y += (target.y - camera.y) * 0.12;
      camera.zoom += (target.zoom - camera.zoom) * 0.12;

      context.clearRect(0, 0, canvasSize.width, canvasSize.height);

      const background = context.createLinearGradient(0, 0, 0, canvasSize.height);
      background.addColorStop(0, "#040917");
      background.addColorStop(1, "#071325");
      context.fillStyle = background;
      context.fillRect(0, 0, canvasSize.width, canvasSize.height);

      for (const star of backgroundStars) {
        const x = ((star.x * canvasSize.width - camera.x * 0.012) % canvasSize.width + canvasSize.width) % canvasSize.width;
        const y = ((star.y * canvasSize.height - camera.y * 0.012) % canvasSize.height + canvasSize.height) % canvasSize.height;
        context.beginPath();
        context.fillStyle = `rgba(255,255,255,${star.alpha})`;
        context.arc(x, y, star.size, 0, Math.PI * 2);
        context.fill();
      }

      if (camera.zoom < 0.75) {
        for (const cluster of clusters) {
          const point = worldToScreen(cluster.centroid.x, cluster.centroid.y, camera);
          context.beginPath();
          context.strokeStyle = "rgba(100, 200, 255, 0.12)";
          context.lineWidth = 1;
          context.arc(point.x, point.y, 48 + cluster.summaryMetrics.instances * 0.08, 0, Math.PI * 2);
          context.stroke();

          context.fillStyle = "rgba(207, 225, 255, 0.88)";
          context.font = "600 14px Segoe UI";
          context.fillText(cluster.label, point.x + 12, point.y - 12);
          context.fillStyle = "rgba(149, 171, 200, 0.92)";
          context.font = "12px Segoe UI";
          context.fillText(
            `${cluster.summaryMetrics.apps} apps`,
            point.x + 12,
            point.y + 8,
          );
        }
      }

      if (camera.zoom > 0.95) {
        context.strokeStyle = "rgba(103, 184, 255, 0.12)";
        context.lineWidth = 1;

        for (const system of systems) {
          const point = worldToScreen(system.x, system.y, camera);
          context.beginPath();
          context.arc(point.x, point.y, 8, 0, Math.PI * 2);
          context.stroke();
        }
      }

      const hovered = findHoveredStar();
      if (hovered?.id !== hoveredStarIdRef.current) {
        hoveredStarIdRef.current = hovered?.id ?? null;
        setHoveredStarId(hovered?.id ?? null);
        onHoverStar(hovered ?? null);
      }

      for (const star of stars) {
        const point = worldToScreen(star.x, star.y, camera);
        if (
          point.x < -40 ||
          point.y < -40 ||
          point.x > canvasSize.width + 40 ||
          point.y > canvasSize.height + 40
        ) {
          continue;
        }

        const selected = selectedAppName === star.appName;
        const hoveredMatch = hovered?.id === star.id;
        const searchMatch = matchSet.has(star.appName);
        const color = colorMap[star.colorBucket] ?? "#cfe1ff";
        const radius = Math.max(1.8, Math.min(17, star.size * camera.zoom * 0.55));

        if (selected || hoveredMatch || searchMatch) {
          context.beginPath();
          context.fillStyle = selected
            ? "rgba(100, 200, 255, 0.18)"
            : "rgba(255,255,255,0.12)";
          context.arc(point.x, point.y, radius + 9, 0, Math.PI * 2);
          context.fill();
        }

        const glowRadius = radius + (selected ? 9 : hoveredMatch ? 7 : 5);
        const glowGradient = context.createRadialGradient(
          point.x,
          point.y,
          Math.max(0.5, radius * 0.2),
          point.x,
          point.y,
          glowRadius,
        );
        glowGradient.addColorStop(0, "rgba(255,255,255,0.34)");
        glowGradient.addColorStop(0.45, `${color}88`);
        glowGradient.addColorStop(1, "rgba(0,0,0,0)");
        context.fillStyle = glowGradient;
        context.beginPath();
        context.arc(point.x, point.y, glowRadius, 0, Math.PI * 2);
        context.fill();

        context.beginPath();
        context.fillStyle = color;
        context.shadowBlur = selected || hoveredMatch ? 22 : 10;
        context.shadowColor = color;
        context.globalAlpha = clamp(star.brightness, 0.48, 1);
        context.arc(point.x, point.y, radius, 0, Math.PI * 2);
        context.fill();
        context.globalAlpha = 1;
        context.shadowBlur = 0;

        const coreGradient = context.createRadialGradient(
          point.x - radius * 0.33,
          point.y - radius * 0.33,
          0,
          point.x,
          point.y,
          radius,
        );
        coreGradient.addColorStop(0, "rgba(255,255,255,0.98)");
        coreGradient.addColorStop(0.4, "rgba(240,249,255,0.86)");
        coreGradient.addColorStop(1, "rgba(255,255,255,0)");
        context.fillStyle = coreGradient;
        context.beginPath();
        context.arc(point.x, point.y, radius, 0, Math.PI * 2);
        context.fill();

        if ((selected || hoveredMatch || searchMatch) && camera.zoom > 0.72) {
          context.fillStyle = "rgba(237, 244, 255, 0.92)";
          context.font = selected ? "600 13px Segoe UI" : "12px Segoe UI";
          context.fillText(star.appName, point.x + 10, point.y - 10);
        }
      }

      const nextLabel = camera.zoom.toFixed(2);
      setCameraLabel((currentLabel) => (currentLabel === nextLabel ? currentLabel : nextLabel));
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
    selectedAppName,
    stars,
    starsById,
    systems,
    backgroundStars,
  ]);

  const zoomBy = (delta: number) => {
    const target = targetCameraRef.current;
    target.zoom = clamp(target.zoom + delta, 0.12, 2.6);
  };

  const resetView = () => {
    targetCameraRef.current = { ...defaultCamera };
  };

  const handlePointerDown = (event: PointerEvent<HTMLCanvasElement>) => {
    draggingRef.current = true;
    didDragRef.current = false;
    lastPointerRef.current = { x: event.clientX, y: event.clientY };
    event.currentTarget.setPointerCapture(event.pointerId);
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
    if (Math.abs(movementX) > 1 || Math.abs(movementY) > 1) {
      didDragRef.current = true;
    }
    lastPointerRef.current = { x: event.clientX, y: event.clientY };

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
    if (didDragRef.current) {
      return;
    }
    if (hoveredStarId) {
      const star = starsById.get(hoveredStarId);
      if (star) {
        onSelectApp(star.appName);
      }
    }
  };

  const handleWheel = (event: WheelEvent<HTMLCanvasElement>) => {
    event.preventDefault();
    const bounds = canvasRef.current?.getBoundingClientRect();
    if (!bounds) {
      return;
    }

    const pointerX = event.clientX - bounds.left;
    const pointerY = event.clientY - bounds.top;
    const target = targetCameraRef.current;
    const zoomFactor = Math.exp(-Math.max(-180, Math.min(180, event.deltaY)) * 0.0016);
    const nextZoom = clamp(target.zoom * zoomFactor, 0.12, 2.6);
    if (Math.abs(nextZoom - target.zoom) < 0.00001) {
      return;
    }

    const worldXBefore = (pointerX - canvasSize.width / 2) / target.zoom + target.x;
    const worldYBefore = (pointerY - canvasSize.height / 2) / target.zoom + target.y;
    target.zoom = nextZoom;
    target.x = worldXBefore - (pointerX - canvasSize.width / 2) / nextZoom;
    target.y = worldYBefore - (pointerY - canvasSize.height / 2) / nextZoom;
  };

  return (
    <div className="scene-shell">
      <div className="scene-toolbar">
        <div className="scene-toolbar-group">
          <button type="button" className="secondary-action" onClick={() => zoomBy(0.16)}>
            Zoom in
          </button>
          <button type="button" className="secondary-action" onClick={() => zoomBy(-0.16)}>
            Zoom out
          </button>
          <button type="button" className="secondary-action" onClick={resetView}>
            Reset view
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
