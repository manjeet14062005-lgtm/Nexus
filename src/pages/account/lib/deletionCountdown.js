// deletionCountdown.js — Pure helpers for account deletion countdown display.

/**
 * Given an executeAfter ISO timestamp, returns formatted countdown info.
 */
export function getDeletionCountdown(executeAfter) {
  if (!executeAfter) return null;

  const now = Date.now();
  const target = new Date(executeAfter).getTime();

  if (!Number.isFinite(target)) return null;

  const diffMs = target - now;
  if (diffMs <= 0) {
    return { expired: true, days: 0, hours: 0, minutes: 0, label: "Deletion overdue", urgent: true };
  }

  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

  const parts = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (days === 0) parts.push(`${minutes}m`);

  return {
    expired: false,
    days,
    hours,
    minutes,
    label: parts.join(" ") + " remaining",
    urgent: days < 1,
    formattedDate: new Date(executeAfter).toLocaleString(),
  };
}
