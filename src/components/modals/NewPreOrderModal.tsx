import React, { useState, useEffect } from 'react';
import { 
  X, 
  Plus, 
  Trash2, 
  Search, 
  PlusCircle, 
  Check, 
  Minus, 
  FileText,
  UserCheck,
  MessageSquare
} from 'lucide-react';
import { Customer, Product } from '@/types/database.types';
import { supabase } from '@/lib/supabase';
import { preOrderService } from '@/services/preOrderService';
import { openWhatsAppWeb, buildPreOrderWhatsAppMessage } from '@/services/whatsappService';
import { useToast } from '@/context/ToastContext';
import { NewDemandProductModal } from './NewDemandProductModal';
import { formatCurrency } from '@/utils/formatters';

interface NewPreOrderModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  initialCustomerId?: string;
}

interface SelectedItem {
  product_id?: string | null;
  product_name: string;
  brand?: string | null;
  category?: string | null;
  unit: string;
  quantity: number;
  estimated_sale_price: number;
}

export const NewPreOrderModal: React.FC<NewPreOrderModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  initialCustomerId,
}) => {
  const { showToast } = useToast();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [selectedItems, setSelectedItems] = useState<SelectedItem[]>([]);
  const [productSearch, setProductSearch] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [isDemandModalOpen, setIsDemandModalOpen] = useState<boolean>(false);

  useEffect(() => {
    if (isOpen) {
      fetchCustomers();
      fetchProducts();
      if (initialCustomerId) {
        setSelectedCustomerId(initialCustomerId);
      }
    }
  }, [isOpen, initialCustomerId]);

  const fetchCustomers = async () => {
    const { data } = await supabase
      .from('customers')
      .select('*')
      .is('deleted_at', null)
      .eq('active', true)
      .order('business_name');
    setCustomers(data || []);
  };

  const fetchProducts = async () => {
    const { data } = await supabase
      .from('products')
      .select('*')
      .is('deleted_at', null)
      .order('product_name');
    setProducts(data || []);
  };

  if (!isOpen) return null;

  const handleAddProduct = (prod: Product) => {
    const existingIndex = selectedItems.findIndex((i) => i.product_id === prod.id);
    if (existingIndex > -1) {
      const updated = [...selectedItems];
      updated[existingIndex].quantity += 1;
      setSelectedItems(updated);
    } else {
      setSelectedItems([
        ...selectedItems,
        {
          product_id: prod.id,
          product_name: prod.product_name,
          brand: prod.brand,
          category: prod.category,
          unit: prod.unit || 'Adet',
          quantity: 1,
          estimated_sale_price: prod.sale_price || 0,
        },
      ]);
    }
    setProductSearch('');
  };

  const handleUnregisteredProductCreated = (newProd: Product, qty: number) => {
    setProducts((prev) => [newProd, ...prev]);
    setSelectedItems((prev) => [
      ...prev,
      {
        product_id: newProd.id,
        product_name: newProd.product_name,
        brand: newProd.brand,
        category: newProd.category,
        unit: newProd.unit || 'Adet',
        quantity: qty,
        estimated_sale_price: newProd.sale_price || 0,
      },
    ]);
  };

  const updateQuantity = (index: number, delta: number) => {
    const updated = [...selectedItems];
    const newQty = updated[index].quantity + delta;
    if (newQty <= 0) {
      updated.splice(index, 1);
    } else {
      updated[index].quantity = newQty;
    }
    setSelectedItems(updated);
  };

  const updatePrice = (index: number, price: number) => {
    const updated = [...selectedItems];
    updated[index].estimated_sale_price = Math.max(0, price);
    setSelectedItems(updated);
  };

  const removeItem = (index: number) => {
    const updated = [...selectedItems];
    updated.splice(index, 1);
    setSelectedItems(updated);
  };

  const filteredProducts = products.filter((p) => {
    if (!productSearch.trim()) return false;
    const term = productSearch.toLowerCase();
    return (
      p.product_name.toLowerCase().includes(term) ||
      (p.brand && p.brand.toLowerCase().includes(term)) ||
      (p.barcode && p.barcode.includes(term))
    );
  });

  const estimatedTotal = selectedItems.reduce(
    (sum, item) => sum + item.quantity * item.estimated_sale_price,
    0
  );

  const handleSubmit = async (sendWhatsapp: boolean = false) => {
    if (!selectedCustomerId) {
      showToast('Lütfen bir müşteri seçiniz.', 'error');
      return;
    }
    if (selectedItems.length === 0) {
      showToast('En az 1 ürün kalemi eklemelisiniz.', 'error');
      return;
    }

    try {
      setLoading(true);
      const itemsToSubmit = selectedItems.map((item) => ({
        product_id: item.product_id || undefined,
        product_name: item.product_name,
        brand: item.brand || undefined,
        category: item.category || undefined,
        unit: item.unit,
        quantity: item.quantity,
        estimated_sale_price: item.estimated_sale_price,
      }));

      const res = await preOrderService.createPreOrder(
        selectedCustomerId,
        notes.trim(),
        itemsToSubmit
      );

      showToast(`Ön Sipariş (${res.order_number}) başarıyla oluşturuldu!`, 'success');

      if (sendWhatsapp) {
        const customer = customers.find((c) => c.id === selectedCustomerId);
        if (customer && customer.phone) {
          const msgItems = selectedItems.map((i) => ({
            product_name: i.product_name,
            demanded_quantity: i.quantity,
            unit: i.unit,
          }));
          const msg = buildPreOrderWhatsAppMessage(
            customer.business_name,
            res.order_number,
            msgItems,
            notes
          );
          openWhatsAppWeb(customer.phone, msg);
        } else {
          showToast('Müşteriye ait geçerli telefon numarası bulunamadı.', 'warning');
        }
      }

      onSuccess();
      onClose();
    } catch (err: any) {
      console.error(err);
      showToast(err.message || 'Ön sipariş kaydedilirken bir hata oluştu.', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-sm animate-fadeIn overflow-y-auto">
        <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden text-slate-200 my-auto">
          {/* Header */}
          <div className="flex items-center justify-between p-4 sm:p-5 border-b border-slate-800 bg-slate-900/50">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-brand-500/10 border border-brand-500/20 flex items-center justify-center text-brand-400 font-bold">
                📋
              </div>
              <div>
                <h2 className="font-bold text-white tracking-tight text-base sm:text-lg">
                  Yeni Ön Sipariş / Talep Al
                </h2>
                <p className="text-xs text-slate-400">
                  Stoktan düşmeden müşteri talebini kaydet
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
            {/* 1. Müşteri Seçimi */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5 flex items-center gap-1.5">
                <UserCheck className="w-3.5 h-3.5 text-brand-400" />
                Müşteri Seçin <span className="text-rose-400">*</span>
              </label>
              <select
                value={selectedCustomerId}
                onChange={(e) => setSelectedCustomerId(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 focus:border-brand-500 rounded-xl px-4 py-3 text-sm text-white outline-none transition-colors"
              >
                <option value="">-- Müşteri Seçiniz --</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.business_name} {c.contact_name ? `(${c.contact_name})` : ''}
                  </option>
                ))}
              </select>
            </div>

            {/* 2. Ürün Arama & "+ Ürün/Talep Ekle" */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-semibold text-slate-300">
                  Ürün Ekle / Ara
                </label>
                <button
                  type="button"
                  onClick={() => setIsDemandModalOpen(true)}
                  className="text-xs text-amber-400 hover:text-amber-300 font-semibold flex items-center gap-1 bg-amber-950/40 border border-amber-800/40 px-2.5 py-1 rounded-lg transition-all"
                >
                  <PlusCircle className="w-3.5 h-3.5" />
                  + Kayıtsız Ürün/Talep Ekle
                </button>
              </div>

              <div className="relative">
                <Search className="w-4 h-4 absolute left-3.5 top-3.5 text-slate-500" />
                <input
                  type="text"
                  placeholder="Mevcut ürünlerde ara (İsim, Marka, Barkod)..."
                  value={productSearch}
                  onChange={(e) => setProductSearch(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 focus:border-brand-500 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder-slate-500 outline-none transition-colors"
                />
              </div>

              {/* Product Search Dropdown Results */}
              {productSearch.trim().length > 0 && (
                <div className="mt-2 bg-slate-800 border border-slate-700 rounded-xl max-h-48 overflow-y-auto divide-y divide-slate-700/50 shadow-xl">
                  {filteredProducts.length === 0 ? (
                    <div className="p-3 text-center text-xs text-slate-400">
                      Ürün bulunamadı.{' '}
                      <button
                        type="button"
                        onClick={() => {
                          setIsDemandModalOpen(true);
                        }}
                        className="text-amber-400 underline font-semibold ml-1"
                      >
                        Tıkla ve Yeni Talep Ürünü Ekle
                      </button>
                    </div>
                  ) : (
                    filteredProducts.map((p) => (
                      <div
                        key={p.id}
                        onClick={() => handleAddProduct(p)}
                        className="p-3 hover:bg-slate-700/60 cursor-pointer flex items-center justify-between transition-colors text-xs"
                      >
                        <div>
                          <p className="font-semibold text-white">{p.product_name}</p>
                          <p className="text-[11px] text-slate-400">
                            {p.brand || 'Markasız'} • Mevcut Stok: {p.current_stock} {p.unit}
                          </p>
                        </div>
                        <span className="bg-brand-500/20 text-brand-300 font-semibold px-2 py-1 rounded-md text-[11px]">
                          + Ekle
                        </span>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>

            {/* 3. Eklenen Ürünler Listesi */}
            <div className="space-y-2">
              <label className="block text-xs font-semibold text-slate-300">
                Sipariş Kalemleri ({selectedItems.length})
              </label>

              {selectedItems.length === 0 ? (
                <div className="p-6 border border-dashed border-slate-800 rounded-xl text-center text-slate-500 text-xs">
                  Henüz ürün eklenmedi. Yukarıdaki arama kutusundan ürün seçin veya kayıtsız ürün talebi oluşturun.
                </div>
              ) : (
                <div className="space-y-2">
                  {selectedItems.map((item, idx) => (
                    <div
                      key={idx}
                      className="bg-slate-800/80 border border-slate-700/80 rounded-xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm text-white truncate">
                          {item.product_name}
                        </p>
                        <p className="text-xs text-slate-400">
                          {item.brand ? `${item.brand} • ` : ''}Birim: {item.unit}
                        </p>
                      </div>

                      <div className="flex items-center justify-between sm:justify-end gap-3">
                        {/* Miktar Stepper Controls [-] 5 [+] */}
                        <div className="flex items-center bg-slate-900 rounded-lg border border-slate-700 p-1">
                          <button
                            type="button"
                            onClick={() => updateQuantity(idx, -1)}
                            className="w-7 h-7 flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800 rounded transition-colors"
                          >
                            <Minus className="w-3.5 h-3.5" />
                          </button>
                          <span className="w-9 text-center text-sm font-bold text-white">
                            {item.quantity}
                          </span>
                          <button
                            type="button"
                            onClick={() => updateQuantity(idx, 1)}
                            className="w-7 h-7 flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800 rounded transition-colors"
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        {/* Tahmini Fiyat Input */}
                        <div className="w-28">
                          <input
                            type="number"
                            placeholder="Tahm. Fiyat"
                            min="0"
                            step="0.01"
                            value={item.estimated_sale_price || ''}
                            onChange={(e) => updatePrice(idx, Number(e.target.value))}
                            className="w-full bg-slate-900 border border-slate-700 focus:border-brand-500 rounded-lg px-2.5 py-1.5 text-xs text-right text-white font-medium outline-none"
                          />
                        </div>

                        <button
                          type="button"
                          onClick={() => removeItem(idx)}
                          className="p-1.5 text-rose-400 hover:bg-rose-950/40 rounded-lg transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Estimated Total Display */}
            {estimatedTotal > 0 && (
              <div className="flex justify-between items-center p-3 bg-slate-800/40 border border-slate-800 rounded-xl text-xs">
                <span className="text-slate-400">Tahmini Toplam Tutarı:</span>
                <span className="text-sm font-bold text-emerald-400">
                  {formatCurrency(estimatedTotal)}
                </span>
              </div>
            )}

            {/* 4. Sipariş Notu */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5 flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-slate-400" />
                Sipariş Notu (Opsiyonel)
              </label>
              <input
                type="text"
                placeholder="Örn: Cumaya kadar lazım, acil teslimat isteniyor..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 focus:border-brand-500 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-500 outline-none transition-colors"
              />
            </div>
          </div>

          {/* Footer Buttons */}
          <div className="p-4 sm:p-5 border-t border-slate-800 bg-slate-900/50 flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="text-xs text-slate-400">
              * Stok veya finansal borç yazılmayacaktır.
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              <button
                type="button"
                onClick={() => handleSubmit(true)}
                disabled={loading || selectedItems.length === 0}
                className="flex-1 sm:flex-none bg-emerald-600 hover:bg-emerald-500 text-white font-semibold px-4 py-2.5 rounded-xl text-xs sm:text-sm transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50"
                title="Kaydet ve WhatsApp ile Bilgilendir"
              >
                <MessageSquare className="w-4 h-4" />
                <span>Kaydet + WhatsApp</span>
              </button>

              <button
                type="button"
                onClick={() => handleSubmit(false)}
                disabled={loading || selectedItems.length === 0}
                className="flex-1 sm:flex-none bg-brand-600 hover:bg-brand-500 text-white font-semibold px-5 py-2.5 rounded-xl text-xs sm:text-sm transition-colors flex items-center justify-center gap-2 shadow-lg shadow-brand-500/20 disabled:opacity-50"
              >
                <Check className="w-4 h-4" />
                <span>{loading ? 'Kaydediliyor...' : 'Ön Siparişi Kaydet'}</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      <NewDemandProductModal
        isOpen={isDemandModalOpen}
        onClose={() => setIsDemandModalOpen(false)}
        onProductCreated={handleUnregisteredProductCreated}
      />
    </>
  );
};
