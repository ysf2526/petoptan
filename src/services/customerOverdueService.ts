import { Customer, Payment, Sale } from '@/types/database.types';

export type DelayStatus =
  | 'normal'
  | 'upcoming_4_6_days'
  | 'warning_7_10_days'
  | 'critical_10_plus_days'
  // Backward compatibility aliases
  | 'warning_7_days'
  | 'critical_14_days';

export interface CustomerPaymentDelayResult {
  customer_id: string;
  customer_name: string;
  customer_phone?: string | null;
  netTotalDebt: number;
  lastPaymentDate: string | null;
  lastPaymentAmount?: number;
  daysSinceLastPayment: number;
  status: DelayStatus;
  badgeLabel: string | null;
  warningMessage: string | null;
}

/**
 * Calculates payment delay & collection window tiers for a customer:
 * - Net debt = 0 TL => 'normal' (Excluded from collection lists)
 * - 0-3 days => 'normal' (Henüz tahsilat zamanı gelmedi)
 * - 4-6 days => 'upcoming_4_6_days' (🟢 YAKLAŞAN TAHSİLATLAR)
 * - 7-10 days => 'warning_7_10_days' (🟡 BU HAFTA TAHSİLAT ALINACAKLAR - TAHSİLAT ZAMANI)
 * - 11+ days (10+ days) => 'critical_10_plus_days' (🔴 GECİKEN TAHSİLATLAR - TAHSİLAT GECİKTİ)
 */
export function calculateCustomerPaymentDelay(
  customer: Customer,
  netTotalDebt: number,
  payments: Payment[] = [],
  sales: Sale[] = []
): CustomerPaymentDelayResult {
  const safeDebt = Math.max(0, Number(netTotalDebt || 0));

  // If debt is 0 TL, no warning & excluded from collections
  if (safeDebt <= 0) {
    return {
      customer_id: customer.id,
      customer_name: customer.business_name,
      customer_phone: customer.phone,
      netTotalDebt: 0,
      lastPaymentDate: null,
      daysSinceLastPayment: 0,
      status: 'normal',
      badgeLabel: null,
      warningMessage: null,
    };
  }

  // Find latest payment/offset date from payments array
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

  if (daysSinceLastPayment > 10) {
    status = 'critical_10_plus_days';
    badgeLabel = `🔴 ${daysSinceLastPayment} Gündür Ödeme Yok`;
    warningMessage = `🔴 TAHSİLAT GECİKTİ (${daysSinceLastPayment} Gündür Ödeme Yapılmadı)`;
  } else if (daysSinceLastPayment >= 7) {
    status = 'warning_7_10_days';
    badgeLabel = `🟡 ${daysSinceLastPayment} Gündür Ödeme Yok`;
    warningMessage = `🟡 TAHSİLAT ZAMANI (${daysSinceLastPayment} Gündür Ödeme Alınmadı)`;
  } else if (daysSinceLastPayment >= 4) {
    status = 'upcoming_4_6_days';
    badgeLabel = `🟢 ${daysSinceLastPayment} Gün Oldu`;
    warningMessage = `🟢 YAKLAŞAN TAHSİLAT (${daysSinceLastPayment}. Gününde)`;
  } else {
    status = 'normal';
    badgeLabel = `🟢 ${daysSinceLastPayment} Gün`;
    warningMessage = null;
  }

  return {
    customer_id: customer.id,
    customer_name: customer.business_name,
    customer_phone: customer.phone,
    netTotalDebt: safeDebt,
    lastPaymentDate: lastDate ? lastDate.toISOString().split('T')[0] : null,
    lastPaymentAmount: lastAmt,
    daysSinceLastPayment,
    status,
    badgeLabel,
    warningMessage,
  };
}
