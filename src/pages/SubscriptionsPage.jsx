import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, CirclePause, Play, Plus, RefreshCw, XCircle } from 'lucide-react';
import { supabase } from '../lib/supabase.js';
import { formatInr } from '../lib/currency.js';
import { formatDate } from '../lib/formatDate.js';
import LoadingState from '../components/LoadingState.jsx';
import { EmptyMessage, Feedback, FormField, Modal, PageHeader, SearchBox, StatusBadge, TableFrame } from '../components/WorkspacePrimitives.jsx';

const intervals = ['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'];
const today = () => new Date().toISOString().slice(0, 10);

export default function SubscriptionsPage() {
  const [rows, setRows] = useState([]); const [customers, setCustomers] = useState([]); const [products, setProducts] = useState([]);
  const [variants, setVariants] = useState([]); const [plans, setPlans] = useState([]); const [planLinks, setPlanLinks] = useState([]); const [taxes, setTaxes] = useState([]);
  const [loading, setLoading] = useState(true); const [saving, setSaving] = useState(false); const [error, setError] = useState('');
  const [search, setSearch] = useState(''); const [filter, setFilter] = useState('ALL'); const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({ customer_id: '', plan_id: '', product_id: '', variant_id: '', billing_interval: 'MONTHLY', start_date: today(), expiry_date: '', quantity: '1', unit_price: '', tax_rate_id: '', auto_renew: true, notes: '' });
  const [details, setDetails] = useState(null);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    const [subscriptionResult, customerResult, productResult, variantResult, planResult, linkResult, taxResult] = await Promise.all([
      supabase.from('subscriptions').select('id,customer_id,plan_id,subscription_number,start_date,expiry_date,billing_interval,next_billing_date,status,auto_renew,billing_cycle_number,notes,created_at,customers(business_name,email),subscription_items(id,description,quantity,unit_price,line_total,tax_rate_id)').order('created_at', { ascending: false }).limit(5000),
      supabase.from('customers').select('id,email,business_name').order('email').limit(2000),
      supabase.from('products_catalog').select('id,name,sales_price,is_active').eq('is_active', true).order('name'),
      supabase.from('product_variants').select('id,product_id,name,additional_price,is_active').eq('is_active', true).order('name'),
      supabase.from('plans').select('id,name,price,billing_interval,minimum_quantity,is_active,available_from,available_until').eq('is_active', true).order('name'),
      supabase.from('plan_products').select('plan_id,product_id,quantity'),
      supabase.from('tax_rates').select('id,name,percentage').eq('is_active', true).order('name'),
    ]);
    const failed = [subscriptionResult, customerResult, productResult, variantResult, planResult, linkResult, taxResult].find((result) => result.error);
    if (failed) setError(failed.error.message || 'Subscription records could not be loaded.');
    else { setRows(subscriptionResult.data || []); setCustomers(customerResult.data || []); setProducts(productResult.data || []); setVariants(variantResult.data || []); setPlans(planResult.data || []); setPlanLinks(linkResult.data || []); setTaxes(taxResult.data || []); }
    setLoading(false);
  }, []);
  useEffect(() => { const timer = window.setTimeout(() => { void load(); }, 0); return () => window.clearTimeout(timer); }, [load]);

  const filtered = useMemo(() => rows.filter((row) => (filter === 'ALL' || row.status === filter) && `${row.subscription_number} ${row.customers?.business_name || ''} ${row.customers?.email || ''}`.toLowerCase().includes(search.trim().toLowerCase())), [rows, filter, search]);
  const selectedPlan = plans.find((plan) => plan.id === form.plan_id);
  const linkedProductIds = selectedPlan ? planLinks.filter((link) => link.plan_id === selectedPlan.id).map((link) => link.product_id) : [];
  const eligibleProducts = products.filter((product) => !selectedPlan || !linkedProductIds.length || linkedProductIds.includes(product.id));

  function openCreate() { setForm({ customer_id: customers[0]?.id || '', plan_id: '', product_id: products[0]?.id || '', variant_id: '', billing_interval: 'MONTHLY', start_date: today(), expiry_date: '', quantity: '1', unit_price: products[0]?.sales_price?.toString() || '', tax_rate_id: '', auto_renew: true, notes: '' }); setError(''); setModalOpen(true); }
  function updateField(key, value) {
    setForm((current) => {
      const next = { ...current, [key]: value };
      if (key === 'plan_id') { const plan = plans.find((item) => item.id === value); if (plan) { next.billing_interval = plan.billing_interval; next.quantity = String(plan.minimum_quantity); next.unit_price = String(plan.price); } }
      if (key === 'product_id') { const product = products.find((item) => item.id === value); next.variant_id = ''; if (!current.plan_id && product) next.unit_price = String(product.sales_price); }
      if (key === 'variant_id' && value) { const selected = variants.find((item) => item.id === value); const product = products.find((item) => item.id === selected?.product_id); next.product_id = product?.id || current.product_id; if (!current.plan_id) next.unit_price = String(Number(product?.sales_price || 0) + Number(selected?.additional_price || 0)); }
      return next;
    });
  }

  async function createSubscription(event) {
    event.preventDefault(); setSaving(true); setError('');
    const product = products.find((item) => item.id === form.product_id);
    const chosenVariant = variants.find((item) => item.id === form.variant_id);
    const plan = plans.find((item) => item.id === form.plan_id);
    const taxRate = taxes.find((item) => item.id === form.tax_rate_id);
    const description = chosenVariant ? `${product?.name || 'Product'} — ${chosenVariant.name}` : plan ? `${plan.name} — ${product?.name || 'Plan item'}` : product?.name || '';
    try {
      const { data, error: rpcError } = await supabase.rpc('create_subscription_with_items', {
        p_subscription: { customer_id: form.customer_id, plan_id: form.plan_id || null, start_date: form.start_date, expiry_date: form.expiry_date || null, billing_interval: form.billing_interval, auto_renew: Boolean(form.auto_renew), notes: form.notes.trim() || null },
        p_items: [{ product_id: form.product_id || null, variant_id: form.variant_id || null, description, quantity: Number(form.quantity), unit_price: Number(form.unit_price), tax_rate_id: form.tax_rate_id || null }],
      });
      if (rpcError) throw rpcError;
      setModalOpen(false); await load();
      setDetails({ id: data, subscription_number: 'New subscription', status: 'PENDING', createdJustNow: true, hint: taxRate ? `Tax rate ${taxRate.name} (${taxRate.percentage}%) is snapshotted for future billing.` : 'No tax rate was selected.' });
    } catch (createError) { setError(createError.message || 'Subscription could not be created.'); }
    finally { setSaving(false); }
  }

  async function lifecycleAction(row, action) {
    setError('');
    if (action === 'close' && !window.confirm(`Close ${row.subscription_number}? This stops future billing and cannot be reopened.`)) return;
    const rpcByAction = { activate: ['activate_subscription', { p_subscription_id: row.id }], pause: ['pause_subscription', { p_subscription_id: row.id, p_reason: 'Paused by workspace operator' }], resume: ['resume_subscription', { p_subscription_id: row.id }], close: ['close_subscription', { p_subscription_id: row.id, p_reason: 'Closed by workspace operator' }] };
    const [name, args] = rpcByAction[action];
    const { error: rpcError } = await supabase.rpc(name, args);
    if (rpcError) setError(rpcError.message || 'Subscription state could not be changed.'); else await load();
  }

  if (loading) return <div className="page-wrap"><LoadingState label="Loading subscriptions" /></div>;
  return <div className="page-wrap workspace-page">
    <PageHeader title="Subscriptions" subtitle="Create subscriptions from saved pricing snapshots and use validated lifecycle transitions." action={<div className="workspace-head-actions"><button className="button button--secondary button--small" onClick={() => void load()}><RefreshCw size={15} /> Refresh</button><button className="button button--primary button--small" onClick={openCreate} disabled={!customers.length || !products.length}><Plus size={16} /> New subscription</button></div>} />
    <Feedback error={error} />
    <div className="workspace-toolbar"><SearchBox value={search} onChange={setSearch} placeholder="Search subscription or customer" /><select value={filter} onChange={(event) => setFilter(event.target.value)} aria-label="Filter subscriptions"><option value="ALL">All statuses</option>{['PENDING','ACTIVE','PAUSED','EXPIRED','CLOSED'].map((status) => <option key={status}>{status}</option>)}</select><span>{filtered.length} record{filtered.length === 1 ? '' : 's'}</span></div>
    {!filtered.length ? <div className="surface-card workspace-empty-card"><EmptyMessage>{search ? 'No subscriptions match your search.' : 'No subscriptions are available.'}</EmptyMessage></div> : <TableFrame><thead><tr><th>Subscription</th><th>Customer</th><th>Plan / items</th><th>Cycle</th><th>Next billing</th><th>Status</th><th>Actions</th></tr></thead><tbody>{filtered.map((row) => <tr key={row.id}><td><b>{row.subscription_number}</b><small className="table-secondary">Cycle {row.billing_cycle_number}</small></td><td>{row.customers?.business_name || row.customers?.email || '—'}</td><td>{row.plan_id ? plans.find((plan) => plan.id === row.plan_id)?.name || 'Saved plan' : 'Custom'}<small className="table-secondary">{(row.subscription_items || []).map((item) => item.description).join(', ')}</small></td><td>{row.billing_interval.toLowerCase()}</td><td>{formatDate(row.next_billing_date)}</td><td><StatusBadge value={row.status} /></td><td><div className="table-actions">
      {row.status === 'PENDING' && <button className="icon-button" title="Activate" aria-label={`Activate ${row.subscription_number}`} onClick={() => void lifecycleAction(row, 'activate')}><Check size={16} /></button>}
      {row.status === 'ACTIVE' && <button className="icon-button" title="Pause" aria-label={`Pause ${row.subscription_number}`} onClick={() => void lifecycleAction(row, 'pause')}><CirclePause size={16} /></button>}
      {row.status === 'PAUSED' && <button className="icon-button" title="Resume" aria-label={`Resume ${row.subscription_number}`} onClick={() => void lifecycleAction(row, 'resume')}><Play size={16} /></button>}
      {['PENDING','ACTIVE','PAUSED','EXPIRED'].includes(row.status) && <button className="icon-button" title="Close" aria-label={`Close ${row.subscription_number}`} onClick={() => void lifecycleAction(row, 'close')}><XCircle size={16} /></button>}
      <button className="text-button" onClick={() => setDetails(row)}>Details</button>
    </div></td></tr>)}</tbody></TableFrame>}
    {modalOpen && <Modal title="Create subscription" description="The database starts the subscription as pending. Activate it after confirming the details." wide onClose={() => setModalOpen(false)}><form className="workspace-form" onSubmit={createSubscription}>
      <div className="form-grid"><FormField label="Customer" required><select value={form.customer_id} onChange={(event) => updateField('customer_id', event.target.value)} required><option value="">Choose a customer</option>{customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.business_name || customer.email}</option>)}</select></FormField><FormField label="Plan (optional)"><select value={form.plan_id} onChange={(event) => updateField('plan_id', event.target.value)}><option value="">Custom subscription</option>{plans.map((plan) => <option key={plan.id} value={plan.id}>{plan.name} · {formatInr(plan.price)} / {plan.billing_interval.toLowerCase()}</option>)}</select></FormField><FormField label="Product" required><select value={form.product_id} onChange={(event) => updateField('product_id', event.target.value)} required><option value="">Choose a product</option>{eligibleProducts.map((product) => <option key={product.id} value={product.id}>{product.name} · {formatInr(product.sales_price)}</option>)}</select></FormField><FormField label="Variant"><select value={form.variant_id} onChange={(event) => updateField('variant_id', event.target.value)}><option value="">No variant</option>{variants.filter((item) => item.product_id === form.product_id).map((item) => <option key={item.id} value={item.id}>{item.name} (+{formatInr(item.additional_price)})</option>)}</select></FormField><FormField label="Billing interval" required><select value={form.billing_interval} onChange={(event) => updateField('billing_interval', event.target.value)}>{intervals.map((interval) => <option key={interval}>{interval}</option>)}</select></FormField><FormField label="Tax rate"><select value={form.tax_rate_id} onChange={(event) => updateField('tax_rate_id', event.target.value)}><option value="">No tax</option>{taxes.map((tax) => <option key={tax.id} value={tax.id}>{tax.name} · {tax.percentage}%</option>)}</select></FormField><FormField label="Quantity" required><input type="number" min="0.01" step="0.01" value={form.quantity} onChange={(event) => updateField('quantity', event.target.value)} required /></FormField><FormField label="Unit price (INR)" required><input type="number" min="0" step="0.01" value={form.unit_price} onChange={(event) => updateField('unit_price', event.target.value)} required /></FormField><FormField label="Start date" required><input type="date" value={form.start_date} onChange={(event) => updateField('start_date', event.target.value)} required /></FormField><FormField label="Expiry date"><input type="date" min={form.start_date} value={form.expiry_date} onChange={(event) => updateField('expiry_date', event.target.value)} /></FormField></div>
      <FormField label="Notes"><textarea rows="3" value={form.notes} onChange={(event) => updateField('notes', event.target.value)} maxLength={2000} /></FormField><label className="workspace-checkbox"><input type="checkbox" checked={form.auto_renew} onChange={(event) => updateField('auto_renew', event.target.checked)} /> Auto-renew</label>
      <p className="workspace-help">The unit price is snapshotted in the subscription item. Billing-cycle dates and taxes are validated by the database.</p><Feedback error={error} /><div className="modal-actions"><button className="button button--secondary" type="button" onClick={() => setModalOpen(false)}>Cancel</button><button className="button button--primary" type="submit" disabled={saving}>{saving ? 'Creating…' : 'Create pending subscription'}</button></div>
    </form></Modal>}
    {details && <Modal title={details.subscription_number} description="Subscription and immutable item price snapshots." wide onClose={() => setDetails(null)}><div className="detail-summary"><StatusBadge value={details.status} />{details.hint && <p>{details.hint}</p>}{details.subscription_items?.map((item) => <article key={item.id}><b>{item.description}</b><span>{item.quantity} × {formatInr(item.unit_price)} = {formatInr(item.line_total)}</span></article>)}{details.createdJustNow && <p>Created successfully. Refresh the table to confirm the database record.</p>}</div></Modal>}
  </div>;
}
