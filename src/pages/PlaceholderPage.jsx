import { ArrowRight, Database } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function PlaceholderPage({ page }) {
  const Icon = page.icon;
  return <div className="page-wrap placeholder-page"><div className="page-heading-row"><div><span className="card-kicker">BRIGHTLOOP WORKSPACE</span><h1>{page.label}</h1><p className="page-subtitle">{page.description}</p></div><span className="page-status"><span /> Module foundation</span></div><section className="surface-card foundation-card"><div className="foundation-icon"><Icon size={21} strokeWidth={1.8} /></div><div className="foundation-copy"><p className="foundation-kicker">{page.label} workspace</p><h2>Ready for a connected workflow</h2><p>This module is part of the Brightloop workspace foundation. Its live data operations are not available yet.</p><div className="connection-note"><Database size={15} /><span>No records are shown until this module has a verified data workflow.</span></div></div><Link className="back-link" to="/dashboard">Return to dashboard <ArrowRight size={15} /></Link></section></div>;
}
