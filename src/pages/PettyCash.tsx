import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { db } from '../lib/firebase';
import { 
  collection, 
  query, 
  where, 
  getDocs, 
  addDoc, 
  orderBy, 
  limit,
  serverTimestamp,
  Timestamp
} from 'firebase/firestore';
import { PettyCashEntry, PettyCashEntryType } from '../types';
import { formatCents, cn } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { 
  DollarSign, 
  TrendingDown, 
  TrendingUp, 
  History, 
  AlertCircle, 
  Plus, 
  Calculator,
  Save,
  CheckCircle2,
  FileText
} from 'lucide-react';

const DENOMINATIONS = [
  { key: 'hundreds', label: '$100', value: 10000 },
  { key: 'fifties', label: '$50', value: 5000 },
  { key: 'twenties', label: '$20', value: 2000 },
  { key: 'tens', label: '$10', value: 1000 },
  { key: 'fives', label: '$5', value: 500 },
  { key: 'twos', label: '$2', value: 200 },
  { key: 'ones', label: '$1', value: 100 },
  { key: 'quarters', label: 'Quarters', value: 25 },
  { key: 'dimes', label: 'Dimes', value: 10 },
  { key: 'nickels', label: 'Nickels', value: 5 }
];

export const PettyCash: React.FC = () => {
  const { tenantId, user } = useAuth();
  const [entries, setEntries] = useState<PettyCashEntry[]>([]);
  const [balance, setBalance] = useState(0);
  const [loading, setLoading] = useState(true);
  
  // Form State
  const [mode, setMode] = useState<'view' | 'count' | 'transaction'>('view');
  const [type, setType] = useState<PettyCashEntryType>(PettyCashEntryType.EXPENSE);
  const [amountInput, setAmountInput] = useState('');
  const [description, setDescription] = useState('');
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (tenantId) fetchData();
  }, [tenantId]);

  const fetchData = async () => {
    if (!tenantId) return;
    setLoading(true);
    try {
      const q = query(
        collection(db, 'tenants', tenantId, 'petty_cash'),
        orderBy('created_at', 'desc'),
        limit(20)
      );
      const snap = await getDocs(q);
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() } as any));
      setEntries(data);
      
      // Calculate current balance from the most recent entry that has a running balance
      if (data.length > 0) {
        setBalance(data[0].running_balance_cents);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tenantId || !user) return;
    setSubmitting(true);

    const amount_cents = Math.round(parseFloat(amountInput || '0') * 100);
    if (amount_cents <= 0) { setSubmitting(false); return; }
    const multiplier = type === PettyCashEntryType.DEPOSIT ? 1 : -1;
    const newBalance = balance + (amount_cents * multiplier);
    if (newBalance < 0 && type !== PettyCashEntryType.DEPOSIT) {
      alert(`Insufficient float. Current balance: ${formatCents(balance)}`);
      setSubmitting(false);
      return;
    }

    try {
      const entryData = {
        tenant_id: tenantId,
        entry_date: new Date().toISOString().split('T')[0],
        entry_type: type,
        description,
        amount_cents,
        running_balance_cents: newBalance,
        created_by: user.id,
        created_at: new Date().toISOString()
      };

      // Flag large withdrawals
      if (type === PettyCashEntryType.WITHDRAWAL && amount_cents > 20000) {
        await addDoc(collection(db, 'tenants', tenantId, 'audit_logs'), {
          user_id: user.id,
          action: 'LARGE_WITHDRAWAL',
          details: `Withdrawal of ${formatCents(amount_cents)} by ${user.full_name}`,
          timestamp: serverTimestamp()
        });
      }

      await addDoc(collection(db, 'tenants', tenantId, 'petty_cash'), entryData);
      await fetchData();
      setMode('view');
      resetForm();
    } catch (err) {
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  const handleCount = async () => {
    if (!tenantId || !user) return;
    setSubmitting(true);

    const totalCounted = DENOMINATIONS.reduce((sum, d) => {
      return sum + (counts[d.key] || 0) * d.value;
    }, 0);

    try {
      const entryData = {
        tenant_id: tenantId,
        entry_date: new Date().toISOString().split('T')[0],
        entry_type: PettyCashEntryType.COUNT,
        description: 'Physical Float Count',
        denominations: counts,
        amount_cents: 0,
        running_balance_cents: totalCounted,
        created_by: user.id,
        created_at: new Date().toISOString()
      };

      await addDoc(collection(db, 'tenants', tenantId, 'petty_cash'), entryData);
      await fetchData();
      setMode('view');
      resetForm();
    } catch (err) {
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  const resetForm = () => {
    setAmountInput('');
    setDescription('');
    setCounts({});
  };

  if (loading) return <div className="animate-pulse space-y-6">
    <div className="h-24 bg-zinc-900 rounded-2xl" />
    <div className="h-96 bg-zinc-900 rounded-2xl" />
  </div>;

  return (
    <div className="space-y-8 pb-20">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Petty Cash Ledger</h1>
          <p className="text-zinc-500 mt-1">Track physical float, daily expenses, and bank deposits.</p>
        </div>
        
        <div className="flex gap-3">
          <button 
            onClick={() => { setMode('count'); resetForm(); }}
            className="btn-secondary flex items-center gap-2"
          >
            <Calculator className="w-4 h-4" />
            Physical Count
          </button>
          <button 
            onClick={() => { setMode('transaction'); resetForm(); }}
            className="btn-primary flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            New Transaction
          </button>
        </div>
      </div>

      {/* Balance Summary Card */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <motion.div 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-card p-6 border-l-4 border-l-indigo-500"
        >
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-zinc-500">Current Balance</p>
              <h2 className="text-3xl font-bold mt-1">{formatCents(balance)}</h2>
            </div>
            <div className="p-2 bg-indigo-500/10 rounded-lg">
              <DollarSign className="w-5 h-5 text-indigo-400" />
            </div>
          </div>
        </motion.div>
        
        <div className="md:col-span-2 glass-card p-6 flex items-center justify-between">
           <div className="space-y-1">
             <p className="text-xs font-bold uppercase tracking-widest text-zinc-500">Weekly Status</p>
             <div className="flex items-center gap-2 text-green-400">
               <CheckCircle2 className="w-4 h-4" />
               <span className="text-sm font-medium">Float is healthy</span>
             </div>
           </div>
           <button className="text-zinc-500 hover:text-white transition-colors flex items-center gap-2 text-sm font-bold uppercase tracking-widest">
             <FileText className="w-4 h-4" />
             Reconciliation Report
           </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Main Interface Area */}
        <div className="lg:col-span-2">
          {mode === 'count' ? (
            <motion.div 
               initial={{ opacity: 0, scale: 0.98 }}
               animate={{ opacity: 1, scale: 1 }}
               className="glass-card p-8 space-y-6"
            >
              <div className="flex justify-between items-center pb-4 border-b border-zinc-800">
                <h3 className="text-lg font-bold">Physical Float Count</h3>
                <button onClick={() => setMode('view')} className="text-zinc-500 hover:text-white">&times;</button>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                {DENOMINATIONS.map(d => (
                  <div key={d.key} className="space-y-1.5">
                    <label className="text-[10px] uppercase font-bold text-zinc-500 tracking-widest px-1">{d.label}</label>
                    <input 
                      type="number"
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2 text-sm font-mono focus:ring-1 focus:ring-indigo-500 outline-none"
                      placeholder="0"
                      value={counts[d.key] || ''}
                      onChange={(e) => setCounts(prev => ({ ...prev, [d.key]: parseInt(e.target.value || '0') }))}
                    />
                  </div>
                ))}
              </div>

              <div className="pt-6 border-t border-zinc-800 flex justify-between items-center">
                <div>
                  <p className="text-xs text-zinc-500 uppercase font-bold">Total Counted</p>
                  <p className="text-2xl font-bold text-green-400">
                    {formatCents(DENOMINATIONS.reduce((sum, d) => sum + (counts[d.key] || 0) * d.value, 0))}
                  </p>
                </div>
                <div className="flex gap-4">
                  <button onClick={() => setMode('view')} className="btn-secondary">Cancel</button>
                  <button onClick={handleCount} disabled={submitting} className="btn-primary flex items-center gap-2">
                    <Save className="w-4 h-4" /> Save Float Count
                  </button>
                </div>
              </div>
            </motion.div>
          ) : mode === 'transaction' ? (
             <motion.div 
               initial={{ opacity: 0, scale: 0.98 }}
               animate={{ opacity: 1, scale: 1 }}
               className="glass-card p-8 space-y-6"
            >
              <div className="flex justify-between items-center pb-4 border-b border-zinc-800">
                <h3 className="text-lg font-bold">Record Transaction</h3>
                <button onClick={() => setMode('view')} className="text-zinc-500 hover:text-white">&times;</button>
              </div>

              <form onSubmit={handleTransaction} className="space-y-6">
                <div className="flex gap-4 p-1 bg-zinc-950 rounded-lg border border-zinc-800">
                  {[PettyCashEntryType.EXPENSE, PettyCashEntryType.WITHDRAWAL, PettyCashEntryType.DEPOSIT].map(t => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setType(t)}
                      className={cn(
                        "flex-1 py-2 text-xs font-bold uppercase tracking-widest rounded-md transition-all",
                        type === t ? "bg-white text-black shadow-lg" : "text-zinc-500 hover:text-zinc-300"
                      )}
                    >
                      {t}
                    </button>
                  ))}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Amount ($)</label>
                    <div className="relative">
                      <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-600" />
                      <input 
                        type="number"
                        step="0.01"
                        className="w-full bg-zinc-950 border border-zinc-800 rounded-lg pl-10 pr-4 py-3 font-mono focus:ring-1 focus:ring-indigo-500 outline-none"
                        required
                        value={amountInput}
                        onChange={(e) => setAmountInput(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Category / Reason</label>
                    <input 
                      type="text"
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-3 text-sm focus:ring-1 focus:ring-indigo-500 outline-none"
                      placeholder="e.g. Citrus, Cleaning Supplies..."
                      required
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                    />
                  </div>
                </div>

                {type === PettyCashEntryType.WITHDRAWAL && parseFloat(amountInput) > 200 && (
                   <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl flex gap-3 text-amber-200">
                     <AlertCircle className="w-5 h-5 shrink-0" />
                     <p className="text-xs">Large withdrawals ($200+) are automatically flagged in the audit logs for review.</p>
                   </div>
                )}

                <div className="pt-6 border-t border-zinc-800 flex justify-end gap-4">
                  <button type="button" onClick={() => setMode('view')} className="btn-secondary">Cancel</button>
                  <button type="submit" disabled={submitting} className="btn-primary py-3 px-12">
                    {submitting ? 'Recording...' : 'Record Entry'}
                  </button>
                </div>
              </form>
            </motion.div>
          ) : (
            <div className="space-y-4">
               <h3 className="text-sm font-bold uppercase tracking-widest text-zinc-500 flex items-center gap-2">
                 <History className="w-4 h-4" /> Activity History
               </h3>
               
               <div className="space-y-2">
                 {entries.map((entry) => (
                   <div 
                     key={entry.id}
                     className="glass-card p-4 flex items-center justify-between group hover:bg-white/[0.02] transition-colors"
                   >
                     <div className="flex items-center gap-4">
                        <div className={cn(
                          "p-2 rounded-lg",
                          entry.entry_type === PettyCashEntryType.DEPOSIT ? "bg-green-500/10 text-green-400" : 
                          entry.entry_type === PettyCashEntryType.COUNT ? "bg-indigo-500/10 text-indigo-400" :
                          "bg-red-500/10 text-red-400"
                        )}>
                          {entry.entry_type === PettyCashEntryType.DEPOSIT ? <TrendingUp className="w-4 h-4" /> : 
                           entry.entry_type === PettyCashEntryType.COUNT ? <Calculator className="w-4 h-4" /> :
                           <TrendingDown className="w-4 h-4" />}
                        </div>
                        <div>
                          <p className="text-sm font-bold">{entry.description}</p>
                          <p className="text-[10px] uppercase font-mono text-zinc-500">
                            {new Date(entry.created_at).toLocaleString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}
                          </p>
                        </div>
                     </div>
                     <div className="text-right">
                        <p className={cn(
                          "font-mono font-bold",
                          entry.entry_type === PettyCashEntryType.DEPOSIT ? "text-green-400" :
                          entry.entry_type === PettyCashEntryType.COUNT ? "text-indigo-400" :
                          "text-red-400"
                        )}>
                          {entry.entry_type === PettyCashEntryType.DEPOSIT ? '+' : 
                           entry.entry_type === PettyCashEntryType.COUNT ? '' : '-'}
                          {entry.entry_type === PettyCashEntryType.COUNT ? formatCents(entry.running_balance_cents) : formatCents(entry.amount_cents)}
                        </p>
                        <p className="text-[10px] uppercase text-zinc-600">Balance: {formatCents(entry.running_balance_cents)}</p>
                     </div>
                   </div>
                 ))}
                 
                 {entries.length === 0 && (
                   <div className="glass-card p-12 text-center text-zinc-600">
                      No activity recorded yet.
                   </div>
                 )}
               </div>
            </div>
          )}
        </div>

        {/* Sidebar Alerts / Stats */}
        <div className="space-y-6">
           <section className="glass-card p-6 space-y-4">
             <h4 className="text-xs font-bold uppercase tracking-widest text-zinc-500">Security & Alerts</h4>
             <div className="space-y-3">
               <div className="p-3 bg-zinc-950 rounded border border-zinc-900 border-l-2 border-l-amber-500 flex gap-3">
                  <AlertCircle className="w-4 h-4 text-amber-500 shrink-0" />
                  <p className="text-[10px] text-zinc-400">Withdrawals exceeding $200.00 require manager override and secondary witness signature per SOP.</p>
               </div>
             </div>
           </section>

           <section className="glass-card p-6 space-y-4">
             <h4 className="text-xs font-bold uppercase tracking-widest text-zinc-500">Category Breakdown (Monthly)</h4>
             <div className="space-y-4">
                {[
                  { label: 'Citrus & Garnish', val: 12050, pct: 45 },
                  { label: 'Cleaning Supplies', val: 8500, pct: 30 },
                  { label: 'Smallwares', val: 4500, pct: 15 },
                  { label: 'Misc', val: 3000, pct: 10 }
                ].map((cat, i) => (
                  <div key={i} className="space-y-1.5">
                    <div className="flex justify-between text-[10px] font-bold uppercase">
                      <span className="text-zinc-500">{cat.label}</span>
                      <span className="text-zinc-400">{formatCents(cat.val)}</span>
                    </div>
                    <div className="h-1 bg-zinc-900 rounded-full overflow-hidden">
                      <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${cat.pct}%` }} />
                    </div>
                  </div>
                ))}
             </div>
           </section>
        </div>
      </div>
    </div>
  );
};
