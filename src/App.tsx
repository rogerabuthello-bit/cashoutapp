import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Layout } from './components/Layout';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { ShiftEntry } from './pages/ShiftEntry';
import { Audit } from './pages/Audit';
import { Tips } from './pages/Tips';
import { Analytics } from './pages/Analytics';
import { SettingsPage } from './pages/Settings';
import { Settlement } from './pages/Settlement';
import { PettyCash } from './pages/PettyCash';
import { SuperAdmin } from './pages/SuperAdmin';

// Route Guard
const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { firebaseUser, loading, user } = useAuth();

  if (loading) return (
    <div className="min-h-screen bg-black flex items-center justify-center">
      <div className="w-12 h-12 border-4 border-white/20 border-t-white rounded-full animate-spin" />
    </div>
  );

  if (!firebaseUser) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
};

const AppRoutes = () => {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/*"
        element={
          <ProtectedRoute>
            <Layout>
              <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/shift" element={<ShiftEntry />} />
                <Route path="/audit" element={<Audit />} />
                <Route path="/settle" element={<Settlement />} />
                <Route path="/tips" element={<Tips />} />
                <Route path="/cash" element={<PettyCash />} />
                <Route path="/super" element={<SuperAdmin />} />
                <Route path="/analytics" element={<Analytics />} />
                <Route path="/settings" element={<SettingsPage />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </Layout>
          </ProtectedRoute>
        }
      />
    </Routes>
  );
};

const Placeholder = ({ title }: { title: string }) => (
  <div className="flex flex-col items-center justify-center min-h-[400px] glass-card p-12 text-center">
    <h2 className="text-2xl font-bold mb-4">{title}</h2>
    <p className="text-zinc-500 max-w-md">
      This module is part of the the Cashouts V2.0 rollout plan. 
      Full functionality for {title.toLowerCase()} is currently being connected to the core engine.
    </p>
    <div className="mt-8 px-6 py-2 bg-zinc-800 rounded-full text-sm font-medium animate-pulse">
      Implementation in Progress
    </div>
  </div>
);

export const App: React.FC = () => {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </AuthProvider>
  );
};

export default App;
