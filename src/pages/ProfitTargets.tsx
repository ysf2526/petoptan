import React, { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { parseErrorMessage } from '@/utils/errors';
import {
  formatCurrency,
  formatNumber,
  getISOYearMonth,
  getDaysInCurrentMonth,
  getRemainingDaysInCurrentMonth,
  calculateUnitProfit,
} from '@/utils/formatters';
import { Product } from '@/types/database.types';
import {
  TrendingUp,
  Target,
  Calendar,
  Sparkles,
  CheckCircle2,
  Loader2,
  Edit2,
  DollarSign,
  Package,
  Search,
  Filter,
  RefreshCw,
  RotateCcw,
  Sliders,
  Plus,
  Minus,
  AlertTriangle,
} from 'lucide-react';

interface SuggestedProductItem {
  product_id: string;
  product_name: string;
  brand?: string | null;
  category?: string | null;
  unit: string;
  purchase_price: number;
  sale_price: number;
  unit_profit: number;
  past_sales_qty: number;
  suggested_qty: number;
}

export const ProfitTargets: React.FC = () => {
  const { user } = useAuth();
  const { showSuccess, showError } = useToast();

  const [loading, setLoading] = useState(true);
  const [savingTarget, setSavingTarget] = useState(false);

  const { year, month } = getISOYearMonth();
  const [targetAmount, setTargetAmount] = useState<number>(100000);
  const [newTargetInput, setNewTargetInput] = useState<string>('100000');
  const [isEditingTarget, setIsEditingTarget] = useState(false);

  const [realizedProfit, setRealizedProfit] = useState<number>(0);
  const [totalMonthlySales, setTotalMonthlySales] = useState<number>(0);

  // Suggestions state (All products in database)
  const [suggestedItems, setSuggestedItems] = useState<SuggestedProductItem[]>([]);

  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [filterType, setFilterType] = useState<'ALL' | 'SUGGESTED' | 'BESTSELLERS'>('ALL');

  const fetchProfitData = useCallback(async () => {
    setLoading(true);
    try {
      const firstDayOfMonth = new Date(year, month - 1, 1).toISOString();

      // 1. Fetch Target for current month
      const { data: tData } = await supabase
        .from('profit_targets')
        .select('*')
        .eq('year', year)
        .eq('month', month)
        .maybeSingle();

      const tgt = Number(tData?.target_profit || 100000);
      setTargetAmount(tgt);
      setNewTargetInput(String(tgt));

      // 2. Fetch realized profit for current month
      const { data: salesData } = await supabase
        .from('sales')
        .select('total_amount, total_profit')
        .gte('created_at', firstDayOfMonth)
        .is('deleted_at', null);

      const mProfit = salesData?.reduce((sum, s) => sum + Number(s.total_profit || 0), 0) || 0;
      const mSales = salesData?.reduce((sum, s) => sum + Number(s.total_amount || 0), 0) || 0;

      setRealizedProfit(mProfit);
      setTotalMonthlySales(mSales);

      // 3. Automated Sales Suggestion calculation for ALL active products
      const remainingProfitNeeded = Math.max(0, tgt - mProfit);

      const { data: prods } = await supabase
        .from('products')
        .select('*')
        .eq('active', true)
        .is('deleted_at', null)
        .order('product_name', { ascending: true });

      const { data: pastSaleItems } = await supabase
        .from('sale_items')
        .select('product_id, quantity')
        .is('deleted_at', null);

      const pastQtyMap: Record<string, number> = {};
      pastSaleItems?.forEach((it) => {
        pastQtyMap[it.product_id] = (pastQtyMap[it.product_id] || 0) + Number(it.quantity || 0);
      });

      const allProductItems: SuggestedProductItem[] = (prods || []).map((p) => {
        const uProfit = calculateUnitProfit(p.purchase_price, p.sale_price);
        return {
          product_id: p.id,
          product_name: p.product_name,
          brand: p.brand,
          category: p.category || 'Kategorisiz',
          unit: p.unit || 'Adet',
          purchase_price: Number(p.purchase_price || 0),
          sale_price: Number(p.sale_price || 0),
          unit_profit: Math.max(0, uProfit),
          past_sales_qty: pastQtyMap[p.id] || 0,
          suggested_qty: 0,
        };
      });

      // Sort initially by sales velocity, then unit profit
      allProductItems.sort((a, b) => b.past_sales_qty - a.past_sales_qty || b.unit_profit - a.unit_profit);

      if (remainingProfitNeeded > 0 && allProductItems.length > 0) {
        // Calculate smart proportional distribution across ALL products
        const validProds = allProductItems.filter((p) => p.unit_profit > 0);
        const totalWeight = validProds.reduce(
          (acc, curr) => acc + (curr.past_sales_qty + 1) * curr.unit_profit,
          0
        );

        const distributed = allProductItems.map((p) => {
          if (p.unit_profit <= 0 || totalWeight <= 0) return p;
          const weight = ((p.past_sales_qty + 1) * p.unit_profit) / totalWeight;
          const targetProfitShare = remainingProfitNeeded * weight;
          const suggestedQty = Math.ceil(targetProfitShare / p.unit_profit);
          return {
            ...p,
            suggested_qty: suggestedQty,
          };
        });

        setSuggestedItems(distributed);
      } else {
        setSuggestedItems(allProductItems);
      }
    } catch (err) {
      console.error(err);
      showError('Veriler yüklenirken hata oluştu.');
    } finally {
      setLoading(false);
    }
  }, [year, month, showError]);

  useEffect(() => {
    fetchProfitData();
  }, [fetchProfitData]);

  const handleSaveTarget = async () => {
    if (!user) return;
    const num = Number(newTargetInput);
    if (isNaN(num) || num < 0) {
      showError('Lütfen geçerli bir kâr hedefi tutarı girin.');
      return;
    }

    setSavingTarget(true);
    try {
      const { error } = await supabase
        .from('profit_targets')
        .upsert(
          {
            owner_id: user.id,
            year,
            month,
            target_profit: num,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'owner_id,month,year' }
        );

      if (error) throw error;
      showSuccess('Aylık kâr hedefiniz başarıyla güncellendi!');
      setIsEditingTarget(false);
      fetchProfitData();
    } catch (err) {
      showError(parseErrorMessage(err));
    } finally {
      setSavingTarget(false);
    }
  };

  const handleUpdateSuggestedQty = (productId: string, val: number) => {
    setSuggestedItems((prev) =>
      prev.map((item) =>
        item.product_id === productId
          ? { ...item, suggested_qty: Math.max(0, val) }
          : item
      )
    );
  };

  // Distribution Helper Presets
  const handleAutoDistributeSmart = () => {
    const remainingNeeded = Math.max(0, targetAmount - realizedProfit);
    if (remainingNeeded <= 0) {
      setSuggestedItems((prev) => prev.map((p) => ({ ...p, suggested_qty: 0 })));
      showSuccess('Hedef zaten tamamlanmış.');
      return;
    }

    const validProds = suggestedItems.filter((p) => p.unit_profit > 0);
    const totalWeight = validProds.reduce(
      (acc, p) => acc + (p.past_sales_qty + 1) * p.unit_profit,
      0
    );

    if (totalWeight <= 0) return;

    setSuggestedItems((prev) =>
      prev.map((p) => {
        if (p.unit_profit <= 0) return { ...p, suggested_qty: 0 };
        const weight = ((p.past_sales_qty + 1) * p.unit_profit) / totalWeight;
        const targetShare = remainingNeeded * weight;
        const suggestedQty = Math.ceil(targetShare / p.unit_profit);
        return { ...p, suggested_qty: suggestedQty };
      })
    );
    showSuccess('Satış hedefleri tüm ürünlere akıllı olarak dağıtıldı.');
  };

  const handleAutoDistributeEqual = () => {
    const remainingNeeded = Math.max(0, targetAmount - realizedProfit);
    const validProds = suggestedItems.filter((p) => p.unit_profit > 0);
    if (validProds.length === 0) return;

    const perProductNeeded = remainingNeeded / validProds.length;

    setSuggestedItems((prev) =>
      prev.map((p) => {
        if (p.unit_profit <= 0) return { ...p, suggested_qty: 0 };
        const suggestedQty = Math.ceil(perProductNeeded / p.unit_profit);
        return { ...p, suggested_qty: suggestedQty };
      })
    );
    showSuccess('Kâr hedefi tüm kârlı ürünlere eşit dağıtıldı.');
  };

  const handleResetSuggested = () => {
    setSuggestedItems((prev) => prev.map((p) => ({ ...p, suggested_qty: 0 })));
    showSuccess('Satış miktarları sıfırlandı.');
  };

  // Metrics
  const remainingProfit = Math.max(0, targetAmount - realizedProfit);
  const targetPercentage = targetAmount > 0 ? Math.min(100, Math.round((realizedProfit / targetAmount) * 100)) : 0;
  const daysInMonth = getDaysInCurrentMonth();
  const remainingDays = getRemainingDaysInCurrentMonth();
  const currentDayOfMonth = new Date().getDate();

  const requiredDailyProfit = remainingDays > 0 ? Number((remainingProfit / remainingDays).toFixed(2)) : 0;

  const avgDailyProfitSoFar = currentDayOfMonth > 0 ? realizedProfit / currentDayOfMonth : 0;
  const projectedEndMonthProfit = Math.round(realizedProfit + avgDailyProfitSoFar * remainingDays);

  const suggestedTotalProfit = suggestedItems.reduce(
    (acc, curr) => acc + curr.suggested_qty * curr.unit_profit,
    0
  );

  const coveragePercent = remainingProfit > 0
    ? Math.round((suggestedTotalProfit / remainingProfit) * 100)
    : 100;

  // Categories for filter dropdown
  const categories = Array.from(new Set(suggestedItems.map((item) => item.category).filter(Boolean))) as string[];

  // Filtered Products
  const filteredItems = suggestedItems.filter((item) => {
    const query = searchQuery.toLowerCase().trim();
    const matchesSearch =
      !query ||
      item.product_name.toLowerCase().includes(query) ||
      (item.brand && item.brand.toLowerCase().includes(query)) ||
      (item.category && item.category.toLowerCase().includes(query));

    const matchesCat = selectedCategory === 'ALL' || item.category === selectedCategory;

    const matchesFilterType =
      filterType === 'ALL' ||
      (filterType === 'SUGGESTED' && item.suggested_qty > 0) ||
      (filterType === 'BESTSELLERS' && item.past_sales_qty > 0);

    return matchesSearch && matchesCat && matchesFilterType;
  });

  return (
    <div className="space-y-6 pb-12 animate-fadeIn">
      {/* Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900 border border-slate-800 p-4 sm:p-6 rounded-2xl">
        <div>
          <h2 className="text-xl font-bold text-white tracking-tight">Aylık Kâr Hedefleri & Satış Planlama</h2>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Finansal hedefinizi belirleyin, tüm ürün portföyünüz ({suggestedItems.length} ürün) üzerinden hedef kâra ulaşmak için satış miktarlarını planlayın.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-slate-300 bg-slate-800 border border-slate-700 px-3 py-2 rounded-xl">
            Dönem: {new Date().toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' })}
          </span>
        </div>
      </div>

      {loading ? (
        <div className="p-12 text-center text-slate-400 flex flex-col items-center">
          <Loader2 className="w-8 h-8 animate-spin text-brand-500 mb-2" />
          <span>Tüm Ürün Portföyü & Kâr Analizi Hesaplanıyor...</span>
        </div>
      ) : (
        <>
          {/* TARGET DASHBOARD CARD */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-6">
            {/* Target Value Editor Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800/80 pb-5">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-brand-600 to-indigo-600 flex items-center justify-center text-white shadow-lg shadow-brand-500/20">
                  <Target className="w-6 h-6" />
                </div>
                <div>
                  <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">Belirlenen Aylık Kâr Hedefi</span>
                  {isEditingTarget ? (
                    <div className="flex items-center gap-2 mt-1">
                      <input
                        type="number"
                        value={newTargetInput}
                        onChange={(e) => setNewTargetInput(e.target.value)}
                        className="bg-slate-950 border border-brand-500 rounded-xl px-3 py-1.5 text-white font-extrabold text-lg outline-none w-44"
                      />
                      <button
                        onClick={handleSaveTarget}
                        disabled={savingTarget}
                        className="bg-brand-600 hover:bg-brand-500 text-white font-bold px-3 py-2 rounded-xl text-xs flex items-center gap-1"
                      >
                        {savingTarget ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                        <span>Kaydet</span>
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-baseline gap-3">
                      <span className="text-2xl sm:text-3xl font-black text-white">{formatCurrency(targetAmount)}</span>
                      <button
                        onClick={() => setIsEditingTarget(true)}
                        className="text-xs font-semibold text-brand-400 hover:underline flex items-center gap-1"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                        <span>Hedefi Değiştir</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>

              <div className="text-right sm:border-l border-slate-800 sm:pl-6">
                <span className="text-xs text-slate-400 block font-medium">Hedef Gerçekleşme Yüzdesi</span>
                <span className="text-2xl font-black text-brand-400">%{targetPercentage}</span>
              </div>
            </div>

            {/* Progress Bar */}
            <div className="space-y-2">
              <div className="flex justify-between text-xs font-semibold">
                <span className="text-emerald-400">Gerçekleşen Kâr: {formatCurrency(realizedProfit)}</span>
                <span className="text-amber-400">Kalan Hedef Kâr: {formatCurrency(remainingProfit)}</span>
              </div>
              <div className="w-full bg-slate-950 h-3.5 rounded-full overflow-hidden border border-slate-800 p-0.5">
                <div
                  className="bg-gradient-to-r from-brand-500 via-indigo-500 to-emerald-400 h-full rounded-full transition-all duration-700"
                  style={{ width: `${targetPercentage}%` }}
                />
              </div>
            </div>

            {/* METRICS STRIP FOR TARGET CALCULATIONS */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 pt-2">
              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
                <span className="text-xs text-slate-400 font-medium block">Kalan Gün Sayısı</span>
                <span className="text-xl font-extrabold text-white block mt-1">{remainingDays} Gün</span>
                <span className="text-[11px] text-slate-500 block mt-0.5">Toplam {daysInMonth} Günlük Ay</span>
              </div>

              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
                <span className="text-xs text-slate-400 font-medium block">Günlük Gerekli Ortalama Kâr</span>
                <span className="text-xl font-extrabold text-amber-400 block mt-1">{formatCurrency(requiredDailyProfit)}</span>
                <span className="text-[11px] text-slate-500 block mt-0.5">Hedefe Ulaşmak İçin</span>
              </div>

              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
                <span className="text-xs text-slate-400 font-medium block">Gerçekleşen Net Kâr</span>
                <span className="text-xl font-extrabold text-emerald-400 block mt-1">{formatCurrency(realizedProfit)}</span>
                <span className="text-[11px] text-slate-500 block mt-0.5">Bu Ayki Satış Kârı</span>
              </div>

              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
                <span className="text-xs text-slate-400 font-medium block">Tahmini Ay Sonu Kârı</span>
                <span className="text-xl font-extrabold text-indigo-400 block mt-1">{formatCurrency(projectedEndMonthProfit)}</span>
                <span className="text-[11px] text-slate-500 block mt-0.5">Mevcut Satış Hızına Göre</span>
              </div>
            </div>
          </div>

          {/* AUTOMATED SALES PLANNER FOR ALL PRODUCTS */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-5">
            {/* Header & Controls */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-800 pb-5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-purple-600/20 border border-purple-500/30 flex items-center justify-center text-purple-400 shrink-0">
                  <Sparkles className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-white text-base">Tüm Ürünler İçin Satış Hedefi Planlayıcı</h3>
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-black bg-purple-950 text-purple-300 border border-purple-800/60">
                      {suggestedItems.length} Ürün Portföyü
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Tüm aktif ürünlerinizin kâr marjını ve satış hızını kullanarak kalan {formatCurrency(remainingProfit)} kâr hedefine ulaşın.
                  </p>
                </div>
              </div>

              {/* Distribution Action Buttons */}
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={handleAutoDistributeSmart}
                  className="bg-purple-600 hover:bg-purple-500 text-white font-extrabold px-3.5 py-2 rounded-xl text-xs flex items-center gap-1.5 shadow-lg shadow-purple-600/20 transition-all active:scale-95"
                  title="Satış hızına ve birim kâra göre akıllı dağıt"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>⚡ Akıllı Dağıt</span>
                </button>

                <button
                  onClick={handleAutoDistributeEqual}
                  className="bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-bold px-3 py-2 rounded-xl text-xs flex items-center gap-1.5 transition-all"
                  title="Kâr hedefini tüm kârlı ürünlere eşit dağıt"
                >
                  <Sliders className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Eşit Dağıt</span>
                </button>

                <button
                  onClick={handleResetSuggested}
                  className="bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-rose-400 border border-slate-700 font-bold px-3 py-2 rounded-xl text-xs flex items-center gap-1.5 transition-all"
                  title="Satış miktarlarını temizle"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Sıfırla</span>
                </button>
              </div>
            </div>

            {/* Target Plan Live Summary Banner */}
            <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 grid grid-cols-1 sm:grid-cols-3 gap-4 items-center">
              <div>
                <span className="text-xs text-slate-400 block font-semibold">Planlanan Ürün Satış Kârı</span>
                <span className="text-xl font-black text-emerald-400">{formatCurrency(suggestedTotalProfit)}</span>
              </div>

              <div>
                <span className="text-xs text-slate-400 block font-semibold">Gerekli Kalan Kâr</span>
                <span className="text-xl font-black text-amber-400">{formatCurrency(remainingProfit)}</span>
              </div>

              <div className="flex items-center gap-3 justify-between sm:justify-end border-t sm:border-t-0 sm:border-l border-slate-800 pt-2 sm:pt-0 sm:pl-4">
                <div>
                  <span className="text-xs text-slate-400 block font-semibold">Kâr Hedefi Karşılama Oranı</span>
                  <span className={`text-xl font-black ${coveragePercent >= 100 ? 'text-emerald-400' : 'text-purple-400'}`}>
                    %{coveragePercent}
                  </span>
                </div>
                {coveragePercent >= 100 ? (
                  <span className="px-3 py-1 rounded-lg bg-emerald-950 text-emerald-300 text-xs font-bold border border-emerald-800">
                    🎯 Hedef Karşılandı
                  </span>
                ) : (
                  <span className="px-3 py-1 rounded-lg bg-amber-950 text-amber-300 text-xs font-bold border border-amber-800">
                    ⚠️ Kalan Açık Var
                  </span>
                )}
              </div>
            </div>

            {/* Filter & Search Bar */}
            <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-4 gap-3 items-center pt-1">
              <div className="relative sm:col-span-2">
                <Search className="w-4 h-4 absolute left-3.5 top-3 text-slate-500" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Ürün adı, marka veya kategori ara..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl py-2 pl-10 pr-4 text-xs text-white placeholder-slate-500 outline-none focus:border-purple-500"
                />
              </div>

              <div>
                <select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2 text-xs text-slate-200 outline-none focus:border-purple-500 font-semibold"
                >
                  <option value="ALL">Tüm Kategoriler ({categories.length})</option>
                  {categories.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-1 text-xs">
                <button
                  onClick={() => setFilterType('ALL')}
                  className={`flex-1 py-2 px-2 rounded-lg font-extrabold text-[11px] transition-all ${
                    filterType === 'ALL' ? 'bg-purple-600 text-white' : 'bg-slate-950 text-slate-400 hover:text-white'
                  }`}
                >
                  Tümü ({suggestedItems.length})
                </button>

                <button
                  onClick={() => setFilterType('SUGGESTED')}
                  className={`flex-1 py-2 px-2 rounded-lg font-extrabold text-[11px] transition-all ${
                    filterType === 'SUGGESTED' ? 'bg-purple-600 text-white' : 'bg-slate-950 text-slate-400 hover:text-white'
                  }`}
                >
                  Hedeftekiler ({suggestedItems.filter((i) => i.suggested_qty > 0).length})
                </button>

                <button
                  onClick={() => setFilterType('BESTSELLERS')}
                  className={`flex-1 py-2 px-2 rounded-lg font-extrabold text-[11px] transition-all ${
                    filterType === 'BESTSELLERS' ? 'bg-purple-600 text-white' : 'bg-slate-950 text-slate-400 hover:text-white'
                  }`}
                >
                  Çok Satanlar ({suggestedItems.filter((i) => i.past_sales_qty > 0).length})
                </button>
              </div>
            </div>

            {/* Products Table */}
            {filteredItems.length === 0 ? (
              <div className="p-8 text-center bg-slate-950 rounded-xl border border-slate-800 text-xs text-slate-500">
                Arama kriterlerine uygun ürün bulunamadı.
              </div>
            ) : (
              <div className="border border-slate-800 rounded-xl overflow-hidden bg-slate-950 shadow-inner">
                <div className="overflow-x-auto max-h-[600px] custom-scrollbar">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-900 text-slate-400 uppercase font-semibold border-b border-slate-800 sticky top-0 z-10">
                      <tr>
                        <th className="p-3">Ürün Bilgisi</th>
                        <th className="p-3 text-right">Satış Fiyatı</th>
                        <th className="p-3 text-right">Birim Kâr</th>
                        <th className="p-3 text-center">Geçmiş Satış Adedi</th>
                        <th className="p-3 text-center w-44">Hedeflenen Satış Adedi</th>
                        <th className="p-3 text-right">Hedef Kâr Katkısı</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/70 text-slate-200">
                      {filteredItems.map((item) => {
                        const itemContribution = item.suggested_qty * item.unit_profit;
                        return (
                          <tr
                            key={item.product_id}
                            className={`hover:bg-slate-900/80 transition-colors ${
                              item.suggested_qty > 0 ? 'bg-purple-950/20' : ''
                            }`}
                          >
                            <td className="p-3">
                              <div className="font-bold text-white text-xs">{item.product_name}</div>
                              <span className="text-[11px] text-slate-400">
                                {item.brand || 'Markasız'} • {item.category} ({item.unit})
                              </span>
                            </td>

                            <td className="p-3 text-right font-medium text-slate-300">
                              {formatCurrency(item.sale_price)}
                            </td>

                            <td className="p-3 text-right font-bold text-emerald-400">
                              {formatCurrency(item.unit_profit)}
                            </td>

                            <td className="p-3 text-center text-slate-400 font-mono">
                              {formatNumber(item.past_sales_qty)} {item.unit}
                            </td>

                            <td className="p-3 text-center">
                              <div className="flex items-center justify-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => handleUpdateSuggestedQty(item.product_id, item.suggested_qty - 1)}
                                  className="w-7 h-7 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-300 transition-all"
                                >
                                  <Minus className="w-3 h-3" />
                                </button>

                                <input
                                  type="number"
                                  min={0}
                                  value={item.suggested_qty}
                                  onChange={(e) =>
                                    handleUpdateSuggestedQty(item.product_id, Number(e.target.value))
                                  }
                                  className="w-16 bg-slate-900 border border-purple-500/50 rounded-lg p-1.5 text-center text-xs font-black text-white outline-none focus:border-purple-400 font-mono"
                                />

                                <button
                                  type="button"
                                  onClick={() => handleUpdateSuggestedQty(item.product_id, item.suggested_qty + 1)}
                                  className="w-7 h-7 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-300 transition-all"
                                >
                                  <Plus className="w-3 h-3" />
                                </button>
                              </div>
                            </td>

                            <td className="p-3 text-right font-black text-purple-300">
                              {formatCurrency(itemContribution)}
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
        </>
      )}
    </div>
  );
};
