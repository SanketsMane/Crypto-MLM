-- CreateEnum
CREATE TYPE "LegPosition" AS ENUM ('LEFT', 'RIGHT');

-- AlterEnum
ALTER TYPE "CommissionKind" ADD VALUE 'BINARY';

-- AlterEnum
ALTER TYPE "LedgerCategory" ADD VALUE 'BINARY_BONUS';

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "legPosition" "LegPosition",
ADD COLUMN     "placementDepth" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "placementParentId" TEXT,
ADD COLUMN     "placementPath" TEXT NOT NULL DEFAULT '';

-- CreateTable
CREATE TABLE "binary_legs" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "leftVolume" DECIMAL(38,8) NOT NULL DEFAULT 0,
    "rightVolume" DECIMAL(38,8) NOT NULL DEFAULT 0,
    "leftTotal" DECIMAL(38,8) NOT NULL DEFAULT 0,
    "rightTotal" DECIMAL(38,8) NOT NULL DEFAULT 0,
    "matchedTotal" DECIMAL(38,8) NOT NULL DEFAULT 0,
    "leftCount" INTEGER NOT NULL DEFAULT 0,
    "rightCount" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "binary_legs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "binary_legs_userId_key" ON "binary_legs"("userId");

-- CreateIndex
CREATE INDEX "users_placementParentId_idx" ON "users"("placementParentId");

-- CreateIndex
CREATE INDEX "users_placementPath_idx" ON "users"("placementPath");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_placementParentId_fkey" FOREIGN KEY ("placementParentId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "binary_legs" ADD CONSTRAINT "binary_legs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
