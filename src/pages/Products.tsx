import React, { useEffect, useState, useCallback } from 'react';
import { useOutletContext } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/context/ToastContext';
import { parseErrorMessage } from '@/utils/errors';
import { formatCurrency, formatNumber, calculateUnitProfit, calculateProfitMargin } from '@/utils/formatters';
import { Product } from '@/types/database.types';
import { LayoutContextType } from '@/components/layout/Layout';
import { ProductModal } from '@/components/modals/ProductModal';
import { StockEntryModal } from '@/components/modals/StockEntryModal';
import {
  Package,
  Search,
  Plus,
  Edit2,
  Trash2,
  AlertTriangle,
  Boxes,
  Loader2,
  Filter,
} from 'lucide-react';

export const Products: React.FC = () => {
  const { openStockEntryModal } = useOutletContext<LayoutContextType>();
  const { showSuccess, showError } = useToast();

  const [loading, setLoading] = useState(true);
  const [products, setProducts] = useState<Product[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCategory, setFilterCategory] = useState<string>('ALL');
  const [onlyCritical, setOnlyCritical] = useState<boolean>(false);

  // Modals state
  const [productModalOpen, setProductModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);

  const fetchProducts = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .is('deleted_at', null)
        .order('product_name');

      if (error) throw error;
      setProducts(data || []);
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

  const categories = Array.from(new Set(products.map((p) => p.category).filter(Boolean)));

  const filteredProducts = products.filter((p) => {
    const query = searchQuery.toLowerCase().trim();
    const matchesSearch =
      !query ||
      p.product_name.toLowerCase().includes(query) ||
      (p.brand && p.brand.toLowerCase().includes(query)) ||
      (p.barcode && p.barcode.toLowerCase().includes(query));

    const matchesCategory = filterCategory === 'ALL' || p.category === filterCategory;
    const matchesCritical = !onlyCritical || p.current_stock < p.minimum_stock;

    return matchesSearch && matchesCategory && matchesCritical;
  });

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900 border border-slate-800 p-4 sm:p-6 rounded-2xl">
        <div>
          <h2 className="text-xl font-bold text-white tracking-tight">Ürün Kataloğu & Stok Kartları</h2>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Alış/satış fiyatlarını güncelleyin, birim kâr marjlarını görüntüleyin ve stok seviyelerini takip edin.
          </p>
        </div>
        <button
          onClick={() => openStockEntryModal()}
          className="self-start sm:self-center bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 text-white font-bold px-4 py-2.5 rounded-xl shadow-lg shadow-indigo-500/20 text-xs sm:text-sm flex items-center gap-2 transition-all active:scale-95"
        >
          <Boxes className="w-4 h-4" />
          <span>Depoya Mal Girişi Yap</span>
        </button>
      </div>

      {/* Search & Filter Bar */}
      <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-4 gap-3 items-center">
        {/* Search Input */}
        <div className="relative sm:col-span-2">
          <Search className="w-4 h-4 absolute left-3.5 top-3 text-slate-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Ürün adı, marka veya barkod ile arayın..."
            className="w-full bg-slate-950 border border-slate-700 focus:border-amber-500 rounded-xl py-2 pl-10 pr-4 text-xs sm:text-sm text-slate-100 placeholder-slate-500 outline-none"
          />
        </div>

        {/* Category Filter */}
        <div>
          <select
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
            className="w-full bg-slate-950 border border-slate-700 focus:border-amber-500 rounded-xl p-2 text-xs text-slate-100 outline-none"
          >
            <option value="ALL">Tüm Kategoriler</option>
            {categories.map((c) => (
              <option key={c} value={c!}>{c}</option>
            ))}
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
          <span>Kritik Stoktakiler ({products.filter((p) => p.current_stock < p.minimum_stock).length})</span>
        </button>
      </div>

      {/* Products Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        {loading ? (
          <div className="p-12 text-center text-slate-400 flex flex-col items-center">
            <Loader2 className="w-8 h-8 animate-spin text-amber-500 mb-2" />
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
                  <th className="p-4">Ürün Bilgisi</th>
                  <th className="p-4">Barkod</th>
                  <th className="p-4 text-right">Alış Fiyatı</th>
                  <th className="p-4 text-right">Satış Fiyatı</th>
                  <th className="p-4 text-right">Birim Kâr</th>
                  <th className="p-4 text-right">Kâr Oranı</th>
                  <th className="p-4 text-center">Stok Durumu</th>
                  <th className="p-4 text-right">İşlemler</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70 text-slate-200">
                {filteredProducts.map((p) => {
                  const unitProfit = calculateUnitProfit(p.purchase_price, p.sale_price);
                  const margin = calculateProfitMargin(p.purchase_price, p.sale_price);
                  const isCritical = p.current_stock < p.minimum_stock;

                  return (
                    <tr key={p.id} className="hover:bg-slate-800/40 transition-colors">
                      <td className="p-4">
                        <span className="font-bold text-slate-100 block text-sm">{p.product_name}</span>
                        <span className="text-[11px] text-slate-400">
                          {p.brand || 'Markasız'} {p.category ? `• ${p.category}` : ''} ({p.unit})
                        </span>
                      </td>

                      <td className="p-4 font-mono text-slate-400">
                        {p.barcode || '-'}
                      </td>

                      <td className="p-4 text-right font-medium text-slate-300">
                        {formatCurrency(p.purchase_price)}
                      </td>

                      <td className="p-4 text-right font-bold text-white">
                        {formatCurrency(p.sale_price)}
                      </td>

                      <td className="p-4 text-right font-bold text-emerald-400">
                        {formatCurrency(unitProfit)}
                      </td>

                      <td className="p-4 text-right font-extrabold text-emerald-400">
                        %{margin}
                      </td>

                      <td className="p-4 text-center">
                        <div className="inline-flex flex-col items-center">
                          <span
                            className={`font-extrabold px-2.5 py-0.5 rounded-full text-xs ${
                              isCritical
                                ? 'bg-amber-950 text-amber-300 border border-amber-800'
                                : 'bg-slate-800 text-slate-200'
                            }`}
                          >
                            {formatNumber(p.current_stock)} {p.unit}
                          </span>
                          {isCritical && (
                            <span className="text-[10px] text-amber-400 font-bold mt-0.5 flex items-center gap-1">
                              <AlertTriangle className="w-3 h-3" /> Minimum: {p.minimum_stock}
                            </span>
                          )}
                        </div>
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

      {/* Product Modal */}
      <ProductModal
        isOpen={productModalOpen}
        onClose={() => setProductModalOpen(false)}
        productToEdit={editingProduct}
        onSuccess={fetchProducts}
      />
    </div>
  );
};
