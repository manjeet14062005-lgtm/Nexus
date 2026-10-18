import { XP_LEVELS } from "../core/appConstants.js";

export function getLevel(xp) {
  return XP_LEVELS.find((l) => xp >= l.min && xp <= l.max) || XP_LEVELS[0];
}


export function calcXP(data) {
  if (!data) return 0;
  let total = 0;
  if (data.name || data.email)  total += 100; // registered
  if (data.photoUrl)            total += 30;
  if (data.phoneVerified)       total += 50;
  if (data.linkedin)            total += 20;
  if (data.bio)                 total += 20;
  // daily login bonus stored in the Nexus database
  total += (data.loginBonusDays || 0) * 10;
  return total;
}

// XP Level Badge shown in header

