-- Migration: Phase 4 (Skills 真实能力化) + Phase 5 (Memory 长期记忆化)
-- Generated manually because no DATABASE_URL is available in this environment.

-- ============================================================
-- Phase 5: Memory model enhancements
-- ============================================================

-- AddLayer
ALTER TABLE "memories" ADD COLUMN "memory_layer" VARCHAR(20) DEFAULT 'episodic';

-- AddSourceType
ALTER TABLE "memories" ADD COLUMN "source_type" VARCHAR(30) DEFAULT 'chat';

-- AddArchiveFlags
ALTER TABLE "memories" ADD COLUMN "is_archived" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "memories" ADD COLUMN "archived_at" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "memories_memory_layer_idx" ON "memories"("memory_layer");

-- CreateIndex
CREATE INDEX "memories_source_type_idx" ON "memories"("source_type");

-- CreateIndex
CREATE INDEX "memories_is_archived_idx" ON "memories"("is_archived");

-- ============================================================
-- Phase 4: Tool / MCP Server / Skill-Tool bindings
-- ============================================================

-- CreateTable
CREATE TABLE "mcp_servers" (
    "id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "endpoint" VARCHAR(500),
    "transport" VARCHAR(20) NOT NULL DEFAULT 'sse',
    "config" JSONB,
    "status" VARCHAR(20) NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mcp_servers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tools" (
    "id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "description" TEXT,
    "parameters" JSONB,
    "executor" VARCHAR(20) NOT NULL DEFAULT 'builtin',
    "mcp_server_id" UUID,
    "config" JSONB,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tools_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "skill_tools" (
    "id" UUID NOT NULL,
    "skill_id" UUID NOT NULL,
    "tool_id" UUID NOT NULL,
    "ability_name" VARCHAR(100) NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "unlock_level" INTEGER NOT NULL DEFAULT 1,
    "parameters" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "skill_tools_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tools_name_key" ON "tools"("name");

-- CreateIndex
CREATE INDEX "tools_executor_idx" ON "tools"("executor");

-- CreateIndex
CREATE INDEX "tools_is_active_idx" ON "tools"("is_active");

-- CreateIndex
CREATE INDEX "skill_tools_skill_id_idx" ON "skill_tools"("skill_id");

-- CreateIndex
CREATE INDEX "skill_tools_tool_id_idx" ON "skill_tools"("tool_id");

-- CreateIndex
CREATE UNIQUE INDEX "skill_tools_skill_id_tool_id_ability_name_key" ON "skill_tools"("skill_id", "tool_id", "ability_name");

-- AddForeignKey
ALTER TABLE "tools" ADD CONSTRAINT "tools_mcp_server_id_fkey" FOREIGN KEY ("mcp_server_id") REFERENCES "mcp_servers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "skill_tools" ADD CONSTRAINT "skill_tools_skill_id_fkey" FOREIGN KEY ("skill_id") REFERENCES "skills"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "skill_tools" ADD CONSTRAINT "skill_tools_tool_id_fkey" FOREIGN KEY ("tool_id") REFERENCES "tools"("id") ON DELETE CASCADE ON UPDATE CASCADE;
