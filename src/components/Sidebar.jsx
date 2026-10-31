import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { ChevronsLeft, ChevronsRight, PanelLeftClose, UserRound } from 'lucide-react';
import { navigationItems } from './navigation.js';
import { useAuth } from '../auth/useAuth.js';

export default function Sidebar({ mobileOpen, onClose }) {
  const [collapsed, setCollapsed] = useState(false);
  const { profile, user } = useAuth();
  const items = profile?.role === 'CUSTOMER' ? [{ label: 'My portal', path: '/portal', icon: UserRound }] : navigationItems;
  const fullName = profile?.full_name || user?.email || 'Workspace member';
  const roleName = profile?.role ? profile.role[0] + profile.role.slice(1).toLowerCase() : 'Loading account';

  return <>
    {mobileOpen && <button className="sidebar-backdrop" aria-label="Close navigation" onClick={onClose} />}
    <aside className={`sidebar ${collapsed ? 'sidebar--collapsed' : ''} ${mobileOpen ? 'sidebar--mobile-open' : ''}`}>
      <div className="sidebar-brand-row"><NavLink className="brand" to={profile?.role === 'CUSTOMER' ? '/portal' : '/dashboard'} onClick={onClose} aria-label="Brightloop workspace"><span className="brand-mark">B</span><span className="brand-copy">Brightloop<span className="brand-period">.</span><small>SUBSCRIPTION CLOUD</small></span></NavLink><button className="icon-button sidebar-collapse" onClick={() => setCollapsed((value) => !value)} aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}>{collapsed ? <ChevronsRight size={17} /> : <ChevronsLeft size={17} />}</button><button className="icon-button mobile-close" onClick={onClose} aria-label="Close navigation"><PanelLeftClose size={18} /></button></div>
      <div className="workspace-switcher"><span className="workspace-avatar">B</span><span className="workspace-copy">Brightloop Software<small>{profile?.role === 'CUSTOMER' ? 'Customer portal' : 'Workspace'}</small></span><span className="workspace-caret">⌄</span></div>
      <p className="nav-section-label">{profile?.role === 'CUSTOMER' ? 'YOUR ACCOUNT' : 'WORKSPACE'}</p>
      <nav className="primary-navigation" aria-label="Main navigation">{items.map(({ label, path, icon: Icon }) => <NavLink key={path} to={path} end onClick={onClose} title={collapsed ? label : undefined} className={({ isActive }) => `nav-link ${isActive ? 'nav-link--active' : ''}`}><Icon size={17} strokeWidth={1.8} aria-hidden="true" /><span className="nav-link-label">{label}</span></NavLink>)}</nav>
      <div className="sidebar-footer"><div className="sidebar-user"><span className="user-avatar"><UserRound size={15} /></span><span className="sidebar-user-copy">{fullName}<small>{roleName} access</small></span></div></div>
    </aside>
  </>;
}
