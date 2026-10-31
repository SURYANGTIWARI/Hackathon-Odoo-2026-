import { ArrowRight, Database } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function PlaceholderPage({ page }) {
  const Icon = page.icon;
  const isDashboard = page.path === 'dashboard';

  return (
    <div className="page-wrap">
      <div className="page-heading-row">
        <div>
          <p className="eyebrow">BRIGHTLOOP WORKSPACE</p>
          <h1>{isDashboard ? 'Welcome to Brightloop' : page.label}</h1>
          <p className="page-subtitle">{isDashboard ? 'Your subscription operations, in one place.' : page.description}</p>
        </div>
        <span className="page-status"><span /> Foundation</span>
      </div>

      <section className="foundation-card">
        <div className="foundation-icon"><Icon size={21} strokeWidth={1.8} /></div>
        <div className="foundation-copy">
          <p className="foundation-kicker">{isDashboard ? 'Dashboard foundation' : `${page.label} foundation`}</p>
          <h2>{isDashboard ? 'Ready for live subscription data' : `${page.label} page is ready to build`}</h2>
          <p>{page.description}</p>
          <div className="connection-note"><Database size={15} /><span>No database is configured. This page currently shows no business records.</span></div>
        </div>
        {!isDashboard && <Link className="back-link" to="/dashboard">Dashboard <ArrowRight size={15} /></Link>}
      </section>
    </div>
  );
}
