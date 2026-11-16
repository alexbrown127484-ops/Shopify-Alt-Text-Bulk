CREATE SCHEMA IF NOT EXISTS "public";

CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "isOnline" BOOLEAN NOT NULL DEFAULT false,
    "scope" TEXT,
    "expires" TIMESTAMP(3),
    "accessToken" TEXT NOT NULL,
    "userId" BIGINT,
    "firstName" TEXT,
    "lastName" TEXT,
    "email" TEXT,
    "accountOwner" BOOLEAN NOT NULL DEFAULT false,
    "locale" TEXT,
    "collaborator" BOOLEAN DEFAULT false,
    "emailVerified" BOOLEAN DEFAULT false,
    "refreshToken" TEXT,
    "refreshTokenExpires" TIMESTAMP(3),
    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BulkUpdateJob" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "productCursor" TEXT,
    "collectionCursor" TEXT,
    "productsDone" BOOLEAN NOT NULL DEFAULT false,
    "collectionsDone" BOOLEAN NOT NULL DEFAULT false,
    "productsUpdated" INTEGER NOT NULL DEFAULT 0,
    "collectionsUpdated" INTEGER NOT NULL DEFAULT 0,
    "productsScanned" INTEGER NOT NULL DEFAULT 0,
    "collectionsScanned" INTEGER NOT NULL DEFAULT 0,
    "totalProducts" INTEGER NOT NULL DEFAULT 0,
    "totalCollections" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastHeartbeatAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leaseExpiresAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    CONSTRAINT "BulkUpdateJob_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "BulkUpdateJob_shop_status_idx" ON "BulkUpdateJob"("shop", "status");
CREATE INDEX "BulkUpdateJob_shop_startedAt_idx" ON "BulkUpdateJob"("shop", "startedAt");
