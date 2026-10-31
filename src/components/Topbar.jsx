import { useEffect, useMemo, useRef, useState } from 'react';
import { Bell, ChevronDown, LogOut, Menu, Search, Settings, UserRound } from 'lucide-react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { descriptionByPath, navigationItems } from './navigation.js';
import { portalNavigation } from './portalNavigation.js';
import { useAuth } from '../auth/useAuth.js';

export default function Topbar({ onMenuClick }) {
  const [openPanel, setOpenPanel] = useState(null);
  const [query, setQuery] = useState('');
  const [actionError, setActionError] = useState('');
  const panelRef = useRef(null); const searchRef = useRef(null);
  const location = useLocation(); const navigate = useNavigate();
  const { user, profile, signOut } = useAuth();
  const title = profile?.role === 'CUSTOMER'
    ? portalNavigation.find((item) => item.path === location.pathname)?.label || 'My Dashboard'
    : descriptionByPath[location.pathname] ?? 'Workspace';
  const filteredPages = useMemo(() => {
    const pages = profile?.role === 'CUSTOMER' ? portalNavigation : navigationItems;
    return pages.filter((item) => item.label.toLowerCase().includes(query.trim().toLowerCase())).slice(0, 6);
  }, [profile?.role, query]);

  useEffect(() => {
    function handlePointerDown(event) { if (panelRef.current && !panelRef.current.contains(event.target)) setOpenPanel(null); }
    function handleKeyDown(event) {
      if (event.key === 'Escape') { setOpenPanel(null); setQuery(''); }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); searchRef.current?.focus(); }
    }
    document.addEventListener('pointerdown', handlePointerDown); document.addEventListener('keydown', handleKeyDown);
    return () => { document.removeEventListener('pointerdown', handlePointerDown); document.removeEventListener('keydown', handleKeyDown); };
  }, []);

  async function handleSignOut() {
    setActionError('');
    try { await signOut(); navigate('/', { replace: true }); } catch { setActionError('Sign out failed. Check your connection and try again.'); }
  }
  function goTo(path) { navigate(path); setQuery(''); searchRef.current?.blur(); }

  return <header className="topbar"><div className="topbar-left"><button className="icon-button mobile-menu" onClick={onMenuClick} aria-label="Open navigation"><Menu size={19} /></button><div className="breadcrumbs"><span>Brightloop</span><span className="breadcrumb-separator">/</span><strong>{title}</strong></div></div>
    <div className="topbar-actions" ref={panelRef}>
      <div className={`global-search ${query ? 'global-search--active' : ''}`}><Search size={15} aria-hidden="true" /><input ref={searchRef} type="search" value={query} onChange={(event) => setQuery(event.target.value)} onFocus={() => setOpenPanel('search')} placeholder="Search pages" aria-label="Search workspace pages" /><kbd>⌘ K</kbd></div>
      {openPanel === 'search' && query && <div className="popover search-popover">{filteredPages.length ? filteredPages.map(({ label, path, icon: Icon }) => <button className="search-result" type="button" key={path} onClick={() => goTo(path)}><Icon size={15} /><span>{label}</span><small>Open page</small></button>) : <div className="popover-empty">No workspace pages match “{query}”.</div>}</div>}
      <div className="topbar-popover-wrap"><button className={`icon-button notification-button ${openPanel === 'notifications' ? 'is-open' : ''}`} onClick={() => profile?.role === 'CUSTOMER' ? goTo('/portal/notifications') : setOpenPanel(openPanel === 'notifications' ? null : 'notifications')} aria-label="Notifications" aria-expanded={openPanel === 'notifications'}><Bell size={18} strokeWidth={1.8} /></button>{openPanel === 'notifications' && <div className="popover notification-popover"><div className="popover-heading">Notifications</div><div className="popover-empty">Brightloop has no notification feed configured yet. Check the dashboard for live invoice and renewal attention signals.</div></div>}</div>
      <div className="topbar-popover-wrap profile-wrap"><button className="profile-button" onClick={() => setOpenPanel(openPanel === 'profile' ? null : 'profile')} aria-expanded={openPanel === 'profile'}><span className="profile-avatar"><UserRound size={16} /></span><span className="profile-copy">{profile?.full_name || user?.email || 'Workspace user'}<small>{profile?.role?.toLowerCase() || 'account'}</small></span><ChevronDown size={15} /></button>{openPanel === 'profile' && <div className="popover profile-popover"><div className="profile-popover-title"><UserRound size={16} /> Account</div><p className="profile-email">{user?.email}</p><Link to={profile?.role === 'CUSTOMER' ? '/portal' : '/settings'} onClick={() => setOpenPanel(null)}>{profile?.role === 'CUSTOMER' ? <UserRound size={14} /> : <Settings size={14} />} {profile?.role === 'CUSTOMER' ? 'My portal' : 'Workspace settings'}</Link>{actionError && <p className="form-alert form-alert--error profile-action-error" role="alert">{actionError}</p>}<button className="popover-action" type="button" onClick={handleSignOut}><LogOut size={14} /> Sign out</button></div>}</div>
    </div></header>;
}
