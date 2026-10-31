import { useCallback, useEffect, useState } from 'react';
import { Download, KeyRound, Plus, RefreshCw, Save, ShieldCheck, Users } from 'lucide-react';
import { supabase } from '../lib/supabase.js';
import { formatInr } from '../lib/currency.js';
import { formatDate } from '../lib/formatDate.js';
import { useAuth } from '../auth/useAuth.js';
import LoadingState from '../components/LoadingState.jsx';
import { EmptyMessage, Feedback, FormField, Modal, PageHeader, SearchBox, StatusBadge, TableFrame } from '../components/WorkspacePrimitives.jsx';

const discountTypes = ['FIXED', 'PERCENTAGE'];
const scopes = ['ALL', 'PRODUCTS', 'PLANS'];
const today = () => new Date().toISOString().slice(0, 10);
const asNumber = (value) => Number(value || 0);

async function fetchAllRows(makeQuery, pageSize = 1000, maxRows = 50000) {
  const collected = [];
  for (let offset = 0; offset < maxRows; offset += pageSize) {
    const { data, error } = await makeQuery().range(offset, offset + pageSize - 1);
    if (error) throw error;
    collected.push(...(data || []));
    if (!data || data.length < pageSize) return collected;
  }
  throw new Error(`Report data exceeded the ${maxRows.toLocaleString('en-IN')} row safety limit.`);
}

export default function SystemPages({ kind }) {
  if (kind === 'discounts') return <DiscountsPage />;
  if (kind === 'reports') return <ReportsPage />;
  return <SettingsPage />;
}

function DiscountsPage() {
  const { profile } = useAuth(); const isAdmin = profile?.role === 'ADMIN';
  const [rows, setRows] = useState([]); const [usage, setUsage] = useState([]); const [loading, setLoading] = useState(true); const [error, setError] = useState('');
  const [search, setSearch] = useState(''); const [open, setOpen] = useState(false); const [editing, setEditing] = useState(null); const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: '', discount_type: 'PERCENTAGE', value: '', minimum_purchase: '0', minimum_quantity: '1', starts_at: '', ends_at: '', usage_limit: '', scope: 'ALL', is_active: true });
  const load = useCallback(async () => {
    setLoading(true); setError('');
    const [discountResult, usageResult] = await Promise.all([
      supabase.from('discounts').select('id,name,discount_type,value,currency_code,minimum_purchase,minimum_quantity,starts_at,ends_at,usage_limit,used_count,scope,is_active,created_at').order('created_at', { ascending: false }).limit(2000),
      supabase.from('discount_usages').select('id,discount_id,customer_id,invoice_id,amount,is_reversed,used_at,customers(business_name,email),invoices(invoice_number)').order('used_at', { ascending: false }).limit(500),
    ]);
    const failed = [discountResult, usageResult].find((result) => result.error);
    if (failed) setError(failed.error.message || 'Discount configuration could not be loaded.');
    else { setRows(discountResult.data || []); setUsage(usageResult.data || []); }
    setLoading(false);
  }, []);
  useEffect(() => { const timer = window.setTimeout(() => { void load(); }, 0); return () => window.clearTimeout(timer); }, [load]);
  const filtered = rows.filter((row) => `${row.name} ${row.discount_type} ${row.scope}`.toLowerCase().includes(search.trim().toLowerCase()));
  function startCreate() { setEditing(null); setForm({ name: '', discount_type: 'PERCENTAGE', value: '', minimum_purchase: '0', minimum_quantity: '1', starts_at: '', ends_at: '', usage_limit: '', scope: 'ALL', is_active: true }); setError(''); setOpen(true); }
  function startEdit(row) { setEditing(row); setForm({ name: row.name, discount_type: row.discount_type, value: String(row.value), minimum_purchase: String(row.minimum_purchase), minimum_quantity: String(row.minimum_quantity), starts_at: row.starts_at?.slice(0, 16) || '', ends_at: row.ends_at?.slice(0, 16) || '', usage_limit: row.usage_limit == null ? '' : String(row.usage_limit), scope: row.scope, is_active: row.is_active }); setError(''); setOpen(true); }
  async function save(event) {
    event.preventDefault(); setSaving(true); setError('');
    const payload = { name: form.name.trim(), discount_type: form.discount_type, value: Number(form.value), minimum_purchase: Number(form.minimum_purchase || 0), minimum_quantity: Number(form.minimum_quantity), starts_at: form.starts_at ? new Date(form.starts_at).toISOString() : null, ends_at: form.ends_at ? new Date(form.ends_at).toISOString() : null, usage_limit: form.usage_limit === '' ? null : Number(form.usage_limit), scope: form.scope, is_active: Boolean(form.is_active) };
    try {
      const result = editing ? await supabase.from('discounts').update(payload).eq('id', editing.id) : await supabase.from('discounts').insert({ ...payload, created_by: profile.id });
      if (result.error) throw result.error;
      setOpen(false); await load();
    } catch (saveError) { setError(saveError.message || 'Discount could not be saved.'); }
    finally { setSaving(false); }
  }
  async function toggle(row) { const { error: updateError } = await supabase.from('discounts').update({ is_active: !row.is_active }).eq('id', row.id); if (updateError) setError(updateError.message); else await load(); }
  if (loading) return <div className="page-wrap"><LoadingState label="Loading discounts" /></div>;
  return <div className="page-wrap workspace-page"><PageHeader title="Discounts" subtitle="Configure fixed and percentage discounts with database-enforced eligibility and usage limits." action={<div className="workspace-head-actions"><button className="button button--secondary button--small" onClick={() => void load()}><RefreshCw size={15} /> Refresh</button>{isAdmin && <button className="button button--primary button--small" onClick={startCreate}><Plus size={16} /> New discount</button>}</div>} /><Feedback error={error} /><div className="workspace-toolbar"><SearchBox value={search} onChange={setSearch} placeholder="Search discounts" /><span>{filtered.length} rules</span></div>
    {!filtered.length ? <div className="surface-card workspace-empty-card"><EmptyMessage>No discount rules are available.</EmptyMessage></div> : <TableFrame><thead><tr><th>Name</th><th>Value</th><th>Minimum</th><th>Used</th><th>Validity</th><th>Scope</th><th>Status</th>{isAdmin && <th>Actions</th>}</tr></thead><tbody>{filtered.map((row) => <tr key={row.id}><td><b>{row.name}</b></td><td>{row.discount_type === 'PERCENTAGE' ? `${row.value}%` : formatInr(row.value)}</td><td>{formatInr(row.minimum_purchase)} · {row.minimum_quantity} qty</td><td>{row.used_count}{row.usage_limit == null ? ' / ∞' : ` / ${row.usage_limit}`}</td><td>{formatDate(row.starts_at)} – {formatDate(row.ends_at)}</td><td>{row.scope.toLowerCase()}</td><td><StatusBadge value={row.is_active ? (row.usage_limit != null && row.used_count >= row.usage_limit ? 'EXHAUSTED' : 'ACTIVE') : 'INACTIVE'} /></td>{isAdmin && <td><div className="table-actions"><button className="text-button" onClick={() => startEdit(row)}>Edit</button><button className="text-button" onClick={() => void toggle(row)}>{row.is_active ? 'Deactivate' : 'Activate'}</button></div></td>}</tr>)}</tbody></TableFrame>}
    <section className="surface-card audit-card"><div className="card-heading"><div><span className="card-kicker">USAGE LEDGER</span><h2>Recent discount usage</h2><p>Usage reservations are created with invoices and reversed when eligible invoices are voided.</p></div></div>{usage.length ? <div className="audit-list">{usage.slice(0, 20).map((item) => <article key={item.id}><b>{rows.find((row) => row.id === item.discount_id)?.name || 'Discount'} · {formatInr(item.amount)}</b><span>{item.customers?.business_name || item.customers?.email || 'Customer'} · {item.invoices?.invoice_number || 'Invoice not linked'}</span><small>{formatDate(item.used_at)}{item.is_reversed ? ' · reversed' : ''}</small></article>)}</div> : <EmptyMessage>No discount usage has been recorded.</EmptyMessage>}</section>
    {open && <Modal title={`${editing ? 'Edit' : 'Create'} discount`} description="Usage counters are maintained by invoice reservations; they cannot be edited here." onClose={() => setOpen(false)}><form className="workspace-form" onSubmit={save}><FormField label="Name" required><input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required maxLength={160} /></FormField><div className="form-grid"><FormField label="Type" required><select value={form.discount_type} onChange={(event) => setForm({ ...form, discount_type: event.target.value })}>{discountTypes.map((type) => <option key={type}>{type}</option>)}</select></FormField><FormField label={form.discount_type === 'PERCENTAGE' ? 'Percentage' : 'Amount (INR)'} required><input type="number" min="0.01" max={form.discount_type === 'PERCENTAGE' ? 100 : undefined} step="0.01" value={form.value} onChange={(event) => setForm({ ...form, value: event.target.value })} required /></FormField><FormField label="Minimum purchase (INR)"><input type="number" min="0" step="0.01" value={form.minimum_purchase} onChange={(event) => setForm({ ...form, minimum_purchase: event.target.value })} /></FormField><FormField label="Minimum quantity"><input type="number" min="1" step="1" value={form.minimum_quantity} onChange={(event) => setForm({ ...form, minimum_quantity: event.target.value })} required /></FormField><FormField label="Usage limit"><input type="number" min={editing?.used_count || 0} step="1" value={form.usage_limit} onChange={(event) => setForm({ ...form, usage_limit: event.target.value })} placeholder="Unlimited" /></FormField><FormField label="Scope"><select value={form.scope} onChange={(event) => setForm({ ...form, scope: event.target.value })}>{scopes.map((scope) => <option key={scope}>{scope}</option>)}</select></FormField><FormField label="Starts at"><input type="datetime-local" value={form.starts_at} onChange={(event) => setForm({ ...form, starts_at: event.target.value })} /></FormField><FormField label="Ends at"><input type="datetime-local" min={form.starts_at || undefined} value={form.ends_at} onChange={(event) => setForm({ ...form, ends_at: event.target.value })} /></FormField></div><label className="workspace-checkbox"><input type="checkbox" checked={form.is_active} onChange={(event) => setForm({ ...form, is_active: event.target.checked })} /> Active</label><Feedback error={error} /><div className="modal-actions"><button className="button button--secondary" type="button" onClick={() => setOpen(false)}>Cancel</button><button className="button button--primary" disabled={saving}>{saving ? 'Saving…' : 'Save discount'}</button></div></form></Modal>}
  </div>;
}

function ReportsPage() {
  const [loading, setLoading] = useState(true); const [error, setError] = useState(''); const [data, setData] = useState(null);
  const load = useCallback(async () => {
    setLoading(true); setError('');
    const cutoff = new Date(); cutoff.setMonth(cutoff.getMonth() - 11, 1);
    try {
      const [customers, subscriptions, invoices, payments] = await Promise.all([
        fetchAllRows(() => supabase.from('customers').select('id,created_at').order('created_at')),
        fetchAllRows(() => supabase.from('subscriptions').select('id,status,billing_interval,start_date,next_billing_date,plan_id,created_at,subscription_items(quantity,unit_price),plans(name)').order('created_at')),
        fetchAllRows(() => supabase.from('invoices').select('id,invoice_number,status,total,paid_amount,outstanding_amount,due_date,billing_date,subscription_id').order('billing_date')),
        fetchAllRows(() => supabase.from('payments').select('id,amount,status,payment_date,invoice_id,invoices(subscription_id)').gte('payment_date', cutoff.toISOString()).order('payment_date')),
      ]);
      setData({ customers, subscriptions, invoices, payments });
    } catch (reportError) { setError(reportError.message || 'Reports could not be loaded.'); }
    setLoading(false);
  }, []);
  useEffect(() => { const timer = window.setTimeout(() => { void load(); }, 0); return () => window.clearTimeout(timer); }, [load]);
  if (loading) return <div className="page-wrap"><LoadingState label="Calculating reports from current records" /></div>;
  if (error) return <div className="page-wrap workspace-page"><PageHeader title="Reports" subtitle="Live summaries calculated from workspace records." /><Feedback error={error} /><button className="button button--secondary" onClick={() => void load()}><RefreshCw size={15} /> Retry</button></div>;
  const { customers, subscriptions, invoices, payments } = data;
  const successfulPayments = payments.filter((item) => item.status === 'SUCCEEDED');
  const totalCollected = successfulPayments.reduce((sum, item) => sum + asNumber(item.amount), 0);
  const outstanding = invoices.reduce((sum, item) => sum + asNumber(item.outstanding_amount), 0);
  const overdue = invoices.filter((item) => asNumber(item.outstanding_amount) > 0 && item.due_date < today());
  const active = subscriptions.filter((item) => item.status === 'ACTIVE');
  const intervalFactor = { DAILY: 365 / 12, WEEKLY: 52 / 12, MONTHLY: 1, YEARLY: 1 / 12 };
  const mrr = active.reduce((total, item) => total + (item.subscription_items || []).reduce((sum, line) => sum + asNumber(line.quantity) * asNumber(line.unit_price) * (intervalFactor[item.billing_interval] || 0), 0), 0);
  const monthKeys = Array.from({ length: 12 }, (_, index) => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - (11 - index)); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; });
  const months = monthKeys.map((key) => ({ key, revenue: successfulPayments.filter((payment) => String(payment.payment_date).slice(0, 7) === key).reduce((sum, payment) => sum + asNumber(payment.amount), 0), customers: customers.filter((row) => String(row.created_at).slice(0, 7) === key).length, subscriptions: subscriptions.filter((row) => String(row.created_at).slice(0, 7) === key).length }));
  const plans = new Map();
  successfulPayments.forEach((payment) => { const subscriptionId = payment.invoices?.subscription_id; const subscription = subscriptions.find((item) => item.id === subscriptionId); if (subscription?.plans?.name) plans.set(subscription.plans.name, (plans.get(subscription.plans.name) || 0) + asNumber(payment.amount)); });
  function exportCsv() {
    const escape = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`;
    const lines = [['Month','Successful payments INR','New customers','New subscriptions'], ...months.map((item) => [item.key,item.revenue.toFixed(2),item.customers,item.subscriptions])];
    const csv = lines.map((row) => row.map(escape).join(',')).join('\r\n'); const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' })); const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'brightloop-monthly-report.csv'; anchor.click(); URL.revokeObjectURL(url);
  }
  return <div className="page-wrap workspace-page"><PageHeader title="Reports" subtitle="Collections, subscription growth, customer growth and invoice balances from live records." action={<div className="workspace-head-actions"><button className="button button--secondary button--small" onClick={() => void load()}><RefreshCw size={15} /> Refresh</button><button className="button button--primary button--small" onClick={exportCsv}><Download size={15} /> Export monthly CSV</button></div>} />
    <div className="report-kpi-grid"><ReportKpi label="Collected (12 months)" value={formatInr(totalCollected)} /><ReportKpi label="Monthly recurring run rate" value={formatInr(mrr)} /><ReportKpi label="Outstanding" value={formatInr(outstanding)} /><ReportKpi label="Overdue invoices" value={overdue.length.toLocaleString('en-IN')} /></div>
    <div className="reports-grid"><section className="surface-card report-card"><div className="card-heading"><div><span className="card-kicker">MONTHLY TREND</span><h2>Revenue and growth</h2><p>Only successful payment records count as collected revenue.</p></div></div><TableFrame><thead><tr><th>Month</th><th>Collected</th><th>New customers</th><th>New subscriptions</th></tr></thead><tbody>{months.map((item) => <tr key={item.key}><td>{item.key}</td><td>{formatInr(item.revenue)}</td><td>{item.customers}</td><td>{item.subscriptions}</td></tr>)}</tbody></TableFrame></section><section className="surface-card report-card"><div className="card-heading"><div><span className="card-kicker">INVOICE HEALTH</span><h2>Balances and overdue</h2></div></div><div className="report-list"><div><span>Outstanding invoices</span><b>{invoices.filter((item) => asNumber(item.outstanding_amount) > 0).length}</b></div><div><span>Overdue balance</span><b>{formatInr(overdue.reduce((sum, item) => sum + asNumber(item.outstanding_amount), 0))}</b></div><div><span>Paid invoices</span><b>{invoices.filter((item) => item.status === 'PAID').length}</b></div><div><span>Failed payments</span><b>{payments.filter((item) => item.status === 'FAILED').length}</b></div></div><h3 className="report-subheading">Plan-associated collections</h3>{plans.size ? <div className="report-list">{[...plans.entries()].sort((a,b) => b[1]-a[1]).map(([name,amount]) => <div key={name}><span>{name}</span><b>{formatInr(amount)}</b></div>)}</div> : <EmptyMessage>No successful payments are linked to a subscription plan.</EmptyMessage>}</section></div>
  </div>;
}
function ReportKpi({ label, value }) { return <article className="surface-card report-kpi"><span>{label}</span><b>{value}</b></article>; }

function SettingsPage() {
  const { user, profile } = useAuth(); const isAdmin = profile?.role === 'ADMIN';
  const [settings, setSettings] = useState(null); const [taxes, setTaxes] = useState([]); const [staff, setStaff] = useState([]); const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true); const [error, setError] = useState(''); const [message, setMessage] = useState(''); const [saving, setSaving] = useState(false);
  const [fullName, setFullName] = useState(profile?.full_name || ''); const [password, setPassword] = useState(''); const [dueDays, setDueDays] = useState('7');
  const [taxOpen, setTaxOpen] = useState(false); const [taxForm, setTaxForm] = useState({ name: '', percentage: '', is_active: true }); const [inviteForm, setInviteForm] = useState({ email: '', full_name: '' }); const [inviteRequestId, setInviteRequestId] = useState(() => crypto.randomUUID());
  const load = useCallback(async () => {
    setLoading(true); setError('');
    const taxPromise = supabase.from('tax_rates').select('id,name,percentage,is_active,created_at').order('name');
    const requests = [taxPromise];
    if (isAdmin) requests.push(supabase.from('app_settings').select('id,singleton,default_currency,invoice_due_days').eq('singleton', true).maybeSingle(), supabase.from('profiles').select('id,full_name,is_active,created_at').eq('role', 'STAFF').order('created_at', { ascending: false }), supabase.from('audit_logs').select('id,user_id,action,entity,record_id,occurred_at').order('occurred_at', { ascending: false }).limit(100));
    const results = await Promise.all(requests); const failed = results.find((item) => item.error);
    if (failed) setError(failed.error.message || 'Settings could not be loaded.');
    else { setTaxes(results[0].data || []); if (isAdmin) { setSettings(results[1].data); setDueDays(String(results[1].data?.invoice_due_days ?? 7)); setStaff(results[2].data || []); setLogs(results[3].data || []); } }
    setLoading(false);
  }, [isAdmin]);
  useEffect(() => { const timer = window.setTimeout(() => { void load(); }, 0); return () => window.clearTimeout(timer); }, [load]);
  async function updateProfile(event) { event.preventDefault(); setSaving(true); setError(''); setMessage(''); const { error: updateError } = await supabase.from('profiles').update({ full_name: fullName.trim() }).eq('id', user.id); if (updateError) setError(updateError.message); else setMessage('Profile name updated.'); setSaving(false); }
  async function changePassword(event) { event.preventDefault(); setSaving(true); setError(''); setMessage(''); const { error: updateError } = await supabase.auth.updateUser({ password }); if (updateError) setError(updateError.message); else { setPassword(''); setMessage('Password updated successfully.'); } setSaving(false); }
  async function saveSettings(event) { event.preventDefault(); if (!settings) return; setSaving(true); setError(''); setMessage(''); const { error: updateError } = await supabase.from('app_settings').update({ invoice_due_days: Number(dueDays) }).eq('id', settings.id); if (updateError) setError(updateError.message); else { setMessage('Invoice payment terms saved.'); await load(); } setSaving(false); }
  async function saveTax(event) { event.preventDefault(); setSaving(true); setError(''); const { error: insertError } = await supabase.from('tax_rates').insert({ name: taxForm.name.trim(), percentage: Number(taxForm.percentage), is_active: taxForm.is_active, created_by: profile.id }); if (insertError) setError(insertError.message); else { setTaxOpen(false); setTaxForm({ name: '', percentage: '', is_active: true }); await load(); } setSaving(false); }
  async function toggleTax(row) { const { error: updateError } = await supabase.from('tax_rates').update({ is_active: !row.is_active }).eq('id', row.id); if (updateError) setError(updateError.message); else await load(); }
  async function inviteStaff(event) { event.preventDefault(); setSaving(true); setError(''); setMessage(''); const { data, error: invokeError } = await supabase.functions.invoke('staff-accounts', { body: { action: 'create', email: inviteForm.email.trim(), full_name: inviteForm.full_name.trim(), idempotency_key: inviteRequestId } }); if (invokeError) setError(invokeError.message || 'Staff invitation failed. Retry with the same request.'); else if (data?.error) setError(data.error); else { setMessage(`Staff invitation sent to ${inviteForm.email.trim()}.`); setInviteForm({ email: '', full_name: '' }); setInviteRequestId(crypto.randomUUID()); await load(); } setSaving(false); }
  async function setStaffActive(row, active) { setError(''); const { data, error: invokeError } = await supabase.functions.invoke('staff-accounts', { body: { action: 'set_active', user_id: row.id, active } }); if (invokeError) setError(invokeError.message || 'Staff status could not be changed.'); else if (data?.error) setError(data.error); else { setMessage(active ? 'Staff reactivated; password recovery is required.' : 'Staff deactivated.'); await load(); } }
  if (loading) return <div className="page-wrap"><LoadingState label="Loading settings" /></div>;
  return <div className="page-wrap workspace-page"><PageHeader title="Settings" subtitle="Manage your own access, configured tax rates, invoice due terms and staff access." action={<button className="button button--secondary button--small" onClick={() => void load()}><RefreshCw size={15} /> Refresh</button>} /><Feedback error={error} message={message} />
    {!isAdmin && <div className="workspace-info-note"><ShieldCheck size={17} /><span>Global settings and staff access are administrator-only. You can update your own profile and password.</span></div>}
    <div className="settings-grid"><section className="surface-card settings-card"><div className="card-heading"><div><span className="card-kicker">YOUR ACCOUNT</span><h2>Profile and security</h2><p>{user?.email}</p></div></div><form className="workspace-form" onSubmit={updateProfile}><FormField label="Full name"><input value={fullName} onChange={(event) => setFullName(event.target.value)} maxLength={160} /></FormField><button className="button button--secondary button--small" disabled={saving}><Save size={14} /> Save profile</button></form><form className="workspace-form settings-password-form" onSubmit={changePassword}><FormField label="New password"><input type="password" autoComplete="new-password" minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} required /></FormField><button className="button button--secondary button--small" disabled={saving}><KeyRound size={14} /> Update password</button></form></section>
      {isAdmin && <section className="surface-card settings-card"><div className="card-heading"><div><span className="card-kicker">BILLING DEFAULTS</span><h2>Invoice settings</h2><p>All amounts are stored and presented in INR.</p></div></div><form className="workspace-form" onSubmit={saveSettings}><FormField label="Currency"><input value={settings?.default_currency || 'INR'} disabled /></FormField><FormField label="Invoice due days" hint="Applied when a new invoice has no explicit due date."><input type="number" min="0" max="365" step="1" value={dueDays} onChange={(event) => setDueDays(event.target.value)} required /></FormField><button className="button button--primary button--small" disabled={saving}><Save size={14} /> Save billing defaults</button></form><div className="workspace-help">The current schema has no business name, address, logo, payment gateway, or email template settings.</div></section>}
      <section className="surface-card settings-card settings-tax-card"><div className="card-heading"><div><span className="card-kicker">CONFIGURED TAX</span><h2>Tax rates</h2><p>Documents snapshot the active configured rate when created.</p></div>{isAdmin && <button className="button button--secondary button--small" onClick={() => { setTaxForm({ name: '', percentage: '', is_active: true }); setTaxOpen(true); }}><Plus size={14} /> Add tax rate</button>}</div>{taxes.length ? <div className="audit-list">{taxes.map((tax) => <article key={tax.id}><b>{tax.name} · {tax.percentage}%</b><span>{tax.is_active ? 'Available for new records' : 'Inactive; retained for history'}</span>{isAdmin && tax.is_active && <button className="text-button" onClick={() => void toggleTax(tax)}>Deactivate</button>}</article>)}</div> : <EmptyMessage>No tax rates are configured.</EmptyMessage>}</section>
      {isAdmin && <section className="surface-card settings-card"><div className="card-heading"><div><span className="card-kicker">STAFF ACCESS</span><h2>Invite staff</h2><p>Staff accounts are provisioned through the Admin-authorized Edge Function.</p></div><Users size={18} /></div><form className="workspace-form" onSubmit={inviteStaff}><div className="form-grid"><FormField label="Full name" required><input value={inviteForm.full_name} onChange={(event) => setInviteForm({ ...inviteForm, full_name: event.target.value })} required maxLength={160} /></FormField><FormField label="Email" required><input type="email" value={inviteForm.email} onChange={(event) => setInviteForm({ ...inviteForm, email: event.target.value })} required maxLength={320} /></FormField></div><button className="button button--primary button--small" disabled={saving}><Plus size={14} /> Invite staff</button></form><div className="audit-list staff-list">{staff.map((person) => <article key={person.id}><b>{person.full_name || 'Staff user'}</b><span>UUID {person.id} · created {formatDate(person.created_at)}</span><StatusBadge value={person.is_active ? 'ACTIVE' : 'INACTIVE'} /><button className="text-button" onClick={() => void setStaffActive(person, !person.is_active)}>{person.is_active ? 'Deactivate' : 'Reactivate'}</button></article>)}</div></section>}
      {isAdmin && <section className="surface-card settings-card settings-audit"><div className="card-heading"><div><span className="card-kicker">ADMIN ONLY</span><h2>Activity log</h2></div></div>{logs.length ? <div className="audit-list">{logs.slice(0, 30).map((log) => <article key={log.id}><b>{log.action} · {log.entity}</b><span>Actor {log.user_id || 'system'} · record {log.record_id || '—'}</span><small>{formatDate(log.occurred_at)}</small></article>)}</div> : <EmptyMessage>No audit events have been recorded.</EmptyMessage>}</section>}
    </div>
    {taxOpen && <Modal title="Add tax rate" description="Only configured active tax rates can be selected for new documents." onClose={() => setTaxOpen(false)}><form className="workspace-form" onSubmit={saveTax}><FormField label="Rate name" required><input value={taxForm.name} onChange={(event) => setTaxForm({ ...taxForm, name: event.target.value })} required maxLength={120} /></FormField><FormField label="Percentage" required><input type="number" min="0" max="100" step="0.01" value={taxForm.percentage} onChange={(event) => setTaxForm({ ...taxForm, percentage: event.target.value })} required /></FormField><Feedback error={error} /><div className="modal-actions"><button className="button button--secondary" type="button" onClick={() => setTaxOpen(false)}>Cancel</button><button className="button button--primary" disabled={saving}>{saving ? 'Saving…' : 'Create tax rate'}</button></div></form></Modal>}
  </div>;
}

