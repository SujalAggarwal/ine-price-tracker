import {
  ScrapeTimeoutError,
  ClickFailedError,
  BlockErrorState
} from './retry.js';
import { StructureChangedError } from '../errors/errors.js';

/**
 * Dismisses cookie consent popup if it appears on the page.
 */
async function dismissCookieConsent(page) {
  try {
    const cookieButtons = [
      'button:has-text("Accept")',
      'button:has-text("Got it")',
      'button:has-text("Agree")',
      'button:has-text("OK")',
      '.cookie-banner button',
      '#cookie-consent button'
    ];

    for (const selector of cookieButtons) {
      const btn = page.locator(selector).first();
      if (await btn.isVisible({ timeout: 500 }).catch(() => false)) {
        await btn.click({ timeout: 1000 }).catch(() => {});
        await page.waitForTimeout(300);
        break;
      }
    }
  } catch (err) {
    // Non-fatal if cookie banner is absent
  }
}

/**
 * Extracts raw price and stock text from a single product page using Playwright.
 */
export async function extractProductPage(page, productUrl) {
  // 1. Navigate to product page
  try {
    await page.goto(productUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
  } catch (err) {
    throw new ScrapeTimeoutError(`Navigation to ${productUrl} timed out: ${err.message}`);
  }

  // 2. Dismiss cookie popup if visible
  await dismissCookieConsent(page);

  // 3. Fetch layout revision to get dynamic price class (from /api/layout)
  let layout;
  try {
    layout = await page.evaluate(async () => {
      const res = await fetch('/api/layout');
      if (!res.ok) return null;
      return res.json();
    });
  } catch (err) {
    // Fallback if fetch layout fails
  }

  const priceClass = layout?.classes?.priceValue || 'pv-m4';
  const stockClass = layout?.classes?.stock || 'st-m4';

  // Wait for initial SPA product component load
  const priceBlock = page.locator('.price-block').first();
  await priceBlock.waitFor({ state: 'attached', timeout: 15000 }).catch(() => {
    throw new StructureChangedError(`Product price block container not loaded on ${productUrl}`);
  });

  // 4. Trigger price reveal interaction with realistic mouse hover dwell
  const isAlreadySuccess = await page.locator('.price-block.price-success').isVisible().catch(() => false);

  if (!isAlreadySuccess) {
    // Perform mouse movements over price block to satisfy minDwellMs anti-bot tracking
    const box = await priceBlock.boundingBox().catch(() => null);

    if (box) {
      const startX = box.x + 10;
      const startY = box.y + 10;
      await page.mouse.move(startX, startY);
      await page.waitForTimeout(200);

      // Micro mouse movements over price area for dwell time
      for (let offset = 0; offset <= 40; offset += 10) {
        await page.mouse.move(startX + offset, startY + offset);
        await page.waitForTimeout(150);
      }
    } else {
      await priceBlock.hover().catch(() => {});
      await page.waitForTimeout(1000);
    }

    // Locate reveal button (wait for it to become enabled if disabled)
    const revealBtn = page.locator('.price-block button, button[aria-label="Reveal price"], button:has-text("Reveal")').first();

    if (!(await revealBtn.isVisible({ timeout: 5000 }).catch(() => false))) {
      throw new StructureChangedError(`Reveal price button not found on ${productUrl}`);
    }

    // Wait up to 5s for button to be enabled (removing disabled attribute after dwell check)
    let isEnabled = false;
    for (let check = 0; check < 20; check++) {
      const isDisabled = await revealBtn.getAttribute('disabled').catch(() => null);
      if (isDisabled === null) {
        isEnabled = true;
        break;
      }
      // Continue mouse movements to trigger dwell check
      if (box) {
        const cx = box.x + box.width / 2;
        const cy = box.y + box.height / 2;
        await page.mouse.move(cx + (Math.random() * 20 - 10), cy + (Math.random() * 20 - 10));
      } else {
        await revealBtn.hover().catch(() => {});
      }
      await page.waitForTimeout(250);
    }

    // Click reveal button
    try {
      await revealBtn.click({ timeout: 5000, force: true });
    } catch (err) {
      throw new ClickFailedError(`Clicking reveal price button failed on ${productUrl}: ${err.message}`);
    }
  }

  // 5. Wait for state resolution (Success vs Error)
  const maxWaitMs = 15000;
  const startTime = Date.now();

  while (Date.now() - startTime < maxWaitMs) {
    const isError = await page.locator('.price-block.price-error, p:has-text("Couldn\'t load")').first().isVisible().catch(() => false);
    if (isError) {
      throw new BlockErrorState(`Price block reached error state on ${productUrl}`);
    }

    const isSuccess = await page.locator('.price-block.price-success').first().isVisible().catch(() => false);
    if (isSuccess) {
      break;
    }

    await page.waitForTimeout(350);
  }

  // 6. Read raw price and stock text ignoring trap/hidden elements
  const priceSelectors = [
    `.price-block.price-success .${priceClass}`,
    `.price-block.price-success span`,
    `.price-block.price-success output`,
    `.price-success`
  ];

  let rawPriceText = null;
  let selectorUsed = null;

  for (const selector of priceSelectors) {
    const locators = page.locator(selector);
    const count = await locators.count();
    for (let i = 0; i < count; i++) {
      const el = locators.nth(i);
      if (await el.isVisible().catch(() => false)) {
        const text = await el.textContent();
        if (text && text.trim() && !text.toLowerCase().includes('hidden') && !text.toLowerCase().includes('loading')) {
          rawPriceText = text.trim();
          selectorUsed = selector;
          break;
        }
      }
    }
    if (rawPriceText) break;
  }

  if (!rawPriceText) {
    throw new ClickFailedError(`Price value element not populated after reveal click on ${productUrl}`);
  }

  // Read stock badge text
  const stockSelectors = [
    `.stock-badge`,
    `.${stockClass}`,
    `.price-block .stock-badge`
  ];

  let rawStockText = null;
  for (const selector of stockSelectors) {
    const locators = page.locator(selector);
    const count = await locators.count();
    for (let i = 0; i < count; i++) {
      const el = locators.nth(i);
      if (await el.isVisible().catch(() => false)) {
        const text = await el.textContent();
        if (text && text.trim()) {
          rawStockText = text.trim();
          break;
        }
      }
    }
    if (rawStockText) break;
  }

  return {
    rawPriceText,
    rawStockText: rawStockText || 'In Stock',
    selectorUsed,
    blockState: 'success'
  };
}
