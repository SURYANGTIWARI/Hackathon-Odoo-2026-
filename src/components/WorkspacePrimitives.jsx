import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

export function PageHeader({ title, subtitle, action }) {
  return <div className="page-heading-row workspace-page-heading"><div><span className="card-kicker">BRIGHTLOOP WORKSPACE</span><h1>{title}</h1><p className="page-subtitle">{subtitle}</p></div>{action}</div>;
}

export function SearchBox({ value, onChange, placeholder = 'Search records' }) {
  return <label className="workspace-search"><span className="sr-only">{placeholder}</span><input type="search" value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} /></label>;
}

export function StatusBadge({ value }) {
  const tone = String(value || 'unknown').toLowerCase().replaceAll('_', '-');
  return <span className={`status-pill status-pill--${tone}`}>{String(value || 'Unknown').replaceAll('_', ' ').toLowerCase()}</span>;
}

export function Modal({ title, description, onClose, children, wide = false }) {
  const closeRef = useRef(onClose);
  useEffect(() => { closeRef.current = onClose; }, [onClose]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const previousOverscroll = document.body.style.overscrollBehavior;
    document.body.style.overflow = 'hidden';
    document.body.style.overscrollBehavior = 'none';
    const handleKeyDown = (event) => { if (event.key === 'Escape') closeRef.current(); };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.body.style.overscrollBehavior = previousOverscroll;
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  return createPortal(
    <div className="workspace-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className={`workspace-modal ${wide ? 'workspace-modal--wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <header className="workspace-modal-head"><div><h2>{title}</h2>{description && <p>{description}</p>}</div><button type="button" className="icon-button" onClick={onClose} aria-label="Close dialog"><X size={18} /></button></header>
        <div className="workspace-modal-content">{children}</div>
      </section>
    </div>,
    document.body,
  );
}

export function FormField({ label, children, hint, required = false }) {
  return <label className="workspace-field"><span>{label}{required && <b aria-hidden="true"> *</b>}</span>{children}{hint && <small>{hint}</small>}</label>;
}

export function Feedback({ error, message }) {
  return <>{error && <p className="form-alert form-alert--error" role="alert">{error}</p>}{message && <p className="form-alert form-alert--success" role="status">{message}</p>}</>;
}

export function EmptyMessage({ children }) {
  return <div className="empty-state"><span>—</span><p>{children}</p></div>;
}

export function TableFrame({ children }) {
  return <div className="surface-card workspace-table-card"><div className="table-scroll"><table className="data-table workspace-data-table">{children}</table></div></div>;
}

