import { Customer, Payment, Sale } from '@/types/database.types';

export type DelayStatus = 'normal' | 'warning_7_days' | 'critical_14_days';

export interface CustomerPaymentDelayResult {
  customer_id: string;
  customer_name: string;
  netTotalDebt: number;
  lastPaymentDate: string | null;
  lastPaymentAmount?: number;
  daysSinceLastPayment: number;
  status: DelayStatus;
  badgeLabel: string | null;
  warningMessage: string | null;
}

/**
 * Calculates payment delay (7+ days warning, 14+ days critical warning) for a customer.
 * If debt is 0 TL, warning automatically closes.
 */
export function calculateCustomerPaymentDelay(
  customer: Customer,
  netTotalDebt: number,
  payments: Payment[] = [],
  sales: Sale[] = []
): CustomerPaymentDelayResult {
  const safeDebt = Math.max(0, Number(netTotalDebt || 0));

  // If debt is 0 TL, no warning
  if (safeDebt <= 0) {
    return {
      customer_id: customer.id,
      customer_name: customer.business_name,
      netTotalDebt: 0,
      lastPaymentDate: null,
      daysSinceLastPayment: 0,
      status: 'normal',
      badgeLabel: null,
      warningMessage: null,
    };
  }

  // Find latest payment date from payments array
  const customerPayments = (payments || []).filter(
    (p) => p.customer_id === customer.id && Number(p.amount) > 0
  );

  let lastDate: Date | null = null;
  let lastAmt: number | undefined = undefined;

  if (customerPayments.length > 0) {
    const sorted = [...customerPayments].sort((a, b) => {
      const dateA = new Date(a.payment_date || a.created_at).getTime();
      const dateB = new Date(b.payment_date || b.created_at).getTime();
      return dateB - dateA;
    });
    lastDate = new Date(sorted[0].payment_date || sorted[0].created_at);
    lastAmt = Number(sorted[0].amount || 0);
  } else {
    // If no payment ever made, fallback to latest delivered sale date
    const deliveredSales = (sales || []).filter(
      (s) => s.customer_id === customer.id && s.order_status === 'delivered' && s.delivered_at
    );
    if (deliveredSales.length > 0) {
      const sortedSales = [...deliveredSales].sort(
        (a, b) => new Date(b.delivered_at!).getTime() - new Date(a.delivered_at!).getTime()
      );
      lastDate = new Date(sortedSales[0].delivered_at!);
    }
  }

  if (!lastDate || isNaN(lastDate.getTime())) {
    lastDate = new Date(customer.created_at);
  }

  const now = new Date();
  const diffTime = Math.max(0, now.getTime() - lastDate.getTime());
  const daysSinceLastPayment = Math.floor(diffTime / (1000 * 60 * 60 * 24));

  let status: DelayStatus = 'normal';
  let badgeLabel: string | null = null;
  let warningMessage: string | null = null;

  if (daysSinceLastPayment >= 14) {
    status = 'critical_14_days';
    badgeLabel = `🔴 ${daysSinceLastPayment} Gündür Ödeme Yok`;
    warningMessage = `🔴 UZUN SÜREDİR ÖDEME YAPMADI (${daysSinceLastPayment} Gündür)`;
  } else if (daysSinceLastPayment >= 7) {
    status = 'warning_7_days';
    badgeLabel = `🟡 ${daysSinceLastPayment} Gündür Ödeme Yok`;
    warningMessage = `🟡 ÖDEME GECİKTİ (${daysSinceLastPayment} Gündür)`;
  }

  return {
    customer_id: customer.id,
    customer_name: customer.business_name,
    netTotalDebt: safeDebt,
    lastPaymentDate: lastDate ? lastDate.toISOString().split('T')[0] : null,
    lastPaymentAmount: lastAmt,
    daysSinceLastPayment,
    status,
    badgeLabel,
    warningMessage,
  };
}
