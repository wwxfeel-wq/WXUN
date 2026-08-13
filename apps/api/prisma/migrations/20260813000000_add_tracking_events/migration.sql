-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- DropTable (idempotent: clean up any partial table from failed migration attempts)
DROP TABLE IF EXISTS "tracking_events" CASCADE;

-- CreateTable
CREATE TABLE "tracking_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "session_id" VARCHAR(100) NOT NULL,
    "user_id" UUID,
    "event_type" VARCHAR(50) NOT NULL,
    "page_path" VARCHAR(500) NOT NULL,
    "page_title" VARCHAR(500),
    "referrer" VARCHAR(500),
    "ip_address" VARCHAR(45) NOT NULL,
    "user_agent" TEXT,
    "browser" VARCHAR(50),
    "os" VARCHAR(50),
    "device_type" VARCHAR(20),
    "country" VARCHAR(50),
    "city" VARCHAR(100),
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "tracking_events_created_at_idx" ON "tracking_events"("created_at");
CREATE INDEX "tracking_events_session_id_idx" ON "tracking_events"("session_id");
CREATE INDEX "tracking_events_ip_address_idx" ON "tracking_events"("ip_address");
CREATE INDEX "tracking_events_event_type_idx" ON "tracking_events"("event_type");
CREATE INDEX "tracking_events_page_path_idx" ON "tracking_events"("page_path");

-- AddForeignKey
ALTER TABLE "tracking_events" ADD CONSTRAINT "tracking_events_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
