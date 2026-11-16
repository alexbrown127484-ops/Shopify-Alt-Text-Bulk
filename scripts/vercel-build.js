import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolveDatabaseEnvironment } from "./database-env.js";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const prismaCli = fileURLToPath(
  new URL("../node_modules/prisma/build/index.js", import.meta.url),
);

const { databaseUrl, directUrl } = resolveDatabaseEnvironment(process.env);
if (databaseUrl) process.env.DATABASE_URL = databaseUrl;
if (directUrl) process.env.DIRECT_URL = directUrl;

const missing = [];
if (!process.env.DATABASE_URL) missing.push("DATABASE_URL (pooled)");
if (!process.env.DIRECT_URL) missing.push("DIRECT_URL (unpooled)");

if (missing.length > 0) {
  console.error(
    [
      "Vercel build is missing required PostgreSQL connection strings:",
      ...missing.map((name) => `  - ${name}`),
      "",
      "In Vercel, open Project → Settings → Environment Variables and add",
      "the pooled and direct Postgres URLs for the Production environment.",
      "Vercel Postgres/Neon integration variables are also detected automatically.",
      "Then redeploy. Do not use .env.example or placeholder URLs as credentials.",
    ].join("\n"),
  );
  process.exit(1);
}

function runPrisma(...args) {
  execFileSync(
    process.execPath,
    [prismaCli, ...args],
    {
      cwd: projectRoot,
      env: process.env,
      stdio: "inherit",
    },
  );
}

function runNpm(...args) {
  const npmCli = process.env.npm_execpath;
  if (!npmCli) {
    throw new Error("npm did not provide its CLI path to the Vercel build.");
  }

  execFileSync(process.execPath, [npmCli, ...args], {
    cwd: projectRoot,
    env: process.env,
    stdio: "inherit",
  });
}

runPrisma("generate");
runPrisma("migrate", "deploy");
runNpm("exec", "--", "react-router", "build");
