import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { db } from '../lib/firebase';
import { 
  collection, 
  getDocs, 
  addDoc, 
  updateDoc, 
  doc, 
  query, 
  where 
} from 'firebase/firestore';
import { User, Role } from '../types';
import { formatCents, cn } from '../lib/utils';
import { 
  Users, 
  Settings as SettingsIcon, 
  Shield, 
  Mail, 
  Code, 
  Plus,
  Save,
  Check,
  AlertCircle,
  Download
} from 'lucide-react';

export const SettingsPage: React.FC = () => {
  const { tenantId, user: currentUser } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  
  // New User Form
  const [showAdd, setShowAdd] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newName, setNewName] = useState('');
  const [newRole, setNewRole] = useState<Role>(Role.SERVER);

  useEffect(() => {
    if (tenantId) fetchData();
  }, [tenantId]);

  const fetchData = async () => {
    if (!tenantId) return;
    setLoading(true);
    try {
      const snap = await getDocs(collection(db, 'tenants', tenantId, 'users'));
      setUsers(snap.docs.map(d => ({ id: d.id, ...d.data() } as User)));
    } finally {
      setLoading(false);
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tenantId) return;
    try {
      await addDoc(collection(db, 'tenants', tenantId, 'users'), {
        tenant_id: tenantId,
        email: newEmail,
        full_name: newName,
        role: newRole,
        is_active: true,
        current_debt_cents: 0,
        ytd_qualified_tips_cents: 0,
        tipped_occupation_code: 'S-RT-01',
        created_at: new Date().toISOString()
      });
      setShowAdd(false);
      resetForm();
      fetchData();
    } catch (err) {
      console.error(err);
    }
  };

  const updateRole = async (userId: string, role: Role) => {
    if (!tenantId) return;
    await updateDoc(doc(db, 'tenants', tenantId, 'users', userId), { role });
    fetchData();
  };

  const updateTTOC = async (userId: string, code: string) => {
    if (!tenantId) return;
    await updateDoc(doc(db, 'tenants', tenantId, 'users', userId), { tipped_occupation_code: code });
    fetchData();
  };
  const deactivateUser = async (userId: string, currentlyActive: boolean) => {
    if (!tenantId) return;
    if (!window.confirm(`${currentlyActive ? "Deactivate" : "Reactivate"} this staff member?`)) return;
    await updateDoc(doc(db, 'tenants', tenantId, 'users', userId), { is_active: !currentlyActive });
    fetchData();
  };


  const resetForm = () => {
    setNewEmail('');
    setNewName('');
    setNewRole(Role.SERVER);
  };

  if (loading) return <div className="animate-pulse h-96 bg-zinc-900 rounded-2xl" />;

  return (
    <div className="space-y-8 pb-20">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Staff & Settings</h1>
          <p className="text-zinc-500 mt-1">Manage team members, roles, and compliance codes.</p>
        </div>
        <button onClick={() => setShowAdd(true)} className="btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" /> Add Team Member
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2">
           <section className="glass-card overflow-hidden">
             <table className="w-full text-left">
               <thead className="bg-zinc-950/50">
                 <tr className="text-[10px] font-bold uppercase text-zinc-500">
                    <th className="px-6 py-4">Name / Status</th>
                    <th className="px-6 py-4">Role</th>
                    <th className="px-6 py-4">TTOC Code</th>
                    <th className="px-6 py-4 text-right">Actions</th>
                 </tr>
               </thead>
               <tbody className="divide-y divide-zinc-900">
                 {users.map(user => (
                   <tr key={user.id} className="hover:bg-white/[0.01] transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                           <div className="w-8 h-8 bg-zinc-800 rounded-full flex items-center justify-center text-xs font-bold">
                             {user.full_name.charAt(0)}
                           </div>
                           <div>
                             <p className="text-sm font-bold">{user.full_name}</p>
                             <p className="text-[10px] text-zinc-500">{user.email}</p>
                           </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <select 
                          value={user.role}
                          onChange={(e) => updateRole(user.id, e.target.value as Role)}
                          className="bg-zinc-950 border border-zinc-800 rounded-md text-[10px] py-1 px-2 uppercase font-bold text-zinc-300 outline-none"
                        >
                          {Object.values(Role).map(r => <option key={r} value={r}>{r}</option>)}
                        </select>
                      </td>
                      <td className="px-6 py-4">
                        <input 
                          type="text"
                          defaultValue={user.tipped_occupation_code || 'S-RT-01'}
                          onBlur={(e) => updateTTOC(user.id, e.target.value)}
                          className="w-20 bg-zinc-950 border border-zinc-800 rounded-md text-[10px] py-1 px-2 font-mono text-zinc-300 outline-none focus:ring-1 focus:ring-indigo-500"
                        />
                      </td>
                      <td className="px-6 py-4 text-right">
                         <button 
                           onClick={() => deactivateUser(user.id, user.is_active)}
                           className={cn(
                             "transition-colors text-[10px] font-bold uppercase",
                             user.is_active ? "text-zinc-600 hover:text-red-400" : "text-green-600 hover:text-green-400"
                           )}
                         >
                           {user.is_active ? 'Deactivate' : 'Reactivate'}
                         </button>
                      </td>
                   </tr>
                 ))}
               </tbody>
             </table>
           </section>
        </div>

        <div className="space-y-6">
           {showAdd && (
             <div className="glass-card p-6 space-y-4 border-indigo-500/20 bg-indigo-500/[0.02]">
                <div className="flex justify-between items-center">
                  <h3 className="text-xs font-bold uppercase tracking-widest text-indigo-400">Add New Member</h3>
                  <button onClick={() => setShowAdd(false)} className="text-zinc-500 hover:text-white">&times;</button>
                </div>
                <form onSubmit={handleCreateUser} className="space-y-4">
                   <div className="space-y-1.5">
                     <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Full Name</label>
                     <input 
                      type="text" 
                      required 
                      value={newName}
                      onChange={e => setNewName(e.target.value)}
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2 text-sm outline-none focus:ring-1 focus:ring-indigo-500" 
                     />
                   </div>
                   <div className="space-y-1.5">
                     <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Email Address</label>
                     <input 
                      type="email" 
                      required 
                      value={newEmail}
                      onChange={e => setNewEmail(e.target.value)}
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2 text-sm outline-none focus:ring-1 focus:ring-indigo-500" 
                     />
                   </div>
                   <div className="space-y-1.5">
                     <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Initial Role</label>
                     <select 
                      value={newRole}
                      onChange={e => setNewRole(e.target.value as Role)}
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2 text-sm outline-none focus:ring-1 focus:ring-indigo-500"
                     >
                        {Object.values(Role).map(r => <option key={r} value={r}>{r}</option>)}
                     </select>
                   </div>
                   <button type="submit" className="w-full btn-primary py-2.5">Send Invite</button>
                </form>
             </div>
           )}

           <section className="glass-card p-6 space-y-6">
             <h3 className="text-xs font-bold uppercase tracking-widest text-zinc-500">Compliance Settings</h3>
             <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-xs text-zinc-400">Automated Debt Deduction</span>
                  <div className="w-10 h-5 bg-indigo-600 rounded-full relative">
                    <div className="absolute right-1 top-1 w-3 h-3 bg-white rounded-full" />
                  </div>
                </div>
                <div className="space-y-1.5">
                   <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Max Debt Threshold ($)</label>
                   <input 
                    type="number" 
                    defaultValue="200" 
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2 text-sm outline-none focus:ring-1 focus:ring-indigo-500" 
                   />
                </div>
                <div className="p-3 bg-zinc-950 rounded border border-zinc-900 border-l-2 border-l-blue-500 text-[10px] text-zinc-400 leading-relaxed">
                   2026 Compliance: TTOC codes are required for all staff sharing tip pools to qualify for "No Tax on Tips" deductions.
                </div>
                <button 
                  onClick={() => {
                    const csvRows = [["Employee", "Email", "YTD_Qualified_Tips", "TTOC"]];
                    users.forEach(u => csvRows.push([u.full_name, u.email, (u.ytd_qualified_tips_cents || 0) / 100, u.tipped_occupation_code || 'S-RT-01']));
                    const blob = new Blob([csvRows.map(r => r.join(',')).join("\n")], { type: 'text/csv' });
                    const url = window.URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `tax_year_2026_tip_summary.csv`;
                    a.click();
                  }}
                  className="w-full bg-blue-500/10 border border-blue-500/20 text-blue-400 py-3 rounded-xl text-[10px] font-bold uppercase tracking-widest hover:bg-blue-500/20 transition-all flex items-center justify-center gap-2"
                >
                  <Download className="w-4 h-4" /> Export 2026 Tax Summary
                </button>
             </div>
             <button className="w-full btn-secondary py-2 flex items-center justify-center gap-2 text-[10px]">
               <Save className="w-3 h-3" /> Save System Settings
             </button>
           </section>
        </div>
      </div>
    </div>
  );
};
