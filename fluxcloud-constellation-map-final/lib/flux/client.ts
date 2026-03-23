import { fluxApiBaseUrl } from "./endpoints";

const defaultTimeoutMs = 12000;

const fetchWithTimeout = async (url: string, init?: RequestInit) => {
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error(`Flux API timeout for ${url}`)), defaultTimeoutMs);
  });

  return Promise.race([
    fetch(url, {
      ...init,
      headers: {
        Accept: "application/json",
        ...(init?.headers ?? {}),
      },
      cache: "no-store",
    }),
    timeoutPromise,
  ]);
};

export const fetchFluxJson = async <T>(path: string): Promise<T> => {
  const response = await fetchWithTimeout(`${fluxApiBaseUrl}${path}`);

  if (!response.ok) {
    throw new Error(`Flux API request failed for ${path}: ${response.status}`);
  }

  return (await response.json()) as T;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export const extractPayload = <T>(input: unknown): T => {
  if (Array.isArray(input) || isRecord(input)) {
    return input as T;
  }

  if (isRecord(input)) {
    return input as T;
  }

  return input as T;
};

export const extractArray = (input: unknown): unknown[] => {
  if (Array.isArray(input)) {
    return input;
  }

  if (!isRecord(input)) {
    return [];
  }

  const preferredKeys = [
    "data",
    "result",
    "results",
    "apps",
    "locations",
    "specifications",
    "benchmarks",
    "statuses",
  ];

  for (const key of preferredKeys) {
    const candidate = input[key];
    if (Array.isArray(candidate)) {
      return candidate;
    }
  }

  for (const value of Object.values(input)) {
    if (Array.isArray(value)) {
      return value;
    }
  }

  return [];
};

export const extractObject = (input: unknown): Record<string, unknown> => {
  if (isRecord(input)) {
    const candidateKeys = ["data", "result"];
    for (const key of candidateKeys) {
      const nested = input[key];
      if (isRecord(nested)) {
        return nested;
      }
    }

    return input;
  }

  return {};
};
