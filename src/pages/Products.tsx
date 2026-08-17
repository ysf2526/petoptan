import React, { useEffect, useState, useCallback } from 'react';
import { useOutletContext } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/context/ToastContext';
import { parseErrorMessage } from '@/utils/errors';
import { formatCurrency, formatNumber, calculateUnitProfit, calculateProfitMargin } from '@/utils/formatters';
import { Product, ProductType } from '@/types/database.types';
import { LayoutContextType } from '@/components/layout/Layout';
import { ProductModal } from '@/components/modals/ProductModal';
import { NewProductTypeModal } from '@/components/modals/NewProductTypeModal';
import { ProductDetailModal } from '@/components/modals/ProductDetailModal';
import { CatalogProductModal } from '@/components/modals/CatalogProductModal';
import {
  Package,
  Search,
  Plus,
  Edit2,
  Trash2,
  AlertTriangle,
  Boxes,
  Loader2,
  ClipboardList,
  Eye,
  EyeOff,
  ImageIcon,
} from 'lucide-react';

export const Products: React.FC = () => {
  const { openStockEntryModal } = useOutletContext<LayoutContextType>();
  const { showSuccess, showError } = useToast();

  const [loading, setLoading] = useState(true);
  const [products, setProducts] = useState<Product[]>([]);
  const [openDemandMap, setOpenDemandMap] = useState<Record<string, number>>({});

  // Filter States
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<ProductType | 'ALL'>('ALL');
  const [filterCategory, setFilterCategory] = useState<string>('ALL');
  const [filterCatalog, setFilterCatalog] = useState<'ALL' | 'SHOW' | 'HIDE'>('ALL');
  const [onlyCritical, setOnlyCritical] = useState<boolean>(false);

  // Modals state
  const [catalogModalOpen, setCatalogModalOpen] = useState(false);
  const [typeModalOpen, setTypeModalOpen] = useState(false);
  const [productModalOpen, setProductModalOpen] = useState(false);
  const [selectedProductType, setSelectedProductType] = useState<ProductType>('stock');
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);

  // Detail View Modal state
  const [viewingProduct, setViewingProduct] = useState<Product | null>(null);

  const fetchProducts = useCallback(async () => {
    setLoading(true);
    try {
      // 1. Fetch Products
      const { data: prodData, error: prodErr } = await supabase
        .from('products')
        .select('*')
        .is('deleted_at', null)
        .order('product_name');

      if (prodErr) throw prodErr;

      // 2. Fetch Open Pre-Order Demand
      const { data: itemsData, error: itemsErr } = await supabase
        .from('pre_order_items')
        .select('product_id, demanded_quantity, fulfilled_quantity, status')
        .in('status', ['demand_received', 'supply_pending', 'supplied', 'preparing']);

      if (itemsErr) {
        console.warn('Error fetching pre-order demand items:', itemsErr);
      }

      const demandMap: Record<string, number> = {};
      (itemsData || []).forEach((item) => {
        if (item.product_id) {
          const remaining = Math.max(0, Number(item.demanded_quantity || 0) - Number(item.fulfilled_quantity || 0));
          demandMap[item.product_id] = (demandMap[item.product_id] || 0) + remaining;
        }
      });

      setOpenDemandMap(demandMap);
      setProducts(prodData || []);
    } catch (err) {
      showError(parseErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [showError]);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  const handleDeleteProduct = async (prod: Product) => {
    if (!window.confirm(`"${prod.product_name}" adlı ürünü silmek istediğinize emin misiniz? (Geçmiş satışlar korunacaktır)`)) {
      return;
    }

    try {
      const { error } = await supabase
        .from('products')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', prod.id);

      if (error) throw error;

      showSuccess(`"${prod.product_name}" silindi.`);
      fetchProducts();
    } catch (err) {
      showError(parseErrorMessage(err));
    }
  };

  const handleToggleShowInCatalog = async (prod: Product) => {
    try {
      const updatedVal = prod.show_in_catalog === false ? true : false;
      const { error } = await supabase
        .from('products')
        .update({ show_in_catalog: updatedVal, updated_at: new Date().toISOString() })
        .eq('id', prod.id);

      if (error) throw error;
      setProducts((prev) => prev.map((p) => (p.id === prod.id ? { ...p, show_in_catalog: updatedVal } : p)));
      showSuccess(`"${prod.product_name}" ${updatedVal ? 'PDF kataloğuna eklendi' : 'PDF kataloğundan gizlendi'}.`);
    } catch (err) {
      showError(parseErrorMessage(err));
    }
  };

  const handleOpenNewProduct = () => {
    setTypeModalOpen(true);
  };

  const handleSelectProductType = (type: ProductType) => {
    setSelectedProductType(type);
    setEditingProduct(null);
    setTypeModalOpen(false);
    setProductModalOpen(true);
  };

  const categories = Array.from(new Set(products.map((p) => p.category).filter(Boolean)));

  const filteredProducts = products.filter((p) => {
    const query = searchQuery.toLowerCase().trim();
    const matchesSearch =
      !query ||
      p.product_name.toLowerCase().includes(query) ||
      (p.brand && p.brand.toLowerCase().includes(query)) ||
      (p.barcode && p.barcode.toLowerCase().includes(query));

    const pType = p.product_type || 'stock';
    const matchesType = filterType === 'ALL' || pType === filterType;
    const matchesCategory = filterCategory === 'ALL' || p.category === filterCategory;
    const matchesCatalog =
      filterCatalog === 'ALL' ||
      (filterCatalog === 'SHOW' && p.show_in_catalog !== false) ||
      (filterCatalog === 'HIDE' && p.show_in_catalog === false);
    const matchesCritical = !onlyCritical || p.current_stock < p.minimum_stock;

    return matchesSearch && matchesType && matchesCategory && matchesCatalog && matchesCritical;
  });

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900 border border-slate-800 p-4 sm:p-6 rounded-2xl">
        <div>
          <h2 className="text-xl font-bold text-white tracking-tight">Ürün Kataloğu & Stok Kartları</h2>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Stoklu ürünler ve ön sipariş taleplerini fotoğraflı ürün kartları ile yönetin.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={() => setCatalogModalOpen(true)}
            className="bg-purple-600 hover:bg-purple-500 text-white font-extrabold px-4 py-2.5 rounded-xl shadow-lg shadow-purple-600/20 text-xs sm:text-sm flex items-center gap-2 transition-all active:scale-95"
          >
            <Plus className="w-4 h-4" />
            <span>+ Katalog Ürünü Ekle</span>
          </button>

          <button
            onClick={handleOpenNewProduct}
            className="bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 font-extrabold px-4 py-2.5 rounded-xl text-xs sm:text-sm flex items-center gap-2 transition-all active:scale-95"
          >
            <Plus className="w-4 h-4 text-emerald-400" />
            <span>+ Stoklu Ürün Ekle</span>
          </button>

          <button
            onClick={() => openStockEntryModal()}
            className="bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 font-semibold px-3.5 py-2.5 rounded-xl text-xs sm:text-sm flex items-center gap-2 transition-all active:scale-95"
          >
            <Boxes className="w-4 h-4 text-indigo-400" />
            <span className="hidden sm:inline">Depoya Mal Girişi</span>
          </button>
        </div>
      </div>

      {/* Product Type Filter Tabs */}
      <div className="flex items-center gap-2 p-1.5 bg-slate-900 border border-slate-800 rounded-2xl overflow-x-auto custom-scrollbar">
        <button
          onClick={() => setFilterType('ALL')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-extrabold transition-all shrink-0 ${
            filterType === 'ALL'
              ? 'bg-brand-600 text-white shadow-md'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
          }`}
        >
          <span>Tümü ({products.length})</span>
        </button>

        <button
          onClick={() => setFilterType('stock')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-extrabold transition-all shrink-0 ${
            filterType === 'stock'
              ? 'bg-emerald-600 text-white shadow-md'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
          }`}
        >
          <Package className="w-3.5 h-3.5" />
          <span>📦 Stoktaki Ürünler ({products.filter((p) => (p.product_type || 'stock') === 'stock').length})</span>
        </button>

        <button
          onClick={() => setFilterType('pre_order')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-extrabold transition-all shrink-0 ${
            filterType === 'pre_order'
              ? 'bg-amber-600 text-white shadow-md'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
          }`}
        >
          <ClipboardList className="w-3.5 h-3.5" />
          <span>📋 Ön Sipariş Ürünleri ({products.filter((p) => p.product_type === 'pre_order').length})</span>
        </button>
      </div>

      {/* Search & Secondary Filter Bar */}
      <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 items-center">
        {/* Search Input */}
        <div className="relative sm:col-span-2">
          <Search className="w-4 h-4 absolute left-3.5 top-3 text-slate-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Ürün adı, marka veya barkod ile arayın..."
            className="w-full bg-slate-950 border border-slate-700 focus:border-brand-500 rounded-xl py-2 pl-10 pr-4 text-xs sm:text-sm text-slate-100 placeholder-slate-500 outline-none"
          />
        </div>

        {/* Category Filter */}
        <div>
          <select
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
            className="w-full bg-slate-950 border border-slate-700 focus:border-brand-500 rounded-xl p-2 text-xs text-slate-100 outline-none"
          >
            <option value="ALL">Tüm Kategoriler</option>
            {categories.map((c) => (
              <option key={c} value={c!}>{c}</option>
            ))}
          </select>
        </div>

        {/* PDF Catalog Visibility Filter */}
        <div>
          <select
            value={filterCatalog}
            onChange={(e) => setFilterCatalog(e.target.value as any)}
            className="w-full bg-slate-950 border border-slate-700 focus:border-brand-500 rounded-xl p-2 text-xs text-slate-100 outline-none font-bold"
          >
            <option value="ALL">Tüm PDF Durumları</option>
            <option value="SHOW">👁️ PDF Kataloğundakiler ({products.filter((p) => p.show_in_catalog !== false).length})</option>
            <option value="HIDE">🙈 PDF'te Gizlenenler ({products.filter((p) => p.show_in_catalog === false).length})</option>
          </select>
        </div>

        {/* Critical Stock Toggle */}
        <button
          onClick={() => setOnlyCritical(!onlyCritical)}
          className={`flex items-center justify-center gap-2 p-2 rounded-xl border text-xs font-bold transition-all ${
            onlyCritical
              ? 'bg-amber-950/60 border-amber-500 text-amber-300'
              : 'bg-slate-950 border-slate-700 text-slate-400 hover:text-slate-200'
          }`}
        >
          <AlertTriangle className="w-4 h-4 text-amber-400" />
          <span>Kritik Stok ({products.filter((p) => p.current_stock < p.minimum_stock).length})</span>
        </button>
      </div>

      {/* Products Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        {loading ? (
          <div className="p-12 text-center text-slate-400 flex flex-col items-center">
            <Loader2 className="w-8 h-8 animate-spin text-brand-500 mb-2" />
            <span>Ürün Kataloğu Yükleniyor...</span>
          </div>
        ) : filteredProducts.length === 0 ? (
          <div className="p-12 text-center text-slate-500 text-sm">
            Arama kriterlerine uygun ürün bulunamadı.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950 text-slate-400 uppercase tracking-wider font-semibold border-b border-slate-800">
                <tr>
                  <th className="p-4">Görsel & Ürün Bilgisi</th>
                  <th className="p-4">Barkod</th>
                  <th className="p-4 text-right">Alış Fiyatı</th>
                  <th className="p-4 text-right">Satış Fiyatı</th>
                  <th className="p-4 text-right">Birim Kâr</th>
                  <th className="p-4 text-center">Stok / Açık Talep</th>
                  <th className="p-4 text-center">Katalog</th>
                  <th className="p-4 text-right">İşlemler</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70 text-slate-200">
                {filteredProducts.map((p) => {
                  const pType = p.product_type || 'stock';
                  const isPreOrder = pType === 'pre_order';
                  const openDemand = openDemandMap[p.id] || 0;
                  const unitProfit = calculateUnitProfit(p.purchase_price, p.sale_price);
                  const margin = calculateProfitMargin(p.purchase_price, p.sale_price);
                  const isCritical = p.current_stock < p.minimum_stock && !isPreOrder;

                  return (
                    <tr key={p.id} className="hover:bg-slate-800/40 transition-colors">
                      <td className="p-4">
                        <div className="flex items-center gap-3">
                          {/* Image Thumbnail */}
                          <div className="w-12 h-12 rounded-xl bg-slate-950 border border-slate-800 shrink-0 overflow-hidden flex items-center justify-center">
                            {p.image_url ? (
                              <img
                                src={p.image_url}
                                alt={p.product_name}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <ImageIcon className="w-5 h-5 text-slate-600" />
                            )}
                          </div>

                          <div>
                            <div className="flex items-center gap-2">
                              <span
                                className="font-bold text-slate-100 text-sm hover:text-brand-400 cursor-pointer"
                                onClick={() => setViewingProduct(p)}
                              >
                                {p.product_name}
                              </span>
                              {isPreOrder && (
                                <span className="px-2 py-0.5 rounded text-[10px] font-extrabold bg-amber-950 text-amber-300 border border-amber-800/60">
                                  🟠 ÖN SİPARİŞ
                                </span>
                              )}
                            </div>
                            <span className="text-[11px] text-slate-400">
                              {p.brand || 'Markasız'} {p.category ? `• ${p.category}` : ''} ({p.unit})
                            </span>
                          </div>
                        </div>
                      </td>

                      <td className="p-4 font-mono text-slate-400">
                        {p.barcode || '-'}
                      </td>

                      <td className="p-4 text-right font-medium text-slate-300">
                        {p.purchase_price > 0 ? (
                          formatCurrency(p.purchase_price)
                        ) : (
                          <span className="text-slate-500 italic">Belirlenmedi</span>
                        )}
                      </td>

                      <td className="p-4 text-right font-bold text-white">
                        {p.sale_price > 0 ? formatCurrency(p.sale_price) : '-'}
                      </td>

                      <td className="p-4 text-right font-bold text-emerald-400">
                        {p.purchase_price > 0 && p.sale_price > 0 ? (
                          <>
                            {formatCurrency(unitProfit)}
                            <span className="block text-[10px] text-slate-400 font-medium">%{margin}</span>
                          </>
                        ) : (
                          '-'
                        )}
                      </td>

                      <td className="p-4 text-center">
                        <div className="inline-flex flex-col items-center gap-1">
                          <span
                            className={`font-extrabold px-2.5 py-0.5 rounded-full text-xs ${
                              isCritical
                                ? 'bg-amber-950 text-amber-300 border border-amber-800'
                                : 'bg-slate-800 text-slate-200'
                            }`}
                          >
                            Stok: {formatNumber(p.current_stock)} {p.unit}
                          </span>

                          {openDemand > 0 && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-amber-950/80 text-amber-300 border border-amber-800/60">
                              Açık Talep: {formatNumber(openDemand)} {p.unit}
                            </span>
                          )}

                          {isCritical && (
                            <span className="text-[10px] text-amber-400 font-bold flex items-center gap-1">
                              <AlertTriangle className="w-3 h-3" /> Min: {p.minimum_stock}
                            </span>
                          )}
                        </div>
                      </td>

                      <td className="p-4 text-center">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleToggleShowInCatalog(p);
                          }}
                          title={p.show_in_catalog !== false ? 'PDF Kataloğundan Gizle' : 'PDF Kataloğuna Ekle'}
                          className={`inline-flex items-center gap-1 text-[11px] font-bold px-2 py-1 rounded-lg border transition-all active:scale-95 cursor-pointer ${
                            p.show_in_catalog !== false
                              ? 'text-emerald-400 bg-emerald-950/60 border-emerald-800/60 hover:bg-emerald-900/60 shadow-sm'
                              : 'text-slate-500 bg-slate-950 border-slate-800 hover:text-slate-300 hover:bg-slate-800'
                          }`}
                        >
                          {p.show_in_catalog !== false ? (
                            <>
                              <Eye className="w-3.5 h-3.5 text-emerald-400" />
                              <span>PDF'te Açık</span>
                            </>
                          ) : (
                            <>
                              <EyeOff className="w-3.5 h-3.5 text-slate-500" />
                              <span>PDF'te Gizli</span>
                            </>
                          )}
                        </button>
                      </td>

                      <td className="p-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => openStockEntryModal(p.id)}
                            title="Stok Girişi Yap"
                            className="p-1.5 text-indigo-400 hover:text-indigo-200 hover:bg-indigo-950/40 rounded-lg"
                          >
                            <Boxes className="w-4 h-4" />
                          </button>

                          <button
                            onClick={() => {
                              setEditingProduct(p);
                              setSelectedProductType(p.product_type || 'stock');
                              setProductModalOpen(true);
                            }}
                            title="Düzenle"
                            className="p-1.5 text-slate-400 hover:text-amber-400 hover:bg-amber-950/40 rounded-lg"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>

                          <button
                            onClick={() => handleDeleteProduct(p)}
                            title="Sil"
                            className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-rose-950/40 rounded-lg"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Type Selection Modal */}
      <NewProductTypeModal
        isOpen={typeModalOpen}
        onClose={() => setTypeModalOpen(false)}
        onSelectType={handleSelectProductType}
      />

      {/* Create / Edit Product Modal */}
      <ProductModal
        isOpen={productModalOpen}
        onClose={() => setProductModalOpen(false)}
        productToEdit={editingProduct}
        initialProductType={selectedProductType}
        onSuccess={fetchProducts}
      />

      {/* Product Detail Modal */}
      {viewingProduct && (
        <ProductDetailModal
          isOpen={!!viewingProduct}
          onClose={() => setViewingProduct(null)}
          product={viewingProduct}
          openDemandQty={openDemandMap[viewingProduct.id] || 0}
        />
      )}

      {/* Catalog Product Modal */}
      <CatalogProductModal
        isOpen={catalogModalOpen}
        onClose={() => setCatalogModalOpen(false)}
        onSuccess={fetchProducts}
      />
    </div>
  );
};
