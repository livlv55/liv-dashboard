// Scrapes TAO Group's WordPress REST API for upcoming competitor events.
// Wynn (XS, EBC at Night, EBC) and Zouk are JS-rendered / blocked — manual only.
// Writes competitor-data.json to repo root for the dashboard to consume.

import { writeFileSync } from 'fs';

const TAO_BASE = 'https://taogroup.com/wp-json/wp/v2/events';

const TAO_VENUES = [
  // LIV Las Vegas competitors
  { slug: 'omnia',    venueId: 313,  name: 'OMNIA',           livType: 'liv'   },
  { slug: 'hakkasan', venueId: 314,  name: 'Hakkasan',         livType: 'liv'   },
  { slug: 'marquee',  venueId: 122,  name: 'Marquee',          livType: 'liv'   },
  // LIV Beach competitors
  { slug: 'omniaday', venueId: 1006, name: 'OMNIA Dayclub',    livType: 'beach' },
  { slug: 'palmtree', venueId: 895,  name: 'Palm Tree Beach',  livType: 'beach' },
  { slug: 'taobeach', venueId: 325,  name: 'Tao Beach',        livType: 'beach' },
  { slug: 'marqdayclub', venueId: 263, name: 'Marquee Dayclub', livType: 'beach' },
];

function parseEventDate(rendered) {
  // Title format: "6/27/2026 – Artist Name – Venue"
  const clean = rendered.replace(/&#8211;/g, '–').replace(/&amp;/g, '&').replace(/&#\d+;/g, '');
  const parts = clean.split('–').map(s => s.trim());
  if (parts.length < 2) return null;

  const datePart = parts[0];
  const artist = parts[1] || '';

  // Parse M/D/YYYY
  const m = datePart.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!m) return null;

  const dateStr = `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`;
  return { dateStr, artist };
}

async function fetchVenueEvents(venue) {
  const today = new Date().toISOString().slice(0, 10);
  const url = `${TAO_BASE}?per_page=50&event_venue=${venue.venueId}&_fields=title&orderby=title&order=asc`;

  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; LIV-Dashboard-Scraper/1.0)' }
  });

  if (!res.ok) {
    console.warn(`  [${venue.slug}] HTTP ${res.status}`);
    return [];
  }

  const events = await res.json();
  const results = [];

  for (const evt of events) {
    const rendered = evt.title?.rendered || '';
    const parsed = parseEventDate(rendered);
    if (!parsed) continue;
    if (parsed.dateStr < today) continue; // skip past events
    results.push({
      date: parsed.dateStr,
      artist: parsed.artist,
    });
  }

  console.log(`  [${venue.slug}] ${results.length} upcoming events`);
  return results;
}

async function main() {
  console.log('Scraping TAO Group venues...');
  const output = {
    updated: new Date().toISOString(),
    note: 'TAO Group venues only. Wynn (XS, EBC at Night, EBC) and Zouk require manual entry.',
    events: {},
  };

  for (const venue of TAO_VENUES) {
    console.log(`Fetching ${venue.name} (venue ${venue.venueId})...`);
    try {
      const events = await fetchVenueEvents(venue);
      for (const { date, artist } of events) {
        if (!output.events[date]) output.events[date] = {};
        output.events[date][venue.slug] = { artist, source: 'tao-api' };
      }
    } catch (err) {
      console.warn(`  [${venue.slug}] Error: ${err.message}`);
    }
    await new Promise(r => setTimeout(r, 300)); // polite delay
  }

  const count = Object.values(output.events).reduce((n, d) => n + Object.keys(d).length, 0);
  console.log(`\nDone. ${count} competitor events across ${Object.keys(output.events).length} dates.`);
  writeFileSync('competitor-data.json', JSON.stringify(output, null, 2));
  console.log('Wrote competitor-data.json');
}

main().catch(e => { console.error(e); process.exit(1); });
