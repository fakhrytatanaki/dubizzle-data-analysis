"use strict";

/**
 * browser.js
 * Manages a single Puppeteer browser instance with stealth measures.
 */

const puppeteer = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
const logger = require("./logger");

puppeteer.use(StealthPlugin());

// ── Configuration ────────────────────────────────────────────────────────────

const BROWSER_ARGS = [
  "--no-sandbox",
  "--disable-setuid-sandbox",
  "--disable-dev-shm-usage",
  "--disable-accelerated-2d-canvas",
  "--disable-gpu",
  "--window-size=1366,768",
  "--disable-blink-features=AutomationControlled",
];

const DEFAULT_VIEWPORT = { width: 1366, height: 768 };

const USER_AGENTS = [
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
];

let browserInstance = null;

function randomUA() {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

/**
 * Launch (or return cached) browser instance.
 */
async function getBrowser() {
  if (browserInstance && browserInstance.isConnected()) return browserInstance;

  logger.info("Launching browser…");
  browserInstance = await puppeteer.launch({
    //headless: false,
    headless: "new",
    args: BROWSER_ARGS,
    defaultViewport: DEFAULT_VIEWPORT,
  });

  browserInstance.on("disconnected", () => {
    logger.warn("Browser disconnected");
    browserInstance = null;
  });

  return browserInstance;
}

/**
 * Open a new page with sensible defaults (UA, extra headers, dialog auto-dismiss).
 */
async function newPage() {
  const browser = await getBrowser();
  const page = await browser.newPage();

  await page.setUserAgent(randomUA());
  await page.setExtraHTTPHeaders({
    "Accept-Language": "en-US,en;q=0.9",
    Accept:
      "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  });

  // Block images / fonts / media to speed up scraping
  await page.setRequestInterception(true);
  page.on("request", (req) => {
    const type = req.resourceType();
    if (["image", "media", "font", "stylesheet"].includes(type)) {
      req.abort();
    } else {
      req.continue();
    }
  });

  // Auto-dismiss any stray dialogs
  page.on("dialog", async (dialog) => {
    try {
      await dialog.dismiss();
    } catch {}
  });

  return page;
}

/**
 * Navigate with retry logic.
 * @param {import('puppeteer').Page} page
 * @param {string} url
 * @param {number} retries
 */
async function navigate(page, url, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await page.goto(url, {
        waitUntil: "domcontentloaded",
        timeout: 30_000,
      });
      return;
    } catch (err) {
      logger.warn(
        `Navigation attempt ${attempt}/${retries} failed for ${url}: ${err.message}`,
      );
      if (attempt === retries) throw err;
      await sleep(2000 * attempt);
    }
  }
}

/**
 * Close the browser.
 */
async function closeBrowser() {
  if (browserInstance) {
    await browserInstance.close();
    browserInstance = null;
    logger.info("Browser closed");
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = { getBrowser, newPage, navigate, closeBrowser, sleep };
