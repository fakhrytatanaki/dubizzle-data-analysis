'use strict';

/**
 * detailScraper.js
 * Visits a single listing page and extracts the full dataset.
 * Uses stable aria-label attributes rather than hashed CSS class names.
 */

const { navigate, sleep }   = require('./browser');
const {
  extractAdId,
  parsePrice,
  parseDownPayment,
  parseArea,
  inferListingType,
  inferPropertyType,
  parseLocation,
  parseMemberSince,
} = require('./parsers');
const logger = require('./logger');

// ── Helpers ──────────────────────────────────────────────────────────────────

async function safeText(page, selector) {
  try {
    return await page.$eval(selector, el => el.innerText.trim());
  } catch {
    return null;
  }
}

async function safeAttr(page, selector, attr) {
  try {
    return await page.$eval(selector, (el, a) => el.getAttribute(a), attr);
  } catch {
    return null;
  }
}

/**
 * Get text by aria-label attribute value (exact match).
 */
async function ariaText(page, label) {
  return safeText(page, `[aria-label="${label}"]`);
}

// ── Attribute block parser ────────────────────────────────────────────────────

/**
 * Parse a block of text like:
 *   "Type\nTown House\nOwnership\nResale\nArea (m²)\n205\nBedrooms\n3\nBathrooms\n4\nFurnished\nNo"
 * into a key-value map.
 */
function parseAttributeBlock(text) {
  if (!text) return {};
  let lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  // Strip leading section header (e.g. "Details", "Highlighted Details")
  if (lines.length > 0 && /^(Details|Highlighted Details|Overview|Features)$/i.test(lines[0])) {
    lines = lines.slice(1);
  }
  const result = {};
  for (let i = 0; i + 1 < lines.length; i += 2) {
    result[lines[i]] = lines[i + 1];
  }
  return result;
}

// ── Main extractor ───────────────────────────────────────────────────────────

/**
 * Scrape a detail page and return a structured listing object.
 * @param {import('puppeteer').Page} page - Already-navigated page
 * @param {string} url
 * @param {Object} [hint]  - Partial data already known from the listing card
 * @returns {Object}
 */
async function scrapeDetailPage(page, url, hint = {}) {
  const id = extractAdId(url);
  if (!id) {
    logger.warn(`Could not extract ad ID from URL: ${url}`);
    return null;
  }

  const scraped_at = new Date().toISOString();

  // ── Title ──────────────────────────────────────────────────────────────────
  const title = (await safeText(page, 'h1')) ?? hint.title ?? null;

  // ── Price ──────────────────────────────────────────────────────────────────
  const rawPrice = (await ariaText(page, 'Price')) ?? hint.rawPrice ?? '';
  const { price, price_currency, price_period: detectedPeriod } = parsePrice(rawPrice);

  // Period (monthly/yearly) sometimes in a sibling element
  const rawPeriod    = await safeText(page, '[aria-label="Period"], [aria-label="Rent period"]');
  const price_period = detectedPeriod
    || (rawPeriod && /monthly|yearly|weekly/i.test(rawPeriod) ? rawPeriod.trim() : null)
    || hint.price_period
    || null;

  // Down payment
  const rawDP        = await ariaText(page, 'Down Payment');
  const down_payment = parseDownPayment(rawDP) ?? hint.down_payment ?? null;

  // Negotiable flag
  const isNegotiableEl = await page.$('[aria-label="Negotiable"], [aria-label*="negotiable" i]');
  const is_negotiable  = isNegotiableEl ? 1 : (hint.is_negotiable ?? 0);

  // ── Description ───────────────────────────────────────────────────────────
  const rawDescription = await ariaText(page, 'Description');
  // Strip the "Description" header line if present
  const description = rawDescription
    ? rawDescription.replace(/^Description\s*/i, '').trim()
    : null;

  // ── Location ──────────────────────────────────────────────────────────────
  const rawLocation  = (await ariaText(page, 'Location')) ?? hint.full_location ?? '';
  const { compound, city, governorate, full_location } = parseLocation(rawLocation);

  // ── Posted at ─────────────────────────────────────────────────────────────
  const posted_at = (await ariaText(page, 'Creation date')) ?? hint.posted_at ?? null;

  // ── Attributes from "Highlighted Details" block ───────────────────────────
  const highlightedRaw = await ariaText(page, 'Highlighted Details');
  const detailsRaw     = await ariaText(page, 'Details');

  const highlighted = parseAttributeBlock(highlightedRaw);
  const details     = parseAttributeBlock(detailsRaw);
  const allAttrs    = { ...highlighted, ...details };

  // Map known keys → schema fields
  let bedrooms     = parseInt(await ariaText(page, 'Bedrooms'))
                     || parseInt(highlighted['Bedrooms'])
                     || hint.bedrooms || null;
  let bathrooms    = parseInt(await ariaText(page, 'Bathrooms'))
                     || parseInt(highlighted['Bathrooms'])
                     || hint.bathrooms || null;
  let area_sqm     = parseArea(await ariaText(page, 'Area'))
                     || parseFloat(highlighted['Area (m²)'] ?? highlighted['Area'])
                     || hint.area_sqm || null;

  const floor_number  = parseInt(allAttrs['Floor Number'] ?? allAttrs['Floor']) || null;
  const total_floors  = parseInt(allAttrs['Total Floors'] ?? allAttrs['No. of floors']) || null;
  const furnished_val = allAttrs['Furnished'] ?? null;
  const furnished     = furnished_val
    ? (furnished_val.toLowerCase() === 'yes' ? 'Furnished'
       : furnished_val.toLowerCase() === 'no' ? 'Unfurnished'
       : furnished_val)
    : null;

  // Extra attributes = everything not already mapped
  const KNOWN_KEYS = new Set(['Type','Ownership','Area (m²)','Area','Bedrooms','Bathrooms',
    'Furnished','Floor Number','Floor','Total Floors','No. of floors',
    'Payment Option','Completion status','Details']);
  const extraAttributes = Object.fromEntries(
    Object.entries(allAttrs).filter(([k]) => !KNOWN_KEYS.has(k))
  );

  // ── Seller info ───────────────────────────────────────────────────────────
  const sellerDescRaw   = (await ariaText(page, 'Seller description')) ?? '';

  // The seller block text looks like:
  // "Listed by agency\nElement Real Estate\nMember since Nov 2024\nSee profile…"
  const sellerLines     = sellerDescRaw.split('\n').map(l => l.trim()).filter(Boolean);
  const agencyIdx       = sellerLines.findIndex(l => /listed by/i.test(l));
  const seller_name     = agencyIdx >= 0 ? sellerLines[agencyIdx + 1] : (hint.seller_name ?? null);
  const memberLine      = sellerLines.find(l => /member since/i.test(l));
  const member_since    = parseMemberSince(memberLine ?? '') ?? hint.member_since ?? null;

  const seller_profile_url = await safeAttr(page, '[aria-label="See profile"]', 'href')
    ?? await safeAttr(page, 'a[href*="/companies/"]', 'href')
    ?? null;

  const verifiedEl      = await page.$('img[src*="iconVerified"], [aria-label*="Verified"]');
  const seller_verified = verifiedEl ? 1 : (hint.seller_verified ?? 0);
  const seller_type     = seller_profile_url?.includes('/companies/') ? 'agency' : 'individual';

  // ── Property / listing type ───────────────────────────────────────────────
  const propertyTypeFromAttrs = highlighted['Type'] ?? null;
  const listing_type  = inferListingType(url, title ?? '');
  const property_type = propertyTypeFromAttrs
    ? normalisePropertyType(propertyTypeFromAttrs)
    : inferPropertyType(url, title ?? '');

  // ── Ad tier ───────────────────────────────────────────────────────────────
  const eliteEl    = await page.$('[aria-label="Elite"]');
  const featuredEl = await page.$('[aria-label="Featured"]');
  const ad_tier    = eliteEl ? 'elite' : featuredEl ? 'featured' : (hint.ad_tier ?? 'standard');

  // ── Images ────────────────────────────────────────────────────────────────
  let images = [];
  try {
    // Images are blocked by request interception (we blocked image resources),
    // but their src attributes are still present in the DOM.
    images = await page.$$eval(
      '[aria-label="Gallery"] img, [aria-label="Cover photo"] img',
      imgs => imgs
        .map(img => img.getAttribute('src') || img.getAttribute('data-src') || '')
        .filter(src => /\.(jpg|jpeg|webp|png)/i.test(src) && !/svg/.test(src))
    );
    images = [...new Set(images.map(u => u.split('?')[0]))];
  } catch {}

  // ── Amenities / Features ──────────────────────────────────────────────────
  let amenities = [];
  try {
    amenities = await page.$$eval(
      '[aria-label="Features"] li, [aria-label="Features"] span',
      els => els.map(e => e.innerText.trim()).filter(Boolean)
    );
  } catch {}

  return {
    id,
    url,
    title,
    description,
    price,
    price_currency,
    price_period,
    down_payment,
    is_negotiable,
    property_type,
    listing_type,
    area_sqm,
    bedrooms,
    bathrooms,
    floor_number,
    total_floors,
    furnished,
    country: 'Egypt',
    governorate: governorate ?? hint.governorate ?? null,
    city:         city ?? hint.city ?? null,
    compound:     compound ?? hint.compound ?? null,
    full_location,
    seller_name,
    seller_type,
    seller_verified,
    member_since,
    seller_profile_url,
    ad_tier,
    posted_at,
    scraped_at,
    extra_attributes: Object.keys(extraAttributes).length
      ? JSON.stringify(extraAttributes)
      : null,
    images,
    amenities,
  };
}

function normalisePropertyType(raw) {
  const t = raw.toLowerCase();
  if (t.includes('apartment') || t.includes('duplex')) return 'Apartment';
  if (t.includes('town'))                              return 'Townhouse';
  if (t.includes('villa'))                             return 'Villa';
  if (t.includes('studio'))                            return 'Studio';
  if (t.includes('chalet'))                            return 'Chalet';
  if (t.includes('penthouse'))                         return 'Penthouse';
  if (t.includes('office'))                            return 'Office';
  if (t.includes('land') || t.includes('plot'))       return 'Land';
  if (t.includes('shop') || t.includes('retail'))     return 'Shop';
  if (t.includes('warehouse'))                         return 'Warehouse';
  if (t.includes('clinic'))                            return 'Clinic';
  // Capitalise whatever we got from the site
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

/**
 * Navigate to a detail page and scrape it.
 * @param {import('puppeteer').Page} page
 * @param {string} url
 * @param {Object} hint
 * @param {number} retries
 */
async function scrapeDetail(page, url, hint = {}, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await navigate(page, url);
      await sleep(800 + Math.random() * 600);
      return await scrapeDetailPage(page, url, hint);
    } catch (err) {
      logger.warn(`Detail scrape attempt ${attempt}/${retries} failed for ${url}: ${err.message}`);
      if (attempt === retries) {
        logger.error(`Giving up on ${url}`);
        return null;
      }
      await sleep(3000 * attempt);
    }
  }
}

module.exports = { scrapeDetail };
