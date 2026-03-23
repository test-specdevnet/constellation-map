import type {
  AppLocation,
  AppSpec,
  HealthBand,
  ProjectCategory,
  ResourceTier,
  RuntimeFamily,
} from "../types/app";
import type { NodeProfile } from "../types/node";

const stringifyCompose = (compose: string[]): string => compose.join("\n").toLowerCase();

const extractNumbers = (value: string): number[] =>
  [...value.matchAll(/(\d+(?:\.\d+)?)/g)].map((match) => Number(match[1]));

export const inferRuntimeFamily = (
  appName: string,
  description: string,
  compose: string[],
): RuntimeFamily => {
  const haystack = `${appName} ${description} ${stringifyCompose(compose)}`.toLowerCase();

  if (/(next|node|npm|yarn|pnpm|nestjs|react|vite|vue|nuxt)/.test(haystack)) {
    return "node";
  }
  if (/(python|django|fastapi|flask|uvicorn|gunicorn|streamlit)/.test(haystack)) {
    return "python";
  }
  if (/(spring|gradle|maven|quarkus|java)/.test(haystack)) {
    return "java";
  }
  if (/(asp\.net|dotnet|\.csproj|kestrel)/.test(haystack)) {
    return "dotnet";
  }
  if (/(wordpress|laravel|symfony|php|apache)/.test(haystack)) {
    return "php";
  }
  if (/(golang|go build|go mod|\bgo\b)/.test(haystack)) {
    return "go";
  }
  if (/(cargo|rust|actix|rocket)/.test(haystack)) {
    return "rust";
  }
  if (/(bun|bun\.lockb)/.test(haystack)) {
    return "bun";
  }

  return "unknown";
};

export const inferProjectCategory = (
  appName: string,
  description: string,
  compose: string[],
): ProjectCategory => {
  const haystack = `${appName} ${description} ${stringifyCompose(compose)}`.toLowerCase();

  if (/(ai|ml|model|inference|llama|embeddings|vector|rag)/.test(haystack)) {
    return "ai";
  }
  if (/(postgres|mysql|mongo|redis|storage|database|db\b|minio)/.test(haystack)) {
    return "database";
  }
  if (/(api|gateway|rest|grpc|graphql)/.test(haystack)) {
    return "api";
  }
  if (/(monitoring|proxy|cache|queue|analytics|infra|observability)/.test(haystack)) {
    return "infra";
  }
  if (/(validator|explorer|indexer|node-service|full node|node service)/.test(haystack)) {
    return "node-service";
  }
  if (/(media|stream|video|audio|image)/.test(haystack)) {
    return "media";
  }
  if (/(tool|dashboard|admin|backoffice|cli)/.test(haystack)) {
    return "tool";
  }
  if (/(website|frontend|landing|blog|portfolio|cms|web app)/.test(haystack)) {
    return "website";
  }
  if (/(storage|backup|archive)/.test(haystack)) {
    return "storage";
  }

  return "misc";
};

export const inferResourceTier = (compose: string[], instances: number): ResourceTier => {
  const composeText = stringifyCompose(compose);
  const numbers = extractNumbers(composeText);
  const maxRequested = numbers.length ? Math.max(...numbers) : 0;
  const score = maxRequested + instances * 4;

  if (score >= 128) {
    return "xlarge";
  }
  if (score >= 64) {
    return "large";
  }
  if (score >= 28) {
    return "medium";
  }
  if (score >= 12) {
    return "small";
  }

  return "nano";
};

export const inferHealthBand = (status: string): HealthBand => {
  const normalized = status.toLowerCase();

  if (!normalized || normalized === "unknown") {
    return "unknown";
  }

  if (/(running|healthy|active|confirmed)/.test(normalized)) {
    return "healthy";
  }

  if (/(degraded|stopped|installing|error|failed|pending)/.test(normalized)) {
    return "degraded";
  }

  return "unknown";
};

export const inferFitTags = (
  app: Pick<AppSpec, "runtimeFamily" | "projectCategory" | "resourceTier">,
): string[] => {
  const tags: string[] = [app.runtimeFamily, app.projectCategory, app.resourceTier];

  if (app.runtimeFamily === "node" || app.runtimeFamily === "python") {
    tags.push("portable-runtime");
  }

  if (app.resourceTier === "large" || app.resourceTier === "xlarge") {
    tags.push("high-capacity");
  }

  return [...new Set(tags)];
};

export const getColorBucket = (
  app: Pick<AppSpec, "projectCategory" | "runtimeFamily" | "resourceTier">,
) => app.projectCategory || app.runtimeFamily || app.resourceTier;

export const getVisualMass = (
  app: Pick<AppSpec, "instances" | "resourceTier">,
  locationCount: number,
  nodeProfile?: Pick<NodeProfile, "realCores" | "ramGb" | "benchmarkTier">,
) => {
  const tierWeight =
    app.resourceTier === "xlarge"
      ? 22
      : app.resourceTier === "large"
        ? 16
        : app.resourceTier === "medium"
          ? 11
          : app.resourceTier === "small"
            ? 8
            : 5;
  const hardwareWeight = (nodeProfile?.realCores ?? 0) * 0.8 + (nodeProfile?.ramGb ?? 0) * 0.35;
  const benchmarkWeight =
    nodeProfile?.benchmarkTier === "high-performance"
      ? 10
      : nodeProfile?.benchmarkTier === "verified"
        ? 6
        : nodeProfile?.benchmarkTier === "basic"
          ? 3
          : 0;

  return tierWeight + app.instances * 2 + locationCount * 1.5 + hardwareWeight + benchmarkWeight;
};

export const getFreshness = (location: Pick<AppLocation, "broadcastedAt" | "expireAt">) => {
  const now = Date.now();
  if (location.broadcastedAt && now - location.broadcastedAt < 1000 * 60 * 20) {
    return "fresh";
  }
  if (location.expireAt && location.expireAt < now) {
    return "stale";
  }
  return "unknown";
};

export const getBenchmarkTier = (
  status: string,
  ddwrite: number | null,
  downloadSpeed: number | null,
): NodeProfile["benchmarkTier"] => {
  if (status.toLowerCase().includes("error")) {
    return "unknown";
  }

  if ((ddwrite ?? 0) >= 600 && (downloadSpeed ?? 0) >= 800) {
    return "high-performance";
  }

  if ((ddwrite ?? 0) >= 250 || (downloadSpeed ?? 0) >= 300) {
    return "verified";
  }

  if (ddwrite !== null || downloadSpeed !== null) {
    return "basic";
  }

  return "unknown";
};
