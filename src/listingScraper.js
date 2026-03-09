'use strict';

/**
 * listingScraper.js
 * Iterates over paginated search-result pages and extracts listing cards.
 */

const { navigate, sleep }       = require('./browser');
const { parsePrice, parseDownPayment, parseArea, parseLocation, parseMemberSince, extractAdId } = require('./parsers');
const logger                    = require('./logger');

// ── URL builder ──────────────────────────────────────────────────────────────

const BASE_URL = 'https://www.dubizzle.com.eg/en/properties/';

/**
 * Build paginated URL.
 * Dubizzle uses ?page=N  (1-indexed)
 */
function buildPageUrl(category = '', page = 1) {
  const base = category
    ? `https://www.dubizzle.com.eg/en/properties/${category}/`
    : BASE_URL;
  return page > 1 ? `${base}?page=${page}` : base;
}

// ── Card selectors ─────────────────────────────────────────────────────────

/**
 * Extract all listing cards from the current page DOM.
 * Uses aria-label attributes which are stable across Dubizzle's CSS-module class renames.
 * Returns an array of partial listing objects (hints) + the full URL.
 */
async function extractCards(page) {
  return page.evaluate(() => {
    const results = [];
    const seen    = new Set();

    // Each listing lives inside an <article> inside a <li aria-label="Listing">
    const articles = Array.from(document.querySelectorAll('li[aria-label="Listing"] article, article'));

    for (const card of articles) {
      // ── URL ────────────────────────────────────────────────────────────────
      // The title link is the most reliable anchor
      const titleAnchor = card.querySelector('a[href*="/en/ad/"]');
      if (!titleAnchor) continue;
      const url = titleAnchor.href;
      if (seen.has(url)) continue;
      seen.add(url);

      // ── Title ──────────────────────────────────────────────────────────────
      const titleEl = card.querySelector('[aria-label="Title"] h2, [aria-label="Title"]');
      const title   = titleEl ? titleEl.innerText.trim() : (titleAnchor.title || null);

      // ── Price ──────────────────────────────────────────────────────────────
      const priceEl  = card.querySelector('[aria-label="Price"]');
      const rawPrice = priceEl ? priceEl.innerText.trim() : null;

      // Down payment (sibling text node like "EGP 655,600 Down Payment")
      const dpEl  = card.querySelector('[aria-label="Down Payment"], [aria-label*="down payment" i]');
      const rawDP = dpEl ? dpEl.innerText.trim() : null;

      // ── Subtitle stats: beds, baths, area ──────────────────────────────────
      const bedsEl  = card.querySelector('[aria-label="Beds"] span:last-child, span[aria-label="Beds"]');
      const bathsEl = card.querySelector('[aria-label="Bathrooms"] span:last-child, span[aria-label="Bathrooms"]');
      const areaEl  = card.querySelector('[aria-label="Area"] span:last-child, span[aria-label="Area"]');

      // ── Location & date ────────────────────────────────────────────────────
      const locEl     = card.querySelector('[aria-label="Location"]');
      const rawLoc    = locEl ? locEl.innerText.replace(/•.*/, '').trim() : null;

      const dateEl    = card.querySelector('[aria-label="Creation date"], time');
      const posted_at = dateEl ? dateEl.innerText.trim() : null;

      // ── Seller ─────────────────────────────────────────────────────────────
      const agencyNameEl = card.querySelector('[aria-label="Agency Name"], [aria-label="Seller Name"]');
      const seller_name  = agencyNameEl ? agencyNameEl.innerText.trim() : null;

      const memberSinceEl = card.querySelector('[aria-label="Member Since"]');
      const member_since  = memberSinceEl ? memberSinceEl.innerText.trim() : null;

      const verifiedEl      = card.querySelector('img[src*="iconVerified"], [aria-label*="Verified"]');
      const seller_verified = verifiedEl ? 1 : 0;

      // ── Ad tier ────────────────────────────────────────────────────────────
      const tierEl  = card.querySelector('[aria-label*="Elite" i], [aria-label*="Featured" i]');
      const rawTier = tierEl
        ? tierEl.innerText.trim().toLowerCase()
        : (card.innerText.match(/\b(elite|featured)\b/i)?.[1] ?? '').toLowerCase();
      const ad_tier = rawTier === 'elite' ? 'elite' : rawTier === 'featured' ? 'featured' : 'standard';

      results.push({
        url,
        title,
        rawPrice,
        rawDP,
        rawArea: areaEl ? areaEl.innerText.trim() : null,
        rawLoc,
        posted_at,
        seller_name,
        member_since,
        seller_verified,
        ad_tier,
        bedsText:  bedsEl  ? bedsEl.innerText.trim()  : null,
        bathsText: bathsEl ? bathsEl.innerText.trim() : null,
      });
    }

    return results;
  });
}

/**
 * Get the canonical URL the browser landed on after navigation.
 * Dubizzle redirects out-of-range page numbers back to page 1.
 */
async function getCurrentUrl(page) {
  return page.evaluate(() => window.location.href);
}

// ── Exported crawler ─────────────────────────────────────────────────────────

/**
 * Iterate over listing pages for a given category, yielding card objects.
 *
 * Dubizzle has no numbered pagination widget — it uses ?page=N URLs.
 * End-of-results is detected by two signals:
 *   1. The browser was redirected away from the requested URL (out-of-range page).
 *   2. Every ad ID on the page was already seen on a previous page (duplicate page).
 *
 * @param {import('puppeteer').Page} page   - Puppeteer page
 * @param {string}  category               - URL slug, e.g. "apartments-duplex-for-sale"
 * @param {Object}  options
 * @param {number}  options.startPage       - First page to scrape (default 1)
 * @param {number}  options.maxPages        - Max pages to scrape (default Infinity)
 * @param {number}  options.delayMs         - Delay between pages in ms (default 1500)
 * @yields {Object}  Partial listing object (hint for detail scraper)
 */
async function* crawlListingPages(page, category = '', options = {}) {
  const {
    startPage = 1,
    maxPages  = Infinity,
    delayMs   = 1500,
  } = options;

  let currentPage  = startPage;
  let pagesScraped = 0;
  // Track all ad IDs seen so far to detect redirect-back-to-page-1 duplicates
  const seenIds = new Set();

  while (pagesScraped < maxPages) {
    const requestedUrl = buildPageUrl(category, currentPage);
    logger.info(`Fetching listing page ${currentPage}: ${requestedUrl}`);

    try {
      await navigate(page, requestedUrl);
      await sleep(800 + Math.random() * 500);
    } catch (err) {
      logger.error(`Failed to load listing page ${currentPage}: ${err.message}`);
      break;
    }

    // ── Redirect detection ───────────────────────────────────────────────────
    // Dubizzle redirects out-of-range ?page=N back to the base URL (page 1).
    const landedUrl = await getCurrentUrl(page);
    const expectedPageParam = currentPage > 1 ? `page=${currentPage}` : null;
    if (expectedPageParam && !landedUrl.includes(expectedPageParam)) {
      logger.info(`Redirected to ${landedUrl} — reached end of results after ${pagesScraped} page(s)`);
      break;
    }

    const cards = await extractCards(page);
    logger.info(`  Found ${cards.length} cards on page ${currentPage}`);

    if (cards.length === 0) {
      logger.info('No cards on page — stopping pagination');
      break;
    }

    // ── Duplicate-page detection ─────────────────────────────────────────────
    // Extract the ad IDs from this page's URLs
    const pageIds = cards.map(c => extractAdId(c.url)).filter(Boolean);
    const newIds  = pageIds.filter(id => !seenIds.has(id));

    if (pageIds.length > 0 && newIds.length === 0) {
      logger.info(`All ${pageIds.length} ads on page ${currentPage} already seen — end of unique results`);
      break;
    }

    pageIds.forEach(id => seenIds.add(id));

    // ── Yield enriched cards ─────────────────────────────────────────────────
    for (const card of cards) {
      const { price, price_currency, price_period } = parsePrice(card.rawPrice ?? '');
      const down_payment  = parseDownPayment(card.rawDP ?? '');
      const area_sqm      = parseArea(card.rawArea ?? '');
      const loc           = parseLocation(card.rawLoc ?? '');
      const member_since  = parseMemberSince(card.member_since ?? '');
      const bedrooms      = card.bedsText  ? parseInt(card.bedsText)  || null : null;
      const bathrooms     = card.bathsText ? parseInt(card.bathsText) || null : null;

      yield {
        url:              card.url,
        title:            card.title,
        rawPrice:         card.rawPrice,
        price,
        price_currency,
        price_period,
        down_payment,
        area_sqm,
        bedrooms,
        bathrooms,
        ...loc,
        posted_at:        card.posted_at,
        seller_name:      card.seller_name,
        seller_verified:  card.seller_verified,
        member_since,
        ad_tier:          card.ad_tier,
      };
    }

    pagesScraped++;
    currentPage++;
    await sleep(delayMs + Math.random() * 1000);
  }

  logger.info(`Pagination complete — scraped ${pagesScraped} page(s), ${seenIds.size} unique listing(s) found`);
}

module.exports = { crawlListingPages, buildPageUrl };
