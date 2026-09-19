import { z } from 'zod';
import { ValidationError } from './parse.js';

export const ScrapedDataSchema = z.object({
  price: z.number().positive({ message: 'Price must be greater than 0' }),
  currency: z.string().default('USD'),
  stock_status: z.enum(['in_stock', 'low_stock', 'out_of_stock']),
  stock: z.number().int().min(0)
});

/**
 * Validates scraped data using Zod schema.
 */
export function validateScrapedData(data) {
  const result = ScrapedDataSchema.safeParse(data);
  if (!result.success) {
    throw new ValidationError(`Scraped data validation failed: ${result.error.message}`);
  }
  return result.data;
}

/**
 * Performs 5x price anomaly check against last known stored price.
 * Returns { isSuspect: boolean, ratio: number, warning: string | null }
 */
export function checkPriceSanity(newPrice, lastPrice) {
  if (!lastPrice || typeof lastPrice !== 'number' || lastPrice <= 0) {
    return { isSuspect: false, ratio: 1, warning: null };
  }

  const ratio = newPrice / lastPrice;
  const isSuspect = ratio > 5 || ratio < 0.2;

  if (isSuspect) {
    const warning = `[SUSPECT_PRICE_WARNING]: Price changed by ${ratio.toFixed(2)}x (previous: $${lastPrice}, new: $${newPrice})`;
    return { isSuspect: true, ratio, warning };
  }

  return { isSuspect: false, ratio, warning: null };
}
