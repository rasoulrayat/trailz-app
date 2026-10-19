import type { Env } from "../env";
import { isMock } from "../env";
import { placeKey } from "./route";
import { logError } from "./store";
import { getMetadata, SupadataError } from "./supadata";

const MAX_IMAGE_BYTES = 1_500_000;

/** Download an image once and keep it in D1, served from /api/img/:key. */
export async function storeImage(db: D1Database, key: string, sourceUrl: string, fetcher: typeof fetch = fetch) {
  const res = await fetcher(sourceUrl, { headers: { "user-agent": "Mozilla/5.0 (compatible; TrailZ/0.1)" } });
  const type = res.headers.get("content-type") ?? "";
  if (!res.ok || !type.startsWith("image/")) throw new Error(`image ${res.status} ${type}`);
  const bytes = await res.arrayBuffer();
  if (bytes.byteLength > MAX_IMAGE_BYTES) throw new Error(`image too big (${bytes.byteLength})`);
  await db
    .prepare("INSERT OR REPLACE INTO images (key, content_type, bytes, created_at) VALUES (?, ?, ?, ?)")
    .bind(key, type.split(";")[0], bytes, Date.now())
    .run();
  return `/api/img/${encodeURIComponent(key)}`;
}

/**
 * Fill in a video's cover image (and title/creator when missing). Runs once per video, after
 * the response is sent. thumbnail_url: NULL = not tried yet, "" = tried, nothing found.
 */
export async function fillVideoMeta(env: Env, videoId: string, knownThumb?: string | null) {
  const claim = await env.DB.prepare("UPDATE videos SET thumbnail_url = '' WHERE id = ? AND thumbnail_url IS NULL")
    .bind(videoId)
    .run();
  if ((claim.meta.changes ?? 0) !== 1) return;
  const v = await env.DB.prepare("SELECT url, title, author FROM videos WHERE id = ?")
    .bind(videoId)
    .first<{ url: string; title: string | null; author: string | null }>();
  if (!v) return;

  let thumb = knownThumb ?? undefined;
  let title: string | undefined;
  let author: string | undefined;
  try {
    if (!thumb && !isMock(env) && env.SUPADATA_API_KEY) {
      const meta = await metadataWithRetry(env.SUPADATA_API_KEY, v.url);
      thumb = meta.thumbnailUrl;
      title = meta.title;
      author = meta.author;
      // The paid metadata call answered: keep title and creator now, whatever happens to the cover.
      if (title || author) {
        await env.DB.prepare("UPDATE videos SET title = COALESCE(title, ?), author = COALESCE(author, ?) WHERE id = ?")
          .bind(title ?? null, author ?? null, videoId)
          .run();
      }
    }
  } catch (err) {
    // Busy or a passing error: let the next visit try again. Other errors: give up on this cover.
    const busy = err instanceof SupadataError && (err.httpStatus === 429 || err.httpStatus >= 500);
    if (busy) await env.DB.prepare("UPDATE videos SET thumbnail_url = NULL WHERE id = ?").bind(videoId).run();
    throw err;
  }
  let stored = "";
  try {
    stored = thumb ? await storeImage(env.DB, `v-${videoId}`, thumb) : "";
  } catch (err) {
    // The image itself couldn't be copied (not an image, too big, CDN hiccup): try again on a later visit.
    await env.DB.prepare("UPDATE videos SET thumbnail_url = NULL WHERE id = ?").bind(videoId).run();
    throw err;
  }
  await env.DB.prepare("UPDATE videos SET thumbnail_url = ? WHERE id = ?").bind(stored, videoId).run();
}

/** Supadata allows about 1 request per second, and a new check has just started an Extract job. */
async function metadataWithRetry(apiKey: string, url: string) {
  const waits = [1200, 2500, 5000];
  for (let i = 0; ; i++) {
    await new Promise((r) => setTimeout(r, waits[Math.min(i, waits.length - 1)]));
    try {
      return await getMetadata(apiKey, url);
    } catch (err) {
      if (!(err instanceof SupadataError && err.httpStatus === 429) || i >= waits.length - 1) throw err;
    }
  }
}

export interface PlacePhoto {
  url: string;
  /** Who took it and under which licence, when Wikimedia says. */
  credit: string | null;
  license: string | null;
  /** Page to credit / read more. */
  link: string | null;
}

export interface PlaceGallery {
  photos: PlacePhoto[];
  /** The Wikipedia article about the place, if found. */
  pageUrl: string | null;
}

// Images that aren't photos of the place.
const NOT_A_PHOTO = /\.svg|\.tif|\.pdf|flag_of|coat_of_arms|wappen|blason|locator|location_map|_map[._ ]|map_of|\bmap\b|logo|diagram|plan_of|stamp/i;
const MAX_PHOTOS = 8;
const GALLERY_TTL = 30 * 24 * 60 * 60 * 1000;

const stripHtml = (html: unknown) =>
  typeof html === "string"
    ? html.replace(/<[^>]*>/g, "").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/\s+/g, " ").trim().slice(0, 80) || null
    : null;

/**
 * Up to 8 openly licensed photos of a place: the Wikipedia article's main image plus
 * Wikimedia Commons search results whose file name mentions the place. Cached in D1 for 30 days.
 */
export async function placeGallery(
  db: D1Database,
  contact: string,
  query: string,
  fetcher: typeof fetch = fetch,
): Promise<PlaceGallery> {
  const key = placeKey(query);
  if (!key) return { photos: [], pageUrl: null };
  const cached = await db
    .prepare("SELECT json, created_at FROM place_galleries WHERE query = ?")
    .bind(key)
    .first<{ json: string; created_at: number }>();
  if (cached && Date.now() - cached.created_at < GALLERY_TTL) return JSON.parse(cached.json) as PlaceGallery;

  const name = query.split(",")[0].trim();
  // The name's first meaningful word ("digue" for La Digue, "moritz" for St. Moritz), matched as a whole word.
  const SMALL = new Set(["la", "le", "les", "el", "los", "las", "the", "st", "san", "santa", "saint", "de", "del", "da", "di", "isle", "of", "ko", "koh", "mount", "mt", "lake"]);
  const words = placeKey(name).split(" ").filter(Boolean);
  const first = words.find((w) => w.length > 2 && !SMALL.has(w)) ?? words[0] ?? "";
  // A file mentions the place when a word starts with that token ("Flåmsbana" for Flåm) or the whole compact name
  // appears ("ladigue"); a bare "la"/"st" inside another word does not count.
  const compact = words.join("");
  const mentions = (title: string) => {
    const t = placeKey(title);
    return (!!first && new RegExp(`(^|\\s)${first}`).test(t)) || (compact.length > 3 && t.replace(/\s/g, "").includes(compact));
  };
  const headers = { "user-agent": `TrailZ/0.1 (https://github.com/rasoulrayat/trailz-app; ${contact})` };
  const gallery: PlaceGallery = { photos: [], pageUrl: null };
  const add = (p: PlacePhoto) => {
    if (gallery.photos.length < MAX_PHOTOS && !NOT_A_PHOTO.test(p.url) && !gallery.photos.some((x) => x.url === p.url)) {
      gallery.photos.push(p);
    }
  };
  let failed = 0;

  // 1. Wikipedia: the article's lead image.
  try {
    const res = await fetcher(
      "https://en.wikipedia.org/w/api.php?action=query&format=json&formatversion=2&generator=search&gsrnamespace=0&gsrlimit=3" +
        `&prop=pageimages|info&piprop=thumbnail&pithumbsize=1000&inprop=url&gsrsearch=${encodeURIComponent(query)}`,
      { headers },
    );
    if (!res.ok) throw new Error(`Wikipedia ${res.status}`);
    const body = (await res.json()) as {
      query?: { pages?: { index?: number; title: string; fullurl?: string; thumbnail?: { source: string } }[] };
    };
    const pages = [...(body.query?.pages ?? [])].sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
    const page = pages.find((p) => mentions(p.title));
    if (page) {
      gallery.pageUrl = page.fullurl ?? null;
      if (page.thumbnail) add({ url: page.thumbnail.source, credit: null, license: null, link: page.fullurl ?? null });
    }
  } catch (err) {
    failed++;
    await logError(db, "place-photos", err, query);
  }

  // 2. Wikimedia Commons: more photos, with photographer and licence.
  try {
    const res = await fetcher(
      "https://commons.wikimedia.org/w/api.php?action=query&format=json&formatversion=2&generator=search&gsrnamespace=6&gsrlimit=20" +
        "&prop=imageinfo&iiprop=url|mime|extmetadata&iiurlwidth=1000&iiextmetadatafilter=Artist|LicenseShortName" +
        `&gsrsearch=${encodeURIComponent(`${query.replace(/,/g, " ")} filetype:bitmap`)}`,
      { headers },
    );
    if (!res.ok) throw new Error(`Commons ${res.status}`);
    const body = (await res.json()) as {
      query?: {
        pages?: {
          index?: number;
          title: string;
          imageinfo?: {
            thumburl?: string;
            mime?: string;
            descriptionurl?: string;
            extmetadata?: { Artist?: { value?: string }; LicenseShortName?: { value?: string } };
          }[];
        }[];
      };
    };
    // Files named after the place first ("Mount Fuji from Kawaguchiko"), then the rest in search order.
    const startsWithPlace = (t: string) => placeKey(t.replace(/^File:/i, "")).startsWith(placeKey(name));
    const files = [...(body.query?.pages ?? [])].sort(
      (a, b) => Number(startsWithPlace(b.title)) - Number(startsWithPlace(a.title)) || (a.index ?? 0) - (b.index ?? 0),
    );
    for (const f of files) {
      const info = f.imageinfo?.[0];
      if (!info?.thumburl || info.mime !== "image/jpeg") continue;
      if (!mentions(f.title) || NOT_A_PHOTO.test(f.title)) continue;
      add({
        url: info.thumburl,
        credit: stripHtml(info.extmetadata?.Artist?.value),
        license: stripHtml(info.extmetadata?.LicenseShortName?.value),
        link: info.descriptionurl ?? null,
      });
    }
  } catch (err) {
    failed++;
    await logError(db, "place-photos", err, query);
  }

  // Don't remember an empty result caused by an outage.
  if (failed === 0 || gallery.photos.length > 0) {
    await db
      .prepare("INSERT OR REPLACE INTO place_galleries (query, json, created_at) VALUES (?, ?, ?)")
      .bind(key, JSON.stringify(gallery), Date.now())
      .run();
  }
  return gallery;
}
