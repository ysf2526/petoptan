import React, { useEffect, useState } from 'react';
import { useToast } from '@/context/ToastContext';
import { formatCurrency } from '@/utils/formatters';
import {
  calculateBusinessAssistantInsights,
  BusinessAssistantSummary,
  AssistantInsight,
} from '@/services/businessAssistantEngine';
import { SupplierPaymentModal } from '@/components/modals/SupplierPaymentModal';
import { PaymentModal } from '@/components/modals/PaymentModal';
import { StockEntryModal } from '@/components/modals/StockEntryModal';
import { useNavigate } from 'react-router-dom';
import {
  Bot,
  AlertOctagon,
  AlertTriangle,
  Info,
  Sparkles,
  DollarSign,
  Receipt,
  MessageCircle,
  Boxes,
  User,
  Package,
  TrendingUp,
  ChevronDown,
  ChevronUp,
  Loader2,
  RefreshCw,
  TrendingDown,
  ShieldCheck,
  Building2,
  Calendar,
} from 'lucide-react';

export const Assistant: React.FC = () => {
  const navigate = useNavigate();
  const { showError, showSuccess } = useToast();

  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<BusinessAssistantSummary | null>(null);

  // Timeframe Filter: BUGÜN | BU HAFTA | BU AY
  const [timeframe, setTimeframe] = useState<'TODAY' | 'WEEK' | 'MONTH'>('TODAY');

  // Priority Filter
  const [priorityFilter, setPriorityFilter] = useState<'ALL' | 'CRITICAL' | 'IMPORTANT' | 'WARNING' | 'OPPORTUNITY'>('ALL');

  // Expanded "Neden?" drawers
  const [expandedWhyId, setExpandedWhyId] = useState<string | null>(null);

  // Modals for Actions
  const [supplierModalOpen, setSupplierModalOpen] = useState(false);
  const [targetSupplierId, setTargetSupplierId] = useState<string | null>(null);

  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [targetCustomerId, setTargetCustomerId] = useState<string | null>(null);

  const [stockEntryModalOpen, setStockEntryModalOpen] = useState(false);

  const loadAssistant = async () => {
    setLoading(true);
    try {
      const res = await calculateBusinessAssistantInsights();
      setSummary(res);
    } catch (err) {
      console.error(err);
      showError('İşletme asistanı analizi yapılırken hata oluştu.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAssistant();
  }, []);

  const handleActionClick = (insight: AssistantInsight) => {
    const p = insight.actionPayload;

    switch (insight.actionType) {
      case 'SUPPLIER_PAYMENT':
        if (p?.supplierId) {
          setTargetSupplierId(p.supplierId);
          setSupplierModalOpen(true);
        }
        break;

      case 'CUSTOMER_PAYMENT':
        if (p?.customerId) {
          setTargetCustomerId(p.customerId);
          setPaymentModalOpen(true);
        }
        break;

      case 'WHATSAPP_CUSTOMER':
        if (p?.customerPhone || p?.whatsappMessage) {
          const rawPhone = (p?.customerPhone || '').replace(/\D/g, '');
          const encodedMsg = encodeURIComponent(p?.whatsappMessage || '');
          const url = rawPhone
            ? `https://wa.me/${rawPhone}?text=${encodedMsg}`
            : `https://wa.me/?text=${encodedMsg}`;
          window.open(url, '_blank');
        } else {
          showError('Müşteri telefon numarası bulunamadı.');
        }
        break;

      case 'STOCK_ENTRY':
        setStockEntryModalOpen(true);
        break;

      case 'VIEW_CUSTOMER':
        if (p?.customerId) navigate(`/customers/${p.customerId}`);
        else navigate('/customers');
        break;

      case 'VIEW_PRODUCT':
        navigate('/products');
        break;

      case 'PROFIT_TARGETS':
        navigate('/profit-targets');
        break;

      default:
        break;
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-slate-400">
        <Loader2 className="w-10 h-10 animate-spin text-brand-500 mb-3" />
        <p className="text-sm font-semibold">🤖 İşletme Asistanı Analiz Yapıyor...</p>
      </div>
    );
  }

  if (!summary) return null;

  const timeframeFiltered = summary.insights.filter((i) => {
    if (timeframe === 'TODAY') return i.timeframe === 'TODAY' || i.priority === 'CRITICAL';
    if (timeframe === 'WEEK') return i.timeframe === 'TODAY' || i.timeframe === 'WEEK';
    return true; // MONTH includes all
  });

  const finalInsights = timeframeFiltered.filter((i) => {
    if (priorityFilter === 'ALL') return true;
    return i.priority === priorityFilter;
  });

  return (
    <div className="space-y-6 pb-12">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900 border border-slate-800 p-5 sm:p-6 rounded-2xl">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-brand-600 to-purple-600 flex items-center justify-center text-white font-black text-2xl shadow-lg shadow-brand-500/20">
            🤖
          </div>
          <div>
            <h2 className="text-xl font-bold text-white tracking-tight">İşletme Asistanı & Analiz Karar Ekranı</h2>
            <p className="text-xs sm:text-sm text-slate-400 mt-1">
              Veritabanındaki satış, stok, mahsup, alacak ve borç verilerini analiz eden yapay zeka karar sistemi.
            </p>
          </div>
        </div>

        <button
          onClick={loadAssistant}
          className="self-start sm:self-center flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold py-2.5 px-4 rounded-xl border border-slate-700 transition-all active:scale-95"
        >
          <RefreshCw className="w-4 h-4 text-brand-400" />
          <span>Verileri Yeniden Analiz Et</span>
        </button>
      </div>

      {/* Timeframe Filter Tabs */}
      <div className="flex items-center gap-2 bg-slate-900 p-1.5 rounded-2xl border border-slate-800">
        {[
          { id: 'TODAY', label: '📌 BUGÜNÜN AKSİYONLARI' },
          { id: 'WEEK', label: '📅 BU HAFTANIN RAPORU' },
          { id: 'MONTH', label: '📊 BU AYIN İÇGÖRÜLERİ' },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setTimeframe(tab.id as any)}
            className={`flex-1 py-2.5 px-4 rounded-xl text-xs font-black transition-all text-center ${
              timeframe === tab.id
                ? 'bg-brand-600 text-white shadow-lg shadow-brand-600/20'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Cash Flow Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">BU HAFTA TAHSİLAT</span>
          <span className="text-base sm:text-lg font-black text-emerald-400 mt-1 block">
            {formatCurrency(summary.cashflow.weeklyCollection)}
          </span>
        </div>

        <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">ÖNERİLEN TEDARİKÇİ ÖDEMESİ</span>
          <span className="text-base sm:text-lg font-black text-amber-400 mt-1 block">
            {formatCurrency(summary.cashflow.recommendedSupplierPayments)}
          </span>
        </div>

        <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">MAHSUP EDİLEN TUTAR</span>
          <span className="text-base sm:text-lg font-black text-purple-400 mt-1 block">
            {formatCurrency(summary.cashflow.offsetsApplied)}
          </span>
        </div>

        <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">GERÇEK NAKİT ÇIKIŞI</span>
          <span className="text-base sm:text-lg font-black text-rose-400 mt-1 block">
            {formatCurrency(summary.cashflow.realCashOutflow)}
          </span>
        </div>

        <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl bg-gradient-to-b from-slate-900 to-emerald-950/20 col-span-2 sm:col-span-1">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">İŞLETMEDE KALACAK NAKİT</span>
          <span className="text-base sm:text-lg font-black text-emerald-300 mt-1 block">
            {formatCurrency(summary.cashflow.retainedCash)}
          </span>
        </div>
      </div>

      {/* En Çok Satan vs En Çok Kazandıran İçgörü Kartı */}
      {summary.topProfitableVsTopSold && (
        <div className="bg-gradient-to-r from-slate-900 via-slate-900 to-purple-950/30 border border-purple-800/40 p-5 rounded-2xl shadow-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-purple-400" />
              <h3 className="text-sm font-extrabold text-white">ÜRÜN PERFORMANS KIYASLAMASI (CİRO VS KÂR)</h3>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed font-medium">
              {summary.topProfitableVsTopSold.comparisonText}
            </p>
          </div>

          <div className="flex items-center gap-3 shrink-0 text-xs font-mono">
            <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800 text-center">
              <span className="text-[10px] text-slate-400 block font-sans">En Çok Satan</span>
              <span className="font-bold text-blue-400">{summary.topProfitableVsTopSold.topSoldName}</span>
              <span className="text-[11px] text-slate-300 block">{summary.topProfitableVsTopSold.topSoldQty} Adet</span>
            </div>

            <div className="bg-slate-950 p-2.5 rounded-xl border border-purple-800/40 text-center">
              <span className="text-[10px] text-purple-300 block font-sans">En Çok Kazandıran</span>
              <span className="font-bold text-purple-400">{summary.topProfitableVsTopSold.topProfitableName}</span>
              <span className="text-[11px] text-emerald-400 block">{formatCurrency(summary.topProfitableVsTopSold.topProfitableProfit)} Kâr</span>
            </div>
          </div>
        </div>
      )}

      {/* Priority Filter Pills */}
      <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
        {[
          { id: 'ALL', label: 'Tüm Öneriler' },
          { id: 'CRITICAL', label: '🔴 Kritikler' },
          { id: 'IMPORTANT', label: '🟠 Önemliler' },
          { id: 'WARNING', label: '🟡 Dikkat Edilecekler' },
          { id: 'OPPORTUNITY', label: '🟢 Fırsatlar' },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setPriorityFilter(tab.id as any)}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all border ${
              priorityFilter === tab.id
                ? 'bg-purple-600/20 border-purple-500 text-purple-300'
                : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Insights Cards Feed */}
      <div className="space-y-3.5">
        {finalInsights.length === 0 ? (
          <div className="bg-slate-900 border border-slate-800 p-12 rounded-2xl text-center text-slate-500 text-xs">
            Seçilen dönem ve filtrede kayıtlı aksiyon uyarısı bulunmamaktadır.
          </div>
        ) : (
          finalInsights.map((ins) => {
            const isWhyExpanded = expandedWhyId === ins.id;

            return (
              <div
                key={ins.id}
                className="bg-slate-900 border border-slate-800 hover:border-slate-700 p-5 rounded-2xl space-y-3.5 transition-all shadow-lg"
              >
                {/* Header */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <span
                      className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider ${
                        ins.priority === 'CRITICAL'
                          ? 'bg-rose-950/80 text-rose-400 border border-rose-800/60'
                          : ins.priority === 'IMPORTANT'
                          ? 'bg-amber-950/80 text-amber-400 border border-amber-800/60'
                          : ins.priority === 'WARNING'
                          ? 'bg-blue-950/80 text-blue-300 border border-blue-800/60'
                          : 'bg-emerald-950/80 text-emerald-400 border border-emerald-800/60'
                      }`}
                    >
                      {ins.priority === 'CRITICAL' && '🔴 KRİTİK'}
                      {ins.priority === 'IMPORTANT' && '🟠 ÖNEMLİ'}
                      {ins.priority === 'WARNING' && '🟡 DİKKAT'}
                      {ins.priority === 'OPPORTUNITY' && '🟢 FIRSAT'}
                    </span>

                    <h3 className="text-sm font-extrabold text-white">{ins.title}</h3>
                  </div>

                  <div className="flex items-center gap-2">
                    {ins.metricPrimary && (
                      <span className="px-2.5 py-1 rounded-lg bg-slate-950 border border-slate-800 text-xs font-bold text-slate-200">
                        {ins.metricPrimary}
                      </span>
                    )}
                    {ins.metricSecondary && (
                      <span className="px-2.5 py-1 rounded-lg bg-slate-950 border border-slate-800 text-xs font-semibold text-slate-400">
                        {ins.metricSecondary}
                      </span>
                    )}
                  </div>
                </div>

                <p className="text-xs text-slate-300 leading-relaxed font-medium">
                  {ins.description}
                </p>

                {/* Footer Action Row & "Neden?" Expander */}
                <div className="pt-3 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-3">
                  <button
                    onClick={() => setExpandedWhyId(isWhyExpanded ? null : ins.id)}
                    className="px-3 py-1.5 rounded-lg bg-slate-950 hover:bg-slate-800 text-slate-400 hover:text-slate-200 text-xs font-semibold flex items-center gap-1.5 transition-all border border-slate-800"
                  >
                    <Info className="w-3.5 h-3.5 text-brand-400" />
                    <span>Neden bu öneri yapıldı?</span>
                    {isWhyExpanded ? (
                      <ChevronUp className="w-3.5 h-3.5" />
                    ) : (
                      <ChevronDown className="w-3.5 h-3.5" />
                    )}
                  </button>

                  {/* Direct Action Button */}
                  {ins.actionType && (
                    <button
                      onClick={() => handleActionClick(ins)}
                      className={`px-4 py-2 rounded-xl font-bold text-xs flex items-center gap-2 transition-all active:scale-95 shadow-md ${
                        ins.actionType === 'SUPPLIER_PAYMENT'
                          ? 'bg-amber-600 hover:bg-amber-500 text-white shadow-amber-600/20'
                          : ins.actionType === 'CUSTOMER_PAYMENT'
                          ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-600/20'
                          : ins.actionType === 'WHATSAPP_CUSTOMER'
                          ? 'bg-emerald-700 hover:bg-emerald-600 text-white shadow-emerald-700/20'
                          : ins.actionType === 'STOCK_ENTRY'
                          ? 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-600/20'
                          : 'bg-brand-600 hover:bg-brand-500 text-white shadow-brand-600/20'
                      }`}
                    >
                      {ins.actionType === 'SUPPLIER_PAYMENT' && <DollarSign className="w-4 h-4" />}
                      {ins.actionType === 'CUSTOMER_PAYMENT' && <Receipt className="w-4 h-4" />}
                      {ins.actionType === 'WHATSAPP_CUSTOMER' && <MessageCircle className="w-4 h-4" />}
                      {ins.actionType === 'STOCK_ENTRY' && <Boxes className="w-4 h-4" />}
                      {ins.actionType === 'VIEW_CUSTOMER' && <User className="w-4 h-4" />}
                      {ins.actionType === 'VIEW_PRODUCT' && <Package className="w-4 h-4" />}
                      {ins.actionType === 'PROFIT_TARGETS' && <TrendingUp className="w-4 h-4" />}

                      <span>
                        {ins.actionType === 'SUPPLIER_PAYMENT' && '💸 Ödemeyi Kaydet'}
                        {ins.actionType === 'CUSTOMER_PAYMENT' && '💳 Tahsilat Gir'}
                        {ins.actionType === 'WHATSAPP_CUSTOMER' && '💬 WhatsApp Mesajı Gönder'}
                        {ins.actionType === 'STOCK_ENTRY' && '📦 Stok Girişi Yap'}
                        {ins.actionType === 'VIEW_CUSTOMER' && '👤 Müşteriyi Gör'}
                        {ins.actionType === 'VIEW_PRODUCT' && '📦 Ürünleri Gör'}
                        {ins.actionType === 'PROFIT_TARGETS' && '🎯 Kâr Hedeflerini İncele'}
                      </span>
                    </button>
                  )}
                </div>

                {/* Expanded "Neden?" Box */}
                {isWhyExpanded && (
                  <div className="bg-slate-950 border border-brand-900/40 p-3.5 rounded-xl text-xs text-slate-300 space-y-1 animate-fadeIn">
                    <div className="font-bold text-brand-300 text-[11px] flex items-center gap-1.5">
                      <Bot className="w-3.5 h-3.5 text-brand-400" />
                      <span>GERÇEK VERİTABANI HESAPLAMA GEREKÇESİ</span>
                    </div>
                    <p className="text-[11px] leading-relaxed text-slate-300 font-mono">
                      {ins.whyExplanation}
                    </p>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Action Modals */}
      <SupplierPaymentModal
        isOpen={supplierModalOpen}
        onClose={() => setSupplierModalOpen(false)}
        defaultSupplierId={targetSupplierId}
        onSuccess={() => {
          showSuccess('Tedarikçi ödemesi kaydedildi.');
          loadAssistant();
        }}
      />

      <PaymentModal
        isOpen={paymentModalOpen}
        onClose={() => setPaymentModalOpen(false)}
        defaultCustomerId={targetCustomerId}
        onSuccess={() => {
          showSuccess('Tahsilat başarıyla kaydedildi.');
          loadAssistant();
        }}
      />

      <StockEntryModal
        isOpen={stockEntryModalOpen}
        onClose={() => setStockEntryModalOpen(false)}
        onSuccess={() => {
          showSuccess('Stok girişi tamamlandı.');
          loadAssistant();
        }}
      />
    </div>
  );
};
