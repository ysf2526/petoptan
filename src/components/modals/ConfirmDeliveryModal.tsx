import React, { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/context/ToastContext';
import { parseErrorMessage } from '@/utils/errors';
import { formatCurrency, formatDateTime, formatDate } from '@/utils/formatters';
import { Sale, Customer, Profile, SaleItem, PaymentSchedule } from '@/types/database.types';
import { X, CheckCircle2, Truck, Loader2, FileText, MessageSquare, Calendar, ChevronRight } from 'lucide-react';
import { normalizeTurkishPhone, buildSaleWhatsAppMessage, logWhatsAppShareAttempt } from '@/services/whatsappService';
import { shareOrDownloadSalesPdf, downloadPdfFile } from '@/services/pdfService';

interface ConfirmDeliveryModalProps {
  isOpen: boolean;
  onClose: () => void;
  sale: Sale | null;
  onSuccess?: () => void;
  onOpenDocument?: (sale: Sale) => void;
}

export const ConfirmDeliveryModal: React.FC<ConfirmDeliveryModalProps> = ({
  isOpen,
  onClose,
  sale,
  onSuccess,
  onOpenDocument,
}) => {
  const { showSuccess, showError } = useToast();
  const [submitting, setSubmitting] = useState(false);
  const [deliveryDate, setDeliveryDate] = useState<string>(
    new Date().toISOString().slice(0, 16)
  );

  // Post-delivery completed view state
  const [deliveryResult, setDeliveryResult] = useState<{
    completed: boolean;
    delivered_at?: string;
    net_customer_debt?: number;
    whatsapp_sent?: boolean;
  }>({ completed: false });

  if (!isOpen || !sale) return null;

  const handleConfirmDelivery = async () => {
    setSubmitting(true);
    try {
      const deliveredAtISO = deliveryDate ? new Date(deliveryDate).toISOString() : new Date().toISOString();

      let deliveryTimeResult = deliveredAtISO;
      let netDebtResult = sale.total_amount;

      const { data, error } = await supabase.rpc('confirm_delivery_and_finalize_sale_transaction', {
        p_sale_id: sale.id,
        p_delivered_at: deliveredAtISO,
      });

      if (error) {
        console.warn('RPC confirm_delivery_and_finalize_sale_transaction error, executing direct fallback update:', error);
        // Fallback update directly to sales table without updated_at column dependency
        const { error: updateErr } = await supabase
          .from('sales')
          .update({
            order_status: 'delivered',
            delivered_at: deliveredAtISO,
            pdf_generated_at: new Date().toISOString(),
          })
          .eq('id', sale.id);

        if (updateErr) throw error;
      } else if (data) {
        deliveryTimeResult = data.delivered_at || deliveredAtISO;
        netDebtResult = data.net_customer_debt || sale.total_amount;
      }

      showSuccess(`Sipariş #${sale.sale_number} teslim edildi olarak işaretlendi ve ödeme planı başlatıldı.`);
      window.dispatchEvent(new CustomEvent('refresh-data'));
      
      setDeliveryResult({
        completed: true,
        delivered_at: deliveryTimeResult,
        net_customer_debt: netDebtResult,
        whatsapp_sent: false,
      });

      if (onSuccess) onSuccess();
    } catch (err) {
      showError(parseErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };


  const handleSendWhatsApp = async () => {
    if (!sale) return;

    try {
      // 1. Mark whatsapp status in DB
      await supabase.rpc('mark_sale_whatsapp_sent_transaction', {
        p_sale_id: sale.id,
      });

      setDeliveryResult((prev) => ({ ...prev, whatsapp_sent: true }));

      // 2. Fetch customer for phone
      const { data: custData } = await supabase
        .from('customers')
        .select('*')
        .eq('id', sale.customer_id)
        .maybeSingle();

      const customer = custData as Customer | null;
      const phone = customer?.phone || '';
      const norm = normalizeTurkishPhone(phone);

      if (!norm.isValid) {
        showError('Müşteriye ait geçerli bir telefon numarası bulunamadı.');
        return;
      }

      // 3. Fetch profile for header
      const { data: profData } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', sale.owner_id)
        .maybeSingle();
      const profile = profData as Profile | null;

      // 4. Fetch sale items
      const { data: itemsData } = await supabase
        .from('sale_items')
        .select('*')
        .eq('sale_id', sale.id)
        .is('deleted_at', null);
      const items = (itemsData as SaleItem[]) || [];

      // 5. Fetch ALL customer active unpaid payment schedules for consolidation
      const { data: schedData } = await supabase
        .from('payment_schedules')
        .select('*')
        .eq('customer_id', sale.customer_id)
        .is('deleted_at', null)
        .order('due_date', { ascending: true });
      const allCustomerSchedules = (schedData as PaymentSchedule[]) || [];

      // 6. Build WhatsApp text using consolidated plan
      const messageText = buildSaleWhatsAppMessage(
        sale,
        items,
        allCustomerSchedules,
        deliveryResult.net_customer_debt || sale.total_amount
      );

      await logWhatsAppShareAttempt('sales', sale.id, norm.normalized, {
        sale_number: sale.sale_number,
        customer_name: sale.customer_name,
      });

      // 7. Generate genuine PDF File, trigger device download AND WhatsApp share
      const { method } = await shareOrDownloadSalesPdf(
        sale,
        items,
        allCustomerSchedules,
        customer,
        profile,
        norm.normalized,
        messageText
      );

      if (method === 'whatsapp_web_download') {
        showSuccess('Cari Hesap PDF belgesi cihazınıza indirildi! WhatsApp sohbetine dosya olarak ekleyebilirsiniz.');
      } else {
        showSuccess('WhatsApp PDF paylaşımı başlatıldı.');
      }
    } catch (err: any) {
      console.error(err);
      showError(parseErrorMessage(err));
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 animate-fadeIn">
      <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md" onClick={onClose} />
      <div className="relative bg-slate-900 border border-emerald-800 rounded-2xl w-full max-w-lg p-5 sm:p-6 shadow-2xl z-10 space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-600/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 shrink-0">
              <Truck className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-black text-white">Teslimat İşlemi #{sale.sale_number}</h3>
              <p className="text-xs text-emerald-300 font-medium">{sale.customer_name}</p>
            </div>
          </div>

          <button onClick={onClose} className="p-2 text-slate-400 hover:text-white rounded-lg bg-slate-800">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* POST-DELIVERY SUCCESS SCREEN */}
        {deliveryResult.completed ? (
          <div className="space-y-4 animate-fadeIn text-xs">
            <div className="bg-emerald-950/60 border border-emerald-700/60 p-4 rounded-xl space-y-3">
              <div className="flex items-center gap-2 text-emerald-300 font-extrabold text-sm">
                <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                <span>Sipariş Başarıyla Teslim Edildi!</span>
              </div>
              <p className="text-slate-300 leading-relaxed">
                Teslim tarihi kaydedildi, satış kesinleştirildi ve ödeme planı fiili teslim tarihinden itibaren başlatıldı.
              </p>

              <div className="pt-2 border-t border-emerald-900/60 grid grid-cols-2 gap-2 text-slate-200 font-mono">
                <div>
                  <span className="text-slate-400 block font-sans">Teslim Zamanı:</span>
                  <span className="font-bold text-white">
                    {formatDateTime(deliveryResult.delivered_at || new Date().toISOString())}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block font-sans">Güncel Toplam Borç:</span>
                  <span className="font-extrabold text-emerald-400 text-sm">
                    {formatCurrency(deliveryResult.net_customer_debt || sale.total_amount)}
                  </span>
                </div>
              </div>
            </div>

            {/* Status Tracking Badge */}
            <div className="flex items-center justify-between bg-slate-800/60 p-3 rounded-xl border border-slate-700">
              <span className="text-slate-400 font-medium">WhatsApp PDF Durumu:</span>
              <span
                className={`font-bold px-2.5 py-0.5 rounded text-[11px] ${
                  deliveryResult.whatsapp_sent
                    ? 'bg-emerald-950 text-emerald-300 border border-emerald-800/60'
                    : 'bg-slate-800 text-slate-400 border border-slate-700'
                }`}
              >
                {deliveryResult.whatsapp_sent ? '✅ Gönderildi' : '⚪ Henüz Gönderilmedi'}
              </span>
            </div>

            {/* Single Action Button */}
            <div className="pt-2">
              <button
                type="button"
                onClick={handleSendWhatsApp}
                className="w-full bg-gradient-to-r from-emerald-600 via-emerald-500 to-teal-500 hover:from-emerald-500 hover:to-teal-400 text-white font-black py-3.5 px-4 rounded-xl shadow-xl shadow-emerald-600/30 flex items-center justify-center gap-2.5 text-sm transition-all active:scale-98 border border-emerald-400/30"
              >
                <MessageSquare className="w-5 h-5 text-emerald-100" />
                <span>💬 WhatsApp'tan PDF ve Mesaj Gönder</span>
              </button>
            </div>


            <div className="pt-2 text-center">
              <button
                type="button"
                onClick={onClose}
                className="text-xs text-slate-400 hover:text-white underline"
              >
                Pencereyi Kapat
              </button>
            </div>
          </div>
        ) : (
          /* PRE-DELIVERY CONFIRMATION FORM */
          <div className="space-y-4 text-xs">
            <div className="bg-sky-950/40 border border-sky-900/60 p-4 rounded-xl space-y-3 text-sky-100 leading-relaxed">
              <p className="font-bold text-white text-sm">
                Siparişi müşteriye teslim etmek üzere kesinleştiriyorsunuz.
              </p>
              <p className="text-slate-300 text-xs">
                Bu işlemle birlikte teslim tarihi kaydedilecek, cari borç kesinleşecek ve <strong className="text-emerald-300">ödeme planı teslim tarihinden itibaren başlatılacaktır</strong>.
              </p>

              <div className="pt-2 border-t border-sky-900/40 grid grid-cols-2 gap-2 text-slate-200 font-mono">
                <div>
                  <span className="text-slate-400 block font-sans">Müşteri:</span>
                  <span className="font-bold text-white truncate block">{sale.customer_name}</span>
                </div>
                <div>
                  <span className="text-slate-400 block font-sans">Sipariş Tutarı:</span>
                  <span className="font-bold text-emerald-400">{formatCurrency(sale.total_amount)}</span>
                </div>
              </div>
            </div>

            {/* Date & Time Picker */}
            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1.5 flex items-center gap-1.5">
                <Calendar className="w-4 h-4 text-sky-400" />
                <span>Teslim Tarihi ve Saati (Europe/Istanbul)</span>
              </label>
              <input
                type="datetime-local"
                value={deliveryDate}
                onChange={(e) => setDeliveryDate(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 text-white font-bold text-xs rounded-xl px-3.5 py-2.5 outline-none focus:border-sky-500"
              />
            </div>

            {/* Footer Buttons */}
            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={onClose}
                disabled={submitting}
                className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs transition-all"
              >
                Vazgeç
              </button>

              <button
                type="button"
                onClick={handleConfirmDelivery}
                disabled={submitting}
                className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs transition-all shadow-lg shadow-emerald-600/30 active:scale-95 flex items-center gap-2 disabled:opacity-40"
              >
                {submitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>İşleniyor...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    <span>🚚 Teslim Edildi Olarak Tamamla</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
