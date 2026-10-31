import { navigationItems } from '../components/navigation.js';

const descriptions = {
  dashboard: 'Subscription health, revenue, and recent activity will appear here once a database is connected.',
  customers: 'Customer records and account details will be managed here.',
  products: 'Your subscription products and product variants will be managed here.',
  plans: 'Billing plans, pricing, and renewal intervals will be configured here.',
  subscriptions: 'Subscription lifecycle, renewals, and status changes will be managed here.',
  quotations: 'Customer quotations and conversion to subscriptions will be managed here.',
  invoices: 'Invoices and their payment status will be managed here.',
  payments: 'Payment records and invoice reconciliation will be managed here.',
  discounts: 'Discount rules and eligibility will be configured here.',
  reports: 'Revenue and subscription reports will be available here.',
  settings: 'Workspace and application settings will be managed here.',
};

export const pageDefinitions = navigationItems.map(({ label, path, icon }) => {
  const route = path.slice(1);
  return { label, path: route, icon, description: descriptions[route] };
});
