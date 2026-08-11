import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/context/ToastContext';
import { parseErrorMessage } from '@/utils/errors';
import { formatCurrency } from '@/utils/formatters';
import { Sale, SaleItem } from '@/types/database.types';
import {
  X,
  AlertOctagon,
  Boxes,
  Receipt,
  Loader2,
  Ban,
  CheckCircle2,
} from 'lucide-react';

interface CancelSaleModalProps {
  isOpen: boolean;
  onClose: () => void;
  sale: Sale | null;
  onSuccess?: () => void;
}

export const CancelSaleModal: React.FC<CancelSaleModalProps> = ({
  isOpen,
  onClose,
  sale,
  onSuccess,
}) => {
  const { showSuccess, showError } = useToast();

  const [loadingItems, setLoadingItems] = useState(true);
  const [cancelling, setCancelling] = useState(false);

  const [items, setItems] = useState<SaleItem[]>([]);
  const [reason, setReason] = useState('Müşteri Talebi İptal');

  useEffect(() => {
    if (isOpen && sale) {
      loadSaleItems();
    }
  }, [isOpen, sale]);

  const loadSaleItems = async () => {
    if (!sale) return;
    setLoadingItems(true);
    try {
      const { data } = await supabase
        .from('sale_items')
        .select('*')
        .eq('sale_id', sale.id)
        .is('deleted_at', null);

      setItems(data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingItems(false);
    }
  };

  if (!isOpen || !sale) return null;

  const handleExecuteCancel = async () => {
    setCancelling(true);
    try {
      const { data, error } = await supabase.rpc('cancel_sale_transaction', {
        p_sale_id: sale.id,
        p_reason: reason.trim() || 'Kullanıcı İptali',
      });

      if (error) throw error;

      showSuccess(`Sipariş #${sale.sale_number} iptal edildi ve stoklar depoya iade edildi.`);
      onClose();
      if (onSuccess) onSuccess();
    } catch (err) {
      showError(parseErrorMessage(err));
    } finally {
      setCancelling(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4">
      <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md" onClick={onClose} />
      <div className="relative bg-slate-900 border border-rose-800 rounded-2xl w-full max-w-lg p-5 sm:p-6 shadow-2xl z-10 space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-rose-600/20 border border-rose-500/40 flex items-center justify-center text-rose-400 shrink-0">
              <AlertOctagon className="w-6 h-6 animate-pulse" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-black text-white">Siparişi İptal Et #{sale.sale_number}</h3>
              <p className="text-xs text-rose-300 font-medium">{sale.customer_name}</p>
            </div>
          </div>

          <button onClick={onClose} className="p-2 text-slate-400 hover:text-white rounded-lg bg-slate-800">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="space-y-4 text-xs">
          {/* Summary Box */}
          <div className="bg-rose-950/40 border border-rose-900/60 p-4 rounded-xl space-y-2 text-rose-200 leading-relaxed">
            <p className="font-bold text-white text-sm">
              Bu siparişi iptal etmek istediğinize emin misiniz?
            </p>
            <p className="text-slate-300">
              Sipariş veritabanından fiziki olarak silinmez; durumu <strong className="text-rose-400">İPTAL EDİLDİ</strong> olarak güncellenir.
            </p>
            <div className="pt-2 grid grid-cols-2 gap-2 text-slate-200 border-t border-rose-900/40 font-mono">
              <div>
                <span className="text-slate-400 block font-sans">Sipariş Tutarı:</span>
                <span className="font-bold text-white">{formatCurrency(sale.total_amount)}</span>
              </div>
              <div>
                <span className="text-slate-400 block font-sans">Düşülecek Borç:</span>
                <span className="font-bold text-emerald-400">{formatCurrency(sale.remaining_debt)}</span>
              </div>
            </div>
          </div>

          {/* Returned Items List */}
          <div className="space-y-2">
            <span className="font-bold text-slate-300 block uppercase tracking-wider">
              Depoya İade Edilecek Ürünler ({items.length})
            </span>
            {loadingItems ? (
              <div className="p-4 text-center text-slate-400">
                <Loader2 className="w-5 h-5 animate-spin mx-auto mb-1 text-rose-500" />
                <span>Ürünler Yükleniyor...</span>
              </div>
            ) : (
              <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 max-h-36 overflow-y-auto custom-scrollbar space-y-1.5 font-mono">
                {items.map((it) => (
                  <div key={it.id} className="flex items-center justify-between text-slate-200 border-b border-slate-900/80 pb-1">
                    <span>{it.product_name}</span>
                    <span className="font-bold text-emerald-400">+{it.quantity} {it.unit || 'Adet'} İade</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Reason Input */}
          <div>
            <label className="block font-semibold text-slate-300 uppercase tracking-wider mb-1">
              İptal Nedeni / Not
            </label>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Örn: Müşteri siparişi vazgeçti"
              className="w-full bg-slate-950 border border-slate-700 focus:border-rose-500 rounded-xl p-3 text-slate-100 outline-none"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
          <button
            type="button"
            onClick={onClose}
            disabled={cancelling}
            className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs transition-all"
          >
            Vazgeç
          </button>

          <button
            type="button"
            onClick={handleExecuteCancel}
            disabled={cancelling || loadingItems}
            className="px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-black text-xs transition-all shadow-lg shadow-rose-600/30 active:scale-95 flex items-center gap-2 disabled:opacity-40"
          >
            {cancelling ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>İptal Ediliyor...</span>
              </>
            ) : (
              <>
                <Ban className="w-4 h-4" />
                <span>EVET, SİPARİŞİ İPTAL ET</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
