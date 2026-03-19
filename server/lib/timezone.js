import { readSettings } from './fileStore.js';

export function getTimezone() {
  const settings = readSettings();
  return settings.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
}

export function startOfDayInTz(date, tz) {
  const str = date.toLocaleDateString('en-CA', { timeZone: tz });
  return new Date(str + 'T00:00:00');
}

export function startOfWeekInTz(date, tz) {
  const day = startOfDayInTz(date, tz);
  const dow = day.getDay();
  day.setDate(day.getDate() - dow);
  return day;
}

export function startOfMonthInTz(date, tz) {
  const str = date.toLocaleDateString('en-CA', { timeZone: tz });
  const [y, m] = str.split('-');
  return new Date(`${y}-${m}-01T00:00:00`);
}

export function isoToDateInTz(iso) {
  const tz = getTimezone();
  return new Date(iso).toLocaleDateString('en-CA', { timeZone: tz });
}
