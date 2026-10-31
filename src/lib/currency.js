const inrFormatter = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Format an INR amount (including NUMERIC values returned by Supabase as strings). */
export function formatInr(amount) {
  if (typeof amount !== 'number' && typeof amount !== 'string') {
    throw new TypeError('formatInr expects a finite INR amount.');
  }
  if (typeof amount === 'string' && amount.trim() === '') {
    throw new TypeError('formatInr expects a finite INR amount.');
  }
  const numericAmount = typeof amount === 'number' ? amount : Number(amount);
  if (!Number.isFinite(numericAmount)) {
    throw new TypeError('formatInr expects a finite INR amount.');
  }
  return inrFormatter.format(numericAmount);
}
