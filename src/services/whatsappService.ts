import { supabase } from '@/lib/supabase';
import { formatCurrency, formatDate } from '@/utils/formatters';
import { Sale, SaleItem, PaymentSchedule } from '@/types/database.types';

export interface PhoneNormalizationResult {
  raw: string;
  normalized: string;
  isValid: boolean;
}

/**
 * Normalizes Turkish mobile phone numbers into international 905XXXXXXXXX format.
 * Examples:
 * "0532 123 45 67" -> "905321234567"
 * "5321234567"     -> "905321234567"
 * "+90 532 123 4567" -> "905321234567"
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
      .map((s) => {
        const dStr = formatDate(s.due_date);
        const aStr = formatCurrency(s.amount);
        let statusMark = '';
        if (s.status === 'paid') statusMark = ' ✓ (ÖDENDİ)';
        else if (s.status === 'partially_paid') statusMark = ' (KISMİ ÖDENDİ)';
        else if (s.status === 'overdue') statusMark = ' ⚠️ (GECİKTİ)';
        return `${dStr} → ${aStr}${statusMark}`;
      })
      .join('\n');
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
 * Opens WhatsApp Web / Deep Link in a new tab.
 */
export function openWhatsAppWeb(phone: string, text: string): void {
  const norm = normalizeTurkishPhone(phone);
  if (!norm.isValid) {
    throw new Error('Müşterinin geçerli bir telefon numarası bulunmuyor.');
  }

  const encodedText = encodeURIComponent(text);
  const url = `https://wa.me/${norm.normalized}?text=${encodedText}`;
  window.open(url, '_blank');
}

/**
 * Logs a WhatsApp sharing attempt to audit logs in Supabase.
 */
export async function logWhatsAppShareAttempt(
  entityType: 'sales' | 'customers',
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
 * Future WhatsApp Business Cloud API Integration Layer (Abstraction)
 */
export class WhatsAppService {
  /**
   * Future implementation for direct WhatsApp Cloud API message delivery
   */
  static async sendWhatsAppMessage(toPhone: string, text: string): Promise<{ success: boolean; messageId?: string }> {
    console.log('[WhatsAppService] sendWhatsAppMessage stub called', { toPhone, text });
    // Future API call via Supabase Edge Functions or backend API endpoint
    return { success: true, messageId: 'stub-msg-id' };
  }

  /**
   * Future implementation for direct WhatsApp Cloud API PDF document attachment delivery
   */
  static async sendWhatsAppDocument(toPhone: string, pdfUrl: string, caption: string): Promise<{ success: boolean; messageId?: string }> {
    console.log('[WhatsAppService] sendWhatsAppDocument stub called', { toPhone, pdfUrl, caption });
    // Future API call via Supabase Edge Functions or backend API endpoint
    return { success: true, messageId: 'stub-doc-id' };
  }
}
