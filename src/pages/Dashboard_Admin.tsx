import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { db } from '../lib/firebase';
import { ShiftRecord, ShiftStatus, User, TipPool, Announcement } from '../types';
import { formatCents, cn } from '../lib/utils';
import { motion } from 'motion/react';
import { 
  Users, 
  BarChart3, 
  Clock, 
  AlertCircle, 
  TrendingDown,
  TrendingUp,
  ShieldAlert,
  Coins,
  Download,
  Activity,
  MessageSquare,
  Send,
  History,
  LayoutDashboard
} from 'lucide-react';
import { 
  collection, 
  query, 
  where, 
  getDocs, 
  orderBy, 
  limit, 
  addDoc
} from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '../lib/firestoreUtils';

export const AdminDashboard: React.FC = () => {
  const { user, tenantId } = useAuth();
  const [shifts, setShifts] = useState<ShiftRecord[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [pools, setPools] = useState<TipPool[]>([]);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [newAnnouncement, setNewAnnouncement] = useState('');
  const [posting, setPosting] = useState(false);
  const [announcementSuccess, setAnnouncementSuccess] = useState(false);

  useEffect(() => {
    if (tenantId) fetchData();
  }, [tenantId]);

  const fetchData = async () => {
    if (!tenantId) return;
    setLoading(true);
    try {
      // 1. Shifts (last 50 for stats)
      const shiftsSnap = await getDocs(query(
        collection(db, 'tenants', tenantId, 'shifts'), 
        orderBy('created_at', 'desc'), 
        limit(50)
      ));
      setShifts(shiftsSnap.docs.map(d => ({ id: d.id, ...d.data() } as ShiftRecord)));

      // 2. Users
      const usersSnap = await getDocs(collection(db, 'tenants', tenantId, 'users'));
      setUsers(usersSnap.docs.map(d => ({ id: d.id, ...d.data() } as User)));

      // 3. Tip Pools
      const poolsSnap = await getDocs(query(
        collection(db, 'tenants', tenantId, 'tip_pools'), 
        where('is_locked', '==', false)
      ));
      setPools(poolsSnap.docs.map(d => ({ id: d.id, ...d.data() } as TipPool)));

      // 4. Audit Logs
      const logsSnap = await getDocs(query(
        collection(db, 'tenants', tenantId, 'audit_logs'),
        orderBy('created_at', 'desc'),
        limit(10)
      ));
      setAuditLogs(logsSnap.docs.map(d => ({ id: d.id, ...d.data() })));

    } catch (err: any) {
      if (err.code === 'permission-denied') {
        handleFirestoreError(err, OperationType.LIST, `tenants/${tenantId}/...`);
      }
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handlePostAnnouncement = async () => {
    if (!tenantId || !user || !newAnnouncement.trim()) return;
    setPosting(true);
    try {
      await addDoc(collection(db, 'tenants', tenantId, 'announcements'), {
        tenant_id: tenantId,
        author_id: user.id,
        author_name: user.full_name,
        content: newAnnouncement,
        priority: 'normal',
        created_at: new Date().toISOString()
      });
      setNewAnnouncement('');
      setAnnouncementSuccess(true);
      setTimeout(() => setAnnouncementSuccess(false), 3000);
    } finally {
      setPosting(false);
    }
  };

  // Aggregations
  const pendingCount = shifts.filter(s => s.status === ShiftStatus.PENDING).length;
  const auditedCount = shifts.filter(s => s.status === ShiftStatus.AUDITED).length;
  const netVariance = shifts.reduce((acc, s) => acc + (s.variance_cents || 0), 0);
  const totalDebt = users.reduce((acc, u) => acc + (u.current_debt_cents || 0), 0);
  const flaggedShifts = shifts.filter(s => Math.abs(s.variance_cents || 0) > 2000);

  if (loading) return <div className="space-y-6 animate-pulse">
    <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
      {[1,2,3,4].map(i => <div key={i} className="h-32 bg-zinc-900 rounded-2xl" />)}
    </div>
    <div className="h-96 bg-zinc-900 rounded-2xl" />
  </div>;

  return (
    <div className="space-y-8 pb-20">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Operation Center</h1>
          <p className="text-zinc-500 mt-1">Real-time oversight of shifts, variances, and staff compliance.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <SummaryCard 
          label="Pending Audits" 
          value={pendingCount.toString()} 
          subtext={`${auditedCount} ready for settlement`}
          trend="neutral"
        />
        <SummaryCard 
          label="Net House Variance" 
          value={formatCents(netVariance)} 
          subtext={netVariance < 0 ? "Shortage" : "Overage"}
          trend={netVariance < 0 ? 'down' : 'up'}
        />
        <SummaryCard 
          label="Pools Awaiting Lock" 
          value={pools.length.toString()} 
          subtext={`${formatCents(pools.reduce((a,p) => a + p.total_amount_cents, 0))} unallocated`}
          trend="neutral"
        />
        <SummaryCard 
          label="Staff Active" 
          value={users.length.toString()} 
          subtext="Registered members" 
          icon={<Users className="w-5 h-5 text-blue-400" />}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Main Flow */}
        <div className="lg:col-span-2 space-y-6">
          <section className="glass-card p-6">
            <h3 className="text-sm font-bold uppercase tracking-widest text-zinc-500 flex items-center gap-2 mb-4">
              <MessageSquare className="w-4 h-4" /> Broadcast Announcement
            </h3>
            <div className="flex gap-4">
              <input 
                type="text" 
                value={newAnnouncement}
                onChange={e => setNewAnnouncement(e.target.value)}
                placeholder="Message all staff members..." 
                className="flex-1 bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-sm focus:ring-1 focus:ring-indigo-500 outline-none"
              />
              <button 
                onClick={handlePostAnnouncement}
                disabled={posting || !newAnnouncement.trim()}
                className={`btn-primary px-8 flex items-center gap-2 ${announcementSuccess ? 'bg-green-600 hover:bg-green-700' : ''}`}
              >
                {announcementSuccess ? 'Posted!' : posting ? 'Posting...' : 'Post'}
                <Send className="w-4 h-4" />
              </button>
            </div>
          </section>

          <section className="glass-card p-6 space-y-4">
            <h3 className="text-sm font-bold uppercase tracking-widest text-zinc-500 flex items-center gap-2">
              <Download className="w-4 h-4" /> Compliance & Global Exports
            </h3>
            <div className="grid grid-cols-2 gap-4">
               <button 
                 onClick={() => {
                   const rows = [['Date','Server','Gross','Net Payout','Variance','Status']];
                   shifts.forEach(s => {
                     const u = users.find(u => u.id === s.user_id);
                     rows.push([s.shift_date, u?.full_name||'', (s.gross_receipts_cents/100).toFixed(2), (s.net_payout_cents/100||0).toFixed(2), (s.variance_cents/100||0).toFixed(2), s.status]);
                   });
                   const blob = new Blob([rows.map(r=>r.join(',')).join('\n')], {type:'text/csv'});
                   const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
                   a.download = `weekly_summary_${new Date().toISOString().split('T')[0]}.csv`; a.click();
                 }}
                 className="p-4 bg-zinc-950 border border-zinc-800 rounded-xl hover:border-indigo-500/50 transition-colors text-left group">
                  <p className="text-[10px] font-bold text-zinc-600 uppercase group-hover:text-indigo-400 transition-colors">Historical</p>
                  <p className="text-sm font-bold mt-1">Weekly Summary</p>
               </button>
               <button
                 onClick={() => {
                   const rows = [['Employee','Email','YTD_Qualified_Tips','TTOC','Role']];
                   users.forEach(u => rows.push([u.full_name, u.email, ((u.ytd_qualified_tips_cents||0)/100).toFixed(2), u.tipped_occupation_code||'S-RT-01', u.role]));
                   const blob = new Blob([rows.map(r=>r.join(',')).join('\n')], {type:'text/csv'});
                   const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
                   a.download = `2026_TP_tip_summary.csv`; a.click();
                 }}
                 className="p-4 bg-zinc-950 border border-zinc-800 rounded-xl hover:border-indigo-500/50 transition-colors text-left group">
                  <p className="text-[10px] font-bold text-zinc-600 uppercase group-hover:text-indigo-400 transition-colors">Compliance</p>
                  <p className="text-sm font-bold mt-1">2026 TP Export</p>
               </button>
            </div>
          </section>

          <section className="glass-card overflow-hidden">
            <div className="p-6 border-b border-zinc-800 flex justify-between items-center">
              <h3 className="text-sm font-bold uppercase tracking-widest text-zinc-500 flex items-center gap-2">
                <BarChart3 className="w-4 h-4" /> Server Accuracy Leaderboard
              </h3>
            </div>
            <div className="p-0 overflow-x-auto">
               <table className="w-full text-left">
                  <thead className="bg-zinc-950/50">
                    <tr className="text-[10px] font-bold uppercase text-zinc-500">
                      <th className="px-6 py-3">Server</th>
                      <th className="px-6 py-3">Avg Var</th>
                      <th className="px-6 py-3">Sales (YTD)</th>
                      <th className="px-6 py-3 text-right">Debt</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-900">
                    {users.slice(0, 5).map((u, i) => {
                      const uShifts = shifts.filter(s => s.user_id === u.id);
                      const avgVar = uShifts.length > 0 
                        ? uShifts.reduce((a, s) => a + Math.abs(s.variance_cents || 0), 0) / uShifts.length 
                        : 0;
                      
                      return (
                        <tr key={i} className="hover:bg-white/[0.01] transition-colors">
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 bg-zinc-800 rounded-full flex items-center justify-center text-[10px] font-bold">
                                {u.full_name.charAt(0)}
                              </div>
                              <span className="text-sm font-medium">{u.full_name}</span>
                            </div>
                          </td>
                          <td className="px-6 py-4 font-mono text-xs">{formatCents(Math.round(avgVar))}</td>
                          <td className="px-6 py-4 font-mono text-xs">{formatCents(uShifts.reduce((a,s) => a + s.gross_receipts_cents, 0))}</td>
                          <td className="px-6 py-4 text-right">
                             <span className={cn("text-xs font-mono font-bold", u.current_debt_cents > 0 ? "text-red-400" : "text-zinc-600")}>
                               {formatCents(u.current_debt_cents)}
                             </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
               </table>
            </div>
          </section>
        </div>

        {/* Audit Log / Sidebar */}
        <div className="space-y-6">
          <section className="glass-card p-6 space-y-6">
            <h3 className="text-xs font-bold uppercase tracking-widest text-zinc-500 flex items-center gap-2">
              <History className="w-3 h-3" /> System Audit Trail
            </h3>
            <div className="space-y-6">
               {auditLogs.map(log => (
                 <div key={log.id} className="relative pl-6 pb-6 border-l border-zinc-900 last:pb-0">
                    <div className="absolute left-[-5px] top-0 w-2.5 h-2.5 rounded-full bg-zinc-800 border border-zinc-950" />
                    <p className="text-[10px] font-bold text-zinc-300 uppercase tracking-tight">{log.action.replace('_', ' ')}</p>
                    <p className="text-[10px] text-zinc-500 mt-1 leading-relaxed">{log.details}</p>
                    <p className="text-[8px] text-zinc-700 mt-1 uppercase font-mono">{new Date(log.created_at).toLocaleTimeString()}</p>
                 </div>
               ))}
               {auditLogs.length === 0 && <p className="text-[10px] text-zinc-600 italic">No recent activity.</p>}
            </div>
          </section>

          <section className="glass-card p-6 space-y-4 bg-red-500/[0.02]">
            <h4 className="text-xs font-bold uppercase tracking-widest text-red-400 flex items-center gap-2">
              <ShieldAlert className="w-4 h-4" /> Anomaly Detect
            </h4>
            <div className="space-y-3">
               {flaggedShifts.slice(0, 4).map(s => {
                 const u = users.find(u => u.id === s.user_id);
                 return (
                   <div key={s.id} className="p-3 bg-red-500/5 border border-red-500/10 rounded-lg space-y-2">
                      <div className="flex justify-between items-start">
                        <span className="text-[10px] font-bold text-red-400 uppercase tracking-widest">High Variance</span>
                        <span className="text-[10px] font-mono text-zinc-600">{s.shift_date}</span>
                      </div>
                      <p className="text-xs text-zinc-300">
                        <strong className="text-white">{u?.full_name}</strong> reported a variance of <strong className="text-red-400">{formatCents(s.variance_cents || 0)}</strong>.
                      </p>
                   </div>
                 );
               })}
               
               {flaggedShifts.length === 0 && (
                 <div className="text-center py-8">
                    <LayoutDashboard className="w-8 h-8 text-zinc-800 mx-auto mb-2" />
                    <p className="text-xs text-zinc-600">No high-risk anomalies detected.</p>
                 </div>
               )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};

const SummaryCard = ({ label, value, subtext, trend }: any) => (
  <motion.div 
    whileHover={{ y: -5 }}
    className="glass-card p-6"
  >
    <div className="flex justify-between items-start mb-4">
       <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">{label}</span>
       {trend === 'up' ? <TrendingUp className="w-3 h-3 text-green-500" /> : 
        trend === 'down' ? <TrendingDown className="w-3 h-3 text-red-500" /> : 
        <Activity className="w-3 h-3 text-zinc-700" />}
    </div>
    <h2 className="text-2xl font-bold">{value}</h2>
    <p className="text-[10px] text-zinc-600 font-medium uppercase mt-1 leading-tight">{subtext}</p>
  </motion.div>
);
