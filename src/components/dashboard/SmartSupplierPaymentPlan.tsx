import React, { useEffect, useState } from 'react';
import { useToast } from '@/context/ToastContext';
import { formatCurrency } from '@/utils/formatters';
import {
  calculateSmartPaymentPlan,
  SmartPaymentAnalysis,
  SupplierPaymentPlan,
} from '@/services/smartPaymentEngine';
import { SupplierPaymentModal } from '@/components/modals/SupplierPaymentModal';
import {
  Brain,
  DollarSign,
  TrendingUp,
  ArrowRightLeft,
  ShieldCheck,
  Zap,
  Info,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

interface SmartSupplierPaymentPlanProps {
  onRefreshParent?: () => void;
}

export const SmartSupplierPaymentPlan: React.FC<SmartSupplierPaymentPlanProps> = ({
  onRefreshParent,
}) => {
  const { showError, showSuccess } = useToast();

  const [loading, setLoading] = useState(true);
  const [analysis, setAnalysis] = useState<SmartPaymentAnalysis | null>(null);

  // Expanded explanation card state
  const [expandedSupplierId, setExpandedSupplierId] = useState<string | null>(null);

  // Manual payment amounts state
  const [overrideAmounts, setOverrideAmounts] = useState<{ [supplierId: string]: number }>({});

  // Payment Modal integration state
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [selectedSupplierId, setSelectedSupplierId] = useState<string | null>(null);

  const loadEngine = async () => {
    setLoading(true);
    try {
      const res = await calculateSmartPaymentPlan();
      setAnalysis(res);
      
      // Initialize override amounts with recommended amounts
      const initAmounts: { [id: string]: number } = {};
      res.supplierPlans.forEach((plan) => {
        initAmounts[plan.supplierId] = plan.recommendedCashPayment;
      });
      setOverrideAmounts(initAmounts);
    } catch (err: any) {
      console.error(err);
      showError('Akıllı ödeme planı hesaplanırken bir hata oluştu.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadEngine();
  }, []);

  const handleOpenPaymentModal = (supplierId: string) => {
    setSelectedSupplierId(supplierId);
    setPaymentModalOpen(true);
  };

  const handlePaymentSuccess = () => {
    showSuccess('Tedarikçi ödemesi kaydedildi ve cari hesap güncellendi.');
    loadEngine();
    if (onRefreshParent) onRefreshParent();
  };

  if (loading) {
    return (
      <div className="bg-slate-900 border border-slate-800 p-8 rounded-2xl text-center text-slate-400 flex flex-col items-center">
        <Loader2 className="w-8 h-8 animate-spin text-purple-500 mb-2" />
        <span className="text-sm font-semibold">Akıllı Tedarikçi Ödeme Motoru Hesaplama Yapıyor...</span>
      </div>
    );
  }

  if (!analysis) return null;

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-900 to-purple-950/40 border border-slate-800 p-5 sm:p-6 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xl">
        <div className="flex items-start gap-3.5">
          <div className="w-11 h-11 rounded-2xl bg-purple-600/20 border border-purple-500/40 flex items-center justify-center text-purple-400 shrink-0 shadow-lg shadow-purple-500/10">
            <Brain className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-black text-white tracking-tight">AKILLI TEDARİKÇİ ÖDEME PLANI</h2>
              <span className="px-2 py-0.5 rounded-full bg-purple-500/20 border border-purple-500/30 text-purple-300 text-[10px] font-extrabold uppercase">
                AI MOTORU Active
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Bu hafta kasaya giren tahsilat, satış performansı, brüt kâr, mahsuplar ve kalan borçlar analiz edilerek üretilen nakit akışı planı.
            </p>
          </div>
        </div>

        <button
          onClick={loadEngine}
          className="self-start sm:self-center px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-bold text-xs flex items-center gap-1.5 transition-all active:scale-95"
        >
          <Zap className="w-3.5 h-3.5 text-amber-400" />
          <span>Yeniden Analiz Et</span>
        </button>
      </div>

      {/* Top 6 Metric Summary Badges */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="bg-slate-900 border border-slate-800 p-3.5 rounded-xl">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">BU HAFTA TAHSİLAT</span>
          <span className="text-sm sm:text-base font-black text-emerald-400 mt-0.5 block">
            {formatCurrency(analysis.weeklyCollection)}
          </span>
        </div>

        <div className="bg-slate-900 border border-slate-800 p-3.5 rounded-xl">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">BU HAFTA BRÜT KÂR</span>
          <div className="flex items-baseline gap-1 mt-0.5">
            <span className="text-sm sm:text-base font-black text-blue-400">
              {formatCurrency(analysis.weeklyGrossProfit)}
            </span>
            <span className="text-[10px] text-blue-300 font-mono">
              (%{analysis.grossProfitMargin.toFixed(1)})
            </span>
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 p-3.5 rounded-xl">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">ÖNERİLEN ÖDEME</span>
          <span className="text-sm sm:text-base font-black text-amber-400 mt-0.5 block">
            {formatCurrency(analysis.totalRecommendedPayment)}
          </span>
        </div>

        <div className="bg-slate-900 border border-slate-800 p-3.5 rounded-xl">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">MAHSUP TOPLAMI</span>
          <span className="text-sm sm:text-base font-black text-purple-400 mt-0.5 block">
            {formatCurrency(analysis.totalOffsetsApplied)}
          </span>
        </div>

        <div className="bg-slate-900 border border-slate-800 p-3.5 rounded-xl">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">GERÇEK NAKİT ÇIKIŞI</span>
          <span className="text-sm sm:text-base font-black text-rose-400 mt-0.5 block">
            {formatCurrency(analysis.totalRealCashOutflow)}
          </span>
        </div>

        <div className="bg-slate-900 border border-slate-800 p-3.5 rounded-xl bg-gradient-to-b from-slate-900 to-emerald-950/20">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">İŞLETMEDE KALACAK</span>
          <span className="text-sm sm:text-base font-black text-emerald-300 mt-0.5 block">
            {formatCurrency(analysis.cashRetainedInBusiness)}
          </span>
        </div>
      </div>

      {/* Supplier Payment Recommendation Cards */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5 space-y-4 shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <h3 className="text-xs sm:text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
            <DollarSign className="w-4 h-4 text-amber-400" />
            <span>TEDARİKÇİ BAZLI AKILLI ÖDEME ÖNERİLERİ ({analysis.supplierPlans.length})</span>
          </h3>
        </div>

        {analysis.supplierPlans.length === 0 ? (
          <div className="p-8 text-center text-slate-500 text-xs">
            Kayıtlı tedarikçi bulunamadı.
          </div>
        ) : (
          <div className="space-y-3">
            {analysis.supplierPlans.map((plan) => {
              const currentOverride = overrideAmounts[plan.supplierId] ?? plan.recommendedCashPayment;
              const isOverridden = currentOverride !== plan.recommendedCashPayment;
              const overrideDiff = currentOverride - plan.recommendedCashPayment;
              const isExpanded = expandedSupplierId === plan.supplierId;

              return (
                <div
                  key={plan.supplierId}
                  className="bg-slate-950 border border-slate-800/80 hover:border-slate-700 p-4 rounded-xl space-y-3 transition-colors"
                >
                  {/* Card Header Row */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      {/* Priority Badge */}
                      <span
                        className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider ${
                          plan.priorityLevel === 'HIGH'
                            ? 'bg-rose-950/80 text-rose-400 border border-rose-800/60'
                            : plan.priorityLevel === 'MEDIUM'
                            ? 'bg-amber-950/80 text-amber-400 border border-amber-800/60'
                            : 'bg-slate-800 text-slate-400 border border-slate-700'
                        }`}
                      >
                        {plan.priorityLevel === 'HIGH' && '🔥 YÜKSEK ÖNCELİK'}
                        {plan.priorityLevel === 'MEDIUM' && '⚖️ ORTA ÖNCELİK'}
                        {plan.priorityLevel === 'LOW' && '○ DÜŞÜK ÖNCELİK'}
                      </span>

                      <h4 className="text-sm font-extrabold text-white">{plan.supplierName}</h4>
                    </div>

                    <div className="flex items-center gap-3 text-xs">
                      <div className="text-right">
                        <span className="text-[10px] text-slate-500 block">Bu Hafta Satış Payı</span>
                        <span className="font-bold text-blue-400">
                          {formatCurrency(plan.weeklySalesVolume)} (%{plan.salesSharePercentage.toFixed(1)})
                        </span>
                      </div>

                      <div className="text-right border-l border-slate-800 pl-3">
                        <span className="text-[10px] text-slate-500 block">Mahsup Edilen</span>
                        <span className="font-bold text-purple-400">{formatCurrency(plan.offsetAmount)}</span>
                      </div>

                      <div className="text-right border-l border-slate-800 pl-3">
                        <span className="text-[10px] text-slate-500 block">Net Nakit Borç</span>
                        <span className="font-extrabold text-amber-400">{formatCurrency(plan.netCashDebtNeeded)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Recommendation Bar & Action Row */}
                  <div className="bg-slate-900 border border-slate-800/80 p-3 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div>
                        <span className="text-[10px] text-slate-400 font-semibold uppercase block">
                          ÖNERİLEN NAKİT ÖDEME
                        </span>
                        <span className="text-base font-black text-amber-400">
                          {formatCurrency(plan.recommendedCashPayment)}
                        </span>
                      </div>

                      <button
                        onClick={() =>
                          setExpandedSupplierId(isExpanded ? null : plan.supplierId)
                        }
                        className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] font-semibold flex items-center gap-1 transition-all"
                      >
                        <Info className="w-3.5 h-3.5 text-purple-400" />
                        <span>Neden bu kadar?</span>
                        {isExpanded ? (
                          <ChevronUp className="w-3.5 h-3.5 text-slate-400" />
                        ) : (
                          <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                        )}
                      </button>
                    </div>

                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-1 bg-slate-950 border border-slate-700 px-2.5 py-1.5 rounded-xl">
                        <span className="text-slate-400 text-xs font-bold">₺</span>
                        <input
                          type="number"
                          value={currentOverride}
                          onChange={(e) => {
                            const val = Math.max(0, Number(e.target.value || 0));
                            setOverrideAmounts((prev) => ({
                              ...prev,
                              [plan.supplierId]: val,
                            }));
                          }}
                          className="w-24 bg-transparent text-xs font-bold text-white outline-none text-right font-mono"
                          placeholder="Tutar"
                        />
                      </div>

                      <button
                        onClick={() => handleOpenPaymentModal(plan.supplierId)}
                        disabled={currentOverride <= 0}
                        className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-1.5 transition-all active:scale-95 disabled:opacity-40 disabled:pointer-events-none shadow-lg shadow-emerald-600/20"
                      >
                        <DollarSign className="w-4 h-4" />
                        <span>Ödemeyi Kaydet</span>
                      </button>
                    </div>
                  </div>

                  {/* Manual Override Info Banner */}
                  {isOverridden && (
                    <div className="bg-amber-950/40 border border-amber-800/40 px-3 py-1.5 rounded-lg flex items-center justify-between text-[11px] text-amber-300">
                      <div className="flex items-center gap-1.5 font-medium">
                        <AlertCircle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                        <span>
                          {overrideDiff > 0
                            ? `Önerilen tutardan +${formatCurrency(overrideDiff)} fazla ödeme yapıyorsunuz.`
                            : `Önerilen tutardan ${formatCurrency(Math.abs(overrideDiff))} daha az ödeme yapıyorsunuz.`}
                        </span>
                      </div>
                      <button
                        onClick={() =>
                          setOverrideAmounts((prev) => ({
                            ...prev,
                            [plan.supplierId]: plan.recommendedCashPayment,
                          }))
                        }
                        className="text-[10px] underline font-bold hover:text-white"
                      >
                        Önerilene Sıfırla
                      </button>
                    </div>
                  )}

                  {/* Expanded "Neden bu kadar?" Explanation Drawer */}
                  {isExpanded && (
                    <div className="bg-slate-900/90 border border-purple-900/30 p-3 rounded-xl text-xs text-slate-300 space-y-1.5 animate-fadeIn">
                      <div className="font-bold text-purple-300 text-[11px] flex items-center gap-1.5">
                        <Brain className="w-3.5 h-3.5 text-purple-400" />
                        <span>ALGORİTMA KARAR GEREKÇESİ</span>
                      </div>
                      <p className="text-[11px] leading-relaxed text-slate-300">
                        {plan.priorityReason}
                      </p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Supplier Direct Payment Modal Integration */}
      <SupplierPaymentModal
        isOpen={paymentModalOpen}
        onClose={() => setPaymentModalOpen(false)}
        defaultSupplierId={selectedSupplierId}
        onSuccess={handlePaymentSuccess}
      />
    </div>
  );
};
