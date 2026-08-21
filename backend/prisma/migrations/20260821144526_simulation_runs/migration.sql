-- CreateEnum
CREATE TYPE "SimulationStatus" AS ENUM ('DRAFT', 'RUNNING', 'COMPLETE', 'FAILED', 'ERASED');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "simulationRunId" TEXT;

-- CreateTable
CREATE TABLE "simulation_runs" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "SimulationStatus" NOT NULL DEFAULT 'DRAFT',
    "params" JSONB NOT NULL,
    "seed" TEXT NOT NULL,
    "progress" INTEGER NOT NULL DEFAULT 0,
    "progressLabel" TEXT,
    "summary" JSONB,
    "monthly" JSONB,
    "memberCount" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "erasedAt" TIMESTAMP(3),
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "simulation_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "simulation_runs_status_createdAt_idx" ON "simulation_runs"("status", "createdAt");

-- CreateIndex
CREATE INDEX "users_simulationRunId_idx" ON "users"("simulationRunId");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_simulationRunId_fkey" FOREIGN KEY ("simulationRunId") REFERENCES "simulation_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
