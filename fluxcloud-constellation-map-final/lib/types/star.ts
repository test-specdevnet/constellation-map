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

export type ClusterKind = "runtime" | "resource" | "project-category" | "featured";

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
  systemId: string;
  label: string;
  isRecommended: boolean;
  status: string;
  healthBand: HealthBand;
  runtimeFamily: RuntimeFamily;
  projectCategory: ProjectCategory;
  resourceTier: ResourceTier;
  region?: string;
  metadata: Record<string, string | number | boolean | null | undefined>;
};

export type Cluster = {
  clusterId: string;
  label: string;
  kind: ClusterKind;
  centroid: { x: number; y: number };
  starIds: string[];
  summaryMetrics: {
    apps: number;
    instances: number;
    runtimeFamily: RuntimeFamily | "mixed";
    resourceTier: ResourceTier | "mixed";
  };
};

export type AppSystem = {
  systemId: string;
  appName: string;
  label: string;
  clusterId: string;
  x: number;
  y: number;
  instanceCount: number;
  runtimeFamily: RuntimeFamily;
  projectCategory: ProjectCategory;
  resourceTier: ResourceTier;
  status: string;
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
  };
};
