import type { FeatureKey } from '@/features/registry';

export type UserRole = 'admin' | 'user';

export type UserRecord = {
  id: string;
  username: string;
  displayName: string;
  role: UserRole;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ControllableFeatureKey = Exclude<FeatureKey, 'home' | 'admin'>;

export const CONTROLLABLE_FEATURE_KEYS: readonly ControllableFeatureKey[] = [
  'calendar',
  'kanban',
  'todos',
  'habits',
  'focus',
  'notes',
  'language',
] as const;

export type FeatureAccessMap = Record<FeatureKey, boolean>;

export type RoleFeatureMatrix = Record<UserRole, Record<ControllableFeatureKey, boolean>>;

export type UserFeatureOverrideState = 'inherit' | 'allow' | 'deny';

export type UserFeatureOverridesMap = Partial<Record<ControllableFeatureKey, boolean>>;
