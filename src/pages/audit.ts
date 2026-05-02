import { db } from './firebase';
import { collection, addDoc } from 'firebase/firestore';

export enum AuditAction {
  SHIFT_SUBMIT = 'shift_submit',
  SHIFT_AUDIT = 'shift_audit',
  SHIFT_SETTLE = 'shift_settle',
  SHIFT_REOPEN = 'shift_reopen',
  POOL_LOCK = 'pool_lock',
  CASH_COUNT = 'cash_count',
  USER_UPDATE = 'user_update'
}

export const logAudit = async (
  tenantId: string, 
  userId: string, 
  action: AuditAction, 
  details: string, 
  metadata: any = {}
) => {
  try {
    await addDoc(collection(db, 'tenants', tenantId, 'audit_logs'), {
      user_id: userId,
      action,
      details,
      metadata,
      created_at: new Date().toISOString()
    });
  } catch (err) {
    console.error('Audit Log Error:', err);
  }
};
