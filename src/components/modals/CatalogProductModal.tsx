import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/context/ToastContext';
import { parseErrorMessage } from '@/utils/errors';
import { Product, ProductUnit } from '@/types/database.types';
import { catalogService } from '@/services/catalogService';
import {
  X,
  Package,
  Upload,
  Camera,
  Image as ImageIcon,
  DollarSign,
  Tag,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Eye,
  EyeOff,
} from 'lucide-react';

interface CatalogProductModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  productToEdit?: Product | null;
}

const PRODUCT_UNITS: ProductUnit[] = ['Adet', 'Kutu', 'Paket', 'Koli', 'Çuval', 'Kg', 'Litre'];
const COMMON_CATEGORIES = ['Kedi Maması', 'Köpek Maması', 'Konserve & Yaş Mama', 'Ödül & Yaş Mama', 'Kedi Kumu', 'Sağlık & Bakım', 'Aksesuar & Oyuncak'];

export const CatalogProductModal: React.FC<CatalogProductModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  productToEdit,
}) => {
  const { showSuccess, showError } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [loading, setLoading] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);

  // Form State
  const [productName, setProductName] = useState('');
  const [brand, setBrand] = useState('');
  const [category, setCategory] = useState('');
  const [unit, setUnit] = useState<ProductUnit>('Çuval');
  const [salePrice, setSalePrice] = useState<number | ''>('');
  const [purchasePrice, setPurchasePrice] = useState<number>(0);
  const [showPriceInCatalog, setShowPriceInCatalog] = useState(true);
  const [showInCatalog, setShowInCatalog] = useState(true);
  const [description, setDescription] = useState('');
  const [barcode, setBarcode] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [productType, setProductType] = useState<'pre_order' | 'stock'>('pre_order');

  useEffect(() => {
    if (isOpen) {
      if (productToEdit) {
        setProductName(productToEdit.product_name);
        setBrand(productToEdit.brand || '');
        setCategory(productToEdit.category || '');
        setUnit(productToEdit.unit || 'Çuval');
        setSalePrice(productToEdit.sale_price || 0);
        setPurchasePrice(productToEdit.purchase_price || 0);
        setShowPriceInCatalog(productToEdit.show_price_in_catalog !== false);
        setShowInCatalog(productToEdit.show_in_catalog !== false);
        setDescription(productToEdit.description || '');
        setBarcode(productToEdit.barcode || '');
        setImageUrl(productToEdit.image_url || '');
        setProductType(productToEdit.product_type || 'pre_order');
      } else {
        setProductName('');
        setBrand('');
        setCategory('');
        setUnit('Çuval');
        setSalePrice('');
        setPurchasePrice(0);
        setShowPriceInCatalog(true);
        setShowInCatalog(true);
        setDescription('');
        setBarcode('');
        setImageUrl('');
        setProductType('pre_order');
      }
    }
  }, [isOpen, productToEdit]);

  if (!isOpen) return null;

  const handleImageFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setUploadingImage(true);
      const tempId = productToEdit?.id || `new_${Date.now()}`;
      const url = await catalogService.uploadProductImage(file, tempId);
      setImageUrl(url);
      showSuccess('Ürün fotoğrafı başarıyla yüklendi.');
    } catch (err: any) {
      console.error(err);
      showError('Fotoğraf yüklenirken hata oluştu.');
    } finally {
      setUploadingImage(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!productName.trim()) {
      showError('Lütfen ürün adını giriniz.');
      return;
    }

    if (salePrice === '' || Number(salePrice) < 0) {
      showError('Geçerli bir satış fiyatı giriniz.');
      return;
    }

    setLoading(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData?.user) throw new Error('Oturum açmış kullanıcı bulunamadı.');

      const payload = {
        owner_id: userData.user.id,
        product_name: productName.trim(),
        brand: brand.trim() || null,
        category: category.trim() || null,
        unit,
        sale_price: Number(salePrice),
        purchase_price: Number(purchasePrice || 0), // Default 0 for catalog products
        show_price_in_catalog: showPriceInCatalog,
        show_in_catalog: showInCatalog,
        description: description.trim() || null,
        barcode: barcode.trim() || null,
        image_url: imageUrl.trim() || null,
        product_type: productType,
        current_stock: productType === 'pre_order' ? 0 : (productToEdit?.current_stock || 0),
        minimum_stock: productToEdit?.minimum_stock || 5,
        active: true,
        updated_at: new Date().toISOString(),
      };

      if (productToEdit) {
        const { error } = await supabase
          .from('products')
          .update(payload)
          .eq('id', productToEdit.id);

        if (error) throw error;
        showSuccess('Katalog ürünü başarıyla güncellendi.');
      } else {
        const { error } = await supabase.from('products').insert([payload]);

        if (error) throw error;
        showSuccess('Yeni katalog ürünü başarıyla eklendi.');
      }

      window.dispatchEvent(new CustomEvent('refresh-data'));
      onSuccess();
      onClose();
    } catch (err: any) {
      console.error(err);
      showError(parseErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 animate-fadeIn">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md" onClick={onClose} />

      {/* Modal Card */}
      <div className="relative bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl z-10 overflow-hidden text-slate-100">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between bg-slate-900">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-600/20 border border-purple-500/30 flex items-center justify-center text-purple-400">
              <Package className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white tracking-tight">
                {productToEdit ? 'Katalog Ürününü Düzenle' : 'Yeni Katalog Ürünü Ekle'}
              </h2>
              <p className="text-xs text-slate-400">
                Stok girişi olmadan ön sipariş kataloğuna eklenecek ürün tanımı
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-white rounded-xl bg-slate-800">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-4 sm:p-6 overflow-y-auto space-y-4 text-xs custom-scrollbar">
          {/* Product Type Toggle */}
          <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 flex items-center justify-between gap-4">
            <div>
              <span className="font-bold text-white block">Ürün Tipi ve Durumu</span>
              <span className="text-[11px] text-slate-400">
                {productType === 'pre_order' ? '📦 Ön Sipariş / Katalog Ürünü (Stok Henüz Yok)' : '🏬 Stoklu Ürün (Depoda Stok Var)'}
              </span>
            </div>

            <div className="flex items-center gap-1.5 bg-slate-900 p-1 rounded-lg border border-slate-800 font-semibold">
              <button
                type="button"
                onClick={() => setProductType('pre_order')}
                className={`px-3 py-1.5 rounded-md transition-all ${
                  productType === 'pre_order' ? 'bg-purple-600 text-white shadow' : 'text-slate-400 hover:text-white'
                }`}
              >
                Ön Sipariş
              </button>
              <button
                type="button"
                onClick={() => setProductType('stock')}
                className={`px-3 py-1.5 rounded-md transition-all ${
                  productType === 'stock' ? 'bg-brand-600 text-white shadow' : 'text-slate-400 hover:text-white'
                }`}
              >
                Stoklu Ürün
              </button>
            </div>
          </div>

          {/* Photo Upload Box */}
          <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-3">
            <label className="block text-slate-300 font-bold uppercase text-[11px]">Ürün Fotoğrafı</label>
            <div className="flex flex-col sm:flex-row items-center gap-4">
              {imageUrl ? (
                <div className="relative w-24 h-24 rounded-xl bg-slate-900 border border-slate-700 overflow-hidden shrink-0 group">
                  <img src={imageUrl} alt="Ürün Fotoğrafı" className="w-full h-full object-cover" />
                  <button
                    type="button"
                    onClick={() => setImageUrl('')}
                    className="absolute inset-0 bg-slate-950/70 text-rose-400 font-bold opacity-0 group-hover:opacity-100 transition-all flex items-center justify-center text-[10px]"
                  >
                    Kaldır
                  </button>
                </div>
              ) : (
                <div className="w-24 h-24 rounded-xl bg-slate-900 border-2 border-dashed border-slate-800 flex flex-col items-center justify-center text-slate-500 shrink-0">
                  <ImageIcon className="w-6 h-6 mb-1" />
                  <span className="text-[10px]">Fotoğraf Yok</span>
                </div>
              )}

              <div className="flex-1 space-y-2 w-full">
                <input
                  type="file"
                  ref={fileInputRef}
                  accept="image/*"
                  onChange={handleImageFileSelect}
                  className="hidden"
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={uploadingImage}
                    onClick={() => fileInputRef.current?.click()}
                    className="flex-1 bg-slate-900 hover:bg-slate-800 border border-slate-700 font-bold px-3 py-2 rounded-xl text-slate-200 flex items-center justify-center gap-1.5 transition-all"
                  >
                    {uploadingImage ? <Loader2 className="w-4 h-4 animate-spin text-purple-400" /> : <Camera className="w-4 h-4 text-purple-400" />}
                    <span>{uploadingImage ? 'Yükleniyor...' : 'Galeriden / Kameradan Seç'}</span>
                  </button>
                </div>

                <input
                  type="text"
                  value={imageUrl}
                  onChange={(e) => setImageUrl(e.target.value)}
                  placeholder="Veya görsel linki yapıştırın (https://...)"
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-[11px] text-slate-300 outline-none focus:border-purple-500"
                />
              </div>
            </div>
          </div>

          {/* Basic Fields */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-400 font-semibold mb-1">
                Ürün Adı <span className="text-rose-400">*</span>
              </label>
              <input
                type="text"
                required
                value={productName}
                onChange={(e) => setProductName(e.target.value)}
                placeholder="Örn: Royal Canin Maxi Adult 15 Kg"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-bold outline-none focus:border-purple-500"
              />
            </div>

            <div>
              <label className="block text-slate-400 font-semibold mb-1">Marka</label>
              <input
                type="text"
                value={brand}
                onChange={(e) => setBrand(e.target.value)}
                placeholder="Örn: Royal Canin"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white outline-none focus:border-purple-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-400 font-semibold mb-1">Kategori</label>
              <input
                type="text"
                list="category-suggestions"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="Örn: Kedi Maması"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white outline-none focus:border-purple-500"
              />
              <datalist id="category-suggestions">
                {COMMON_CATEGORIES.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </div>

            <div>
              <label className="block text-slate-400 font-semibold mb-1">Birim</label>
              <select
                value={unit}
                onChange={(e) => setUnit(e.target.value as ProductUnit)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white outline-none focus:border-purple-500 font-bold"
              >
                {PRODUCT_UNITS.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Pricing Section */}
          <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-slate-300 font-bold mb-1">
                  Satış Fiyatı (TL) <span className="text-rose-400">*</span>
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  required
                  value={salePrice}
                  onChange={(e) => setSalePrice(e.target.value === '' ? '' : Number(e.target.value))}
                  placeholder="0.00"
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 font-black text-emerald-400 text-sm outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-slate-400 font-semibold mb-1">
                  Tahmini Alış Fiyatı (Opsiyonel / Gizli)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={purchasePrice}
                  onChange={(e) => setPurchasePrice(Number(e.target.value))}
                  placeholder="0.00 (Müşteri Göremez)"
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-slate-300 outline-none focus:border-slate-700"
                />
                <span className="text-[10px] text-slate-500 block mt-0.5">Alış fiyatı kamuya asla sızdırılmaz.</span>
              </div>
            </div>

            {/* Catalog Visibility Toggles */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 border-t border-slate-900 pt-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showPriceInCatalog}
                  onChange={(e) => setShowPriceInCatalog(e.target.checked)}
                  className="w-4 h-4 rounded bg-slate-900 border-slate-700 text-purple-600 focus:ring-0"
                />
                <span className="text-slate-300 font-semibold">Fiyat Katalogda Gösterilsin</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showInCatalog}
                  onChange={(e) => setShowInCatalog(e.target.checked)}
                  className="w-4 h-4 rounded bg-slate-900 border-slate-700 text-purple-600 focus:ring-0"
                />
                <span className="text-slate-300 font-semibold">Katalogda Aktif Yayınlansın</span>
              </label>
            </div>
          </div>

          {/* Description / Size Details */}
          <div>
            <label className="block text-slate-400 font-semibold mb-1">Gramaj / Ölçü / Ürün Açıklaması</label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Örn: 15 Kg Çuval, Somonlu yetişkin kedi maması, yüksek protein katkılı..."
              className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-white outline-none focus:border-purple-500"
            />
          </div>

          {/* Submit Action */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 font-bold hover:bg-slate-700 transition-all"
            >
              İptal
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-6 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-extrabold shadow-lg shadow-purple-600/20 transition-all flex items-center gap-2 disabled:opacity-50"
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              <span>{productToEdit ? 'GÜNCELLE' : 'KATALOĞA EKLE'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
