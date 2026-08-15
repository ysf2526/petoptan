import { supabase } from '@/lib/supabase';
import { formatCurrency, formatDate } from '@/utils/formatters';
import { Sale, SaleItem, PaymentSchedule } from '@/types/database.types';

export interface PhoneNormalizationResult {
  raw: string;
  normalized: string;
  isValid: boolean;
}

export interface WhatsAppAuditStatus {
  customerSent: boolean;
  supplierSent: boolean;
  customerSentAt?: string;
  supplierSentAt?: string;
}

/**
 * Normalizes Turkish mobile phone numbers into international 905XXXXXXXXX format.
 */
export function normalizeTurkishPhone(phone?: string | null): PhoneNormalizationResult {
  if (!phone) {
    return { raw: '', normalized: '', isValid: false };
  }

  const digits = phone.replace(/\D/g, '');

  if (digits.startsWith('905') && digits.length === 12) {
    return { raw: phone, normalized: digits, isValid: true };
  }

  if (digits.startsWith('05') && digits.length === 11) {
    return { raw: phone, normalized: `9${digits}`, isValid: true };
  }

  if (digits.startsWith('5') && digits.length === 10) {
    return { raw: phone, normalized: `90${digits}`, isValid: true };
  }

  return { raw: phone, normalized: digits, isValid: false };
}

/**
 * Fetches the current logged in user's business name from profiles table.
 */
export async function getBusinessName(): Promise<string> {
  try {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData?.user?.id) return 'Petshop Toptan Satış';

    const { data: profile } = await supabase
      .from('profiles')
      .select('business_name')
      .eq('id', userData.user.id)
      .maybeSingle();

    return profile?.business_name || 'Petshop Toptan Satış';
  } catch (err) {
    return 'Petshop Toptan Satış';
  }
}

/**
 * Builds Turkish WhatsApp text message for Customer Collection (Müşteri Tahsilatı).
 */
export function buildCustomerCollectionWhatsAppMessage(
  customerName: string,
  businessName: string,
  amount: number,
  newBalance: number
): string {
  return `Merhaba ${customerName},

${formatCurrency(amount)} ödemeniz hesabınıza işlenmiştir.

Güncel cari borcunuz: ${formatCurrency(newBalance)}

Teşekkür ederiz.`;
}

/**
 * Builds Turkish WhatsApp text message for Supplier Payment (Tedarikçiye Ödeme).
 * ABSOLUTE PRIVACY GUARANTEE: Contains NO customer or offset data whatsoever.
 */
export function buildSupplierPaymentWhatsAppMessage(
  supplierName: string,
  amount: number,
  newBalance: number
): string {
  return `Merhaba ${supplierName},

${formatCurrency(amount)} ödeme gerçekleştirilmiştir.

Güncel borç bakiyemiz: ${formatCurrency(newBalance)}

Teşekkür ederiz.`;
}

/**
 * Builds Turkish WhatsApp text message for Customer Offset Notification (Mahsup Sonrası Müşteri Mesajı).
 * Customer sees only their own account payment & updated debt.
 */
export function buildCustomerOffsetWhatsAppMessage(
  customerName: string,
  businessName: string,
  amount: number,
  newBalance: number
): string {
  return `Merhaba ${customerName},

${formatCurrency(amount)} ödemeniz hesabınıza işlenmiştir.

Güncel cari borcunuz: ${formatCurrency(newBalance)}

Teşekkür ederiz.`;
}

/**
 * Builds Turkish WhatsApp text message for Supplier Offset Notification (Mahsup Sonrası Tedarikçi Mesajı).
 * STRICT PRIVACY REQUIREMENT: Takes NO customer parameters!
 * The supplier message MUST NOT contain customer name, business name, phone, purchase details or the word "mahsup".
 * It is structured identically to a clean direct payment notification.
 */
export function buildSupplierOffsetWhatsAppMessage(
  supplierName: string,
  amount: number,
  newBalance: number
): string {
  return buildSupplierPaymentWhatsAppMessage(supplierName, amount, newBalance);
}

/**
 * Builds standard Turkish WhatsApp text message for a Sale & Weekly Payment Schedule document.
 */
export function buildSaleWhatsAppMessage(
  sale: Sale,
  items: SaleItem[],
  schedules: PaymentSchedule[],
  netTotalDebt?: number,
  previousBalance?: number
): string {
  const saleDateFormatted = formatDate(sale.created_at);
  const totalStr = formatCurrency(sale.total_amount);
  const paidStr = formatCurrency(sale.paid_amount || 0);
  const remainingStr = netTotalDebt !== undefined ? formatCurrency(netTotalDebt) : formatCurrency(sale.remaining_debt || 0);
  const prevBalStr = previousBalance !== undefined ? formatCurrency(previousBalance) : null;

  let scheduleLines = '';
  if (schedules && schedules.length > 0) {
    scheduleLines = schedules
      .map((s, idx) => {
        const dStr = formatDate(s.due_date);
        const aStr = formatCurrency(s.amount);
        let statusMark = '';
        if (s.status === 'paid') statusMark = ' ✓ (ÖDENDİ)';
        else if (s.status === 'partially_paid') statusMark = ' (KISMİ ÖDENDİ)';
        else if (s.status === 'overdue') statusMark = ' ⚠️ (GECİKTİ)';
        return `${idx + 1}. Hafta (${dStr}) → ${aStr}${statusMark}`;
      })
      .join('\n');
  } else if (sale.payment_type === 'vadeli' || sale.term_days > 0) {
    const deliveryDateStr = sale.delivered_at || sale.created_at || new Date().toISOString();
    const baseDate = new Date(deliveryDateStr);
    const numWeeks = 4;
    const debtToDistribute = netTotalDebt !== undefined ? netTotalDebt : (sale.remaining_debt || sale.total_amount);
    const basePerWeek = Number((debtToDistribute / numWeeks).toFixed(2));
    let remaining = debtToDistribute;
    const lines: string[] = [];

    for (let i = 1; i <= numWeeks; i++) {
      const d = new Date(baseDate);
      d.setDate(d.getDate() + i * 7);
      const dStr = formatDate(d.toISOString().split('T')[0]);
      let amt = basePerWeek;
      if (i === numWeeks) {
        amt = Number(remaining.toFixed(2));
      } else {
        remaining -= basePerWeek;
      }
      lines.push(`${i}. Hafta (${dStr}) → ${formatCurrency(Math.max(0, amt))}`);
    }
    scheduleLines = lines.join('\n');
  } else {
    scheduleLines = 'Peşin Satış (Taksit bulunmuyor)';
  }


  return `Merhaba ${sale.customer_name},

Bugünkü ürün teslimatınıza ait satış ve güncel cari borç özet bilgilendirme belgenizi aşağıda paylaşıyoruz.

📋 Satış No: ${sale.sale_number}
📅 Satış Tarihi: ${saleDateFormatted}
🛍️ Bugünkü Satış: ${totalStr}
${prevBalStr !== null ? `📊 Önceki Bakiye: ${prevBalStr}\n` : ''}🔴 GÜNCEL TOPLAM CARİ BORÇ: ${remainingStr}

🗓️ Haftalık Ödeme Planınız:
${scheduleLines}

Ekli PDF belgenizde tüm detaylı ürün listesi ve cari hesabınız yer almaktadır.

Teşekkür ederiz.`;
}

/**
 * Builds standard Turkish WhatsApp text message for Customer Statement (Cari Hesap Özeti).
 */
export function buildCustomerStatementMessage(
  customerName: string,
  totalDebt: number,
  dueThisWeek: number,
  overdueDebt: number,
  upcomingSchedules: PaymentSchedule[],
  lastPurchaseDate?: string | null,
  lastPurchaseAmount?: number | null
): string {
  let scheduleText = 'Yaklaşan ödemeniz bulunmuyor.';
  if (upcomingSchedules && upcomingSchedules.length > 0) {
    scheduleText = upcomingSchedules
      .slice(0, 4)
      .map((s) => `${formatDate(s.due_date)} → ${formatCurrency(s.amount)}`)
      .join('\n');
  }

  const lastPurchaseStr = lastPurchaseDate
    ? `${formatDate(lastPurchaseDate)} (${formatCurrency(lastPurchaseAmount || 0)})`
    : 'Kayıt yok';

  return `Merhaba ${customerName},

Güncel cari hesap ve ödeme planı bilgilendirme özetinizi aşağıda paylaşıyoruz.

🔴 Toplam Cari Borç: ${formatCurrency(totalDebt)}
📅 Bu Hafta Ödenecek: ${formatCurrency(dueThisWeek)}
⚠️ Geciken Borç: ${formatCurrency(overdueDebt)}

🗓️ Yaklaşan Ödemeleriniz:
${scheduleText}

📦 Son Alış Bilgisi: ${lastPurchaseStr}

Teşekkür ederiz.`;
}

/**
 * Builds Turkish WhatsApp text message for Pre-Order Creation (Müşteri Ön Sipariş Bilgilendirmesi).
 */
export function buildPreOrderWhatsAppMessage(
  customerName: string,
  orderNumber: string,
  items: Array<{ product_name: string; demanded_quantity: number; unit?: string }>,
  notes?: string | null
): string {
  const itemsText = items
    .map((i) => `• ${i.product_name}: ${i.demanded_quantity} ${i.unit || 'Adet'}`)
    .join('\n');

  return `Merhaba ${customerName},

${orderNumber} numaralı ön siparişiniz / ürün talebiniz başarıyla alınmıştır.

📋 Talep Edilen Ürünler:
${itemsText}
${notes ? `\n📌 Sipariş Notu: ${notes}\n` : ''}
Ürünleriniz tedarik edilip hazırlandığında bilgilendirileceksiniz.

Teşekkür ederiz.`;
}


/**
 * Opens WhatsApp Web / Deep Link in a new tab.
 */
export function openWhatsAppWeb(phone: string, text: string): void {
  const norm = normalizeTurkishPhone(phone);
  if (!norm.isValid) {
    throw new Error('Geçerli bir WhatsApp telefon numarası bulunmuyor.');
  }

  const encodedText = encodeURIComponent(text);
  const url = `https://wa.me/${norm.normalized}?text=${encodedText}`;
  window.open(url, '_blank');
}

/**
 * Logs a WhatsApp sharing attempt to audit logs in Supabase.
 */
export async function logWhatsAppShareAttempt(
  entityType: 'sales' | 'customers' | 'suppliers' | 'payments' | 'offset',
  entityId: string,
  phoneNumber: string,
  details: Record<string, any>
): Promise<void> {
  try {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData?.user) return;

    await supabase.from('audit_logs').insert({
      owner_id: userData.user.id,
      action: 'WHATSAPP_SHARE_ATTEMPT',
      entity_type: entityType,
      entity_id: entityId,
      details: {
        phone_number: phoneNumber,
        initiated_at: new Date().toISOString(),
        status: 'initiated',
        ...details,
      },
    });
  } catch (err) {
    console.error('WhatsApp audit log kaydı hatası:', err);
  }
}

/**
 * Queries audit_logs to check if WhatsApp was sent for given payment IDs.
 */
export async function getWhatsAppAuditStatusesForPayments(
  paymentIds: string[]
): Promise<Record<string, WhatsAppAuditStatus>> {
  if (!paymentIds || paymentIds.length === 0) return {};

  try {
    const { data: logs } = await supabase
      .from('audit_logs')
      .select('entity_id, details, created_at')
      .eq('action', 'WHATSAPP_SHARE_ATTEMPT')
      .in('entity_id', paymentIds);

    const map: Record<string, WhatsAppAuditStatus> = {};
    paymentIds.forEach((id) => {
      map[id] = { customerSent: false, supplierSent: false };
    });

    logs?.forEach((log) => {
      const pId = log.entity_id;
      if (map[pId]) {
        const target = log.details?.target;
        if (target === 'customer' || !target) {
          map[pId].customerSent = true;
          map[pId].customerSentAt = log.created_at;
        } else if (target === 'supplier') {
          map[pId].supplierSent = true;
          map[pId].supplierSentAt = log.created_at;
        }
      }
    });

    return map;
  } catch (err) {
    console.error('Error fetching WhatsApp audit statuses:', err);
    return {};
  }
}

/**
 * Future WhatsApp Business Cloud API Integration Layer (Abstraction)
 */
export class WhatsAppService {
  static async sendWhatsAppMessage(toPhone: string, text: string): Promise<{ success: boolean; messageId?: string }> {
    console.log('[WhatsAppService] sendWhatsAppMessage stub called', { toPhone, text });
    return { success: true, messageId: 'stub-msg-id' };
  }

  static async sendWhatsAppDocument(toPhone: string, pdfUrl: string, caption: string): Promise<{ success: boolean; messageId?: string }> {
    console.log('[WhatsAppService] sendWhatsAppDocument stub called', { toPhone, pdfUrl, caption });
    return { success: true, messageId: 'stub-doc-id' };
  }
}
