import React, { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import { doc, onSnapshot, query, collection, where, getDocs } from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '../lib/firestoreUtils';
import { auth, db } from '../lib/firebase';
import { User } from '../types';

interface AuthContextType {
  user: User | null;
  firebaseUser: FirebaseUser | null;
  loading: boolean;
  tenantId: string | null;
  setTenantId: (id: string | null) => void;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  firebaseUser: null,
  loading: true,
  tenantId: null,
  setTenantId: () => {},
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  // Seed from localStorage for faster re-load, but verify server-side below
  const [tenantId, setTenantIdState] = useState<string | null>(localStorage.getItem('tenantId'));

  const setTenantId = (id: string | null) => {
    setTenantIdState(id);
    if (id) localStorage.setItem('tenantId', id);
    else localStorage.removeItem('tenantId');
  };

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (fUser) => {
      setFirebaseUser(fUser);
      if (!fUser) {
        setUser(null);
        setTenantIdState(null);
        localStorage.removeItem('tenantId');
        setLoading(false);
        return;
      }

      // If we don't have a tenantId cached, try to resolve it from Firestore
      // by searching all tenants for a user document with this UID.
      // In production you'd derive this from subdomain; here we do a best-effort lookup.
      const cachedTenant = localStorage.getItem('tenantId');
      if (!cachedTenant) {
        try {
          const tenantsSnap = await getDocs(collection(db, 'tenants'));
          for (const tenantDoc of tenantsSnap.docs) {
            const userDocSnap = await getDocs(
              query(collection(db, 'tenants', tenantDoc.id, 'users'), where('email', '==', fUser.email))
            );
            if (!userDocSnap.empty) {
              setTenantId(tenantDoc.id);
              break;
            }
          }
        } catch {
          // Could not auto-resolve; user will need to set tenantId manually via login flow
        }
        setLoading(false);
      }
    });
    return unsub;
  }, []);

  useEffect(() => {
    if (!firebaseUser || !tenantId) return;
    const userRef = doc(db, 'tenants', tenantId, 'users', firebaseUser.uid);
    const unsub = onSnapshot(userRef, (docSnap) => {
      if (docSnap.exists()) {
        setUser({ id: docSnap.id, ...docSnap.data() } as User);
      } else {
        setUser(null);
      }
      setLoading(false);
    }, (error) => {
      setLoading(false);
      if (error.code === 'permission-denied') {
        handleFirestoreError(error, OperationType.GET, `tenants/${tenantId}/users/${firebaseUser.uid}`);
      } else {
        console.error('Error fetching user data:', error);
      }
    });
    return unsub;
  }, [firebaseUser, tenantId]);

  return (
    <AuthContext.Provider value={{ user, firebaseUser, loading, tenantId, setTenantId }}>
      {children}
    </AuthContext.Provider>
  );
};
