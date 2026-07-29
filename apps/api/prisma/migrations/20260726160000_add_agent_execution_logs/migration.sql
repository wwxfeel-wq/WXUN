-- CreateTable
CREATE TABLE "agent_execution_logs" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "agent_code" VARCHAR(50) NOT NULL,
    "message" TEXT NOT NULL,
    "response" TEXT NOT NULL,
    "model" VARCHAR(100),
    "prompt_tokens" INTEGER NOT NULL DEFAULT 0,
    "completion_tokens" INTEGER NOT NULL DEFAULT 0,
    "total_tokens" INTEGER NOT NULL DEFAULT 0,
    "latency_ms" INTEGER NOT NULL DEFAULT 0,
    "status" VARCHAR(20) NOT NULL DEFAULT 'success',
    "error_message" TEXT,
    "tool_results" JSONB,
    "workflow_results" JSONB,
    "memory_ids" TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_execution_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "agent_execution_logs_user_id_agent_code_created_at_idx" ON "agent_execution_logs"("user_id", "agent_code", "created_at");

-- CreateIndex
CREATE INDEX "agent_execution_logs_agent_code_created_at_idx" ON "agent_execution_logs"("agent_code", "created_at");

-- CreateIndex
CREATE INDEX "agent_execution_logs_status_created_at_idx" ON "agent_execution_logs"("status", "created_at");

-- AddForeignKey
ALTER TABLE "agent_execution_logs" ADD CONSTRAINT "agent_execution_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
