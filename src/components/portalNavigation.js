import { Bell, CreditCard, FileText, HelpCircle, LayoutDashboard, ReceiptText, Settings2, Workflow } from 'lucide-react';

export const portalNavigation = [
  { label: 'My Dashboard', path: '/portal/dashboard', icon: LayoutDashboard },
  { label: 'My Subscriptions', path: '/portal/subscriptions', icon: Workflow },
  { label: 'My Quotations', path: '/portal/quotations', icon: FileText },
  { label: 'My Invoices', path: '/portal/invoices', icon: ReceiptText },
  { label: 'My Payments', path: '/portal/payments', icon: CreditCard },
  { label: 'Notifications', path: '/portal/notifications', icon: Bell },
  { label: 'My Profile', path: '/portal/profile', icon: Settings2 },
  { label: 'Help & Support', path: '/portal/support', icon: HelpCircle },
];
