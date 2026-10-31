import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './auth/AuthProvider.jsx';
import { useAuth } from './auth/useAuth.js';
import MainLayout from './components/MainLayout.jsx';
import BrandedIntro from './components/BrandedIntro.jsx';
import LoadingState from './components/LoadingState.jsx';
import { CustomerRoute, ProtectedRoute, PublicOnlyRoute } from './components/RouteGuards.jsx';
import { pageDefinitions } from './pages/pageDefinitions.js';
const LandingPage = lazy(() => import('./pages/LandingPage.jsx'));
const AuthPage = lazy(() => import('./pages/AuthPage.jsx'));
const DashboardPage = lazy(() => import('./pages/DashboardPage.jsx'));
const CustomerPortal = lazy(() => import('./pages/CustomerPortal.jsx'));
const AdminCatalogPage = lazy(() => import('./pages/AdminCatalogPage.jsx'));
const CustomersPage = lazy(() => import('./pages/CustomersPage.jsx'));
const SubscriptionsPage = lazy(() => import('./pages/SubscriptionsPage.jsx'));
const CommercialPages = lazy(() => import('./pages/CommercialPages.jsx'));
const SystemPages = lazy(() => import('./pages/SystemPages.jsx'));

function AdminModule({ page }) {
  if (page.path === 'customers') return <CustomersPage />;
  if (page.path === 'products' || page.path === 'plans') return <AdminCatalogPage kind={page.path} />;
  if (page.path === 'subscriptions') return <SubscriptionsPage />;
  if (['quotations', 'invoices', 'payments'].includes(page.path)) return <CommercialPages kind={page.path} />;
  if (['discounts', 'reports', 'settings'].includes(page.path)) return <SystemPages kind={page.path} />;
  return <DashboardPage />;
}

function AppRoutes() {
  const { user, profile, authLoading } = useAuth();
  if (authLoading && !user) return <LoadingState fullScreen label="Preparing your workspace" />;
  return <Suspense fallback={<LoadingState fullScreen label="Opening Brightloop" />}><Routes>
      <Route path="/reset-password" element={<AuthPage mode="reset" />} />
      <Route element={<PublicOnlyRoute />}>
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<AuthPage mode="login" />} />
        <Route path="/signup" element={<AuthPage mode="signup" />} />
      </Route>
      <Route element={<ProtectedRoute allowedRoles={['ADMIN', 'STAFF']} />}>
        <Route element={<MainLayout />}>
          <Route path="/dashboard" element={<DashboardPage />} />
          {pageDefinitions.filter((page) => page.path !== 'dashboard').map((page) => (
            <Route key={page.path} path={`/${page.path}`} element={<AdminModule page={page} />} />
          ))}
        </Route>
      </Route>
      <Route element={<CustomerRoute />}>
        <Route element={<MainLayout />}><Route path="/portal/*" element={<CustomerPortal />} /></Route>
      </Route>
      <Route path="*" element={<Navigate to={user && profile ? (profile.role === 'CUSTOMER' ? '/portal' : '/dashboard') : '/'} replace />} />
  </Routes></Suspense>;
}

export default function App() {
  return <AuthProvider><><BrandedIntro /><AppRoutes /></></AuthProvider>;
}
