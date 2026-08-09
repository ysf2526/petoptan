import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/context/ToastContext';
import { parseErrorMessage } from '@/utils/errors';
import { formatCurrency, formatNumber } from '@/utils/formatters';
import { Product, MovementType } from '@/types/database.types';
import { X, Boxes, Loader2, CheckCircle2 } from 'lucide-react';

interface StockEntryModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultProductId?: string;
  onSuccess?: () => void;
}

export const StockEntryModal: React.FC<StockEntryModalProps> = ({
  isOpen,
  onClose,
  defaultProductId,
  onSuccess,
}) => {
  const { showSuccess, showError } = useToast();

  const [loading, setLoading] = useState(false);
  const [fetchingProducts, setFetchingProducts] = useState(false);

  const [products, setProducts] = useState<Product[]>([]);
  const [selectedProductId, setSelectedProductId] = useState<string>('');
  const [movementType, setMovementType] = useState<MovementType>('PURCHASE');
  const [quantity, setQuantity] = useState<number | ''>('');
  const [unitCost, setUnitCost] = useState<number | ''>('');
  const [note, setNote] = useState<string>('');

  const selectedProduct = products.find((p) => p.id === selectedProductId);

  useEffect(() => {
    if (isOpen) {
      const loadProds = async () => {
        setFetchingProducts(true);
        try {
          const { data } = await supabase
            .from('products')
            .select('*')
            .eq('active', true)
            .is('deleted_at', null)
            .order('product_name');

          setProducts(data || []);
          if (defaultProductId) {
            setSelectedProductId(defaultProductId);
          } else if (data && data.length > 0) {
            setSelectedProductId(data[0].id);
          }
        } catch (e) {
          console.error(e);
        } finally {
          setFetchingProducts(false);
        }
      };
      loadProds();
    }
  }, [isOpen, defaultProductId]);

  useEffect(() => {
    if (selectedProduct) {
      setUnitCost(selectedProduct.purchase_price);
    }
  }, [selectedProductId]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedProductId) {
      showError('Lütfen bir ürün seçin.');
      return;
    }

    const qty = Number(quantity);
    if (isNaN(qty) || qty <= 0) {
      showError('Lütfen geçerli bir miktar girin.');
      return;
    }

    setLoading(true);

    try {
      const { data, error } = await supabase.rpc('stock_entry_transaction', {
        p_product_id: selectedProductId,
        p_movement_type: movementType,
        p_quantity: qty,
        p_unit_cost: unitCost !== '' ? Number(unitCost) : null,
        p_note: note || (movementType === 'PURCHASE' ? 'Tedarikçiden Mal Girişi' : 'Depo Stok Güncellemesi'),
      });

      if (error) {
        showError(parseErrorMessage(error));
        setLoading(false);
        return;
      }

      if (data && data.success) {
        showSuccess(`Stok başarıyla güncellendi! (Yeni Stok: ${formatNumber(data.new_stock)} ${selectedProduct?.unit || 'Adet'})`);
        onClose();
        if (onSuccess) onSuccess();
      } else {
        showError('Stok işlemi gerçekleştirilemedi.');
      }
    } catch (err) {
      showError(parseErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4">
      <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md" onClick={onClose} />

      <div className="relative bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg shadow-2xl z-10 overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between bg-slate-900">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
              <Boxes className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-white">Depoya Mal Girişi & Stok Düzeltme</h2>
              <p className="text-xs text-slate-400">Depoya ürün kabulü yapın veya sayım farklarını işleyin.</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-white rounded-lg bg-slate-800">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        {fetchingProducts ? (
          <div className="p-8 text-center text-slate-400 flex flex-col items-center">
            <Loader2 className="w-8 h-8 animate-spin text-indigo-500 mb-2" />
            <span>Ürünler Yükleniyor...</span>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-4 sm:p-6 space-y-5">
            {/* Movement Type Radio Strip */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                İşlem Tipi *
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {[
                  { type: 'PURCHASE', label: 'Mal Girişi (+)' },
                  { type: 'ADJUSTMENT', label: 'Sayım Düzeltme' },
                  { type: 'RETURN', label: 'Müşteri İade (+)' },
                  { type: 'DAMAGE', label: 'Zayiat (-)' },
                ].map((m) => (
                  <button
                    key={m.type}
                    type="button"
                    onClick={() => setMovementType(m.type as MovementType)}
                    className={`py-2 px-2.5 rounded-xl border text-[11px] font-bold transition-all ${
                      movementType === m.type
                        ? 'bg-indigo-600/20 border-indigo-500 text-indigo-400 shadow-inner'
                        : 'bg-slate-950 border-slate-700 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Product Selection */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                Ürün Seçin *
              </label>
              <select
                required
                value={selectedProductId}
                onChange={(e) => setSelectedProductId(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-slate-100 text-sm focus:border-indigo-500 outline-none"
              >
                <option value="">-- Ürün Seçin --</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.product_name} (Mevcut Stok: {p.current_stock} {p.unit})
                  </option>
                ))}
              </select>
            </div>

            {/* Current Product Info Banner */}
            {selectedProduct && (
              <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 flex items-center justify-between text-xs">
                <div>
                  <span className="text-slate-400 block font-medium">Mevcut Stok Durumu</span>
                  <span className="text-sm font-extrabold text-white">
                    {formatNumber(selectedProduct.current_stock)} {selectedProduct.unit}
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-slate-400 block font-medium">Kayıtlı Alış Fiyatı</span>
                  <span className="text-sm font-bold text-slate-300">{formatCurrency(selectedProduct.purchase_price)}</span>
                </div>
              </div>
            )}

            {/* Quantity and Unit Cost Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                  Miktar ({selectedProduct?.unit || 'Adet'}) *
                </label>
                <input
                  type="number"
                  step="0.01"
                  min={0.01}
                  required
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value === '' ? '' : Number(e.target.value))}
                  placeholder="Örn: 50"
                  className="w-full bg-slate-950 border border-slate-700 focus:border-indigo-500 rounded-xl p-3 text-white text-base font-bold outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                  Birim Alış Fiyatı (TL)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min={0}
                  value={unitCost}
                  onChange={(e) => setUnitCost(e.target.value === '' ? '' : Number(e.target.value))}
                  placeholder={selectedProduct ? String(selectedProduct.purchase_price) : '0.00'}
                  className="w-full bg-slate-950 border border-slate-700 focus:border-indigo-500 rounded-xl p-3 text-white text-base font-bold outline-none"
                />
              </div>
            </div>

            {/* Note */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                Açıklama / Fatura No / Not
              </label>
              <textarea
                rows={2}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Örn: Lider Pet Food İrsaliye No: 9812 / 50 Çuval Mal Kabul"
                className="w-full bg-slate-950 border border-slate-700 focus:border-indigo-500 rounded-xl p-3 text-slate-100 text-xs outline-none"
              />
            </div>

            {/* Actions */}
            <div className="pt-3 border-t border-slate-800 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={onClose}
                className="py-2.5 px-4 rounded-xl border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs transition-colors"
              >
                Vazgeç
              </button>

              <button
                type="submit"
                disabled={loading || !quantity}
                className="py-2.5 px-6 rounded-xl bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 text-white font-bold text-xs shadow-lg shadow-indigo-500/25 flex items-center gap-2 transition-all disabled:opacity-50 active:scale-98"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Kaydediliyor...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Stok İşlemini Tamamla</span>
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
