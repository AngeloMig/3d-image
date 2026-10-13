-- CreateTable
CREATE TABLE "Artwork" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "storageRef" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "byteSize" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "orderedAt" DATETIME
);

-- CreateTable
CREATE TABLE "EmbroideryConfiguration" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "configRef" TEXT NOT NULL,
    "customizationId" TEXT NOT NULL,
    "schemaVersion" INTEGER NOT NULL,
    "json" TEXT NOT NULL,
    "artworkRef" TEXT,
    "productId" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "orderId" TEXT,
    "orderName" TEXT,
    "orderedAt" DATETIME
);

-- CreateIndex
CREATE UNIQUE INDEX "Artwork_storageRef_key" ON "Artwork"("storageRef");

-- CreateIndex
CREATE INDEX "Artwork_shop_createdAt_idx" ON "Artwork"("shop", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "EmbroideryConfiguration_configRef_key" ON "EmbroideryConfiguration"("configRef");

-- CreateIndex
CREATE INDEX "EmbroideryConfiguration_shop_customizationId_idx" ON "EmbroideryConfiguration"("shop", "customizationId");

-- CreateIndex
CREATE INDEX "EmbroideryConfiguration_shop_createdAt_idx" ON "EmbroideryConfiguration"("shop", "createdAt");
