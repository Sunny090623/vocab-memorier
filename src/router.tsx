import React, { Suspense, lazy } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './core/auth/useAuth.ts';

const DeckListPage = lazy(() =>
  import('./features/decks/DeckListPage.tsx').then((m) => ({ default: m.DeckListPage }))
);
const ImportPage = lazy(() =>
  import('./features/import/ImportPage.tsx').then((m) => ({ default: m.ImportPage }))
);
const StudyPage = lazy(() =>
  import('./features/study/StudyPage.tsx').then((m) => ({ default: m.StudyPage }))
);
const StatsPage = lazy(() =>
  import('./features/stats/StatsPage.tsx').then((m) => ({ default: m.StatsPage }))
);
const SettingsPage = lazy(() =>
  import('./features/settings/SettingsPage.tsx').then((m) => ({ default: m.SettingsPage }))
);
const LoginPage = lazy(() =>
  import('./features/auth/LoginPage.tsx').then((m) => ({ default: m.LoginPage }))
);
const RegisterPage = lazy(() =>
  import('./features/auth/RegisterPage.tsx').then((m) => ({ default: m.RegisterPage }))
);
const AccountPage = lazy(() =>
  import('./features/auth/AccountPage.tsx').then((m) => ({ default: m.AccountPage }))
);
const AdminDashboardPage = lazy(() =>
  import('./features/admin/AdminDashboardPage.tsx').then((m) => ({ default: m.AdminDashboardPage }))
);

const LoadingFallback: React.FC = () => (
  <div
    style={{
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      minHeight: '60vh',
      color: 'var(--md-sys-color-secondary)',
      fontSize: '14px',
    }}
  >
    <span>加载中...</span>
  </div>
);

const AdminRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, isAdmin, isLoading } = useAuth();
  if (isLoading) return <LoadingFallback />;
  if (!user || !isAdmin) return <Navigate to="/decks" replace />;
  return <>{children}</>;
};

export const AppRoutes: React.FC = () => {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <Routes>
        <Route path="/" element={<Navigate to="/decks" replace />} />
        <Route path="/decks" element={<DeckListPage />} />
        <Route path="/import" element={<ImportPage />} />
        <Route path="/study/:deckId" element={<StudyPage />} />
        <Route path="/stats/:deckId" element={<StatsPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/account" element={<AccountPage />} />
        <Route
          path="/admin"
          element={
            <AdminRoute>
              <AdminDashboardPage />
            </AdminRoute>
          }
        />
        <Route path="*" element={<Navigate to="/decks" replace />} />
      </Routes>
    </Suspense>
  );
};