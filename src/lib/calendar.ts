export interface CalendarEvent {
  id: string;
  title: string;
  start: string;   // RFC3339 or YYYY-MM-DD
  end: string;
  location?: string;
  description?: string;
  allDay: boolean;
}

const CALENDAR_ID =
  '20021f27cd27f12f731fe905472b888dee81c6b91f2f1810009e59ddf11d49ca@group.calendar.google.com';
const CACHE_KEY = 'calendar:events';
const CACHE_TTL = 15 * 60; // 15 minutes

export async function getEvents(
  env: { CALENDAR_CACHE?: KVNamespace; GOOGLE_CALENDAR_API_KEY?: string },
  maxResults = 20,
): Promise<CalendarEvent[]> {
  // Cache hit
  if (env.CALENDAR_CACHE) {
    const cached = await env.CALENDAR_CACHE.get(CACHE_KEY);
    if (cached) {
      try { return JSON.parse(cached) as CalendarEvent[]; } catch {}
    }
  }

  // No API key — return empty, site shows the empty state
  console.log('[calendar] GOOGLE_CALENDAR_API_KEY:', env.GOOGLE_CALENDAR_API_KEY ? 'present' : 'absent');
  if (!env.GOOGLE_CALENDAR_API_KEY) {
    return [];
  }

  const timeMin = new Date().toISOString();
  const url = new URL(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(CALENDAR_ID)}/events`,
  );
  url.searchParams.set('key', env.GOOGLE_CALENDAR_API_KEY);
  url.searchParams.set('timeMin', timeMin);
  url.searchParams.set('orderBy', 'startTime');
  url.searchParams.set('singleEvents', 'true');
  url.searchParams.set('maxResults', String(maxResults));

  let events: CalendarEvent[];
  try {
    const res = await fetch(url.toString());
    if (!res.ok) {
      const body = await res.text();
      console.error('[calendar] Google API error: status=%d body=%s', res.status, body);
      return [];
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: { items?: any[] } = await res.json();
    events = (data.items ?? []).map((item) => ({
      id: item.id as string,
      title: (item.summary as string | undefined) ?? 'Untitled event',
      start: (item.start?.dateTime ?? item.start?.date ?? '') as string,
      end: (item.end?.dateTime ?? item.end?.date ?? '') as string,
      location: item.location as string | undefined,
      description: item.description as string | undefined,
      allDay: !item.start?.dateTime,
    }));
  } catch (err) {
    console.error('[calendar] fetch threw:', err);
    return [];
  }

  if (env.CALENDAR_CACHE) {
    await env.CALENDAR_CACHE.put(CACHE_KEY, JSON.stringify(events), { expirationTtl: CACHE_TTL });
  }

  return events;
}

export function formatEventDate(start: string, end: string, allDay: boolean): string {
  const opts: Intl.DateTimeFormatOptions = {
    timeZone: 'America/New_York',
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  };
  if (allDay) {
    // Date-only strings need a noon anchor so timezone shift doesn't flip the day
    const d = new Date(`${start}T12:00:00`);
    return d.toLocaleDateString('en-US', opts);
  }
  const s = new Date(start);
  const e = new Date(end);
  const dateStr = s.toLocaleDateString('en-US', opts);
  const timeOpts: Intl.DateTimeFormatOptions = {
    timeZone: 'America/New_York',
    hour: 'numeric',
    minute: '2-digit',
  };
  const startTime = s.toLocaleTimeString('en-US', { ...timeOpts, timeZoneName: 'short' });
  const endTime = e.toLocaleTimeString('en-US', timeOpts);
  return `${dateStr} · ${startTime} – ${endTime}`;
}
