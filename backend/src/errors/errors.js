export class StoreError extends Error {
  constructor(message) {
    super(message);
    this.name = 'StoreError';
  }
}

export class StoreTimeoutError extends StoreError {
  constructor(message = 'Store request timed out') {
    super(message);
    this.name = 'StoreTimeoutError';
  }
}

export class StoreHttpError extends StoreError {
  constructor(statusCode, statusText, message) {
    super(message || `Store returned HTTP ${statusCode}: ${statusText}`);
    this.name = 'StoreHttpError';
    this.statusCode = statusCode;
    this.statusText = statusText;
  }
}

export class StoreNetworkError extends StoreError {
  constructor(message = 'Network error while contacting store') {
    super(message);
    this.name = 'StoreNetworkError';
  }
}

export class StructureChangedError extends StoreError {
  constructor(message = 'Store API response structure has changed or failed validation') {
    super(message);
    this.name = 'StructureChangedError';
  }
}
