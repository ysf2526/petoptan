import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { Product, ProductType } from '@/types/database.types';
import { catalogService } from '@/services/catalogService';
import { preOrderService } from '@/services/preOrderService';
import { formatCurrency } from '@/utils/formatters';
import { useToast } from '@/context/ToastContext';
import { CatalogProductModal } from '@/components/modals/CatalogProductModal';
import {
  Package,
  Plus,
  Search,
  Filter,
  Share2,
  Copy,
  ExternalLink,
  MessageCircle,
  TrendingUp,
  Loader2,
  Edit2,
  Eye,
  EyeOff,
  CheckCircle2,
  Clock,
  Sparkles,
} from 'lucide-react';

interface DemandAnalysisItem {
  product_id: string;
  product_name: string;
  brand: string | null;
  unit: string;
  total_demanded: number;
  customer_count: number;
}

export const Catalog: React.FC = () => {
  const { showSuccess, showError } = useToast();

  const [loading, setLoading] = useState(true);
  const [products, setProducts] = useState<Product[]>([]);
  const [catalogSlug, setCatalogSlug] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<'ALL' | 'PRE_ORDER' | 'STOCK' | 'HIDDEN'>('ALL');

  // Demand Analysis State
  const [demandAnalysis, setDemandAnalysis] = useState<DemandAnalysisItem[]>([]);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);

  const fetchCatalogData = useCallback(async () => {
    setLoading(true);
    try {
      // 1. Fetch Slug
      const slug = await catalogService.getOwnerCatalogSlug();
      setCatalogSlug(slug);

      // 2. Fetch Products
      const { data: pData } = await supabase
        .from('products')
        .select('*')
        .is('deleted_at', null)
        .order('created_at', { ascending: false });

      setProducts(pData || []);

      // 3. Calculate Demand Analysis (En Çok Talep Edilen Ürünler)
      const { data: preItems } = await supabase
        .from('pre_order_items')
        .select('product_id, product_name, brand, unit, demanded_quantity, pre_order:pre_orders(customer_id, status)')
        .is('deleted_at', null);

      const demandMap: Record<string, { product_name: string; brand: string | null; unit: string; total: number; customers: Set<string> }> = {};

      preItems?.forEach((it: any) => {
        const status = it.pre_order?.status;
        if (status === 'demand_received' || status === 'supply_pending') {
          const pId = it.product_id || it.product_name;
          if (!demandMap[pId]) {
            demandMap[pId] = {
              product_name: it.product_name,
              brand: it.brand,
              unit: it.unit || 'Adet',
              total: 0,
              customers: new Set(),
            };
          }
          demandMap[pId].total += Number(it.demanded_quantity || 0);
          if (it.pre_order?.customer_id) {
            demandMap[pId].customers.add(it.pre_order.customer_id);
          }
        }
      });

      const analysisList: DemandAnalysisItem[] = Object.entries(demandMap).map(([pId, val]) => ({
        product_id: pId,
        product_name: val.product_name,
        brand: val.brand,
        unit: val.unit,
        total_demanded: val.total,
        customer_count: val.customers.size,
      }));

      analysisList.sort((a, b) => b.total_demanded - a.total_demanded);
      setDemandAnalysis(analysisList);
    } catch (err: any) {
      console.error(err);
      showError('Katalog verileri yüklenirken hata oluştu.');
    } finally {
      setLoading(false);
    }
  }, [showError]);

  useEffect(() => {
    fetchCatalogData();
    const handleRefresh = () => fetchCatalogData();
    window.addEventListener('refresh-data', handleRefresh);
    return () => window.removeEventListener('refresh-data', handleRefresh);
  }, [fetchCatalogData]);

  // Public Catalog URL
  const publicCatalogUrl = `${window.location.origin}/catalog/${catalogSlug}`;

  const handleCopyLink = () => {
    navigator.clipboard.writeText(publicCatalogUrl);
    showSuccess('Katalog bağlantısı panoya kopyalandı!');
  };

  const handleShareWhatsApp = () => {
    const text = `Merhaba, güncel toptan ürün kataloğumuzu aşağıdaki bağlantıdan inceleyebilir ve doğrudan ön siparişlerinizi iletebilirsiniz:\n\n🔗 ${publicCatalogUrl}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
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

      if (filterType === 'PRE_ORDER') return p.product_type === 'pre_order' || p.current_stock <= 0;
      if (filterType === 'STOCK') return p.current_stock > 0;
      if (filterType === 'HIDDEN') return !p.show_in_catalog;

      return true;
    });
  }, [products, searchQuery, filterType]);

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-6 animate-fadeIn pb-24">
      {/* Top Banner & Public Link Actions */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-slate-900 border border-purple-900/60 p-5 sm:p-6 rounded-2xl shadow-xl">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-1 rounded-lg bg-purple-600/20 text-purple-400 text-xs font-black border border-purple-500/30">
              MOBİL KATALOG & ÖN SİPARİŞ
            </span>
            <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight">
              ÜRÜN KATALOĞU VE TALEP ANALİZİ
            </h1>
          </div>
          <p className="text-xs text-slate-400 max-w-xl">
            Stokta olmayan ürünleri de kataloğa ekleyin, petshoplardan ön sipariş toplayın ve en çok talep edilen ürünlere göre tedarik yapın.
          </p>
        </div>

        {/* Share & Create Actions */}
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={handleCopyLink}
            className="bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-bold px-3.5 py-2.5 rounded-xl text-xs flex items-center gap-1.5 transition-all"
            title="Katalog Linkini Kopyala"
          >
            <Copy className="w-4 h-4 text-purple-400" />
            <span>Link Kopyala</span>
          </button>

          <button
            onClick={handleShareWhatsApp}
            className="bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold px-4 py-2.5 rounded-xl text-xs sm:text-sm flex items-center gap-2 shadow-lg shadow-emerald-600/20 transition-all active:scale-95"
          >
            <MessageCircle className="w-4.5 h-4.5" />
            <span>WHATSAPP'TAN PAYLAŞ</span>
          </button>

          <button
            onClick={() => {
              setEditingProduct(null);
              setIsModalOpen(true);
            }}
            className="bg-purple-600 hover:bg-purple-500 text-white font-extrabold px-4 py-2.5 rounded-xl text-xs sm:text-sm flex items-center gap-2 shadow-lg shadow-purple-600/20 transition-all active:scale-95"
          >
            <Plus className="w-4.5 h-4.5" />
            <span>+ KATALOG ÜRÜNÜ EKLE</span>
          </button>
        </div>
      </div>

      {/* DEMAND ANALYSIS WIDGET (TALEP ANALİZİ) */}
      <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl space-y-4 shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-purple-950 text-purple-400 border border-purple-800 flex items-center justify-center font-black">
              📊
            </div>
            <div>
              <h3 className="text-base font-extrabold text-white tracking-tight flex items-center gap-2">
                <span>TALEP ANALİZİ (EN ÇOK TALEP EDİLEN ÜRÜNLER)</span>
                <span className="bg-purple-950 text-purple-300 border border-purple-800 text-xs px-2.5 py-0.5 rounded-full font-black">
                  {demandAnalysis.length} AÇIK TALEP ÜRÜNÜ
                </span>
              </h3>
              <p className="text-xs text-slate-400">
                Henüz satın almadığınız, petshopların kataloğunuzdan ön sipariş verdiği ürünlerin miktar sıralaması.
              </p>
            </div>
          </div>
        </div>

        {demandAnalysis.length === 0 ? (
          <div className="p-6 text-center text-xs text-slate-500 bg-slate-950 rounded-xl border border-slate-800/60 flex items-center justify-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            <span>Şu anda bekleyen açık ön sipariş talebi bulunmamaktadır. Katalog linkinizi müşterilerinizle paylaşın!</span>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {demandAnalysis.slice(0, 6).map((item, idx) => (
              <div
                key={item.product_id}
                className="bg-slate-950 border border-purple-900/60 p-4 rounded-xl space-y-2 relative shadow-md hover:border-purple-600 transition-all"
              >
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-black text-purple-400 uppercase tracking-wider">
                    #{idx + 1} EN ÇOK TALEP EDİLEN
                  </span>
                  <span className="text-xs font-mono font-bold text-slate-400 bg-slate-900 px-2 py-0.5 rounded border border-slate-800">
                    {item.customer_count} Petshop İstedi
                  </span>
                </div>

                <div>
                  <h4 className="font-bold text-white text-sm leading-snug">{item.product_name}</h4>
                  {item.brand && <span className="text-[11px] text-slate-400 block mt-0.5">{item.brand}</span>}
                </div>

                <div className="flex items-center justify-between border-t border-slate-900 pt-2 text-xs">
                  <span className="text-slate-400 font-medium">Toplam Ön Sipariş:</span>
                  <span className="text-base font-black text-emerald-400 font-mono">
                    {item.total_demanded} {item.unit}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* CATALOG PRODUCTS LIST */}
      <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl space-y-4 shadow-xl">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 border-b border-slate-800 pb-4">
          <div className="relative w-full sm:w-80">
            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Katalog ürünü veya marka ara..."
              className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-4 py-2 text-xs text-white placeholder-slate-500 outline-none focus:border-purple-500"
            />
          </div>

          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <button
              onClick={() => setFilterType('ALL')}
              className={`px-3 py-1.5 rounded-lg font-bold transition-all ${
                filterType === 'ALL' ? 'bg-purple-600 text-white' : 'bg-slate-950 text-slate-400 hover:text-white'
              }`}
            >
              Tümü ({products.length})
            </button>

            <button
              onClick={() => setFilterType('PRE_ORDER')}
              className={`px-3 py-1.5 rounded-lg font-bold transition-all ${
                filterType === 'PRE_ORDER' ? 'bg-purple-600 text-white' : 'bg-slate-950 text-slate-400 hover:text-white'
              }`}
            >
              Ön Siparişe Açık (Stoksuz)
            </button>

            <button
              onClick={() => setFilterType('STOCK')}
              className={`px-3 py-1.5 rounded-lg font-bold transition-all ${
                filterType === 'STOCK' ? 'bg-purple-600 text-white' : 'bg-slate-950 text-slate-400 hover:text-white'
              }`}
            >
              Stoktaki Ürünler
            </button>

            <button
              onClick={() => setFilterType('HIDDEN')}
              className={`px-3 py-1.5 rounded-lg font-bold transition-all ${
                filterType === 'HIDDEN' ? 'bg-purple-600 text-white' : 'bg-slate-950 text-slate-400 hover:text-white'
              }`}
            >
              Katalogda Gizli
            </button>
          </div>
        </div>

        {filteredProducts.length === 0 ? (
          <div className="p-12 text-center text-xs text-slate-500">
            Kriterlere uygun ürün bulunamadı. Sağa üstteki "+ Katalog Ürünü Ekle" butonunu kullanarak yeni ürün ekleyebilirsiniz.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredProducts.map((p) => (
              <div
                key={p.id}
                className="bg-slate-950 border border-slate-800 p-4 rounded-xl space-y-3 relative hover:border-slate-700 transition-all flex flex-col justify-between"
              >
                <div className="flex items-start gap-3">
                  {p.image_url ? (
                    <img
                      src={p.image_url}
                      alt={p.product_name}
                      className="w-16 h-16 rounded-xl object-cover bg-slate-900 border border-slate-800 shrink-0"
                    />
                  ) : (
                    <div className="w-16 h-16 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-center text-slate-600 shrink-0">
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
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${
                          p.current_stock > 0
                            ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                            : 'bg-purple-950 text-purple-300 border border-purple-800'
                        }`}
                      >
                        {p.current_stock > 0 ? `🟢 Stokta (${p.current_stock} ${p.unit})` : '📦 Ön Sipariş'}
                      </span>
                    </div>

                    <h4 className="font-bold text-white text-sm truncate mt-0.5">{p.product_name}</h4>
                    <span className="text-xs font-black text-emerald-400 font-mono block mt-1">
                      {formatCurrency(p.sale_price)}
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-slate-900 text-xs">
                  <button
                    onClick={() => handleToggleShowInCatalog(p)}
                    className={`text-[11px] font-bold flex items-center gap-1.5 ${
                      p.show_in_catalog ? 'text-emerald-400' : 'text-slate-500'
                    }`}
                  >
                    {p.show_in_catalog ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                    <span>{p.show_in_catalog ? 'Katalogda Yayında' : 'Katalogda Gizli'}</span>
                  </button>

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
