import React, { useEffect, useState, useCallback } from 'react';
import { useOutletContext } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { formatCurrency, formatDateTime } from '@/utils/formatters';
import { parseErrorMessage } from '@/utils/errors';
import { Sale, OrderStatus, ORDER_STATUS_MAP } from '@/types/database.types';
import { useToast } from '@/context/ToastContext';
import { LayoutContextType } from '@/components/layout/Layout';
import { SaleDetailModal } from '@/components/modals/SaleDetailModal';
import { ConfirmDeliveryModal } from '@/components/modals/ConfirmDeliveryModal';
import { CancelSaleModal } from '@/components/modals/CancelSaleModal';
import {
  ShoppingCart,
  Search,
  Plus,
  Eye,
  Loader2,
  Calendar,
  FileText,
  Filter,
  CheckCircle2,
  Clock,
  Package,
  Truck,
  Ban,
  ArrowRight,
  RefreshCw,
} from 'lucide-react';

type DateFilterType = 'TODAY' | 'YESTERDAY' | 'THIS_WEEK' | 'THIS_MONTH' | 'CUSTOM' | 'ALL';
type StatusFilterType = 'ALL' | OrderStatus;

export const Sales: React.FC = () => {
  const { openNewSaleModal, openSaleDocumentModal } = useOutletContext<LayoutContextType>();
  const { showSuccess, showError } = useToast();

  const [loading, setLoading] = useState(true);
  const [sales, setSales] = useState<Sale[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [dateFilter, setDateFilter] = useState<DateFilterType>('TODAY');
  const [customDate, setCustomDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [statusFilter, setStatusFilter] = useState<StatusFilterType>('ALL');

  // Modal states
  const [selectedSaleId, setSelectedSaleId] = useState<string | null>(null);
  const [detailModalOpen, setDetailModalOpen] = useState(false);

  const [deliverySale, setDeliverySale] = useState<Sale | null>(null);
  const [deliveryModalOpen, setDeliveryModalOpen] = useState(false);

  const [cancelSale, setCancelSale] = useState<Sale | null>(null);
  const [cancelModalOpen, setCancelModalOpen] = useState(false);

  const [updatingStatusId, setUpdatingStatusId] = useState<string | null>(null);

  const fetchSales = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('sales')
        .select('*')
        .is('deleted_at', null)
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Ensure each sale has order_status inferred if missing
      const mapped = (data || []).map((s) => ({
        ...s,
        order_status: s.order_status || (s.status === 'cancelled' ? 'cancelled' : 'received'),
      }));

      setSales(mapped as Sale[]);
    } catch (err) {
      console.error('Satışları yükleme hatası:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSales();
    const handleRefresh = () => fetchSales();
    window.addEventListener('refresh-data', handleRefresh);
    return () => window.removeEventListener('refresh-data', handleRefresh);
  }, [fetchSales]);

  // Date Filtering Logic
  const getSaleDate = (dateStr: string) => new Date(dateStr);

  const isSaleInDateFilter = (s: Sale) => {
    if (dateFilter === 'ALL') return true;

    const sDate = getSaleDate(s.created_at);
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);

    if (dateFilter === 'TODAY') {
      return sDate >= todayStart && sDate <= todayEnd;
    }

    if (dateFilter === 'YESTERDAY') {
      const yestStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
      const yestEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 23, 59, 59);
      return sDate >= yestStart && sDate <= yestEnd;
    }

    if (dateFilter === 'THIS_WEEK') {
      const dayOfWeek = now.getDay() || 7;
      const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dayOfWeek + 1);
      return sDate >= weekStart && sDate <= todayEnd;
    }

    if (dateFilter === 'THIS_MONTH') {
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      return sDate >= monthStart && sDate <= todayEnd;
    }

    if (dateFilter === 'CUSTOM' && customDate) {
      const [y, m, d] = customDate.split('-').map(Number);
      const cStart = new Date(y, m - 1, d, 0, 0, 0);
      const cEnd = new Date(y, m - 1, d, 23, 59, 59);
      return sDate >= cStart && sDate <= cEnd;
    }

    return true;
  };

  // Sales filtered by Date range
  const salesInDateRange = sales.filter(isSaleInDateFilter);

  // Operational Counts for the current date range
  const counts = {
    total: salesInDateRange.length,
    received: salesInDateRange.filter((s) => (s.order_status || 'received') === 'received').length,
    preparing: salesInDateRange.filter((s) => s.order_status === 'preparing').length,
    prepared: salesInDateRange.filter((s) => s.order_status === 'prepared').length,
    delivered: salesInDateRange.filter((s) => s.order_status === 'delivered').length,
    cancelled: salesInDateRange.filter((s) => s.order_status === 'cancelled' || s.status === 'cancelled').length,
  };

  // Final Filtered Sales List (Date + Status + Search Query)
  const filteredSales = salesInDateRange.filter((s) => {
    const q = searchQuery.toLowerCase().trim();
    const matchesQuery =
      !q ||
      s.sale_number.toLowerCase().includes(q) ||
      s.customer_name.toLowerCase().includes(q);

    const ordSt = (s.order_status as OrderStatus) || (s.status === 'cancelled' ? 'cancelled' : 'received');
    const matchesStatus = statusFilter === 'ALL' || ordSt === statusFilter;

    return matchesQuery && matchesStatus;
  });

  // Handle direct status transition
  const handleAdvanceStatus = async (sale: Sale) => {
    const currentStatus: OrderStatus = (sale.order_status as OrderStatus) || (sale.status === 'cancelled' ? 'cancelled' : 'received');
    const conf = ORDER_STATUS_MAP[currentStatus];
    if (!conf || !conf.nextStatus) return;

    // If next status is delivered, open confirmation modal first
    if (conf.nextStatus === 'delivered') {
      setDeliverySale(sale);
      setDeliveryModalOpen(true);
      return;
    }

    const nextSt = conf.nextStatus;
    setUpdatingStatusId(sale.id);

    try {
      const { error } = await supabase
        .from('sales')
        .update({ order_status: nextSt })
        .eq('id', sale.id);

      if (error) throw error;

      await supabase.from('audit_logs').insert({
        action: 'ORDER_STATUS_CHANGED',
        entity_type: 'sales',
        entity_id: sale.id,
        details: {
          order_id: sale.id,
          sale_number: sale.sale_number,
          customer_name: sale.customer_name,
          old_status: currentStatus,
          new_status: nextSt,
          timestamp: new Date().toISOString(),
        },
      });

      showSuccess(`Sipariş #${sale.sale_number} durumu: ${ORDER_STATUS_MAP[nextSt].label}`);
      fetchSales();
    } catch (err) {
      showError(parseErrorMessage(err));
    } finally {
      setUpdatingStatusId(null);
    }
  };

  return (
    <div className="space-y-5 pb-12">
      {/* Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900 border border-slate-800 p-4 sm:p-6 rounded-2xl shadow-lg">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-lg bg-amber-500/20 text-amber-400 border border-amber-500/30">
              <Truck className="w-5 h-5" />
            </span>
            <h2 className="text-xl font-extrabold text-white tracking-tight">Sipariş Durum Takip & Yönetim</h2>
          </div>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Günlük operasyon takibi: Alındı, Hazırlanıyor, Hazırlandı, Teslim Edildi ve İptal durumları.
          </p>
        </div>
        <button
          onClick={openNewSaleModal}
          className="self-start sm:self-center bg-gradient-to-r from-brand-600 to-brand-500 hover:from-brand-500 hover:to-brand-400 text-white font-bold px-4 py-2.5 rounded-xl shadow-lg shadow-brand-500/20 text-xs sm:text-sm flex items-center gap-2 transition-all active:scale-95 shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>Yeni Sipariş Oluştur</span>
        </button>
      </div>

      {/* BUGÜNÜN OPERASYON ÖZETİ CARD (REQUIREMENT 5) */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5 shadow-xl space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h3 className="text-xs sm:text-sm font-black text-white uppercase tracking-wider">
              {dateFilter === 'TODAY' ? 'BUGÜN OPERASYON ÖZETİ' : 'DURUM ÖZETİ'}
            </h3>
            <span className="text-xs font-mono font-bold text-brand-400 bg-brand-950/80 px-2 py-0.5 rounded-full border border-brand-800/60">
              {counts.total} Sipariş
            </span>
          </div>

          <button
            onClick={fetchSales}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
            title="Yenile"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-brand-400' : ''}`} />
          </button>
        </div>

        {/* Operational Metric Badges */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 sm:gap-3 text-xs font-mono">
          {/* Bekleyen (Alındı) */}
          <button
            onClick={() => setStatusFilter('received')}
            className={`p-3 rounded-xl border text-left transition-all ${
              statusFilter === 'received'
                ? 'bg-amber-950/90 border-amber-500 shadow-md shadow-amber-950/50'
                : 'bg-slate-950/70 border-slate-800/80 hover:border-amber-700/50'
            }`}
          >
            <span className="text-[10px] font-sans uppercase font-bold text-amber-300/80 block">Bekleyen (Alındı)</span>
            <div className="flex items-baseline justify-between mt-1">
              <span className="text-xl font-black text-amber-300">{counts.received}</span>
              <span className="text-lg">🟡</span>
            </div>
          </button>

          {/* Hazırlanıyor */}
          <button
            onClick={() => setStatusFilter('preparing')}
            className={`p-3 rounded-xl border text-left transition-all ${
              statusFilter === 'preparing'
                ? 'bg-orange-950/90 border-orange-500 shadow-md shadow-orange-950/50'
                : 'bg-slate-950/70 border-slate-800/80 hover:border-orange-700/50'
            }`}
          >
            <span className="text-[10px] font-sans uppercase font-bold text-orange-300/80 block">Hazırlanıyor</span>
            <div className="flex items-baseline justify-between mt-1">
              <span className="text-xl font-black text-orange-300">{counts.preparing}</span>
              <span className="text-lg">🟠</span>
            </div>
          </button>

          {/* Hazırlandı */}
          <button
            onClick={() => setStatusFilter('prepared')}
            className={`p-3 rounded-xl border text-left transition-all ${
              statusFilter === 'prepared'
                ? 'bg-emerald-950/90 border-emerald-500 shadow-md shadow-emerald-950/50'
                : 'bg-slate-950/70 border-slate-800/80 hover:border-emerald-700/50'
            }`}
          >
            <span className="text-[10px] font-sans uppercase font-bold text-emerald-300/80 block">Hazırlandı</span>
            <div className="flex items-baseline justify-between mt-1">
              <span className="text-xl font-black text-emerald-300">{counts.prepared}</span>
              <span className="text-lg">🟢</span>
            </div>
          </button>

          {/* Teslim Edildi */}
          <button
            onClick={() => setStatusFilter('delivered')}
            className={`p-3 rounded-xl border text-left transition-all ${
              statusFilter === 'delivered'
                ? 'bg-sky-950/90 border-sky-500 shadow-md shadow-sky-950/50'
                : 'bg-slate-950/70 border-slate-800/80 hover:border-sky-700/50'
            }`}
          >
            <span className="text-[10px] font-sans uppercase font-bold text-sky-300/80 block">Teslim Edildi</span>
            <div className="flex items-baseline justify-between mt-1">
              <span className="text-xl font-black text-sky-300">{counts.delivered}</span>
              <span className="text-lg">🔵</span>
            </div>
          </button>

          {/* İptal Edildi */}
          <button
            onClick={() => setStatusFilter('cancelled')}
            className={`p-3 rounded-xl border text-left transition-all col-span-2 sm:col-span-1 ${
              statusFilter === 'cancelled'
                ? 'bg-rose-950/90 border-rose-500 shadow-md shadow-rose-950/50'
                : 'bg-slate-950/70 border-slate-800/80 hover:border-rose-700/50'
            }`}
          >
            <span className="text-[10px] font-sans uppercase font-bold text-rose-300/80 block">İptal Edildi</span>
            <div className="flex items-baseline justify-between mt-1">
              <span className="text-xl font-black text-rose-400">{counts.cancelled}</span>
              <span className="text-lg">🔴</span>
            </div>
          </button>
        </div>
      </div>

      {/* FILTER BAR: DATE + SEARCH + STATUS PILLS (REQUIREMENTS 4 & 14 & 15) */}
      <div className="bg-slate-900 border border-slate-800 p-3.5 sm:p-4 rounded-2xl space-y-3">
        {/* Top Row: Date Pills & Search */}
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
          {/* Date Filter Buttons */}
          <div className="flex items-center gap-1.5 overflow-x-auto custom-scrollbar pb-1 lg:pb-0 text-xs font-semibold">
            <span className="text-slate-400 font-bold uppercase tracking-wider text-[10px] mr-1 shrink-0 flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5 text-brand-400" />
              Tarih:
            </span>

            <button
              onClick={() => setDateFilter('TODAY')}
              className={`px-3 py-1.5 rounded-xl transition-all whitespace-nowrap ${
                dateFilter === 'TODAY'
                  ? 'bg-brand-600 text-white font-bold shadow-md shadow-brand-600/30'
                  : 'bg-slate-950 text-slate-300 hover:bg-slate-800'
              }`}
            >
              Bugün
            </button>

            <button
              onClick={() => setDateFilter('YESTERDAY')}
              className={`px-3 py-1.5 rounded-xl transition-all whitespace-nowrap ${
                dateFilter === 'YESTERDAY'
                  ? 'bg-brand-600 text-white font-bold shadow-md shadow-brand-600/30'
                  : 'bg-slate-950 text-slate-300 hover:bg-slate-800'
              }`}
            >
              Dün
            </button>

            <button
              onClick={() => setDateFilter('THIS_WEEK')}
              className={`px-3 py-1.5 rounded-xl transition-all whitespace-nowrap ${
                dateFilter === 'THIS_WEEK'
                  ? 'bg-brand-600 text-white font-bold shadow-md shadow-brand-600/30'
                  : 'bg-slate-950 text-slate-300 hover:bg-slate-800'
              }`}
            >
              Bu Hafta
            </button>

            <button
              onClick={() => setDateFilter('THIS_MONTH')}
              className={`px-3 py-1.5 rounded-xl transition-all whitespace-nowrap ${
                dateFilter === 'THIS_MONTH'
                  ? 'bg-brand-600 text-white font-bold shadow-md shadow-brand-600/30'
                  : 'bg-slate-950 text-slate-300 hover:bg-slate-800'
              }`}
            >
              Bu Ay
            </button>

            <button
              onClick={() => setDateFilter('ALL')}
              className={`px-3 py-1.5 rounded-xl transition-all whitespace-nowrap ${
                dateFilter === 'ALL'
                  ? 'bg-brand-600 text-white font-bold shadow-md shadow-brand-600/30'
                  : 'bg-slate-950 text-slate-300 hover:bg-slate-800'
              }`}
            >
              Tüm Tarihler
            </button>

            {dateFilter === 'CUSTOM' ? (
              <input
                type="date"
                value={customDate}
                onChange={(e) => setCustomDate(e.target.value)}
                className="bg-slate-950 border border-brand-500 rounded-xl px-2.5 py-1 text-xs text-white outline-none"
              />
            ) : (
              <button
                onClick={() => setDateFilter('CUSTOM')}
                className="px-3 py-1.5 rounded-xl bg-slate-950 text-slate-300 hover:bg-slate-800 transition-all whitespace-nowrap"
              >
                Özel Tarih
              </button>
            )}
          </div>

          {/* Search Box */}
          <div className="relative w-full lg:w-72">
            <Search className="w-4 h-4 absolute left-3.5 top-2.5 text-slate-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Müşteri adı veya Sipariş No..."
              className="w-full bg-slate-950 border border-slate-700 focus:border-brand-500 rounded-xl py-1.5 pl-10 pr-4 text-xs text-slate-100 placeholder-slate-500 outline-none"
            />
          </div>
        </div>

        {/* Bottom Row: Mobile Quick Status Filter Pills (Requirement 4) */}
        <div className="pt-2 border-t border-slate-800/60 flex items-center gap-1.5 overflow-x-auto custom-scrollbar text-xs font-mono">
          <button
            onClick={() => setStatusFilter('ALL')}
            className={`px-3 py-1.5 rounded-xl font-bold transition-all whitespace-nowrap flex items-center gap-1.5 ${
              statusFilter === 'ALL'
                ? 'bg-slate-100 text-slate-900 shadow-md'
                : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-800'
            }`}
          >
            <span>Tümü</span>
            <span className="px-1.5 py-0.2 rounded-full bg-slate-800 text-slate-300 text-[10px]">
              {counts.total}
            </span>
          </button>

          <button
            onClick={() => setStatusFilter('received')}
            className={`px-3 py-1.5 rounded-xl font-bold transition-all whitespace-nowrap flex items-center gap-1.5 ${
              statusFilter === 'received'
                ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                : 'bg-amber-950/40 text-amber-300 hover:bg-amber-950/70 border border-amber-800/40'
            }`}
          >
            <span>🟡 Alındı</span>
            <span className="px-1.5 py-0.2 rounded-full bg-amber-900/60 text-amber-200 text-[10px]">
              {counts.received}
            </span>
          </button>

          <button
            onClick={() => setStatusFilter('preparing')}
            className={`px-3 py-1.5 rounded-xl font-bold transition-all whitespace-nowrap flex items-center gap-1.5 ${
              statusFilter === 'preparing'
                ? 'bg-orange-500 text-slate-950 shadow-md shadow-orange-500/20'
                : 'bg-orange-950/40 text-orange-300 hover:bg-orange-950/70 border border-orange-800/40'
            }`}
          >
            <span>🟠 Hazırlanıyor</span>
            <span className="px-1.5 py-0.2 rounded-full bg-orange-900/60 text-orange-200 text-[10px]">
              {counts.preparing}
            </span>
          </button>

          <button
            onClick={() => setStatusFilter('prepared')}
            className={`px-3 py-1.5 rounded-xl font-bold transition-all whitespace-nowrap flex items-center gap-1.5 ${
              statusFilter === 'prepared'
                ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20'
                : 'bg-emerald-950/40 text-emerald-300 hover:bg-emerald-950/70 border border-emerald-800/40'
            }`}
          >
            <span>🟢 Hazırlandı</span>
            <span className="px-1.5 py-0.2 rounded-full bg-emerald-900/60 text-emerald-200 text-[10px]">
              {counts.prepared}
            </span>
          </button>

          <button
            onClick={() => setStatusFilter('delivered')}
            className={`px-3 py-1.5 rounded-xl font-bold transition-all whitespace-nowrap flex items-center gap-1.5 ${
              statusFilter === 'delivered'
                ? 'bg-sky-500 text-slate-950 shadow-md shadow-sky-500/20'
                : 'bg-sky-950/40 text-sky-300 hover:bg-sky-950/70 border border-sky-800/40'
            }`}
          >
            <span>🔵 Teslim Edildi</span>
            <span className="px-1.5 py-0.2 rounded-full bg-sky-900/60 text-sky-200 text-[10px]">
              {counts.delivered}
            </span>
          </button>

          <button
            onClick={() => setStatusFilter('cancelled')}
            className={`px-3 py-1.5 rounded-xl font-bold transition-all whitespace-nowrap flex items-center gap-1.5 ${
              statusFilter === 'cancelled'
                ? 'bg-rose-600 text-white shadow-md shadow-rose-600/20'
                : 'bg-rose-950/40 text-rose-300 hover:bg-rose-950/70 border border-rose-800/40'
            }`}
          >
            <span>🔴 İptal</span>
            <span className="px-1.5 py-0.2 rounded-full bg-rose-900/60 text-rose-200 text-[10px]">
              {counts.cancelled}
            </span>
          </button>
        </div>
      </div>

      {/* SALES CONTENT AREA */}
      {loading ? (
        <div className="p-12 bg-slate-900 border border-slate-800 rounded-2xl text-center text-slate-400 flex flex-col items-center">
          <Loader2 className="w-8 h-8 animate-spin text-brand-500 mb-2" />
          <span>Siparişler Yükleniyor...</span>
        </div>
      ) : filteredSales.length === 0 ? (
        <div className="p-12 bg-slate-900 border border-slate-800 rounded-2xl text-center text-slate-400 text-sm">
          Seçili filtre kriterlerine uygun sipariş bulunamadı.
        </div>
      ) : (
        <>
          {/* MOBILE CARDS VIEW (REQUIREMENT 12) - Visible on sm:hidden */}
          <div className="block sm:hidden space-y-3">
            {filteredSales.map((s) => {
              const currentStatus: OrderStatus = (s.order_status as OrderStatus) || (s.status === 'cancelled' ? 'cancelled' : 'received');
              const conf = ORDER_STATUS_MAP[currentStatus] || ORDER_STATUS_MAP.received;
              const isCancelled = currentStatus === 'cancelled' || s.status === 'cancelled';

              return (
                <div
                  key={s.id}
                  onClick={() => {
                    setSelectedSaleId(s.id);
                    setDetailModalOpen(true);
                  }}
                  className={`bg-slate-900 border ${conf.badgeBorder} p-4 rounded-2xl space-y-3 shadow-lg relative cursor-pointer active:scale-[0.99] transition-all ${
                    isCancelled ? 'opacity-70 bg-slate-950/60' : ''
                  }`}
                >
                  {/* Top Row: Customer Name & Amount */}
                  <div className="flex items-start justify-between gap-2 border-b border-slate-800/80 pb-2.5">
                    <div>
                      <h3 className="font-black text-white text-base leading-tight uppercase tracking-tight">
                        {s.customer_name}
                      </h3>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="font-mono text-xs font-bold text-slate-400">#{s.sale_number}</span>
                        <span className="text-[11px] text-slate-500 font-mono">
                          {formatDateTime(s.created_at).split(' ')[1] || formatDateTime(s.created_at)}
                        </span>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <span className={`font-black text-lg font-mono block ${isCancelled ? 'line-through text-slate-500' : 'text-emerald-400'}`}>
                        {formatCurrency(s.total_amount)}
                      </span>
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                        {s.payment_type === 'pesin' ? 'Peşin' : `${s.term_days || 30}G Vadeli`}
                      </span>
                    </div>
                  </div>

                  {/* Middle Row: Status Badge */}
                  <div className="flex items-center justify-between">
                    <div className={`px-3 py-1 rounded-xl border ${conf.badgeBg} ${conf.badgeBorder} flex items-center gap-1.5 text-xs font-black font-mono`}>
                      <span>{conf.emoji}</span>
                      <span className={conf.badgeText}>{conf.label}</span>
                    </div>

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        openSaleDocumentModal(s.id);
                      }}
                      className="px-2.5 py-1 rounded-lg bg-slate-800 text-blue-300 text-xs font-semibold flex items-center gap-1"
                    >
                      <FileText className="w-3.5 h-3.5" />
                      <span>PDF</span>
                    </button>
                  </div>

                  {/* Bottom Row: Big Touch Action Button (REQUIREMENT 12) */}
                  {!isCancelled && (
                    <div className="pt-1 flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                      {conf.nextStatus && (
                        <button
                          type="button"
                          onClick={() => handleAdvanceStatus(s)}
                          disabled={updatingStatusId === s.id}
                          className={`flex-1 py-3 px-4 rounded-xl font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-lg active:scale-95 transition-all ${conf.nextActionColor}`}
                        >
                          {updatingStatusId === s.id ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <>
                              <span>[ {conf.nextActionLabel} ]</span>
                              <ArrowRight className="w-4 h-4" />
                            </>
                          )}
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => {
                          setCancelSale(s);
                          setCancelModalOpen(true);
                        }}
                        className="px-3 py-3 rounded-xl bg-rose-950/60 hover:bg-rose-900 border border-rose-800/60 text-rose-300 font-bold text-xs flex items-center justify-center shrink-0"
                        title="İptal Et"
                      >
                        <Ban className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* DESKTOP TABLE VIEW (REQUIREMENT 13) - Visible on sm:block */}
          <div className="hidden sm:block bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-950 text-slate-400 uppercase tracking-wider font-semibold border-b border-slate-800">
                  <tr>
                    <th className="p-4">Sipariş No & Tarih</th>
                    <th className="p-4">Müşteri</th>
                    <th className="p-4 text-center">Ödeme & Vade</th>
                    <th className="p-4 text-right">Toplam Tutar</th>
                    <th className="p-4 text-center">Operasyonel Durum</th>
                    <th className="p-4 text-center">Durum İlerlet</th>
                    <th className="p-4 text-right">İşlemler</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/70 text-slate-200">
                  {filteredSales.map((s) => {
                    const currentStatus: OrderStatus = (s.order_status as OrderStatus) || (s.status === 'cancelled' ? 'cancelled' : 'received');
                    const conf = ORDER_STATUS_MAP[currentStatus] || ORDER_STATUS_MAP.received;
                    const isCancelled = currentStatus === 'cancelled' || s.status === 'cancelled';

                    return (
                      <tr
                        key={s.id}
                        onClick={() => {
                          setSelectedSaleId(s.id);
                          setDetailModalOpen(true);
                        }}
                        className={`hover:bg-slate-800/50 cursor-pointer transition-colors ${
                          isCancelled ? 'bg-slate-950/40 opacity-75' : ''
                        }`}
                      >
                        <td className="p-4">
                          <span className={`font-bold text-white block text-sm ${isCancelled ? 'line-through text-slate-500' : ''}`}>
                            {s.sale_number}
                          </span>
                          <span className="text-[11px] text-slate-400">{formatDateTime(s.created_at)}</span>
                        </td>

                        <td className="p-4 font-semibold text-slate-100 text-sm">
                          {s.customer_name}
                        </td>

                        <td className="p-4 text-center">
                          <span
                            className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                              s.payment_type === 'pesin'
                                ? 'bg-emerald-950 text-emerald-300 border border-emerald-800/50'
                                : 'bg-amber-950 text-amber-300 border border-amber-800/50'
                            }`}
                          >
                            {s.payment_type === 'pesin' ? 'Peşin' : `Vadeli (${s.term_days || 30} Gün)`}
                          </span>
                        </td>

                        <td className={`p-4 text-right font-extrabold text-sm ${isCancelled ? 'line-through text-slate-500' : 'text-white'}`}>
                          {formatCurrency(s.total_amount)}
                        </td>

                        <td className="p-4 text-center">
                          <span
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-[11px] font-extrabold uppercase border ${conf.badgeBg} ${conf.badgeText} ${conf.badgeBorder}`}
                          >
                            <span>{conf.emoji}</span>
                            <span>{conf.label}</span>
                          </span>
                        </td>

                        <td className="p-4 text-center" onClick={(e) => e.stopPropagation()}>
                          {!isCancelled && conf.nextStatus ? (
                            <button
                              type="button"
                              onClick={() => handleAdvanceStatus(s)}
                              disabled={updatingStatusId === s.id}
                              className={`px-3 py-1.5 rounded-xl font-extrabold text-[11px] uppercase tracking-wider flex items-center justify-center gap-1.5 mx-auto transition-all shadow-md active:scale-95 ${conf.nextActionColor}`}
                            >
                              {updatingStatusId === s.id ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <>
                                  <span>{conf.nextActionLabel}</span>
                                  <ArrowRight className="w-3.5 h-3.5" />
                                </>
                              )}
                            </button>
                          ) : isCancelled ? (
                            <span className="text-[11px] text-rose-400 font-bold uppercase">İptal Edildi</span>
                          ) : (
                            <span className="text-[11px] text-sky-400 font-bold uppercase">Tamamlandı</span>
                          )}
                        </td>

                        <td className="p-4 text-right">
                          <div className="flex items-center justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
                            <button
                              onClick={() => openSaleDocumentModal(s.id)}
                              className="px-2.5 py-1 text-xs font-semibold text-blue-300 bg-blue-950/60 hover:bg-blue-900/60 border border-blue-800/40 rounded-lg flex items-center gap-1 transition-all"
                              title="Satış Belgesini Gör / Yazdır"
                            >
                              <FileText className="w-3.5 h-3.5" />
                              <span>Belge</span>
                            </button>

                            {!isCancelled && (
                              <button
                                onClick={() => {
                                  setCancelSale(s);
                                  setCancelModalOpen(true);
                                }}
                                className="p-1.5 text-rose-400 hover:text-rose-200 hover:bg-rose-950/60 border border-rose-800/40 rounded-lg"
                                title="İptal Et"
                              >
                                <Ban className="w-4 h-4" />
                              </button>
                            )}

                            <button
                              onClick={() => {
                                setSelectedSaleId(s.id);
                                setDetailModalOpen(true);
                              }}
                              className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg"
                              title="Detayları İncele"
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* Sale Detail Modal */}
      <SaleDetailModal
        isOpen={detailModalOpen}
        onClose={() => setDetailModalOpen(false)}
        saleId={selectedSaleId}
        onRefreshParent={fetchSales}
      />

      {/* Confirm Delivery Modal (Requirement 8) */}
      <ConfirmDeliveryModal
        isOpen={deliveryModalOpen}
        onClose={() => setDeliveryModalOpen(false)}
        sale={deliverySale}
        onSuccess={fetchSales}
        onOpenDocument={(s) => openSaleDocumentModal(s.id)}
      />


      {/* Cancel Sale Modal (Requirement 9) */}
      <CancelSaleModal
        isOpen={cancelModalOpen}
        onClose={() => setCancelModalOpen(false)}
        sale={cancelSale}
        onSuccess={fetchSales}
      />
    </div>
  );
};
