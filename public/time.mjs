export function displayTimeZone(local = false) {
  return local ? Intl.DateTimeFormat().resolvedOptions().timeZone : 'UTC';
}

export function formatTimestamp(value, local = false, includeSeconds = false) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '—';
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: displayTimeZone(local), month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    ...(includeSeconds ? {second: '2-digit'} : {})
  }).formatToParts(date);
  const fields = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${fields.month}/${fields.day} ${fields.hour}:${fields.minute}${includeSeconds ? ':' + fields.second : ''}`;
}

export function publicTimestamp(label, reference = Date.now()) {
  const match = /^(\d{1,2})\/(\d{1,2}) (\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(String(label));
  if (!match) return null;
  const [month, day, hour, minute, second] = match.slice(1).map(value => Number(value ?? 0));
  const anchor = new Date(reference);
  if (!Number.isFinite(anchor.getTime())) return null;
  // The feed omits the year. Choose the nearest valid UTC date to the fetch,
  // including adjacent years so a round spanning New Year keeps its dates.
  const year = anchor.getUTCFullYear();
  const candidates = [year - 1, year, year + 1].map(y => new Date(Date.UTC(y, month - 1, day, hour, minute, second)))
    .filter(date => date.getUTCMonth() === month - 1 && date.getUTCDate() === day &&
      date.getUTCHours() === hour && date.getUTCMinutes() === minute && date.getUTCSeconds() === Number(second));
  candidates.sort((a, b) => Math.abs(a - anchor) - Math.abs(b - anchor));
  return candidates[0]?.getTime() ?? null;
}

export function formatPublicTime(label, local = false, reference = Date.now()) {
  if (!local) return label;
  const stamp = publicTimestamp(label, reference);
  return stamp === null ? label : formatTimestamp(stamp, true, /^\d{1,2}\/\d{1,2} \d{1,2}:\d{2}:\d{2}$/.test(label));
}
