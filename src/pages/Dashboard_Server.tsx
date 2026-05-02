import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { db } from '../lib/firebase';
import { 
  collection, 
  query, 
  where, 
  getDocs, 
  orderBy, 
  limit,
  Timestamp,
  updateDoc,
  doc
} from 'firebase/firestore';
import { ShiftRecord, ShiftStatus, Announcement, Notification } from '../types';
import { formatCents, cn } from '../lib/utils';
import { motion } from 'motion/react';
import { 
  TrendingUp, 
  Clock, 
  CreditCard, 
  History, 
  AlertCircle,
  PiggyBank,
  ArrowUpRight,
  ShieldCheck,
  Bell,
  MessageSquare,
  Check
} from 'lucide-react';

export const ServerDashboard: React.FC = () => {
  const { user, tenantId } = useAuth();
  const [shifts, setShifts] = useState<ShiftRecord[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

  // YTD Earnings Stats
  const [stats, setStats] = useState({
    totalEarnings: 0,
    totalTipOuts: 0,
    qualifiedTips: 0,
    debtBalance: 0
  });

  useEffect(() => {
    if (tenantId && user) {
      fetchData();
    }
  }, [tenantId, user]);

  const fetchData = async () => {
    if (!tenantId || !user) return;
    setLoading(true);
    try {
      // 1. Shifts
      const shiftsSnap = await getDocs(query(
        collection(db, 'tenants', tenantId, 'shifts'),
        where('user_id', '==', user.id),
        orderBy('shift_date', 'desc'),
        limit(10)
      ));
      const shiftsData = shiftsSnap.docs.map(d => ({ id: d.id, ...d.data() } as ShiftRecord));
      setShifts(shiftsData);

      // 2. Announcements
      const announcementsSnap = await getDocs(query(
        collection(db, 'tenants', tenantId, 'announcements'),
        orderBy('created_at', 'desc'),
        limit(1)
      ));
      setAnnouncements(announcementsSnap.docs.map(d => ({ id: d.id, ...d.data() } as Announcement)));

      // 3. Notifications
      const notificationsSnap = await getDocs(query(
        collection(db, 'tenants', tenantId, 'notifications'),
        where('user_id', '==', user.id),
        where('is_read', '==', false),
        orderBy('created_at', 'desc'),
        limit(5)
      ));
      setNotifications(notificationsSnap.docs.map(d => ({ id: d.id, ...d.data() } as Notification)));

      // Stats
      const earnings = shiftsData.reduce((acc, s) => acc + (s.net_payout_cents || 0), 0);
      const tipOuts = shiftsData.reduce((acc, s) => acc + (s.house_tipout_cents + s.bar_tipout_cents || 0), 0);
      const qualified = shiftsData.reduce((acc, s) => acc + (s.voluntary_tips_cents || 0), 0);
      
      setStats({
        totalEarnings: earnings,
        totalTipOuts: tipOuts,
        qualifiedTips: qualified,
        debtBalance: user.current_debt_cents || 0
      });
    } finally {
      setLoading(false);
    }
  };

  const markRead = async (id: string) => {
    if (!tenantId) return;
    await updateDoc(doc(db, 'tenants', tenantId, 'notifications', id), { is_read: true });
    setNotifications(prev => prev.filter(n => n.id !== id));
  };

  const qualifiedTipProgress = Math.min((stats.qualifiedTips / 2500000) * 100, 100);

  if (loading) return <div className="space-y-6 animate-pulse">
    <div className="h-40 bg-zinc-900 rounded-2xl" />
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <div className="h-64 bg-zinc-900 rounded-2xl" />
      <div className="h-64 bg-zinc-900 rounded-2xl" />
    </div>
  </div>;

  return (
    <div className="space-y-8 pb-20">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Bonjour, {user?.full_name?.split(' ')[0]}</h1>
          <p className="text-zinc-500 mt-1">Here is your earnings overview for 2026.</p>
        </div>
        <div className="flex gap-4">
          {stats.debtBalance > 0 && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-2 flex items-center gap-3">
              <AlertCircle className="w-5 h-5 text-red-500" />
              <div>
                <p className="text-[10px] text-red-400 font-bold uppercase tracking-widest">Active Debt</p>
                <p className="text-lg font-mono font-bold text-red-400">{formatCents(stats.debtBalance)}</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {notifications.length > 0 && (
        <div className="space-y-3">
          {notifications.map(n => (
            <div key={n.id} className="glass-card p-4 flex items-center justify-between border-l-2 border-l-indigo-500 bg-indigo-500/5">
              <div className="flex items-center gap-4">
                <Bell className="w-4 h-4 text-indigo-400" />
                <div>
                  <p className="text-sm font-bold">{n.title}</p>
                  <p className="text-xs text-zinc-400">{n.message}</p>
                </div>
              </div>
              <button 
                onClick={() => markRead(n.id)}
                className="p-1 hover:bg-white/10 rounded-full transition-colors"
              >
                <Check className="w-4 h-4 text-zinc-500" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Main Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard 
          label="Total Net Payouts" 
          value={formatCents(stats.totalEarnings)} 
          subtext="After tip-outs & deductions" 
          icon={<TrendingUp className="w-5 h-5 text-green-400" />}
        />
        <StatCard 
          label="Total Tip-Outs Paid" 
          value={formatCents(stats.totalTipOuts)} 
          subtext="Support staff contributions" 
          icon={<PiggyBank className="w-5 h-5 text-indigo-400" />}
        />
        <StatCard 
          label="Qualified Tips (YTD)" 
          value={formatCents(stats.qualifiedTips)} 
          subtext="Under 2026 No-Tax Legislation" 
          icon={<ShieldCheck className="w-5 h-5 text-blue-400" />}
        />
        <div className="glass-card p-6 flex flex-col justify-between">
           <div>
             <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Tax-Free Cap ($25k)</span>
             <div className="mt-4 h-2 bg-zinc-900 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-gradient-to-r from-blue-500 to-indigo-500 rounded-full" 
                  style={{ width: `${qualifiedTipProgress}%` }} 
                />
             </div>
             <p className="mt-2 text-xs text-zinc-400">{qualifiedTipProgress.toFixed(1)}% reached</p>
           </div>
           <div className="mt-4 p-2 bg-white/5 rounded text-[10px] text-zinc-500 flex gap-2">
             <AlertCircle className="w-3 h-3 shrink-0" />
             Qualified tips are not subject to federal income tax (2025-2028).
           </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Main Section */}
        <div className="lg:col-span-2 space-y-6">
          {announcements.length > 0 ? (
            <section className="glass-card p-6 bg-indigo-500/[0.03] border-indigo-500/20">
              <h3 className="text-xs font-bold uppercase tracking-widest text-indigo-400 flex items-center gap-2 mb-4">
                <MessageSquare className="w-4 h-4" /> Shift Announcement
              </h3>
              <p className="text-sm font-medium text-white">{announcements[0].content}</p>
              <p className="text-[10px] text-zinc-600 mt-2">Posted by {announcements[0].author_name} • {new Date(announcements[0].created_at).toLocaleDateString()}</p>
            </section>
          ) : (
            <section className="glass-card p-6 border-zinc-900 bg-zinc-950/20">
              <p className="text-xs text-zinc-600 text-center italic">No active announcements</p>
            </section>
          )}

          <div className="space-y-4">
            <h3 className="text-sm font-bold uppercase tracking-widest text-zinc-500 flex items-center gap-2">
              <History className="w-4 h-4" /> Shift History
            </h3>
          <div className="space-y-3">
             {shifts.map(shift => (
               <div key={shift.id} className="glass-card p-4 flex items-center justify-between group hover:bg-white/[0.02] transition-colors">
                  <div className="flex items-center gap-4">
                     <div className={cn(
                       "w-10 h-10 rounded-full flex items-center justify-center border",
                       shift.status === ShiftStatus.SETTLED ? "bg-green-500/10 border-green-500/20 text-green-400" :
                       shift.status === ShiftStatus.AUDITED ? "bg-indigo-500/10 border-indigo-500/20 text-indigo-400" :
                       "bg-zinc-800 border-zinc-700 text-zinc-400"
                     )}>
                        {shift.status === ShiftStatus.SETTLED ? <ShieldCheck className="w-5 h-5" /> : 
                         shift.status === ShiftStatus.AUDITED ? <Clock className="w-5 h-5" /> :
                         <ArrowUpRight className="w-5 h-5" />}
                     </div>
                     <div>
                       <p className="font-bold">{shift.shift_date}</p>
                       <p className="text-xs uppercase font-mono text-zinc-500">{shift.status}</p>
                     </div>
                  </div>
                  
                  <div className="flex items-center gap-8">
                    <div className="text-right">
                       <p className="text-xs text-zinc-500 uppercase font-bold">Variance</p>
                       <p className={cn(
                         "font-mono font-bold",
                         (shift.variance_cents || 0) < 0 ? "text-red-400" : (shift.variance_cents || 0) > 0 ? "text-green-400" : "text-zinc-600"
                       )}>
                         {formatCents(shift.variance_cents || 0)}
                       </p>
                    </div>
                    <div className="text-right min-w-[100px]">
                       <p className="text-xs text-zinc-500 uppercase font-bold">Net Payout</p>
                       <p className="font-mono font-bold">{formatCents(shift.net_payout_cents || 0)}</p>
                    </div>
                  </div>
               </div>
             ))}
             {shifts.length === 0 && <div className="glass-card p-12 text-center text-zinc-600">No recent activity.</div>}
          </div>
        </div>
      </div>

        {/* Sidebar / Insights */}
        <div className="space-y-6">
           <section className="glass-card p-6 space-y-4">
             <h4 className="text-xs font-bold uppercase tracking-widest text-zinc-500">Compliance Stats</h4>
             <div className="space-y-4">
               <div>
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-[10px] text-zinc-500 uppercase font-bold">Qualified Tips (TP)</span>
                    <span className="text-xs font-mono font-bold">{formatCents(stats.qualifiedTips)}</span>
                  </div>
                  <div className="h-1 bg-zinc-900 rounded-full">
                    <div className="h-full bg-blue-500 rounded-full" style={{ width: `${qualifiedTipProgress}%` }} />
                  </div>
               </div>
               <div className="p-3 bg-blue-500/5 border border-blue-500/10 rounded-lg">
                 <p className="text-[10px] text-zinc-400">Your TTOC Code: <strong className="text-blue-400">{user?.tipped_occupation_code || 'S-RT-01'}</strong></p>
                 <p className="text-[9px] text-zinc-600 mt-1 leading-tight">Tax records separated per 2026 OBBBA guidelines for Box 12 Code TP reporting.</p>
               </div>
             </div>
           </section>

           <section className="glass-card p-6 space-y-4">
             <h4 className="text-xs font-bold uppercase tracking-widest text-zinc-500">Debt Overview</h4>
             {stats.debtBalance > 0 ? (
               <div className="space-y-3">
                 <p className="text-xs text-zinc-400 leading-relaxed">
                   You have an outstanding balance of <span className="text-red-400 font-bold">{formatCents(stats.debtBalance)}</span>. 
                   This will be automatically deducted from your next settlement.
                 </p>
                 <button className="w-full btn-secondary text-[10px] py-1.5 grayscale opacity-50">View Repayment History</button>
               </div>
             ) : (
               <p className="text-xs text-zinc-600">Your account is currently in good standing with no active debt ledger items.</p>
             )}
           </section>
        </div>
      </div>
    </div>
  );
};

const StatCard = ({ label, value, subtext, icon }: any) => (
  <motion.div 
    whileHover={{ y: -5 }}
    className="glass-card p-6 space-y-4"
  >
    <div className="flex justify-between items-start">
       <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">{label}</span>
       <div className="p-2 bg-white/5 rounded-lg">{icon}</div>
    </div>
    <div>
      <h2 className="text-2xl font-bold">{value}</h2>
      <p className="text-[10px] text-zinc-600 font-medium uppercase mt-1">{subtext}</p>
    </div>
  </motion.div>
);
