import { ValidationError } from './parse.js';
import { StructureChangedError } from '../errors/errors.js';

export class ScrapeError extends Error {
  constructor(message, errorType = 'unexpected', isRetryable = true) {
    super(message);
    this.name = 'ScrapeError';
    this.errorType = errorType; // timeout | click_failed | block_error | structure_changed | validation_error | http_error | unexpected
    this.isRetryable = isRetryable;
  }
}

export class ScrapeTimeoutError extends ScrapeError {
  constructor(message = 'Scrape operation timed out') {
    super(message, 'timeout', true);
    this.name = 'ScrapeTimeoutError';
  }
}

export class ClickFailedError extends ScrapeError {
  constructor(message = 'Failed to click reveal price element') {
    super(message, 'click_failed', true);
    this.name = 'ClickFailedError';
  }
}

export class BlockErrorState extends ScrapeError {
  constructor(message = 'Price block reached error state on page') {
    super(message, 'block_error', true);
    this.name = 'BlockErrorState';
  }
}

function getBackoffDelay(attempt, baseDelayMs) {
  const delay = baseDelayMs * Math.pow(2, attempt);
  const jitter = Math.floor(Math.random() * 300);
  return delay + jitter;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retries an async scraper function with exponential backoff & jitter.
 */
export async function withRetry(fn, options = {}) {
  const maxAttempts = options.maxAttempts || 4;
  const baseDelayMs = options.baseDelayMs || 1500;

  let attempt = 1;
  let lastError = null;

  while (attempt <= maxAttempts) {
    try {
      const result = await fn(attempt);
      return { result, attempts: attempt };
    } catch (err) {
      lastError = err;
      
      // Attach attempt count to error
      err.attempts = attempt;

      // Determine if error is retryable
      let canRetry = true;

      if (err instanceof StructureChangedError || err instanceof ValidationError) {
        canRetry = false; // Structure changes & validation errors on same data shouldn't be retried continuously
      } else if (err instanceof ScrapeError && !err.isRetryable) {
        canRetry = false;
      }

      if (!canRetry || attempt >= maxAttempts) {
        throw lastError;
      }

      const delay = getBackoffDelay(attempt - 1, baseDelayMs);
      await sleep(delay);
      attempt++;
    }
  }

  throw lastError;
}
