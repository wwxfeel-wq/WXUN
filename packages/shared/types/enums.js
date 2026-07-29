"use strict";
/**
 * EchoLife Shared Enums
 * Used by both frontend and backend
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.AICallStatus = exports.ConfirmationStatus = exports.FamilyRole = exports.RelationType = exports.EntityType = exports.PromptStatus = exports.AgentType = exports.NotificationType = exports.SummaryPeriod = exports.CapsuleType = exports.CapsuleStatus = exports.LifeTreeNodeType = exports.MessageSender = exports.InterviewStatus = exports.MemoryVisibility = exports.MemoryType = exports.RoleName = exports.SubscriptionStatus = exports.SubscriptionTier = exports.UserStatus = void 0;
/** User account status */
var UserStatus;
(function (UserStatus) {
    UserStatus["ACTIVE"] = "active";
    UserStatus["INACTIVE"] = "inactive";
    UserStatus["SUSPENDED"] = "suspended";
    UserStatus["DELETED"] = "deleted";
})(UserStatus || (exports.UserStatus = UserStatus = {}));
/** Subscription plan tier */
var SubscriptionTier;
(function (SubscriptionTier) {
    SubscriptionTier["FREE"] = "free";
    SubscriptionTier["PRO"] = "pro";
    SubscriptionTier["FAMILY"] = "family";
    SubscriptionTier["LIFETIME"] = "lifetime";
})(SubscriptionTier || (exports.SubscriptionTier = SubscriptionTier = {}));
/** Subscription status */
var SubscriptionStatus;
(function (SubscriptionStatus) {
    SubscriptionStatus["ACTIVE"] = "active";
    SubscriptionStatus["EXPIRED"] = "expired";
    SubscriptionStatus["CANCELLED"] = "cancelled";
    SubscriptionStatus["PAST_DUE"] = "past_due";
})(SubscriptionStatus || (exports.SubscriptionStatus = SubscriptionStatus = {}));
/** RBAC roles */
var RoleName;
(function (RoleName) {
    RoleName["SUPER_ADMIN"] = "super_admin";
    RoleName["OPERATOR"] = "operator";
    RoleName["SUPPORT"] = "support";
    RoleName["FINANCE"] = "finance";
    RoleName["AUDITOR"] = "auditor";
    RoleName["USER"] = "user";
})(RoleName || (exports.RoleName = RoleName = {}));
/** Memory type classification */
var MemoryType;
(function (MemoryType) {
    MemoryType["STORY"] = "story";
    MemoryType["EVENT"] = "event";
    MemoryType["RELATIONSHIP"] = "relationship";
    MemoryType["EMOTION"] = "emotion";
    MemoryType["ACHIEVEMENT"] = "achievement";
    MemoryType["REFLECTION"] = "reflection";
    MemoryType["DAILY"] = "daily";
})(MemoryType || (exports.MemoryType = MemoryType = {}));
/** Memory visibility level */
var MemoryVisibility;
(function (MemoryVisibility) {
    MemoryVisibility["PRIVATE"] = "private";
    MemoryVisibility["FAMILY"] = "family";
    MemoryVisibility["PUBLIC"] = "public";
})(MemoryVisibility || (exports.MemoryVisibility = MemoryVisibility = {}));
/** Interview session status */
var InterviewStatus;
(function (InterviewStatus) {
    InterviewStatus["ACTIVE"] = "active";
    InterviewStatus["COMPLETED"] = "completed";
    InterviewStatus["ABANDONED"] = "abandoned";
})(InterviewStatus || (exports.InterviewStatus = InterviewStatus = {}));
/** Message sender type */
var MessageSender;
(function (MessageSender) {
    MessageSender["USER"] = "user";
    MessageSender["AI"] = "ai";
    MessageSender["SYSTEM"] = "system";
})(MessageSender || (exports.MessageSender = MessageSender = {}));
/** Life tree node type */
var LifeTreeNodeType;
(function (LifeTreeNodeType) {
    LifeTreeNodeType["ROOT"] = "root";
    LifeTreeNodeType["CATEGORY"] = "category";
    LifeTreeNodeType["EVENT"] = "event";
    LifeTreeNodeType["PERSON"] = "person";
    LifeTreeNodeType["PLACE"] = "place";
    LifeTreeNodeType["THEME"] = "theme";
})(LifeTreeNodeType || (exports.LifeTreeNodeType = LifeTreeNodeType = {}));
/** Time capsule status */
var CapsuleStatus;
(function (CapsuleStatus) {
    CapsuleStatus["SEALED"] = "sealed";
    CapsuleStatus["OPENED"] = "opened";
    CapsuleStatus["EXPIRED"] = "expired";
})(CapsuleStatus || (exports.CapsuleStatus = CapsuleStatus = {}));
/** Time capsule type */
var CapsuleType;
(function (CapsuleType) {
    CapsuleType["PERSONAL"] = "personal";
    CapsuleType["FAMILY"] = "family";
    CapsuleType["PUBLIC"] = "public";
})(CapsuleType || (exports.CapsuleType = CapsuleType = {}));
/** Summary period type */
var SummaryPeriod;
(function (SummaryPeriod) {
    SummaryPeriod["DAILY"] = "daily";
    SummaryPeriod["WEEKLY"] = "weekly";
    SummaryPeriod["MONTHLY"] = "monthly";
    SummaryPeriod["YEARLY"] = "yearly";
})(SummaryPeriod || (exports.SummaryPeriod = SummaryPeriod = {}));
/** Notification type */
var NotificationType;
(function (NotificationType) {
    NotificationType["INTERVIEW_REMINDER"] = "interview_reminder";
    NotificationType["CAPSULE_OPENING"] = "capsule_opening";
    NotificationType["FAMILY_MEMORY"] = "family_memory";
    NotificationType["SUMMARY_READY"] = "summary_ready";
    NotificationType["SYSTEM"] = "system";
})(NotificationType || (exports.NotificationType = NotificationType = {}));
/** AI Agent type */
var AgentType;
(function (AgentType) {
    AgentType["LIFE_COACH"] = "life_coach";
    AgentType["STORY_AGENT"] = "story_agent";
    AgentType["MEMORY_AGENT"] = "memory_agent";
    AgentType["EMOTION_AGENT"] = "emotion_agent";
    AgentType["KNOWLEDGE_AGENT"] = "knowledge_agent";
    AgentType["SUMMARY_AGENT"] = "summary_agent";
    AgentType["RELATIONSHIP_AGENT"] = "relationship_agent";
})(AgentType || (exports.AgentType = AgentType = {}));
/** Prompt version status */
var PromptStatus;
(function (PromptStatus) {
    PromptStatus["DRAFT"] = "draft";
    PromptStatus["ACTIVE"] = "active";
    PromptStatus["ARCHIVED"] = "archived";
})(PromptStatus || (exports.PromptStatus = PromptStatus = {}));
/** Knowledge entity type */
var EntityType;
(function (EntityType) {
    EntityType["PERSON"] = "person";
    EntityType["PLACE"] = "place";
    EntityType["ORGANIZATION"] = "organization";
    EntityType["EVENT"] = "event";
    EntityType["CONCEPT"] = "concept";
    EntityType["OBJECT"] = "object";
})(EntityType || (exports.EntityType = EntityType = {}));
/** Knowledge relation type */
var RelationType;
(function (RelationType) {
    RelationType["RELATED_TO"] = "related_to";
    RelationType["PART_OF"] = "part_of";
    RelationType["MEMBER_OF"] = "member_of";
    RelationType["LOCATED_AT"] = "located_at";
    RelationType["OCCURRED_AT"] = "occurred_at";
    RelationType["CREATED_BY"] = "created_by";
})(RelationType || (exports.RelationType = RelationType = {}));
/** Family member role */
var FamilyRole;
(function (FamilyRole) {
    FamilyRole["ADMIN"] = "admin";
    FamilyRole["MEMBER"] = "member";
    FamilyRole["VIEWER"] = "viewer";
})(FamilyRole || (exports.FamilyRole = FamilyRole = {}));
/** Family memory confirmation status */
var ConfirmationStatus;
(function (ConfirmationStatus) {
    ConfirmationStatus["PENDING"] = "pending";
    ConfirmationStatus["CONFIRMED"] = "confirmed";
    ConfirmationStatus["REJECTED"] = "rejected";
})(ConfirmationStatus || (exports.ConfirmationStatus = ConfirmationStatus = {}));
/** AI call status */
var AICallStatus;
(function (AICallStatus) {
    AICallStatus["SUCCESS"] = "success";
    AICallStatus["FAILED"] = "failed";
    AICallStatus["TIMEOUT"] = "timeout";
    AICallStatus["RATE_LIMITED"] = "rate_limited";
})(AICallStatus || (exports.AICallStatus = AICallStatus = {}));
//# sourceMappingURL=enums.js.map