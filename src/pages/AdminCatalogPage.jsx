import { useCallback, useEffect, useMemo, useState } from 'react';
import { Archive, Check, Edit3, Plus, RefreshCw } from 'lucide-react';
import { supabase } from '../lib/supabase.js';
import { formatInr } from '../lib/currency.js';
import LoadingState from '../components/LoadingState.jsx';
import { EmptyMessage, Feedback, FormField, Modal, PageHeader, SearchBox, StatusBadge, TableFrame } from '../components/WorkspacePrimitives.jsx';
import { useAuth } from '../auth/useAuth.js';

const productTypes = ['RECURRING', 'ONE_TIME', 'SERVICE', 'OTHER'];
const billingIntervals = ['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'];
const blankProduct = { name: '', product_type: 'RECURRING', sales_price: '', cost_price: '', notes: '', is_active: true };
const blankPlan = { name: '', description: '', price: '', billing_interval: 'MONTHLY', minimum_quantity: 1, available_from: '', available_until: '', is_active: true };

export default function AdminCatalogPage({ kind }) {
  const isProducts = kind === 'products';
  const { profile } = useAuth();
  const isAdmin = profile?.role === 'ADMIN';
  const [rows, setRows] = useState([]);
  const [products, setProducts] = useState([]);
  const [variants, setVariants] = useState([]);
  const [planProducts, setPlanProducts] = useState([]);
  const [catalogPlans, setCatalogPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [variantProduct, setVariantProduct] = useState(null);
  const [variantEditing, setVariantEditing] = useState(null);
  const [variantForm, setVariantForm] = useState({ name: '', additional_price: '0' });
  const [form, setForm] = useState(isProducts ? blankProduct : blankPlan);
  const [selectedProducts, setSelectedProducts] = useState([]);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [mainResult, productResult, variantResult, associationResult, planResult] = await Promise.all([
        isProducts
          ? (isAdmin ? supabase.rpc('admin_list_products_with_cost') : supabase.from('products_catalog').select('*').order('name'))
          : supabase.from('plans').select('id,name,description,price,currency_code,billing_interval,minimum_quantity,available_from,available_until,is_active,created_at,updated_at').order('name'),
        supabase.from('products_catalog').select('id,name,product_type,sales_price,currency_code,is_active').order('name'),
        supabase.from('product_variants').select('id,product_id,name,additional_price,currency_code,is_active').order('name'),
        supabase.from('plan_products').select('id,plan_id,product_id,quantity'),
        isProducts ? supabase.from('plans').select('id,name').order('name') : Promise.resolve({ data: [], error: null }),
      ]);
      const failed = [mainResult, productResult, variantResult, associationResult, planResult].find((result) => result.error);
      if (failed) throw failed.error;
      setRows(mainResult.data || []);
      setProducts(productResult.data || []);
      setVariants(variantResult.data || []);
      setPlanProducts(associationResult.data || []);
      setCatalogPlans(isProducts ? (planResult.data || []) : (mainResult.data || []));
    } catch (loadError) { setError(loadError.message || 'Catalog records could not be loaded.'); }
    finally { setLoading(false); }
  }, [isAdmin, isProducts]);

  useEffect(() => { const timer = window.setTimeout(() => { void load(); }, 0); return () => window.clearTimeout(timer); }, [load]);

  const filtered = useMemo(() => rows.filter((row) => `${row.name} ${row.description || ''} ${row.product_type || ''} ${row.billing_interval || ''}`.toLowerCase().includes(search.trim().toLowerCase())), [rows, search]);
  function startCreate() { setEditing(null); setForm(isProducts ? { ...blankProduct } : { ...blankPlan }); setSelectedProducts([]); setModalOpen(true); }
  function startEdit(row) {
    setEditing(row);
    setModalOpen(true);
    if (isProducts) setForm({ name: row.name, product_type: row.product_type, sales_price: String(row.sales_price), cost_price: String(row.cost_price ?? ''), notes: row.notes || '', is_active: row.is_active });
    else {
      setForm({ name: row.name, description: row.description || '', price: String(row.price), billing_interval: row.billing_interval, minimum_quantity: row.minimum_quantity, available_from: row.available_from || '', available_until: row.available_until || '', is_active: row.is_active });
      setSelectedProducts(planProducts.filter((item) => item.plan_id === row.id).map((item) => item.product_id));
    }
  }
  function setField(key, value) { setForm((current) => ({ ...current, [key]: value })); }

  async function save(event) {
    event.preventDefault(); setSaving(true); setError('');
    try {
      let result;
      if (isProducts) {
        const payload = { name: form.name.trim(), product_type: form.product_type, sales_price: Number(form.sales_price), notes: form.notes.trim() || null, is_active: Boolean(form.is_active) };
        if (isAdmin) payload.cost_price = Number(form.cost_price || 0);
        result = editing
          ? await supabase.from('products').update(payload).eq('id', editing.id)
          : await supabase.from('products').insert({ ...payload, created_by: profile.id });
        if (result.error) throw result.error;
      } else {
        const payload = { name: form.name.trim(), description: form.description.trim() || null, price: Number(form.price), billing_interval: form.billing_interval, minimum_quantity: Number(form.minimum_quantity), available_from: form.available_from || null, available_until: form.available_until || null, is_active: Boolean(form.is_active), created_by: profile.id };
        const saved = editing ? await supabase.from('plans').update(payload).eq('id', editing.id).select('id').single() : await supabase.from('plans').insert(payload).select('id').single();
        if (saved.error) throw saved.error;
        const planId = editing?.id || saved.data.id;
        const removed = await supabase.from('plan_products').delete().eq('plan_id', planId);
        if (removed.error) throw new Error(`Plan details were saved, but product associations could not be updated: ${removed.error.message}`);
        if (selectedProducts.length) {
          const links = await supabase.from('plan_products').insert(selectedProducts.map((productId) => ({ plan_id: planId, product_id: productId, quantity: 1 })));
          if (links.error) throw new Error(`Plan details were saved, but product associations could not be updated: ${links.error.message}`);
        }
      }
      setEditing(null); setModalOpen(false); await load();
    } catch (saveError) { setError(saveError.message || 'The record could not be saved.'); }
    finally { setSaving(false); }
  }

  async function setActive(row) {
    setError('');
    const table = isProducts ? 'products' : 'plans';
    const { error: updateError } = await supabase.from(table).update({ is_active: !row.is_active }).eq('id', row.id);
    if (updateError) setError(updateError.message || 'The status could not be changed.');
    else await load();
  }

  async function saveVariant(event) {
    event.preventDefault(); setSaving(true); setError('');
    const payload = { product_id: variantProduct.id, name: variantForm.name.trim(), additional_price: Number(variantForm.additional_price), is_active: true };
    try {
      const result = variantEditing
        ? await supabase.from('product_variants').update({ name: payload.name, additional_price: payload.additional_price }).eq('id', variantEditing.id)
        : await supabase.from('product_variants').insert(payload);
      if (result.error) throw result.error;
      setVariantEditing(null); setVariantForm({ name: '', additional_price: '0' }); await load();
    } catch (variantError) { setError(variantError.message || 'Variant could not be saved.'); }
    finally { setSaving(false); }
  }

  async function deactivateVariant(variant) {
    const { error: updateError } = await supabase.from('product_variants').update({ is_active: false }).eq('id', variant.id);
    if (updateError) setError(updateError.message || 'Variant could not be deactivated.'); else await load();
  }

  const associatedProducts = (planId) => planProducts.filter((item) => item.plan_id === planId).map((item) => products.find((product) => product.id === item.product_id)?.name).filter(Boolean);
  const associatedPlans = (productId) => planProducts.filter((item) => item.product_id === productId).map((item) => catalogPlans.find((plan) => plan.id === item.plan_id)?.name).filter(Boolean);

  if (loading) return <div className="page-wrap"><LoadingState label={`Loading ${isProducts ? 'products' : 'plans'}`} /></div>;
  return <div className="page-wrap workspace-page">
    <PageHeader title={isProducts ? 'Products' : 'Plans'} subtitle={isProducts ? 'Manage your catalog, prices and product variants.' : 'Configure recurring plans and their product associations.'} action={<div className="workspace-head-actions"><button className="button button--secondary button--small" type="button" onClick={() => void load()}><RefreshCw size={15} /> Refresh</button>{isAdmin && <button className="button button--primary button--small" type="button" onClick={startCreate}><Plus size={16} /> Add {isProducts ? 'product' : 'plan'}</button>}</div>} />
    <Feedback error={error} />
    <div className="workspace-toolbar"><SearchBox value={search} onChange={setSearch} placeholder={`Search ${isProducts ? 'products' : 'plans'}`} /><span>{filtered.length} record{filtered.length === 1 ? '' : 's'}</span></div>
    {!filtered.length ? <div className="surface-card workspace-empty-card"><EmptyMessage>{search ? 'No records match this search.' : `No ${isProducts ? 'products' : 'plans'} have been created yet.`}</EmptyMessage></div> : <TableFrame><thead><tr><th>Name</th>{isProducts ? <><th>Type</th><th>Sales price</th>{isAdmin && <th>Cost price</th>}<th>Variants</th><th>Plans</th></> : <><th>Billing</th><th>Price</th><th>Products</th><th>Available</th></>}<th>Status</th>{isAdmin && <th>Actions</th>}</tr></thead><tbody>{filtered.map((row) => <tr key={row.id}><td><b>{row.name}</b>{!isProducts && row.description && <small className="table-secondary">{row.description}</small>}</td>{isProducts ? <><td>{row.product_type.toLowerCase().replace('_', ' ')}</td><td>{formatInr(row.sales_price)}</td>{isAdmin && <td>{row.cost_price == null ? '—' : formatInr(row.cost_price)}</td>}<td><button className="text-button" type="button" onClick={() => { setVariantProduct(row); setVariantEditing(null); setVariantForm({ name: '', additional_price: '0' }); }}>{variants.filter((variant) => variant.product_id === row.id).length} variants</button></td><td>{associatedPlans(row.id).join(', ') || '—'}</td></> : <><td>{row.billing_interval.toLowerCase()} · min {row.minimum_quantity}</td><td>{formatInr(row.price)}</td><td>{associatedProducts(row.id).join(', ') || 'No products linked'}</td><td>{row.available_from || 'Any'} – {row.available_until || 'Any'}</td></>}<td><StatusBadge value={row.is_active ? 'ACTIVE' : 'INACTIVE'} /></td>{isAdmin && <td><div className="table-actions"><button className="icon-button" type="button" onClick={() => startEdit(row)} aria-label={`Edit ${row.name}`}><Edit3 size={16} /></button><button className="icon-button" type="button" onClick={() => void setActive(row)} aria-label={`${row.is_active ? 'Deactivate' : 'Activate'} ${row.name}`}><Archive size={16} /></button></div></td>}</tr>)}</tbody></TableFrame>}

    {isAdmin && modalOpen && <Modal title={`${editing ? 'Edit' : 'Add'} ${isProducts ? 'product' : 'plan'}`} description="Catalog changes are restricted to administrators by database policy." onClose={() => { setModalOpen(false); setEditing(null); setForm(isProducts ? blankProduct : blankPlan); }}>
      <form className="workspace-form" onSubmit={save}>
        <FormField label="Name" required><input value={form.name} onChange={(event) => setField('name', event.target.value)} required maxLength={160} /></FormField>
        {isProducts ? <><FormField label="Product type" required><select value={form.product_type} onChange={(event) => setField('product_type', event.target.value)}>{productTypes.map((type) => <option key={type} value={type}>{type.replace('_', ' ')}</option>)}</select></FormField><div className="form-grid"><FormField label="Sales price (INR)" required><input type="number" min="0" step="0.01" value={form.sales_price} onChange={(event) => setField('sales_price', event.target.value)} required /></FormField>{isAdmin && <FormField label="Cost price (INR)"><input type="number" min="0" step="0.01" value={form.cost_price} onChange={(event) => setField('cost_price', event.target.value)} /></FormField>}</div><FormField label="Description / notes"><textarea rows="3" value={form.notes} onChange={(event) => setField('notes', event.target.value)} maxLength={2000} /></FormField></> : <><FormField label="Description"><textarea rows="3" value={form.description} onChange={(event) => setField('description', event.target.value)} maxLength={2000} /></FormField><div className="form-grid"><FormField label="Price (INR)" required><input type="number" min="0" step="0.01" value={form.price} onChange={(event) => setField('price', event.target.value)} required /></FormField><FormField label="Billing interval" required><select value={form.billing_interval} onChange={(event) => setField('billing_interval', event.target.value)}>{billingIntervals.map((interval) => <option key={interval}>{interval}</option>)}</select></FormField><FormField label="Minimum quantity" required><input type="number" min="1" step="1" value={form.minimum_quantity} onChange={(event) => setField('minimum_quantity', event.target.value)} required /></FormField><FormField label="Available from"><input type="date" value={form.available_from} onChange={(event) => setField('available_from', event.target.value)} /></FormField><FormField label="Available until"><input type="date" value={form.available_until} onChange={(event) => setField('available_until', event.target.value)} /></FormField></div><fieldset className="product-selector"><legend>Products included</legend>{products.filter((product) => product.is_active).map((product) => <label key={product.id}><input type="checkbox" checked={selectedProducts.includes(product.id)} onChange={(event) => setSelectedProducts((current) => event.target.checked ? [...current, product.id] : current.filter((id) => id !== product.id))} />{product.name}</label>)}{!products.some((product) => product.is_active) && <p>Create an active product before linking it to a plan.</p>}</fieldset></>}
        <label className="workspace-checkbox"><input type="checkbox" checked={form.is_active} onChange={(event) => setField('is_active', event.target.checked)} /> Active in catalog</label>
        <Feedback error={error} />
        <div className="modal-actions"><button className="button button--secondary" type="button" onClick={() => { setEditing(null); setModalOpen(false); }}>Cancel</button><button className="button button--primary" type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save changes'}</button></div>
      </form>
    </Modal>}

    {variantProduct && <Modal title={`${variantProduct.name} variants`} description="Variants retain their product link. Deactivate a variant to keep historical references." onClose={() => { setVariantProduct(null); setVariantEditing(null); }} wide>
      {error && <Feedback error={error} />}
      <div className="variant-list">{variants.filter((variant) => variant.product_id === variantProduct.id).map((variant) => <div className="variant-row" key={variant.id}><div><b>{variant.name}</b><small>{formatInr(variant.additional_price)} additional · {variant.is_active ? 'Active' : 'Inactive'}</small></div><div className="table-actions"><button type="button" className="icon-button" onClick={() => { setVariantEditing(variant); setVariantForm({ name: variant.name, additional_price: String(variant.additional_price) }); }} aria-label={`Edit ${variant.name}`}><Edit3 size={15} /></button>{variant.is_active && <button type="button" className="icon-button" onClick={() => void deactivateVariant(variant)} aria-label={`Deactivate ${variant.name}`}><Archive size={15} /></button>}</div></div>)}</div>
      {isAdmin && <form className="workspace-form variant-form" onSubmit={saveVariant}><h3>{variantEditing ? 'Edit variant' : 'Add variant'}</h3><div className="form-grid"><FormField label="Variant name" required><input value={variantForm.name} onChange={(event) => setVariantForm({ ...variantForm, name: event.target.value })} required maxLength={160} /></FormField><FormField label="Additional price (INR)" required><input type="number" min="0" step="0.01" value={variantForm.additional_price} onChange={(event) => setVariantForm({ ...variantForm, additional_price: event.target.value })} required /></FormField></div><button className="button button--primary button--small" disabled={saving}><Check size={15} />{saving ? 'Saving…' : 'Save variant'}</button></form>}
    </Modal>}
  </div>;
}
