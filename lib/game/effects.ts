import type { EffectKind, VisualEffect } from "./types";

export const createEffect = ({
  kind,
  x,
  y,
  ttlMs,
  size,
  color,
  vx = 0,
  vy = 0,
}: {
  kind: EffectKind;
  x: number;
  y: number;
  ttlMs: number;
  size: number;
  color: string;
  vx?: number;
  vy?: number;
}): VisualEffect => ({
  id: `${kind}:${Date.now()}:${Math.random().toString(36).slice(2, 7)}`,
  kind,
  x,
  y,
  vx,
  vy,
  ttlMs,
  ageMs: 0,
  size,
  color,
});

export const updateEffects = ({
  effects,
  dtMs,
}: {
  effects: VisualEffect[];
  dtMs: number;
}) =>
  effects
    .map((effect) => ({
      ...effect,
      ageMs: effect.ageMs + dtMs,
      x: effect.x + effect.vx * (dtMs / 1000),
      y: effect.y + effect.vy * (dtMs / 1000),
    }))
    .filter((effect) => effect.ageMs < effect.ttlMs);
