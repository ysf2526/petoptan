import React, { useState } from 'react';
import { X, PackagePlus } from 'lucide-react';
import { ProductUnit } from '@/types/database.types';
import { preOrderService } from '@/services/preOrderService';
import { useToast } from '@/context/ToastContext';

interface NewDemandProductModalProps {
  isOpen: boolean;
  onClose: () => void;
  onProductCreated: (product: any, quantity: number) => void;
}

export const NewDemandProductModal: React.FC<NewDemandProductModalProps> = ({
  isOpen,
  onClose,
  onProductCreated,
}) => {
  const { showToast } = useToast();
  const [productName, setProductName] = useState('');
  const [brand, setBrand] = useState('');
  const [category, setCategory] = useState('');
  const [barcode, setBarcode] = useState('');
  const [unit, setUnit] = useState<ProductUnit>('Adet');
  const [quantity, setQuantity] = useState<number>(1);
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!productName.trim()) {
      showToast('Lütfen ürün adını giriniz.', 'error');
      return;
    }
    if (quantity <= 0) {
      showToast('Geçerli bir talep miktarı giriniz.', 'error');
      return;
    }

    try {
      setLoading(true);
      const newProd = await preOrderService.createUnregisteredProduct(
        productName.trim(),
        brand.trim() || undefined,
        category.trim() || undefined,
        barcode.trim() || undefined,
        unit
      );

      showToast(`"Yeni Talep Ürünü" (${newProd.product_name}) oluşturuldu.`, 'success');
      onProductCreated(newProd, quantity);
      
      // Reset form
      setProductName('');
      setBrand('');
      setCategory('');
      setBarcode('');
      setUnit('Adet');
      setQuantity(1);
      onClose();
    } catch (err: any) {
      console.error(err);
      showToast(err.message || 'Ürün eklenirken bir hata oluştu.', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fadeIn">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden text-slate-200">
        <div className="flex items-center justify-between p-5 border-b border-slate-800 bg-slate-900/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
              <PackagePlus className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-white tracking-tight">Yeni Talep Ürünü Ekle</h3>
              <p className="text-xs text-slate-400">Stokta kayıtlı olmayan geçici/yeni ürün ekle</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div className="bg-amber-950/40 border border-amber-800/40 rounded-xl p-3.5 text-xs text-amber-300 flex items-start gap-2.5">
            <span className="text-base leading-none">💡</span>
            <p>
              Bu aşamada <strong>alış fiyatı ve tedarikçi girmek zorunlu değildir</strong>. 
              Ürün ön siparişe eklenecek ve tedarik aşamasında netleştirilecektir.
            </p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              Ürün Adı <span className="text-rose-400">*</span>
            </label>
            <input
              type="text"
              required
              placeholder="Örn: Royal Canin Mini Adult 4 KG"
              value={productName}
              onChange={(e) => setProductName(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 focus:border-brand-500 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-500 outline-none transition-colors"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Marka (Opsiyonel)
              </label>
              <input
                type="text"
                placeholder="Örn: Royal Canin"
                value={brand}
                onChange={(e) => setBrand(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 focus:border-brand-500 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-500 outline-none transition-colors"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Kategori (Opsiyonel)
              </label>
              <input
                type="text"
                placeholder="Örn: Köpek Maması"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 focus:border-brand-500 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-500 outline-none transition-colors"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Barkod (Opsiyonel)
              </label>
              <input
                type="text"
                placeholder="869..."
                value={barcode}
                onChange={(e) => setBarcode(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 focus:border-brand-500 rounded-xl px-3 py-2.5 text-sm text-white placeholder-slate-500 outline-none transition-colors"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">Birim</label>
              <select
                value={unit}
                onChange={(e) => setUnit(e.target.value as ProductUnit)}
                className="w-full bg-slate-800 border border-slate-700 focus:border-brand-500 rounded-xl px-3 py-2.5 text-sm text-white outline-none transition-colors"
              >
                <option value="Adet">Adet</option>
                <option value="Kutu">Kutu</option>
                <option value="Paket">Paket</option>
                <option value="Koli">Koli</option>
                <option value="Çuval">Çuval</option>
                <option value="Kg">Kg</option>
                <option value="Litre">Litre</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">Talep Miktarı</label>
              <input
                type="number"
                min="1"
                step="1"
                value={quantity}
                onChange={(e) => setQuantity(Math.max(1, Number(e.target.value)))}
                className="w-full bg-slate-800 border border-slate-700 focus:border-brand-500 rounded-xl px-3 py-2.5 text-sm text-white font-bold outline-none transition-colors text-center"
              />
            </div>
          </div>

          <div className="pt-3 flex items-center justify-end gap-3 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl border border-slate-700 text-slate-300 hover:bg-slate-800 font-medium text-sm transition-colors"
            >
              İptal
            </button>
            <button
              type="submit"
              disabled={loading}
              className="bg-brand-600 hover:bg-brand-500 text-white font-semibold px-5 py-2.5 rounded-xl text-sm transition-colors flex items-center gap-2 shadow-lg shadow-brand-500/20 disabled:opacity-50"
            >
              {loading ? 'Ekleniyor...' : 'Siparişe Ekle'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
