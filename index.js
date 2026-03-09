"use strict";

/**
 * index.js  — Dubizzle Egypt Real Estate Scraper
 *
 * Usage:
 *   node index.js [--category <slug>] [--pages <n>] [--start-page <n>]
 *                 [--delay <ms>] [--detail] [--concurrency <n>]
 *
 * Examples:
 *   node index.js                                        # all properties, 5 pages
 *   node index.js --category apartments-duplex-for-sale  # apartments for sale only
 *   node index.js --pages 20 --detail                    # scrape 20 pages + detail pages
 *   node index.js --category villas-for-sale --pages 10 --delay 2000
 */

const { newPage, closeBrowser, sleep } = require("./src/browser");
const { crawlListingPages } = require("./src/listingScraper");
const { scrapeDetail } = require("./src/detailScraper");
const { saveListing, getStats } = require("./src/db");
const logger = require("./src/logger");

// ── Categories available on dubizzle.com.eg/en/properties/ ──────────────────
const CATEGORIES = {
  all: "",
  "apartments-for-sale": "apartments-duplex-for-sale",
  "apartments-for-rent": "apartments-duplex-for-rent",
  "villas-for-sale": "villas-for-sale",
  "villas-for-rent": "villas-for-rent",
  "offices-for-sale": "offices-for-sale",
  "offices-for-rent": "offices-for-rent",
  "chalets-for-sale": "chalets-for-sale",
  "land-for-sale": "land-for-sale",
  "townhouses-for-sale": "townhouses-for-sale",
};

// ── CLI argument parsing ─────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = {
    category: "", // URL slug
    pages: 5, // max listing pages to scrape
    startPage: 1,
    delayMs: 1500, // ms between listing pages
    detail: false, // whether to visit each detail page
    concurrency: 3, // parallel detail-page tabs
  };

  for (let i = 2; i < argv.length; i++) {
    switch (argv[i]) {
      case "--category":
        args.category = CATEGORIES[argv[++i]] ?? argv[i];
        break;
      case "--pages":
        args.pages = parseInt(argv[++i]) || args.pages;
        break;
      case "--start-page":
        args.startPage = parseInt(argv[++i]) || 1;
        break;
      case "--delay":
        args.delayMs = parseInt(argv[++i]) || args.delayMs;
        break;
      case "--detail":
        args.detail = true;
        break;
      case "--concurrency":
        args.concurrency = parseInt(argv[++i]) || 3;
        break;
      default:
        logger.warn(`Unknown argument: ${argv[i]}`);
    }
  }
  return args;
}

// ── Concurrency pool ─────────────────────────────────────────────────────────

/**
 * Process items from an async iterable with bounded concurrency.
 * @template T
 * @param {AsyncIterable<T>} iterable
 * @param {number} concurrency
 * @param {(item: T) => Promise<void>} handler
 */
async function pooledProcess(iterable, concurrency, handler) {
  const queue = [];
  const running = new Set();

  async function run(item) {
    running.add(item);
    try {
      await handler(item);
    } finally {
      running.delete(item);
    }
  }

  for await (const item of iterable) {
    if (running.size >= concurrency) {
      await Promise.race([...running].map((p) => p));
    }
    const promise = run(item);
    running.add(promise);
  }
  await Promise.all([...running]);
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const args = parseArgs(process.argv);

  logger.info("═".repeat(60));
  logger.info("Dubizzle Egypt Real Estate Scraper");
  logger.info(`Category  : ${args.category || "(all properties)"}`);
  logger.info(`Max pages : ${args.pages}`);
  logger.info(`Start page: ${args.startPage}`);
  logger.info(`Delay     : ${args.delayMs}ms`);
  logger.info(`Detail    : ${args.detail}`);
  logger.info("═".repeat(60));

  // ── Open listing-page browser tab ───────────────────────────────────────
  const listPage = await newPage();

  let totalSaved = 0;
  let totalErrors = 0;

  // ── Queue for detail scraping ────────────────────────────────────────────
  const detailQueue = [];

  // ── Collect all cards from listing pages ────────────────────────────────
  for await (const hint of crawlListingPages(listPage, args.category, {
    startPage: args.startPage,
    maxPages: args.pages,
    delayMs: args.delayMs,
  })) {
    if (args.detail) {
      detailQueue.push(hint);
    } else {
      // Save the partial data we have from the listing card
      try {
        const {
          extractAdId,
          inferListingType,
          inferPropertyType,
        } = require("./src/parsers");
        const id = extractAdId(hint.url);
        if (!id) continue;

        saveListing({
          id,
          url: hint.url,
          title: hint.title ?? null,
          description: null,
          price: hint.price ?? null,
          price_currency: hint.price_currency ?? "EGP",
          price_period: hint.price_period ?? null,
          down_payment: hint.down_payment ?? null,
          is_negotiable: hint.is_negotiable ?? 0,
          property_type: inferPropertyType(hint.url, hint.title ?? ""),
          listing_type: inferListingType(hint.url),
          area_sqm: hint.area_sqm ?? null,
          bedrooms: hint.bedrooms ?? null,
          bathrooms: hint.bathrooms ?? null,
          floor_number: null,
          total_floors: null,
          furnished: null,
          country: "Egypt",
          governorate: hint.governorate ?? null,
          city: hint.city ?? null,
          compound: hint.compound ?? null,
          full_location: hint.full_location ?? null,
          seller_name: hint.seller_name ?? null,
          seller_type: null,
          seller_verified: hint.seller_verified ?? 0,
          member_since: hint.member_since ?? null,
          seller_profile_url: null,
          ad_tier: hint.ad_tier ?? "standard",
          posted_at: hint.posted_at ?? null,
          scraped_at: new Date().toISOString(),
          extra_attributes: null,
          images: [],
          amenities: [],
        });
        totalSaved++;
        if (totalSaved % 25 === 0)
          logger.info(`Saved ${totalSaved} listings so far…`);
      } catch (err) {
        logger.error(`Failed to save listing ${hint.url}: ${err.message}`);
        totalErrors++;
      }
    }
  }

  await listPage.close();

  // ── Detail scraping ──────────────────────────────────────────────────────
  if (args.detail && detailQueue.length > 0) {
    logger.info(
      `Starting detail scraping for ${detailQueue.length} listings (concurrency=${args.concurrency})…`,
    );

    // Open a pool of pages
    const pages = await Promise.all(
      Array.from({ length: args.concurrency }, () => newPage()),
    );
    let pageIdx = 0;

    await pooledProcess(
      (async function* () {
        for (const h of detailQueue) yield h;
      })(),
      args.concurrency,
      async (hint) => {
        const page = pages[pageIdx % pages.length];
        pageIdx++;
        try {
          const listing = await scrapeDetail(page, hint.url, hint);
          if (listing) {
            saveListing(listing);
            totalSaved++;
            if (totalSaved % 10 === 0)
              logger.info(`Saved ${totalSaved} full listings…`);
          }
        } catch (err) {
          logger.error(`Detail failed for ${hint.url}: ${err.message}`);
          totalErrors++;
        }
        // Polite delay between requests on the same tab
        await sleep(500 + Math.random() * 800);
      },
    );

    for (const p of pages) {
      try {
        await p.close();
      } catch {}
    }
  }

  // ── Final stats ──────────────────────────────────────────────────────────
  const stats = getStats();
  logger.info("═".repeat(60));
  logger.info("Scraping complete!");
  logger.info(`Saved in this run : ${totalSaved}`);
  logger.info(`Errors            : ${totalErrors}`);
  logger.info("── Database totals ──");
  logger.info(`Total listings    : ${stats.total}`);
  logger.info(`  For sale        : ${stats.for_sale}`);
  logger.info(`  For rent        : ${stats.for_rent}`);
  logger.info(`Images stored     : ${stats.images}`);
  logger.info(`Amenity rows      : ${stats.amenities}`);
  logger.info("═".repeat(60));

  await closeBrowser();
}

main().catch((err) => {
  logger.error(`Fatal error: ${err.message}`, err);
  process.exitCode = 1;
  closeBrowser().finally(() => {});
});
