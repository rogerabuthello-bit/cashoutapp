import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { db } from '../lib/firebase';
import { 
  collection, 
  query, 
  where, 
  getDocs, 
  updateDoc, 
  doc, 
  addDoc,
  serverTimestamp,
  increment,
  orderBy
} from 'firebase/firestore';
import { ShiftRecord, ShiftStatus, User, TipDistribution } from '../types';
import { formatCents, cn } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { 
  CheckCircle2, 
  Clock, 
  ArrowRight, 
  Receipt, 
  Scale, 
  Info,
  DollarSign,
  AlertCircle,
  ShieldCheck,
  ChevronRight,
  Download,
  FileJson,
  Save
} from 'lucide-react';
import { logAudit, AuditAction } from '../lib/audit';
import { logNotification } from '../lib/notifications';

export const Settlement: React.FC = () => {
  const { tenantId, user: currentUser } = useAuth();
  const [shifts, setShifts] = useState<ShiftRecord[]>([]);
  const [users, setUsers] = useState<Record<string, User>>({});
  const [loading, setLoading] = useState(true);
  const [selectedShift, setSelectedShift] = useState<ShiftRecord | null>(null);
  const [processing, setProcessing] = useState(false);
  const [distributions, setDistributions] = useState<TipDistribution[]>([]);
  const [shiftNotes, setShiftNotes] = useState('');

  useEffect(() => {
    if (tenantId) fetchData();
  }, [tenantId]);

  const fetchData = async () => {
    if (!tenantId) return;
    setLoading(true);
    try {
      // 1. Fetch Audited Shifts (Waiting for Settlement)
      const shiftsRef = collection(db, 'tenants', tenantId, 'shifts');
      const q = query(shiftsRef, where('status', '==', ShiftStatus.AUDITED), orderBy('shift_date', 'desc'));
      const snap = await getDocs(q);
      const shiftData = snap.docs.map(d => ({ id: d.id, ...d.data() } as ShiftRecord));
      setShifts(shiftData);

      // 2. Fetch Users
      const usersRef = collection(db, 'tenants', tenantId, 'users');
      const userSnap = await getDocs(usersRef);
      const userMap: Record<string, User> = {};
      userSnap.docs.forEach(d => {
        userMap[d.id] = { id: d.id, ...d.data() } as User;
      });
      setUsers(userMap);
    } finally {
      setLoading(false);
    }
  };

  const fetchDistributions = async (shift: ShiftRecord) => {
    if (!tenantId) return;
    try {
      // 1. Find pools for this shift's date
      const poolsSnap = await getDocs(query(
        collection(db, 'tenants', tenantId, 'tip_pools'),
        where('collection_date', '==', shift.shift_date),
        where('is_locked', '==', true)
      ));
      if (poolsSnap.empty) { setDistributions([]); return; }

      const poolIds = poolsSnap.docs.map(d => d.id);
      // 2. Get this user's distributions across those pools
      const distSnap = await getDocs(query(
        collection(db, 'tenants', tenantId, 'tip_distributions'),
        where('user_id', '==', shift.user_id),
        where('pool_id', 'in', poolIds)
      ));
      setDistributions(distSnap.docs.map(d => ({ id: d.id, ...d.data() } as TipDistribution)));
    } catch (err) {
      console.error('Failed to fetch distributions:', err);
      setDistributions([]);
    }
  };

  useEffect(() => {
    if (selectedShift) fetchDistributions(selectedShift);
  }, [selectedShift]);

  const exportPayrollCSV = (shift: ShiftRecord) => {
    const user = users[shift.user_id];
    const headers = ["User", "Email", "Gross", "Payout", "QualifiedTips", "TTOC", "AutoGrat"].join(",");
    const row = [
      user?.full_name,
      user?.email,
      (shift.csv_gross_cents || shift.gross_receipts_cents) / 100,
      (shift.net_payout_cents || 0) / 100,
      shift.voluntary_tips_cents / 100,
      user?.tipped_occupation_code || 'S-RT-01',
      shift.auto_gratuity_cents / 100
    ].join(",");
    
    const blob = new Blob([headers + "\n" + row], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `payroll_${user?.full_name}_${shift.shift_date}.csv`;
    a.click();
  };

  const handleSettle = async () => {
    if (!tenantId || !selectedShift || !currentUser) return;
    setProcessing(true);

    try {
      const shiftRef = doc(db, 'tenants', tenantId, 'shifts', selectedShift.id);
      const previousDebt = users[selectedShift.user_id]?.current_debt_cents || 0;
      const userName = users[selectedShift.user_id]?.full_name;
      
      // Update Shift
      await updateDoc(shiftRef, {
        status: ShiftStatus.SETTLED,
        settled_at: new Date().toISOString(),
        shift_notes: shiftNotes
      });

      // Update User: clear debt that was factored into net_payout, accumulate YTD tips
      const userRef = doc(db, 'tenants', tenantId, 'users', selectedShift.user_id);
      const prevUserData = users[selectedShift.user_id];
      // Debt was already deducted from net_payout_cents at shift submission — now zero it out
      await updateDoc(userRef, {
        current_debt_cents: 0,
        ytd_qualified_tips_cents: (prevUserData?.ytd_qualified_tips_cents || 0) + (selectedShift.voluntary_tips_cents || 0)
      });

      if (previousDebt > 0) {
        await addDoc(collection(db, 'tenants', tenantId, 'debt'), {
          user_id: selectedShift.user_id,
          shift_id: selectedShift.id,
          amount_cents: -previousDebt,
          description: `Debt cleared during settlement of shift ${selectedShift.shift_date}`,
          created_at: new Date().toISOString()
        });
      }

      await logAudit(tenantId, currentUser.id, AuditAction.SHIFT_SETTLE, `Settled shift for ${userName} on ${selectedShift.shift_date}`, {
        shift_id: selectedShift.id,
        net_cents: selectedShift.net_payout_cents,
        notes: shiftNotes
      });

      // Notify Server
      await logNotification(
        tenantId,
        selectedShift.user_id,
        'Shift Settled',
        `Your shift record for ${selectedShift.shift_date} has been settled. Final payout: ${formatCents(selectedShift.net_payout_cents)}`,
        'success'
      );

      setSelectedShift(null);
      setShiftNotes('');
      await fetchData();
    } catch (err) {
      console.error(err);
    } finally {
      setProcessing(false);
    }
  };

  if (loading) return <div className="space-y-6 animate-pulse">
    <div className="h-12 bg-zinc-900 rounded-lg w-1/4" />
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-1 h-96 bg-zinc-900 rounded-2xl" />
      <div className="lg:col-span-2 h-96 bg-zinc-900 rounded-2xl" />
    </div>
  </div>;

  return (
    <div className="space-y-8 pb-20">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Final Settlement</h1>
        <p className="text-zinc-500 mt-1">Review audited shifts and finalize payouts. Settled records are immutable.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Queue side */}
        <div className="space-y-4">
           <h3 className="text-sm font-bold uppercase tracking-widest text-zinc-500 flex items-center gap-2">
             <Clock className="w-4 h-4" /> Settlement Queue
           </h3>
           <div className="space-y-3">
             {shifts.map(shift => (
               <button 
                 key={shift.id}
                 onClick={() => setSelectedShift(shift)}
                 className={cn(
                   "w-full glass-card p-4 text-left transition-all border-l-2",
                   selectedShift?.id === shift.id ? "bg-white/5 border-l-green-500" : "hover:bg-white/5 border-l-zinc-800"
                 )}
               >
                 <div className="flex justify-between items-start mb-2">
                   <div className="flex items-center gap-2">
                     <div className="w-8 h-8 bg-zinc-800 rounded-full flex items-center justify-center text-[10px] font-bold">
                       {users[shift.user_id]?.full_name.charAt(0)}
                     </div>
                     <span className="font-bold text-sm">{users[shift.user_id]?.full_name || 'Staff'}</span>
                   </div>
                   <ChevronRight className="w-4 h-4 text-zinc-700" />
                 </div>
                 <div className="flex justify-between items-end">
                    <p className="text-[10px] font-mono text-zinc-500 uppercase">{shift.shift_date}</p>
                    <p className="text-sm font-mono font-bold text-green-400">{formatCents(shift.net_payout_cents)}</p>
                 </div>
               </button>
             ))}
             {shifts.length === 0 && (
               <div className="glass-card p-12 text-center text-zinc-600">
                  Queue is clear.
               </div>
             )}
           </div>
        </div>

        {/* Breakdown side */}
        <div className="lg:col-span-2">
           {selectedShift ? (
             <motion.div 
               initial={{ opacity: 0, x: 20 }}
               animate={{ opacity: 1, x: 0 }}
               className="glass-card overflow-hidden"
             >
               <div className="p-8 bg-zinc-950/50 border-b border-zinc-900 flex justify-between items-center">
                  <div className="flex items-center gap-4">
                    <div className="w-14 h-14 bg-zinc-900 rounded-2xl flex items-center justify-center border border-zinc-800">
                       <Receipt className="w-8 h-8 text-zinc-500" />
                    </div>
                    <div>
                      <h3 className="font-bold text-2xl">{users[selectedShift.user_id]?.full_name}</h3>
                      <p className="text-xs text-zinc-500 uppercase tracking-widest font-mono">Shift: {selectedShift.shift_date}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] text-zinc-600 font-bold uppercase tracking-tighter">Status</p>
                    <div className="flex items-center gap-2 text-indigo-400 font-bold uppercase text-xs">
                      <Clock className="w-3 h-3" /> Audited & Verified
                    </div>
                  </div>
               </div>

               <div className="p-8 space-y-8">
                  {/* The Breakdown */}
                  <div className="space-y-6">
                    <h4 className="text-xs font-bold uppercase tracking-widest text-zinc-500 flex items-center gap-2">
                       <Scale className="w-4 h-4" /> Reconciliation breakdown
                    </h4>
                    
                    <div className="space-y-4">
                       <LineItem label="POS Gross Receipts" value={selectedShift.csv_gross_cents || selectedShift.gross_receipts_cents} />
                       <LineItem label="Credit Card Payments" value={selectedShift.csv_cards_cents || (selectedShift.amex_cents + selectedShift.visa_cents + selectedShift.mc_cents + selectedShift.debit_cents)} />
                       <LineItem label="Total Gratuities (Declared)" value={selectedShift.voluntary_tips_cents + selectedShift.auto_gratuity_cents} highlight />
                       
                       <div className="py-4 border-y border-zinc-800/50 space-y-3">
                          <LineItem label="Manual Exclusions" value={selectedShift.exclusions_cents} negative />
                          <LineItem label="House Tip-out (7%)" value={selectedShift.house_tipout_cents} negative />
                          <LineItem label="Bar Tip-out (1.5%)" value={selectedShift.bar_tipout_cents} negative />
                       </div>

                       <LineItem 
                         label="Previous Debt Deduction" 
                         value={users[selectedShift.user_id]?.current_debt_cents || 0} 
                         negative={!!users[selectedShift.user_id]?.current_debt_cents}
                         faded={!users[selectedShift.user_id]?.current_debt_cents}
                       />
                       
                       <div className="p-4 bg-zinc-950 rounded-xl border border-zinc-900 space-y-3">
                          <p className="text-[10px] uppercase font-bold text-zinc-600 tracking-widest flex items-center gap-2">
                             <DollarSign className="w-3 h-3" /> Tip Pool Distributions
                          </p>
                          {distributions.map(d => (
                            <div key={d.id} className="flex justify-between text-xs">
                               <span className="text-zinc-500">Pool Share</span>
                               <span className="text-green-500 font-mono">+{formatCents(d.calculated_share_cents)}</span>
                            </div>
                          ))}
                          {distributions.length === 0 && <p className="text-xs text-zinc-700 italic">No pool shares for this period.</p>}
                       </div>

                       <div className="space-y-2">
                         <label className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest">Internal Audit Notes</label>
                         <textarea 
                           className="w-full bg-zinc-950 border border-zinc-900 rounded-xl p-3 text-xs outline-none focus:ring-1 focus:ring-indigo-500"
                           placeholder="Optional: Explanation for any weirdness..."
                           rows={2}
                           value={shiftNotes}
                           onChange={(e) => setShiftNotes(e.target.value)}
                         />
                       </div>
                    </div>
                  </div>

                  <div className="p-6 bg-white/[0.02] border border-white/5 rounded-2xl flex flex-col md:flex-row justify-between items-center gap-6">
                    <div>
                      <h4 className="text-xs font-bold uppercase tracking-widest text-zinc-500">Final Settlement Payout</h4>
                      <p className="text-4xl font-bold mt-1 text-white tabular-nums">
                        {formatCents(selectedShift.net_payout_cents)}
                      </p>
                      <div className="flex gap-4 mt-4">
                         <button 
                           onClick={() => exportPayrollCSV(selectedShift)}
                           className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 hover:text-white flex items-center gap-1.5 transition-colors"
                         >
                           <Download className="w-3 h-3" /> CSV Export
                         </button>
                         <button 
                           onClick={() => {
                             const user = users[selectedShift.user_id];
                             const data = {
                               user_name: user?.full_name,
                               email: user?.email,
                               shift_date: selectedShift.shift_date,
                               gross_sales: (selectedShift.csv_gross_cents || selectedShift.gross_receipts_cents) / 100,
                               net_payout: (selectedShift.net_payout_cents || 0) / 100,
                               qualified_tips: selectedShift.voluntary_tips_cents / 100,
                               ttoc_code: user?.tipped_occupation_code || 'S-RT-01',
                               auto_gratuity: selectedShift.auto_gratuity_cents / 100
                             };
                             const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
                             const url = window.URL.createObjectURL(blob);
                             const a = document.createElement('a');
                             a.href = url;
                             a.download = `payroll_${user?.full_name}_${selectedShift.shift_date}.json`;
                             a.click();
                           }}
                           className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 hover:text-white flex items-center gap-1.5 transition-colors"
                         >
                           <FileJson className="w-3 h-3" /> JSON Export
                         </button>
                      </div>
                    </div>
                    <div className="flex flex-col gap-2 w-full md:w-auto">
                      <button 
                        onClick={handleSettle}
                        disabled={processing}
                        className="btn-primary py-4 px-12 bg-green-500 hover:bg-green-600 text-white font-bold flex items-center justify-center gap-2"
                      >
                        {processing ? <Clock className="w-5 h-5 animate-spin" /> : <ShieldCheck className="w-5 h-5" />}
                        Finalize & Lock Record
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 text-[10px] text-zinc-600 uppercase font-medium">
                     <Info className="w-3 h-3" /> 
                     Settling marks this shift as complete and clears the staff debt ledger.
                  </div>
               </div>
             </motion.div>
           ) : (
             <div className="h-[600px] border-2 border-dashed border-zinc-800 rounded-3xl flex flex-col items-center justify-center text-zinc-700 p-12 text-center">
                <Receipt className="w-16 h-16 mb-4 opacity-10" />
                <h3 className="text-xl font-bold">No Shift Selected</h3>
                <p className="max-w-xs mt-2">Select an audited shift from the queue to review the payout breakdown and finalize settlement.</p>
             </div>
           )}
        </div>
      </div>
    </div>
  );
};

const LineItem = ({ label, value, negative, highlight, faded }: any) => (
  <div className={cn("flex justify-between items-center py-1", faded && "opacity-30")}>
    <span className="text-sm text-zinc-400">{label}</span>
    <span className={cn(
      "font-mono text-sm",
      negative ? "text-red-400" : highlight ? "text-white font-bold" : "text-zinc-500"
    )}>
      {negative ? '-' : ''}{formatCents(value)}
    </span>
  </div>
);
