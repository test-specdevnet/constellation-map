import type { ProjectCategory } from "../types/app";
import type { Star } from "../types/star";

/** One canonical buoy silhouette; only these colors change by category. */
export type BuoyColorway = {
  /** Main hex panels */
  main: string;
  /** Highlight (top edge feel) */
  light: string;
  /** Navy trim / stroke accent */
  trim: string;
  /** Beacon ring stroke */
  beacon: string;
  /** Inner core fill */
  core: string;
};

const SLATE: BuoyColorway = {
  main: "#6B7F9E",
  light: "#8FA4BE",
  trim: "#1B2744",
  beacon: "#A8B8D8",
  core: "#F2F6FF",
};

const PALETTES: Record<ProjectCategory, BuoyColorway> = {
  ai: {
    main: "#2B6FD1",
    light: "#5B94E8",
    trim: "#0F2744",
    beacon: "#7EB6FF",
    core: "#E8F2FF",
  },
  database: {
    main: "#D9A23A",
    light: "#F0C45C",
    trim: "#4A3510",
    beacon: "#FFE08A",
    core: "#FFF8E6",
  },
  api: {
    main: "#E0702E",
    light: "#F09050",
    trim: "#3D1808",
    beacon: "#FFB088",
    core: "#FFF0E8",
  },
  website: {
    main: "#E0702E",
    light: "#F09050",
    trim: "#3D1808",
    beacon: "#FFB088",
    core: "#FFF0E8",
  },
  "node-service": {
    main: "#E86B35",
    light: "#F58A58",
    trim: "#3D1A0C",
    beacon: "#FFC4A0",
    core: "#FFF2EC",
  },
  storage: {
    main: "#2A9E8E",
    light: "#4BC4B0",
    trim: "#0A3D36",
    beacon: "#7EE8D8",
    core: "#E8FFFA",
  },
  infra: {
    main: "#6B4FB8",
    light: "#8B72D4",
    trim: "#1E1438",
    beacon: "#B8A0F0",
    core: "#F4F0FF",
  },
  tool: {
    main: "#3D9E5C",
    light: "#5BC078",
    trim: "#0F2E1C",
    beacon: "#8EEDAA",
    core: "#EEFCF2",
  },
  media: {
    main: "#C45BA8",
    light: "#E080C4",
    trim: "#3A1530",
    beacon: "#F0B0E0",
    core: "#FFF0FA",
  },
  misc: SLATE,
};

export function getBuoyColorway(star: Star): BuoyColorway {
  return PALETTES[star.projectCategory] ?? SLATE;
}

export function categoryLabel(star: Star): string {
  const c = star.projectCategory;
  if (c === "ai") return "AI / ML";
  if (c === "database") return "Database";
  if (c === "api" || c === "website" || c === "node-service") return "App / API";
  if (c === "storage") return "Storage";
  if (c === "infra") return "Infra";
  if (c === "tool") return "Tools / Ops";
  if (c === "media") return "Media";
  return "Other";
}
