import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { parseErrorMessage } from '@/utils/errors';
import { calculateUnitProfit, calculateProfitMargin, formatCurrency } from '@/utils/formatters';
import { Product, ProductUnit, Supplier } from '@/types/database.types';
import { X, Package, Loader2, CheckCircle2 } from 'lucide-react';

interface ProductModalProps {
  isOpen: boolean;
  onClose: () => void;
  productToEdit?: Product | null;
  onSuccess?: () => void;
}

const UNITS: ProductUnit[] = ['Adet', 'Kutu', 'Paket', 'Koli', 'Çuval', 'Kg', 'Litre'];

export const ProductModal: React.FC<ProductModalProps> = ({
  isOpen,
  onClose,
  productToEdit,
  onSuccess,
}) => {
  const { user } = useAuth();
  const { showSuccess, showError } = useToast();

  const [loading, setLoading] = useState(false);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);

  const [productName, setProductName] = useState('');
  const [brand, setBrand] = useState('');
  const [category, setCategory] = useState('');
  const [barcode, setBarcode] = useState('');
  const [unit, setUnit] = useState<ProductUnit>('Adet');
  const [purchasePrice, setPurchasePrice] = useState<number | ''>(0);
  const [salePrice, setSalePrice] = useState<number | ''>(0);
  const [currentStock, setCurrentStock] = useState<number | ''>(0);
  const [minimumStock, setMinimumStock] = useState<number | ''>(10);
  const [supplierId, setSupplierId] = useState<string>('');

  useEffect(() => {
    if (isOpen) {
      // Load suppliers
      supabase
        .from('suppliers')
        .select('*')
        .is('deleted_at', null)
        .eq('active', true)
        .then(({ data }) => setSuppliers(data || []));

      if (productToEdit) {
        setProductName(productToEdit.product_name || '');
        setBrand(productToEdit.brand || '');
        setCategory(productToEdit.category || '');
        setBarcode(productToEdit.barcode || '');
        setUnit(productToEdit.unit || 'Adet');
        setPurchasePrice(productToEdit.purchase_price || 0);
        setSalePrice(productToEdit.sale_price || 0);
        setCurrentStock(productToEdit.current_stock || 0);
        setMinimumStock(productToEdit.minimum_stock || 10);
        setSupplierId(productToEdit.supplier_id || '');
      } else {
        setProductName('');
        setBrand('');
        setCategory('');
        setBarcode('');
        setUnit('Adet');
        setPurchasePrice(0);
        setSalePrice(0);
        setCurrentStock(0);
        setMinimumStock(10);
        setSupplierId('');
      }
    }
  }, [isOpen, productToEdit]);

  if (!isOpen) return null;

  const purPrice = Number(purchasePrice || 0);
  const slPrice = Number(salePrice || 0);
  const unitProfit = calculateUnitProfit(purPrice, slPrice);
  const profitMargin = calculateProfitMargin(purPrice, slPrice);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!user) return;
    if (!productName.trim()) {
      showError('Lütfen ürün adını girin.');
      return;
    }

    setLoading(true);

    try {
      const selectedSupplierObj = suppliers.find((s) => s.id === supplierId);

      const payload = {
        owner_id: user.id,
        product_name: productName.trim(),
        brand: brand.trim() || null,
        category: category.trim() || null,
        barcode: barcode.trim() || null,
        unit,
        purchase_price: purPrice,
        sale_price: slPrice,
        current_stock: Number(currentStock || 0),
        minimum_stock: Number(minimumStock || 10),
        supplier_id: supplierId || null,
        supplier: selectedSupplierObj ? selectedSupplierObj.company_name : null,
        updated_at: new Date().toISOString(),
      };

      if (productToEdit) {
        const { error } = await supabase.from('products').update(payload).eq('id', productToEdit.id);
        if (error) throw error;

        await supabase.from('audit_logs').insert({
          owner_id: user.id,
          action: 'UPDATE_PRODUCT',
          entity_type: 'products',
          entity_id: productToEdit.id,
          details: { product_name: productName, old_price: productToEdit.sale_price, new_price: slPrice },
        });

        showSuccess('Ürün bilgileri başarıyla güncellendi.');
      } else {
        const { data: newProd, error } = await supabase.from('products').insert([payload]).select().single();
        if (error) throw error;

        await supabase.from('audit_logs').insert({
          owner_id: user.id,
          action: 'CREATE_PRODUCT',
          entity_type: 'products',
          entity_id: newProd.id,
          details: { product_name: productName, sale_price: slPrice },
        });

        showSuccess('Yeni ürün kartı eklendi.');
      }

      onClose();
      if (onSuccess) onSuccess();
    } catch (err) {
      showError(parseErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4">
      <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md" onClick={onClose} />

      <div className="relative bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl shadow-2xl z-10 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between bg-slate-900">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-600/20 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <Package className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-white">
                {productToEdit ? 'Ürün Kartını Düzenle' : 'Yeni Ürün Kartı Ekle'}
              </h2>
              <p className="text-xs text-slate-400">Ürün alış/satış fiyatlarını ve minimum stok seviyesini belirleyin.</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-white rounded-lg bg-slate-800">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-4 sm:p-6 overflow-y-auto space-y-4 custom-scrollbar">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                Ürün Adı *
              </label>
              <input
                type="text"
                required
                value={productName}
                onChange={(e) => setProductName(e.target.value)}
                placeholder="Örn: Royal Canin Adult Medium 15 KG"
                className="w-full bg-slate-950 border border-slate-700 focus:border-amber-500 rounded-xl p-3 text-slate-100 text-sm font-semibold outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                Marka
              </label>
              <input
                type="text"
                value={brand}
                onChange={(e) => setBrand(e.target.value)}
                placeholder="Örn: Royal Canin"
                className="w-full bg-slate-950 border border-slate-700 focus:border-amber-500 rounded-xl p-2.5 text-slate-100 text-xs outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                Kategori
              </label>
              <input
                type="text"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="Örn: Köpek Maması"
                className="w-full bg-slate-950 border border-slate-700 focus:border-amber-500 rounded-xl p-2.5 text-slate-100 text-xs outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                Barkod Numarası
              </label>
              <input
                type="text"
                value={barcode}
                onChange={(e) => setBarcode(e.target.value)}
                placeholder="Örn: 869012345601"
                className="w-full bg-slate-950 border border-slate-700 focus:border-amber-500 rounded-xl p-2.5 text-slate-100 text-xs font-mono outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                Birim *
              </label>
              <select
                value={unit}
                onChange={(e) => setUnit(e.target.value as ProductUnit)}
                className="w-full bg-slate-950 border border-slate-700 focus:border-amber-500 rounded-xl p-2.5 text-slate-100 text-xs outline-none"
              >
                {UNITS.map((u) => (
                  <option key={u} value={u}>{u}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Pricing & Calculated Profit Banner */}
          <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-3">
            <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider">Fiyatlandırma & Otomatik Kâr Hesabı</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">Alış Fiyatı (TL) *</label>
                <input
                  type="number"
                  step="0.01"
                  min={0}
                  required
                  value={purchasePrice}
                  onChange={(e) => setPurchasePrice(e.target.value === '' ? '' : Number(e.target.value))}
                  className="w-full bg-slate-900 border border-slate-700 focus:border-amber-500 rounded-xl p-2.5 text-right font-bold text-slate-100 text-sm outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">Satış Fiyatı (TL) *</label>
                <input
                  type="number"
                  step="0.01"
                  min={0}
                  required
                  value={salePrice}
                  onChange={(e) => setSalePrice(e.target.value === '' ? '' : Number(e.target.value))}
                  className="w-full bg-slate-900 border border-slate-700 focus:border-amber-500 rounded-xl p-2.5 text-right font-bold text-white text-sm outline-none"
                />
              </div>
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-slate-800 text-xs">
              <div>
                <span className="text-slate-400">Hesaplanan Birim Kâr: </span>
                <span className={`font-extrabold ${unitProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {formatCurrency(unitProfit)}
                </span>
              </div>
              <div>
                <span className="text-slate-400">Kâr Oranı: </span>
                <span className={`font-extrabold ${profitMargin >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  %{profitMargin}
                </span>
              </div>
            </div>
          </div>

          {/* Stock Levels */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                Mevcut Stok Miktarı
              </label>
              <input
                type="number"
                step="0.01"
                min={0}
                value={currentStock}
                onChange={(e) => setCurrentStock(e.target.value === '' ? '' : Number(e.target.value))}
                className="w-full bg-slate-950 border border-slate-700 focus:border-amber-500 rounded-xl p-2.5 text-slate-100 font-bold text-xs outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                Minimum Stok (Kritik)
              </label>
              <input
                type="number"
                step="0.01"
                min={0}
                value={minimumStock}
                onChange={(e) => setMinimumStock(e.target.value === '' ? '' : Number(e.target.value))}
                className="w-full bg-slate-950 border border-slate-700 focus:border-amber-500 rounded-xl p-2.5 text-amber-400 font-bold text-xs outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                Tedarikçi Firma
              </label>
              <select
                value={supplierId}
                onChange={(e) => setSupplierId(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 focus:border-amber-500 rounded-xl p-2.5 text-slate-100 text-xs outline-none"
              >
                <option value="">-- Tedarikçi Yok --</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>{s.company_name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Footer Actions */}
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
              disabled={loading}
              className="py-2.5 px-6 rounded-xl bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 text-white font-bold text-xs shadow-lg shadow-amber-500/25 flex items-center gap-2 transition-all disabled:opacity-50 active:scale-98"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Kaydediliyor...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>{productToEdit ? 'Güncellemeyi Kaydet' : 'Ürünü Ekle'}</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
