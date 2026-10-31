import { useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react';
import { Eye, Pencil, Plus, RefreshCw, UserRound } from 'lucide-react';
import { supabase } from '../lib/supabase.js';
import { formatInr } from '../lib/currency.js';
import { formatDate } from '../lib/formatDate.js';
import LoadingState from '../components/LoadingState.jsx';
import { EmptyMessage, Feedback, FormField, Modal, PageHeader, SearchBox, StatusBadge, TableFrame } from '../components/WorkspacePrimitives.jsx';

const blank = { email: '', phone: '', business_name: '', tax_identifier: '', notes: '' };
const PAGE_SIZE = 20;

export default function CustomersPage() {
  const [rows, setRows] = useState([]); const [loading, setLoading] = useState(true); const [saving, setSaving] = useState(false);
  const [error, setError] = useState(''); const [search, setSearch] = useState(''); const deferredSearch = useDeferredValue(search);
  const [filter, setFilter] = useState('ALL'); const [page, setPage] = useState(0); const [selected, setSelected] = useState(null);
  const [history, setHistory] = useState(null); const [historyError, setHistoryError] = useState(''); const [formOpen, setFormOpen] = useState(false); const [editing, setEditing] = useState(null); const [form, setForm] = useState(blank);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    const { data, error: queryError } = await supabase.from('customers')
      .select('id,profile_id,email,phone,business_name,tax_identifier,billing_address,shipping_address,notes,created_at,updated_at')
      .order('created_at', { ascending: false }).limit(5000);
    if (queryError) setError(queryError.message || 'Customer records could not be loaded.');
    else setRows(data || []);
    setLoading(false);
  }, []);
  useEffect(() => { const timer = window.setTimeout(() => { void load(); }, 0); return () => window.clearTimeout(timer); }, [load]);

  const filtered = useMemo(() => rows.filter((row) => {
    const matches = `${row.email} ${row.business_name || ''} ${row.phone || ''} ${row.tax_identifier || ''}`.toLowerCase().includes(deferredSearch.trim().toLowerCase());
    const account = row.profile_id ? 'LINKED' : 'UNLINKED';
    return matches && (filter === 'ALL' || account === filter);
  }), [rows, deferredSearch, filter]);
  const pageRows = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  function createRecord() { setEditing(null); setForm({ ...blank }); setFormOpen(true); setError(''); }
  function editRecord(row) { setEditing(row); setForm({ email: row.email, phone: row.phone || '', business_name: row.business_name || '', tax_identifier: row.tax_identifier || '', notes: row.notes || '' }); setFormOpen(true); setError(''); }

  async function save(event) {
    event.preventDefault(); setSaving(true); setError('');
    const payload = { email: form.email.trim().toLowerCase(), phone: form.phone.trim() || null, business_name: form.business_name.trim() || null, tax_identifier: form.tax_identifier.trim() || null, notes: form.notes.trim() || null };
    try {
      const result = editing
        ? await supabase.from('customers').update(payload).eq('id', editing.id)
        : await supabase.from('customers').insert(payload);
      if (result.error) throw result.error;
      setFormOpen(false); setSelected(null); await load();
    } catch (saveError) { setError(saveError.message || 'Customer record could not be saved.'); }
    finally { setSaving(false); }
  }

  async function openDetails(row) {
    setSelected(row); setHistory(null); setHistoryError('');
    const [subscriptions, invoices, quotations, payments] = await Promise.all([
      supabase.from('subscriptions').select('id,subscription_number,status,billing_interval,next_billing_date,expiry_date').eq('customer_id', row.id).order('created_at', { ascending: false }).limit(100),
      supabase.from('invoices').select('id,invoice_number,status,billing_date,due_date,total,outstanding_amount').eq('customer_id', row.id).order('billing_date', { ascending: false }).limit(100),
      supabase.from('quotations').select('id,quotation_number,status,valid_until,total,created_at').eq('customer_id', row.id).order('created_at', { ascending: false }).limit(100),
      supabase.from('payments').select('id,invoice_id,status,amount,method,payment_date,reference').eq('customer_id', row.id).order('payment_date', { ascending: false }).limit(100),
    ]);
    const failed = [subscriptions, invoices, quotations, payments].find((result) => result.error);
    if (failed) setHistoryError(failed.error.message || 'Customer history could not be loaded.');
    else setHistory({ subscriptions: subscriptions.data || [], invoices: invoices.data || [], quotations: quotations.data || [], payments: payments.data || [] });
  }

  if (loading) return <div className="page-wrap"><LoadingState label="Loading customers" /></div>;
  return <div className="page-wrap workspace-page">
    <PageHeader title="Customers" subtitle="Search business contacts and review their subscription and billing history." action={<div className="workspace-head-actions"><button className="button button--secondary button--small" type="button" onClick={() => void load()}><RefreshCw size={15} /> Refresh</button><button className="button button--primary button--small" type="button" onClick={createRecord}><Plus size={16} /> Add customer</button></div>} />
    <div className="workspace-info-note"><UserRound size={17} /><span>This creates a billing contact only. Customer portal access is created by customer self-signup; this project has no secure customer invitation or account-linking workflow.</span></div>
    <Feedback error={error} />
    <div className="workspace-toolbar"><SearchBox value={search} onChange={(value) => { setSearch(value); setPage(0); }} placeholder="Search name, email, phone" /><select aria-label="Filter customers" value={filter} onChange={(event) => { setFilter(event.target.value); setPage(0); }}><option value="ALL">All records</option><option value="LINKED">Portal linked</option><option value="UNLINKED">Billing contacts</option></select><span>{filtered.length} customer{filtered.length === 1 ? '' : 's'}</span></div>
    {!pageRows.length ? <div className="surface-card workspace-empty-card"><EmptyMessage>{search ? 'No customers match this search.' : 'No customer records are available yet.'}</EmptyMessage></div> : <TableFrame><thead><tr><th>Customer</th><th>Email</th><th>Phone</th><th>Portal</th><th>Added</th><th>Actions</th></tr></thead><tbody>{pageRows.map((row) => <tr key={row.id}><td><b>{row.business_name || row.email}</b></td><td>{row.email}</td><td>{row.phone || '—'}</td><td><StatusBadge value={row.profile_id ? 'LINKED' : 'CONTACT'} /></td><td>{formatDate(row.created_at)}</td><td><div className="table-actions"><button className="icon-button" type="button" onClick={() => void openDetails(row)} aria-label={`View ${row.email} details`}><Eye size={16} /></button><button className="icon-button" type="button" onClick={() => editRecord(row)} aria-label={`Edit ${row.email}`}><Pencil size={16} /></button></div></td></tr>)}</tbody></TableFrame>}
    {filtered.length > PAGE_SIZE && <div className="table-pagination"><span>Page {page + 1} of {Math.ceil(filtered.length / PAGE_SIZE)}</span><div><button className="button button--secondary button--small" disabled={page === 0} onClick={() => setPage((value) => value - 1)}>Previous</button><button className="button button--secondary button--small" disabled={(page + 1) * PAGE_SIZE >= filtered.length} onClick={() => setPage((value) => value + 1)}>Next</button></div></div>}

    {formOpen && <Modal title={editing ? 'Edit customer contact' : 'Add customer contact'} description="The database links portal customers only through Auth-managed signup. This form does not create an Auth identity." onClose={() => setFormOpen(false)}>
      <form className="workspace-form" onSubmit={save}><FormField label="Email address" required><input type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} required maxLength={320} /></FormField><div className="form-grid"><FormField label="Business name"><input value={form.business_name} onChange={(event) => setForm({ ...form, business_name: event.target.value })} maxLength={200} /></FormField><FormField label="Phone"><input value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} maxLength={40} /></FormField><FormField label="Tax identifier"><input value={form.tax_identifier} onChange={(event) => setForm({ ...form, tax_identifier: event.target.value })} maxLength={80} /></FormField></div><FormField label="Notes"><textarea rows="3" value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} maxLength={2000} /></FormField><Feedback error={error} /><div className="modal-actions"><button className="button button--secondary" type="button" onClick={() => setFormOpen(false)}>Cancel</button><button className="button button--primary" type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save contact'}</button></div></form>
    </Modal>}

    {selected && <Modal title={selected.business_name || selected.email} description={`${selected.email}${selected.phone ? ` · ${selected.phone}` : ''}`} wide onClose={() => { setSelected(null); setHistory(null); }}>
      <Feedback error={historyError} /><button className="button button--secondary button--small" type="button" onClick={() => editRecord(selected)}><Pencil size={14} /> Edit customer</button>
      {!history && !historyError ? <LoadingState label="Loading customer history" /> : history && <div className="customer-history-grid">
        <HistorySection title="Subscriptions" items={history.subscriptions} empty="No subscriptions recorded." render={(item) => <><b>{item.subscription_number}</b><span><StatusBadge value={item.status} /> · {item.billing_interval.toLowerCase()}</span><small>Next billing {formatDate(item.next_billing_date)} · expires {formatDate(item.expiry_date)}</small></>} />
        <HistorySection title="Invoices" items={history.invoices} empty="No invoices recorded." render={(item) => <><b>{item.invoice_number}</b><span><StatusBadge value={item.status} /> · {formatInr(item.total)}</span><small>Due {formatDate(item.due_date)} · outstanding {formatInr(item.outstanding_amount)}</small></>} />
        <HistorySection title="Quotations" items={history.quotations} empty="No quotations recorded." render={(item) => <><b>{item.quotation_number}</b><span><StatusBadge value={item.status} /> · {formatInr(item.total)}</span><small>Valid until {formatDate(item.valid_until)}</small></>} />
        <HistorySection title="Payments" items={history.payments} empty="No payments recorded." render={(item) => <><b>{formatInr(item.amount)} · {item.method.toLowerCase().replace('_', ' ')}</b><span><StatusBadge value={item.status} /></span><small>{formatDate(item.payment_date)}{item.reference ? ` · ${item.reference}` : ''}</small></>} />
      </div>}
    </Modal>}
  </div>;
}

function HistorySection({ title, items, empty, render }) {
  return <section className="customer-history-section"><h3>{title} <span>{items.length}</span></h3>{items.length ? <div className="customer-history-list">{items.slice(0, 8).map((item) => <article key={item.id}>{render(item)}</article>)}</div> : <p>{empty}</p>}</section>;
}
