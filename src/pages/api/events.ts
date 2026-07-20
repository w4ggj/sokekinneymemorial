import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { getEvents } from '../../lib/calendar';

export const GET: APIRoute = async () => {
  const events = await getEvents(env);
  return new Response(JSON.stringify(events), {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=900',
    },
  });
};
