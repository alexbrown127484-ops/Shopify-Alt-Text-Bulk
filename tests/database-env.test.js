import assert from "node:assert/strict";
import test from "node:test";
import { resolveDatabaseEnvironment } from "../scripts/database-env.js";

test("resolves the Storage integration's pooled and direct database URLs", () => {
  const result = resolveDatabaseEnvironment({
    STORAGE_PRISMA_DATABASE_URL: "postgresql://pooled.example/app",
    STORAGE_DATABASE_URL_POOLED: "postgresql://pooled-alt.example/app",
    STORAGE_DATABASE_URL: "postgresql://direct.example/app",
    STORAGE_POSTGRES_URL: "postgresql://direct-alt.example/app",
  });

  assert.deepEqual(result, {
    databaseUrl: "postgresql://pooled.example/app",
    directUrl: "postgresql://direct.example/app",
  });
});

test("prefers explicit Prisma URLs over integration aliases", () => {
  const result = resolveDatabaseEnvironment({
    DATABASE_URL: "postgresql://explicit-pool.example/app",
    DIRECT_URL: "postgresql://explicit-direct.example/app",
    STORAGE_PRISMA_DATABASE_URL: "postgresql://pool.example/app",
    STORAGE_DATABASE_URL: "postgresql://direct.example/app",
  });

  assert.deepEqual(result, {
    databaseUrl: "postgresql://explicit-pool.example/app",
    directUrl: "postgresql://explicit-direct.example/app",
  });
});

test("recognizes Neon and Vercel Postgres environment variable names", () => {
  const result = resolveDatabaseEnvironment({
    POSTGRES_PRISMA_URL: "postgresql://pooled.example/app",
    POSTGRES_URL_NON_POOLING: "postgresql://direct.example/app",
  });

  assert.deepEqual(result, {
    databaseUrl: "postgresql://pooled.example/app",
    directUrl: "postgresql://direct.example/app",
  });
});
