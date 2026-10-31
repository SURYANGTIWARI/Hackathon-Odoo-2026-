import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/useAuth.js';
import LoadingState from './LoadingState.jsx';

export function ProtectedRoute({ allowedRoles }) {
  const { user, profile, authLoading, profileError } = useAuth();
  const location = useLocation();
  if (authLoading) return <LoadingState label="Checking your workspace access" fullScreen />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (!profile) return <AccessIssue message={profileError} />;
  if (profile.role === 'CUSTOMER') return <Navigate to="/portal" replace />;
  if (allowedRoles && !allowedRoles.includes(profile.role)) return <Navigate to="/dashboard" replace />;
  return <Outlet />;
}

export function CustomerRoute() {
  const { user, profile, authLoading, profileError } = useAuth();
  if (authLoading) return <LoadingState label="Opening your account" fullScreen />;
  if (!user) return <Navigate to="/login" replace state={{ from: '/portal' }} />;
  if (!profile) return <AccessIssue message={profileError} />;
  if (profile.role !== 'CUSTOMER') return <Navigate to="/dashboard" replace />;
  return <Outlet />;
}

export function PublicOnlyRoute() {
  const { user, profile, authLoading } = useAuth();
  if (authLoading) return <LoadingState label="Loading Brightloop" fullScreen />;
  if (user && profile) return <Navigate to={profile.role === 'CUSTOMER' ? '/portal' : '/dashboard'} replace />;
  return <Outlet />;
}

function AccessIssue({ message }) {
  return (
    <main className="access-issue">
      <div className="access-issue-card">
        <span className="brand-mark brand-mark--large">B</span>
        <h1>We couldn’t verify this account</h1>
        <p>{message || 'Your Brightloop profile is unavailable. Please contact your administrator.'}</p>
        <a className="button button--secondary" href="/login">Return to login</a>
      </div>
    </main>
  );
}
