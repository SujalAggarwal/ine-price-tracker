import { chromium } from 'playwright';

let browserInstance = null;

/**
 * Gets or launches the shared Chromium browser instance.
 */
export async function getBrowser() {
  if (browserInstance && browserInstance.isConnected()) {
    return browserInstance;
  }

  const isHeaded = process.env.HEADED === 'true';

  browserInstance = await chromium.launch({
    headless: !isHeaded,
    slowMo: isHeaded ? 300 : 0,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--disable-gpu'
    ]
  });

  return browserInstance;
}

/**
 * Creates a fresh isolated browser context for single product scraping.
 */
export async function createProductContext(browser) {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    deviceScaleFactor: 1
  });

  const page = await context.newPage();

  // Route interception to block images/media while keeping network responsive
  await page.route('**/*.{png,jpg,jpeg,gif,svg,webp,mp4,webm,mp3,wav}', (route) => {
    return route.abort();
  });

  return { context, page };
}

/**
 * Safely closes the shared browser instance if open.
 */
export async function closeBrowser() {
  if (browserInstance) {
    try {
      await browserInstance.close();
    } catch (err) {
      console.warn('[Browser Warning] Error closing browser instance:', err.message);
    } finally {
      browserInstance = null;
    }
  }
}
