import React, { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useToast } from '@/context/ToastContext';
import { formatCurrency } from '@/utils/formatters';
import {
  calculateBusinessAssistantInsights,
  BusinessAssistantSummary,
  AssistantInsight,
  PriorityLevel,
} from '@/services/businessAssistantEngine';
import { SupplierPaymentModal } from '@/components/modals/SupplierPaymentModal';
import { PaymentModal } from '@/components/modals/PaymentModal';
import { StockEntryModal } from '@/components/modals/StockEntryModal';
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
  ArrowRight,
  CheckCircle2,
} from 'lucide-react';

interface BusinessAssistantWidgetProps {
  onRefreshParent?: () => void;
}

export const BusinessAssistantWidget: React.FC<BusinessAssistantWidgetProps> = ({
  onRefreshParent,
}) => {
  const navigate = useNavigate();
  const { showError, showSuccess } = useToast();

  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<BusinessAssistantSummary | null>(null);

  // Active Category Filter
  const [filter, setFilter] = useState<'ALL' | 'CRITICAL' | 'SUPPLIER' | 'STOCK' | 'CUSTOMER' | 'PROFIT'>('ALL');

  // Expanded "Neden?" drawers
  const [expandedWhyId, setExpandedWhyId] = useState<string | null>(null);

  // Modal states for Action Buttons
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
      showError('İşletme Asistanı verileri analiz edilirken bir hata oluştu.');
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
      <div className="bg-slate-900 border border-slate-800 p-8 rounded-2xl text-center text-slate-400 flex flex-col items-center">
        <Loader2 className="w-8 h-8 animate-spin text-brand-500 mb-2" />
        <span className="text-sm font-semibold">🤖 İşletme Asistanı Verileri Analiz Ediyor...</span>
      </div>
    );
  }

  if (!summary) return null;

  const filteredInsights = summary.insights.filter((ins) => {
    if (filter === 'ALL') return true;
    if (filter === 'CRITICAL') return ins.priority === 'CRITICAL';
    return ins.category === filter;
  });

  return (
    <div className="space-y-5">
      {/* Header Widget Box */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-900 to-brand-950/40 border border-slate-800 p-5 sm:p-6 rounded-2xl shadow-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-start gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-brand-600/20 border border-brand-500/40 flex items-center justify-center text-brand-400 shrink-0 shadow-lg shadow-brand-500/20">
            <Bot className="w-7 h-7" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-black text-white tracking-tight">🤖 İŞLETME ASİSTANI</h2>
              <span className="px-2.5 py-0.5 rounded-full bg-brand-500/20 border border-brand-500/30 text-brand-300 text-[10px] font-extrabold uppercase">
                Bugün Ne Yapmalıyım?
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Bugün dikkat etmeniz gereken <strong className="text-white font-bold">{summary.criticalCount} kritik</strong> ve <strong className="text-white font-bold">{summary.importantCount} önemli</strong> konu tespit edildi.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-center">
          <button
            onClick={loadAssistant}
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-all active:scale-95"
            title="Yeniden Analiz Et"
          >
            <RefreshCw className="w-4 h-4" />
          </button>

          <Link
            to="/assistant"
            className="bg-brand-600 hover:bg-brand-500 text-white font-bold px-3.5 py-2 rounded-xl text-xs flex items-center gap-1.5 transition-all active:scale-95 shadow-lg shadow-brand-500/20"
          >
            <span>Tüm Asistan Raporunu Gör</span>
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </div>

      {/* Priority Summary Count Badges */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <button
          onClick={() => setFilter('CRITICAL')}
          className={`p-3 rounded-xl border flex items-center justify-between transition-all ${
            filter === 'CRITICAL'
              ? 'bg-rose-950/80 border-rose-600 text-rose-300 ring-2 ring-rose-500/30'
              : 'bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-700'
          }`}
        >
          <div className="flex items-center gap-2">
            <AlertOctagon className="w-4 h-4 text-rose-400" />
            <span className="text-xs font-bold">🔴 KRİTİK</span>
          </div>
          <span className="text-base font-black text-rose-400">{summary.criticalCount}</span>
        </button>

        <button
          onClick={() => setFilter('ALL')}
          className={`p-3 rounded-xl border flex items-center justify-between transition-all ${
            filter === 'ALL'
              ? 'bg-amber-950/80 border-amber-600 text-amber-300 ring-2 ring-amber-500/30'
              : 'bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-700'
          }`}
        >
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-400" />
            <span className="text-xs font-bold">🟠 ÖNEMLİ</span>
          </div>
          <span className="text-base font-black text-amber-400">{summary.importantCount}</span>
        </button>

        <button
          onClick={() => setFilter('ALL')}
          className={`p-3 rounded-xl border flex items-center justify-between transition-all ${
            filter === 'ALL'
              ? 'bg-blue-950/80 border-blue-600 text-blue-300 ring-2 ring-blue-500/30'
              : 'bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-700'
          }`}
        >
          <div className="flex items-center gap-2">
            <Info className="w-4 h-4 text-blue-400" />
            <span className="text-xs font-bold">🟡 DİKKAT</span>
          </div>
          <span className="text-base font-black text-blue-400">{summary.warningCount}</span>
        </button>

        <button
          onClick={() => setFilter('ALL')}
          className={`p-3 rounded-xl border flex items-center justify-between transition-all ${
            filter === 'ALL'
              ? 'bg-emerald-950/80 border-emerald-600 text-emerald-300 ring-2 ring-emerald-500/30'
              : 'bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-700'
          }`}
        >
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-emerald-400" />
            <span className="text-xs font-bold">🟢 FIRSAT</span>
          </div>
          <span className="text-base font-black text-emerald-400">{summary.opportunityCount}</span>
        </button>
      </div>

      {/* Category Pills Bar */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 custom-scrollbar">
        {[
          { id: 'ALL', label: 'Tüm Aksiyon Önerileri' },
          { id: 'CRITICAL', label: '🔴 Sadece Krıtik' },
          { id: 'STOCK', label: '📦 Stok & Ürünler' },
          { id: 'CUSTOMER', label: '💳 Müşteri & Taksit' },
          { id: 'SUPPLIER', label: '🚚 Tedarikçi & Ödeme' },
          { id: 'PROFIT', label: '🎯 Kâr & Hedef' },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setFilter(tab.id as any)}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all border ${
              filter === tab.id
                ? 'bg-brand-600/20 border-brand-500 text-brand-300'
                : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Prioritized Recommendation Cards List */}
      <div className="space-y-3">
        {filteredInsights.length === 0 ? (
          <div className="bg-slate-900 border border-slate-800 p-8 rounded-2xl text-center text-slate-500 text-xs">
            Seçilen filtrede kayıtlı aksiyon uyarısı bulunmamaktadır. İşletmeniz sorunsuz çalışıyor!
          </div>
        ) : (
          filteredInsights.map((ins) => {
            const isWhyExpanded = expandedWhyId === ins.id;

            return (
              <div
                key={ins.id}
                className="bg-slate-900 border border-slate-800 hover:border-slate-700 p-4 sm:p-5 rounded-2xl space-y-3.5 transition-all shadow-lg"
              >
                {/* Header Row */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    {/* Priority Badge */}
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

                {/* Description */}
                <p className="text-xs text-slate-300 leading-relaxed font-medium">
                  {ins.description}
                </p>

                {/* Footer Action Row & "Neden?" Expander */}
                <div className="pt-2 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-3">
                  <button
                    onClick={() => setExpandedWhyId(isWhyExpanded ? null : ins.id)}
                    className="px-2.5 py-1 rounded-lg bg-slate-950 hover:bg-slate-800 text-slate-400 hover:text-slate-200 text-xs font-semibold flex items-center gap-1.5 transition-all border border-slate-800"
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

                {/* Expanded "Neden?" Explanation Box */}
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

      {/* Action Modals Entegrasyonları */}
      <SupplierPaymentModal
        isOpen={supplierModalOpen}
        onClose={() => setSupplierModalOpen(false)}
        defaultSupplierId={targetSupplierId}
        onSuccess={() => {
          showSuccess('Tedarikçi ödemesi kaydedildi.');
          loadAssistant();
          if (onRefreshParent) onRefreshParent();
        }}
      />

      <PaymentModal
        isOpen={paymentModalOpen}
        onClose={() => setPaymentModalOpen(false)}
        defaultCustomerId={targetCustomerId}
        onSuccess={() => {
          showSuccess('Tahsilat başarıyla kaydedildi.');
          loadAssistant();
          if (onRefreshParent) onRefreshParent();
        }}
      />

      <StockEntryModal
        isOpen={stockEntryModalOpen}
        onClose={() => setStockEntryModalOpen(false)}
        onSuccess={() => {
          showSuccess('Stok girişi tamamlandı.');
          loadAssistant();
          if (onRefreshParent) onRefreshParent();
        }}
      />
    </div>
  );
};
