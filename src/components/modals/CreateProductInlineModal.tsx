import React, { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/context/ToastContext';
import { parseErrorMessage } from '@/utils/errors';
import { Product, ProductUnit } from '@/types/database.types';
import { X, Plus, Loader2, Package, Tag, Barcode, AlertTriangle } from 'lucide-react';

interface CreateProductInlineModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialBarcode?: string;
  onSuccess: (newProduct: Product) => void;
}

const PRODUCT_UNITS: ProductUnit[] = ['Adet', 'Kutu', 'Paket', 'Koli', 'Çuval', 'Kg', 'Litre'];

export const CreateProductInlineModal: React.FC<CreateProductInlineModalProps> = ({
  isOpen,
  onClose,
  initialBarcode = '',
  onSuccess,
}) => {
  const { showSuccess, showError } = useToast();

  const [loading, setLoading] = useState(false);

  const [productName, setProductName] = useState('');
  const [barcode, setBarcode] = useState(initialBarcode);
  const [brand, setBrand] = useState('');
  const [category, setCategory] = useState('');
  const [unit, setUnit] = useState<ProductUnit>('Adet');
  const [purchasePrice, setPurchasePrice] = useState<number | ''>('');
  const [salePrice, setSalePrice] = useState<number | ''>('');
  const [minimumStock, setMinimumStock] = useState<number>(5);

  React.useEffect(() => {
    if (isOpen) {
      setBarcode(initialBarcode);
    }
  }, [isOpen, initialBarcode]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const name = productName.trim();
    if (!name) {
      showError('Lütfen ürün adını girin.');
      return;
    }

    const pPrice = Number(purchasePrice) || 0;
    const sPrice = Number(salePrice) || 0;

    if (pPrice < 0 || sPrice < 0) {
      showError('Fiyatlar negatif olamaz.');
      return;
    }

    setLoading(true);

    try {
      // Get current authenticated user id
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;

      if (!userId) {
        showError('Kullanıcı oturumu bulunamadı.');
        setLoading(false);
        return;
      }

      // Check Duplicate Barcode
      const cleanBarcode = barcode.trim();
      if (cleanBarcode) {
        const { data: existing } = await supabase
          .from('products')
          .select('id, product_name')
          .eq('owner_id', userId)
          .eq('barcode', cleanBarcode)
          .is('deleted_at', null)
          .maybeSingle();

        if (existing) {
          showError(`Bu barkodla kayıtlı bir ürün zaten var: "${existing.product_name}"`);
          setLoading(false);
          return;
        }
      }

      // Insert new product
      const { data: newProd, error } = await supabase
        .from('products')
        .insert({
          owner_id: userId,
          product_type: 'stock',
          product_name: name,
          barcode: cleanBarcode || null,
          brand: brand.trim() || null,
          category: category.trim() || null,
          unit: unit,
          purchase_price: pPrice,
          sale_price: sPrice,
          current_stock: 0, // Stock will be added in stock intake batch
          minimum_stock: Number(minimumStock) || 5,
          show_in_catalog: true,
          active: true,
        })

        .select('*')
        .single();

      if (error) throw error;

      showSuccess(`"${newProd.product_name}" ürünü oluşturuldu ve mal girişine eklendi!`);
      onSuccess(newProd as Product);
      onClose();

      // Reset form
      setProductName('');
      setBarcode('');
      setBrand('');
      setCategory('');
      setPurchasePrice('');
      setSalePrice('');
    } catch (err: any) {
      showError(parseErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4">
      <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-md" onClick={onClose} />

      <div className="relative bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg shadow-2xl z-10 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between bg-slate-900">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-600/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <Plus className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-white">+ Hızlı Yeni Ürün Tanımla</h2>
              <p className="text-xs text-slate-400">Yeni ürünü oluşturun, anında mal kabul listesine bağlansın.</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-white rounded-lg bg-slate-800">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-4 sm:p-6 space-y-4 overflow-y-auto custom-scrollbar">
          {/* Ürün Adı */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
              Ürün Adı *
            </label>
            <input
              type="text"
              required
              value={productName}
              onChange={(e) => setProductName(e.target.value)}
              placeholder="Örn: Royal Canin Medium Adult 15 KG"
              className="w-full bg-slate-950 border border-slate-700 focus:border-emerald-500 rounded-xl p-3 text-white text-sm font-bold outline-none"
            />
          </div>

          {/* Barkod & Birim Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                Barkod (Barkod Okuyucu)
              </label>
              <input
                type="text"
                value={barcode}
                onChange={(e) => setBarcode(e.target.value)}
                placeholder="Örn: 8690000123456"
                className="w-full bg-slate-950 border border-slate-700 focus:border-emerald-500 rounded-xl p-2.5 text-slate-100 text-xs font-mono outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                Birim *
              </label>
              <select
                value={unit}
                onChange={(e) => setUnit(e.target.value as ProductUnit)}
                className="w-full bg-slate-950 border border-slate-700 focus:border-emerald-500 rounded-xl p-2.5 text-slate-100 text-xs font-bold outline-none"
              >
                {PRODUCT_UNITS.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Marka & Kategori Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                Marka
              </label>
              <input
                type="text"
                value={brand}
                onChange={(e) => setBrand(e.target.value)}
                placeholder="Örn: Royal Canin"
                className="w-full bg-slate-950 border border-slate-700 focus:border-emerald-500 rounded-xl p-2.5 text-slate-100 text-xs outline-none"
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
                placeholder="Örn: Kuru Mama"
                className="w-full bg-slate-950 border border-slate-700 focus:border-emerald-500 rounded-xl p-2.5 text-slate-100 text-xs outline-none"
              />
            </div>
          </div>

          {/* Alış & Satış Fiyatı Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-slate-950 p-3.5 rounded-xl border border-slate-800">
            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                Birim Alış Fiyatı (TL) *
              </label>
              <input
                type="number"
                step="0.01"
                min={0}
                required
                value={purchasePrice}
                onChange={(e) => setPurchasePrice(e.target.value === '' ? '' : Number(e.target.value))}
                placeholder="0.00"
                className="w-full bg-slate-900 border border-slate-700 focus:border-emerald-500 rounded-xl p-2.5 text-white text-sm font-extrabold outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                Birim Satış Fiyatı (TL) *
              </label>
              <input
                type="number"
                step="0.01"
                min={0}
                required
                value={salePrice}
                onChange={(e) => setSalePrice(e.target.value === '' ? '' : Number(e.target.value))}
                placeholder="0.00"
                className="w-full bg-slate-900 border border-slate-700 focus:border-emerald-500 rounded-xl p-2.5 text-emerald-400 text-sm font-extrabold outline-none"
              />
            </div>
          </div>

          {/* Minimum Stock Level */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
              Minimum Uarı Uyarısı Stok Miktarı
            </label>
            <input
              type="number"
              min={0}
              value={minimumStock}
              onChange={(e) => setMinimumStock(Number(e.target.value))}
              className="w-full bg-slate-950 border border-slate-700 focus:border-emerald-500 rounded-xl p-2.5 text-slate-100 text-xs outline-none"
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
              disabled={loading || !productName}
              className="py-2.5 px-6 rounded-xl bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-white font-bold text-xs shadow-lg shadow-emerald-500/25 flex items-center gap-2 transition-all disabled:opacity-50 active:scale-98"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Oluşturuluyor...</span>
                </>
              ) : (
                <>
                  <Plus className="w-4 h-4" />
                  <span>Ürünü Oluştur & Mal Girişine Ekle</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
