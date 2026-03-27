export const fluxApiBaseUrl =
  process.env.FLUX_API_BASE_URL?.replace(/\/+$/, "") ?? "https://api.runonflux.io";

export const fluxEndpoints = {
  listAllApps: "/apps/listallapps",
  listRunningApps: "/apps/listrunningapps",
  globalAppSpecifications: "/apps/globalappsspecifications",
  appSpecifications: (appName: string) =>
    `/apps/appspecifications?appname=${encodeURIComponent(appName)}`,
  appLocation: (appName: string) => `/apps/location?appname=${encodeURIComponent(appName)}`,
  locations: "/apps/locations",
  deploymentInformation: "/apps/deploymentinformation",
  installingLocation: (appName: string) =>
    `/apps/installinglocation/${encodeURIComponent(appName)}`,
  installingLocations: "/apps/installinglocations",
  uptime: "/flux/uptime",
  geolocation: "/flux/geolocation",
  benchmarks: "/benchmark/getbenchmarks",
  benchmarkStatus: "/benchmark/getstatus",
};
