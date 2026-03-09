'use strict';

/**
 * parsers.js
 * Pure functions that extract structured data from raw page content.
 * No Puppeteer dependency — easy to unit-test.
 */

/**
 * Extract the numeric dubizzle ad ID from a URL.
 * e.g. ".../apartment-for-sale-ID503068933.html" → "503068933"
 */
function extractAdId(url) {
  const m = url.match(/[_-]ID(\d+)\.html/i);
  return m ? m[1] : null;
}

/**
 * Parse a price string like "EGP 8,000,000" or "EGP 67,850 Monthly"
 * Returns { price, currency, period }
 */
function parsePrice(raw) {
  if (!raw) return { price: null, price_currency: 'EGP', price_period: null };

  const currency = raw.match(/[A-Z]{2,3}/)?.[0] ?? 'EGP';
  const numeric  = raw.replace(/[^0-9.]/g, '');
  const price    = numeric ? parseFloat(numeric) : null;

  let price_period = null;
  if (/monthly/i.test(raw))  price_period = 'Monthly';
  if (/yearly/i.test(raw))   price_period = 'Yearly';
  if (/weekly/i.test(raw))   price_period = 'Weekly';

  return { price, price_currency: currency, price_period };
}

/**
 * Parse a down-payment string like "EGP 655,600 Down Payment" → 655600
 */
function parseDownPayment(raw) {
  if (!raw) return null;
  const m = raw.replace(/[^0-9.]/g, '');
  return m ? parseFloat(m) : null;
}

/**
 * Parse area string "205 sqm" → 205
 */
function parseArea(raw) {
  if (!raw) return null;
  const m = raw.match(/([\d,.]+)/);
  return m ? parseFloat(m[1].replace(/,/g, '')) : null;
}

/**
 * Infer listing type from URL or category breadcrumb.
 * Returns 'for_sale' | 'for_rent'
 */
function inferListingType(url = '', category = '') {
  const text = `${url} ${category}`.toLowerCase();
  if (text.includes('for-rent') || text.includes('for rent')) return 'for_rent';
  return 'for_sale';
}

/**
 * Infer property type from URL slug or title.
 */
function inferPropertyType(url = '', title = '') {
  const text = `${url} ${title}`.toLowerCase();
  if (text.includes('apartment') || text.includes('duplex'))  return 'Apartment';
  if (text.includes('villa'))                                 return 'Villa';
  if (text.includes('townhouse'))                             return 'Townhouse';
  if (text.includes('office'))                                return 'Office';
  if (text.includes('chalet'))                                return 'Chalet';
  if (text.includes('studio'))                                return 'Studio';
  if (text.includes('penthouse'))                             return 'Penthouse';
  if (text.includes('land') || text.includes('plot'))        return 'Land';
  if (text.includes('shop') || text.includes('retail'))      return 'Shop';
  if (text.includes('warehouse'))                             return 'Warehouse';
  if (text.includes('clinic'))                                return 'Clinic';
  return 'Property';
}

/**
 * Split a raw location string "Compound Name, City" into parts.
 */
function parseLocation(raw = '') {
  const parts = raw.split(',').map(s => s.trim()).filter(Boolean);
  return {
    compound:     parts.length >= 2 ? parts[0]  : null,
    city:         parts.length >= 2 ? parts[1]  : (parts[0] ?? null),
    governorate:  parts.length >= 3 ? parts[2]  : null,
    full_location: raw.trim() || null,
  };
}

/**
 * Parse "Member since Oct 2024" → "Oct 2024"
 */
function parseMemberSince(raw = '') {
  const m = raw.match(/member since (.+)/i);
  return m ? m[1].trim() : raw.trim() || null;
}

module.exports = {
  extractAdId,
  parsePrice,
  parseDownPayment,
  parseArea,
  inferListingType,
  inferPropertyType,
  parseLocation,
  parseMemberSince,
};
