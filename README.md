# Dubizzle Egypt — Real Estate Scraper

A Puppeteer + Node.js scraper for [dubizzle.com.eg](https://www.dubizzle.com.eg/en/properties/) that persists real estate listings into a local **SQLite** database.

## Features

- Stealth mode (puppeteer-extra-plugin-stealth) to avoid bot detection
- Paginated listing-page crawling across all property categories
- Optional deep detail-page scraping (bedrooms, bathrooms, description, images, amenities…)
- Bounded concurrency pool for detail scraping
- Upsert logic — re-running is safe, existing rows are updated
- Structured SQLite schema with indexes
- Winston-based logging (console + rotating file)

---

## Schema

```
listings             — one row per ad
  id                   dubizzle ad ID (PK)
  url
  title / description
  price / price_currency / price_period / down_payment / is_negotiable
  property_type        Apartment | Villa | Townhouse | Office | Chalet | Studio | Land | Shop…
  listing_type         for_sale | for_rent
  area_sqm / bedrooms / bathrooms / floor_number / total_floors / furnished
  country / governorate / city / compound / full_location
  seller_name / seller_type / seller_verified / member_since / seller_profile_url
  ad_tier              elite | featured | standard
  posted_at / scraped_at
  extra_attributes     JSON blob for any additional key-value pairs

listing_images       — one row per image (FK → listings)
listing_amenities    — one row per amenity tag (FK → listings)
```

The database is written to `data/dubizzle.db`.

---

## Installation

```bash
npm install
```

---

## Usage

```bash
# Quick start — scrape 5 pages of all properties (listing cards only)
npm start

# Scrape 10 pages of apartments for sale
npm run scrape:apartments-sale

# Scrape with full detail pages (slower but richer data)
node index.js --pages 5 --detail --concurrency 3

# All CLI flags
node index.js \
  --category  apartments-for-sale   # category slug (see list below)
  --pages     10                    # max listing pages to crawl
  --start-page 1                    # resume from a specific page
  --delay     2000                  # ms between listing page requests
  --detail                          # visit each ad's detail page
  --concurrency 3                   # parallel tabs for detail scraping
```

### Available categories

| Flag value              | URL slug                              |
|-------------------------|---------------------------------------|
| `apartments-for-sale`   | apartments-duplex-for-sale            |
| `apartments-for-rent`   | apartments-duplex-for-rent            |
| `villas-for-sale`       | villas-for-sale                       |
| `villas-for-rent`       | villas-for-rent                       |
| `offices-for-sale`      | offices-for-sale                      |
| `offices-for-rent`      | offices-for-rent                      |
| `chalets-for-sale`      | chalets-for-sale                      |
| `land-for-sale`         | land-for-sale                         |
| `townhouses-for-sale`   | townhouses-for-sale                   |

Omit `--category` to scrape the general properties listing.

---

## NPM scripts

| Script                       | Description                              |
|------------------------------|------------------------------------------|
| `npm start`                  | 5 pages of all properties                |
| `npm run scrape:all`         | 10 pages of all properties               |
| `npm run scrape:apartments-sale` | 10 pages of apartments for sale      |
| `npm run scrape:apartments-rent` | 10 pages of apartments for rent      |
| `npm run scrape:villas-sale` | 10 pages of villas for sale              |
| `npm run scrape:full`        | 10 pages + detail scraping (3 tabs)      |
| `npm run stats`              | Print database row counts                |

---

## Querying the data

```sql
-- Most expensive listings
SELECT title, price, city, property_type
FROM listings
ORDER BY price DESC
LIMIT 20;

-- Apartments for rent in Cairo under EGP 30,000/month
SELECT title, price, city, area_sqm, bedrooms
FROM listings
WHERE listing_type = 'for_rent'
  AND property_type = 'Apartment'
  AND governorate   = 'Cairo'
  AND price < 30000;

-- Average price per sqm by governorate (for-sale)
SELECT governorate,
       ROUND(AVG(price / area_sqm)) AS avg_price_per_sqm,
       COUNT(*) AS listings
FROM listings
WHERE listing_type = 'for_sale' AND area_sqm > 0
GROUP BY governorate
ORDER BY avg_price_per_sqm DESC;
```
