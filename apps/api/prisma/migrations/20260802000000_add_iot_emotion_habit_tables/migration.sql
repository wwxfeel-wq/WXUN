-- CreateTable: ShimoEmotionState (时墨情感状态 — 6 维度情感模型)
CREATE TABLE "shimo_emotion_states" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "warmth" DOUBLE PRECISION NOT NULL DEFAULT 0.7,
    "curiosity" DOUBLE PRECISION NOT NULL DEFAULT 0.3,
    "calm" DOUBLE PRECISION NOT NULL DEFAULT 0.6,
    "joy" DOUBLE PRECISION NOT NULL DEFAULT 0.3,
    "nostalgia" DOUBLE PRECISION NOT NULL DEFAULT 0.2,
    "concern" DOUBLE PRECISION NOT NULL DEFAULT 0.2,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shimo_emotion_states_pkey" PRIMARY KEY ("id")
);

-- CreateTable: UserHabitProfile (用户习惯画像 — 自适应偏好)
CREATE TABLE "user_habit_profiles" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "preferred_topics" JSONB NOT NULL DEFAULT '[]',
    "avg_message_length" VARCHAR(20) NOT NULL DEFAULT 'medium',
    "emotional_pattern" VARCHAR(20) NOT NULL DEFAULT 'stable',
    "active_time_slots" JSONB NOT NULL DEFAULT '[]',
    "tool_usage_rate" VARCHAR(20) NOT NULL DEFAULT 'balanced',
    "formality_level" VARCHAR(20) NOT NULL DEFAULT 'casual',
    "conversation_count" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_habit_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable: IoTCredential (IoT 平台凭证)
CREATE TABLE "iot_credentials" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "platform" VARCHAR(20) NOT NULL,
    "access_token" TEXT,
    "refresh_token" TEXT,
    "expires_at" TIMESTAMP(3),
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "iot_credentials_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "shimo_emotion_states_user_id_key" ON "shimo_emotion_states"("user_id");
CREATE UNIQUE INDEX "user_habit_profiles_user_id_key" ON "user_habit_profiles"("user_id");
CREATE UNIQUE INDEX "iot_credentials_user_id_platform_key" ON "iot_credentials"("user_id", "platform");
CREATE INDEX "iot_credentials_user_id_idx" ON "iot_credentials"("user_id");

-- AddForeignKey
ALTER TABLE "shimo_emotion_states" ADD CONSTRAINT "shimo_emotion_states_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_habit_profiles" ADD CONSTRAINT "user_habit_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "iot_credentials" ADD CONSTRAINT "iot_credentials_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
