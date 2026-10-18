// accountMetrics.js — pure functions for Account health & completeness signals.
// No faked data. Every metric is derived from real user/auth state.

import { XP_LEVELS } from "../../../core/appConstants.js";
import * as G from "../../../services/gamification.js";

// ── Profile completeness ─────────────────────────────────────────────────────
// Returns 0–100. Explanation string included so UI can be transparent.
export const PROFILE_FIELDS = [
  { key: "name",          label: "Full name",      weight: 20 },
  { key: "country",         label: "Location",        weight: 10 },
  { key: "bio",           label: "Bio",             weight: 20 },
  { key: "phone",         label: "Phone",           weight: 15 },
  { key: "photoUrl",      label: "Profile photo",   weight: 20 },
];

export function calcCompleteness(profileData) {
  if (!profileData) return 0;
  let earned = 0;
  let total = 0;
  for (const f of PROFILE_FIELDS) {
    total += f.weight;
    if (profileData[f.key]) earned += f.weight;
  }
  return total > 0 ? Math.round((earned / total) * 100) : 0;
}

export function completenessFields(profileData) {
  return PROFILE_FIELDS.map((f) => ({
    ...f,
    done: Boolean(profileData?.[f.key]),
  }));
}

// ── Account Health ───────────────────────────────────────────────────────────
// Calculated from REAL signals only. Returns score 0–100 and breakdown array.
// Must not include any invented signals.
export function calcAccountHealth(profileData, user, deletionRequest) {
  const signals = [];

  // Email verified (from real Supabase auth state)
  signals.push({
    label: "Email verified",
    done: Boolean(user?.emailVerified),
    points: 25,
    desc: "Your email address has been confirmed.",
  });

  // Phone verified
  signals.push({
    label: "Phone verified",
    done: Boolean(profileData?.phoneVerified),
    points: 20,
    desc: "Your registered phone number has been verified.",
  });

  // Profile 50%+
  const comp = calcCompleteness(profileData);
  signals.push({
    label: "Profile 50%+ complete",
    done: comp >= 50,
    points: 20,
    desc: "At least half of your profile fields are filled in.",
  });

  // Profile 100%
  signals.push({
    label: "Profile 100% complete",
    done: comp === 100,
    points: 15,
    desc: "All profile fields are complete.",
  });

  // No pending deletion
  signals.push({
    label: "No deletion pending",
    done: deletionRequest !== undefined && !["pending", "processing"].includes(deletionRequest?.status),
    points: 20,
    desc: "Account is not scheduled for deletion.",
    dynamic: true, // Caller may override based on deletion state
  });

  const scored = signals.reduce(
    (acc, s) => (s.done ? acc + s.points : acc),
    0
  );
  const total = signals.reduce((acc, s) => acc + s.points, 0);

  return {
    score: total > 0 ? Math.round((scored / total) * 100) : 0,
    signals,
  };
}

// ── XP / Level ───────────────────────────────────────────────────────────────
export function getXpInfo(profileData) {
  const xp = G.calcXP(profileData);
  const level = G.getLevel(xp);
  const nextLevel =
    XP_LEVELS.find((l) => l.level === level.level + 1) || null;
  const progress = nextLevel
    ? Math.round(((xp - level.min) / (nextLevel.min - level.min)) * 100)
    : 100;
  return { xp, level, nextLevel, progress };
}

// ── Badges (real, from profile data) ────────────────────────────────────────
export function getBadges(profileData, user) {
  const comp = calcCompleteness(profileData);
  return [
    {
      id: "first_login",
      label: "First Login",
      desc: "Signed in to Nexus for the first time.",
      earned: Boolean(user),
      xp: 0,
    },
    {
      id: "registered",
      label: "Registered",
      desc: "Completed the registration form.",
      earned: Boolean(profileData?.name || profileData?.email),
      xp: 100,
    },
    {
      id: "phone_verified",
      label: "Phone Verified",
      desc: "Verified a phone number.",
      earned: Boolean(profileData?.phoneVerified),
      xp: 50,
    },
    {
      id: "linkedin",
      label: "Networker",
      desc: "Added a LinkedIn profile link.",
      earned: Boolean(profileData?.linkedin),
      xp: 20,
    },
    {
      id: "photo",
      label: "Photogenic",
      desc: "Uploaded a profile photo.",
      earned: Boolean(profileData?.photoUrl),
      xp: 30,
    },
    {
      id: "bio",
      label: "Storyteller",
      desc: "Wrote a profile bio.",
      earned: Boolean(profileData?.bio),
      xp: 20,
    },
    {
      id: "complete",
      label: "Complete",
      desc: "Reached 100% profile completeness.",
      earned: comp === 100,
      xp: 0,
    },
    {
      id: "streak_7",
      label: "Streak Master",
      desc: "Logged in on 7 or more days.",
      earned: (profileData?.loginBonusDays || 0) >= 7,
      xp: 0,
    },
  ];
}
