import React, { useState, useEffect } from 'react';
import { X, CheckCircle, Package, ArrowRight, Layers } from 'lucide-react';
import { preOrderService } from '@/services/preOrderService';
import { useToast } from '@/context/ToastContext';

interface FulfillPreOrderModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  incomingProductIds?: string[];
}

export const FulfillPreOrderModal: React.FC<FulfillPreOrderModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  incomingProductIds,
}) => {
  const { showToast } = useToast();
  const [demandAnalysis, setDemandAnalysis] = useState<any[]>([]);
  const [allocations, setAllocations] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      fetchAnalysis();
    }
  }, [isOpen]);

  const fetchAnalysis = async () => {
    try {
      setLoading(true);
      const data = await preOrderService.getSupplyDemandAnalysis();
      // Filter items with open demand
      const filtered = data.filter((item) => item.open_demand > 0);
      setDemandAnalysis(filtered);

      // Pre-fill allocations with available free stock if possible
      const initialAlloc: Record<string, number> = {};
      filtered.forEach((item) => {
        const freeStock = Math.max(0, item.current_stock - item.reserved_stock);
        item.pre_order_items.forEach((pItem: any) => {
          const needed = pItem.demanded_quantity - pItem.fulfilled_quantity;
          if (needed > 0) {
            initialAlloc[pItem.id] = needed;
          }
        });
      });
      setAllocations(initialAlloc);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  const handleAllocationChange = (itemId: string, qty: number) => {
    setAllocations((prev) => ({
      ...prev,
      [itemId]: Math.max(0, qty),
    }));
  };

  const handleSubmit = async () => {
    const fulfillments = Object.entries(allocations)
      .filter(([_, qty]) => qty > 0)
      .map(([pre_order_item_id, fulfill_quantity]) => ({
        pre_order_item_id,
        fulfill_quantity,
      }));

    if (fulfillments.length === 0) {
      showToast('Lütfen karşılanacak en az 1 miktar giriniz.', 'error');
      return;
    }

    try {
      setLoading(true);
      await preOrderService.fulfillPreOrders(fulfillments);
      showToast('Ön siparişler gelen stokla başarıyla karşılandı ve hazırlandı!', 'success');
      onSuccess();
      onClose();
    } catch (err: any) {
      showToast(err.message || 'Karşılama işlemi yapılırken hata oluştu.', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-sm animate-fadeIn overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-3xl shadow-2xl overflow-hidden text-slate-200 my-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-slate-800 bg-slate-900/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 font-bold">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-bold text-white tracking-tight text-base sm:text-lg">
                Gelen Ürünleri Ön Siparişle Eşleştir
              </h2>
              <p className="text-xs text-slate-400">
                Depoya giren stokları açık müşteri taleplerine tahsis et
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 sm:p-5 space-y-4 max-h-[75vh] overflow-y-auto custom-scrollbar">
          {demandAnalysis.length === 0 ? (
            <div className="p-8 text-center text-slate-400 text-xs">
              Açık karşılanmayı bekleyen ön sipariş talebi bulunmuyor.
            </div>
          ) : (
            demandAnalysis.map((item) => (
              <div
                key={item.product_id || item.product_name}
                className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-4 space-y-3"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-700/50 pb-2.5">
                  <div>
                    <h3 className="font-bold text-white text-sm">{item.product_name}</h3>
                    <p className="text-xs text-slate-400">
                      {item.brand ? `${item.brand} • ` : ''}Birim: {item.unit}
                    </p>
                  </div>

                  <div className="flex items-center gap-3 text-xs">
                    <span className="bg-slate-900 px-2.5 py-1 rounded-lg border border-slate-700 text-slate-300">
                      Mevcut Stok: <strong className="text-white">{item.current_stock}</strong>
                    </span>
                    <span className="bg-amber-950/60 px-2.5 py-1 rounded-lg border border-amber-800/60 text-amber-300">
                      Açık Talep: <strong>{item.open_demand}</strong>
                    </span>
                  </div>
                </div>

                {/* Open Customer Demands for this product */}
                <div className="space-y-2">
                  <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                    Açık Müşteri Talepleri:
                  </p>
                  {item.pre_order_items.map((pItem: any) => {
                    const remainingNeeded = pItem.demanded_quantity - pItem.fulfilled_quantity;
                    if (remainingNeeded <= 0) return null;
                    return (
                      <div
                        key={pItem.id}
                        className="bg-slate-900/80 rounded-xl p-3 flex items-center justify-between gap-3 text-xs"
                      >
                        <div>
                          <p className="font-bold text-white">
                            {pItem.pre_orders?.customer_name || 'Müşteri'}
                          </p>
                          <p className="text-[11px] text-slate-400">
                            Sipariş No: {pItem.pre_orders?.order_number} • Talep: {pItem.demanded_quantity} • Karşılanan: {pItem.fulfilled_quantity}
                          </p>
                        </div>

                        <div className="flex items-center gap-2">
                          <span className="text-amber-400 font-semibold text-xs">
                            Eksik: {remainingNeeded}
                          </span>

                          <div className="w-24">
                            <input
                              type="number"
                              min="0"
                              max={remainingNeeded}
                              value={allocations[pItem.id] ?? remainingNeeded}
                              onChange={(e) =>
                                handleAllocationChange(pItem.id, Number(e.target.value))
                              }
                              className="w-full bg-slate-800 border border-slate-700 text-white font-bold text-center rounded-lg px-2 py-1 outline-none focus:border-brand-500"
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="p-4 sm:p-5 border-t border-slate-800 bg-slate-900/50 flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl border border-slate-700 text-slate-300 text-xs font-semibold hover:bg-slate-800 transition-colors"
          >
            Kapat / Sonra Eşleştir
          </button>

          <button
            type="button"
            onClick={handleSubmit}
            disabled={loading || demandAnalysis.length === 0}
            className="bg-emerald-600 hover:bg-emerald-500 text-white font-semibold px-5 py-2.5 rounded-xl text-xs sm:text-sm transition-colors flex items-center gap-2 shadow-lg shadow-emerald-500/20 disabled:opacity-50"
          >
            <CheckCircle className="w-4 h-4" />
            <span>{loading ? 'Karşılanıyor...' : 'Ön Siparişleri Karşıla'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
