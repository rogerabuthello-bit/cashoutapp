import { db } from './firebase';
import { collection, addDoc } from 'firebase/firestore';

export const logNotification = async (
  tenantId: string,
  userId: string,
  title: string,
  message: string,
  type: 'info' | 'success' | 'warning' | 'error' = 'info',
  link?: string
) => {
  try {
    await addDoc(collection(db, 'tenants', tenantId, 'notifications'), {
      user_id: userId,
      title,
      message,
      type,
      link,
      is_read: false,
      created_at: new Date().toISOString()
    });
  } catch (err) {
    console.error('Notification Error:', err);
  }
};
