const API_BASE = import.meta.env.VITE_API_URL || '/api';

export async function fetchProducts() {
  const res = await fetch(`${API_BASE}/products`);
  if (!res.ok) throw new Error('Failed to fetch products');
  return res.json();
}

export async function searchStore(query, limit = 5) {
  const res = await fetch(`${API_BASE}/store/search?q=${encodeURIComponent(query)}&limit=${limit}`);
  if (!res.ok) throw new Error('Failed to search store');
  return res.json();
}

export async function trackProduct(storeProductId) {
  const res = await fetch(`${API_BASE}/products`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ storeProductId })
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || 'Failed to track product');
  }
  return res.json();
}

export async function fetchLatestRun() {
  const res = await fetch(`${API_BASE}/runs/latest`);
  if (!res.ok) throw new Error('Failed to fetch latest run');
  return res.json();
}
