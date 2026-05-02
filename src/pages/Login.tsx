import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { signInWithEmailAndPassword, sendPasswordResetEmail } from 'firebase/auth';
import { auth, db } from '../lib/firebase';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import { Coins, ArrowRight } from 'lucide-react';
import { motion } from 'motion/react';

export const Login: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [subdomain, setSubdomain] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { setTenantId } = useAuth();

  const handleForgotPassword = async () => {
    if (!email) { setError('Enter your email address first, then click Forgot.'); return; }
    try {
      await sendPasswordResetEmail(auth, email);
      setError('');
      alert(`Password reset email sent to ${email}`);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      // 1. Resolve tenant ID from subdomain
      const tenantsRef = collection(db, 'tenants');
      const q = query(tenantsRef, where('subdomain_slug', '==', subdomain.toLowerCase()));
      const tenantSnap = await getDocs(q);

      if (tenantSnap.empty) {
        throw new Error("Restaurant not found. Please check the subdomain.");
      }

      const tenantId = tenantSnap.docs[0].id;
      setTenantId(tenantId);

      // 2. Auth with Firebase
      await signInWithEmailAndPassword(auth, email, password);
      
      navigate('/');
    } catch (err: any) {
      // Map Firebase auth errors to friendly messages
      const code = err.code || '';
      if (code === 'auth/user-not-found' || code === 'auth/wrong-password' || code === 'auth/invalid-credential') {
        setError('Invalid email or password.');
      } else if (code === 'auth/too-many-requests') {
        setError('Too many attempts. Please wait a few minutes and try again.');
      } else {
        setError(err.message || 'Sign-in failed.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSeedData = async () => {
    setLoading(true);
    try {
      const { setDoc, doc } = await import('firebase/firestore');
      const { createUserWithEmailAndPassword } = await import('firebase/auth');
      
      const tenantId = 'marios-restaurant';

      // 1. Create Tenant
      const tenantRef = doc(db, 'tenants', tenantId);
      await setDoc(tenantRef, {
        id: tenantId,
        name: "Mario's Trattoria",
        subdomain_slug: 'marios',
        plan: 'pro',
        billing_email: 'admin@marios.com',
        is_active: true,
        created_at: new Date().toISOString()
      }, { merge: true });

      // 2. Settings
      await setDoc(doc(db, 'tenants', tenantId, 'settings', 'global'), {
        tenant_id: tenantId,
        house_tip_pct: 700,
        bar_tip_pct: 150,
        exclusion_keywords: ['Gift Card', 'Staff Meal'],
        active_party_codes: ['P10', 'P20'],
        bar_am_cutoff_time: '16:00',
        settings_version: 1,
        updated_at: new Date().toISOString()
      }, { merge: true });

      // 3. Create Test User in Auth (if they don't exist)
      let userUid = '';
      try {
        const userCred = await createUserWithEmailAndPassword(auth, 'admin@marios.com', 'password123');
        userUid = userCred.user.uid;
      } catch (authErr: any) {
        if (authErr.code === 'auth/email-already-in-use') {
          // If already in auth, we just need to try and find the UID or assume it exists
          // Since we can't get UID easily from email without admin SDK, we'll suggest just logging in
          setSubdomain('marios'); setEmail('admin@marios.com'); setPassword('password123');
          setLoading(false);
          return;
        }
        throw authErr;
      }

      // 4. Create User Document in Firestore
      if (userUid) {
        await setDoc(doc(db, 'tenants', tenantId, 'users', userUid), {
          id: userUid,
          tenant_id: tenantId,
          email: 'admin@marios.com',
          full_name: 'Mario Rossi (Admin)',
          role: 'admin',
          current_debt_cents: 0,
          is_active: true,
          created_at: new Date().toISOString()
        });
      }

      setError('');
      setSubdomain('marios');
      setEmail('admin@marios.com');
      setPassword('password123');
    } catch (err: any) {
      setError("Failed to seed: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-black flex items-center justify-center p-6 relative overflow-hidden">
      {/* Background Decor */}
      <div className="absolute top-0 left-0 w-full h-full opacity-20 pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-white rounded-full blur-[120px]" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-zinc-500 rounded-full blur-[120px]" />
      </div>

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md glass-card p-8 relative z-10"
      >
        <div className="flex flex-col items-center mb-8">
          <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center mb-4 shadow-xl shadow-white/10">
            <Coins className="text-black w-6 h-6" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-white mb-2">Welcome Back</h1>
          <p className="text-zinc-500 text-sm">Enter your credentials to access Cashouts</p>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 text-red-400 text-sm rounded-xl">
            {error}
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-4">
          <div className="space-y-2">
            <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider px-1">Restaurant ID</label>
            <div className="relative">
              <input
                type="text"
                placeholder="marios"
                required
                className="w-full input-field pr-24"
                value={subdomain}
                onChange={(e) => setSubdomain(e.target.value)}
              />
              <div className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-600 text-sm font-mono">
                .cashouts.app
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider px-1">Email Address</label>
            <input
              type="email"
              placeholder="name@email.com"
              required
              className="w-full input-field"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <div className="flex justify-between px-1">
              <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Password</label>
              <button type="button" onClick={handleForgotPassword} className="text-xs font-medium text-white/50 hover:text-white">Forgot?</button>
            </div>
            <input
              type="password"
              placeholder="••••••••"
              required
              className="w-full input-field"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          <button 
            type="submit" 
            disabled={loading}
            className="w-full btn-primary mt-4 flex items-center justify-center gap-2 group"
          >
            {loading ? 'Authenticating...' : 'Sign In'}
            {!loading && <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />}
          </button>
        </form>

        <div className="mt-8 pt-8 border-t border-zinc-800 text-center space-y-4">
          <p className="text-zinc-500 text-sm">
            Don't have an account? <span className="text-white hover:underline cursor-pointer">Contact your Admin</span>
          </p>
          <button 
            type="button"
            onClick={handleSeedData}
            className="text-xs text-zinc-500 hover:text-zinc-300 underline"
          >
            Seed Demo Project (Marios)
          </button>
        </div>
      </motion.div>
    </div>
  );
};
