-- CreateTable
CREATE TABLE "kindness_memories" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "family_id" UUID,
    "memory_id" UUID,
    "title" VARCHAR(200) NOT NULL,
    "content" TEXT NOT NULL,
    "type" VARCHAR(30) NOT NULL DEFAULT 'companionship',
    "importance" VARCHAR(20) NOT NULL DEFAULT 'warm',
    "people" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "event" VARCHAR(500) NOT NULL,
    "emotion" VARCHAR(50) NOT NULL DEFAULT 'love',
    "emotion_score" DOUBLE PRECISION,
    "location" VARCHAR(255),
    "media" JSONB,
    "story" TEXT,
    "visibility" VARCHAR(20) NOT NULL DEFAULT 'family',
    "occurred_at" TIMESTAMP(3),
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "kindness_memories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "family_short_stories" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "family_id" UUID,
    "title" VARCHAR(200) NOT NULL,
    "content" TEXT NOT NULL,
    "period" VARCHAR(20) NOT NULL DEFAULT 'daily',
    "period_start" TIMESTAMP(3) NOT NULL,
    "period_end" TIMESTAMP(3) NOT NULL,
    "kindness_memory_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "emotion" VARCHAR(50),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "family_short_stories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "warm_reminders" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "message" TEXT NOT NULL,
    "context" TEXT,
    "scheduled_for" TIMESTAMP(3) NOT NULL,
    "delivered_at" TIMESTAMP(3),
    "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "warm_reminders_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "kindness_memories_user_id_occurred_at_idx" ON "kindness_memories"("user_id", "occurred_at");
CREATE INDEX "kindness_memories_user_id_created_at_idx" ON "kindness_memories"("user_id", "created_at");
CREATE INDEX "kindness_memories_user_id_type_idx" ON "kindness_memories"("user_id", "type");
CREATE INDEX "kindness_memories_user_id_importance_idx" ON "kindness_memories"("user_id", "importance");
CREATE INDEX "kindness_memories_family_id_idx" ON "kindness_memories"("family_id");
CREATE INDEX "kindness_memories_emotion_idx" ON "kindness_memories"("emotion");

CREATE INDEX "family_short_stories_user_id_period_period_start_idx" ON "family_short_stories"("user_id", "period", "period_start");
CREATE INDEX "family_short_stories_family_id_idx" ON "family_short_stories"("family_id");

CREATE INDEX "warm_reminders_user_id_status_scheduled_for_idx" ON "warm_reminders"("user_id", "status", "scheduled_for");

-- AddForeignKey
ALTER TABLE "kindness_memories" ADD CONSTRAINT "kindness_memories_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "kindness_memories" ADD CONSTRAINT "kindness_memories_family_id_fkey" FOREIGN KEY ("family_id") REFERENCES "families"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "kindness_memories" ADD CONSTRAINT "kindness_memories_memory_id_fkey" FOREIGN KEY ("memory_id") REFERENCES "memories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "family_short_stories" ADD CONSTRAINT "family_short_stories_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "family_short_stories" ADD CONSTRAINT "family_short_stories_family_id_fkey" FOREIGN KEY ("family_id") REFERENCES "families"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "warm_reminders" ADD CONSTRAINT "warm_reminders_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
