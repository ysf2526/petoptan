import React, { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/context/ToastContext';
import { parseErrorMessage } from '@/utils/errors';
import { formatCurrency, formatDateTime, formatDate } from '@/utils/formatters';
import { Sale } from '@/types/database.types';
import { X, CheckCircle2, Truck, Loader2, FileText, MessageSquare, Calendar, ChevronRight } from 'lucide-react';
import { openWhatsAppWeb, buildSaleWhatsAppMessage } from '@/services/whatsappService';

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

      const { data, error } = await supabase.rpc('confirm_delivery_and_finalize_sale_transaction', {
        p_sale_id: sale.id,
        p_delivered_at: deliveredAtISO,
      });

      if (error) throw error;

      showSuccess(`Sipariş #${sale.sale_number} teslim edildi olarak işaretlendi ve ödeme planı başlatıldı.`);
      window.dispatchEvent(new CustomEvent('refresh-data'));
      
      setDeliveryResult({
        completed: true,
        delivered_at: data.delivered_at || deliveredAtISO,
        net_customer_debt: data.net_customer_debt || sale.total_amount,
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
    try {
      // 1. Mark whatsapp status in DB
      await supabase.rpc('mark_sale_whatsapp_sent_transaction', {
        p_sale_id: sale.id,
      });

      setDeliveryResult((prev) => ({ ...prev, whatsapp_sent: true }));

      // 2. Fetch customer phone
      const { data: custData } = await supabase
        .from('customers')
        .select('phone')
        .eq('id', sale.customer_id)
        .maybeSingle();

      const phone = custData?.phone;
      if (!phone) {
        showError('Müşteriye ait telefon numarası bulunamadı.');
        return;
      }

      const msg = buildSaleWhatsAppMessage(
        sale,
        [],
        [],
        deliveryResult.net_customer_debt || sale.total_amount
      );


      openWhatsAppWeb(phone, msg);
      showSuccess('WhatsApp mesajı açıldı ve gönderim durumu kaydedildi.');
    } catch (err) {
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

            {/* Document & WhatsApp Action Buttons */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => {
                  if (onOpenDocument) onOpenDocument(sale);
                  else showSuccess('PDF Oluşturuluyor...');
                }}
                className="w-full bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold py-3 px-4 rounded-xl border border-slate-700 flex items-center justify-center gap-2 transition-all active:scale-98"
              >
                <FileText className="w-4 h-4 text-brand-400" />
                <span>📄 PDF Belgesi Önizle</span>
              </button>

              <button
                type="button"
                onClick={handleSendWhatsApp}
                className="w-full bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-white font-black py-3 px-4 rounded-xl shadow-lg shadow-emerald-500/25 flex items-center justify-center gap-2 transition-all active:scale-98"
              >
                <MessageSquare className="w-4 h-4" />
                <span>💬 WhatsApp'tan Gönder</span>
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
