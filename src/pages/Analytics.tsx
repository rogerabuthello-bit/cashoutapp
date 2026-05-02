import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { db } from '../lib/firebase';
import { 
  collection, 
  query, 
  getDocs, 
  orderBy, 
  limit,
  where
} from 'firebase/firestore';
import { ShiftRecord, User } from '../types';
import { formatCents } from '../lib/utils';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  LineChart, 
  Line,
  PieChart,
  Pie,
  Cell
} from 'recharts';
import { 
  BarChart3, 
  TrendingUp, 
  Users, 
  DollarSign, 
  Calendar,
  Filter,
  Download
} from 'lucide-react';

const COLORS = ['#6366f1', '#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981'];

export const Analytics: React.FC = () => {
  const { tenantId } = useAuth();
  const [shifts, setShifts] = useState<ShiftRecord[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (tenantId) fetchData();
  }, [tenantId]);

  const fetchData = async () => {
    if (!tenantId) return;
    setLoading(true);
    try {
      const shiftsRef = collection(db, 'tenants', tenantId, 'shifts');
      const shiftsSnap = await getDocs(query(shiftsRef, orderBy('shift_date', 'asc'), limit(100)));
      setShifts(shiftsSnap.docs.map(d => ({ id: d.id, ...d.data() } as ShiftRecord)));

      const usersRef = collection(db, 'tenants', tenantId, 'users');
      const usersSnap = await getDocs(usersRef);
      setUsers(usersSnap.docs.map(d => ({ id: d.id, ...d.data() } as User)));
    } finally {
      setLoading(false);
    }
  };

  // 1. Sales by Day of Week & Daypart
  const dayOfWeekData = shifts.reduce((acc: any[], shift) => {
    const day = new Date(shift.shift_date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short' });
    const existing = acc.find(item => item.name === day);
    const amount = (shift.csv_gross_cents || shift.gross_receipts_cents) / 100;
    
    if (existing) {
      if (shift.daypart === 'AM') existing.AM += amount;
      else existing.PM += amount;
      existing.total += amount;
    } else {
      acc.push({ 
        name: day, 
        AM: shift.daypart === 'AM' ? amount : 0, 
        PM: shift.daypart === 'PM' ? amount : 0,
        total: amount 
      });
    }
    return acc;
  }, []);

  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const sortedDayData = dayOfWeekData.sort((a,b) => days.indexOf(a.name) - days.indexOf(b.name));

  // 2. Exclusions as % of Gross
  const exclusionsTrend = shifts.map(s => {
    const gross = (s.csv_gross_cents || s.gross_receipts_cents);
    const pct = gross > 0 ? (s.exclusions_cents / gross) * 100 : 0;
    return {
      date: s.shift_date,
      pct: parseFloat(pct.toFixed(2))
    };
  }).slice(-20);

  // 3. Party Code Contribution
  const partyData = shifts.reduce((acc: any[], shift) => {
    const type = shift.party_type || 'STANDARD';
    const existing = acc.find(item => item.name === type);
    const amount = (shift.csv_gross_cents || shift.gross_receipts_cents) / 100;
    if (existing) {
      existing.value += amount;
    } else {
      acc.push({ name: type, value: amount });
    }
    return acc;
  }, []);

  // 4. Payment Ratio
  const totalCards = shifts.reduce((acc, s) => acc + (s.amex_cents + s.visa_cents + s.mc_cents + s.debit_cents), 0);
  const totalCash = shifts.reduce((acc, s) => acc + s.actual_cash_drop_cents, 0);
  const paymentRatio = [
    { name: 'Cards', value: totalCards },
    { name: 'Cash', value: totalCash }
  ];

  // 5. Server Performance — only users who have at least one shift
  const serverPerf = users
    .map(user => {
      const userShifts = shifts.filter(s => s.user_id === user.id);
      if (userShifts.length === 0) return null;
      const totalSales = userShifts.reduce((acc, s) => acc + (s.csv_gross_cents || s.gross_receipts_cents), 0);
      const totalTips  = userShifts.reduce((acc, s) => acc + (s.voluntary_tips_cents + s.auto_gratuity_cents), 0);
      const avgTip = totalSales > 0 ? (totalTips / totalSales) * 100 : 0;
      return { name: user.full_name, tipPct: parseFloat(avgTip.toFixed(1)), shifts: userShifts.length };
    })
    .filter(Boolean)
    .sort((a: any, b: any) => b.tipPct - a.tipPct)
    .slice(0, 10) as { name: string; tipPct: number; shifts: number }[];

  const hasShifts = shifts.length > 0;

  if (loading) return <div className="animate-pulse space-y-6">
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <div className="h-96 bg-zinc-900 rounded-2xl" />
      <div className="h-96 bg-zinc-900 rounded-2xl" />
    </div>
  </div>;

  return (
    <div className="space-y-8 pb-20">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Intelligence Dashboard</h1>
          <p className="text-zinc-500 mt-1">Deep analysis of operational metrics and performance trends.</p>
        </div>
      </div>

      {!hasShifts && (
        <div className="glass-card p-12 text-center text-zinc-600">
          No shift data found yet. Shifts will appear here once staff have submitted and audited records.
        </div>
      )}

      {hasShifts && <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Sales by Weekday & Daypart */}
        <section className="glass-card p-8 space-y-6">
          <h3 className="text-sm font-bold uppercase tracking-widest text-zinc-500 flex items-center gap-2">
            <Calendar className="w-4 h-4" /> Daypart Distribution
          </h3>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={sortedDayData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#18181b" vertical={false} />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#71717a', fontSize: 10 }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: '#71717a', fontSize: 10 }} tickFormatter={(v) => `$${v}`} />
                <Tooltip contentStyle={{ backgroundColor: '#09090b', border: '1px solid #18181b' }} />
                <Bar dataKey="AM" stackId="a" fill="#6366f1" radius={[0, 0, 0, 0]} />
                <Bar dataKey="PM" stackId="a" fill="#4338ca" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>

        {/* Exclusions Trend */}
        <section className="glass-card p-8 space-y-6">
          <h3 className="text-sm font-bold uppercase tracking-widest text-zinc-500 flex items-center gap-2">
            <TrendingUp className="w-4 h-4" /> Exclusions as % of Gross
          </h3>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={exclusionsTrend}>
                <CartesianGrid strokeDasharray="3 3" stroke="#18181b" vertical={false} />
                <XAxis dataKey="date" hide />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: '#71717a', fontSize: 10 }} tickFormatter={(v) => `${v}%`} />
                <Tooltip contentStyle={{ backgroundColor: '#09090b', border: '1px solid #18181b' }} />
                <Line type="monotone" dataKey="pct" stroke="#ec4899" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </section>

        {/* Party Code Contribution */}
        <section className="glass-card p-8 space-y-6">
          <h3 className="text-sm font-bold uppercase tracking-widest text-zinc-500 flex items-center gap-2">
            <Users className="w-4 h-4" /> Party Code Contribution
          </h3>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={partyData} innerRadius={60} outerRadius={100} paddingAngle={5} dataKey="value">
                  {partyData.map((e, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </section>

        {/* Payment Instrument Mix */}
        <section className="glass-card p-8 space-y-6">
          <h3 className="text-sm font-bold uppercase tracking-widest text-zinc-500 flex items-center gap-2">
            <DollarSign className="w-4 h-4" /> Payment Mix
          </h3>
          <div className="h-[300px] flex items-center">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={paymentRatio} innerRadius={60} outerRadius={100} paddingAngle={5} dataKey="value">
                  {paymentRatio.map((e, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
            <div className="space-y-4 pr-12">
               {paymentRatio.map((p, i) => (
                 <div key={i}>
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: COLORS[i] }} />
                      <span className="text-[10px] font-bold text-zinc-500 uppercase">{p.name}</span>
                    </div>
                    <p className="text-lg font-bold font-mono">
                      {(totalCards + totalCash) > 0 ? ((p.value / (totalCards + totalCash)) * 100).toFixed(1) : '0.0'}%
                    </p>
                 </div>
               ))}
            </div>
          </div>
        </section>

        {/* Server Leaderboard */}
        <section className="lg:col-span-2 glass-card p-8 space-y-6">
           <h3 className="text-sm font-bold uppercase tracking-widest text-zinc-500 flex items-center gap-2">
              <TrendingUp className="w-4 h-4" /> Average Tip % by Server
           </h3>
           <div className="h-[400px]">
              <ResponsiveContainer width="100%" height="100%">
                 <BarChart data={serverPerf} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="#18181b" horizontal={false} />
                    <XAxis type="number" hide />
                    <YAxis dataKey="name" type="category" width={150} axisLine={false} tickLine={false} tick={{ fill: '#fff', fontSize: 12 }} />
                    <Tooltip cursor={{ fill: 'transparent' }} contentStyle={{ backgroundColor: '#09090b', border: '1px solid #18181b' }} />
                    <Bar dataKey="tipPct" fill="#8b5cf6" radius={[0, 4, 4, 0]}>
                       {serverPerf.map((e, i) => <Cell key={i} fill={i < 3 ? '#6366f1' : '#1e1b4b'} />)}
                    </Bar>
                 </BarChart>
              </ResponsiveContainer>
           </div>
        </section>
      </div>}
    </div>
  );
};
