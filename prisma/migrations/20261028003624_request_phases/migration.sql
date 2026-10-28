-- CreateTable
CREATE TABLE "RequestEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "requestId" TEXT NOT NULL,
    "phase" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RequestEvent_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "BookRequest" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_BookRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "bookId" TEXT NOT NULL,
    "instanceId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "externalId" TEXT,
    "externalSlug" TEXT,
    "errorMessage" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "lastChecked" DATETIME,
    "phase" TEXT NOT NULL DEFAULT 'add',
    "progress" REAL,
    "queueId" INTEGER,
    "downloadId" TEXT,
    "outputPath" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastSearchAt" DATETIME,
    "lastErrorAt" DATETIME,
    CONSTRAINT "BookRequest_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "Book" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_BookRequest" ("bookId", "createdAt", "errorMessage", "externalId", "externalSlug", "id", "instanceId", "lastChecked", "status", "updatedAt") SELECT "bookId", "createdAt", "errorMessage", "externalId", "externalSlug", "id", "instanceId", "lastChecked", "status", "updatedAt" FROM "BookRequest";
DROP TABLE "BookRequest";
ALTER TABLE "new_BookRequest" RENAME TO "BookRequest";
CREATE INDEX "BookRequest_status_idx" ON "BookRequest"("status");
CREATE INDEX "BookRequest_instanceId_idx" ON "BookRequest"("instanceId");
CREATE UNIQUE INDEX "BookRequest_bookId_instanceId_key" ON "BookRequest"("bookId", "instanceId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "RequestEvent_requestId_createdAt_idx" ON "RequestEvent"("requestId", "createdAt");
