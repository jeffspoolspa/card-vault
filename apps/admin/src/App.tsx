import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { CardListPage } from './pages/CardListPage';
import { GenerateLinkPage } from './pages/GenerateLinkPage';
import { AccessLogPage } from './pages/AccessLogPage';

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={<DashboardPage />}>
          <Route index element={<CardListPage />} />
          <Route path="generate-link" element={<GenerateLinkPage />} />
          <Route path="access-log" element={<AccessLogPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
