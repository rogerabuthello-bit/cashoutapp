import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { db } from '../lib/firebase';
import { collection, addDoc, query, where, orderBy, limit, getDocs, doc, getDoc } from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '../lib/firestoreUtils';
import { ShiftStatus, ShiftRecord, Role, GlobalSettings } from '../types';
import { formatCents, cn } from '../lib/utils';
import { motion } from 'motion/react';
import { Calculator, Save, AlertCircle, CheckCircle2 } from 'lucide-react';
import { logNotification } from '../lib/notifications';

export const ShiftEntry: React.FC = () => {
  const { user, tenantId } = useAuth();
  const [history, setHistory] = useState<ShiftRecord[]>([]);
  const [settings, setSettings] = useState<GlobalSettings | null>(null);

  // Declaration States (in cents)
  const [gross, setGross] = useState(0);
  const [exclusions, setExclusions] = useState(0);
  const [amex, setAmex] = useState(0);
  const [visa, setVisa] = useState(0);
  const [mc, setMc] = useState(0);
  const [debit, setDebit] = useState(0);
  const [voluntaryTips, setVoluntaryTips] = useState(0);
  const [autoGratuity, setAutoGratuity] = useState(0);
  const [actualCash, setActualCash] = useState(0);

  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchAll = async () => {
      if (!tenantId || !user) return;

      // Fetch settings for tip-out rates
      try {
        const settingsSnap = await getDoc(doc(db, 'tenants', tenantId, 'settings', 'global'));
        if (settingsSnap.exists()) setSettings(settingsSnap.data() as GlobalSettings);
      } catch { /* use defaults */ }

      // Fetch recent shift history (all statuses so server can see their pipeline)
      try {
        const q = query(
          collection(db, 'tenants', tenantId, 'shifts'),
          where('user_id', '==', user.id),
          orderBy('shift_date', 'desc'),
          limit(5)
        );
        const snap = await getDocs(q);
        setHistory(snap.docs.map(d => ({ id: d.id, ...d.data() } as ShiftRecord)));
      } catch (err: any) {
        if (err.code === 'permission-denied') {
          handleFirestoreError(err, OperationType.LIST, `tenants/${tenantId}/shifts`);
        }
      }
    };
    fetchAll();
  }, [tenantId, user]);

  // Calculations
  const totalCredit = amex + visa + mc + debit;
  const expectedCash = (gross - exclusions + voluntaryTips + autoGratuity) - totalCredit;

  // Tip-out rates from settings (basis points), or sensible defaults
  const housePct = (settings?.house_tip_pct ?? 700) / 10000;
  const barPct   = (settings?.bar_tip_pct   ?? 150) / 10000;

  // Tip-outs applied to voluntary tips only
  const houseTipout = Math.round(voluntaryTips * housePct);
  const barTipout   = Math.round(voluntaryTips * barPct);
  const debt        = user?.current_debt_cents ?? 0;
  const netPayout   = Math.max(0, expectedCash - houseTipout - barTipout - debt);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tenantId || !user) return;

    // Guard: prevent duplicate submission for today
    const today = new Date().toISOString().split('T')[0];
    const existingQ = query(
      collection(db, 'tenants', tenantId, 'shifts'),
      where('user_id', '==', user.id),
      where('shift_date', '==', today),
      where('status', '==', ShiftStatus.PENDING)
    );
    const existingSnap = await getDocs(existingQ);
    if (!existingSnap.empty) {
      setError('You already have a pending submission for today. Contact your manager to re-open it.');
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      const shiftData = {
        tenant_id: tenantId,
        user_id: user.id,
        shift_date: today,
        gross_receipts_cents: gross,
        tax_cents: 0,
        exclusions_cents: exclusions,
        voluntary_tips_cents: voluntaryTips,
        auto_gratuity_cents: autoGratuity,
        amex_cents: amex,
        visa_cents: visa,
        mc_cents: mc,
        debit_cents: debit,
        actual_cash_drop_cents: actualCash,
        expected_cash_drop_cents: expectedCash,
        house_tipout_cents: houseTipout,
        bar_tipout_cents: barTipout,
        net_payout_cents: netPayout,
        status: ShiftStatus.PENDING,
        settings_version_used: settings?.settings_version ?? 1,
        created_at: new Date().toISOString(),
      };

      try {
        await addDoc(collection(db, 'tenants', tenantId, 'shifts'), shiftData);
      } catch (err: any) {
        if (err.code === 'permission-denied') {
          handleFirestoreError(err, OperationType.WRITE, `tenants/${tenantId}/shifts`);
        }
        throw err;
      }

      // Notify Managers/Admins
      try {
        const usersRef = collection(db, 'tenants', tenantId, 'users');
        const adminsSnap = await getDocs(query(usersRef, where('role', 'in', [Role.ADMIN, Role.MANAGER])));
        await Promise.all(adminsSnap.docs.map(d =>
          logNotification(
            tenantId,
            d.id,
            'Shift Submitted',
            `${user.full_name} submitted their cashout for ${shiftData.shift_date}.`,
            'info'
          )
        ));
      } catch { /* non-fatal: notification failure shouldn't block submission */ }

      setSubmitted(true);
    } catch (err: any) {
      setError(err.message || 'Submission failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const resetForm = () => {
    setGross(0); setExclusions(0); setAmex(0); setVisa(0);
    setMc(0); setDebit(0); setVoluntaryTips(0); setAutoGratuity(0); setActualCash(0);
    setSubmitted(false); setError('');
  };

  if (submitted) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] glass-card p-12 text-center max-w-2xl mx-auto">
        <div className="w-16 h-16 bg-green-500/10 rounded-full flex items-center justify-center mb-6">
          <CheckCircle2 className="text-green-500 w-10 h-10" />
        </div>
        <h2 className="text-2xl font-bold mb-4">Cashout Submitted</h2>
        <p className="text-zinc-400 mb-2">
          Awaiting manager audit. Your declared cash: <strong className="text-white">{formatCents(actualCash)}</strong>
        </p>
        <p className="text-zinc-400 mb-8 text-sm">
          Estimated net payout: <strong className="text-green-400">{formatCents(netPayout)}</strong>
        </p>
        <button onClick={resetForm} className="btn-secondary">Submit Another Shift</button>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-20">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Shift Reconciliation</h1>
          <p className="text-zinc-500 mt-1">Declare your nightly totals and drop your pouch.</p>
        </div>
        <div className="text-right">
          <p className="text-xs font-semibold text-zinc-500 uppercase tracking-widest">Current Debt</p>
          <p className="text-lg font-mono font-bold text-red-400">{formatCents(debt)}</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Left Column */}
        <div className="space-y-6">
          <section className="glass-card p-6 space-y-4">
            <h3 className="text-sm font-bold uppercase tracking-wider text-zinc-500 flex items-center gap-2">
              <Calculator className="w-4 h-4" /> Sales & Credits
            </h3>
            <InputField label="Gross Receipts (Gross + Tax)" value={gross} onChange={setGross} placeholder="0.00" />
            <InputField
              label="Manual Exclusions (Gift Cards / Staff)"
              value={exclusions}
              onChange={setExclusions}
              placeholder="0.00"
              subtext="Deducted from gross"
            />
            <div className="grid grid-cols-2 gap-4">
              <InputField label="Voluntary Digital Tips" value={voluntaryTips} onChange={setVoluntaryTips} placeholder="0.00" subtext="Qualified (TP)" />
              <InputField label="Auto Gratuities" value={autoGratuity} onChange={setAutoGratuity} placeholder="0.00" subtext="Non-Qualifying" />
            </div>
          </section>

          <section className="glass-card p-6 space-y-4">
            <h3 className="text-sm font-bold uppercase tracking-wider text-zinc-500">Cash Pouch</h3>
            <InputField label="Actual Cash in Pouch" value={actualCash} onChange={setActualCash} placeholder="0.00" highlight />
            <p className="text-xs text-zinc-500">Physically count the cash before submitting. Discrepancies are logged.</p>
          </section>
        </div>

        {/* Right Column */}
        <div className="space-y-6">
          <section className="glass-card p-6 space-y-4">
            <h3 className="text-sm font-bold uppercase tracking-wider text-zinc-500">Credit Payments</h3>
            <div className="grid grid-cols-2 gap-4">
              <InputField label="AMEX" value={amex} onChange={setAmex} />
              <InputField label="VISA" value={visa} onChange={setVisa} />
              <InputField label="Mastercard" value={mc} onChange={setMc} />
              <InputField label="Debit" value={debit} onChange={setDebit} />
            </div>
          </section>

          <section className="glass-card p-6 bg-white/5 border-white/10 space-y-4">
            <h3 className="text-sm font-bold uppercase tracking-wider text-zinc-400">Reconciliation Summary</h3>

            {history.length > 0 && (
              <div className="p-4 bg-zinc-900/50 rounded-xl border border-zinc-800">
                <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-3">Recent Shifts</p>
                <div className="space-y-2">
                  {history.map((h, i) => (
                    <div key={i} className="flex justify-between text-xs">
                      <span className="text-zinc-500">{h.shift_date}</span>
                      <span className={cn(
                        'text-[10px] uppercase font-bold px-1.5 py-0.5 rounded',
                        h.status === ShiftStatus.SETTLED ? 'bg-green-500/10 text-green-500' :
                        h.status === ShiftStatus.AUDITED ? 'bg-indigo-500/10 text-indigo-400' :
                        'bg-zinc-800 text-zinc-500'
                      )}>{h.status}</span>
                      <span className="font-mono text-zinc-300">{formatCents(h.net_payout_cents || 0)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-zinc-400">Total Credits</span>
                <span className="font-mono">{formatCents(totalCredit)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-400">Expected Cash Drop</span>
                <span className={cn('font-mono', expectedCash < 0 ? 'text-red-400' : 'text-green-400')}>{formatCents(expectedCash)}</span>
              </div>
              <div className="flex justify-between text-xs text-zinc-600">
                <span>House Tip-out ({((settings?.house_tip_pct ?? 700) / 100).toFixed(2)}%)</span>
                <span className="font-mono">− {formatCents(houseTipout)}</span>
              </div>
              <div className="flex justify-between text-xs text-zinc-600">
                <span>Bar Tip-out ({((settings?.bar_tip_pct ?? 150) / 100).toFixed(2)}%)</span>
                <span className="font-mono">− {formatCents(barTipout)}</span>
              </div>
              {debt > 0 && (
                <div className="flex justify-between text-xs text-red-400">
                  <span>Debt Deduction</span>
                  <span className="font-mono">− {formatCents(debt)}</span>
                </div>
              )}
              <div className="flex justify-between py-3 border-t border-white/10 font-bold">
                <span>Est. Net Payout</span>
                <span className="font-mono text-green-400">{formatCents(netPayout)}</span>
              </div>
            </div>

            <button
              type="submit"
              disabled={submitting || gross === 0}
              className="w-full btn-primary mt-2 flex items-center justify-center gap-2"
            >
              {submitting ? 'Processing...' : 'Submit Cashout'}
              {!submitting && <Save className="w-4 h-4" />}
            </button>

            {error && (
              <div className="mt-4 p-3 bg-red-500/10 border border-red-500/20 text-red-400 text-xs rounded-lg flex gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                {error}
              </div>
            )}
          </section>
        </div>
      </form>
    </div>
  );
};

const InputField = ({ label, value, onChange, placeholder, highlight, subtext }: any) => {
  const displayValue = value === 0 ? '' : (value / 100).toFixed(2);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.replace(/[^0-9.]/g, '');
    const parsed = parseFloat(val);
    const cents = isNaN(parsed) ? 0 : Math.round(parsed * 100);
    onChange(cents);
  };

  return (
    <div className="space-y-1.5 flex-1">
      <label className="text-xs font-medium text-zinc-400">{label}</label>
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600 text-sm">$</span>
        <input
          type="text"
          inputMode="decimal"
          placeholder={placeholder || '0.00'}
          className={cn(
            'w-full bg-zinc-950 border border-zinc-800 rounded-lg pl-8 pr-4 py-2 font-mono focus:ring-1 focus:ring-white/20 outline-none transition-all',
            highlight && 'border-white/20 ring-1 ring-white/10'
          )}
          value={displayValue}
          onChange={handleInputChange}
        />
      </div>
      {subtext && <p className="text-[10px] text-zinc-600 px-1">{subtext}</p>}
    </div>
  );
};
