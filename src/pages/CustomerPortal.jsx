import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Activity, AlertCircle, ArrowRight, Bell, CalendarClock, CheckCircle2, CircleHelp, CreditCard, Download, FileText, LifeBuoy, LockKeyhole, ReceiptText, RefreshCw, Settings2, ShieldCheck, UserRound, Workflow } from 'lucide-react';
import { supabase } from '../lib/supabase.js';
import { formatInr } from '../lib/currency.js';
import { formatDate } from '../lib/formatDate.js';
import { useAuth } from '../auth/useAuth.js';
import LoadingState from '../components/LoadingState.jsx';
import { Feedback, FormField, Modal, StatusBadge, TableFrame } from '../components/WorkspacePrimitives.jsx';
import { portalNavigation } from '../components/portalNavigation.js';

const today = () => new Date().toISOString().slice(0, 10);
const money = (value) => formatInr(value ?? 0);

export default function CustomerPortal() {
  const { profile, user, session, refreshProfile } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const userId = user?.id;
  const pageKey = location.pathname.split('/')[2] || 'dashboard';
  const page = portalNavigation.find((item) => item.path.endsWith(`/${pageKey}`)) || portalNavigation[0];
  const [data, setData] = useState(null);
  const [customer, setCustomer] = useState(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const [selectedQuote, setSelectedQuote] = useState(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const [securityOpen, setSecurityOpen] = useState(false);
  const [fullName, setFullName] = useState(profile?.full_name || '');
  const [password, setPassword] = useState('');
  const [profileForm, setProfileForm] = useState({ phone: '', business_name: '', tax_identifier: '' });

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setError('');
    setMessage('');
    const { data: customerRow, error: customerError } = await supabase
      .from('customers')
      .select('id,email,phone,business_name,tax_identifier,billing_address,shipping_address,created_at')
      .eq('profile_id', userId)
      .maybeSingle();

    if (customerError || !customerRow) {
      setCustomer(null);
      setData(null);
      setError(customerError?.message || 'Your customer profile is not linked yet. Ask your account administrator to link it.');
      setLoading(false);
      return;
    }

    const customerId = customerRow.id;
    const results = await Promise.all([
      supabase.from('subscriptions').select('id,subscription_number,status,start_date,expiry_date,next_billing_date,billing_interval,auto_renew,billing_cycle_number,created_at,updated_at,plan:plans(id,name,price,billing_interval),subscription_items(id,description,quantity,unit_price,line_total,product:products(name),variant:product_variants!subscription_items_variant_product_fk(name))').eq('customer_id', customerId).order('created_at', { ascending: false }).limit(500),
      supabase.from('invoices').select('id,invoice_number,subscription_id,billing_date,due_date,billing_period_start,billing_period_end,status,total,outstanding_amount,paid_amount,subtotal,tax_amount,discount_amount,created_at,invoice_items(id,description,quantity,unit_price,tax_rate,tax_amount,line_total)').eq('customer_id', customerId).order('billing_date', { ascending: false }).limit(500),
      supabase.from('payments').select('id,invoice_id,amount,status,payment_date,method,reference,notes,invoices(invoice_number)').eq('customer_id', customerId).order('payment_date', { ascending: false }).limit(500),
      supabase.from('quotations').select('id,quotation_number,status,valid_until,subtotal,tax_amount,discount_amount,total,notes,created_at,quotation_items(id,description,quantity,unit_price,tax_rate,tax_amount,line_total)').eq('customer_id', customerId).order('created_at', { ascending: false }).limit(500),
    ]);
    const failed = results.find((result) => result.error);
    if (failed) {
      setCustomer(customerRow);
      setData(null);
      setError(failed.error.message || 'Your account records could not be loaded.');
      setLoading(false);
      return;
    }
    setCustomer(customerRow);
    setData({ subscriptions: results[0].data || [], invoices: results[1].data || [], payments: results[2].data || [], quotations: results[3].data || [] });
    setProfileForm({ phone: customerRow.phone || '', business_name: customerRow.business_name || '', tax_identifier: customerRow.tax_identifier || '' });
    setFullName(profile?.full_name || '');
    setLoading(false);
  }, [userId, profile?.full_name, setProfileForm, setFullName]);

  useEffect(() => { const timer = window.setTimeout(() => { void load(); }, 0); return () => window.clearTimeout(timer); }, [load]);

  const activeCount = data?.subscriptions.filter((item) => item.status === 'ACTIVE').length || 0;
  const due = data?.invoices.reduce((sum, invoice) => sum + Number(invoice.outstanding_amount || 0), 0) || 0;
  const upcoming = useMemo(() => (data?.subscriptions || []).filter((item) => item.status === 'ACTIVE' && item.next_billing_date && item.next_billing_date >= today()).sort((a, b) => a.next_billing_date.localeCompare(b.next_billing_date)), [data]);
  const activity = useMemo(() => [
    ...(data?.invoices || []).map((item) => ({ id: `invoice-${item.id}`, title: `Invoice ${item.invoice_number}`, detail: `${item.status.replaceAll('_', ' ').toLowerCase()} · ${money(item.total)}`, date: item.created_at || item.billing_date, icon: ReceiptText })),
    ...(data?.payments || []).map((item) => ({ id: `payment-${item.id}`, title: `Payment for ${item.invoices?.invoice_number || 'invoice'}`, detail: `${item.status.toLowerCase()} · ${money(item.amount)}`, date: item.payment_date, icon: CreditCard })),
    ...(data?.subscriptions || []).map((item) => ({ id: `subscription-${item.id}`, title: `Subscription ${item.subscription_number}`, detail: `Current status: ${item.status.toLowerCase()}`, date: item.updated_at || item.created_at, icon: Workflow })),
  ].filter((item) => item.date).sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 8), [data]);

  async function saveProfile(event) {
    event.preventDefault();
    if (!customer) return;
    setSaving(true); setError(''); setMessage('');
    const { error: customerError } = await supabase.from('customers').update({ phone: profileForm.phone.trim() || null, business_name: profileForm.business_name.trim() || null, tax_identifier: profileForm.tax_identifier.trim() || null }).eq('id', customer.id);
    if (customerError) setError(customerError.message);
    else {
      const { error: nameError } = await supabase.from('profiles').update({ full_name: fullName.trim() }).eq('id', userId);
      if (nameError) setError(nameError.message);
      else { setMessage('Profile updated.'); setProfileOpen(false); await refreshProfile(session); await load(); }
    }
    setSaving(false);
  }

  async function changePassword(event) {
    event.preventDefault(); setSaving(true); setError(''); setMessage('');
    const { error: updateError } = await supabase.auth.updateUser({ password });
    if (updateError) setError(updateError.message);
    else { setPassword(''); setSecurityOpen(false); setMessage('Password updated.'); }
    setSaving(false);
  }

  if (loading) return <div className="portal-wrap workspace-page"><LoadingState label="Loading your account" /><div className="portal-skeleton">{[0, 1, 2].map((item) => <div className="surface-card skeleton-card" key={item}><i /><b /><span /></div>)}</div></div>;
  if (error && !data) return <div className="portal-wrap workspace-page"><PortalHeading title={page.label} subtitle="Private account information from your Brightloop workspace." /><div className="data-error" role="alert"><AlertCircle size={20} /><div><b>Your account data is unavailable</b><p>{error}</p><button className="button button--secondary button--small" onClick={() => void load()}><RefreshCw size={14} /> Try again</button></div></div></div>;

  return <div className="portal-wrap workspace-page">
    <PortalHeading title={page.label} subtitle={pageKey === 'dashboard' ? `Welcome, ${profile?.full_name?.split(' ')[0] || 'back'}. Here is your account at a glance.` : portalSubtitle(pageKey)} action={pageKey === 'profile' ? <div className="workspace-head-actions"><button className="button button--secondary button--small" onClick={() => setSecurityOpen(true)}><LockKeyhole size={15} /> Change password</button><button className="button button--primary button--small" onClick={() => setProfileOpen(true)}><Settings2 size={15} /> Edit profile</button></div> : null} />
    <Feedback error={error} message={message} />

    {pageKey === 'dashboard' && <DashboardSection data={data} activeCount={activeCount} due={due} upcoming={upcoming} activity={activity} navigate={navigate} />}
    {pageKey === 'subscriptions' && <SubscriptionsSection rows={data.subscriptions} />}
    {pageKey === 'quotations' && <QuotationsSection rows={data.quotations} onSelect={setSelectedQuote} />}
    {pageKey === 'invoices' && <InvoicesSection rows={data.invoices} onSelect={setSelectedInvoice} />}
    {pageKey === 'payments' && <PaymentsSection rows={data.payments} navigate={navigate} />}
    {pageKey === 'notifications' && <NotificationsSection />}
    {pageKey === 'profile' && <ProfileSection customer={customer} profile={profile} user={user} onEdit={() => setProfileOpen(true)} onPassword={() => setSecurityOpen(true)} />}
    {pageKey === 'support' && <SupportSection />}

    {profileOpen && <Modal title="Edit profile" description="Changes apply only to your own customer and profile records." onClose={() => setProfileOpen(false)}><form className="workspace-form" onSubmit={saveProfile}><FormField label="Full name"><input value={fullName} onChange={(event) => setFullName(event.target.value)} maxLength={160} /></FormField><FormField label="Email address"><input type="email" value={customer?.email || user?.email || ''} disabled /></FormField><FormField label="Business name"><input value={profileForm.business_name} onChange={(event) => setProfileForm({ ...profileForm, business_name: event.target.value })} maxLength={200} /></FormField><FormField label="Phone"><input value={profileForm.phone} onChange={(event) => setProfileForm({ ...profileForm, phone: event.target.value })} maxLength={40} /></FormField><FormField label="Tax identifier"><input value={profileForm.tax_identifier} onChange={(event) => setProfileForm({ ...profileForm, tax_identifier: event.target.value })} maxLength={80} /></FormField><Feedback error={error} /><div className="modal-actions"><button className="button button--secondary" type="button" onClick={() => setProfileOpen(false)}>Cancel</button><button className="button button--primary" disabled={saving}>{saving ? 'Saving…' : 'Save profile'}</button></div></form></Modal>}
    {securityOpen && <Modal title="Change password" description="Choose a strong password you do not reuse elsewhere." onClose={() => setSecurityOpen(false)}><form className="workspace-form" onSubmit={changePassword}><FormField label="New password" required><input type="password" autoComplete="new-password" minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} required /></FormField><Feedback error={error} /><div className="modal-actions"><button className="button button--secondary" type="button" onClick={() => setSecurityOpen(false)}>Cancel</button><button className="button button--primary" disabled={saving}>{saving ? 'Updating…' : 'Update password'}</button></div></form></Modal>}
    {selectedInvoice && <InvoiceModal invoice={selectedInvoice} onClose={() => setSelectedInvoice(null)} />}
    {selectedQuote && <QuotationModal quotation={selectedQuote} onClose={() => setSelectedQuote(null)} />}
  </div>;
}

function portalSubtitle(key) {
  return ({ subscriptions: 'Review your plan, billing cadence, renewal dates, and subscription status.', quotations: 'Review quotations addressed to your customer account.', invoices: 'Review invoice totals, due dates, balances, and printable details.', payments: 'Review payment records associated with your invoices.', notifications: 'Account alerts are shown here when a notification feed is configured.', profile: 'Review your account information and manage your sign-in security.', support: 'Find the available way to get help with your Brightloop account.' })[key] || 'Your Brightloop account';
}

function PortalHeading({ title, subtitle, action }) { return <div className="workspace-page-heading portal-page-heading"><div><span className="card-kicker">CUSTOMER PORTAL</span><h1>{title}</h1><p>{subtitle}</p></div>{action}</div>; }
function SectionCard({ title, eyebrow, children, action }) { return <section className="surface-card portal-section"><div className="card-heading"><div><span className="card-kicker">{eyebrow}</span><h2>{title}</h2></div>{action}</div>{children}</section>; }
function PortalEmpty({ icon: Icon = FileText, title, text }) { return <div className="portal-empty"><Icon size={20} /><div><b>{title}</b><p>{text}</p></div></div>; }
function PortalStat({ icon: Icon, label, value, detail }) { return <div className="surface-card portal-stat"><span><Icon size={17} /></span><div><small>{label}</small><b>{value}</b>{detail && <em>{detail}</em>}</div></div>; }

function DashboardSection({ data, activeCount, due, upcoming, activity, navigate }) {
  const recentInvoices = data.invoices.slice(0, 4);
  const recentPayments = data.payments.slice(0, 4);
  return <>
    <div className="portal-kpis"><PortalStat icon={Workflow} label="Active subscriptions" value={activeCount} detail={`${data.subscriptions.length} total subscriptions`} /><PortalStat icon={CalendarClock} label="Next renewal" value={formatDate(upcoming[0]?.next_billing_date)} detail={upcoming[0]?.subscription_number || 'No upcoming renewal'} /><PortalStat icon={ReceiptText} label="Outstanding balance" value={money(due)} detail={`${data.invoices.filter((item) => Number(item.outstanding_amount) > 0).length} invoices with balance`} /></div>
    <div className="portal-dashboard-grid">
      <SectionCard eyebrow="BILLING" title="Recent invoices" action={<button className="text-button" onClick={() => navigate('/portal/invoices')}>All invoices <ArrowRight size={14} /></button>}>
        {recentInvoices.length ? <TableFrame><thead><tr><th>Invoice</th><th>Due date</th><th>Total</th><th>Status</th></tr></thead><tbody>{recentInvoices.map((row) => <tr key={row.id}><td><b>{row.invoice_number}</b></td><td>{formatDate(row.due_date)}</td><td>{money(row.total)}</td><td><StatusBadge value={row.status} /></td></tr>)}</tbody></TableFrame> : <PortalEmpty title="No invoices yet" text="Issued invoices for your account will appear here." />}
      </SectionCard>
      <SectionCard eyebrow="PAYMENTS" title="Recent payments" action={<button className="text-button" onClick={() => navigate('/portal/payments')}>All payments <ArrowRight size={14} /></button>}>
        {recentPayments.length ? <TableFrame><thead><tr><th>Invoice</th><th>Date</th><th>Amount</th><th>Status</th></tr></thead><tbody>{recentPayments.map((row) => <tr key={row.id}><td>{row.invoices?.invoice_number || '—'}</td><td>{formatDate(row.payment_date)}</td><td>{money(row.amount)}</td><td><StatusBadge value={row.status} /></td></tr>)}</tbody></TableFrame> : <PortalEmpty icon={CreditCard} title="No payments yet" text="Payments recorded against your invoices will appear here." />}
      </SectionCard>
      <SectionCard eyebrow="RENEWALS" title="Upcoming renewals" action={<button className="text-button" onClick={() => navigate('/portal/subscriptions')}>Subscriptions <ArrowRight size={14} /></button>}>
        {upcoming.length ? <div className="portal-list">{upcoming.slice(0, 5).map((item) => <div className="portal-list-row" key={item.id}><span className="portal-row-icon"><CalendarClock size={16} /></span><div><b>{item.plan?.name || item.subscription_number}</b><small>{item.subscription_number} · {item.billing_interval.toLowerCase()} billing</small></div><strong>{formatDate(item.next_billing_date)}</strong></div>)}</div> : <PortalEmpty icon={CalendarClock} title="No upcoming renewals" text="There are no active subscriptions with a future billing date." />}
      </SectionCard>
      <SectionCard eyebrow="ACCOUNT ACTIVITY" title="Recent account activity" action={<span className="portal-live-label"><Activity size={14} /> From account records</span>}>
        {activity.length ? <div className="portal-list">{activity.slice(0, 6).map(({ id, title, detail, date, icon: Icon }) => <div className="portal-list-row" key={id}><span className="portal-row-icon"><Icon size={16} /></span><div><b>{title}</b><small>{detail}</small></div><time>{formatDate(date)}</time></div>)}</div> : <PortalEmpty icon={Activity} title="No activity yet" text="Invoices, payments, and subscriptions will appear here as they are recorded." />}
      </SectionCard>
    </div>
  </>;
}

function SubscriptionsSection({ rows }) {
  return <><div className="workspace-info-note"><ShieldCheck size={17} /><span>Subscription records are filtered by your linked customer account and protected by Supabase RLS. To request a pause, cancellation, or plan change, contact your account administrator; this database has no customer request workflow.</span></div><SectionCard eyebrow="YOUR ACCOUNT" title="Subscriptions">
    {rows.length ? <TableFrame><thead><tr><th>Subscription</th><th>Plan / products</th><th>Price snapshots</th><th>Billing cycle</th><th>Next billing</th><th>Period</th><th>Status</th></tr></thead><tbody>{rows.map((row) => <tr key={row.id}><td><b>{row.subscription_number}</b><small className="table-subtext">Started {formatDate(row.start_date)}{row.expiry_date ? ` · ends ${formatDate(row.expiry_date)}` : ''}</small></td><td>{row.plan?.name || 'Product subscription'}<small className="table-subtext">{(row.subscription_items || []).map((line) => line.variant?.name ? `${line.product?.name || line.description} — ${line.variant.name}` : line.product?.name || line.description).join(', ') || 'Details not available'}</small></td><td>{(row.subscription_items || []).map((line) => `${line.quantity} × ${money(line.unit_price)}`).join(', ') || '—'}</td><td>{(row.plan?.billing_interval || row.billing_interval).toLowerCase()}</td><td>{formatDate(row.next_billing_date)}</td><td>{row.billing_cycle_number ? `Cycle ${row.billing_cycle_number}` : '—'}{row.auto_renew ? ' · auto-renew' : ''}</td><td><StatusBadge value={row.status} /></td></tr>)}</tbody></TableFrame> : <PortalEmpty icon={Workflow} title="No subscriptions" text="Subscriptions linked to your account will appear here." />}
  </SectionCard><SectionCard eyebrow="HISTORY" title="Subscription history"><p className="portal-note">Closed and expired subscriptions remain visible in the table above as historical records. The current schema does not provide a separate customer-readable status event history.</p></SectionCard></>;
}

function QuotationsSection({ rows, onSelect }) {
  return <><div className="workspace-info-note"><ShieldCheck size={17} /><span>Only quotations linked to your customer record are queried. The existing quotation transition RPC permits Staff/Admin only; customer accept/reject actions are not available.</span></div><SectionCard eyebrow="YOUR ACCOUNT" title="Quotations">
    {rows.length ? <TableFrame><thead><tr><th>Quotation</th><th>Created</th><th>Valid until</th><th>Subtotal</th><th>Tax</th><th>Discount</th><th>Total</th><th>Status</th><th>Details</th></tr></thead><tbody>{rows.map((row) => <tr key={row.id}><td><b>{row.quotation_number}</b></td><td>{formatDate(row.created_at)}</td><td>{formatDate(row.valid_until)}</td><td>{money(row.subtotal)}</td><td>{money(row.tax_amount)}</td><td>{money(row.discount_amount)}</td><td><b>{money(row.total)}</b></td><td><StatusBadge value={row.status} /></td><td><button className="text-button" onClick={() => onSelect(row)}>View details</button></td></tr>)}</tbody></TableFrame> : <PortalEmpty title="No quotations" text="Quotations addressed to your customer account will appear here." />}
  </SectionCard></>;
}

function InvoicesSection({ rows, onSelect }) {
  return <SectionCard eyebrow="YOUR ACCOUNT" title="Invoices">
    {rows.length ? <TableFrame><thead><tr><th>Invoice</th><th>Issue date</th><th>Due date</th><th>Period</th><th>Total</th><th>Paid</th><th>Balance</th><th>Status</th><th>Document</th></tr></thead><tbody>{rows.map((row) => <tr key={row.id}><td><b>{row.invoice_number}</b></td><td>{formatDate(row.billing_date)}</td><td>{formatDate(row.due_date)}</td><td>{row.billing_period_start ? `${formatDate(row.billing_period_start)} – ${formatDate(row.billing_period_end)}` : '—'}</td><td>{money(row.total)}</td><td>{money(row.paid_amount)}</td><td>{money(row.outstanding_amount)}</td><td><StatusBadge value={row.status} /></td><td><button className="text-button" onClick={() => onSelect(row)}><FileText size={14} /> View / print</button></td></tr>)}</tbody></TableFrame> : <PortalEmpty icon={ReceiptText} title="No invoices" text="Invoices linked to your customer account will appear here." />}
  </SectionCard>;
}

function PaymentsSection({ rows, navigate }) {
  return <><div className="workspace-info-note"><CreditCard size={17} /><span>Payment records are shown from your account history. A separate downloadable receipt is not available in the current schema; invoice details can be printed from My Invoices.</span></div><SectionCard eyebrow="YOUR ACCOUNT" title="Payments">
    {rows.length ? <TableFrame><thead><tr><th>Payment date</th><th>Invoice</th><th>Amount</th><th>Method</th><th>Reference</th><th>Status</th><th>Receipt</th></tr></thead><tbody>{rows.map((row) => <tr key={row.id}><td>{formatDate(row.payment_date)}</td><td>{row.invoices?.invoice_number || '—'}</td><td>{money(row.amount)}</td><td>{row.method.toLowerCase().replaceAll('_', ' ')}</td><td>{row.reference || '—'}</td><td><StatusBadge value={row.status} /></td><td>{row.invoices?.invoice_number ? <button className="text-button" onClick={() => navigate('/portal/invoices')}>Open invoice</button> : '—'}</td></tr>)}</tbody></TableFrame> : <PortalEmpty icon={CreditCard} title="No payments" text="Payment attempts associated with your account will appear here." />}
  </SectionCard></>;
}

function NotificationsSection() {
  return <SectionCard eyebrow="ACCOUNT UPDATES" title="Notifications"><div className="workspace-info-note"><BellIcon /><span>The current database has no notification table or notification RPC. No reminders or alerts are fabricated here.</span></div><PortalEmpty icon={CheckCircle2} title="No notification feed configured" text="Renewal reminders, invoice updates, payment updates, and subscription alerts require a notification backend before they can appear here." /></SectionCard>;
}

function ProfileSection({ customer, profile, user, onEdit, onPassword }) {
  return <><div className="portal-profile-grid"><section className="surface-card portal-profile-card"><span className="portal-profile-icon"><UserRound size={20} /></span><div><span className="card-kicker">PROFILE</span><h2>{profile?.full_name || 'Brightloop customer'}</h2><p>{user?.email}</p></div><button className="button button--secondary button--small" onClick={onEdit}>Edit profile</button></section><section className="surface-card portal-profile-card"><span className="portal-profile-icon"><LockKeyhole size={20} /></span><div><span className="card-kicker">SECURITY</span><h2>Password</h2><p>Update your password for this sign-in account.</p></div><button className="button button--secondary button--small" onClick={onPassword}>Change password</button></section></div><SectionCard eyebrow="ACCOUNT INFORMATION" title="Customer details"><dl className="portal-details"><dt>Email</dt><dd>{customer?.email || user?.email || '—'}</dd><dt>Business name</dt><dd>{customer?.business_name || '—'}</dd><dt>Phone</dt><dd>{customer?.phone || '—'}</dd><dt>Tax identifier</dt><dd>{customer?.tax_identifier || '—'}</dd><dt>Billing address</dt><dd>{formatAddress(customer?.billing_address)}</dd><dt>Shipping address</dt><dd>{formatAddress(customer?.shipping_address)}</dd><dt>Account created</dt><dd>{formatDate(customer?.created_at)}</dd></dl><button className="button button--primary button--small" onClick={onEdit}>Edit permitted details</button></SectionCard></>;
}

function SupportSection() {
  return <SectionCard eyebrow="HELP" title="Contact your account administrator"><div className="support-card"><span className="support-icon"><LifeBuoy size={22} /></span><div><h3>Need help with your account?</h3><p>The current database does not configure a support email, contact number, or secure support-request workflow. Please contact the Brightloop administrator who manages your subscription to ask about billing, plan changes, or account access.</p></div></div><div className="workspace-info-note"><CircleHelp size={17} /><span>A support form will be available once a protected support backend is added. This page does not send or store requests.</span></div></SectionCard>;
}

function InvoiceModal({ invoice, onClose }) {
  return <Modal title={invoice.invoice_number} description={`Due ${formatDate(invoice.due_date)} · ${invoice.status.toLowerCase().replaceAll('_', ' ')}`} wide onClose={onClose}><div className="print-document"><div className="print-document-head"><strong>Brightloop</strong><StatusBadge value={invoice.status} /></div><div className="document-lines">{(invoice.invoice_items || []).map((item) => <div key={item.id}><span>{item.description}<small>{item.quantity} × {money(item.unit_price)} · tax {item.tax_rate}%</small></span><b>{money(item.line_total)}</b></div>)}</div><dl><dt>Subtotal</dt><dd>{money(invoice.subtotal)}</dd><dt>Tax</dt><dd>{money(invoice.tax_amount)}</dd><dt>Discount</dt><dd>−{money(invoice.discount_amount)}</dd><dt>Total</dt><dd><b>{money(invoice.total)}</b></dd><dt>Paid</dt><dd>{money(invoice.paid_amount)}</dd><dt>Balance</dt><dd><b>{money(invoice.outstanding_amount)}</b></dd></dl></div><div className="modal-actions"><button className="button button--secondary" onClick={() => window.print()}><Download size={15} /> Print / Save as PDF</button></div></Modal>;
}

function QuotationModal({ quotation, onClose }) {
  return <Modal title={quotation.quotation_number} description={`Valid until ${formatDate(quotation.valid_until)} · ${quotation.status.toLowerCase()}`} wide onClose={onClose}><div className="document-detail"><div className="document-lines">{(quotation.quotation_items || []).map((item) => <div key={item.id}><span>{item.description}<small>{item.quantity} × {money(item.unit_price)} · tax {item.tax_rate}%</small></span><b>{money(item.line_total)}</b></div>)}</div><dl><dt>Subtotal</dt><dd>{money(quotation.subtotal)}</dd><dt>Tax</dt><dd>{money(quotation.tax_amount)}</dd><dt>Discount</dt><dd>−{money(quotation.discount_amount)}</dd><dt>Total</dt><dd><b>{money(quotation.total)}</b></dd></dl>{quotation.notes && <p className="portal-note">{quotation.notes}</p>}</div></Modal>;
}

function formatAddress(value) {
  if (!value || typeof value !== 'object') return '—';
  return Object.values(value).filter(Boolean).join(', ') || '—';
}

function BellIcon() { return <Bell size={17} />; }
