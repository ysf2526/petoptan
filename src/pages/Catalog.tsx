import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { Product, Profile } from '@/types/database.types';
import { catalogPdfService } from '@/services/catalogPdfService';
import { formatCurrency } from '@/utils/formatters';
import { useToast } from '@/context/ToastContext';
import { CatalogProductModal } from '@/components/modals/CatalogProductModal';
import {
  Package,
  Plus,
  Search,
  Download,
  MessageCircle,
  Loader2,
  Edit2,
  Eye,
  EyeOff,
  CheckCircle2,
  FileText,
  RefreshCw,
  Sparkles,
} from 'lucide-react';

export const Catalog: React.FC = () => {
  const { showSuccess, showError } = useToast();

  const [loading, setLoading] = useState(true);
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null);
  const [pdfFilename, setPdfFilename] = useState<string>('Urun_Katalogu.pdf');
  const [totalCatalogProducts, setTotalCatalogProducts] = useState(0);

  const [products, setProducts] = useState<Product[]>([]);
  const [profile, setProfile] = useState<Profile | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<'ALL' | 'CATALOG' | 'HIDDEN'>('ALL');

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);

  const fetchCatalogData = useCallback(async () => {
    setLoading(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData?.user) return;

      // 1. Fetch Profile
      const { data: profData } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userData.user.id)
        .single();
      setProfile(profData || null);

      // 2. Fetch Products
      const { data: pData } = await supabase
        .from('products')
        .select('*')
        .is('deleted_at', null)
        .order('category', { ascending: true })
        .order('product_name', { ascending: true });

      setProducts(pData || []);
    } catch (err: any) {
      console.error(err);
      showError('Katalog verileri yüklenirken hata oluştu.');
    } finally {
      setLoading(false);
    }
  }, [showError]);

  const generatePreviewPdf = useCallback(async () => {
    setGeneratingPdf(true);
    try {
      const { blob, filename, totalProducts } = await catalogPdfService.generateCatalogPdfBlob();
      const url = URL.createObjectURL(blob);
      setPdfPreviewUrl(url);
      setPdfFilename(filename);
      setTotalCatalogProducts(totalProducts);
    } catch (err: any) {
      console.error(err);
      // Don't alert if no catalog products marked yet
      if (err.message?.includes('Katalogda gösterilmek üzere')) {
        setPdfPreviewUrl(null);
      } else {
        showError(err.message || 'PDF oluşturulurken hata oluştu.');
      }
    } finally {
      setGeneratingPdf(false);
    }
  }, [showError]);

  useEffect(() => {
    fetchCatalogData().then(() => {
      generatePreviewPdf();
    });
  }, [fetchCatalogData, generatePreviewPdf]);

  const handleDownloadPdf = async () => {
    setGeneratingPdf(true);
    try {
      await catalogPdfService.downloadCatalogPdf();
      showSuccess('Katalog PDF dosyası başarıyla indirildi.');
    } catch (err: any) {
      showError(err.message || 'PDF indirme hatası.');
    } finally {
      setGeneratingPdf(false);
    }
  };

  const handleShareWhatsApp = async () => {
    setGeneratingPdf(true);
    try {
      await catalogPdfService.downloadCatalogPdf();
      const bName = profile?.business_name || 'PetOptan';
      const msg = `Merhaba, ${bName} güncel toptan ürün kataloğumuz ektedir. Kataloğumuzu inceleyebilir ve siparişlerinizi iletebilirsiniz.`;
      window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank');
      showSuccess('PDF kopyalandı, WhatsApp açıldı.');
    } catch (err: any) {
      showError(err.message || 'Hata oluştu.');
    } finally {
      setGeneratingPdf(false);
    }
  };

  const handleToggleShowInCatalog = async (prod: Product) => {
    try {
      const updatedVal = !prod.show_in_catalog;
      const { error } = await supabase
        .from('products')
        .update({ show_in_catalog: updatedVal, updated_at: new Date().toISOString() })
        .eq('id', prod.id);

      if (error) throw error;
      setProducts((prev) => prev.map((p) => (p.id === prod.id ? { ...p, show_in_catalog: updatedVal } : p)));
      showSuccess(`"${prod.product_name}" ${updatedVal ? 'kataloğa eklendi' : 'katalogdan gizlendi'}.`);
      generatePreviewPdf();
    } catch (err: any) {
      showError(err.message || 'Güncelleme hatası.');
    }
  };

  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      const matchesSearch =
        p.product_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (p.brand && p.brand.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (p.category && p.category.toLowerCase().includes(searchQuery.toLowerCase()));

      if (!matchesSearch) return false;

      if (filterType === 'CATALOG') return p.show_in_catalog;
      if (filterType === 'HIDDEN') return !p.show_in_catalog;

      return true;
    });
  }, [products, searchQuery, filterType]);

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-6 animate-fadeIn pb-24">
      {/* Top Banner */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-slate-900 border border-purple-900/60 p-4 sm:p-6 rounded-2xl shadow-xl">
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="px-2.5 py-1 rounded-lg bg-purple-600/20 text-purple-400 text-[10px] sm:text-xs font-black border border-purple-500/30">
              PROFESYONEL B2B PDF KATALOG
            </span>
            <h1 className="text-lg sm:text-2xl font-black text-white tracking-tight">
              ÜRÜN KATALOĞU (PDF GENERATOR)
            </h1>
          </div>
          <p className="text-xs text-slate-400 max-w-xl">
            Tüm ürünlerinizden otomatik olarak yüksek çözünürlüklü A4 formatında profesyonel PDF ürün kataloğu üretin ve müşterilerinize gönderin.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center gap-2.5">
          <button
            onClick={generatePreviewPdf}
            disabled={generatingPdf}
            className="w-full sm:w-auto justify-center bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-bold px-3.5 py-2.5 rounded-xl text-xs flex items-center gap-1.5 transition-all"
            title="Kataloğu Yenile"
          >
            <RefreshCw className={`w-4 h-4 text-purple-400 ${generatingPdf ? 'animate-spin' : ''}`} />
            <span>Kataloğu Yenile</span>
          </button>

          <button
            onClick={handleShareWhatsApp}
            disabled={generatingPdf}
            className="w-full sm:w-auto justify-center bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold px-4 py-2.5 rounded-xl text-xs sm:text-sm flex items-center gap-2 shadow-lg shadow-emerald-600/20 transition-all active:scale-95 disabled:opacity-50"
          >
            <MessageCircle className="w-4.5 h-4.5" />
            <span>WHATSAPP'TAN GÖNDER</span>
          </button>

          <button
            onClick={handleDownloadPdf}
            disabled={generatingPdf}
            className="w-full sm:w-auto justify-center bg-purple-600 hover:bg-purple-500 text-white font-extrabold px-4 py-2.5 rounded-xl text-xs sm:text-sm flex items-center gap-2 shadow-lg shadow-purple-600/20 transition-all active:scale-95 disabled:opacity-50"
          >
            {generatingPdf ? <Loader2 className="w-4.5 h-4.5 animate-spin" /> : <Download className="w-4.5 h-4.5" />}
            <span>📄 PDF KATALOĞU İNDİR</span>
          </button>
        </div>
      </div>

      {/* PDF PREVIEW BOX & STATS */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: PDF Interactive Previewer */}
        <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col space-y-3 shadow-xl">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-purple-400" />
              <h3 className="font-extrabold text-white text-sm">Canlı PDF Katalog Önizleme</h3>
            </div>

            <span className="text-xs font-mono font-bold text-slate-400 bg-slate-950 px-2.5 py-1 rounded-lg border border-slate-800">
              {totalCatalogProducts} Ürün Katalogda
            </span>
          </div>

          <div className="w-full h-[450px] sm:h-[600px] bg-slate-950 rounded-xl overflow-hidden border border-slate-800 flex flex-col items-center justify-center relative">
            {generatingPdf ? (
              <div className="flex flex-col items-center gap-2 text-slate-400">
                <Loader2 className="w-8 h-8 animate-spin text-purple-500" />
                <span className="text-xs font-bold">Profesyonel PDF Katalog Oluşturuluyor...</span>
              </div>
            ) : pdfPreviewUrl ? (
              <iframe
                src={`${pdfPreviewUrl}#toolbar=1&navpanes=0`}
                className="w-full h-full border-none rounded-xl"
                title="Katalog PDF Önizleme"
              />
            ) : (
              <div className="p-8 text-center text-xs text-slate-500 space-y-2">
                <Package className="w-10 h-10 mx-auto text-slate-600 mb-1" />
                <p className="font-bold text-slate-400">Henüz katalogda gösterilecek ürün seçilmedi.</p>
                <p className="text-[11px] text-slate-500">
                  Aşağıdaki listeden ürünlerin yanındaki "Katalogda Göster" kutucuğunu işaretleyin.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Right: Quick Info & Rules */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4 shadow-xl">
          <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
            <Sparkles className="w-5 h-5 text-amber-400" />
            <h3 className="font-extrabold text-white text-sm">PDF Katalog Standartları</h3>
          </div>

          <div className="space-y-3 text-xs text-slate-300">
            <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 space-y-1">
              <span className="font-bold text-purple-400 block">🎨 Marka & Kapak Tasarımı</span>
              <p className="text-slate-400 text-[11px]">
                Profilinizdeki <strong className="text-white">{profile?.business_name || 'İşletme Adı'}</strong>, telefon ve adres bilgileri otomatik olarak profesyonel kapağa yerleştirilir.
              </p>
            </div>

            <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 space-y-1">
              <span className="font-bold text-emerald-400 block">🔒 %100 Finansal Gizlilik</span>
              <p className="text-slate-400 text-[11px]">
                Alış fiyatı, tedarikçi, kâr marjı ve işletme içi gizli veriler PDF kataloğuna **KESİNLİKLE YANSITILMAZ**.
              </p>
            </div>

            <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 space-y-1">
              <span className="font-bold text-sky-400 block">📑 A4 Çok Sayfalı Düzet</span>
              <p className="text-slate-400 text-[11px]">
                Ürünler kategorilere göre sıralanır, her sayfaya tam 6 ürün kartı sığdırılarak sayfa numaralarıyla derlenir.
              </p>
            </div>

            <button
              onClick={() => {
                setEditingProduct(null);
                setIsModalOpen(true);
              }}
              className="w-full bg-purple-600 hover:bg-purple-500 text-white font-extrabold py-3 rounded-xl text-xs flex items-center justify-center gap-2 shadow-lg shadow-purple-600/20 transition-all"
            >
              <Plus className="w-4 h-4" />
              <span>+ YENİ KATALOG ÜRÜNÜ EKLE</span>
            </button>
          </div>
        </div>
      </div>

      {/* PRODUCTS SELECTION LIST */}
      <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl space-y-4 shadow-xl">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 border-b border-slate-800 pb-4">
          <div className="relative w-full sm:w-80">
            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Ürün adı, marka veya kategori ara..."
              className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-4 py-2 text-xs text-white placeholder-slate-500 outline-none focus:border-purple-500"
            />
          </div>

          <div className="flex items-center gap-1.5 text-xs">
            <button
              onClick={() => setFilterType('ALL')}
              className={`px-3 py-1.5 rounded-lg font-bold transition-all ${
                filterType === 'ALL' ? 'bg-purple-600 text-white' : 'bg-slate-950 text-slate-400 hover:text-white'
              }`}
            >
              Tüm Ürünler ({products.length})
            </button>

            <button
              onClick={() => setFilterType('CATALOG')}
              className={`px-3 py-1.5 rounded-lg font-bold transition-all ${
                filterType === 'CATALOG' ? 'bg-purple-600 text-white' : 'bg-slate-950 text-slate-400 hover:text-white'
              }`}
            >
              Katalogda Gösterilenler ({products.filter((p) => p.show_in_catalog).length})
            </button>

            <button
              onClick={() => setFilterType('HIDDEN')}
              className={`px-3 py-1.5 rounded-lg font-bold transition-all ${
                filterType === 'HIDDEN' ? 'bg-purple-600 text-white' : 'bg-slate-950 text-slate-400 hover:text-white'
              }`}
            >
              Gizlenenler
            </button>
          </div>
        </div>

        {filteredProducts.length === 0 ? (
          <div className="p-12 text-center text-xs text-slate-500">
            Kriterlere uygun ürün bulunamadı. Sağa üstteki "+ Yeni Katalog Ürünü Ekle" butonunu kullanabilirsiniz.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredProducts.map((p) => (
              <div
                key={p.id}
                className={`bg-slate-950 border p-4 rounded-xl space-y-3 relative hover:border-slate-700 transition-all flex flex-col justify-between ${
                  p.show_in_catalog ? 'border-purple-900/80 shadow-md' : 'border-slate-800 opacity-70'
                }`}
              >
                <div className="flex items-start gap-3">
                  {p.image_url ? (
                    <img
                      src={p.image_url}
                      alt={p.product_name}
                      className="w-14 h-14 rounded-xl object-cover bg-slate-900 border border-slate-800 shrink-0"
                    />
                  ) : (
                    <div className="w-14 h-14 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-center text-slate-600 shrink-0">
                      <Package className="w-6 h-6" />
                    </div>
                  )}

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1">
                      {p.brand && (
                        <span className="text-[10px] font-extrabold uppercase text-purple-400 truncate">
                          {p.brand}
                        </span>
                      )}
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-900 text-slate-400 border border-slate-800 shrink-0">
                        {p.category || 'Kategorisiz'}
                      </span>
                    </div>

                    <h4 className="font-bold text-white text-xs truncate mt-0.5">{p.product_name}</h4>
                    <span className="text-xs font-black text-emerald-400 font-mono block mt-1">
                      {formatCurrency(p.sale_price)}
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-slate-900 text-xs">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={p.show_in_catalog !== false}
                      onChange={() => handleToggleShowInCatalog(p)}
                      className="w-4 h-4 rounded bg-slate-900 border-slate-700 text-purple-600 focus:ring-0"
                    />
                    <span className={`text-[11px] font-bold ${p.show_in_catalog ? 'text-purple-300' : 'text-slate-500'}`}>
                      {p.show_in_catalog ? '☑ Katalogda Göster' : '☐ Katalogda Gizle'}
                    </span>
                  </label>

                  <button
                    onClick={() => {
                      setEditingProduct(p);
                      setIsModalOpen(true);
                    }}
                    className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 transition-all flex items-center gap-1 text-[11px] font-semibold border border-slate-800"
                  >
                    <Edit2 className="w-3.5 h-3.5 text-purple-400" />
                    <span>Düzenle</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Catalog Product Modal */}
      <CatalogProductModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSuccess={() => fetchCatalogData()}
        productToEdit={editingProduct}
      />
    </div>
  );
};
