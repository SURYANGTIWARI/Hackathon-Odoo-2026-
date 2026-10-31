import { useCallback, useEffect, useState } from 'react';
import { CalendarClock, CircleAlert, CreditCard, FileText, RefreshCw, Workflow } from 'lucide-react';
import { supabase } from '../lib/supabase.js';
import { formatInr } from '../lib/currency.js';
import { useAuth } from '../auth/useAuth.js';
import LoadingState from '../components/LoadingState.jsx';

const dateFmt = (value) => value ? new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(`${value.slice(0, 10)}T12:00:00`)) : '—';

export default function CustomerPortal() {
  const { profile } = useAuth();
  const [data, setData] = useState(null); const [error, setError] = useState(''); const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true); setError('');
    const [subscriptions, invoices, payments] = await Promise.all([
      supabase.from('subscriptions').select('id,subscription_number,status,start_date,expiry_date,next_billing_date,billing_interval').order('created_at', { ascending: false }).limit(100),
      supabase.from('invoices').select('id,invoice_number,billing_date,due_date,status,total,outstanding_amount,paid_amount').order('billing_date', { ascending: false }).limit(100),
      supabase.from('payments').select('id,amount,status,payment_date,method,reference').order('payment_date', { ascending: false }).limit(100),
    ]);
    const failed = [subscriptions, invoices, payments].find((result) => result.error);
    if (failed) { setError(failed.error.message || 'Your account records could not be loaded.'); setLoading(false); return; }
    setData({ subscriptions: subscriptions.data || [], invoices: invoices.data || [], payments: payments.data || [] }); setLoading(false);
  }, []);
  useEffect(() => { const timer = window.setTimeout(() => { void load(); }, 0); return () => window.clearTimeout(timer); }, [load]);
  if (loading) return <div className="portal-wrap"><LoadingState label="Loading your account" /><div className="portal-skeleton">{[0,1,2].map((item) => <div className="surface-card skeleton-card" key={item}><i /><b /><span /></div>)}</div></div>;
  if (error) return <div className="portal-wrap"><div className="data-error"><CircleAlert size={20} /><div><b>Your account data is unavailable</b><p>{error}</p><button className="button button--secondary button--small" onClick={() => void load()}><RefreshCw size={14} /> Try again</button></div></div></div>;
  const due = data.invoices.reduce((sum, invoice) => sum + Number(invoice.outstanding_amount || 0), 0);
  return (
    <div className="portal-wrap"><div className="dashboard-welcome"><div><span className="card-kicker">CUSTOMER PORTAL</span><h1>Welcome, {profile?.full_name?.split(' ')[0] || 'back'}<span className="greeting-comma">.</span></h1><p>Your subscriptions, invoices, and payment history in one private place.</p></div><div className="welcome-date"><CalendarClock size={16} /><span>Updated just now</span></div></div>
      <div className="portal-kpis"><PortalStat icon={Workflow} label="Subscriptions" value={data.subscriptions.length} /><PortalStat icon={FileText} label="Invoices" value={data.invoices.length} /><PortalStat icon={CreditCard} label="Outstanding" value={formatInr(due)} /></div>
      <section className="surface-card portal-section"><div className="card-heading"><div><span className="card-kicker">YOUR SUBSCRIPTIONS</span><h2>Subscription activity</h2><p>Only subscriptions linked to your customer account are visible.</p></div></div>{data.subscriptions.length ? <div className="table-scroll"><table className="data-table"><thead><tr><th>Subscription</th><th>Status</th><th>Billing cycle</th><th>Next billing</th><th>Expiry</th></tr></thead><tbody>{data.subscriptions.map((item) => <tr key={item.id}><td><b>{item.subscription_number}</b></td><td><span className={`status-pill status-pill--${item.status.toLowerCase()}`}>{item.status.replace('_', ' ').toLowerCase()}</span></td><td>{item.billing_interval.toLowerCase()}</td><td>{dateFmt(item.next_billing_date)}</td><td>{dateFmt(item.expiry_date)}</td></tr>)}</tbody></table></div> : <PortalEmpty icon={Workflow} text="You don't have subscriptions to show yet." />}</section>
      <div className="portal-two-col"><section className="surface-card portal-section"><div className="card-heading"><div><span className="card-kicker">INVOICES</span><h2>Recent invoices</h2></div></div>{data.invoices.length ? <div className="portal-row-list">{data.invoices.slice(0, 8).map((invoice) => <div className="portal-row" key={invoice.id}><span><FileText size={15} /></span><div><b>{invoice.invoice_number}</b><small>Due {dateFmt(invoice.due_date)} · {invoice.status.toLowerCase().replace('_', ' ')}</small></div><strong>{formatInr(invoice.total)}</strong></div>)}</div> : <PortalEmpty icon={FileText} text="Invoices will appear here when issued." />}</section><section className="surface-card portal-section"><div className="card-heading"><div><span className="card-kicker">PAYMENT HISTORY</span><h2>Recent payments</h2></div></div>{data.payments.length ? <div className="portal-row-list">{data.payments.slice(0, 8).map((payment) => <div className="portal-row" key={payment.id}><span><CreditCard size={15} /></span><div><b>{payment.method.replace('_', ' ')}</b><small>{dateFmt(payment.payment_date)} · {payment.status.toLowerCase()}</small></div><strong>{formatInr(payment.amount)}</strong></div>)}</div> : <PortalEmpty icon={CreditCard} text="Payments will appear here as they are recorded." />}</section></div>
    </div>
  );
}
function PortalStat({ icon: Icon, label, value }) { return <div className="surface-card portal-stat"><span><Icon size={17} /></span><div><small>{label}</small><b>{value}</b></div></div>; }
function PortalEmpty({ icon: Icon, text }) { return <div className="empty-state"><span><Icon size={17} /></span><p>{text}</p></div>; }
