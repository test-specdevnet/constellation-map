import type {
  AppLocation,
  AppSpec,
  HealthBand,
  ProjectCategory,
  ResourceTier,
  RuntimeFamily,
} from "./app";
import type { NodeProfile } from "./node";

export type StarType = "instance" | "app" | "cluster-anchor";

export type ClusterKind = "region" | "runtime";
export type ClusterLevel = ClusterKind;

export type JitterVector = {
  x: number;
  y: number;
};

export type SceneBounds = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
};

export type ArchetypeSummary = {
  id: string;
  runtimeFamily: RuntimeFamily;
  projectCategory: ProjectCategory;
  systemCount: number;
};

export type RarityFlags = {
  hasRareArchetype: boolean;
  rareArchetypeCount: number;
  rareArchetypeIds: string[];
};

export type EntityArchetypeFlags = {
  isRareArchetype: boolean;
  rareArchetypeId: string | null;
};

export type Star = {
  id: string;
  type: StarType;
  x: number;
  y: number;
  size: number;
  brightness: number;
  colorBucket: RuntimeFamily | ProjectCategory | ResourceTier | "featured";
  appName: string;
  appId: string;
  locationId?: string;
  nodeProfileId?: string;
  clusterId: string;
  regionClusterId: string;
  runtimeClusterId: string;
  systemId: string;
  label: string;
  isRecommended: boolean;
  status: string;
  healthBand: HealthBand;
  runtimeFamily: RuntimeFamily;
  projectCategory: ProjectCategory;
  resourceTier: ResourceTier;
  region?: string;
  jitterSeed: string;
  jitterOffset: JitterVector;
  archetypeId: string;
  rarityFlags: EntityArchetypeFlags;
  metadata: Record<string, string | number | boolean | null | undefined>;
};

export type Cluster = {
  clusterId: string;
  level: ClusterLevel;
  parentId: string | null;
  label: string;
  kind: ClusterKind;
  centroid: { x: number; y: number };
  radius: number;
  systemIds: string[];
  starIds: string[];
  counts: {
    apps: number;
    systems: number;
    instances: number;
    runtimes: number;
  };
  rarityFlags: RarityFlags;
  runtimeFamily: RuntimeFamily | "mixed";
  regionLabel: string;
};

export type AppSystem = {
  systemId: string;
  appName: string;
  label: string;
  clusterId: string;
  regionClusterId: string;
  runtimeClusterId: string;
  regionLabel: string;
  x: number;
  y: number;
  instanceCount: number;
  runtimeFamily: RuntimeFamily;
  projectCategory: ProjectCategory;
  resourceTier: ResourceTier;
  status: string;
  jitterSeed: string;
  jitterOffset: JitterVector;
  archetypeId: string;
  rarityFlags: EntityArchetypeFlags;
};

export type ConstellationSnapshot = {
  generatedAt: string;
  deploymentConstraints: {
    minimumInstances: number | null;
    maximumInstances: number | null;
  };
  apps: AppSpec[];
  locations: AppLocation[];
  nodes: NodeProfile[];
  clusters: Cluster[];
  systems: AppSystem[];
  stars: Star[];
  featureSystems: AppSystem[];
  bounds: SceneBounds;
  rareArchetypes: ArchetypeSummary[];
  counts: {
    apps: number;
    locations: number;
    stars: number;
  };
};

export type FilterMetadata = {
  runtimeFamilies: Array<{ value: RuntimeFamily; count: number }>;
  projectCategories: Array<{ value: ProjectCategory; count: number }>;
  resourceTiers: Array<{ value: ResourceTier; count: number }>;
  statuses: Array<{ value: string; count: number }>;
  countries: Array<{ value: string; count: number }>;
};

export type AppDetail = {
  app: AppSpec;
  locations: AppLocation[];
  nodes: NodeProfile[];
  relatedSystems: AppSystem[];
  relatedStars: Star[];
  rationale: {
    constellationReason: string;
    sizingReason: string;
    neighborhoodReason: string;
  };
  summary: {
    instanceCount: number;
    liveStatus: string;
    owner: string;
    freshness: string;
    regions: string[];
    runtimeUsage: {
      estimatedCpuCores: number | null;
      estimatedMemoryMb: number | null;
      estimatedStorageGb: number | null;
      activeNodes: number;
      avgNodeDownloadMbps: number | null;
    };
  };
};
