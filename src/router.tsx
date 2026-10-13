import React, { Suspense, lazy } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';

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
        <Route path="*" element={<Navigate to="/decks" replace />} />
      </Routes>
    </Suspense>
  );
};