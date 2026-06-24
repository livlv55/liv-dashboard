// Scrapes TAO Group's WordPress REST API for upcoming competitor events.
// Paginates through all events per venue since titles sort alphabetically
// (not by date), so early months fill the first page.
// Wynn (XS, EBC at Night, EBC) and Zouk are JS-rendered/blocked — manual only.
// Writes competitor-data.json to repo root.

import { writeFileSync } from 'fs';

const TAO_BASE = 'https://taogroup.com/wp-json/wp/v2/events';
const PAGE_SIZE = 100;

const TAO_VENUES = [
  { slug: 'omnia',       venueId: 313,  name: 'OMNIA Nightclub'   },
  { slug: 'hakkasan',    venueId: 314,  name: 'Hakkasan'          },
  { slug: 'marquee',     venueId: 122,  name: 'Marquee Nightclub' },
  { slug: 'omniaday',    venueId: 1006, name: 'OMNIA Dayclub'     },
  { slug: 'palmtree',    venueId: 895,  name: 'Palm Tree Beach'   },
  { slug: 'taobeach',    venueId: 325,  name: 'Tao Beach'         },
  { slug: 'marqdayclub', venueId: 263,  name: 'Marquee Dayclub'   },
];

function parseEventTitle(rendered) {
  // Title format: "6/27/2026 &#8211; Artist Name &#8211; Venue"
  const clean = rendered
    .replace(/&#8211;/g, '–')
    .replace(/&amp;/g, '&')
    .replace(/&#\d+;/g, '')
    .replace(/<[^>]+>/g, '');
  const parts = clean.split('–').map(s => s.trim());
  if (parts.length < 2) return null;

  const m = parts[0].match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!m) return null;

  const dateStr = `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`;
  const artist  = parts[1] || '';
  return { dateStr, artist };
}

async function fetchAllVenueEvents(venue, today) {
  let page = 1;
  let total = null;
  const upcoming = [];

  while (true) {
    const url = `${TAO_BASE}?per_page=${PAGE_SIZE}&page=${page}&event_venue=${venue.venueId}&_fields=title`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; LIV-Dashboard-Scraper/1.0)' },
    });

    if (!res.ok) {
      console.warn(`  [${venue.slug}] page ${page} → HTTP ${res.status}`);
      break;
    }

    // WP REST returns X-WP-Total on first page
    if (total === null) {
      total = parseInt(res.headers.get('x-wp-total') || '0', 10);
    }

    const events = await res.json();
    if (!events.length) break;

    for (const evt of events) {
      const parsed = parseEventTitle(evt.title?.rendered || '');
      if (!parsed) continue;
      if (parsed.dateStr >= today) {
        upcoming.push(parsed);
      }
    }

    const fetched = (page - 1) * PAGE_SIZE + events.length;
    if (fetched >= total) break;
    page++;
    await new Promise(r => setTimeout(r, 200));
  }

  console.log(`  [${venue.slug}] ${upcoming.length} upcoming (scanned ${total} total)`);
  return upcoming;
}

async function main() {
  const today = new Date().toISOString().slice(0, 10);
  console.log(`Scraping TAO Group venues (today = ${today})...`);

  const output = {
    updated: new Date().toISOString(),
    note: 'TAO Group venues auto-scraped. Wynn (XS, EBC at Night, EBC) and Zouk require manual entry.',
    events: {},
  };

  for (const venue of TAO_VENUES) {
    console.log(`Fetching ${venue.name}...`);
    try {
      const events = await fetchAllVenueEvents(venue, today);
      for (const { dateStr, artist } of events) {
        if (!output.events[dateStr]) output.events[dateStr] = {};
        output.events[dateStr][venue.slug] = { artist, source: 'tao-api' };
      }
    } catch (err) {
      console.warn(`  [${venue.slug}] Error: ${err.message}`);
    }
  }

  const totalEntries = Object.values(output.events)
    .reduce((n, d) => n + Object.keys(d).length, 0);
  const totalDates = Object.keys(output.events).length;

  console.log(`\nDone: ${totalEntries} competitor slots across ${totalDates} dates.`);
  writeFileSync('competitor-data.json', JSON.stringify(output, null, 2));
  console.log('Wrote competitor-data.json');
}

main().catch(e => { console.error(e); process.exit(1); });
