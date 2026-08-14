import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { parseErrorMessage } from '@/utils/errors';
import { calculateUnitProfit, calculateProfitMargin, formatCurrency } from '@/utils/formatters';
import { Product, ProductType, ProductUnit, Supplier } from '@/types/database.types';
import { SearchableSelect } from '@/components/common/SearchableSelect';
import { ImageUploadField } from '@/components/modals/ImageUploadField';
import { storageService } from '@/services/storageService';
import { X, Package, Loader2, CheckCircle2, ClipboardList, Eye } from 'lucide-react';

interface ProductModalProps {
  isOpen: boolean;
  onClose: () => void;
  productToEdit?: Product | null;
  initialProductType?: ProductType;
  onSuccess?: () => void;
}

const UNITS: ProductUnit[] = ['Adet', 'Kutu', 'Paket', 'Koli', 'Çuval', 'Kg', 'Litre'];

export const ProductModal: React.FC<ProductModalProps> = ({
  isOpen,
  onClose,
  productToEdit,
  initialProductType = 'stock',
  onSuccess,
}) => {
  const { user } = useAuth();
  const { showSuccess, showError } = useToast();

  const [loading, setLoading] = useState(false);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);

  const [productType, setProductType] = useState<ProductType>(initialProductType);
  const [productName, setProductName] = useState('');
  const [brand, setBrand] = useState('');
  const [category, setCategory] = useState('');
  const [barcode, setBarcode] = useState('');
  const [description, setDescription] = useState('');
  const [unit, setUnit] = useState<ProductUnit>('Adet');
  const [purchasePrice, setPurchasePrice] = useState<number | ''>(0);
  const [salePrice, setSalePrice] = useState<number | ''>(0);
  const [currentStock, setCurrentStock] = useState<number | ''>(0);
  const [minimumStock, setMinimumStock] = useState<number | ''>(10);
  const [supplierId, setSupplierId] = useState<string>('');
  const [showInCatalog, setShowInCatalog] = useState(true);

  // Image Upload State
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [imageRemoved, setImageRemoved] = useState(false);
  const [currentImageUrl, setCurrentImageUrl] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      // Load active suppliers
      supabase
        .from('suppliers')
        .select('*')
        .is('deleted_at', null)
        .eq('active', true)
        .then(({ data }) => setSuppliers(data || []));

      if (productToEdit) {
        setProductType(productToEdit.product_type || 'stock');
        setProductName(productToEdit.product_name || '');
        setBrand(productToEdit.brand || '');
        setCategory(productToEdit.category || '');
        setBarcode(productToEdit.barcode || '');
        setDescription(productToEdit.description || '');
        setUnit(productToEdit.unit || 'Adet');
        setPurchasePrice(productToEdit.purchase_price || 0);
        setSalePrice(productToEdit.sale_price || 0);
        setCurrentStock(productToEdit.current_stock || 0);
        setMinimumStock(productToEdit.minimum_stock || 10);
        setSupplierId(productToEdit.supplier_id || '');
        setShowInCatalog(productToEdit.show_in_catalog ?? true);
        setCurrentImageUrl(productToEdit.image_url || null);
      } else {
        setProductType(initialProductType);
        setProductName('');
        setBrand('');
        setCategory('');
        setBarcode('');
        setDescription('');
        setUnit('Adet');
        setPurchasePrice(initialProductType === 'pre_order' ? 0 : 0);
        setSalePrice(0);
        setCurrentStock(0);
        setMinimumStock(initialProductType === 'pre_order' ? 0 : 10);
        setSupplierId('');
        setShowInCatalog(true);
        setCurrentImageUrl(null);
      }
      setSelectedFile(null);
      setImageRemoved(false);
    }
  }, [isOpen, productToEdit, initialProductType]);

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
      let finalImageUrl = currentImageUrl;

      // Handle Image Removal
      if (imageRemoved && currentImageUrl) {
        await storageService.deleteProductImage(currentImageUrl);
        finalImageUrl = null;
      }

      // Handle New Image Upload
      if (selectedFile) {
        if (currentImageUrl) {
          await storageService.deleteProductImage(currentImageUrl);
        }
        finalImageUrl = await storageService.uploadProductImage(selectedFile, user.id);
      }

      const selectedSupplierObj = suppliers.find((s) => s.id === supplierId);

      const payload = {
        owner_id: user.id,
        product_type: productType,
        product_name: productName.trim(),
        brand: brand.trim() || null,
        category: category.trim() || null,
        barcode: barcode.trim() || null,
        description: description.trim() || null,
        unit,
        purchase_price: purPrice,
        sale_price: slPrice,
        current_stock: Number(currentStock || 0),
        minimum_stock: Number(minimumStock || 0),
        supplier_id: supplierId || null,
        supplier: selectedSupplierObj ? selectedSupplierObj.company_name : null,
        image_url: finalImageUrl,
        show_in_catalog: showInCatalog,
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
          details: { product_name: productName, product_type: productType, new_price: slPrice },
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
          details: { product_name: productName, product_type: productType, sale_price: slPrice },
        });

        showSuccess(
          productType === 'pre_order'
            ? '📋 Ön sipariş ürünü başarıyla eklendi.'
            : '📦 Yeni stok ürünü eklendi.'
        );
      }

      onClose();
      if (onSuccess) onSuccess();
    } catch (err) {
      showError(parseErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const isPreOrder = productType === 'pre_order';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4">
      <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md" onClick={onClose} />

      <div className="relative bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl shadow-2xl z-10 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between bg-slate-900">
          <div className="flex items-center gap-3">
            <div
              className={`w-10 h-10 rounded-xl flex items-center justify-center border ${
                isPreOrder
                  ? 'bg-amber-600/20 border-amber-500/30 text-amber-400'
                  : 'bg-brand-600/20 border-brand-500/30 text-brand-400'
              }`}
            >
              {isPreOrder ? <ClipboardList className="w-5 h-5" /> : <Package className="w-5 h-5" />}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-bold text-white">
                  {productToEdit
                    ? 'Ürün Kartını Düzenle'
                    : isPreOrder
                    ? 'Yeni Ön Sipariş Ürünü Ekle'
                    : 'Yeni Stok Ürünü Ekle'}
                </h2>
                <span
                  className={`px-2 py-0.5 rounded text-[10px] font-extrabold border ${
                    isPreOrder
                      ? 'bg-amber-950/80 text-amber-300 border-amber-800/60'
                      : 'bg-emerald-950/80 text-emerald-300 border-emerald-800/60'
                  }`}
                >
                  {isPreOrder ? '📋 ÖN SİPARİŞ ÜRÜNÜ' : '📦 STOK ÜRÜNÜ'}
                </span>
              </div>
              <p className="text-xs text-slate-400">
                {isPreOrder
                  ? 'Henüz stokta olmayan, müşterilerden talep toplanacak ürün kartı.'
                  : 'Depoda bulunan veya stok takibi yapılacak standart ürün kartı.'}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-white rounded-lg bg-slate-800">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-4 sm:p-6 overflow-y-auto space-y-4 custom-scrollbar">
          {/* Image Upload Component */}
          <ImageUploadField
            currentImageUrl={currentImageUrl}
            onImageSelected={(file) => {
              setSelectedFile(file);
              if (file) setImageRemoved(false);
            }}
            onImageRemoved={() => setImageRemoved(true)}
          />

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
                placeholder="Örn: Royal Canin Mini Adult 4 KG"
                className="w-full bg-slate-950 border border-slate-700 focus:border-brand-500 rounded-xl p-3 text-slate-100 text-sm font-semibold outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                Marka (Opsiyonel)
              </label>
              <input
                type="text"
                value={brand}
                onChange={(e) => setBrand(e.target.value)}
                placeholder="Örn: Royal Canin"
                className="w-full bg-slate-950 border border-slate-700 focus:border-brand-500 rounded-xl p-2.5 text-slate-100 text-xs outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                Kategori (Opsiyonel)
              </label>
              <input
                type="text"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="Örn: Köpek Maması"
                className="w-full bg-slate-950 border border-slate-700 focus:border-brand-500 rounded-xl p-2.5 text-slate-100 text-xs outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                Barkod Numarası (Opsiyonel)
              </label>
              <input
                type="text"
                value={barcode}
                onChange={(e) => setBarcode(e.target.value)}
                placeholder="Örn: 869012345601"
                className="w-full bg-slate-950 border border-slate-700 focus:border-brand-500 rounded-xl p-2.5 text-slate-100 text-xs font-mono outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                Birim *
              </label>
              <select
                value={unit}
                onChange={(e) => setUnit(e.target.value as ProductUnit)}
                className="w-full bg-slate-950 border border-slate-700 focus:border-brand-500 rounded-xl p-2.5 text-slate-100 text-xs outline-none"
              >
                {UNITS.map((u) => (
                  <option key={u} value={u}>{u}</option>
                ))}
              </select>
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                Ürün Açıklaması (Opsiyonel)
              </label>
              <textarea
                rows={2}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Ürün içeriği, paket gramajı veya özel notlar..."
                className="w-full bg-slate-950 border border-slate-700 focus:border-brand-500 rounded-xl p-2.5 text-slate-100 text-xs outline-none"
              />
            </div>
          </div>

          {/* Pricing & Calculated Profit Banner */}
          <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                Fiyatlandırma {isPreOrder ? '(Tahmini / Opsiyonel)' : ''}
              </h4>
              {isPreOrder && (
                <span className="text-[10px] text-amber-400 font-semibold bg-amber-950/60 px-2 py-0.5 rounded border border-amber-800/40">
                  ℹ️ Ön siparişte alış fiyatı girmek zorunlu değildir
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">
                  Alış Fiyatı (TL) {isPreOrder ? '(Opsiyonel)' : '*'}
                </label>
                <input
                  type="number"
                  step="0.01"
                  min={0}
                  required={!isPreOrder}
                  value={purchasePrice}
                  onChange={(e) => setPurchasePrice(e.target.value === '' ? '' : Number(e.target.value))}
                  placeholder={isPreOrder ? 'Belirlenmedi' : '0.00'}
                  className="w-full bg-slate-900 border border-slate-700 focus:border-brand-500 rounded-xl p-2.5 text-right font-bold text-slate-100 text-sm outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">
                  Satış Fiyatı (TL) {isPreOrder ? '(Tahmini)' : '*'}
                </label>
                <input
                  type="number"
                  step="0.01"
                  min={0}
                  required={!isPreOrder}
                  value={salePrice}
                  onChange={(e) => setSalePrice(e.target.value === '' ? '' : Number(e.target.value))}
                  placeholder="0.00"
                  className="w-full bg-slate-900 border border-slate-700 focus:border-brand-500 rounded-xl p-2.5 text-right font-bold text-white text-sm outline-none"
                />
              </div>
            </div>

            {purPrice > 0 && slPrice > 0 && (
              <div className="flex items-center justify-between pt-2 border-t border-slate-800 text-xs">
                <div>
                  <span className="text-slate-400">Tahmini Birim Kâr: </span>
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
            )}
          </div>

          {/* Stock & Supplier */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                Mevcut Stok Miktarı
              </label>
              <input
                type="number"
                step="0.01"
                min={0}
                disabled={isPreOrder && !productToEdit}
                value={isPreOrder && !productToEdit ? 0 : currentStock}
                onChange={(e) => setCurrentStock(e.target.value === '' ? '' : Number(e.target.value))}
                className={`w-full border rounded-xl p-2.5 text-xs font-bold outline-none ${
                  isPreOrder && !productToEdit
                    ? 'bg-slate-900/60 border-slate-800 text-slate-500 cursor-not-allowed'
                    : 'bg-slate-950 border-slate-700 text-slate-100'
                }`}
              />
              {isPreOrder && !productToEdit && (
                <span className="text-[10px] text-slate-500 mt-1 block">Ön sipariş ürünü 0 stokla başlar</span>
              )}
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
                className="w-full bg-slate-950 border border-slate-700 focus:border-brand-500 rounded-xl p-2.5 text-amber-400 font-bold text-xs outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                Tedarikçi Firma {isPreOrder ? '(Opsiyonel)' : ''}
              </label>
              <SearchableSelect
                options={suppliers.map((s) => ({
                  id: s.id,
                  label: s.company_name,
                  sublabel: s.contact_person || undefined,
                  searchText: `${s.phone || ''} ${s.email || ''}`,
                }))}
                value={supplierId}
                onChange={(val) => setSupplierId(val)}
                placeholder={isPreOrder ? 'Belirlenmedi (Seçilebilir)' : 'Tedarikçi seçin...'}
                searchPlaceholder="Tedarikçi ara..."
                emptyMessage="Eşleşen tedarikçi bulunamadı."
              />
            </div>
          </div>

          {/* Catalog Checkbox (Future Ready) */}
          <div className="p-3.5 bg-slate-950/80 border border-slate-800 rounded-xl flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <Eye className="w-4 h-4 text-brand-400 shrink-0" />
              <div>
                <span className="text-xs font-bold text-white block">📖 Müşteri Kataloğunda Göster</span>
                <span className="text-[10px] text-slate-400">
                  Bu ürün ileride müşterilere açık dijital katalogda listelensin mi?
                </span>
              </div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={showInCatalog}
                onChange={(e) => setShowInCatalog(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-9 h-5 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-brand-600"></div>
            </label>
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
              className={`py-2.5 px-6 rounded-xl text-white font-bold text-xs shadow-lg flex items-center gap-2 transition-all disabled:opacity-50 active:scale-98 ${
                isPreOrder
                  ? 'bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 shadow-amber-500/25'
                  : 'bg-gradient-to-r from-brand-600 to-brand-500 hover:from-brand-500 hover:to-brand-400 shadow-brand-500/25'
              }`}
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Kaydediliyor...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>{productToEdit ? 'Güncellemeyi Kaydet' : isPreOrder ? 'Ön Sipariş Ürününü Ekle' : 'Stok Ürününü Ekle'}</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
