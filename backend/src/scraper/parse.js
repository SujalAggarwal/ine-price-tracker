export class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ValidationError';
  }
}

const PLACEHOLDER_STRINGS = [
  'price hidden',
  'check the current price',
  'loading current price',
  'loading products',
  'retrying',
  'couldn\'t load',
  'n/a',
  'null',
  'undefined'
];

/**
 * Parses raw price string into positive numeric price.
 * Handles currency symbols ($ ₹ €), abbreviations (Rs. INR USD EUR), thousands separators (,), decimals (.):
 * Rejects NaN, <= 0, price ranges, and placeholder strings.
 */
export function parsePrice(rawText) {
  if (!rawText || typeof rawText !== 'string') {
    throw new ValidationError('Price text is missing or invalid type');
  }

  const trimmed = rawText.trim();
  const normalizedText = trimmed.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
  const lower = normalizedText.toLowerCase();

  // Check for placeholder strings
  for (const placeholder of PLACEHOLDER_STRINGS) {
    if (lower.includes(placeholder)) {
      throw new ValidationError(`Price text contains placeholder/loading string: "${normalizedText}"`);
    }
  }

  // Reject price ranges e.g. "$10 - $20", "$10 - 20", or "10 to 20"
  if (/\d+\s*(?:[\-–—]|\bto\b)\s*[$€₹]?\s*\d+/i.test(normalizedText)) {
      throw new ValidationError(`Price text is a range, not a fixed single price: "${normalizedText}"`);
  }

  // Preserve leading minus sign if present for negative detection
  const isNegative = /^[\s\$-]*-\d+/.test(normalizedText);

  // Strip currency prefixes/abbreviations (Rs., Rs, INR, USD, EUR, etc.) and hidden zero-width spaces (\u200B)
  const cleanedPrefix = normalizedText
    .replace(/[\u200B-\u200D\uFEFF]/g, '') // remove zero-width spaces
    .replace(/\b(rs\.?|inr|usd|eur)\b/gi, '') // remove currency text labels/abbreviations
    .trim();

  // Determine currency
  let currency = 'USD';
  if (/(rs\.?|inr|₹)/i.test(trimmed)) {
    currency = 'INR';
  } else if (/(eur|€)/i.test(trimmed)) {
    currency = 'EUR';
  }

  // Match numeric portion: e.g. "3,013.00", "1299.50", "49"
  const numberMatch = cleanedPrefix.match(/\b\d{1,3}(?:,\d{3})*(?:\.\d+)?\b|\b\d+(?:\.\d+)?\b/);

  if (!numberMatch) {
    throw new ValidationError(`No valid numeric price pattern found in string: "${trimmed}"`);
  }

  const numericString = numberMatch[0].replace(/,/g, '');
  let priceVal = parseFloat(numericString);

  if (isNegative) {
    priceVal = -priceVal;
  }

  if (Number.isNaN(priceVal)) {
    throw new ValidationError(`Parsed price is NaN from string: "${trimmed}"`);
  }

  if (priceVal <= 0) {
    throw new ValidationError(`Price must be strictly positive (> 0), got ${priceVal}`);
  }

  return {
    price: Math.round(priceVal * 100) / 100,
    currency
  };
}

/**
 * Normalizes stock status string into fixed enum: in_stock | low_stock | out_of_stock
 * Also extracts numeric stock quantity if present.
 */
export function normalizeStock(rawText) {
  if (!rawText || typeof rawText !== 'string') {
    throw new ValidationError('Stock text is missing or invalid type');
  }

  const trimmed = rawText.trim();
  const lower = trimmed.toLowerCase();

  // Extract digits if available
  const matchQty = lower.match(/\b(\d+)\b/);
  const qty = matchQty ? parseInt(matchQty[1], 10) : null;

  if (
    lower.includes('out of stock') ||
    lower.includes('sold out') ||
    lower.includes('currently unavailable') ||
    lower.includes('out-stock') ||
    qty === 0
  ) {
    return { status: 'out_of_stock', quantity: 0 };
  }

  if (
    lower.includes('only') ||
    lower.includes('low stock') ||
    lower.includes('few left') ||
    (qty !== null && qty > 0 && qty <= 5)
  ) {
    return { status: 'low_stock', quantity: qty ?? 1 };
  }

  if (
    lower.includes('in stock') ||
    lower.includes('available') ||
    lower.includes('in-stock') ||
    lower.includes('ready to ship') ||
    (qty !== null && qty > 5)
  ) {
    return { status: 'in_stock', quantity: qty ?? 10 };
  }

  // Unknown stock text -> throw ValidationError instead of guessing
  throw new ValidationError(`Unknown stock text format: "${trimmed}"`);
}
