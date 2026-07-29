/**
 * EchoLife Web - Frontend-specific type definitions.
 * These mirror the backend response shapes and supplement the shared package types.
 */
import type {
  Memory,
  Interview,
  TimeCapsule,
  LifeTreeNode,
  PersonalityProfile,
  AppNotification,
  Summary,
} from '@echolife/shared';

/** User profile object returned by the auth and user endpoints. */
export interface AuthUserProfile {
  nickname: string;
  avatarUrl: string | null;
  bio: string | null;
  birthDate?: string | null;
  gender?: string | null;
  location?: string | null;
  occupation?: string | null;
}

/** Subscription info attached to the user. */
export interface UserSubscription {
  tier: string;
  status: string;
  expiresAt: string | null;
}

/** Full user object returned by /auth/login, /auth/register, /auth/me. */
export interface AuthUser {
  id: string;
  email: string;
  emailVerified: boolean;
  status: string;
  profile: AuthUserProfile;
  roles: string[];
  subscription: UserSubscription;
}

/** Token response payload. */
export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

/** Combined auth response. */
export interface AuthResponse extends AuthTokens {
  user: AuthUser;
}

/** User application settings. */
export interface UserSettings {
  theme: 'dark' | 'light' | 'auto';
  language: 'zh-CN' | 'en-US';
  notificationEmail: boolean;
  notificationPush: boolean;
  aiTemperature: number;
  memoryRetentionDays: number;
}

/** Dashboard aggregate statistics. */
export interface DashboardStats {
  totalMemories: number;
  totalInterviews: number;
  totalCapsules: number;
  familyMembers: number;
  moodTrend: { date: string; score: number }[];
}

/** Memory statistics from /memories/stats. */
export interface MemoryStats {
  total: number;
  byType: Record<string, number>;
  byEmotion: Record<string, number>;
  thisMonth: number;
  thisWeek: number;
}

/** Re-export shared domain types for convenience. */
export type {
  Memory,
  Interview,
  TimeCapsule,
  LifeTreeNode,
  PersonalityProfile,
  AppNotification,
  Summary,
};

/** A chat message rendered in the interview interface. */
export interface ChatMessage {
  id: string;
  role: 'user' | 'ai' | 'system';
  content: string;
  entities?: string[];
  emotion?: string;
  emotionIntensity?: number;
  memoryId?: string;
  summary?: string;
  createdAt: number;
  streaming?: boolean;
}

/** Family member within a family group. */
export interface FamilyMember {
  id: string;
  userId: string;
  familyId: string;
  role: string;
  nickname: string;
  avatarUrl: string | null;
  joinedAt: string;
}

/** Family group. */
export interface FamilyGroup {
  id: string;
  name: string;
  description?: string | null;
  creatorId: string;
  memberCount: number;
  createdAt: string;
}
