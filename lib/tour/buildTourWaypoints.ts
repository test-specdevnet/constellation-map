import type { AppSystem, Star } from "../types/star";

export type TourWaypoint = { x: number; y: number };

/**
 * Deterministic loop: sort systems by angle around their centroid so the tour
 * sweeps the field without crossing arbitrarily.
 */
export function buildTourWaypoints(systems: AppSystem[], stars: Star[]): TourWaypoint[] {
  if (systems.length >= 2) {
    const cx = systems.reduce((s, m) => s + m.x, 0) / systems.length;
    const cy = systems.reduce((s, m) => s + m.y, 0) / systems.length;
    const sorted = [...systems].sort((a, b) => {
      const angA = Math.atan2(a.y - cy, a.x - cx);
      const angB = Math.atan2(b.y - cy, b.x - cx);
      return angA - angB;
    });
    return sorted.map((s) => ({ x: s.x, y: s.y }));
  }

  const byApp = new Map<string, { x: number; y: number }>();
  for (const star of stars) {
    if (!byApp.has(star.appName)) {
      byApp.set(star.appName, { x: star.x, y: star.y });
    }
  }
  const pts = [...byApp.values()];
  if (pts.length >= 2) {
    const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
    const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length;
    pts.sort((a, b) => Math.atan2(a.y - cy, a.x - cx) - Math.atan2(b.y - cy, b.x - cx));
    return pts;
  }

  if (pts.length === 1) {
    const p = pts[0];
    return [
      { x: p.x - 120, y: p.y - 80 },
      { x: p.x + 120, y: p.y + 60 },
      { x: p.x, y: p.y },
    ];
  }

  return [];
}
