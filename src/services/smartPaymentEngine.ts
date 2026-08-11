import { supabase } from '@/lib/supabase';
import { Supplier, SupplierLedger, Sale, SaleItem, Payment, Product } from '@/types/database.types';

export interface SupplierPaymentPlan {
  supplierId: string;
  supplierName: string;
  phone: string | null;
  weeklySalesVolume: number;
  weeklyGrossProfitContribution: number;
  salesSharePercentage: number;
  totalDebt: number;
  dueAmount: number;
  offsetAmount: number;
  pastCashPayments: number;
  netCashDebtNeeded: number;
  recommendedCashPayment: number;
  priorityLevel: 'HIGH' | 'MEDIUM' | 'LOW';
  priorityReason: string;
}

export interface SmartPaymentAnalysis {
  weeklyCollection: number;
  weeklySalesTotal: number;
  weeklyCOGS: number;
  weeklyGrossProfit: number;
  grossProfitMargin: number;
  totalRecommendedPayment: number;
  totalOffsetsApplied: number;
  totalRealCashOutflow: number;
  cashRetainedInBusiness: number;
  supplierPlans: SupplierPaymentPlan[];
}

/**
 * Gets start of current week (Monday 00:00:00) and end of current week (Sunday 23:59:59)
 */
function getWeekRange() {
  const now = new Date();
  const day = now.getDay();
  const diffToMonday = now.getDate() - day + (day === 0 ? -6 : 1);
  
  const monday = new Date(now.setDate(diffToMonday));
  monday.setHours(0, 0, 0, 0);

  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);

  return {
    startStr: monday.toISOString(),
    endStr: sunday.toISOString(),
  };
}

/**
 * Smart Supplier Payment & Cash Flow Engine Algorithm
 */
export async function calculateSmartPaymentPlan(): Promise<SmartPaymentAnalysis> {
  const { startStr, endStr } = getWeekRange();

  // 1. Fetch Customer Payments (Weekly Collections into Cash/Bank)
  const { data: payData } = await supabase
    .from('payments')
    .select('*')
    .is('deleted_at', null)
    .gte('created_at', startStr)
    .lte('created_at', endStr);

  let weeklyCollection = 0;
  payData?.forEach((p) => {
    // Only customer collections (exclude supplier offsets which don't bring new cash)
    if (p.payment_method !== 'Tedarikçiye Mahsup' && p.payment_type !== 'SUPPLIER_OFFSET') {
      weeklyCollection += Number(p.amount || 0);
    }
  });

  // 2. Fetch Sales & Sale Items for Current Week
  const { data: salesData } = await supabase
    .from('sales')
    .select('id, created_at, total_amount')
    .is('deleted_at', null)
    .gte('created_at', startStr)
    .lte('created_at', endStr);

  const saleIds = salesData?.map((s) => s.id) || [];
  let weeklySalesTotal = 0;
  salesData?.forEach((s) => {
    weeklySalesTotal += Number(s.total_amount || 0);
  });

  let saleItems: SaleItem[] = [];
  if (saleIds.length > 0) {
    const { data: itemsData } = await supabase
      .from('sale_items')
      .select('*')
      .in('sale_id', saleIds)
      .is('deleted_at', null);
    saleItems = itemsData || [];
  }

  let weeklyCOGS = 0;
  saleItems.forEach((it) => {
    const qty = Number(it.quantity || 0);
    const cost = Number(it.unit_cost_snapshot || 0);
    weeklyCOGS += qty * cost;
  });

  const weeklyGrossProfit = Math.max(0, weeklySalesTotal - weeklyCOGS);
  const grossProfitMargin = weeklySalesTotal > 0 ? (weeklyGrossProfit / weeklySalesTotal) * 100 : 0;

  // 3. Link Sale Items to Products & Suppliers
  const { data: productsData } = await supabase
    .from('products')
    .select('id, supplier_id, product_name')
    .is('deleted_at', null);

  const productSupplierMap = new Map<string, string>();
  productsData?.forEach((p) => {
    if (p.supplier_id) productSupplierMap.set(p.id, p.supplier_id);
  });

  // Group sales volume and profit by supplier
  const supplierSalesMap = new Map<string, { volume: number; profit: number }>();

  saleItems.forEach((it) => {
    const supId = productSupplierMap.get(it.product_id);
    if (supId) {
      const vol = Number(it.total_amount || 0);
      const cogs = Number(it.quantity || 0) * Number(it.unit_cost_snapshot || 0);
      const profit = Math.max(0, vol - cogs);

      const existing = supplierSalesMap.get(supId) || { volume: 0, profit: 0 };
      supplierSalesMap.set(supId, {
        volume: existing.volume + vol,
        profit: existing.profit + profit,
      });
    }
  });

  // 4. Fetch All Active Suppliers & Supplier Ledgers
  const { data: suppliersData } = await supabase
    .from('suppliers')
    .select('*')
    .is('deleted_at', null)
    .order('company_name');

  const supplierPlans: SupplierPaymentPlan[] = [];
  let totalOffsetsApplied = 0;

  if (suppliersData && suppliersData.length > 0) {
    await Promise.all(
      suppliersData.map(async (sup) => {
        const { data: lData } = await supabase
          .from('supplier_ledger')
          .select('*')
          .eq('supplier_id', sup.id)
          .is('deleted_at', null)
          .order('created_at', { ascending: false });

        const latestBalance = lData?.[0]?.balance ? Number(lData[0].balance) : 0;
        let totOff = 0;
        let pastPay = 0;
        let dueAmt = 0;

        lData?.forEach((row) => {
          if (row.movement_type === 'OFFSET') {
            totOff += Number(row.debit || 0);
          } else if (row.movement_type === 'PAYMENT') {
            pastPay += Number(row.debit || 0);
          } else if (row.movement_type === 'PURCHASE') {
            dueAmt += Number(row.credit || 0);
          }
        });

        const supPerf = supplierSalesMap.get(sup.id) || { volume: 0, profit: 0 };
        const salesShare = weeklySalesTotal > 0 ? (supPerf.volume / weeklySalesTotal) * 100 : 0;
        const netCashDebt = Math.max(0, latestBalance);

        totalOffsetsApplied += totOff;

        supplierPlans.push({
          supplierId: sup.id,
          supplierName: sup.company_name,
          phone: sup.phone,
          weeklySalesVolume: supPerf.volume,
          weeklyGrossProfitContribution: supPerf.profit,
          salesSharePercentage: salesShare,
          totalDebt: latestBalance,
          dueAmount: dueAmt > 0 ? Math.min(dueAmt, latestBalance) : latestBalance,
          offsetAmount: totOff,
          pastCashPayments: pastPay,
          netCashDebtNeeded: netCashDebt,
          recommendedCashPayment: 0, // Computed in next step
          priorityLevel: 'LOW',
          priorityReason: '',
        });
      })
    );
  }

  // 5. Prioritization & Cash Allocation Engine
  // Sort by score: Net Debt + Sales Volume + Profit Contribution
  supplierPlans.forEach((plan) => {
    let score = 0;

    if (plan.netCashDebtNeeded > 0) score += 30;
    if (plan.salesSharePercentage >= 20) score += 40;
    else if (plan.salesSharePercentage >= 10) score += 20;

    if (plan.weeklyGrossProfitContribution > 5000) score += 20;

    if (score >= 60) plan.priorityLevel = 'HIGH';
    else if (score >= 30) plan.priorityLevel = 'MEDIUM';
    else plan.priorityLevel = 'LOW';
  });

  // Sort plans by priority (HIGH -> MEDIUM -> LOW) and sales volume
  supplierPlans.sort((a, b) => {
    const levelScore = { HIGH: 3, MEDIUM: 2, LOW: 1 };
    if (levelScore[b.priorityLevel] !== levelScore[a.priorityLevel]) {
      return levelScore[b.priorityLevel] - levelScore[a.priorityLevel];
    }
    return b.weeklySalesVolume - a.weeklySalesVolume;
  });

  // Reserve 35% of weekly cash collections for business operational retention buffer
  const cashBudgetForSuppliers = Math.max(0, weeklyCollection * 0.65);
  let remainingBudget = cashBudgetForSuppliers;
  let totalRecommendedPayment = 0;

  supplierPlans.forEach((plan) => {
    if (plan.netCashDebtNeeded > 0 && remainingBudget > 0) {
      const rec = Math.min(plan.netCashDebtNeeded, remainingBudget);
      plan.recommendedCashPayment = Math.round(rec * 100) / 100;
      remainingBudget -= plan.recommendedCashPayment;
      totalRecommendedPayment += plan.recommendedCashPayment;
    } else {
      plan.recommendedCashPayment = 0;
    }

    // Build human-readable explanation ("Neden bu kadar öde?")
    const shareText = plan.salesSharePercentage > 0
      ? `Bu hafta satışlarınızın %${plan.salesSharePercentage.toFixed(1)}'i (${plan.weeklySalesVolume.toLocaleString('tr-TR')} TL) bu tedarikçiden sağlandı.`
      : `Bu hafta ürünlerinden satış gerçekleşmedi.`;

    const offsetText = plan.offsetAmount > 0
      ? `${plan.offsetAmount.toLocaleString('tr-TR')} TL Sanal POS mahsubu düşüldü.`
      : `Mahsup kaydı bulunmuyor.`;

    const debtText = plan.netCashDebtNeeded > 0
      ? `Mevcut net borç ${plan.netCashDebtNeeded.toLocaleString('tr-TR')} TL.`
      : `Aktif tedarikçi borcu bulunmuyor.`;

    plan.priorityReason = `${shareText} ${offsetText} ${debtText} Önerilen net nakit ödeme: ${plan.recommendedCashPayment.toLocaleString('tr-TR')} TL.`;
  });

  const totalRealCashOutflow = totalRecommendedPayment;
  const cashRetainedInBusiness = Math.max(0, weeklyCollection - totalRealCashOutflow);

  return {
    weeklyCollection,
    weeklySalesTotal,
    weeklyCOGS,
    weeklyGrossProfit,
    grossProfitMargin,
    totalRecommendedPayment,
    totalOffsetsApplied,
    totalRealCashOutflow,
    cashRetainedInBusiness,
    supplierPlans,
  };
}
