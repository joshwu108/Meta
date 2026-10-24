import type { GroupSizePref, SocialGoal } from '@/shared/enums';
import type { CompatibilityResult } from '@/shared/types';

/** Display labels for matching UI and explanations. Safe to import from client components. */

export const SOCIAL_GOAL_LABELS: Readonly<Record<SocialGoal, string>> = {
  make_friends: 'Make friends',
  explore_city: 'Explore the city',
  learn_skill: 'Learn a skill',
  find_activity_partners: 'Find activity partners',
  network: 'Network',
};

export const GROUP_SIZE_LABELS: Readonly<Record<GroupSizePref, string>> = {
  one_on_one: 'One-on-one',
  small: 'Small group (3–6)',
  medium: 'Medium group (7–12)',
  large: 'Large group (13+)',
};

export const BREAKDOWN_LABELS: Readonly<Record<keyof CompatibilityResult['breakdown'], string>> = {
  interests: 'Shared interests',
  availability: 'Free at the same times',
  social: 'Social goals and group size',
  location: 'Close by',
  budget: 'Budget and activity style',
};

export const REPORT_REASON_LABELS = {
  harassment: 'Harassment',
  spam: 'Spam',
  fake: 'Fake profile',
  safety: 'Safety concern',
  other: 'Something else',
} as const;
