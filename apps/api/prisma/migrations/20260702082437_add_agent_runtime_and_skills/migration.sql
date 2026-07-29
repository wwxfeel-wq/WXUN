-- CreateTable
CREATE TABLE "agent_runtimes" (
    "id" UUID NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "role" VARCHAR(100) NOT NULL,
    "description" TEXT,
    "icon" VARCHAR(50) NOT NULL DEFAULT 'Sparkles',
    "color" VARCHAR(20) NOT NULL DEFAULT '#5E9EF5',
    "status" VARCHAR(20) NOT NULL DEFAULT 'idle',
    "level" INTEGER NOT NULL DEFAULT 1,
    "calls" INTEGER NOT NULL DEFAULT 0,
    "system_prompt" TEXT,
    "welcome_message" TEXT,
    "capabilities" JSONB,
    "last_active_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agent_runtimes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "skills" (
    "id" UUID NOT NULL,
    "agent_id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "description" TEXT,
    "icon" VARCHAR(50) NOT NULL DEFAULT 'Sparkles',
    "color" VARCHAR(20) NOT NULL DEFAULT '#5E9EF5',
    "level" INTEGER NOT NULL DEFAULT 1,
    "status" VARCHAR(20) NOT NULL DEFAULT 'new',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "category" VARCHAR(50) NOT NULL DEFAULT 'general',
    "tags" JSONB,
    "examples" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "skills_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "agent_runtimes_code_key" ON "agent_runtimes"("code");

-- CreateIndex
CREATE INDEX "skills_agent_id_idx" ON "skills"("agent_id");

-- CreateIndex
CREATE INDEX "skills_status_idx" ON "skills"("status");

-- CreateIndex
CREATE INDEX "skills_category_idx" ON "skills"("category");

-- AddForeignKey
ALTER TABLE "skills" ADD CONSTRAINT "skills_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agent_runtimes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
