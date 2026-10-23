const ACTIVE_WINDOW = 5 * 60 * 1000;

export function imageActivity(id, activeTeams, activityAt, now = Date.now()) {
  if (!Array.isArray(activeTeams) || !activityAt || now - activityAt >= ACTIVE_WINDOW) return null;
  return activeTeams.includes(String(id));
}

export function livePlayTime(seconds, id, fetchedAt, activeTeams, activityAt, now = Date.now()) {
  if (!Number.isFinite(seconds) || !fetchedAt || !activityAt || !Array.isArray(activeTeams) || !activeTeams.includes(String(id))) return seconds;
  // Stop extrapolating when activity data becomes stale, including after sleep.
  const elapsed = Math.max(0, Math.floor((Math.min(now, activityAt + ACTIVE_WINDOW) - fetchedAt) / 1000));
  return seconds + elapsed;
}
