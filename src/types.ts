export enum Role {
  SUPERADMIN = 'superadmin',
  ADMIN = 'admin',
  MANAGER = 'manager',
  SERVER = 'server',
  BARTENDER = 'bartender',
  BOH = 'boh'
}

export enum ShiftStatus {
  PENDING = 'pending',
  AUDITED = 'audited',
  SETTLED = 'settled'
}

export enum PoolType {
  HOUSE = 'house',
  BAR_AM = 'bar_am',
  BAR_PM = 'bar_pm',
  PARTY = 'party'
}

export enum PettyCashEntryType {
  COUNT = 'count',
  EXPENSE = 'expense',
  DEPOSIT = 'deposit',
  WITHDRAWAL = 'withdrawal'
}

export interface Tenant {
  id: string;
  name: string;
  subdomain_slug: string; // e.g. 'marios'
  plan: 'starter' | 'pro' | 'enterprise';
  billing_email: string;
  is_active: boolean;
  created_at: string;
}

export interface User {
  id: string;
  tenant_id: string;
  email: string;
  full_name: string;
  role: Role;
  pos_register_email?: string;
  current_debt_cents: number;
  ytd_qualified_tips_cents?: number; // Cumulative qualified tips for "No Tax on Tips"
  is_active: boolean;
  tipped_occupation_code?: string;
  created_at: string;
}

export interface GlobalSettings {
  tenant_id: string;
  house_tip_pct: number; // basis points, e.g. 700 = 7.00%
  bar_tip_pct: number;
  exclusion_keywords: string[];
  active_party_codes: string[];
  bar_am_cutoff_time: string; // e.g. '16:00'
  settings_version: number;
  updated_at: string;
}

export interface ShiftRecord {
  id: string;
  tenant_id: string;
  user_id: string;
  shift_date: string;
  
  // Declaration & POS Data
  gross_receipts_cents: number;
  tax_cents: number;
  exclusions_cents: number;
  
  // Tax Compliance ("No Tax on Tips")
  voluntary_tips_cents: number; // Qualified tips
  auto_gratuity_cents: number;  // Service charges (non-qualifying)
  
  amex_cents: number;
  visa_cents: number;
  mc_cents: number;
  debit_cents: number;
  actual_cash_drop_cents: number;
  expected_cash_drop_cents: number;
  
  // Audit Values
  csv_gross_cents?: number;
  csv_cards_cents?: number;
  csv_gratuity_cents?: number;
  admin_physical_count_cents?: number;
  variance_cents?: number;
  
  // Tip-outs
  house_tipout_cents: number;
  bar_tipout_cents: number;
  net_payout_cents: number;
  
  status: ShiftStatus;
  settings_version_used: number;
  created_at: string;
  settled_at?: string;
  reopen_at?: string;
  reopen_reason?: string;
  shift_notes?: string;
  daypart?: 'AM' | 'PM';
  party_type?: string;
  payout_status?: 'pending' | 'distributed';
}

export interface Notification {
  id: string;
  tenant_id: string;
  user_id: string;
  title: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
  is_read: boolean;
  link?: string;
  created_at: string;
}

export interface Announcement {
  id: string;
  tenant_id: string;
  author_id: string;
  author_name: string;
  content: string;
  priority: 'low' | 'normal' | 'high';
  created_at: string;
}

export interface PettyCashEntry {
  id: string;
  tenant_id: string;
  entry_date: string;
  entry_type: PettyCashEntryType;
  description: string;
  denominations: {
    hundreds: number;
    fifties: number;
    twenties: number;
    tens: number;
    fives: number;
    twos: number;
    ones: number;
    quarters: number;
    dimes: number;
    nickels: number;
  };
  amount_cents: number;
  running_balance_cents: number;
  created_by: string;
}

export interface DebtEntry {
  id: string;
  tenant_id: string;
  user_id: string;
  shift_id?: string;
  amount_cents: number; // positive = debt incurred, negative = debt repaid
  description: string;
  created_at: string;
}

export interface TipPool {
  id: string;
  tenant_id: string;
  pool_type: PoolType;
  party_code?: string;
  collection_date: string;
  total_amount_cents: number;
  is_locked: boolean;
  locked_by?: string;
  locked_at?: string;
}

export interface TipDistribution {
  id: string;
  tenant_id: string;
  pool_id: string;
  user_id: string;
  points_assigned: number;
  calculated_share_cents: number;
  paid_at?: string;
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: string;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
  }
}
