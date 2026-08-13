import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useOutletContext, useSearchParams } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { formatDateTime, formatCurrency, formatNumber } from '@/utils/formatters';
import { StockMovement, MovementType, Product } from '@/types/database.types';
import { LayoutContextType } from '@/components/layout/Layout';
import { ProductStockDetailModal } from '@/components/modals/ProductStockDetailModal';
import {
  Boxes,
  Search,
  Plus,
  Loader2,
  AlertTriangle,
  LayoutGrid,
  List,
  Filter,
  ArrowUpDown,
  History,
  Package,
  TrendingUp,
  DollarSign,
  AlertCircle,
  Eye,
  CheckCircle2,
  Ban,
  Tag,
  Barcode,
} from 'lucide-react';

export const StockMovements: React.FC = () => {
  const { openStockEntryModal } = useOutletContext<LayoutContextType>();
  const [searchParams, setSearchParams] = useSearchParams();

  // Active Tab: 'inventory' (MEVCUT STOK) or 'movements' (STOK HAREKETLERİ)
  const initialTab = searchParams.get('tab') === 'movements' ? 'movements' : 'inventory';
  const [activeTab, setActiveTab] = useState<'inventory' | 'movements'>(initialTab);

  // Loading states
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [loadingMovements, setLoadingMovements] = useState(true);

  // Data states
  const [products, setProducts] = useState<Product[]>([]);
  const [movements, setMovements] = useState<StockMovement[]>([]);

  // Inventory Filters & Sort
  const [searchQuery, setSearchQuery] = useState('');
  const initialFilter = searchParams.get('filter') || 'ALL'; // ALL, IN_STOCK, CRITICAL, OUT_OF_STOCK
  const [inventoryFilter, setInventoryFilter] = useState<string>(initialFilter);
  const [sortBy, setSortBy] = useState<string>('stock_asc'); // default: En az stoktan en fazla stoğa
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');

  // Movements Filter
  const [movementSearch, setMovementSearch] = useState('');
  const [movementTypeFilter, setMovementTypeFilter] = useState<string>('ALL');

  // Product Stock Detail Modal State
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [detailModalOpen, setDetailModalOpen] = useState(false);

  // Sync tab with URL search params if changed from outside
  useEffect(() => {
    const tabParam = searchParams.get('tab');
    if (tabParam === 'movements' && activeTab !== 'movements') {
      setActiveTab('movements');
    } else if (tabParam === 'inventory' && activeTab !== 'inventory') {
      setActiveTab('inventory');
    }

    const filterParam = searchParams.get('filter');
    if (filterParam && filterParam !== inventoryFilter) {
      setInventoryFilter(filterParam);
    }
  }, [searchParams]);

  // Fetch Products (Current Stock Inventory)
  const fetchProducts = useCallback(async () => {
    setLoadingProducts(true);
    try {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .eq('active', true)
        .is('deleted_at', null);

      if (error) throw error;
      setProducts(data || []);
    } catch (err) {
      console.error('Stok envanteri yükleme hatası:', err);
    } finally {
      setLoadingProducts(false);
    }
  }, []);

  // Fetch Stock Movements
  const fetchMovements = useCallback(async () => {
    setLoadingMovements(true);
    try {
      const { data, error } = await supabase
        .from('stock_movements')
        .select(`
          *,
          products (product_name, brand, unit)
        `)
        .is('deleted_at', null)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setMovements(data || []);
    } catch (err) {
      console.error('Stok hareketleri yükleme hatası:', err);
    } finally {
      setLoadingMovements(false);
    }
  }, []);

  useEffect(() => {
    fetchProducts();
    fetchMovements();

    const handleRefresh = () => {
      fetchProducts();
      fetchMovements();
    };

    window.addEventListener('refresh-data', handleRefresh);
    return () => window.removeEventListener('refresh-data', handleRefresh);
  }, [fetchProducts, fetchMovements]);

  // Handle Tab Switching
  const handleTabChange = (tab: 'inventory' | 'movements') => {
    setActiveTab(tab);
    const newParams = new URLSearchParams(searchParams);
    newParams.set('tab', tab);
    setSearchParams(newParams);
  };

  // Inventory Summary Metrics (Calculated from real DB products)
  const inventoryStats = useMemo(() => {
    let totalProducts = products.length;
    let totalStockQty = 0;
    let criticalCount = 0;
    let outOfStockCount = 0;
    let totalCostValue = 0;
    let totalRetailValue = 0;

    products.forEach((p) => {
      const stock = Number(p.current_stock || 0);
      const minStock = Number(p.minimum_stock || 0);
      const pPrice = Number(p.purchase_price || 0);
      const sPrice = Number(p.sale_price || 0);

      totalStockQty += stock;

      if (stock <= 0) {
        outOfStockCount++;
      } else if (stock <= minStock) {
        criticalCount++;
      }

      if (stock > 0) {
        totalCostValue += stock * pPrice;
        totalRetailValue += stock * sPrice;
      }
    });

    return {
      totalProducts,
      totalStockQty,
      criticalCount,
      outOfStockCount,
      totalCostValue,
      totalRetailValue,
    };
  }, [products]);

  // Filtered & Sorted Inventory Products
  const filteredProducts = useMemo(() => {
    let result = products.filter((p) => {
      const q = searchQuery.toLowerCase().trim();
      const nameMatch = p.product_name.toLowerCase().includes(q);
      const barcodeMatch = p.barcode ? p.barcode.toLowerCase().includes(q) : false;
      const brandMatch = p.brand ? p.brand.toLowerCase().includes(q) : false;
      const matchesSearch = !q || nameMatch || barcodeMatch || brandMatch;

      const stock = Number(p.current_stock || 0);
      const minStock = Number(p.minimum_stock || 0);

      let matchesFilter = true;
      if (inventoryFilter === 'IN_STOCK') {
        matchesFilter = stock > 0;
      } else if (inventoryFilter === 'CRITICAL') {
        matchesFilter = stock > 0 && stock <= minStock;
      } else if (inventoryFilter === 'OUT_OF_STOCK') {
        matchesFilter = stock <= 0;
      }

      return matchesSearch && matchesFilter;
    });

    // Sorting
    result.sort((a, b) => {
      const stockA = Number(a.current_stock || 0);
      const stockB = Number(b.current_stock || 0);
      const valA = stockA * Number(a.purchase_price || 0);
      const valB = stockB * Number(b.purchase_price || 0);

      switch (sortBy) {
        case 'stock_asc': // En az stoktan en fazla stoğa
          return stockA - stockB;
        case 'stock_desc':
          return stockB - stockA;
        case 'name_asc':
          return a.product_name.localeCompare(b.product_name, 'tr');
        case 'value_desc':
          return valB - valA;
        case 'purchase_desc':
          return Number(b.purchase_price || 0) - Number(a.purchase_price || 0);
        case 'sale_desc':
          return Number(b.sale_price || 0) - Number(a.sale_price || 0);
        default:
          return stockA - stockB;
      }
    });

    return result;
  }, [products, searchQuery, inventoryFilter, sortBy]);

  // Filtered Stock Movements
  const filteredMovements = useMemo(() => {
    return movements.filter((m) => {
      const q = movementSearch.toLowerCase().trim();
      const prodName = m.products?.product_name?.toLowerCase() || '';
      const note = m.note?.toLowerCase() || '';
      const matchesQuery = !q || prodName.includes(q) || note.includes(q);

      const matchesType = movementTypeFilter === 'ALL' || m.movement_type === movementTypeFilter;
      return matchesQuery && matchesType;
    });
  }, [movements, movementSearch, movementTypeFilter]);

  const getMovementBadgeStyle = (type: MovementType) => {
    switch (type) {
      case 'PURCHASE':
        return 'bg-emerald-950 text-emerald-300 border-emerald-800/50';
      case 'SALE':
        return 'bg-brand-950 text-brand-300 border-brand-800/50';
      case 'RETURN':
        return 'bg-purple-950 text-purple-300 border-purple-800/50';
      case 'ADJUSTMENT':
        return 'bg-indigo-950 text-indigo-300 border-indigo-800/50';
      case 'DAMAGE':
        return 'bg-rose-950 text-rose-300 border-rose-800/50';
      default:
        return 'bg-slate-800 text-slate-300 border-slate-700';
    }
  };

  const getMovementLabel = (type: MovementType) => {
    switch (type) {
      case 'PURCHASE':
        return 'Mal Girişi (+)';
      case 'SALE':
        return 'Satış (-)';
      case 'RETURN':
        return 'İade (+)';
      case 'ADJUSTMENT':
        return 'Sayım Düzeltme';
      case 'DAMAGE':
        return 'Hasar/Zayiat (-)';
      case 'INITIAL':
        return 'İlk Stok';
      default:
        return type;
    }
  };

  const openProductDetail = (prodId: string) => {
    setSelectedProductId(prodId);
    setDetailModalOpen(true);
  };

  return (
    <div className="space-y-6">
      {/* Top Banner & Tab Navigation */}
      <div className="bg-slate-900 border border-slate-800 p-4 sm:p-6 rounded-2xl space-y-4 shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Boxes className="w-6 h-6 text-indigo-400" />
              <h2 className="text-xl font-bold text-white tracking-tight">Depo & Envanter Yönetimi</h2>
            </div>
            <p className="text-xs sm:text-sm text-slate-400 mt-1">
              Gerçek zamanlı depo stok seviyeleri, stok maliyet değerleri ve detaylı hareket geçmişi.
            </p>
          </div>

          <button
            onClick={() => openStockEntryModal()}
            className="self-start sm:self-center bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 text-white font-bold px-4 py-2.5 rounded-xl shadow-lg shadow-indigo-500/20 text-xs sm:text-sm flex items-center gap-2 transition-all active:scale-95"
          >
            <Plus className="w-4 h-4" />
            <span>Depoya Mal Girişi Yap</span>
          </button>
        </div>

        {/* Tab Selector */}
        <div className="flex items-center gap-2 border-t border-slate-800/80 pt-4">
          <button
            onClick={() => handleTabChange('inventory')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs sm:text-sm transition-all ${
              activeTab === 'inventory'
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/25'
                : 'bg-slate-950 text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 border border-slate-800'
            }`}
          >
            <Boxes className="w-4 h-4" />
            <span>MEVCUT STOK ENVANTERİ</span>
          </button>

          <button
            onClick={() => handleTabChange('movements')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs sm:text-sm transition-all ${
              activeTab === 'movements'
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/25'
                : 'bg-slate-950 text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 border border-slate-800'
            }`}
          >
            <History className="w-4 h-4" />
            <span>STOK HAREKETLERİ</span>
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* TAB 1: MEVCUT STOK ENVANTERİ (CURRENT STOCK INVENTORY) */}
      {/* ========================================================================= */}
      {activeTab === 'inventory' && (
        <div className="space-y-6">
          {/* TOPLAM ENVANTER ÖZETİ (Summary KPI Cards) */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {/* TOPLAM ÜRÜN */}
            <div className="bg-slate-900 border border-slate-800 p-3.5 sm:p-4 rounded-2xl">
              <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block">
                TOPLAM ÜRÜN
              </span>
              <div className="text-xl sm:text-2xl font-black text-white mt-1">
                {formatNumber(inventoryStats.totalProducts)}
              </div>
              <span className="text-[10px] text-slate-500 mt-0.5 block">Kayıtlı Çeşit</span>
            </div>

            {/* STOKTAKİ TOPLAM ADET */}
            <div className="bg-slate-900 border border-slate-800 p-3.5 sm:p-4 rounded-2xl">
              <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block">
                STOKTAKİ TOPLAM ADET
              </span>
              <div className="text-xl sm:text-2xl font-black text-indigo-400 mt-1">
                {formatNumber(inventoryStats.totalStockQty)}
              </div>
              <span className="text-[10px] text-slate-500 mt-0.5 block">Fiziksel Ürün Adedi</span>
            </div>

            {/* KRİTİK STOK */}
            <div className="bg-slate-900 border border-slate-800 p-3.5 sm:p-4 rounded-2xl">
              <span className="text-[10px] font-extrabold text-amber-400 uppercase tracking-wider block flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" /> KRİTİK STOK
              </span>
              <div className="text-xl sm:text-2xl font-black text-amber-400 mt-1">
                {inventoryStats.criticalCount}
              </div>
              <span className="text-[10px] text-amber-400/70 mt-0.5 block">Siparişi Yaklaşan</span>
            </div>

            {/* STOKSUZ ÜRÜN */}
            <div className="bg-slate-900 border border-slate-800 p-3.5 sm:p-4 rounded-2xl">
              <span className="text-[10px] font-extrabold text-rose-400 uppercase tracking-wider block flex items-center gap-1">
                🔴 STOKSUZ ÜRÜN
              </span>
              <div className="text-xl sm:text-2xl font-black text-rose-400 mt-1">
                {inventoryStats.outOfStockCount}
              </div>
              <span className="text-[10px] text-rose-400/70 mt-0.5 block">Depoda 0 Olan</span>
            </div>

            {/* TOPLAM STOK MALİYETİ */}
            <div className="bg-slate-900 border border-slate-800 p-3.5 sm:p-4 rounded-2xl">
              <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block truncate">
                STOK MALİYETİ
              </span>
              <div className="text-lg sm:text-xl font-extrabold text-emerald-400 mt-1 truncate">
                {formatCurrency(inventoryStats.totalCostValue)}
              </div>
              <span className="text-[10px] text-slate-500 mt-0.5 block">Alış Fiyatıyla</span>
            </div>

            {/* TOPLAM PERAKENDE DEĞERİ */}
            <div className="bg-slate-900 border border-slate-800 p-3.5 sm:p-4 rounded-2xl">
              <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block truncate">
                SATIŞ DEĞERİ
              </span>
              <div className="text-lg sm:text-xl font-extrabold text-white mt-1 truncate">
                {formatCurrency(inventoryStats.totalRetailValue)}
              </div>
              <span className="text-[10px] text-slate-500 mt-0.5 block">Satış Fiyatıyla</span>
            </div>
          </div>

          {/* Search, Filters, View Toggle & Sorting Controls */}
          <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl space-y-4 shadow-lg">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-center">
              {/* Search Bar */}
              <div className="relative lg:col-span-5">
                <Search className="w-4 h-4 absolute left-3.5 top-3 text-slate-500" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Ürün adı veya barkod ile arayın... (Örn: Cex, Royal)"
                  className="w-full bg-slate-950 border border-slate-700 focus:border-indigo-500 rounded-xl py-2 pl-10 pr-4 text-xs sm:text-sm text-slate-100 placeholder-slate-500 outline-none"
                />
              </div>

              {/* Sorting Select */}
              <div className="lg:col-span-4 flex items-center gap-2">
                <ArrowUpDown className="w-4 h-4 text-slate-500 shrink-0" />
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 focus:border-indigo-500 rounded-xl p-2 text-xs text-slate-100 outline-none font-medium"
                >
                  <option value="stock_asc">⚡ En Az Stoktan En Fazlaya (Öncelikli)</option>
                  <option value="stock_desc">Stok Miktarı (En Fazladan Azalana)</option>
                  <option value="name_asc">Ürün Adı (A - Z)</option>
                  <option value="value_desc">Stok Değeri (Yüksekten Düşüğe)</option>
                  <option value="purchase_desc">Alış Fiyatı (Yüksekten Düşüğe)</option>
                  <option value="sale_desc">Satış Fiyatı (Yüksekten Düşüğe)</option>
                </select>
              </div>

              {/* View Mode Toggle (Cards vs Table) */}
              <div className="lg:col-span-3 flex items-center justify-end gap-1.5 bg-slate-950 p-1 rounded-xl border border-slate-800 self-stretch sm:self-auto">
                <button
                  onClick={() => setViewMode('cards')}
                  className={`flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    viewMode === 'cards'
                      ? 'bg-indigo-600 text-white shadow'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <LayoutGrid className="w-3.5 h-3.5" />
                  <span>Kart Görünümü</span>
                </button>
                <button
                  onClick={() => setViewMode('table')}
                  className={`flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    viewMode === 'table'
                      ? 'bg-indigo-600 text-white shadow'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <List className="w-3.5 h-3.5" />
                  <span>Tablo Görünümü</span>
                </button>
              </div>
            </div>

            {/* Filter Pills */}
            <div className="flex flex-wrap items-center gap-2 border-t border-slate-800/60 pt-3">
              <span className="text-xs font-bold text-slate-400 mr-1 flex items-center gap-1">
                <Filter className="w-3.5 h-3.5 text-indigo-400" />
                <span>Filtre:</span>
              </span>

              <button
                onClick={() => setInventoryFilter('ALL')}
                className={`px-3 py-1.5 rounded-xl text-xs font-extrabold transition-all ${
                  inventoryFilter === 'ALL'
                    ? 'bg-slate-100 text-slate-950 shadow'
                    : 'bg-slate-950 text-slate-400 hover:text-slate-200 border border-slate-800'
                }`}
              >
                TÜMÜ ({products.length})
              </button>

              <button
                onClick={() => setInventoryFilter('IN_STOCK')}
                className={`px-3 py-1.5 rounded-xl text-xs font-extrabold transition-all ${
                  inventoryFilter === 'IN_STOCK'
                    ? 'bg-emerald-500 text-slate-950 shadow'
                    : 'bg-slate-950 text-emerald-400 hover:bg-emerald-950/40 border border-slate-800'
                }`}
              >
                STOKTA VAR ({products.filter((p) => Number(p.current_stock || 0) > 0).length})
              </button>

              <button
                onClick={() => setInventoryFilter('CRITICAL')}
                className={`px-3 py-1.5 rounded-xl text-xs font-extrabold transition-all flex items-center gap-1.5 ${
                  inventoryFilter === 'CRITICAL'
                    ? 'bg-amber-500 text-slate-950 shadow'
                    : 'bg-slate-950 text-amber-300 hover:bg-amber-950/40 border border-slate-800'
                }`}
              >
                <AlertTriangle className="w-3 h-3" />
                <span>
                  KRİTİK STOK ({products.filter((p) => Number(p.current_stock || 0) > 0 && Number(p.current_stock || 0) <= Number(p.minimum_stock || 0)).length})
                </span>
              </button>

              <button
                onClick={() => setInventoryFilter('OUT_OF_STOCK')}
                className={`px-3 py-1.5 rounded-xl text-xs font-extrabold transition-all flex items-center gap-1.5 ${
                  inventoryFilter === 'OUT_OF_STOCK'
                    ? 'bg-rose-600 text-white shadow'
                    : 'bg-slate-950 text-rose-400 hover:bg-rose-950/40 border border-slate-800'
                }`}
              >
                <span>🔴 STOK YOK ({products.filter((p) => Number(p.current_stock || 0) <= 0).length})</span>
              </button>
            </div>
          </div>

          {/* Products View Content */}
          {loadingProducts ? (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center text-slate-400 flex flex-col items-center">
              <Loader2 className="w-8 h-8 animate-spin text-indigo-500 mb-2" />
              <span>Mevcut Stok Envanteri Yükleniyor...</span>
            </div>
          ) : filteredProducts.length === 0 ? (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center text-slate-500 text-sm">
              Arama ve filtre kriterlerine uygun ürün bulunamadı.
            </div>
          ) : viewMode === 'cards' ? (
            /* MOBILE-FIRST CARD VIEW (Prominent readable big counts) */
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {filteredProducts.map((p) => {
                const stock = Number(p.current_stock || 0);
                const minStock = Number(p.minimum_stock || 0);
                const pPrice = Number(p.purchase_price || 0);
                const sPrice = Number(p.sale_price || 0);
                const stockValue = Math.max(0, stock) * pPrice;

                const isOut = stock === 0;
                const isNegative = stock < 0;
                const isCritical = stock > 0 && stock <= minStock;

                return (
                  <div
                    key={p.id}
                    onClick={() => openProductDetail(p.id)}
                    className={`group relative bg-slate-900 border rounded-2xl p-4 sm:p-5 flex flex-col justify-between space-y-4 hover:bg-slate-800/60 transition-all cursor-pointer shadow-lg active:scale-[0.99] ${
                      isNegative
                        ? 'border-rose-700/80 bg-rose-950/20'
                        : isOut
                        ? 'border-rose-900/60 bg-rose-950/10'
                        : isCritical
                        ? 'border-amber-600/70 bg-amber-950/20'
                        : 'border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    {/* Header: Product Name & Badges */}
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="font-bold text-white text-base sm:text-lg leading-snug group-hover:text-indigo-300 transition-colors">
                          {p.product_name}
                        </h3>

                        {/* Status Badge */}
                        {isNegative ? (
                          <span className="shrink-0 bg-rose-950 text-rose-300 border border-rose-800 text-[10px] font-extrabold px-2 py-0.5 rounded-full flex items-center gap-1">
                            <AlertTriangle className="w-3 h-3" /> NEGATİF STOK
                          </span>
                        ) : isOut ? (
                          <span className="shrink-0 bg-rose-950 text-rose-400 border border-rose-800 text-[10px] font-extrabold px-2 py-0.5 rounded-full">
                            🔴 STOK YOK
                          </span>
                        ) : isCritical ? (
                          <span className="shrink-0 bg-amber-950 text-amber-300 border border-amber-800 text-[10px] font-extrabold px-2 py-0.5 rounded-full flex items-center gap-1">
                            <AlertTriangle className="w-3 h-3 text-amber-400" /> KRİTİK STOK
                          </span>
                        ) : null}
                      </div>

                      <div className="flex flex-wrap items-center gap-x-2 text-xs text-slate-400 mt-1">
                        {p.brand && <span className="font-medium text-slate-300">{p.brand}</span>}
                        {p.barcode && (
                          <span className="font-mono text-[11px] text-slate-500">
                            #{p.barcode}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* HUGE PROMINENT STOCK COUNT (2 SEC READING ON MOBILE) */}
                    <div
                      className={`p-3.5 rounded-xl border flex items-center justify-between ${
                        isNegative
                          ? 'bg-rose-950/60 border-rose-800 text-rose-300'
                          : isOut
                          ? 'bg-rose-950/40 border-rose-900 text-rose-400'
                          : isCritical
                          ? 'bg-amber-950/50 border-amber-800 text-amber-300'
                          : 'bg-slate-950 border-slate-800 text-emerald-400'
                      }`}
                    >
                      <div>
                        <span className="text-[10px] font-black uppercase tracking-wider block opacity-75">
                          MEVCUT STOK
                        </span>
                        <div className="text-2xl sm:text-3xl font-black tracking-tight leading-none mt-0.5">
                          {formatNumber(stock)}{' '}
                          <span className="text-xs font-bold uppercase opacity-80">
                            {p.unit || 'ADET'}
                          </span>
                        </div>
                      </div>

                      <div className="text-right">
                        <span className="text-[10px] font-medium text-slate-400 block">Stok Değeri</span>
                        <span className="text-xs sm:text-sm font-extrabold text-white">
                          {formatCurrency(stockValue)}
                        </span>
                      </div>
                    </div>

                    {/* Footer: Prices & Details Action */}
                    <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
                      <div>
                        <span className="text-slate-500">Alış:</span>{' '}
                        <span className="font-bold text-slate-300">{formatCurrency(pPrice)}</span>
                      </div>

                      <div>
                        <span className="text-slate-500">Satış:</span>{' '}
                        <span className="font-extrabold text-white">{formatCurrency(sPrice)}</span>
                      </div>

                      <div className="text-indigo-400 group-hover:translate-x-0.5 transition-transform font-bold flex items-center text-[11px]">
                        <span>Detay</span>
                        <Eye className="w-3.5 h-3.5 ml-1" />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            /* DENSE TABLE VIEW FOR DESKTOP */
            <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-950 text-slate-400 uppercase tracking-wider font-semibold border-b border-slate-800">
                    <tr>
                      <th className="p-4">Ürün Adı & Marka</th>
                      <th className="p-4">Barkod</th>
                      <th className="p-4 text-center">Mevcut Stok</th>
                      <th className="p-4 text-right">Alış Fiyatı</th>
                      <th className="p-4 text-right">Satış Fiyatı</th>
                      <th className="p-4 text-right">Toplam Stok Değeri</th>
                      <th className="p-4 text-center">Stok Durumu</th>
                      <th className="p-4 text-right">İşlem</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/70 text-slate-200">
                    {filteredProducts.map((p) => {
                      const stock = Number(p.current_stock || 0);
                      const minStock = Number(p.minimum_stock || 0);
                      const pPrice = Number(p.purchase_price || 0);
                      const sPrice = Number(p.sale_price || 0);
                      const stockValue = Math.max(0, stock) * pPrice;

                      const isOut = stock === 0;
                      const isNegative = stock < 0;
                      const isCritical = stock > 0 && stock <= minStock;

                      return (
                        <tr
                          key={p.id}
                          onClick={() => openProductDetail(p.id)}
                          className="hover:bg-slate-800/50 transition-colors cursor-pointer"
                        >
                          <td className="p-4 font-bold text-white text-sm">
                            <div>{p.product_name}</div>
                            <div className="text-[11px] text-slate-400 font-normal">
                              {p.brand || 'Markasız'} {p.category ? `• ${p.category}` : ''}
                            </div>
                          </td>

                          <td className="p-4 font-mono text-slate-400">
                            {p.barcode || '-'}
                          </td>

                          <td className="p-4 text-center font-black text-sm">
                            <span
                              className={`inline-block px-3 py-1 rounded-xl border ${
                                isNegative
                                  ? 'bg-rose-950 text-rose-300 border-rose-800'
                                  : isOut
                                  ? 'bg-rose-950 text-rose-400 border-rose-900'
                                  : isCritical
                                  ? 'bg-amber-950 text-amber-300 border-amber-800'
                                  : 'bg-slate-950 text-emerald-400 border-slate-800'
                              }`}
                            >
                              {formatNumber(stock)} {p.unit || 'Adet'}
                            </span>
                          </td>

                          <td className="p-4 text-right font-medium text-slate-300">
                            {formatCurrency(pPrice)}
                          </td>

                          <td className="p-4 text-right font-bold text-white">
                            {formatCurrency(sPrice)}
                          </td>

                          <td className="p-4 text-right font-extrabold text-amber-400">
                            {formatCurrency(stockValue)}
                          </td>

                          <td className="p-4 text-center">
                            {isNegative ? (
                              <span className="bg-rose-950 text-rose-300 border border-rose-800 text-[10px] font-extrabold px-2 py-0.5 rounded-full">
                                ⚠️ NEGATİF STOK
                              </span>
                            ) : isOut ? (
                              <span className="bg-rose-950 text-rose-400 border border-rose-800 text-[10px] font-extrabold px-2 py-0.5 rounded-full">
                                🔴 STOK YOK
                              </span>
                            ) : isCritical ? (
                              <span className="bg-amber-950 text-amber-300 border border-amber-800 text-[10px] font-extrabold px-2 py-0.5 rounded-full">
                                ⚠️ KRİTİK STOK
                              </span>
                            ) : (
                              <span className="bg-slate-800 text-slate-300 text-[10px] font-bold px-2 py-0.5 rounded-full">
                                Normal
                              </span>
                            )}
                          </td>

                          <td className="p-4 text-right">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                openProductDetail(p.id);
                              }}
                              className="p-1.5 text-indigo-400 hover:text-white bg-indigo-950/40 hover:bg-indigo-600 rounded-lg transition-colors"
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: STOK HAREKETLERİ (STOCK MOVEMENTS LOG AUDIT) */}
      {/* ========================================================================= */}
      {activeTab === 'movements' && (
        <div className="space-y-6">
          {/* Filters for Movements */}
          <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl flex flex-col sm:flex-row items-center gap-3">
            <div className="relative flex-1 w-full">
              <Search className="w-4 h-4 absolute left-3.5 top-3 text-slate-500" />
              <input
                type="text"
                value={movementSearch}
                onChange={(e) => setMovementSearch(e.target.value)}
                placeholder="Ürün adı veya açıklama ile arayın..."
                className="w-full bg-slate-950 border border-slate-700 focus:border-indigo-500 rounded-xl py-2 pl-10 pr-4 text-xs sm:text-sm text-slate-100 placeholder-slate-500 outline-none"
              />
            </div>

            <div className="w-full sm:w-56">
              <select
                value={movementTypeFilter}
                onChange={(e) => setMovementTypeFilter(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 focus:border-indigo-500 rounded-xl p-2 text-xs text-slate-100 outline-none"
              >
                <option value="ALL">Tüm Stok Hareketleri</option>
                <option value="PURCHASE">Mal Girişleri (+)</option>
                <option value="SALE">Satış Çıkışları (-)</option>
                <option value="RETURN">İadeler (+)</option>
                <option value="ADJUSTMENT">Sayım Düzeltmeleri</option>
                <option value="DAMAGE">Zayiat/Hasar (-)</option>
              </select>
            </div>
          </div>

          {/* Movements Table */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
            {loadingMovements ? (
              <div className="p-12 text-center text-slate-400 flex flex-col items-center">
                <Loader2 className="w-8 h-8 animate-spin text-indigo-500 mb-2" />
                <span>Stok Geçmişi Yükleniyor...</span>
              </div>
            ) : filteredMovements.length === 0 ? (
              <div className="p-12 text-center text-slate-500 text-sm">
                Kayıtlı stok hareketi bulunamadı.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-950 text-slate-400 uppercase tracking-wider font-semibold border-b border-slate-800">
                    <tr>
                      <th className="p-4">Tarih / Saat</th>
                      <th className="p-4">Ürün Bilgisi</th>
                      <th className="p-4 text-center">İşlem Tipi</th>
                      <th className="p-4 text-center">Miktar</th>
                      <th className="p-4 text-right">Birim Alış Maliyeti</th>
                      <th className="p-4">Açıklama / Not</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/70 text-slate-200">
                    {filteredMovements.map((m) => (
                      <tr key={m.id} className="hover:bg-slate-800/40 transition-colors">
                        <td className="p-4 font-mono text-slate-400">
                          {formatDateTime(m.created_at)}
                        </td>

                        <td className="p-4 font-bold text-slate-100">
                          {m.products?.product_name || 'Bilinmeyen Ürün'}
                        </td>

                        <td className="p-4 text-center">
                          <span
                            className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase border ${getMovementBadgeStyle(
                              m.movement_type
                            )}`}
                          >
                            {getMovementLabel(m.movement_type)}
                          </span>
                        </td>

                        <td className="p-4 text-center font-extrabold text-sm text-white">
                          {m.movement_type === 'PURCHASE' || m.movement_type === 'RETURN' ? '+' : m.movement_type === 'SALE' || m.movement_type === 'DAMAGE' ? '-' : ''}
                          {formatNumber(m.quantity)} {m.products?.unit || 'Adet'}
                        </td>

                        <td className="p-4 text-right font-medium text-slate-300">
                          {formatCurrency(m.unit_cost)}
                        </td>

                        <td className="p-4 text-slate-400 max-w-xs truncate">
                          {m.note || '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Product Stock Detail Modal */}
      <ProductStockDetailModal
        isOpen={detailModalOpen}
        onClose={() => setDetailModalOpen(false)}
        productId={selectedProductId}
        onOpenStockEntry={(prodId) => openStockEntryModal(prodId)}
      />
    </div>
  );
};
