export type RuntimeFamily =
  | "node"
  | "python"
  | "java"
  | "dotnet"
  | "php"
  | "go"
  | "rust"
  | "bun"
  | "unknown";

export type ProjectCategory =
  | "ai"
  | "infra"
  | "api"
  | "website"
  | "storage"
  | "node-service"
  | "database"
  | "tool"
  | "media"
  | "misc";

export type ResourceTier = "nano" | "small" | "medium" | "large" | "xlarge";
export type HealthBand = "healthy" | "degraded" | "unknown";

export type AppSpec = {
  appName: string;
  description: string;
  owner: string;
  instances: number;
  version: number | null;
  hash: string;
  staticIp: boolean;
  expire: number | null;
  contacts: string[];
  geolocationRules: string[];
  compose: string[];
  runtimeFamily: RuntimeFamily;
  projectCategory: ProjectCategory;
  resourceTier: ResourceTier;
  fitTags: string[];
};

export type AppLocation = {
  id: string;
  appName: string;
  ip: string;
  hash: string;
  broadcastedAt: number | null;
  expireAt: number | null;
  status: string;
  locationKey: string;
  freshness: "fresh" | "stale" | "unknown";
  nodeJoinKey: string;
};
