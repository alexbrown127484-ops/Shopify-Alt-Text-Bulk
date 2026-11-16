import { PrismaClient } from "@prisma/client";
import { configureDatabaseEnvironment } from "./database-env.server";

configureDatabaseEnvironment(process.env);

const prisma =
  globalThis.prismaGlobal ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalThis.prismaGlobal = prisma;
}

export default prisma;
