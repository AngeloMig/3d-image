-- AlterTable
ALTER TABLE "EmbroideryConfiguration" ADD COLUMN "approvalNote" TEXT;
ALTER TABLE "EmbroideryConfiguration" ADD COLUMN "approvalStatus" TEXT;
ALTER TABLE "EmbroideryConfiguration" ADD COLUMN "previewRef" TEXT;
ALTER TABLE "EmbroideryConfiguration" ADD COLUMN "reviewedAt" DATETIME;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Artwork" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'artwork',
    "storageRef" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "byteSize" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "orderedAt" DATETIME
);
INSERT INTO "new_Artwork" ("byteSize", "createdAt", "filename", "id", "mimeType", "orderedAt", "sha256", "shop", "storageKey", "storageRef") SELECT "byteSize", "createdAt", "filename", "id", "mimeType", "orderedAt", "sha256", "shop", "storageKey", "storageRef" FROM "Artwork";
DROP TABLE "Artwork";
ALTER TABLE "new_Artwork" RENAME TO "Artwork";
CREATE UNIQUE INDEX "Artwork_storageRef_key" ON "Artwork"("storageRef");
CREATE INDEX "Artwork_shop_createdAt_idx" ON "Artwork"("shop", "createdAt");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "EmbroideryConfiguration_shop_approvalStatus_idx" ON "EmbroideryConfiguration"("shop", "approvalStatus");
