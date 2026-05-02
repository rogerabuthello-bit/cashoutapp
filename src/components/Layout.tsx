import React from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { 
  LayoutDashboard, 
  Clock, 
  Coins, 
  BarChart3, 
  Settings, 
  LogOut,
  Menu,
  X,
  CreditCard,
  History,
  ShieldCheck,
  Globe,
  Bell
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../context/AuthContext';
import { auth } from '../lib/firebase';
import { Role } from '../types';
import { cn } from '../lib/utils';

interface NavItemProps {
  to: string;
  icon: React.ElementType;
  label: string;
  roles?: Role[];
}

const NavItem: React.FC<NavItemProps> = ({ to, icon: Icon, label, roles }) => {
  const { user } = useAuth();
  const location = useLocation();
  const isActive = location.pathname === to;

  if (roles && user && !roles.includes(user.role)) return null;

  return (
    <Link
      to={to}
      className={cn(
        "flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 group",
        isActive 
          ? "bg-white text-black font-medium" 
          : "text-zinc-400 hover:text-white hover:bg-zinc-800"
      )}
    >
      <Icon className={cn("w-5 h-5", isActive ? "text-black" : "text-zinc-500 group-hover:text-white")} />
      <span>{label}</span>
      {isActive && <div className="ml-auto w-1.5 h-1.5 rounded-full bg-black" />}
    </Link>
  );
};

export const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, loading } = useAuth();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  const { user: layoutUser, tenantId: layoutTenantId } = useAuth();
  useEffect(() => {
    if (!layoutTenantId || !layoutUser) return;
    const q = query(
      collection(db, 'tenants', layoutTenantId, 'notifications'),
      where('user_id', '==', layoutUser.id),
      where('is_read', '==', false)
    );
    const unsub = onSnapshot(q, snap => setUnreadCount(snap.size));
    return unsub;
  }, [layoutTenantId, layoutUser]);
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await auth.signOut();
    localStorage.removeItem('tenantId');
    navigate('/login');
  };

  if (loading) return (
    <div className="min-h-screen bg-black flex items-center justify-center">
      <div className="w-12 h-12 border-4 border-white/20 border-t-white rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="min-h-screen bg-black text-white flex flex-col md:flex-row font-sans">
      {/* Sidebar Desktop */}
      <aside className="hidden md:flex flex-col w-64 border-r border-zinc-800 p-6 gap-8 bg-zinc-950/50 backdrop-blur-xl">
        <div className="flex items-center gap-2 px-2">
          <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center">
            <Coins className="text-black w-5 h-5" />
          </div>
          <span className="text-xl font-bold tracking-tight">Cashouts</span>
        </div>

        <nav className="flex-1 flex flex-col gap-2">
          <NavItem to="/" icon={LayoutDashboard} label="Dashboard" />
          <NavItem to="/shift" icon={Clock} label="My Shift" roles={[Role.SERVER, Role.BARTENDER, Role.BOH]} />
          <NavItem to="/audit" icon={CreditCard} label="Nightly Audit" roles={[Role.ADMIN, Role.MANAGER]} />
          <NavItem to="/settle" icon={ShieldCheck} label="Final Settlement" roles={[Role.ADMIN, Role.MANAGER]} />
          <NavItem to="/tips" icon={Coins} label="Tip Distribution" roles={[Role.ADMIN, Role.MANAGER]} />
          <NavItem to="/cash" icon={History} label="Petty Cash" roles={[Role.ADMIN, Role.MANAGER]} />
          <NavItem to="/analytics" icon={BarChart3} label="Analytics" roles={[Role.ADMIN, Role.MANAGER]} />
          <NavItem to="/settings" icon={Settings} label="Staff & Settings" roles={[Role.ADMIN]} />
          <NavItem to="/super" icon={Globe} label="Platform" roles={[Role.SUPERADMIN]} />
        </nav>

        <div className="mt-auto pt-6 border-t border-zinc-800">
          <div className="px-4 py-3 mb-4 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-between">
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">{user?.full_name}</p>
              <p className="text-xs text-zinc-500 uppercase tracking-wider mt-1">{user?.role}</p>
            </div>
            {unreadCount > 0 && (
              <div className="flex items-center gap-1 ml-2 shrink-0">
                <Bell className="w-4 h-4 text-indigo-400" />
                <span className="text-xs font-bold text-indigo-400 bg-indigo-500/10 px-1.5 py-0.5 rounded-full">{unreadCount}</span>
              </div>
            )}
          </div>
          <button 
            onClick={handleSignOut}
            className="w-full flex items-center gap-3 px-4 py-3 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-xl transition-all"
          >
            <LogOut className="w-5 h-5" />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      {/* Mobile Top Bar */}
      <header className="md:hidden flex items-center justify-between p-4 border-b border-zinc-800 bg-zinc-950/50 backdrop-blur-xl sticky top-0 z-50">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center">
            <Coins className="text-black w-5 h-5" />
          </div>
          <span className="text-xl font-bold tracking-tight">Cashouts</span>
        </div>
        <button onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} className="p-2 text-zinc-400 hover:text-white">
          {isMobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </header>

      {/* Mobile Navigation Drawer */}
      {isMobileMenuOpen && (
        <div className="md:hidden fixed inset-0 z-40 bg-black pt-20 p-6 flex flex-col gap-4" onClick={() => setIsMobileMenuOpen(false)}>
          <NavItem to="/" icon={LayoutDashboard} label="Dashboard" />
          <NavItem to="/shift" icon={Clock} label="My Shift" roles={[Role.SERVER, Role.BARTENDER, Role.BOH]} />
          <NavItem to="/audit" icon={CreditCard} label="Nightly Audit" roles={[Role.ADMIN, Role.MANAGER]} />
          <NavItem to="/settle" icon={ShieldCheck} label="Final Settlement" roles={[Role.ADMIN, Role.MANAGER]} />
          <NavItem to="/tips" icon={Coins} label="Tip Distribution" roles={[Role.ADMIN, Role.MANAGER]} />
          <NavItem to="/cash" icon={History} label="Petty Cash" roles={[Role.ADMIN, Role.MANAGER]} />
          <NavItem to="/analytics" icon={BarChart3} label="Analytics" roles={[Role.ADMIN, Role.MANAGER]} />
          <NavItem to="/settings" icon={Settings} label="Staff & Settings" roles={[Role.ADMIN]} />
          <NavItem to="/super" icon={Globe} label="Platform" roles={[Role.SUPERADMIN]} />
          <button 
            onClick={handleSignOut}
            className="flex items-center gap-3 px-4 py-3 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-xl transition-all mt-auto mb-8"
          >
            <LogOut className="w-5 h-5" />
            <span>Sign Out</span>
          </button>
        </div>
      )}

      {/* Main Content */}
      <main className="flex-1 p-6 md:p-10 overflow-y-auto max-w-7xl mx-auto w-full">
        {children}
      </main>
    </div>
  );
};
