import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { CollectPage } from './pages/CollectPage';
import { AddCardPage } from './pages/AddCardPage';
import { ExpiredPage } from './pages/ExpiredPage';
import { SuccessPage } from './pages/SuccessPage';

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/expired" replace />} />
        <Route path="/collect" element={<CollectPage />} />
        <Route path="/add-card" element={<AddCardPage />} />
        <Route path="/expired" element={<ExpiredPage />} />
        <Route path="/success" element={<SuccessPage />} />
      </Routes>
    </BrowserRouter>
  );
}
