-- CreateTable
CREATE TABLE "Book" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "author" TEXT NOT NULL,
    "isbn" TEXT,
    "category" TEXT NOT NULL,
    "coverUrl" TEXT,
    "notes" TEXT,
    "metadataId" TEXT,
    "metadataProvider" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "BookRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "bookId" TEXT NOT NULL,
    "instanceId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "externalId" TEXT,
    "errorMessage" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "lastChecked" DATETIME,
    CONSTRAINT "BookRequest_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "Book" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "Book_category_idx" ON "Book"("category");

-- CreateIndex
CREATE INDEX "Book_metadataId_idx" ON "Book"("metadataId");

-- CreateIndex
CREATE INDEX "BookRequest_status_idx" ON "BookRequest"("status");

-- CreateIndex
CREATE INDEX "BookRequest_instanceId_idx" ON "BookRequest"("instanceId");

-- CreateIndex
CREATE UNIQUE INDEX "BookRequest_bookId_instanceId_key" ON "BookRequest"("bookId", "instanceId");
