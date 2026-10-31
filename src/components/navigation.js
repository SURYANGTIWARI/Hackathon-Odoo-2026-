import {
  BadgePercent,
  BarChart3,
  CreditCard,
  FileText,
  LayoutDashboard,
  Package,
  Settings,
  ShoppingBag,
  Users,
  Workflow,
} from 'lucide-react';

export const navigationItems = [
  { label: 'Dashboard', path: '/dashboard', icon: LayoutDashboard },
  { label: 'Customers', path: '/customers', icon: Users },
  { label: 'Products', path: '/products', icon: Package },
  { label: 'Plans', path: '/plans', icon: ShoppingBag },
  { label: 'Subscriptions', path: '/subscriptions', icon: Workflow },
  { label: 'Quotations', path: '/quotations', icon: FileText },
  { label: 'Invoices', path: '/invoices', icon: FileText },
  { label: 'Payments', path: '/payments', icon: CreditCard },
  { label: 'Discounts', path: '/discounts', icon: BadgePercent },
  { label: 'Reports', path: '/reports', icon: BarChart3 },
  { label: 'Settings', path: '/settings', icon: Settings },
];

export const descriptionByPath = Object.fromEntries(
  navigationItems.map(({ label, path }) => [path, label]),
);
