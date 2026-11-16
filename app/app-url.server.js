export function getAppUrl(environment = process.env) {
  const configuredUrl = environment.SHOPIFY_APP_URL?.trim();
  if (
    configuredUrl &&
    !configuredUrl.includes("your-production-domain.vercel.app")
  ) {
    return configuredUrl.replace(/\/$/, "");
  }

  const productionDomain = environment.VERCEL_PROJECT_PRODUCTION_URL;
  if (productionDomain) return `https://${productionDomain}`;

  return configuredUrl || "http://localhost:3000";
}
