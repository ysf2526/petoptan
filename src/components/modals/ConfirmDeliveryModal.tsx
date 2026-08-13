import React, { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/context/ToastContext';
import { parseErrorMessage } from '@/utils/errors';
import { formatCurrency } from '@/utils/formatters';
import { Sale, OrderStatus } from '@/types/database.types';
import { X, CheckCircle2, Truck, Loader2 } from 'lucide-react';

interface ConfirmDeliveryModalProps {
  isOpen: boolean;
  onClose: () => void;
  sale: Sale | null;
  onSuccess?: () => void;
}

export const ConfirmDeliveryModal: React.FC<ConfirmDeliveryModalProps> = ({
  isOpen,
  onClose,
  sale,
  onSuccess,
}) => {
  const { showSuccess, showError } = useToast();
  const [submitting, setSubmitting] = useState(false);

  if (!isOpen || !sale) return null;

  const handleConfirmDelivery = async () => {
    setSubmitting(true);
    try {
      const oldStatus: OrderStatus = (sale.order_status as OrderStatus) || 'prepared';
      const newStatus: OrderStatus = 'delivered';

      // 1. Update sales table order_status
      const { error: updateError } = await supabase
        .from('sales')
        .update({ order_status: newStatus })
        .eq('id', sale.id);

      if (updateError) throw updateError;

      // 2. Add audit log entry
      await supabase.from('audit_logs').insert({
        action: 'ORDER_STATUS_CHANGED',
        entity_type: 'sales',
        entity_id: sale.id,
        details: {
          order_id: sale.id,
          sale_number: sale.sale_number,
          customer_name: sale.customer_name,
          old_status: oldStatus,
          new_status: newStatus,
          timestamp: new Date().toISOString(),
        },
      });

      showSuccess(`Sipariş #${sale.sale_number} teslim edildi olarak işaretlendi.`);
      window.dispatchEvent(new CustomEvent('refresh-data'));
      onClose();
      if (onSuccess) onSuccess();
    } catch (err) {
      showError(parseErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4">
      <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md" onClick={onClose} />
      <div className="relative bg-slate-900 border border-sky-800 rounded-2xl w-full max-w-md p-5 sm:p-6 shadow-2xl z-10 space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-sky-600/20 border border-sky-500/40 flex items-center justify-center text-sky-400 shrink-0">
              <Truck className="w-6 h-6 animate-bounce" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-black text-white">Teslimat Onayı #{sale.sale_number}</h3>
              <p className="text-xs text-sky-300 font-medium">{sale.customer_name}</p>
            </div>
          </div>

          <button onClick={onClose} className="p-2 text-slate-400 hover:text-white rounded-lg bg-slate-800">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body Content */}
        <div className="space-y-4 text-xs">
          <div className="bg-sky-950/40 border border-sky-900/60 p-4 rounded-xl space-y-2 text-sky-100 leading-relaxed">
            <p className="font-bold text-white text-sm">
              Bu siparişin müşteriye teslim edildiğini onaylıyor musunuz?
            </p>
            <p className="text-slate-300 text-xs">
              Sipariş durumu <strong className="text-sky-300">🔵 TESLİM EDİLDİ</strong> olarak güncellenecek ve teslim tarihi kaydedilecektir.
            </p>

            <div className="pt-3 border-t border-sky-900/40 grid grid-cols-2 gap-2 text-slate-200 font-mono">
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
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs transition-all"
          >
            İptal
          </button>

          <button
            type="button"
            onClick={handleConfirmDelivery}
            disabled={submitting}
            className="px-5 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-black text-xs transition-all shadow-lg shadow-sky-600/30 active:scale-95 flex items-center gap-2 disabled:opacity-40"
          >
            {submitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>İşleniyor...</span>
              </>
            ) : (
              <>
                <CheckCircle2 className="w-4 h-4" />
                <span>Teslim Edildi Olarak İşaretle</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
