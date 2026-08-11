import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/context/ToastContext';
import { parseErrorMessage } from '@/utils/errors';
import { formatCurrency } from '@/utils/formatters';
import { Sale, Product, SaleItem } from '@/types/database.types';
import {
  X,
  Edit2,
  Plus,
  Minus,
  Trash2,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  ShoppingCart,
  Boxes,
  Info,
  DollarSign,
  ArrowRight,
} from 'lucide-react';

interface EditSaleModalProps {
  isOpen: boolean;
  onClose: () => void;
  sale: Sale | null;
  onSuccess?: () => void;
}

interface EditableItem {
  product_id: string;
  product_name: string;
  quantity: number;
  sale_price: number;
  purchase_price: number;
  original_quantity: number;
  original_price: number;
  available_stock: number;
  unit: string;
}

export const EditSaleModal: React.FC<EditSaleModalProps> = ({
  isOpen,
  onClose,
  sale,
  onSuccess,
}) => {
  const { showSuccess, showError } = useToast();

  const [loadingItems, setLoadingItems] = useState(true);
  const [saving, setSaving] = useState(false);

  const [allProducts, setAllProducts] = useState<Product[]>([]);
  const [items, setItems] = useState<EditableItem[]>([]);
  const [notes, setNotes] = useState('');

  // Add Product Search & Select
  const [selectedProductId, setSelectedProductId] = useState('');
  const [showSummaryDrawer, setShowSummaryDrawer] = useState(false);

  useEffect(() => {
    if (isOpen && sale) {
      setNotes(sale.notes || '');
      loadSaleData();
    }
  }, [isOpen, sale]);

  const loadSaleData = async () => {
    if (!sale) return;
    setLoadingItems(true);
    try {
      // 1. Fetch all products to get current stock and available list
      const { data: pData } = await supabase
        .from('products')
        .select('*')
        .is('deleted_at', null)
        .order('product_name');

      setAllProducts(pData || []);
      const productMap = new Map<string, Product>();
      pData?.forEach((p) => productMap.set(p.id, p));

      // 2. Fetch current sale items
      const { data: iData } = await supabase
        .from('sale_items')
        .select('*')
        .eq('sale_id', sale.id)
        .is('deleted_at', null);

      const editableList: EditableItem[] = (iData || []).map((it) => {
        const prod = productMap.get(it.product_id);
        const stock = Number(prod?.current_stock || 0);
        const qty = Number(it.quantity || 1);
        const price = Number(it.sale_price_snapshot || 0);
        const cost = Number(it.purchase_price_snapshot || prod?.purchase_price || 0);

        return {
          product_id: it.product_id,
          product_name: it.product_name,
          quantity: qty,
          sale_price: price,
          purchase_price: cost,
          original_quantity: qty,
          original_price: price,
          available_stock: stock,
          unit: it.unit || 'Adet',
        };
      });

      setItems(editableList);
    } catch (err) {
      showError('Sipariş ürünleri yüklenirken hata oluştu.');
    } finally {
      setLoadingItems(false);
    }
  };

  if (!isOpen || !sale) return null;

  const handleQuantityChange = (productId: string, newQty: number) => {
    setItems((prev) =>
      prev.map((it) => {
        if (it.product_id === productId) {
          const delta = newQty - it.original_quantity;
          if (delta > 0 && delta > it.available_stock) {
            showError(`Stok yetersiz! "${it.product_name}" için en fazla ${it.original_quantity + it.available_stock} adet girebilirsiniz.`);
            return it;
          }
          return { ...it, quantity: Math.max(1, newQty) };
        }
        return it;
      })
    );
  };

  const handlePriceChange = (productId: string, newPrice: number) => {
    setItems((prev) =>
      prev.map((it) => (it.product_id === productId ? { ...it, sale_price: Math.max(0, newPrice) } : it))
    );
  };

  const handleRemoveItem = (productId: string) => {
    if (items.length <= 1) {
      showError('Sarişte en az 1 ürün kalmalıdır. İptal etmek için "İptal Et" butonunu kullanabilirsiniz.');
      return;
    }
    setItems((prev) => prev.filter((it) => it.product_id !== productId));
  };

  const handleAddProduct = () => {
    if (!selectedProductId) return;
    const prod = allProducts.find((p) => p.id === selectedProductId);
    if (!prod) return;

    const existing = items.find((it) => it.product_id === prod.id);
    if (existing) {
      showError('Bu ürün zaten siparişte kayıtlı. Adedini butonlarla değiştirebilirsiniz.');
      return;
    }

    if (prod.current_stock <= 0) {
      showError(`"${prod.product_name}" ürünü stokta bulunmamaktadır (Mevcut: 0).`);
      return;
    }

    setItems((prev) => [
      ...prev,
      {
        product_id: prod.id,
        product_name: prod.product_name,
        quantity: 1,
        sale_price: Number(prod.sale_price || 0),
        purchase_price: Number(prod.purchase_price || 0),
        original_quantity: 0,
        original_price: Number(prod.sale_price || 0),
        available_stock: Number(prod.current_stock || 0),
        unit: prod.unit || 'Adet',
      },
    ]);

    setSelectedProductId('');
  };

  // Summary calculations
  const oldTotal = Number(sale.total_amount || 0);
  const newTotal = items.reduce((acc, it) => acc + Number(it.quantity || 0) * Number(it.sale_price || 0), 0);
  const diffTotal = newTotal - oldTotal;

  const handleSubmitSave = async () => {
    setSaving(true);
    try {
      const payloadItems = items.map((it) => ({
        product_id: it.product_id,
        quantity: it.quantity,
        sale_price: it.sale_price,
        purchase_price: it.purchase_price,
      }));

      const { data, error } = await supabase.rpc('update_sale_transaction', {
        p_sale_id: sale.id,
        p_items: payloadItems,
        p_notes: notes.trim() || sale.notes,
      });

      if (error) throw error;

      showSuccess(`Sipariş #${sale.sale_number} başarıyla güncellendi.`);
      onClose();
      if (onSuccess) onSuccess();
    } catch (err) {
      showError(parseErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4">
      <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md" onClick={onClose} />
      <div className="relative bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl z-10 overflow-hidden">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between bg-slate-900">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-brand-600/20 border border-brand-500/30 flex items-center justify-center text-brand-400">
              <Edit2 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-white">Siparişi Düzenle #{sale.sale_number}</h2>
              <p className="text-xs text-slate-400">{sale.customer_name} — Tarih: {new Date(sale.created_at).toLocaleDateString('tr-TR')}</p>
            </div>
          </div>

          <button onClick={onClose} className="p-2 text-slate-400 hover:text-white rounded-lg bg-slate-800">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-5 custom-scrollbar flex-1">
          {loadingItems ? (
            <div className="p-12 text-center text-slate-400 flex flex-col items-center">
              <Loader2 className="w-8 h-8 animate-spin text-brand-500 mb-2" />
              <span>Sipariş Detayları Yükleniyor...</span>
            </div>
          ) : (
            <>
              {/* Add New Product Strip */}
              <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 space-y-2">
                <span className="text-xs font-bold text-slate-300 block">Siparişe Yeni Ürün Ekle</span>
                <div className="flex items-center gap-2">
                  <select
                    value={selectedProductId}
                    onChange={(e) => setSelectedProductId(e.target.value)}
                    className="flex-1 bg-slate-900 border border-slate-700 rounded-xl p-2.5 text-xs text-slate-100 outline-none"
                  >
                    <option value="">-- Kataloktan Ürün Seçin --</option>
                    {allProducts.map((p) => (
                      <option key={p.id} value={p.id} disabled={p.current_stock <= 0}>
                        {p.product_name} — {formatCurrency(p.sale_price)} (Stok: {p.current_stock} {p.unit})
                      </option>
                    ))}
                  </select>

                  <button
                    onClick={handleAddProduct}
                    disabled={!selectedProductId}
                    className="bg-brand-600 hover:bg-brand-500 text-white font-bold px-4 py-2.5 rounded-xl text-xs flex items-center gap-1.5 transition-all disabled:opacity-40"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Ekle</span>
                  </button>
                </div>
              </div>

              {/* Items Table / List */}
              <div className="space-y-2.5">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">Siparişteki Ürünler ({items.length})</span>
                <div className="border border-slate-800 rounded-xl overflow-hidden bg-slate-950 divide-y divide-slate-800/80">
                  {items.map((it) => {
                    const delta = it.quantity - it.original_quantity;
                    const itemTotal = it.quantity * it.sale_price;

                    return (
                      <div key={it.product_id} className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="space-y-0.5 flex-1">
                          <div className="font-bold text-white text-xs sm:text-sm flex items-center gap-2">
                            <span>{it.product_name}</span>
                            {delta !== 0 && (
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] font-extrabold ${
                                  delta > 0
                                    ? 'bg-amber-950 text-amber-400 border border-amber-800'
                                    : 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                                }`}
                              >
                                {delta > 0 ? `+${delta} ${it.unit}` : `${delta} ${it.unit}`}
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-slate-400">
                            Fiyat: {formatCurrency(it.sale_price)} / {it.unit}
                          </div>
                        </div>

                        {/* Controls */}
                        <div className="flex items-center gap-3 justify-between sm:justify-end">
                          {/* Qty Stepper */}
                          <div className="flex items-center gap-1 bg-slate-900 border border-slate-700 rounded-xl p-1">
                            <button
                              onClick={() => handleQuantityChange(it.product_id, it.quantity - 1)}
                              className="p-1 text-slate-400 hover:text-white rounded hover:bg-slate-800"
                            >
                              <Minus className="w-3.5 h-3.5" />
                            </button>
                            <input
                              type="number"
                              value={it.quantity}
                              onChange={(e) => handleQuantityChange(it.product_id, Number(e.target.value || 1))}
                              className="w-12 text-center bg-transparent text-xs font-bold text-white outline-none font-mono"
                            />
                            <button
                              onClick={() => handleQuantityChange(it.product_id, it.quantity + 1)}
                              className="p-1 text-slate-400 hover:text-white rounded hover:bg-slate-800"
                            >
                              <Plus className="w-3.5 h-3.5" />
                            </button>
                          </div>

                          {/* Line Total */}
                          <div className="w-24 text-right font-bold text-white text-xs">
                            {formatCurrency(itemTotal)}
                          </div>

                          {/* Trash */}
                          <button
                            onClick={() => handleRemoveItem(it.product_id)}
                            className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-rose-950/40 rounded-lg transition-colors"
                            title="Ürünü Çıkar"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                  Sipariş Notu / Güncelleme Açıklaması
                </label>
                <textarea
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Müşteri talebi notu..."
                  className="w-full bg-slate-950 border border-slate-700 focus:border-brand-500 rounded-xl p-3 text-xs text-slate-100 outline-none"
                />
              </div>

              {/* Değişiklik Özeti Accordion / Card */}
              <div className="bg-slate-950 border border-brand-900/40 p-4 rounded-xl space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-brand-300 flex items-center gap-1.5">
                    <Info className="w-4 h-4 text-brand-400" />
                    <span>DEĞİŞİKLİK ÖZETİ RAPORU</span>
                  </span>
                  <span className="text-xs font-bold text-slate-300">
                    Fark: {diffTotal > 0 ? `+${formatCurrency(diffTotal)}` : formatCurrency(diffTotal)}
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-3 text-xs text-center border-t border-slate-800 pt-3">
                  <div>
                    <span className="text-slate-500 block">Eski Toplam</span>
                    <span className="font-bold text-slate-300 block mt-0.5">{formatCurrency(oldTotal)}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Yeni Toplam</span>
                    <span className="font-bold text-white block mt-0.5">{formatCurrency(newTotal)}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Borç Etkisi</span>
                    <span className={`font-black block mt-0.5 ${diffTotal > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
                      {diffTotal > 0 ? `+${formatCurrency(diffTotal)}` : formatCurrency(diffTotal)}
                    </span>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 sm:p-5 border-t border-slate-800 flex items-center justify-between bg-slate-900">
          <button
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs transition-all"
          >
            Vazgeç
          </button>

          <button
            onClick={handleSubmitSave}
            disabled={saving || loadingItems}
            className="bg-brand-600 hover:bg-brand-500 text-white font-bold px-6 py-2.5 rounded-xl text-xs flex items-center gap-2 transition-all shadow-lg shadow-brand-600/20 active:scale-95 disabled:opacity-40"
          >
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Güncelleniyor...</span>
              </>
            ) : (
              <>
                <CheckCircle2 className="w-4 h-4" />
                <span>Siparişi Güncelle & Kaydet</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
