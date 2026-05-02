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
  orderBy
} from 'firebase/firestore';
import { TipPool, PoolType, User } from '../types';
import { formatCents, cn } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import {
  Coins,
  Users,
  Lock,
  Unlock,
  Plus,
  Trash2,
  AlertCircle,
  Download,
  Calendar,
  Layers,
} from 'lucide-react';
import { logAudit, AuditAction } from '../lib/audit';
import { logNotification } from '../lib/notifications';

interface DistributionEntry {
  userId: string;
  points: number;
}

export const Tips: React.FC = () => {
  const { tenantId, user: currentUser } = useAuth();
  const [pools, setPools] = useState<TipPool[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPool, setSelectedPool] = useState<TipPool | null>(null);
  const [entries, setEntries] = useState<DistributionEntry[]>([]);
  const [processing, setProcessing] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (tenantId) fetchData();
  }, [tenantId]);

  const fetchData = async () => {
    if (!tenantId) return;
    setLoading(true);
    try {
      const poolsRef = collection(db, 'tenants', tenantId, 'tip_pools');
      const snap = await getDocs(query(poolsRef, orderBy('collection_date', 'desc')));
      setPools(snap.docs.map(d => ({ id: d.id, ...d.data() } as TipPool)));

      const userSnap = await getDocs(collection(db, 'tenants', tenantId, 'users'));
      setUsers(userSnap.docs.map(d => ({ id: d.id, ...d.data() } as User)));
    } finally {
      setLoading(false);
    }
  };

  const addStaff = (userId: string) => {
    if (entries.find(e => e.userId === userId)) return;
    setEntries(prev => [...prev, { userId, points: 1.0 }]);
  };

  const removeStaff = (userId: string) => {
    setEntries(prev => prev.filter(e => e.userId !== userId));
  };

  const updatePoints = (userId: string, points: number) => {
    setEntries(prev => prev.map(e => e.userId === userId ? { ...e, points: Math.max(0, points) } : e));
  };

  const totalPoints = entries.reduce((sum, e) => sum + e.points, 0);
  const valuePerPoint = selectedPool && totalPoints > 0
    ? selectedPool.total_amount_cents / totalPoints
    : 0;

  const lockAndDistribute = async () => {
    if (!tenantId || !selectedPool || !currentUser || entries.length === 0) return;
    setErrorMsg('');
    setProcessing(true);

    try {
      const distRef = collection(db, 'tenants', tenantId, 'tip_distributions');

      // Pre-compute all shares so we can use them in notifications too
      const sharesWithUsers = entries.map(entry => ({
        ...entry,
        share: Math.floor(entry.points * valuePerPoint),
      }));

      await Promise.all(sharesWithUsers.map(entry =>
        addDoc(distRef, {
          tenant_id: tenantId,
          pool_id: selectedPool.id,
          user_id: entry.userId,
          points_assigned: entry.points,
          calculated_share_cents: entry.share,
          paid_at: null
        })
      ));

      // Lock the pool
      await updateDoc(doc(db, 'tenants', tenantId, 'tip_pools', selectedPool.id), {
        is_locked: true,
        locked_by: currentUser.id,
        locked_at: new Date().toISOString()
      });

      await logAudit(
        tenantId,
        currentUser.id,
        AuditAction.POOL_LOCK,
        `Locked tip pool: ${poolTypeName(selectedPool.pool_type)} (${selectedPool.collection_date})`,
        { pool_id: selectedPool.id, amount_cents: selectedPool.total_amount_cents, staff_count: entries.length }
      );

      await Promise.all(sharesWithUsers.map(entry =>
        logNotification(
          tenantId,
          entry.userId,
          'Tip Pool Shared',
          `You have been assigned ${formatCents(entry.share)} from the ${poolTypeName(selectedPool.pool_type)} pool (${selectedPool.collection_date}).`,
          'success'
        )
      ));

      await fetchData();
      setSelectedPool(null);
      setEntries([]);
    } catch (err: any) {
      console.error(err);
      setErrorMsg('Distribution failed. Please try again.');
    } finally {
      setProcessing(false);
    }
  };

  if (loading) return (
    <div className="animate-pulse space-y-4">
      <div className="h-12 bg-zinc-900 rounded-lg w-1/4" />
      <div className="h-64 bg-zinc-900 rounded-xl" />
    </div>
  );

  return (
    <div className="space-y-8 pb-20">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Tip Distributions</h1>
          <p className="text-zinc-500 mt-1">Allocate collected tips across daily pools and team members.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Pool List */}
        <div className="space-y-4">
          <h3 className="text-sm font-bold uppercase tracking-widest text-zinc-500 flex items-center gap-2">
            <Calendar className="w-4 h-4" /> Available Pools
          </h3>
          <div className="space-y-3">
            {pools.map(pool => (
              <button
                key={pool.id}
                onClick={() => { if (!pool.is_locked) { setSelectedPool(pool); setEntries([]); } }}
                className={cn(
                  'w-full glass-card p-4 text-left transition-all',
                  pool.is_locked ? 'opacity-50 cursor-not-allowed' : 'hover:scale-[1.02] cursor-pointer',
                  selectedPool?.id === pool.id && 'ring-2 ring-indigo-500 border-indigo-500/50 bg-indigo-500/5'
                )}
              >
                <div className="flex justify-between items-start mb-2">
                  <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded bg-zinc-800 text-zinc-400">
                    {pool.pool_type}
                  </span>
                  {pool.is_locked
                    ? <Lock className="w-3 h-3 text-zinc-600" />
                    : <Unlock className="w-3 h-3 text-green-500" />}
                </div>
                <div className="flex justify-between items-end">
                  <div>
                    <p className="font-mono text-xs text-zinc-500">{pool.collection_date}</p>
                    <p className="font-bold text-lg">{formatCents(pool.total_amount_cents)}</p>
                  </div>
                  {pool.party_code && (
                    <div className="text-[10px] text-zinc-500 flex items-center gap-1">
                      <Layers className="w-3 h-3" /> {pool.party_code}
                    </div>
                  )}
                </div>
              </button>
            ))}
            {pools.length === 0 && (
              <div className="glass-card p-8 text-center text-zinc-600 text-sm">
                No tip pools found. They are created automatically during audit.
              </div>
            )}
          </div>
        </div>

        {/* Distribution Workspace */}
        <div className="lg:col-span-2">
          {selectedPool ? (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="glass-card overflow-hidden"
            >
              <div className="bg-zinc-900/50 p-6 border-b border-zinc-800 flex justify-between items-center">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-indigo-500/20 rounded-full flex items-center justify-center text-indigo-400">
                    <Coins className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="font-bold text-xl">Distributing {poolTypeName(selectedPool.pool_type)}</h3>
                    <p className="text-xs text-zinc-500 font-mono">{selectedPool.collection_date} &bull; Total: {formatCents(selectedPool.total_amount_cents)}</p>
                  </div>
                </div>
                <button onClick={() => setSelectedPool(null)} className="text-zinc-500 hover:text-white transition-colors p-2 text-sm">
                  Cancel
                </button>
              </div>

              <div className="p-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  {/* Select Staff */}
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-bold uppercase tracking-widest text-zinc-500">Add Team Members</h4>
                      <Users className="w-4 h-4 text-zinc-700" />
                    </div>
                    <div className="max-h-[300px] overflow-y-auto space-y-1 bg-zinc-950/50 p-2 rounded-lg border border-zinc-900">
                      {users.filter(u => !entries.find(e => e.userId === u.id)).map(user => (
                        <button
                          key={user.id}
                          onClick={() => addStaff(user.id)}
                          className="w-full text-left p-2 hover:bg-zinc-900 rounded flex justify-between items-center transition-colors group"
                        >
                          <span className="text-sm">{user.full_name}</span>
                          <Plus className="w-4 h-4 text-zinc-600 group-hover:text-green-500" />
                        </button>
                      ))}
                      {users.filter(u => !entries.find(e => e.userId === u.id)).length === 0 && (
                        <p className="text-xs text-zinc-600 text-center py-4">All staff added.</p>
                      )}
                    </div>
                  </div>

                  {/* Point Assignment */}
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-bold uppercase tracking-widest text-zinc-500">Allocations</h4>
                      <div className="text-right">
                        <span className="text-[10px] text-zinc-600 uppercase block">Value / Point</span>
                        <span className="font-mono text-sm text-green-500">{formatCents(Math.round(valuePerPoint))}</span>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <AnimatePresence>
                        {entries.map(entry => {
                          const u = users.find(u => u.id === entry.userId);
                          const share = Math.floor(entry.points * valuePerPoint);
                          return (
                            <motion.div
                              key={entry.userId}
                              initial={{ opacity: 0, x: 20 }}
                              animate={{ opacity: 1, x: 0 }}
                              exit={{ opacity: 0, scale: 0.95 }}
                              className="bg-zinc-900 p-3 rounded-lg border border-zinc-800 flex items-center justify-between"
                            >
                              <div className="flex-1">
                                <p className="text-sm font-bold truncate">{u?.full_name}</p>
                                <p className="text-[10px] uppercase font-mono text-indigo-400">Share: {formatCents(share)}</p>
                              </div>
                              <div className="flex items-center gap-3">
                                <div className="relative">
                                  <input
                                    type="number"
                                    step="0.5"
                                    min="0"
                                    className="w-20 bg-black border border-zinc-700 rounded p-1 text-center font-mono text-sm"
                                    value={entry.points}
                                    onChange={(e) => updatePoints(entry.userId, parseFloat(e.target.value || '0'))}
                                  />
                                  <span className="absolute -top-3 left-0 text-[8px] text-zinc-600 uppercase font-bold">Points</span>
                                </div>
                                <button onClick={() => removeStaff(entry.userId)} className="text-zinc-600 hover:text-red-500 transition-colors">
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </motion.div>
                          );
                        })}
                      </AnimatePresence>
                      {entries.length === 0 && (
                        <div className="flex flex-col items-center justify-center p-8 border-2 border-dashed border-zinc-800 rounded-xl text-zinc-600">
                          <Users className="w-8 h-8 mb-2 opacity-20" />
                          <p className="text-sm text-center">Add staff from the list to begin allocation.</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {errorMsg && (
                  <div className="mt-4 p-3 bg-red-500/10 border border-red-500/20 text-red-400 text-xs rounded-lg flex gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    {errorMsg}
                  </div>
                )}

                <div className="mt-8 pt-8 border-t border-zinc-800 flex justify-between items-center">
                  <div className="flex gap-6">
                    <div>
                      <span className="text-[10px] text-zinc-500 uppercase font-bold tracking-widest block">Total Points</span>
                      <span className="text-xl font-mono">{totalPoints.toFixed(2)}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-zinc-500 uppercase font-bold tracking-widest block">Allocated</span>
                      <span className="text-xl font-mono text-indigo-400">
                        {formatCents(entries.reduce((sum, e) => sum + Math.floor(e.points * valuePerPoint), 0))}
                      </span>
                    </div>
                  </div>

                  <div className="flex gap-4 items-center">
                    <button onClick={() => window.print()} className="btn-secondary flex items-center gap-2">
                      <Download className="w-4 h-4" /> Sign-off Sheet
                    </button>
                    <button
                      onClick={lockAndDistribute}
                      disabled={processing || entries.length === 0}
                      className="btn-primary bg-indigo-500 hover:bg-indigo-600 text-white flex items-center gap-2 py-3 px-8"
                    >
                      {processing ? 'Processing...' : <><Lock className="w-4 h-4" /> Lock & Distribute</>}
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          ) : (
            <div className="h-[500px] border-2 border-dashed border-zinc-800 rounded-2xl flex flex-col items-center justify-center text-zinc-600 p-8 text-center">
              <Coins className="w-12 h-12 mb-4 opacity-20" />
              <h3 className="text-lg font-bold">No Pool Selected</h3>
              <p className="max-w-md mt-2">Select an unlocked tip pool from the sidebar to begin the distribution workflow. Locked pools are immutable.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const poolTypeName = (type: string) => {
  switch (type) {
    case 'house':  return 'Daily House Pool';
    case 'bar_am': return 'Bar AM Pool';
    case 'bar_pm': return 'Bar PM Pool';
    case 'party':  return 'Special Event Fund';
    default:       return type.toUpperCase();
  }
};
