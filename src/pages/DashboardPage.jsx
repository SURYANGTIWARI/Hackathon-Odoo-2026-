import { useCallback, useEffect, useMemo, useState } from 'react';
import { Activity, ArrowDownRight, ArrowRight, ArrowUpRight, CalendarClock, CheckCircle2, CircleAlert, Clock3, CreditCard, FileText, RefreshCw, TrendingUp, Users, Workflow } from 'lucide-react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase.js';
import { formatInr } from '../lib/currency.js';
import { useAuth } from '../auth/useAuth.js';
import LoadingState from '../components/LoadingState.jsx';

const PAGE_SIZE = 500;
const asAmount = (value) => Number(value ?? 0);
const today = () => new Date().toISOString().slice(0, 10);
const dateLabel = (value, options = { day: 'numeric', month: 'short' }) => value ? new Intl.DateTimeFormat('en-IN', options).format(new Date(`${String(value).slice(0, 10)}T12:00:00`)) : 'Not scheduled';
const customerLabel = (customer) => customer?.business_name || customer?.email || 'Customer';

async function fetchPages(makeQuery) {
  const rows = [];
  for (let offset = 0; offset < 5000; offset += PAGE_SIZE) {
    const { data, error } = await makeQuery().range(offset, offset + PAGE_SIZE - 1);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < PAGE_SIZE) break;
    if (offset + PAGE_SIZE >= 5000) throw new Error('Dashboard data exceeds the 5,000-record page window. Open the relevant module or narrow its date range.');
  }
  return rows;
}

function getMonthlyRunRate(subscriptions) {
  const factor = { DAILY: 365 / 12, WEEKLY: 52 / 12, MONTHLY: 1, YEARLY: 1 / 12 };
  return subscriptions.filter((row) => row.status === 'ACTIVE').reduce((total, row) => {
    const intervalFactor = factor[row.billing_interval] || 0;
    return total + (row.items || []).reduce((sum, item) => sum + asAmount(item.quantity) * asAmount(item.unit_price) * intervalFactor, 0);
  }, 0);
}

function makeSeries(payments, range) {
  const now = new Date();
  const monthly = range === '12m';
  const count = monthly ? 12 : range === '7d' ? 7 : 30;
  const bins = Array.from({ length: count }, (_, index) => {
    const date = new Date(now);
    if (monthly) date.setMonth(now.getMonth() - (count - 1 - index), 1);
    else { date.setHours(0, 0, 0, 0); date.setDate(now.getDate() - (count - 1 - index)); }
    return { date, value: 0 };
  });
  payments.forEach((payment) => {
    const date = new Date(payment.payment_date);
    const index = monthly
      ? (date.getFullYear() - bins[0].date.getFullYear()) * 12 + date.getMonth() - bins[0].date.getMonth()
      : Math.round((new Date(date.getFullYear(), date.getMonth(), date.getDate()) - bins[0].date) / 86400000);
    if (index >= 0 && index < bins.length) bins[index].value += asAmount(payment.amount);
  });
  return bins;
}

function RevenueChart({ payments, range, onRangeChange }) {
  const series = useMemo(() => makeSeries(payments, range), [payments, range]);
  const width = 760; const height = 220; const padX = 18; const padY = 20;
  const max = Math.max(...series.map((point) => point.value), 1);
  const points = series.map((point, index) => {
    const x = padX + (series.length === 1 ? 0 : index * (width - padX * 2) / (series.length - 1));
    const y = height - padY - (point.value / max) * (height - padY * 2);
    return `${x},${y}`;
  }).join(' ');
  const first = points.split(' ')[0]?.split(',') || [padX, height - padY];
  const last = points.split(' ').at(-1)?.split(',') || [width - padX, height - padY];
  const area = `${first[0]},${height - padY} ${points} ${last[0]},${height - padY}`;
  const labels = series.map((point, index) => {
    const visible = range === '12m' || index === 0 || index === series.length - 1 || (range === '7d') || index % 5 === 0;
    return visible ? <span key={point.date.toISOString()}>{range === '12m' ? new Intl.DateTimeFormat('en-IN', { month: 'short' }).format(point.date) : point.date.getDate()}</span> : <span key={point.date.toISOString()} />;
  });
  const total = series.reduce((sum, item) => sum + item.value, 0);
  return (
    <section className="surface-card revenue-card">
      <div className="card-heading"><div><span className="card-kicker">REVENUE PULSE</span><h2>Collections over time</h2><p>Successful payments recorded in Brightloop.</p></div><div className="range-switch" role="group" aria-label="Revenue chart range">{[['7d', '7 Days'], ['30d', '30 Days'], ['12m', '12 Months']].map(([key, label]) => <button type="button" key={key} className={range === key ? 'is-selected' : ''} onClick={() => onRangeChange(key)}>{label}</button>)}</div></div>
      <div className="chart-total"><strong>{formatInr(total)}</strong><span><i /> Collected in selected period</span></div>
      <div className="chart-wrap"><svg className="revenue-svg" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" role="img" aria-label={`Collected payment totals for the selected ${range === '12m' ? '12 months' : range === '7d' ? '7 days' : '30 days'}`}><defs><linearGradient id="revenueFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#8b6cff" stopOpacity=".25" /><stop offset="100%" stopColor="#8b6cff" stopOpacity="0" /></linearGradient></defs>{[0, 1, 2, 3].map((line) => <line key={line} x1="0" x2={width} y1={padY + line * (height - padY * 2) / 3} y2={padY + line * (height - padY * 2) / 3} className="chart-gridline" />)}<polygon points={area} fill="url(#revenueFill)" /><polyline points={points} fill="none" stroke="#a28cff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />{series.filter((point) => point.value > 0).map((point) => { const index = series.indexOf(point); const [x, y] = points.split(' ')[index].split(','); return <circle key={point.date.toISOString()} cx={x} cy={y} r="3.5" fill="#c4b6ff" stroke="#11182a" strokeWidth="2" />; })}</svg><div className="chart-labels">{labels}</div></div>
      {!payments.length && <div className="chart-empty">Recorded successful payments will appear here.</div>}
    </section>
  );
}

function SubscriptionRing({ subscriptions }) {
  const counts = ['ACTIVE', 'PENDING', 'PAUSED', 'CLOSED', 'EXPIRED'].map((status) => ({ status, count: subscriptions.filter((item) => item.status === status).length }));
  const total = counts.reduce((sum, item) => sum + item.count, 0);
  const colors = { ACTIVE: '#27c995', PENDING: '#8b6cff', PAUSED: '#f5b84b', CLOSED: '#79849c', EXPIRED: '#e8779b' };
  let cursor = 0;
  const stops = counts.map(({ status, count }) => { const start = cursor; cursor += total ? count / total * 100 : 0; return `${colors[status]} ${start}% ${cursor}%`; }).join(', ');
  return <div className="health-layout"><div className={`health-ring ${total ? '' : 'health-ring--empty'}`} style={{ background: total ? `conic-gradient(${stops})` : undefined }}><div><strong>{total}</strong><span>subscriptions</span></div></div><div className="health-legend">{counts.map(({ status, count }) => <div key={status}><i style={{ background: colors[status] }} /><span>{status[0] + status.slice(1).toLowerCase()}</span><b>{count}</b></div>)}</div></div>;
}

function DashboardSkeleton() {
  return <div className="dashboard-skeleton" aria-label="Loading dashboard data"><div className="skeleton-kpis">{[0, 1, 2, 3].map((key) => <div className="surface-card skeleton-card" key={key}><i /><b /><span /></div>)}</div><div className="skeleton-wide surface-card"><i /><i /><i /></div><div className="skeleton-columns"><div className="surface-card skeleton-card" /><div className="surface-card skeleton-card" /></div></div>;
}

export default function DashboardPage() {
  const { profile } = useAuth();
  const [range, setRange] = useState('30d');
  const [records, setRecords] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const greeting = new Date().getHours() < 12 ? 'Good morning' : new Date().getHours() < 18 ? 'Good afternoon' : 'Good evening';

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const cutoff = new Date(); cutoff.setFullYear(cutoff.getFullYear() - 1);
      const [subscriptions, invoices, payments, failedPayments, pendingPayments] = await Promise.all([
        fetchPages(() => supabase.from('subscriptions').select('id,subscription_number,status,start_date,expiry_date,next_billing_date,billing_interval,customers(business_name,email),subscription_items(quantity,unit_price)').order('created_at', { ascending: false })),
        fetchPages(() => supabase.from('invoices').select('id,invoice_number,due_date,billing_date,status,total,paid_amount,outstanding_amount,customers(business_name,email)').gt('outstanding_amount', 0).order('due_date', { ascending: true })),
        fetchPages(() => supabase.from('payments').select('id,amount,status,payment_date,method,customers(business_name,email)').eq('status', 'SUCCEEDED').gte('payment_date', cutoff.toISOString()).order('payment_date', { ascending: true })),
        fetchPages(() => supabase.from('payments').select('id,amount,status,payment_date,customers(business_name,email)').eq('status', 'FAILED').gte('payment_date', cutoff.toISOString()).order('payment_date', { ascending: false }).limit(100)),
        fetchPages(() => supabase.from('payments').select('id,amount,status,payment_date,customers(business_name,email)').eq('status', 'PENDING').order('payment_date', { ascending: false }).limit(100)),
      ]);
      setRecords({ subscriptions, invoices, payments, failedPayments, pendingPayments });
    } catch (loadError) {
      setError(loadError.message || 'Workspace records could not be loaded. Check your connection and access.');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { const timer = window.setTimeout(() => { void load(); }, 0); return () => window.clearTimeout(timer); }, [load]);

  if (loading) return <div className="page-wrap dashboard-page"><DashboardSkeleton /><LoadingState label="Loading workspace records" /></div>;
  if (error) return <div className="page-wrap dashboard-page"><div className="page-heading-row"><div><span className="card-kicker">SUBSCRIPTION INTELLIGENCE CENTER</span><h1>Workspace overview</h1></div></div><div className="data-error"><CircleAlert size={20} /><div><b>Dashboard data is unavailable</b><p>{error}</p><button className="button button--secondary button--small" onClick={() => void load()}><RefreshCw size={14} /> Try again</button></div></div></div>;

  const { subscriptions, invoices, payments, failedPayments, pendingPayments } = records;
  const activeSubscriptions = subscriptions.filter((item) => item.status === 'ACTIVE');
  const mrr = getMonthlyRunRate(subscriptions);
  const outstanding = invoices.reduce((sum, invoice) => sum + asAmount(invoice.outstanding_amount), 0);
  const collectedThisMonth = payments.filter((item) => { const date = new Date(item.payment_date); const now = new Date(); return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear(); }).reduce((sum, item) => sum + asAmount(item.amount), 0);
  const overdueInvoices = invoices.filter((invoice) => invoice.due_date < today());
  const upcoming = activeSubscriptions.filter((item) => item.next_billing_date && item.next_billing_date >= today()).sort((a, b) => a.next_billing_date.localeCompare(b.next_billing_date)).slice(0, 5);
  const expiringSoon = activeSubscriptions.filter((item) => item.expiry_date && (new Date(`${item.expiry_date}T23:59:59`) - new Date()) / 86400000 <= 30 && item.expiry_date >= today());
  const currentMonth = new Date().getMonth();
  const thisMonthValue = payments.filter((item) => new Date(item.payment_date).getMonth() === currentMonth).reduce((sum, item) => sum + asAmount(item.amount), 0);
  const previousMonth = new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1);
  const previousMonthValue = payments.filter((item) => { const d = new Date(item.payment_date); return d.getMonth() === previousMonth.getMonth() && d.getFullYear() === previousMonth.getFullYear(); }).reduce((sum, item) => sum + asAmount(item.amount), 0);
  const insightItems = [];
  if (upcoming.some((item) => (new Date(`${item.next_billing_date}T00:00:00`) - new Date(`${today()}T00:00:00`)) / 86400000 <= 7)) insightItems.push({ icon: CalendarClock, tone: 'violet', title: 'Renewals in the next 7 days', detail: `${upcoming.filter((item) => (new Date(`${item.next_billing_date}T00:00:00`) - new Date(`${today()}T00:00:00`)) / 86400000 <= 7).length} active subscription(s) are approaching their next billing date.` });
  if (overdueInvoices.length) insightItems.push({ icon: CircleAlert, tone: 'warning', title: 'Outstanding invoices past due', detail: `${overdueInvoices.length} invoice(s) have an unpaid balance after the due date.` });
  if (previousMonthValue > 0 && Math.abs(thisMonthValue - previousMonthValue) / previousMonthValue >= 0.25) insightItems.push({ icon: thisMonthValue > previousMonthValue ? ArrowUpRight : ArrowDownRight, tone: 'cyan', title: 'Collection movement', detail: `Recorded collections ${thisMonthValue > previousMonthValue ? 'increased' : 'decreased'} by ${Math.round(Math.abs(thisMonthValue - previousMonthValue) / previousMonthValue * 100)}% compared with last month.` });
  if (expiringSoon.length) insightItems.push({ icon: Clock3, tone: 'warning', title: 'Subscriptions nearing expiry', detail: `${expiringSoon.length} active subscription(s) reach their expiry date within 30 days.` });
  const hasRecords = subscriptions.length || invoices.length || payments.length || failedPayments.length || pendingPayments.length;
  const displayName = profile?.full_name?.split(' ')[0] || 'there';

  return (
    <div className="page-wrap dashboard-page">
      <div className="dashboard-welcome"><div><span className="card-kicker">SUBSCRIPTION INTELLIGENCE CENTER</span><h1>{greeting}, {displayName}<span className="greeting-comma">.</span></h1><p>Here’s the current pulse of your subscription workspace.</p></div><div className="welcome-date"><CalendarClock size={16} /><span>{new Intl.DateTimeFormat('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date())}</span></div></div>
      {!hasRecords && <div className="workspace-empty"><div className="empty-orbit"><Activity size={24} /></div><div><h2>Your intelligence center is ready</h2><p>No business records are available yet. As your team adds customers, subscriptions, invoices, and payments, this view will fill with live workspace data.</p><div className="empty-links"><Link to="/customers">Explore customers <ArrowRight size={14} /></Link><Link to="/subscriptions">Explore subscriptions <ArrowRight size={14} /></Link></div></div></div>}
      <div className="kpi-grid">
        <KpiCard icon={Workflow} label="Active subscriptions" value={activeSubscriptions.length.toLocaleString('en-IN')} note={`${subscriptions.filter((item) => item.status === 'PAUSED').length} paused · ${expiringSoon.length} nearing expiry`} tone="violet" to="/subscriptions" />
        <KpiCard icon={TrendingUp} label="Monthly recurring revenue" value={formatInr(mrr)} note="Run rate from active subscription items" tone="cyan" to="/reports" />
        <KpiCard icon={CheckCircle2} label="Collected this month" value={formatInr(collectedThisMonth)} note="Successful payments recorded this month" tone="green" to="/payments" />
        <KpiCard icon={FileText} label="Outstanding balance" value={formatInr(outstanding)} note={`${overdueInvoices.length} overdue invoice(s)`} tone="amber" to="/invoices" />
      </div>
      <div className="dashboard-grid dashboard-grid--primary"><RevenueChart payments={payments} range={range} onRangeChange={setRange} /><section className="surface-card health-card"><div className="card-heading"><div><span className="card-kicker">SUBSCRIPTION HEALTH</span><h2>Lifecycle overview</h2><p>Current records by status.</p></div><span className="heading-icon"><Activity size={17} /></span></div><SubscriptionRing subscriptions={subscriptions} /></section></div>
      <div className="dashboard-grid dashboard-grid--secondary">
        <section className="surface-card list-card"><div className="card-heading"><div><span className="card-kicker">RENEWAL RADAR</span><h2>Coming up next</h2><p>Active subscriptions with a scheduled billing date.</p></div><Link className="small-link" to="/subscriptions">View all <ArrowRight size={13} /></Link></div>{upcoming.length ? <div className="renewal-list">{upcoming.map((item) => <div className="renewal-row" key={item.id}><span className="renewal-icon"><Workflow size={16} /></span><span className="renewal-copy"><b>{customerLabel(item.customers)}</b><small>{item.subscription_number}</small></span><span className="renewal-date"><b>{dateLabel(item.next_billing_date)}</b><small>{item.billing_interval.toLowerCase()} cycle</small></span><span className="status-pill status-pill--active">Active</span></div>)}</div> : <EmptyState title="No upcoming renewals" detail="Scheduled dates for active subscriptions will show here." icon={CalendarClock} />}</section>
        <section className="surface-card list-card payment-watch"><div className="card-heading"><div><span className="card-kicker">PAYMENT WATCH</span><h2>Needs attention</h2><p>Overdue invoices, pending payments, and failed attempts.</p></div><Link className="small-link" to="/invoices">Invoices <ArrowRight size={13} /></Link></div>{overdueInvoices.length || failedPayments.length || pendingPayments.length ? <div className="attention-list">{overdueInvoices.slice(0, 4).map((invoice) => <div className="attention-row" key={invoice.id}><span className="attention-indicator attention-indicator--warning"><CircleAlert size={15} /></span><span><b>{invoice.invoice_number}</b><small>{customerLabel(invoice.customers)} · due {dateLabel(invoice.due_date)}</small></span><strong>{formatInr(invoice.outstanding_amount)}</strong></div>)}{pendingPayments.slice(0, 2).map((payment) => <div className="attention-row" key={`pending-${payment.id}`}><span className="attention-indicator attention-indicator--warning"><Clock3 size={15} /></span><span><b>Pending payment</b><small>{customerLabel(payment.customers)} · {dateLabel(payment.payment_date, { day: 'numeric', month: 'short', year: 'numeric' })}</small></span><strong>{formatInr(payment.amount)}</strong></div>)}{failedPayments.slice(0, 2).map((payment) => <div className="attention-row" key={`failed-${payment.id}`}><span className="attention-indicator attention-indicator--failed"><CreditCard size={15} /></span><span><b>Failed payment</b><small>{customerLabel(payment.customers)} · {dateLabel(payment.payment_date, { day: 'numeric', month: 'short', year: 'numeric' })}</small></span><strong>{formatInr(payment.amount)}</strong></div>)}</div> : <EmptyState title="No payment issues found" detail="Overdue invoices and payment issues will be called out here." icon={CheckCircle2} />}</section>
      </div>
      <div className="dashboard-grid dashboard-grid--tertiary"><section className="surface-card insights-card"><div className="card-heading"><div><span className="card-kicker">SMART INSIGHTS</span><h2>Signals from your records</h2><p>Rule-based summaries from current workspace data.</p></div><span className="heading-icon heading-icon--spark"><Activity size={17} /></span></div>{insightItems.length ? <div className="insights-list">{insightItems.map(({ icon: Icon, tone, title, detail }) => <div className="insight-row" key={title}><span className={`insight-icon insight-icon--${tone}`}><Icon size={15} /></span><span><b>{title}</b><small>{detail}</small></span></div>)}</div> : <EmptyState title={hasRecords ? 'No attention signals right now' : 'Insights will appear here'} detail={hasRecords ? 'Current records do not meet the dashboard alert rules.' : 'Insights are calculated after business records are available.'} icon={Activity} />}</section>
        <section className="surface-card quick-links-card"><span className="card-kicker">WORKSPACE SHORTCUTS</span><h2>Pick up where you need to.</h2><div className="shortcut-grid"><Shortcut to="/customers" icon={Users} title="Customers" detail="Review customer records" /><Shortcut to="/subscriptions" icon={Workflow} title="Subscriptions" detail="Review lifecycle status" /><Shortcut to="/invoices" icon={FileText} title="Invoices" detail="Follow open balances" /><Shortcut to="/reports" icon={TrendingUp} title="Reports" detail="Explore workspace metrics" /></div></section></div>
      <div className="dashboard-footnote"><ShieldCheckIcon /> All figures are calculated from records visible to your authenticated workspace role.</div>
    </div>
  );
}

function KpiCard({ icon: Icon, label, value, note, tone, to }) {
  return <Link className="surface-card kpi-card" to={to}><div className="kpi-top"><span>{label}</span><span className={`kpi-icon kpi-icon--${tone}`}><Icon size={17} /></span></div><strong className="kpi-value">{value}</strong><div className="kpi-bottom"><span>{note}</span><ArrowUpRight size={15} /></div></Link>;
}
function EmptyState({ title, detail, icon: Icon }) { return <div className="empty-state"><span><Icon size={17} /></span><b>{title}</b><p>{detail}</p></div>; }
function Shortcut({ to, icon: Icon, title, detail }) { return <Link className="shortcut-link" to={to}><span><Icon size={16} /></span><b>{title}</b><small>{detail}</small><ArrowRight className="shortcut-arrow" size={13} /></Link>; }
function ShieldCheckIcon() { return <CheckCircle2 size={14} />; }
