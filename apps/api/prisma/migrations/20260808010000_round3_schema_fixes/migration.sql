-- Round 3 Code Review Schema Fixes
-- Addresses: R3-DB-001 through R3-DB-009
-- This migration adds missing foreign keys, unique constraints, and indexes.

-- ============================================================
-- R3-DB-001: WechatMessage FK to WechatContact
-- ============================================================
-- Make contact_id nullable (existing messages may not have a matching contact)
ALTER TABLE "wechat_messages" ALTER COLUMN "contact_id" DROP NOT NULL;

-- Add FK from wechat_messages.contact_id to wechat_contacts.user_name
ALTER TABLE "wechat_messages" ADD CONSTRAINT "wechat_messages_contact_id_fkey"
  FOREIGN KEY ("contact_id") REFERENCES "wechat_contacts"("user_name")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- ============================================================
-- R3-DB-002: Family.creatorId FK to User
-- ============================================================
ALTER TABLE "families" ADD CONSTRAINT "families_creator_id_fkey"
  FOREIGN KEY ("creator_id") REFERENCES "users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================
-- R3-DB-003: PersonalitySnapshot.userId FK to User
-- ============================================================
ALTER TABLE "personality_snapshots" ADD CONSTRAINT "personality_snapshots_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================
-- R3-DB-004: PromptVersion.createdBy FK to User
-- ============================================================
-- Make created_by nullable so prompt versions survive user deletion
ALTER TABLE "prompt_versions" ALTER COLUMN "created_by" DROP NOT NULL;

ALTER TABLE "prompt_versions" ADD CONSTRAINT "prompt_versions_created_by_fkey"
  FOREIGN KEY ("created_by") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- ============================================================
-- R3-DB-006: FamilyMember.wechatId unique constraint
-- ============================================================
-- Remove duplicate wechat_id values before adding unique constraint.
-- Keep only the first (oldest) record for each wechat_id, set others to NULL.
-- NOTE: id is UUID, and PostgreSQL's MIN() does not accept uuid on some
-- versions. Cast to text for the MIN() aggregate, then back to uuid.
UPDATE "family_members" SET "wechat_id" = NULL
WHERE "wechat_id" IS NOT NULL
  AND "id" NOT IN (
    SELECT MIN(fm.id::text)::uuid FROM "family_members" fm
    WHERE fm.wechat_id IS NOT NULL
    GROUP BY fm.wechat_id
  );

-- Drop the existing non-unique index on wechat_id
DROP INDEX IF EXISTS "family_members_wechat_id_idx";

-- Create unique index
CREATE UNIQUE INDEX "family_members_wechat_id_key" ON "family_members"("wechat_id");

-- ============================================================
-- R3-DB-007: AICallLog.latencyMs optional
-- ============================================================
ALTER TABLE "ai_call_logs" ALTER COLUMN "latency_ms" DROP NOT NULL;

-- ============================================================
-- R3-DB-008: WechatContact nickName index
-- ============================================================
CREATE INDEX IF NOT EXISTS "wechat_contacts_nick_name_idx"
  ON "wechat_contacts"("nick_name");

-- ============================================================
-- R3-DB-005: IoTCredential tokens — no schema change needed.
-- Encryption is handled at the application level via encryption.util.ts
-- (AES-256-GCM). Tokens are encrypted before storage and decrypted on read.
-- ============================================================
-- R3-DB-009: MemoryEmbedding.embedding — no schema change needed.
-- Migration to pgvector type is deferred (see comment in schema.prisma).
-- ============================================================
