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
} from 'lucide-react';

interface SuggestedProductItem {
  product_id: string;
  product_name: string;
  unit: string;
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

  // Suggestions state
  const [suggestedItems, setSuggestedItems] = useState<SuggestedProductItem[]>([]);

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

      // 3. Automated Sales Suggestion calculation
      const remainingProfitNeeded = Math.max(0, tgt - mProfit);

      const { data: prods } = await supabase
        .from('products')
        .select('*')
        .eq('active', true)
        .is('deleted_at', null);

      const { data: pastSaleItems } = await supabase
        .from('sale_items')
        .select('product_id, quantity')
        .is('deleted_at', null);

      const pastQtyMap: Record<string, number> = {};
      pastSaleItems?.forEach((it) => {
        pastQtyMap[it.product_id] = (pastQtyMap[it.product_id] || 0) + Number(it.quantity || 0);
      });

      // Filter products with positive unit profit
      const validProds = (prods || []).map((p) => {
        const uProfit = calculateUnitProfit(p.purchase_price, p.sale_price);
        return {
          product_id: p.id,
          product_name: p.product_name,
          unit: p.unit,
          unit_profit: Math.max(0.01, uProfit),
          past_sales_qty: pastQtyMap[p.id] || 0,
        };
      }).filter((p) => p.unit_profit > 0);

      // Sort by popularity / past sales or unit profit
      validProds.sort((a, b) => b.past_sales_qty - a.past_sales_qty || b.unit_profit - a.unit_profit);

      if (remainingProfitNeeded > 0 && validProds.length > 0) {
        // Distribute remaining profit requirement proportionally to past sales velocity & unit profit
        const topN = validProds.slice(0, 8); // Top 8 products
        const totalWeight = topN.reduce((acc, curr) => acc + (curr.past_sales_qty + 1) * curr.unit_profit, 0);

        const suggestions: SuggestedProductItem[] = topN.map((p) => {
          const weight = ((p.past_sales_qty + 1) * p.unit_profit) / totalWeight;
          const targetProfitShare = remainingProfitNeeded * weight;
          const suggestedQty = Math.ceil(targetProfitShare / p.unit_profit);

          return {
            ...p,
            suggested_qty: suggestedQty,
          };
        });

        setSuggestedItems(suggestions);
      } else {
        setSuggestedItems([]);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [year, month]);

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

  const handleUpdateSuggestedQty = (index: number, val: number) => {
    setSuggestedItems((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], suggested_qty: Math.max(0, val) };
      return updated;
    });
  };

  // Metric Calculations
  const remainingProfit = Math.max(0, targetAmount - realizedProfit);
  const targetPercentage = targetAmount > 0 ? Math.min(100, Math.round((realizedProfit / targetAmount) * 100)) : 0;
  const daysInMonth = getDaysInCurrentMonth();
  const remainingDays = getRemainingDaysInCurrentMonth();
  const currentDayOfMonth = new Date().getDate();

  const requiredDailyProfit = remainingDays > 0 ? Number((remainingProfit / remainingDays).toFixed(2)) : 0;

  // Projection based on current daily run-rate
  const avgDailyProfitSoFar = currentDayOfMonth > 0 ? realizedProfit / currentDayOfMonth : 0;
  const projectedEndMonthProfit = Math.round(realizedProfit + avgDailyProfitSoFar * remainingDays);

  const suggestedTotalProfit = suggestedItems.reduce(
    (acc, curr) => acc + curr.suggested_qty * curr.unit_profit,
    0
  );

  return (
    <div className="space-y-6 pb-8">
      {/* Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900 border border-slate-800 p-4 sm:p-6 rounded-2xl">
        <div>
          <h2 className="text-xl font-bold text-white tracking-tight">Aylık Kâr Hedefleri & Satış Önerileri</h2>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Finansal hedefinizi belirleyin, ay sonu kâr projeksiyonunu takip edin ve hedefe ulaşmak için otomatik ürün satış önerilerini inceleyin.
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
          <span>Hedef ve Kâr Analizi Hesaplanıyor...</span>
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
                <span className="text-emerald-400">Gerçekleşen: {formatCurrency(realizedProfit)}</span>
                <span className="text-amber-400">Kalan: {formatCurrency(remainingProfit)}</span>
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
                <span className="text-xs text-slate-400 font-medium block">Gerçekleşen Kâr</span>
                <span className="text-xl font-extrabold text-emerald-400 block mt-1">{formatCurrency(realizedProfit)}</span>
                <span className="text-[11px] text-slate-500 block mt-0.5">Bu Ayki Net Kâr</span>
              </div>

              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
                <span className="text-xs text-slate-400 font-medium block">Tahmini Ay Sonu Kârı</span>
                <span className="text-xl font-extrabold text-indigo-400 block mt-1">{formatCurrency(projectedEndMonthProfit)}</span>
                <span className="text-[11px] text-slate-500 block mt-0.5">Mevcut Satış Hızına Göre</span>
              </div>
            </div>
          </div>

          {/* AUTOMATED SALES SUGGESTIONS ENGINE (Prompt Section 15) */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-purple-600/20 border border-purple-500/30 flex items-center justify-center text-purple-400">
                  <Sparkles className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-white text-base">Akıllı Satış Hedefi Önerileri</h3>
                  <p className="text-xs text-slate-400">
                    Kâr hedefine ulaşmak için ürünlerin birim kârı ve satış sıklığı analiz edilerek önerilen ek satış miktarları.
                  </p>
                </div>
              </div>
              {remainingProfit > 0 && (
                <div className="text-right text-xs bg-slate-950 px-3.5 py-2 rounded-xl border border-slate-800">
                  <span className="text-slate-400 block">Önerilerin Sağladığı Ek Kâr</span>
                  <span className="font-extrabold text-emerald-400 text-sm">{formatCurrency(suggestedTotalProfit)}</span>
                </div>
              )}
            </div>

            {remainingProfit <= 0 ? (
              <div className="p-8 text-center bg-slate-950/60 rounded-xl border border-emerald-500/30">
                <p className="text-emerald-400 font-bold text-sm">
                  Tebrikler! Bu ayki kâr hedefinizi (%100) başarıyla tamamladınız!
                </p>
              </div>
            ) : suggestedItems.length === 0 ? (
              <p className="p-8 text-center text-xs text-slate-500">
                Öneri oluşturulabilecek aktif ürün bulunamadı. Lütfen yeni ürün kartları ekleyin.
              </p>
            ) : (
              <div className="space-y-3">
                <p className="text-xs text-amber-400 font-medium">
                  Mevcut satış hızına göre hedefe ulaşmak için kalan {formatCurrency(remainingProfit)} kâr ihtiyacına yönelik önerilen ürün satış adetleri:
                </p>

                <div className="border border-slate-800 rounded-xl overflow-hidden bg-slate-950">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-900 text-slate-400 uppercase font-semibold border-b border-slate-800">
                        <tr>
                          <th className="p-3">Ürün Adı</th>
                          <th className="p-3 text-right">Birim Kâr</th>
                          <th className="p-3 text-center">Geçmiş Satış Hızı</th>
                          <th className="p-3 text-center w-36">Önerilen Ek Satış</th>
                          <th className="p-3 text-right">Hedeflenen Katkı (TL)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800 text-slate-200">
                        {suggestedItems.map((item, idx) => (
                          <tr key={item.product_id} className="hover:bg-slate-900/60">
                            <td className="p-3 font-bold text-white">{item.product_name}</td>
                            <td className="p-3 text-right font-semibold text-emerald-400">{formatCurrency(item.unit_profit)}</td>
                            <td className="p-3 text-center text-slate-400">{formatNumber(item.past_sales_qty)} {item.unit}</td>
                            <td className="p-3 text-center">
                              <input
                                type="number"
                                min={0}
                                value={item.suggested_qty}
                                onChange={(e) => handleUpdateSuggestedQty(idx, Number(e.target.value))}
                                className="w-24 bg-slate-900 border border-brand-500/50 rounded-lg p-1.5 text-center text-xs font-extrabold text-white outline-none"
                              />
                            </td>
                            <td className="p-3 text-right font-extrabold text-brand-400">
                              {formatCurrency(item.suggested_qty * item.unit_profit)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};
