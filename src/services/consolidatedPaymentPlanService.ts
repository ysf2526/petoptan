import { Customer, Sale, PaymentSchedule } from '@/types/database.types';
import { formatCurrency, formatDate } from '@/utils/formatters';

export interface ConsolidatedInstallment {
  weekIndex: number;
  dueDate: string;
  amount: number;
  remainingBalance: number;
}

export interface ConsolidatedPaymentPlanSummary {
  netTotalDebt: number;
  overdueDebt: number;
  dueThisWeek: number;
  weeklyTarget: number;
  estimatedWeeksToClose: number;
  installments: ConsolidatedInstallment[];
  termRiskWarning: string | null;
  newestSaleDueDate: string | null;
}

export interface CalculateDebtParams {
  ledgerEntries?: { balance?: number; debit?: number; credit?: number; movement_type?: string }[] | null;
  salesList?: { id?: string; total_amount?: number; remaining_debt?: number; status?: string }[] | null;
  currentSale?: { id?: string; total_amount?: number; remaining_debt?: number; payment_type?: string; paid_amount?: number } | null;
}

export interface NetDebtCalculationResult {
  netTotalDebt: number;
  previousBalance: number;
  currentSaleAmount: number;
  paymentMade: number;
}

/**
 * Calculates accurate Net Customer Debt and Previous Balance.
 * Ensures all unpaid open sales and unallocated ledger balances are included.
 */
export function calculateNetCustomerDebt(params: CalculateDebtParams): NetDebtCalculationResult {
  const { ledgerEntries, salesList, currentSale } = params;

  // 1. Sum of remaining_debt across ALL active non-cancelled sales
  const activeSales = salesList?.filter((s) => s.status !== 'cancelled') || [];
  const activeSalesDebtSum = activeSales.reduce((acc, s) => acc + Number(s.remaining_debt || 0), 0);

  // 2. Latest running balance from customer_ledger
  const latestLedgerBal = (ledgerEntries && ledgerEntries.length > 0 && ledgerEntries[0].balance !== null && ledgerEntries[0].balance !== undefined)
    ? Number(ledgerEntries[0].balance)
    : 0;

  // 3. Fallback: net debit minus credit from ledger
  let totDebit = 0;
  let totCredit = 0;
  ledgerEntries?.forEach((l) => {
    totDebit += Number(l.debit || 0);
    totCredit += Number(l.credit || 0);
  });
  const netLedgerCalc = Math.max(0, totDebit - totCredit);

  // 4. Current Sale amount & payment made
  const currentSaleAmount = currentSale ? Number(currentSale.total_amount || 0) : 0;
  const paymentMade = currentSale
    ? (currentSale.payment_type === 'pesin' ? currentSaleAmount : Number(currentSale.paid_amount || 0))
    : 0;
  const currentSaleRemaining = currentSale ? Number(currentSale.remaining_debt || 0) : 0;

  // 5. Final Net Total Debt (MUST be at least activeSalesDebtSum or ledger balance or current sale remaining)
  const netTotalDebt = Math.max(activeSalesDebtSum, latestLedgerBal, netLedgerCalc, currentSaleRemaining);

  // 6. Previous Balance before current sale
  const previousBalance = Math.max(0, netTotalDebt - currentSaleAmount + paymentMade);

  return {
    netTotalDebt,
    previousBalance,
    currentSaleAmount,
    paymentMade,
  };
}

/**
 * Builds a unified, customer-level consolidated payment plan based on net customer debt and weekly payment target.
 * Preserves individual sale 30-day term dates in the background while presenting a single clean schedule.
 */
export function buildConsolidatedPaymentPlan(
  customer: Customer | null,
  totalDebt: number,
  sales: Sale[],
  paymentSchedules: PaymentSchedule[],
  customWeeklyTarget?: number
): ConsolidatedPaymentPlanSummary {
  const safeTotalDebt = Math.max(0, Number(totalDebt || 0));

  // Determine Weekly Payment Target
  let weeklyTarget = 0;
  if (customWeeklyTarget && customWeeklyTarget > 0) {
    weeklyTarget = customWeeklyTarget;
  } else if (customer?.weekly_payment_target && Number(customer.weekly_payment_target) > 0) {
    weeklyTarget = Number(customer.weekly_payment_target);
  } else {
    weeklyTarget = safeTotalDebt > 0 ? Math.ceil(safeTotalDebt / 4) : 2500;
  }

  // Calculate Overdue & Due This Week from schedules
  const todayStr = new Date().toISOString().split('T')[0];
  const nextWeekDate = new Date();
  nextWeekDate.setDate(nextWeekDate.getDate() + 7);
  const nextWeekStr = nextWeekDate.toISOString().split('T')[0];

  let overdueDebt = 0;
  let dueThisWeek = 0;

  paymentSchedules?.forEach((sch) => {
    const rem = Number(sch.remaining_amount || 0);
    if (sch.due_date < todayStr || sch.status === 'overdue') {
      overdueDebt += rem;
    } else if (sch.due_date >= todayStr && sch.due_date <= nextWeekStr) {
      dueThisWeek += rem;
    }
  });

  // Generate Weekly Consolidated Installments
  const installments: ConsolidatedInstallment[] = [];
  let remainingUnplanned = safeTotalDebt;
  const today = new Date();
  let weekIndex = 1;

  while (remainingUnplanned > 0.01 && weekIndex <= 52) {
    const d = new Date(today);
    d.setDate(d.getDate() + weekIndex * 7);
    const dateStr = d.toISOString().split('T')[0];

    const currentInstallment = Math.min(weeklyTarget, remainingUnplanned);
    const nextBalance = Math.max(0, remainingUnplanned - currentInstallment);

    installments.push({
      weekIndex,
      dueDate: dateStr,
      amount: Number(currentInstallment.toFixed(2)),
      remainingBalance: Number(nextBalance.toFixed(2)),
    });

    remainingUnplanned -= currentInstallment;
    weekIndex++;
  }

  const estimatedWeeksToClose = installments.length;

  // Check 30-Day Term Risk for Newest Sale
  const activeSales = sales?.filter((s) => s.status !== 'cancelled') || [];
  const newestSale = activeSales.length > 0 ? activeSales[0] : null;
  const newestSaleDueDate = newestSale?.due_date || null;

  let termRiskWarning: string | null = null;
  if (newestSaleDueDate && safeTotalDebt > 0) {
    const lastInstallmentDate = installments.length > 0 ? installments[installments.length - 1].dueDate : null;

    if (lastInstallmentDate && lastInstallmentDate > newestSaleDueDate && safeTotalDebt > weeklyTarget * 4) {
      const requiredWeeklyFor30Days = Math.ceil(safeTotalDebt / 4);
      termRiskWarning = `⚠️ VADE RİSKİ: Mevcut haftalık ödeme hedefinizle (${formatCurrency(weeklyTarget)}/hafta) 30 günlük vadede (${formatDate(newestSaleDueDate)}) borcun tamamı (${formatCurrency(safeTotalDebt)}) kapanmayabilir. Tahmini kapanış süresi: ${estimatedWeeksToClose} hafta. 30 gün içinde borcun kapanması için gerekli haftalık ödeme: ~${formatCurrency(requiredWeeklyFor30Days)}.`;
    }
  }

  return {
    netTotalDebt: safeTotalDebt,
    overdueDebt,
    dueThisWeek,
    weeklyTarget,
    estimatedWeeksToClose,
    installments,
    termRiskWarning,
    newestSaleDueDate,
  };
}
