import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { db } from '../lib/firebase';
import { 
  collection, 
  getDocs,
  doc,
  updateDoc,
} from 'firebase/firestore';
import { Tenant, Role } from '../types';
import { formatCents, cn } from '../lib/utils';
import { motion } from 'motion/react';
import { 
  Globe, 
  CreditCard, 
  Users, 
  Activity, 
  ShieldAlert, 
  Zap,
  BarChart4
} from 'lucide-react';

export const SuperAdmin: React.FC = () => {
  const { user } = useAuth();
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterText, setFilterText] = useState('');

  // ✅ FIXED: useEffect must come BEFORE any conditional return (Rules of Hooks)
  useEffect(() => {
    if (user?.role === Role.SUPERADMIN) {
      fetchTenants();
    } else {
      setLoading(false);
    }
  }, [user]);

  const toggleTenantStatus = async (tenantId: string, currentlyActive: boolean) => {
    if (!window.confirm(`${currentlyActive ? 'Suspend' : 'Reactivate'} this tenant?`)) return;
    await updateDoc(doc(db, 'tenants', tenantId), { is_active: !currentlyActive });
    fetchTenants();
  };

  const fetchTenants = async () => {
    setLoading(true);
    try {
      const snap = await getDocs(collection(db, 'tenants'));
      setTenants(snap.docs.map(d => ({ id: d.id, ...d.data() } as Tenant)));
    } finally {
      setLoading(false);
    }
  };

  if (user?.role !== Role.SUPERADMIN) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] text-center">
        <ShieldAlert className="w-12 h-12 text-red-500 mb-4" />
        <h2 className="text-xl font-bold">Access Restricted</h2>
        <p className="text-zinc-500">SuperAdmin privileges required to access this portal.</p>
      </div>
    );
  }

  const totalMRR = tenants.reduce((acc, t) => {
    const prices: Record<string, number> = { starter: 4900, pro: 14900, enterprise: 49900 };
    return acc + (prices[t.plan] || 0);
  }, 0);

  const filteredTenants = tenants.filter(t =>
    !filterText || t.subdomain_slug.includes(filterText.toLowerCase()) || t.name.toLowerCase().includes(filterText.toLowerCase())
  );

  if (loading) return (
    <div className="space-y-6 animate-pulse">
      <div className="h-24 bg-zinc-900 rounded-2xl" />
      <div className="h-96 bg-zinc-900 rounded-2xl" />
    </div>
  );

  return (
    <div className="space-y-8 pb-20">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Platform Control</h1>
          <p className="text-zinc-500 mt-1">Global oversight of all tenant instances and system health.</p>
        </div>
        <div className="flex gap-4">
          <div className="px-4 py-2 bg-indigo-500/10 border border-indigo-500/20 rounded-xl flex items-center gap-3">
            <Zap className="w-4 h-4 text-indigo-400" />
            <div>
              <p className="text-[10px] text-indigo-300 font-bold uppercase tracking-widest leading-none">Tenants</p>
              <p className="text-sm font-mono font-bold text-indigo-200">{tenants.length} Active</p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <PlatformStat label="Active Tenants" value={tenants.filter(t => t.is_active).length.toString()} icon={<Globe className="w-5 h-5" />} />
        <PlatformStat label="Total MRR" value={formatCents(totalMRR)} icon={<CreditCard className="w-5 h-5" />} />
        <PlatformStat
          label="Plan Mix"
          value={`${tenants.filter(t => t.plan === 'enterprise').length}E / ${tenants.filter(t => t.plan === 'pro').length}P / ${tenants.filter(t => t.plan === 'starter').length}S`}
          icon={<Users className="w-5 h-5" />}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <section className="lg:col-span-2 glass-card">
          <div className="p-6 border-b border-zinc-800 flex justify-between items-center">
            <h3 className="text-sm font-bold uppercase tracking-widest text-zinc-500 flex items-center gap-2">
              <Activity className="w-4 h-4" /> Tenant Instances
            </h3>
            <input
              type="text"
              placeholder="Filter..."
              value={filterText}
              onChange={e => setFilterText(e.target.value)}
              className="bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-1.5 text-xs outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-zinc-950/50">
                <tr className="text-[10px] font-bold uppercase text-zinc-500">
                  <th className="px-6 py-4">Instance / Slug</th>
                  <th className="px-6 py-4">Plan</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-900">
                {filteredTenants.map(t => (
                  <tr key={t.id} className="hover:bg-white/[0.01] transition-colors">
                    <td className="px-6 py-4">
                      <div>
                        <p className="text-sm font-bold">{t.name}</p>
                        <p className="text-[10px] text-zinc-500 font-mono italic">@{t.subdomain_slug}</p>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={cn(
                        'text-[10px] font-bold uppercase px-2 py-0.5 rounded',
                        t.plan === 'enterprise' ? 'bg-purple-500/10 text-purple-400 border border-purple-500/20' :
                        t.plan === 'pro' ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20' :
                        'bg-zinc-800 text-zinc-400 border border-zinc-700'
                      )}>
                        {t.plan}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <div className={cn('w-1.5 h-1.5 rounded-full', t.is_active ? 'bg-green-500' : 'bg-red-500')} />
                        <span className="text-xs">{t.is_active ? 'Active' : 'Suspended'}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right flex items-center justify-end gap-2">
                      <button 
                        onClick={() => toggleTenantStatus(t.id, t.is_active)}
                        className={`text-[10px] font-bold uppercase px-3 py-1.5 rounded-lg border transition-colors ${
                          t.is_active 
                            ? 'border-red-500/20 text-red-400 hover:bg-red-500/10' 
                            : 'border-green-500/20 text-green-400 hover:bg-green-500/10'
                        }`}
                      >
                        {t.is_active ? 'Suspend' : 'Reactivate'}
                      </button>
                    </td>
                  </tr>
                ))}
                {filteredTenants.length === 0 && (
                  <tr><td colSpan={4} className="px-6 py-12 text-center text-zinc-600 text-sm">No tenants found.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="space-y-6">
          <div className="glass-card p-6 space-y-4">
            <h4 className="text-xs font-bold uppercase tracking-widest text-zinc-500">Plan Breakdown</h4>
            {(['enterprise', 'pro', 'starter'] as const).map(plan => {
              const count = tenants.filter(t => t.plan === plan).length;
              const pct = tenants.length > 0 ? (count / tenants.length) * 100 : 0;
              return (
                <div key={plan} className="space-y-1.5">
                  <div className="flex justify-between text-[10px] font-bold uppercase">
                    <span className="text-zinc-500">{plan}</span>
                    <span className="text-zinc-400">{count} tenants</span>
                  </div>
                  <div className="h-1 bg-zinc-900 rounded-full overflow-hidden">
                    <div
                      className={cn('h-full rounded-full', plan === 'enterprise' ? 'bg-purple-500' : plan === 'pro' ? 'bg-blue-500' : 'bg-zinc-600')}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          <div className="glass-card p-6 space-y-4">
            <h4 className="text-xs font-bold uppercase tracking-widest text-zinc-500">MRR by Plan</h4>
            {(['enterprise', 'pro', 'starter'] as const).map(plan => {
              const prices: Record<string, number> = { starter: 4900, pro: 14900, enterprise: 49900 };
              const mrr = tenants.filter(t => t.plan === plan).length * prices[plan];
              return (
                <div key={plan} className="flex justify-between items-center">
                  <span className="text-xs text-zinc-500 capitalize">{plan}</span>
                  <span className="font-mono text-sm font-bold">{formatCents(mrr)}</span>
                </div>
              );
            })}
            <div className="flex justify-between items-center pt-3 border-t border-zinc-800">
              <span className="text-xs font-bold text-zinc-400 uppercase">Total MRR</span>
              <span className="font-mono text-sm font-bold text-green-400">{formatCents(totalMRR)}</span>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};

const PlatformStat = ({ label, value, icon }: any) => (
  <div className="glass-card p-6 flex justify-between items-center">
    <div>
      <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">{label}</p>
      <h2 className="text-2xl font-bold mt-1 tabular-nums">{value}</h2>
    </div>
    <div className="p-3 bg-indigo-500/10 text-indigo-400 rounded-xl">
      {icon}
    </div>
  </div>
);
