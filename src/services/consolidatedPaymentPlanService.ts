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
  invariantError: string | null;
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
 * Builds a unified, date-consolidated payment plan.
 * Map<dateStr, amount> merges installments on matching due dates while preserving exact previous schedule dates.
 * Strictly asserts that SUM(installments.amount) === netTotalDebt.
 */
export function buildConsolidatedPaymentPlan(
  customer: Customer | null,
  totalDebt: number,
  sales: Sale[],
  paymentSchedules: PaymentSchedule[],
  customWeeklyTarget?: number
): ConsolidatedPaymentPlanSummary {
  const safeTotalDebt = Math.max(0, Number(totalDebt || 0));

  // -------------------------------------------------------------------------
  // 1. Calculate Overdue & Due This Week from active schedules
  // -------------------------------------------------------------------------
  const todayStr = new Date().toISOString().split('T')[0];
  const nextWeekDate = new Date();
  nextWeekDate.setDate(nextWeekDate.getDate() + 7);
  const nextWeekStr = nextWeekDate.toISOString().split('T')[0];

  let overdueDebt = 0;
  let dueThisWeek = 0;

  paymentSchedules?.forEach((sch) => {
    const rem = Number(sch.remaining_amount || 0);
    if (rem > 0 && sch.status !== 'paid') {
      if (sch.due_date < todayStr || sch.status === 'overdue') {
        overdueDebt += rem;
      } else if (sch.due_date >= todayStr && sch.due_date <= nextWeekStr) {
        dueThisWeek += rem;
      }
    }
  });

  // -------------------------------------------------------------------------
  // 2. MAP<DATE, AMOUNT> CONSOLIDATION OF ACTIVE UNPAID SCHEDULES
  // -------------------------------------------------------------------------
  const activeUnpaidSchedules = (paymentSchedules || []).filter(
    (s) => Number(s.remaining_amount || 0) > 0 && s.status !== 'paid'
  );

  const dateMap: { [dateStr: string]: number } = {};

  activeUnpaidSchedules.forEach((sch) => {
    const d = sch.due_date;
    const amt = Number(sch.remaining_amount || 0);
    if (d && amt > 0) {
      dateMap[d] = Number(((dateMap[d] || 0) + amt).toFixed(2));
    }
  });

  const sortedDates = Object.keys(dateMap).sort();
  let installments: ConsolidatedInstallment[] = [];
  let runningBalance = safeTotalDebt;
  let weekIndex = 1;

  if (sortedDates.length > 0) {
    for (const dStr of sortedDates) {
      const instAmt = Math.min(dateMap[dStr], runningBalance);
      if (instAmt <= 0) continue;

      const nextBal = Math.max(0, runningBalance - instAmt);
      installments.push({
        weekIndex,
        dueDate: dStr,
        amount: Number(instAmt.toFixed(2)),
        remainingBalance: Number(nextBal.toFixed(2)),
      });

      runningBalance = Number(nextBal.toFixed(2));
      weekIndex++;
      if (runningBalance <= 0.01) break;
    }
  }

  // -------------------------------------------------------------------------
  // 3. SMOOTH RECONCILIATION FOR LEGACY UNPLANNED LEDGER BALANCE
  // -------------------------------------------------------------------------
  if (runningBalance > 0.01) {
    const smoothTarget = Math.min(2500, Math.max(1000, Math.ceil(runningBalance / 4)));
    const baseDate = sortedDates.length > 0 ? new Date(sortedDates[sortedDates.length - 1]) : new Date();

    while (runningBalance > 0.01 && weekIndex <= 52) {
      const d = new Date(baseDate);
      d.setDate(d.getDate() + (installments.length + 1) * 7);
      const dStr = d.toISOString().split('T')[0];

      const instAmt = Math.min(smoothTarget, runningBalance);
      const nextBal = Math.max(0, runningBalance - instAmt);

      installments.push({
        weekIndex,
        dueDate: dStr,
        amount: Number(instAmt.toFixed(2)),
        remainingBalance: Number(nextBal.toFixed(2)),
      });

      runningBalance = Number(nextBal.toFixed(2));
      weekIndex++;
    }
  }

  // Ensure last installment row remainingBalance is strictly 0.00
  if (installments.length > 0) {
    installments[installments.length - 1].remainingBalance = 0.00;
  }

  // -------------------------------------------------------------------------
  // 4. FINANCIAL INVARIANT ASSERTION: SUM(installments.amount) === safeTotalDebt
  // -------------------------------------------------------------------------
  const sumOfInstallments = Number(installments.reduce((acc, i) => acc + i.amount, 0).toFixed(2));
  let invariantError: string | null = null;

  if (safeTotalDebt > 0 && Math.abs(sumOfInstallments - safeTotalDebt) > 0.05) {
    invariantError = `CRITICAL FINANCIAL INVARIANT VIOLATION: Total Debt (${safeTotalDebt}) does not match Consolidated Schedule Sum (${sumOfInstallments}).`;
    console.error(invariantError);
  }

  const estimatedWeeksToClose = installments.length;
  const weeklyTarget = customWeeklyTarget || Number(customer?.weekly_payment_target || 0) || Math.ceil(safeTotalDebt / Math.max(1, installments.length));

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
    invariantError,
  };
}
