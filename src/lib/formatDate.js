export function formatDate(value, options = { day: 'numeric', month: 'short', year: 'numeric' }) {
  if (!value) return '—';
  const date = new Date(`${String(value).slice(0, 10)}T12:00:00`);
  return Number.isNaN(date.valueOf()) ? '—' : new Intl.DateTimeFormat('en-IN', options).format(date);
}
