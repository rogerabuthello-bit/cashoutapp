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
  getDoc,
  serverTimestamp,
  orderBy,
  limit,
  increment
} from 'firebase/firestore';
import { ShiftRecord, ShiftStatus, User } from '../types';
import { formatCents, cn } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Upload, 
  ShieldCheck, 
  Database, 
  AlertTriangle, 
  CheckCircle2, 
  ArrowRight,
  User as UserIcon,
  Search,
  CreditCard
} from 'lucide-react';
import { logAudit, AuditAction } from '../lib/audit';
import { logNotification } from '../lib/notifications';

export const Audit: React.FC = () => {
  const { tenantId, user: currentUser } = useAuth();
  const [shifts, setShifts] = useState<ShiftRecord[]>([]);
  const [users, setUsers] = useState<Record<string, User>>({});
  const [loading, setLoading] = useState(true);
  const [csvSummary, setCsvSummary] = useState<any>(null);
  const [uploadStatus, setUploadStatus] = useState<{type: 'success'|'error'; msg: string} | null>(null);
  const [physicalCounts, setPhysicalCounts] = useState<Record<string, number>>({});
  const [finalizing, setFinalizing] = useState<string | null>(null);
  // Tip-out rates from settings (basis points). Defaults: 700 = 7%, 150 = 1.5%
  const [houseTipPct, setHouseTipPct] = useState(700);
  const [barTipPct,   setBarTipPct]   = useState(150);

  const [activeTab, setActiveTab] = useState<'pending' | 'history'>('pending');
  const [historyShifts, setHistoryShifts] = useState<ShiftRecord[]>([]);

  useEffect(() => {
    if (tenantId) {
      fetchData();
      if (activeTab === 'history') fetchHistory();
    }
  }, [tenantId, activeTab]);

  const fetchData = async () => {
    if (!tenantId) return;
    setLoading(true);
    try {
      // 0. Fetch settings for tip-out rates
      try {
        const settingsSnap = await getDoc(doc(db, 'tenants', tenantId, 'settings', 'global'));
        if (settingsSnap.exists()) {
          const s = settingsSnap.data();
          if (s.house_tip_pct) setHouseTipPct(s.house_tip_pct);
          if (s.bar_tip_pct)   setBarTipPct(s.bar_tip_pct);
        }
      } catch { /* use defaults */ }

      // 1. Fetch Pending Shifts
      const shiftsRef = collection(db, 'tenants', tenantId, 'shifts');
      const q = query(shiftsRef, where('status', '==', ShiftStatus.PENDING), orderBy('created_at', 'desc'));
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

  const fetchHistory = async () => {
    if (!tenantId) return;
    const q = query(
      collection(db, 'tenants', tenantId, 'shifts'),
      where('status', 'in', [ShiftStatus.AUDITED, ShiftStatus.SETTLED]),
      orderBy('shift_date', 'desc'),
      limit(50)
    );
    const snap = await getDocs(q);
    setHistoryShifts(snap.docs.map(d => ({ id: d.id, ...d.data() } as ShiftRecord)));
  };

  const handleReopen = async (shift: ShiftRecord) => {
    const reason = window.prompt("Enter reason for re-opening this shift:");
    if (!reason || !tenantId || !currentUser) return;

    await updateDoc(doc(db, 'tenants', tenantId, 'shifts', shift.id), {
      status: ShiftStatus.PENDING,
      reopen_reason: reason,
      reopen_at: new Date().toISOString()
    });

    await logAudit(tenantId, currentUser.id, AuditAction.SHIFT_REOPEN, `Re-opened shift for ${users[shift.user_id]?.full_name} on ${shift.shift_date}`, {
      shift_id: shift.id,
      reason
    });

    fetchHistory();
    fetchData();
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadStatus(null);

    const reader = new FileReader();
    reader.onload = async (event) => {
      const csvContent = event.target?.result as string;
      try {
        const response = await fetch('/api/audit/parse-pos', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ csvContent })
        });

        if (!response.ok) {
          const errorText = await response.text();
          let errorMessage = `Upload failed (${response.status})`;
          try {
            const errorJson = JSON.parse(errorText);
            errorMessage = errorJson.error || errorMessage;
          } catch (e) {
            // Not JSON, use truncate of text
            if (errorText.includes('PayloadTooLargeError')) {
              errorMessage = "File is too large for the server to process.";
            }
          }
          setUploadStatus({ type: 'error', msg: errorMessage });
          return;
        }

        const result = await response.json();
        if (result.success) {
          const normalizedSummary: Record<string, any> = {};
          Object.keys(result.summary).forEach(key => {
            normalizedSummary[key.toLowerCase().trim()] = result.summary[key];
          });
          
          setCsvSummary(normalizedSummary);
          
          // Auto-fill physical counts with declared if available (for convenience)
          const counts: Record<string, number> = {};
          shifts.forEach(s => {
            counts[s.id] = s.actual_cash_drop_cents;
          });
          setPhysicalCounts(counts);
          
          const summaryCount = Object.keys(result.summary).length;
          setUploadStatus({ type: 'success', msg: `POS Bible loaded — ${summaryCount} staff members found.` });
        }
      } catch (err) {
        console.error("Upload failed", err);
      }
    };
    reader.readAsText(file);
  };

  const finalizeAudit = async (shift: ShiftRecord) => {
    if (!tenantId || !currentUser) return;
    setFinalizing(shift.id);

    try {
      const serverUser = users[shift.user_id];
      const userKey = serverUser?.full_name?.toLowerCase().trim() || '';
      const csvData = csvSummary?.[userKey];
      
      const physicalCount = physicalCounts[shift.id] || 0;
      const expectedCash = shift.expected_cash_drop_cents;
      const variance = physicalCount - expectedCash;

      // Update Shift
      const shiftRef = doc(db, 'tenants', tenantId, 'shifts', shift.id);
      await updateDoc(shiftRef, {
        admin_physical_count_cents: physicalCount,
        variance_cents: variance,
        csv_gross_cents: csvData?.gross_cents || 0,
        csv_cards_cents: csvData?.cards_cents || 0,
        status: ShiftStatus.AUDITED,
      });

      // Record in system audit log
      await logAudit(tenantId, currentUser.id, AuditAction.SHIFT_AUDIT, `Audited shift for ${serverUser?.full_name} on ${shift.shift_date}`, {
        shift_id: shift.id,
        variance_cents: variance,
        physical_count_cents: physicalCount
      });

      // Notify Server
      await logNotification(
        tenantId,
        shift.user_id,
        'Shift Audited',
        `Your shift record for ${shift.shift_date} has been audited by ${currentUser.full_name}.`,
        variance === 0 ? 'success' : 'warning'
      );

      // Update debt ledger if variance is negative
      if (variance < 0) {
        await addDoc(collection(db, 'tenants', tenantId, 'debt'), {
          user_id: shift.user_id,
          shift_id: shift.id,
          amount_cents: Math.abs(variance),
          description: `Shortage from shift on ${shift.shift_date}`,
          created_at: new Date().toISOString()
        });

        // Atomically increment user's global debt (avoids stale-read race condition)
        const userRef = doc(db, 'tenants', tenantId, 'users', shift.user_id);
        await updateDoc(userRef, {
          current_debt_cents: increment(Math.abs(variance))
        });
      }

      // Tip Pool Routing (Module 2)
      // Logic: If POS data exists, we route to specific pools (AM/PM for bar, house for others)
      // applying the 7% house deduction first.
      
      if (csvData) {
        // Handle House Tips
        if (csvData.house_tips_cents > 0) {
          const houseDeduction = Math.round(csvData.house_tips_cents * (houseTipPct / 10000));
          await routeToPool(tenantId, 'house', shift.shift_date, csvData.house_tips_cents - houseDeduction);
        }
        
        // Handle Bar AM
        if (csvData.bar_am_tips_cents > 0) {
          const houseDeduction = Math.round(csvData.bar_am_tips_cents * (houseTipPct / 10000));
          await routeToPool(tenantId, 'bar_am', shift.shift_date, csvData.bar_am_tips_cents - houseDeduction);
        }

        // Handle Bar PM
        if (csvData.bar_pm_tips_cents > 0) {
          const houseDeduction = Math.round(csvData.bar_pm_tips_cents * (houseTipPct / 10000));
          await routeToPool(tenantId, 'bar_pm', shift.shift_date, csvData.bar_pm_tips_cents - houseDeduction);
        }
      } else {
        // Fallback if no CSV uploaded
        const poolBase = shift.csv_gratuity_cents || shift.expected_cash_drop_cents;
        if (poolBase > 0) {
          const houseDeduction = Math.round(poolBase * (houseTipPct / 10000));
          const poolAmount = poolBase - houseDeduction;
          await routeToPool(tenantId, 'house', shift.shift_date, poolAmount);
        }
      }

      setShifts(prev => prev.filter(s => s.id !== shift.id));
    } catch (err) {
      console.error(err);
    } finally {
      setFinalizing(null);
    }
  };

  const routeToPool = async (tId: string, type: string, date: string, amount: number) => {
    const poolsRef = collection(db, 'tenants', tId, 'tip_pools');
    const q = query(poolsRef, where('pool_type', '==', type), where('collection_date', '==', date), where('is_locked', '==', false));
    const snap = await getDocs(q);

    if (!snap.empty) {
      const poolDoc = snap.docs[0];
      await updateDoc(poolDoc.ref, {
        total_amount_cents: (poolDoc.data().total_amount_cents || 0) + amount
      });
    } else {
      await addDoc(poolsRef, {
        tenant_id: tId,
        pool_type: type,
        collection_date: date,
        total_amount_cents: amount,
        is_locked: false,
        created_at: serverTimestamp()
      });
    }
  };

  if (loading) return <div className="animate-pulse space-y-4">
    <div className="h-12 bg-zinc-900 rounded-lg w-1/4" />
    <div className="h-64 bg-zinc-900 rounded-xl" />
  </div>;

  return (
    <div className="space-y-8 pb-12">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Audit Control</h1>
          <div className="flex gap-4 mt-2">
            <button 
              onClick={() => setActiveTab('pending')}
              className={cn(
                "text-sm font-bold uppercase tracking-widest pb-2 border-b-2 transition-all",
                activeTab === 'pending' ? "text-white border-white" : "text-zinc-600 border-transparent"
              )}
            >
              Pending Approval ({shifts.length})
            </button>
            <button 
              onClick={() => setActiveTab('history')}
              className={cn(
                "text-sm font-bold uppercase tracking-widest pb-2 border-b-2 transition-all",
                activeTab === 'history' ? "text-white border-white" : "text-zinc-600 border-transparent"
              )}
            >
              Audit History
            </button>
          </div>
        </div>
        
        <div className="flex gap-3">
          <div className="flex flex-col items-end gap-2">
            <label className="cursor-pointer btn-primary flex items-center gap-2">
              <Upload className="w-4 h-4" />
              Upload POS Bible
              <input type="file" accept=".csv" className="hidden" onChange={handleFileUpload} />
            </label>
            {uploadStatus && (
              <p className={`text-xs font-medium ${uploadStatus.type === 'success' ? 'text-green-400' : 'text-red-400'}`}>
                {uploadStatus.msg}
              </p>
            )}
          </div>
        </div>
      </div>

      {activeTab === 'pending' ? (
        <div className="space-y-6">
          {!csvSummary && shifts.length > 0 && (
            <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl flex gap-3 text-amber-200">
              <AlertTriangle className="w-5 h-5 shrink-0" />
              <p className="text-sm">POS Bible not uploaded yet. Reconciliation values will be based purely on server declarations.</p>
            </div>
          )}

          {shifts.length === 0 ? (
            <div className="glass-card p-12 text-center flex flex-col items-center">
                <div className="w-12 h-12 bg-zinc-800 rounded-full flex items-center justify-center mb-4">
                    <CheckCircle2 className="text-green-500 w-6 h-6" />
                </div>
                <h3 className="font-bold text-lg">Queue Clear</h3>
                <p className="text-zinc-500 mt-1">All pending shifts have been audited.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-6">
              <AnimatePresence>
                {shifts.map((shift) => {
                  const serverUser = users[shift.user_id];
                  const userKey = serverUser?.full_name?.toLowerCase().trim() || '';
                  const bibleData = csvSummary?.[userKey];
                  const hasDiscrepancy = bibleData && (
                    Math.abs(bibleData.gross_cents - shift.gross_receipts_cents) > 10 ||
                    Math.abs(bibleData.cards_cents - (shift.amex_cents + shift.visa_cents + shift.mc_cents + shift.debit_cents)) > 10
                  );

                  return (
                    <motion.div 
                      key={shift.id}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      className={cn(
                        "glass-card overflow-hidden grid grid-cols-1 lg:grid-cols-4 border-l-4",
                        hasDiscrepancy ? "border-l-red-500" : "border-l-transparent"
                      )}
                    >
                      <div className="p-6 border-r border-zinc-800">
                        <div className="flex items-center gap-3 mb-4">
                          <div className="w-10 h-10 bg-zinc-800 rounded-full flex items-center justify-center">
                            <UserIcon className="w-5 h-5 text-zinc-400" />
                          </div>
                          <div>
                            <h4 className="font-bold truncate">{serverUser?.full_name || 'Unknown'}</h4>
                            <p className="text-xs text-zinc-500 uppercase font-mono">{shift.shift_date}</p>
                          </div>
                        </div>
                        {hasDiscrepancy && (
                            <div className="flex items-center gap-2 text-red-500 text-[10px] font-bold uppercase tracking-widest bg-red-500/10 p-2 rounded">
                                <ShieldCheck className="w-3 h-3" /> POS Discrepancy
                            </div>
                        )}
                        {shift.reopen_reason && (
                           <div className="mt-2 text-[10px] text-amber-500 bg-amber-500/5 p-2 rounded border border-amber-500/10">
                             <strong>RE-OPENED:</strong> {shift.reopen_reason}
                           </div>
                        )}
                      </div>

                      <div className="col-span-2 p-6 grid grid-cols-2 gap-8">
                        <div className="space-y-4">
                          <div>
                            <span className="text-xs text-zinc-500 uppercase font-bold tracking-tighter">Gross Sales</span>
                            <div className="flex items-center gap-4 mt-1">
                              <div>
                                <p className="text-sm font-mono">{formatCents(shift.gross_receipts_cents)}</p>
                                <p className="text-[10px] text-zinc-600 uppercase">Declared</p>
                              </div>
                              <ArrowRight className="w-3 h-3 text-zinc-700" />
                              <div>
                                <p className={cn("text-sm font-mono", bibleData ? "text-white" : "text-zinc-700")}>
                                    {bibleData ? formatCents(bibleData.gross_cents) : "---"}
                                </p>
                                <p className="text-[10px] text-zinc-600 uppercase">Bible</p>
                              </div>
                            </div>
                          </div>

                          <div>
                            <span className="text-xs text-zinc-500 uppercase font-bold tracking-tighter">Total Cards</span>
                            <div className="flex items-center gap-4 mt-1">
                               <div>
                                <p className="text-sm font-mono">{formatCents(shift.amex_cents + shift.visa_cents + shift.mc_cents + shift.debit_cents)}</p>
                                <p className="text-[10px] text-zinc-600 uppercase">Declared</p>
                              </div>
                               <ArrowRight className="w-3 h-3 text-zinc-700" />
                              <div>
                                <p className={cn("text-sm font-mono", bibleData ? "text-white" : "text-zinc-700")}>
                                    {bibleData ? formatCents(bibleData.cards_cents) : "---"}
                                </p>
                                <p className="text-[10px] text-zinc-600 uppercase">Bible</p>
                              </div>
                            </div>
                          </div>
                        </div>

                        <div className="space-y-4">
                          <div className="p-3 bg-zinc-950 rounded-lg border border-zinc-800">
                            <span className="text-xs text-zinc-500 uppercase font-bold">Recommended Cash Drop</span>
                            <p className="text-lg font-mono font-bold mt-1">{formatCents(shift.expected_cash_drop_cents)}</p>
                          </div>
                          <div className="text-xs text-zinc-500">
                            Pouch Declaration: <span className="text-zinc-300 font-mono">{formatCents(shift.actual_cash_drop_cents)}</span>
                          </div>
                        </div>
                      </div>

                      <div className="p-6 bg-zinc-900/50 flex flex-col justify-center gap-4">
                        <div className="space-y-1.5">
                          <label className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Physical Cash Count</label>
                          <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600">$</span>
                            <input 
                              type="number"
                              className="w-full bg-black border border-zinc-700 rounded-lg pl-8 pr-4 py-2 font-mono text-sm"
                              placeholder="0.00"
                              value={physicalCounts[shift.id] ? (physicalCounts[shift.id] / 100).toString() : ''}
                              onChange={(e) => {
                                const val = Math.round(parseFloat(e.target.value || '0') * 100);
                                setPhysicalCounts(prev => ({ ...prev, [shift.id]: val }));
                              }}
                            />
                          </div>
                        </div>

                        <button 
                          onClick={() => finalizeAudit(shift)}
                          disabled={!!finalizing}
                          className="w-full btn-primary bg-green-500 hover:bg-green-600 text-white flex items-center justify-center gap-2 py-2.5"
                        >
                          {finalizing === shift.id ? 'Saving...' : 'Finalize Audit'}
                        </button>
                      </div>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>
          )}
        </div>
      ) : (
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="glass-card overflow-hidden"
        >
           <table className="w-full text-left">
              <thead className="bg-zinc-950/50">
                <tr className="text-[10px] font-bold uppercase text-zinc-500">
                   <th className="px-6 py-4">Shift Date</th>
                   <th className="px-6 py-4">Staff Member</th>
                   <th className="px-6 py-4">Original Claim</th>
                   <th className="px-6 py-4">CSV-Adjusted</th>
                   <th className="px-6 py-4">Physical Count</th>
                   <th className="px-6 py-4">Variance</th>
                   <th className="px-6 py-4">Status</th>
                   <th className="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-900">
                {historyShifts.map(shift => (
                   <tr key={shift.id} className="hover:bg-white/[0.01] transition-colors">
                      <td className="px-6 py-4 text-xs font-mono">{shift.shift_date}</td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                           <div className="w-6 h-6 bg-zinc-800 rounded-full flex items-center justify-center text-[8px] font-bold">
                             {users[shift.user_id]?.full_name.charAt(0)}
                           </div>
                           <span className="text-xs font-medium">{users[shift.user_id]?.full_name}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-xs font-mono text-zinc-500">{formatCents(shift.gross_receipts_cents)}</td>
                      <td className="px-6 py-4 text-xs font-mono text-zinc-500">{formatCents(shift.csv_gross_cents || 0)}</td>
                      <td className="px-6 py-4 text-xs font-mono text-white">{formatCents(shift.admin_physical_count_cents || 0)}</td>
                      <td className={cn(
                        "px-6 py-4 text-xs font-mono font-bold",
                        (shift.variance_cents || 0) < 0 ? "text-red-400" : (shift.variance_cents || 0) > 0 ? "text-green-400" : "text-zinc-600"
                      )}>
                        {formatCents(shift.variance_cents || 0)}
                      </td>
                      <td className="px-6 py-4">
                        <span className={cn(
                          "text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full border",
                          shift.status === ShiftStatus.SETTLED ? "bg-green-500/10 border-green-500/20 text-green-500" : "bg-indigo-500/10 border-indigo-500/20 text-indigo-400"
                        )}>
                          {shift.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                         <button 
                           onClick={() => handleReopen(shift)}
                           className="text-[10px] font-bold uppercase text-zinc-600 hover:text-white transition-colors"
                         >
                           Re-open
                         </button>
                      </td>
                   </tr>
                ))}
              </tbody>
           </table>
           {historyShifts.length === 0 && (
             <div className="p-12 text-center text-zinc-600">No audit history found.</div>
           )}
        </motion.div>
      )}
    </div>
  );
};
