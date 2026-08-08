-- CreateTable: WechatContact (微信联系人)
CREATE TABLE "wechat_contacts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_name" VARCHAR(200) NOT NULL,
    "nick_name" VARCHAR(200) NOT NULL,
    "remark_name" VARCHAR(200),
    "alias" VARCHAR(200),
    "avatar_url" VARCHAR(500),
    "type" VARCHAR(20) NOT NULL,
    "is_star" BOOLEAN NOT NULL DEFAULT false,
    "signature" TEXT,
    "status" VARCHAR(20) NOT NULL DEFAULT 'active',
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wechat_contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable: WechatMessage (微信消息)
CREATE TABLE "wechat_messages" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "contact_id" VARCHAR(200) NOT NULL,
    "from_id" VARCHAR(200) NOT NULL,
    "from_name" VARCHAR(200) NOT NULL,
    "to_id" VARCHAR(200) NOT NULL,
    "to_name" VARCHAR(200) NOT NULL,
    "content" TEXT NOT NULL,
    "msg_type" INTEGER NOT NULL DEFAULT 1,
    "is_self" BOOLEAN NOT NULL DEFAULT false,
    "sender_wechat_id" VARCHAR(200),
    "family_member_id" UUID,
    "metadata" JSONB,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wechat_messages_pkey" PRIMARY KEY ("id")
);

-- AddColumn: family_members 添加微信身份绑定字段
ALTER TABLE "family_members" ADD COLUMN "wechat_id" VARCHAR(200);
ALTER TABLE "family_members" ADD COLUMN "wechat_nickname" VARCHAR(200);
ALTER TABLE "family_members" ADD COLUMN "wechat_alias" VARCHAR(200);

-- CreateIndex: wechat_contacts
CREATE UNIQUE INDEX "wechat_contacts_user_name_key" ON "wechat_contacts"("user_name");
CREATE INDEX "wechat_contacts_type_idx" ON "wechat_contacts"("type");
CREATE INDEX "wechat_contacts_status_idx" ON "wechat_contacts"("status");

-- CreateIndex: wechat_messages
CREATE INDEX "wechat_messages_contact_id_created_at_idx" ON "wechat_messages"("contact_id", "created_at");
CREATE INDEX "wechat_messages_from_id_created_at_idx" ON "wechat_messages"("from_id", "created_at");
CREATE INDEX "wechat_messages_to_id_created_at_idx" ON "wechat_messages"("to_id", "created_at");
CREATE INDEX "wechat_messages_family_member_id_idx" ON "wechat_messages"("family_member_id");

-- CreateIndex: family_members 微信字段索引
CREATE INDEX "family_members_wechat_id_idx" ON "family_members"("wechat_id");
CREATE INDEX "family_members_wechat_nickname_idx" ON "family_members"("wechat_nickname");
