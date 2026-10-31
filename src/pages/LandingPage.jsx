import { ArrowRight, ArrowUpRight, BarChart3, Check, ChevronRight, CreditCard, ShieldCheck, Sparkles, Workflow } from 'lucide-react';
import { Link } from 'react-router-dom';

const features = [
  { icon: Workflow, title: 'Subscriptions that stay in sync', body: 'Keep every plan, renewal, pause, and customer change in one clear operating view.' },
  { icon: CreditCard, title: 'Billing without blind spots', body: 'Follow invoices, payments, balances, and renewals through a connected workflow.' },
  { icon: BarChart3, title: 'A sharper view of revenue', body: 'Understand recurring revenue, collections, and subscription health from your records.' },
];

export default function LandingPage() {
  return (
    <div className="landing-page">
      <header className="landing-nav">
        <Link className="landing-brand" to="/" aria-label="Brightloop home"><span className="brand-mark">B</span><span>Brightloop<span className="brand-period">.</span></span></Link>
        <nav className="landing-nav-links" aria-label="Public navigation">
          <a href="#platform">Platform</a><a href="#workflow">How it works</a><a href="#insights">Insights</a>
        </nav>
        <div className="landing-nav-actions"><Link className="landing-login" to="/login">Log in</Link><Link className="button button--primary button--small" to="/signup">Get started <ArrowRight size={15} /></Link></div>
      </header>

      <main>
        <section className="landing-hero">
          <div className="hero-copy">
            <span className="hero-overline"><span className="pulse-dot" /> SUBSCRIPTION OPERATIONS, IN FOCUS</span>
            <h1>Make every<br /><span>subscription</span><br />feel effortless.</h1>
            <p>Brightloop brings customer plans, recurring billing, invoices, and payment follow-through into one calm, connected workspace.</p>
            <div className="hero-actions"><Link className="button button--primary" to="/signup">Explore Brightloop <ArrowRight size={16} /></Link><a className="text-link" href="#platform">See the platform <ChevronRight size={15} /></a></div>
            <div className="hero-trust"><span><ShieldCheck size={15} /> Role-aware access</span><span><Check size={14} /> Built around your records</span></div>
          </div>
          <div className="hero-visual" aria-label="Illustration of the Brightloop subscription workspace">
            <div className="hero-orbit hero-orbit--one" /><div className="hero-orbit hero-orbit--two" />
            <div className="preview-window">
              <div className="preview-top"><div className="preview-brand"><span className="preview-mark">B</span> Subscription Intelligence</div><span className="preview-live"><i /> LIVE WORKSPACE</span></div>
              <div className="preview-greeting"><div><span>WORKSPACE OVERVIEW</span><h2>Your business, in rhythm.</h2></div><div className="preview-date">Last 30 days <ChevronRight size={13} /></div></div>
              <div className="preview-stats"><div><span>Recurring revenue</span><strong>INR <b>—</b></strong><small><ArrowUpRight size={12} /> Connected to your data</small></div><div><span>Active subscriptions</span><strong>—</strong><small>Awaiting workspace data</small></div><div><span>Outstanding</span><strong>INR —</strong><small>Live invoice balances</small></div></div>
              <div className="preview-chart"><div className="preview-chart-head"><div><span>REVENUE PULSE</span><strong>Collections over time</strong></div><div className="chart-legend"><i /> Payments</div></div><div className="preview-chart-empty"><span>Live collections view</span><small>Connect your workspace to see recorded payments</small></div></div>
              <div className="preview-bottom"><span className="preview-avatar">AC</span><span>Account data stays private to your workspace.</span><ShieldCheck size={14} /></div>
            </div>
            <div className="hero-float hero-float--renew"><span className="float-icon"><Workflow size={16} /></span><span><b>Renewal radar</b><small>See what needs attention</small></span><ArrowUpRight size={15} /></div>
            <div className="hero-float hero-float--secure"><span className="secure-check"><Check size={13} /></span><span><b>One connected workflow</b><small>From plan to payment</small></span></div>
          </div>
          <a className="hero-scroll" href="#platform"><span /> Scroll to explore</a>
        </section>

        <section className="landing-section platform-section" id="platform">
          <div className="section-heading"><span className="section-kicker">THE OPERATING LAYER</span><h2>Clarity across the<br /><em>subscription lifecycle.</em></h2><p>Keep teams aligned from the first customer record to the next successful renewal.</p></div>
          <div className="feature-grid">{features.map(({ icon: Icon, title, body }, index) => <article className="feature-card" key={title}><div className={`feature-icon feature-icon--${index}`}><Icon size={20} /></div><span className="feature-index">0{index + 1}</span><h3>{title}</h3><p>{body}</p><a href="#workflow">Explore workflow <ArrowRight size={14} /></a></article>)}</div>
        </section>

        <section className="landing-section intelligence-section" id="insights">
          <div className="intelligence-visual"><div className="intelligence-glow" /><div className="intel-card intel-card--main"><div className="intel-header"><span className="intel-icon"><Sparkles size={16} /></span><span>SUBSCRIPTION INTELLIGENCE</span><span className="intel-menu">•••</span></div><h3>Know what needs<br />your attention.</h3><p>Bring renewal dates, open balances, and subscription status together in one useful view.</p><div className="intel-signals"><div><span className="signal-mark signal-mark--violet"><ArrowUpRight size={14} /></span><span><b>Renewal radar</b><small>Upcoming subscription dates</small></span><ChevronRight size={14} /></div><div><span className="signal-mark signal-mark--cyan"><CreditCard size={14} /></span><span><b>Payment watch</b><small>Outstanding invoice balances</small></span><ChevronRight size={14} /></div><div><span className="signal-mark signal-mark--green"><BarChart3 size={14} /></span><span><b>Revenue pulse</b><small>Collections from recorded payments</small></span><ChevronRight size={14} /></div></div></div><div className="intel-orb">B<span /></div></div>
          <div className="section-heading intelligence-copy"><span className="section-kicker">SUBSCRIPTION INTELLIGENCE CENTER</span><h2>See the signal.<br /><em>Move with confidence.</em></h2><p>Brightloop brings the daily questions into focus: what is renewing, what is outstanding, and where your subscription base needs a closer look.</p><div className="intelligence-points"><span><Check size={15} /> Live records, not sample metrics</span><span><Check size={15} /> Useful status at a glance</span><span><Check size={15} /> Private access by account role</span></div><Link to="/signup" className="text-link">Get started <ArrowRight size={15} /></Link></div>
        </section>

        <section className="landing-section workflow-section" id="workflow"><div className="workflow-title"><span className="section-kicker">A CONNECTED JOURNEY</span><h2>Every step has a<br /><em>place to land.</em></h2></div><div className="workflow-steps"><article><span className="step-number">01</span><div className="step-line"><i /></div><h3>Organize</h3><p>Keep customer, product, and plan details easy to find.</p></article><article><span className="step-number">02</span><div className="step-line"><i /></div><h3>Subscribe</h3><p>Track status, billing cadence, and upcoming renewals.</p></article><article><span className="step-number">03</span><div className="step-line"><i /></div><h3>Collect</h3><p>Follow invoices and payment history with clear balances.</p></article><article><span className="step-number">04</span><div className="step-line"><i /></div><h3>Understand</h3><p>Review actual subscription and collection patterns.</p></article></div></section>

        <section className="landing-cta"><div><span className="section-kicker">A CLEARER WAY TO MANAGE RECURRING BUSINESS</span><h2>Bring your subscription<br />operations into focus.</h2><p>Start with a secure workspace and build from the records you already manage.</p></div><Link className="button button--primary" to="/signup">Create your account <ArrowRight size={16} /></Link><span className="cta-decoration">B</span></section>
      </main>

      <footer className="landing-footer"><Link className="landing-brand" to="/"><span className="brand-mark">B</span><span>Brightloop<span className="brand-period">.</span></span></Link><span>Subscription operations, in focus.</span><div><a href="#platform">Platform</a><Link to="/login">Login</Link><Link to="/signup">Sign up</Link></div><small>© {new Date().getFullYear()} Brightloop. Secure access for every workspace.</small></footer>
    </div>
  );
}
