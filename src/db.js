'use strict';

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_DIR = path.join(__dirname, '..', 'data');
const DB_PATH = path.join(DB_DIR, 'dubizzle.db');

if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}

const db = new Database(DB_PATH);

// Enable WAL mode for better concurrent write performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

/**
 * Schema
 *
 * listings         — one row per ad, core fields
 * listing_images   — one row per image URL (1-to-many)
 * listing_amenities— one row per amenity tag  (1-to-many)
 */
db.exec(`
  CREATE TABLE IF NOT EXISTS listings (
    id                TEXT PRIMARY KEY,          -- dubizzle ad ID  e.g. "503068933"
    url               TEXT NOT NULL UNIQUE,
    title             TEXT,
    description       TEXT,

    -- Pricing
    price             REAL,
    price_currency    TEXT DEFAULT 'EGP',
    price_period      TEXT,                      -- NULL=for-sale, 'Monthly','Yearly'
    down_payment      REAL,
    is_negotiable     INTEGER DEFAULT 0,         -- boolean

    -- Property details
    property_type     TEXT,                      -- Apartment, Villa, Townhouse, Office…
    listing_type      TEXT,                      -- 'for_sale' | 'for_rent'
    area_sqm          REAL,
    bedrooms          INTEGER,
    bathrooms         INTEGER,
    floor_number      INTEGER,
    total_floors      INTEGER,
    furnished         TEXT,                      -- 'Furnished'|'Semi-Furnished'|'Unfurnished'

    -- Location
    country           TEXT DEFAULT 'Egypt',
    governorate       TEXT,                      -- Cairo, Giza, Alexandria…
    city              TEXT,                      -- 5th Settlement, Sheikh Zayed…
    compound          TEXT,
    full_location     TEXT,                      -- raw location string from listing

    -- Seller / agency
    seller_name       TEXT,
    seller_type       TEXT,                      -- 'agency' | 'individual'
    seller_verified   INTEGER DEFAULT 0,         -- boolean
    member_since      TEXT,
    seller_profile_url TEXT,

    -- Ad meta
    ad_tier           TEXT,                      -- 'elite' | 'featured' | 'standard'
    posted_at         TEXT,                      -- raw string e.g. "4 days ago"
    scraped_at        TEXT NOT NULL,             -- ISO 8601 timestamp

    -- Raw JSON dump of any extra key-value attributes found on detail page
    extra_attributes  TEXT                       -- JSON string
  );

  CREATE TABLE IF NOT EXISTS listing_images (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    listing_id  TEXT NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
    url         TEXT NOT NULL,
    position    INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS listing_amenities (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    listing_id  TEXT NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
    amenity     TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_listings_governorate ON listings(governorate);
  CREATE INDEX IF NOT EXISTS idx_listings_city        ON listings(city);
  CREATE INDEX IF NOT EXISTS idx_listings_type        ON listings(listing_type);
  CREATE INDEX IF NOT EXISTS idx_listings_property    ON listings(property_type);
  CREATE INDEX IF NOT EXISTS idx_listings_price       ON listings(price);
  CREATE INDEX IF NOT EXISTS idx_listings_scraped     ON listings(scraped_at);
`);

// ── Prepared statements ──────────────────────────────────────────────────────

const upsertListing = db.prepare(`
  INSERT INTO listings (
    id, url, title, description,
    price, price_currency, price_period, down_payment, is_negotiable,
    property_type, listing_type, area_sqm, bedrooms, bathrooms,
    floor_number, total_floors, furnished,
    country, governorate, city, compound, full_location,
    seller_name, seller_type, seller_verified, member_since, seller_profile_url,
    ad_tier, posted_at, scraped_at, extra_attributes
  ) VALUES (
    @id, @url, @title, @description,
    @price, @price_currency, @price_period, @down_payment, @is_negotiable,
    @property_type, @listing_type, @area_sqm, @bedrooms, @bathrooms,
    @floor_number, @total_floors, @furnished,
    @country, @governorate, @city, @compound, @full_location,
    @seller_name, @seller_type, @seller_verified, @member_since, @seller_profile_url,
    @ad_tier, @posted_at, @scraped_at, @extra_attributes
  )
  ON CONFLICT(id) DO UPDATE SET
    title             = excluded.title,
    description       = excluded.description,
    price             = excluded.price,
    price_period      = excluded.price_period,
    down_payment      = excluded.down_payment,
    is_negotiable     = excluded.is_negotiable,
    area_sqm          = excluded.area_sqm,
    bedrooms          = excluded.bedrooms,
    bathrooms         = excluded.bathrooms,
    floor_number      = excluded.floor_number,
    total_floors      = excluded.total_floors,
    furnished         = excluded.furnished,
    full_location     = excluded.full_location,
    seller_name       = excluded.seller_name,
    seller_verified   = excluded.seller_verified,
    ad_tier           = excluded.ad_tier,
    posted_at         = excluded.posted_at,
    scraped_at        = excluded.scraped_at,
    extra_attributes  = excluded.extra_attributes
`);

const insertImage = db.prepare(`
  INSERT OR IGNORE INTO listing_images (listing_id, url, position)
  VALUES (@listing_id, @url, @position)
`);

const insertAmenity = db.prepare(`
  INSERT OR IGNORE INTO listing_amenities (listing_id, amenity)
  VALUES (@listing_id, @amenity)
`);

const deleteImages    = db.prepare('DELETE FROM listing_images    WHERE listing_id = ?');
const deleteAmenities = db.prepare('DELETE FROM listing_amenities WHERE listing_id = ?');

/**
 * Persist a single listing record (upsert) together with its images and amenities.
 * @param {Object} listing
 */
function saveListing(listing) {
  const { images = [], amenities = [], ...row } = listing;

  db.transaction(() => {
    upsertListing.run(row);

    // Replace images & amenities on re-scrape
    deleteImages.run(row.id);
    deleteAmenities.run(row.id);

    for (let i = 0; i < images.length; i++) {
      insertImage.run({ listing_id: row.id, url: images[i], position: i });
    }
    for (const amenity of amenities) {
      insertAmenity.run({ listing_id: row.id, amenity });
    }
  })();
}

/**
 * Return basic stats about what is currently stored.
 */
function getStats() {
  return {
    total:     db.prepare('SELECT COUNT(*) as c FROM listings').get().c,
    for_sale:  db.prepare("SELECT COUNT(*) as c FROM listings WHERE listing_type='for_sale'").get().c,
    for_rent:  db.prepare("SELECT COUNT(*) as c FROM listings WHERE listing_type='for_rent'").get().c,
    images:    db.prepare('SELECT COUNT(*) as c FROM listing_images').get().c,
    amenities: db.prepare('SELECT COUNT(*) as c FROM listing_amenities').get().c,
  };
}

module.exports = { db, saveListing, getStats };
