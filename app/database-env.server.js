function firstConfigured(environment, names) {
  for (const name of names) {
    const value = environment[name]?.trim();
    if (value) return value;
  }
  return undefined;
}

export function resolveDatabaseEnvironment(environment) {
  const databaseUrl = firstConfigured(environment, [
    "DATABASE_URL",
    "STORAGE_PRISMA_DATABASE_URL",
    "STORAGE_DATABASE_URL_POOLED",
    "POSTGRES_PRISMA_URL",
    "POSTGRES_URL",
    "STORAGE_DATABASE_URL",
    "STORAGE_POSTGRES_URL",
  ]);
  const directUrl = firstConfigured(environment, [
    "DIRECT_URL",
    "DATABASE_URL_UNPOOLED",
    "POSTGRES_URL_NON_POOLING",
    "STORAGE_DATABASE_URL",
    "STORAGE_POSTGRES_URL",
  ]);

  return { databaseUrl, directUrl };
}

export function configureDatabaseEnvironment(environment) {
  const { databaseUrl, directUrl } = resolveDatabaseEnvironment(environment);
  if (databaseUrl) environment.DATABASE_URL = databaseUrl;
  if (directUrl) environment.DIRECT_URL = directUrl;
  return { databaseUrl, directUrl };
}
