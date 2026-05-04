"use client";

import type { PlaneSkinId } from "./cartoonMarkers";

export type SpriteRect = { x: number; y: number; w: number; h: number };

export type SpriteDef = {
  src: string;
  width?: number;
  height?: number;
  anchorX?: number;
  anchorY?: number;
  scale?: number;
  sourceRect?: SpriteRect;
};

export type SpriteImageMap = Map<string, HTMLImageElement>;

type AircraftDirection = "side" | "front" | "top" | "back";
export type AircraftColor = "red" | "yellow" | "blue" | "orange" | "green";

const aircraft = (src: string): SpriteDef => ({
  src,
  width: 86,
  height: 86,
  anchorX: 0.5,
  anchorY: 0.5,
  scale: 1,
});

export const SPRITES = {
  aircraft: {
    red: {
      side: aircraft("/sprites/aircraft/red-biplane-side.png"),
      front: aircraft("/sprites/aircraft/red-biplane-front.png"),
      top: aircraft("/sprites/aircraft/red-biplane-top.png"),
      back: aircraft("/sprites/aircraft/red-biplane-back.png"),
    },
    yellow: {
      side: aircraft("/sprites/aircraft/yellow-biplane-side.png"),
      sideAlt: aircraft("/sprites/aircraft/yellow-biplane-side-alt.png"),
      front: aircraft("/sprites/aircraft/yellow-biplane-front.png"),
      top: aircraft("/sprites/aircraft/yellow-biplane-top.png"),
    },
    blue: {
      side: aircraft("/sprites/aircraft/blue-biplane-side.png"),
      front: aircraft("/sprites/aircraft/blue-biplane-front.png"),
      top: aircraft("/sprites/aircraft/blue-biplane-top.png"),
      back: aircraft("/sprites/aircraft/blue-biplane-back.png"),
    },
    orange: {
      side: aircraft("/sprites/aircraft/orange-biplane-side.png"),
      front: aircraft("/sprites/aircraft/orange-biplane-front.png"),
      top: aircraft("/sprites/aircraft/orange-biplane-top.png"),
      back: aircraft("/sprites/aircraft/orange-biplane-back.png"),
    },
    green: {
      side: aircraft("/sprites/aircraft/green-biplane-side.png"),
      front: aircraft("/sprites/aircraft/green-biplane-front.png"),
    },
  },
  environment: {
    cloudsSheet: {
      src: "/sprites/environment/clouds-sheet.png",
      width: 1448,
      height: 1086,
    },
    deploymentBuoysSheet: {
      src: "/sprites/environment/deployment-buoys-sheet.png",
      width: 1448,
      height: 1086,
    },
  },
  stations: {
    upgradeLabWide: { src: "/sprites/stations/upgrade-lab-wide.png", width: 120, height: 90, anchorX: 0.5, anchorY: 0.62 },
    upgradeLabClose: { src: "/sprites/stations/upgrade-lab-close.png", width: 102, height: 90, anchorX: 0.5, anchorY: 0.62 },
    upgradeLabAngled: { src: "/sprites/stations/upgrade-lab-angled.png", width: 112, height: 92, anchorX: 0.5, anchorY: 0.62 },
    refuelStationWide: { src: "/sprites/stations/refuel-station-wide.png", width: 116, height: 86, anchorX: 0.5, anchorY: 0.62 },
    refuelStationClose: { src: "/sprites/stations/refuel-station-close.png", width: 102, height: 88, anchorX: 0.5, anchorY: 0.62 },
    refuelStationAngled: { src: "/sprites/stations/refuel-station-angled.png", width: 112, height: 90, anchorX: 0.5, anchorY: 0.62 },
  },
} as const;

export const SPRITE_REGIONS = {
  clouds: {
    cumulusLarge: { x: 42, y: 60, w: 430, h: 260 },
    cumulusSmall: { x: 516, y: 78, w: 310, h: 220 },
    windStreaks: { x: 872, y: 88, w: 450, h: 210 },
    mistBank: { x: 124, y: 390, w: 510, h: 246 },
    stormPuff: { x: 720, y: 396, w: 430, h: 280 },
    foregroundCloud: { x: 214, y: 742, w: 520, h: 260 },
  },
  buoys: {
    blueBeacon: { x: 70, y: 70, w: 300, h: 300 },
    greenBeacon: { x: 412, y: 70, w: 300, h: 300 },
    yellowBeacon: { x: 754, y: 70, w: 300, h: 300 },
    redBeacon: { x: 1096, y: 70, w: 300, h: 300 },
    blueRing: { x: 70, y: 438, w: 300, h: 300 },
    greenRing: { x: 412, y: 438, w: 300, h: 300 },
    yellowRing: { x: 754, y: 438, w: 300, h: 300 },
    redRing: { x: 1096, y: 438, w: 300, h: 300 },
  },
} as const;

export const getAircraftColorForSkin = (_skinId: PlaneSkinId): AircraftColor => "red";

const flattenSpriteDefs = (value: unknown, prefix: string[] = []): Array<[string, SpriteDef]> => {
  if (!value || typeof value !== "object") return [];
  if ("src" in value && typeof (value as SpriteDef).src === "string") {
    return [[prefix.join("."), value as SpriteDef]];
  }
  return Object.entries(value).flatMap(([key, child]) => flattenSpriteDefs(child, [...prefix, key]));
};

export const getAllSpriteDefs = () => flattenSpriteDefs(SPRITES);

export async function loadSprites(): Promise<SpriteImageMap> {
  if (typeof Image === "undefined") {
    return new Map();
  }

  const loaded = await Promise.all(
    getAllSpriteDefs().map(
      ([key, def]) =>
        new Promise<[string, HTMLImageElement | null]>((resolve) => {
          const image = new Image();
          image.decoding = "async";
          image.onload = () => resolve([key, image]);
          image.onerror = () => {
            if (process.env.NODE_ENV !== "production") {
              console.warn(`[sprites] Failed to load ${key}: ${def.src}`);
            }
            resolve([key, null]);
          };
          image.src = def.src;
        }),
    ),
  );

  return new Map(
    loaded.filter((entry): entry is [string, HTMLImageElement] => entry[1] !== null),
  );
}

export function getAircraftSprite(
  color: AircraftColor,
  direction: AircraftDirection,
): SpriteDef {
  const colorSprites = SPRITES.aircraft[color];
  const fallbackColor = SPRITES.aircraft.red;
  return (
    (colorSprites as Partial<Record<AircraftDirection, SpriteDef>>)[direction] ??
    (direction === "back" ? colorSprites.side : undefined) ??
    colorSprites.side ??
    colorSprites.front ??
    fallbackColor[direction] ??
    fallbackColor.side
  );
}

export function resolveAircraftDirection(headingRad: number): {
  direction: AircraftDirection;
  flipX: boolean;
  rotation: number;
} {
  const x = Math.cos(headingRad);
  const y = Math.sin(headingRad);

  if (Math.abs(x) > Math.abs(y) * 0.82) {
    return { direction: "side", flipX: x < 0, rotation: 0 };
  }

  if (y > 0) {
    return { direction: "front", flipX: false, rotation: 0 };
  }

  return { direction: "back", flipX: false, rotation: 0 };
}

export function getSpriteImage(images: SpriteImageMap, def: SpriteDef): HTMLImageElement | null {
  return images.get(def.src) ?? images.get(getAllSpriteDefs().find(([, item]) => item.src === def.src)?.[0] ?? "") ?? null;
}

export function drawSprite(
  ctx: CanvasRenderingContext2D,
  image: CanvasImageSource,
  x: number,
  y: number,
  def: SpriteDef,
  options: { scale?: number; rotation?: number; flipX?: boolean; alpha?: number } = {},
) {
  const source = def.sourceRect;
  const destW = (def.width ?? source?.w ?? 64) * (def.scale ?? 1) * (options.scale ?? 1);
  const destH = (def.height ?? source?.h ?? 64) * (def.scale ?? 1) * (options.scale ?? 1);
  const anchorX = def.anchorX ?? 0.5;
  const anchorY = def.anchorY ?? 0.5;

  ctx.save();
  ctx.translate(x, y);
  if (options.rotation) ctx.rotate(options.rotation);
  if (options.flipX) ctx.scale(-1, 1);
  if (typeof options.alpha === "number") ctx.globalAlpha *= options.alpha;
  ctx.imageSmoothingEnabled = true;

  const dx = -destW * anchorX;
  const dy = -destH * anchorY;
  if (source) {
    ctx.drawImage(image, source.x, source.y, source.w, source.h, dx, dy, destW, destH);
  } else {
    ctx.drawImage(image, dx, dy, destW, destH);
  }
  ctx.restore();
}

export function drawSpriteSheetRegion(
  ctx: CanvasRenderingContext2D,
  image: CanvasImageSource,
  sourceRect: SpriteRect,
  destRect: { x: number; y: number; w: number; h: number },
  options: { alpha?: number; rotation?: number } = {},
) {
  ctx.save();
  ctx.translate(destRect.x + destRect.w / 2, destRect.y + destRect.h / 2);
  if (options.rotation) ctx.rotate(options.rotation);
  if (typeof options.alpha === "number") ctx.globalAlpha *= options.alpha;
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(
    image,
    sourceRect.x,
    sourceRect.y,
    sourceRect.w,
    sourceRect.h,
    -destRect.w / 2,
    -destRect.h / 2,
    destRect.w,
    destRect.h,
  );
  ctx.restore();
}
