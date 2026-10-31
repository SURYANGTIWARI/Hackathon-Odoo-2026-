import { useEffect, useRef, useState } from 'react';
import { Bell, ChevronDown, Menu, Search, UserRound } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { descriptionByPath } from './navigation.js';

export default function Topbar({ onMenuClick }) {
  const [openPanel, setOpenPanel] = useState(null);
  const panelRef = useRef(null);
  const location = useLocation();
  const title = descriptionByPath[location.pathname] ?? 'Dashboard';

  useEffect(() => {
    function handlePointerDown(event) {
      if (panelRef.current && !panelRef.current.contains(event.target)) setOpenPanel(null);
    }
    function handleKeyDown(event) {
      if (event.key === 'Escape') setOpenPanel(null);
    }
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  return (
    <header className="topbar">
      <div className="topbar-left">
        <button className="icon-button mobile-menu" onClick={onMenuClick} aria-label="Open navigation"><Menu size={19} /></button>
        <div className="breadcrumbs"><span>Workspace</span><span className="breadcrumb-separator">/</span><strong>{title}</strong></div>
      </div>
      <div className="topbar-actions" ref={panelRef}>
        <label className="global-search">
          <Search size={15} aria-hidden="true" />
          <input type="search" placeholder="Search" aria-label="Global search" disabled />
          <kbd>⌘ K</kbd>
        </label>
        <div className="topbar-popover-wrap">
          <button className={`icon-button notification-button ${openPanel === 'notifications' ? 'is-open' : ''}`} onClick={() => setOpenPanel(openPanel === 'notifications' ? null : 'notifications')} aria-label="Notifications" aria-expanded={openPanel === 'notifications'}>
            <Bell size={18} strokeWidth={1.8} />
          </button>
          {openPanel === 'notifications' && (
            <div className="popover notification-popover" role="status">
              <div className="popover-heading">Notifications</div>
              <div className="popover-empty">No notifications yet.</div>
            </div>
          )}
        </div>
        <div className="topbar-popover-wrap profile-wrap">
          <button className="profile-button" onClick={() => setOpenPanel(openPanel === 'profile' ? null : 'profile')} aria-expanded={openPanel === 'profile'}>
            <span className="profile-avatar"><UserRound size={16} /></span>
            <span className="profile-copy">Workspace user<small>Account not connected</small></span>
            <ChevronDown size={15} />
          </button>
          {openPanel === 'profile' && (
            <div className="popover profile-popover">
              <div className="profile-popover-title"><UserRound size={16} /> Account</div>
              <p>Authentication is not connected yet.</p>
              <Link to="/settings" onClick={() => setOpenPanel(null)}>Open settings</Link>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
