import React from 'react';
import { useAuth } from '../context/AuthContext';
import { Role } from '../types';
import { ServerDashboard } from './Dashboard_Server';
import { AdminDashboard } from './Dashboard_Admin';

export const Dashboard: React.FC = () => {
  const { user } = useAuth();

  if (!user) return null;

  // Render Admin dashboard for Admin, SuperAdmin, and Manager
  if ([Role.ADMIN, Role.SUPERADMIN, Role.MANAGER].includes(user.role)) {
    return <AdminDashboard />;
  }

  // Render Server dashboard for Server, Bartender, and BOH
  return <ServerDashboard />;
};
