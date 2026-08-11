export type ProductUnit = 'Adet' | 'Kutu' | 'Paket' | 'Koli' | 'Çuval' | 'Kg' | 'Litre';

export type MovementType = 'PURCHASE' | 'SALE' | 'RETURN' | 'ADJUSTMENT' | 'DAMAGE' | 'INITIAL';

export type PaymentMethod = 'Nakit' | 'Havale/EFT' | 'Diğer' | 'Tedarikçiye Mahsup';

export type PaymentType = 'pesin' | 'vadeli';

export type ScheduleStatus = 'pending' | 'partially_paid' | 'paid' | 'overdue';

export type LedgerType = 'BORÇ' | 'ÖDEME' | 'İADE' | 'DÜZELTME';

export type SupplierLedgerMovementType = 'PURCHASE' | 'PAYMENT' | 'OFFSET' | 'ADJUSTMENT' | 'RETURN';

export interface Profile {
  id: string;
  full_name: string | null;
  business_name: string | null;
  phone: string | null;
  address: string | null;
  default_payment_term_days: number;
  default_min_stock: number;
  currency_symbol: string;
  created_at: string;
  updated_at: string;
}

export interface Supplier {
  id: string;
  owner_id: string;
  company_name: string;
  contact_person: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface SupplierLedger {
  id: string;
  owner_id: string;
  supplier_id: string;
  movement_type: SupplierLedgerMovementType;
  description: string;
  debit: number;   // Borç kapama / Mahsup (Borcu Azaltır)
  credit: number;  // Vadeli Alım (Borcu Artırır)
  balance: number; // Güncel Borç Bakiyesi
  reference_id: string | null;
  created_at: string;
  deleted_at: string | null;
  suppliers?: {
    company_name: string;
  };
}

export interface Product {
  id: string;
  owner_id: string;
  product_name: string;
  brand: string | null;
  category: string | null;
  barcode: string | null;
  unit: ProductUnit;
  purchase_price: number;
  sale_price: number;
  current_stock: number;
  minimum_stock: number;
  supplier_id: string | null;
  supplier: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface Customer {
  id: string;
  owner_id: string;
  business_name: string;
  contact_name: string | null;
  contact_person?: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  tax_number: string | null;
  tax_office: string | null;
  payment_term_days: number;
  weekly_payment_target?: number;
  notes: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface Sale {
  id: string;
  owner_id: string;
  sale_number: string;
  customer_id: string;
  customer_name: string;
  total_amount: number;
  total_cost: number;
  total_profit: number;
  payment_type: PaymentType;
  term_days: number;
  due_date: string | null;
  status: 'paid' | 'pending' | 'partially_paid' | 'cancelled';
  paid_amount: number;
  remaining_debt: number;
  notes: string | null;
  created_at: string;
  deleted_at: string | null;
}

export interface SaleItem {
  id: string;
  owner_id: string;
  sale_id: string;
  product_id: string;
  product_name: string;
  unit: ProductUnit;
  quantity: number;
  purchase_price_snapshot: number;
  sale_price_snapshot: number;
  total_amount: number;
  total_cost: number;
  total_profit: number;
  created_at: string;
  deleted_at: string | null;
}

export interface StockMovement {
  id: string;
  owner_id: string;
  product_id: string;
  movement_type: MovementType;
  quantity: number;
  unit_cost: number;
  reference_id: string | null;
  note: string | null;
  created_at: string;
  deleted_at: string | null;
  products?: {
    product_name: string;
    brand: string | null;
    unit: ProductUnit;
  };
}

export interface CustomerLedger {
  id: string;
  owner_id: string;
  customer_id: string;
  sale_id: string | null;
  payment_id: string | null;
  movement_type: LedgerType;
  description: string;
  debit: number;
  credit: number;
  balance: number;
  created_at: string;
  deleted_at: string | null;
}

export interface Payment {
  id: string;
  owner_id: string;
  customer_id: string;
  supplier_id: string | null;
  amount: number;
  payment_method: PaymentMethod;
  payment_type?: string;
  payment_date: string;
  notes: string | null;
  created_at: string;
  deleted_at: string | null;
  customers?: {
    business_name: string;
  };
  suppliers?: {
    company_name: string;
  };
}

export interface PaymentSchedule {
  id: string;
  owner_id: string;
  customer_id: string;
  sale_id: string;
  due_date: string;
  amount: number;
  paid_amount: number;
  remaining_amount: number;
  status: ScheduleStatus;
  paid_at: string | null;
  created_at: string;
  deleted_at: string | null;
  customers?: {
    business_name: string;
    phone: string | null;
  };
}

export interface ProfitTarget {
  id: string;
  owner_id: string;
  month: number;
  year: number;
  target_profit: number;
  created_at: string;
  updated_at: string;
}

export interface AuditLog {
  id: string;
  owner_id: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  details: Record<string, any> | null;
  created_at: string;
}

export interface DashboardStats {
  monthlySales: number;
  monthlyCollections: number;
  monthlyProfit: number;
  profitTarget: number;
  remainingProfitTarget: number;
  totalCustomerDebt: number;
  dueThisWeek: number;
  overduePayments: number;
  warehouseTotalProducts: number;
  warehouseStockCost: number;
  criticalStockCount: number;
  
  // Today's metrics
  todaySales: number;
  todayCollections: number;
  todayProfit: number;
  todaySaleCount: number;

  // Supplier Metrics
  totalSupplierDebt: number;
  monthlySupplierPurchase: number;
  monthlySupplierOffset: number;
  cashCollections: number;
  bankCollections: number;
  offsetCollections: number;
}
