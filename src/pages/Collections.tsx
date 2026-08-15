import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useOutletContext } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import {
  formatCurrency,
  formatDate,
  formatDateTime,
  getTodayRangeTR,
  getThisWeekRangeTR,
  getThisMonthRangeTR,
} from '@/utils/formatters';
import { Customer, Payment, Sale } from '@/types/database.types';
import { LayoutContextType } from '@/components/layout/Layout';
import {
  calculateCustomerPaymentDelay,
  CustomerPaymentDelayResult,
} from '@/services/customerOverdueService';
import {
  getWhatsAppAuditStatusesForPayments,
  normalizeTurkishPhone,
  openWhatsAppWeb,
  logWhatsAppShareAttempt,
  getBusinessName,
  WhatsAppAuditStatus,
} from '@/services/whatsappService';
import { PaymentDetailModal, PaymentDetailItem } from '@/components/modals/PaymentDetailModal';
import { useToast } from '@/context/ToastContext';
import {
  Receipt,
  Search,
  Plus,
  Loader2,
  AlertTriangle,
  Calendar,
  CheckCircle2,
  Clock,
  TrendingUp,
  ArrowRightLeft,
  Banknote,
  CreditCard,
  Building,
  DollarSign,
  MessageSquare,
  Filter,
  Eye,
  Send,
  Users,
  CheckCircle,
  RefreshCw,
} from 'lucide-react';

type MainViewTab = 'tracking' | 'history';
type HistoryFilterType = 'ALL' | 'WA_SENT' | 'WA_NOT_SENT' | 'OFFSET' | 'NORMAL';

interface PaymentRecord {
  id: string;
  created_at: string;
  amount: number;
  payment_method: string;
  notes?: string | null;
  customer_id: string;
  customer_name: string;
  customer_phone?: string | null;
  supplier_id?: string | null;
  supplier_name?: string | null;
  supplier_phone?: string | null;
  is_offset: boolean;
  customer_balance?: number;
  supplier_balance?: number;
  audit_status?: WhatsAppAuditStatus;
}

export const Collections: React.FC = () => {
  const { openPaymentModal } = useOutletContext<LayoutContextType>();
  const { showSuccess, showError } = useToast();

  const [loading, setLoading] = useState(true);
  const [activeMainTab, setActiveMainTab] = useState<MainViewTab>('tracking');
  const [historyFilter, setHistoryFilter] = useState<HistoryFilterType>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Top Metrics
  const [todayCollected, setTodayCollected] = useState(0);
  const [weeklyCollected, setWeeklyCollected] = useState(0);
  const [monthlyCollected, setMonthlyCollected] = useState(0);

  // Categorized Overdue & Weekly Collection Lists
  const [criticalOverdue, setCriticalOverdue] = useState<CustomerPaymentDelayResult[]>([]); // 10+ Days (🔴)
  const [weeklyDue, setWeeklyDue] = useState<CustomerPaymentDelayResult[]>([]);             // 7-10 Days (🟡)
  const [upcomingDue, setUpcomingDue] = useState<CustomerPaymentDelayResult[]>([]);         // 4-6 Days (🟢)

  // Payments History List
  const [paymentsList, setPaymentsList] = useState<PaymentRecord[]>([]);

  // Payment Detail Modal
  const [selectedDetailPayment, setSelectedDetailPayment] = useState<PaymentDetailItem | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);

  const fetchCollectionsData = useCallback(async () => {
    setLoading(true);
    try {
      const todayRange = getTodayRangeTR();
      const weekRange = getThisWeekRangeTR();
      const monthRange = getThisMonthRangeTR();

      // 1. Fetch Active Customers
      const { data: cData } = await supabase
        .from('customers')
        .select('*')
        .is('deleted_at', null);

      const custMap: Record<string, Customer> = {};
      (cData || []).forEach((c) => {
        custMap[c.id] = c;
      });

      // 2. Fetch Suppliers for Offset reference
      const { data: supData } = await supabase
        .from('suppliers')
        .select('id, company_name, phone')
        .is('deleted_at', null);

      const supMap: Record<string, { company_name: string; phone?: string | null }> = {};
      (supData || []).forEach((s) => {
        supMap[s.id] = s;
      });

      // 3. Fetch Customer Ledger Balances
      const { data: cLedgers } = await supabase
        .from('customer_ledger')
        .select('customer_id, balance')
        .is('deleted_at', null)
        .order('created_at', { ascending: false });

      const customerDebtMap: Record<string, number> = {};
      cLedgers?.forEach((l) => {
        if (customerDebtMap[l.customer_id] === undefined) {
          customerDebtMap[l.customer_id] = Number(l.balance || 0);
        }
      });

      // 4. Fetch Payments & Sales for Date-based Overdue Tracking
      const { data: allPayments } = await supabase
        .from('payments')
        .select('*, customer:customers(business_name, phone), supplier:suppliers(company_name, phone)')
        .is('deleted_at', null)
        .order('created_at', { ascending: false });

      const { data: allSales } = await supabase
        .from('sales')
        .select('*')
        .is('deleted_at', null);

      // 5. Calculate Metrics for Today, Week, Month Collected
      let tCol = 0;
      let wCol = 0;
      let mCol = 0;

      const formattedHistory: PaymentRecord[] = (allPayments || []).map((p) => {
        const amt = Number(p.amount || 0);
        const createdIso = p.created_at;
        const createdDateStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul' }).format(new Date(createdIso));
        const method = p.payment_method || 'Nakit';
        const isOffset = method === 'Tedarikçiye Mahsup' || !!p.supplier_id;

        if (createdDateStr === todayRange.dateStr) {
          tCol += amt;
        }
        if (createdDateStr >= weekRange.startDateStr && createdDateStr <= weekRange.endDateStr) {
          wCol += amt;
        }
        if (createdDateStr >= monthRange.startDateStr && createdDateStr <= monthRange.endDateStr) {
          mCol += amt;
        }

        const custName = p.customer?.business_name || custMap[p.customer_id]?.business_name || 'Bilinmeyen Müşteri';
        const custPhone = p.customer?.phone || custMap[p.customer_id]?.phone || null;
        const supName = p.supplier?.company_name || (p.supplier_id ? supMap[p.supplier_id]?.company_name : null);
        const supPhone = p.supplier?.phone || (p.supplier_id ? supMap[p.supplier_id]?.phone : null);

        return {
          id: p.id,
          created_at: p.created_at,
          amount: amt,
          payment_method: method,
          notes: p.notes,
          customer_id: p.customer_id,
          customer_name: custName,
          customer_phone: custPhone,
          supplier_id: p.supplier_id,
          supplier_name: supName,
          supplier_phone: supPhone,
          is_offset: isOffset,
        };
      });

      setTodayCollected(tCol);
      setWeeklyCollected(wCol);
      setMonthlyCollected(mCol);

      // 6. WhatsApp Audit Statuses for History List
      const paymentIds = formattedHistory.map((p) => p.id);
      const auditStatusMap = await getWhatsAppAuditStatusesForPayments(paymentIds);
      const listWithAudit = formattedHistory.map((p) => ({
        ...p,
        audit_status: auditStatusMap[p.id] || { customerSent: false, supplierSent: false },
      }));
      setPaymentsList(listWithAudit);

      // 7. Classify Customers into Weekly Collection Tracking Tiers
      const criticalArr: CustomerPaymentDelayResult[] = [];
      const weeklyArr: CustomerPaymentDelayResult[] = [];
      const upcomingArr: CustomerPaymentDelayResult[] = [];

      (cData || []).forEach((c) => {
        const netDebt = customerDebtMap[c.id] || 0;
        if (netDebt > 0) {
          const delayRes = calculateCustomerPaymentDelay(c, netDebt, (allPayments as any) || [], (allSales as any) || []);
          if (delayRes.status === 'critical_10_plus_days' || delayRes.status === 'critical_14_days') {
            criticalArr.push(delayRes);
          } else if (delayRes.status === 'warning_7_10_days' || delayRes.status === 'warning_7_days') {
            weeklyArr.push(delayRes);
          } else if (delayRes.status === 'upcoming_4_6_days') {
            upcomingArr.push(delayRes);
          }
        }
      });

      // Sort lists by days since last payment descending
      criticalArr.sort((a, b) => b.daysSinceLastPayment - a.daysSinceLastPayment);
      weeklyArr.sort((a, b) => b.daysSinceLastPayment - a.daysSinceLastPayment);
      upcomingArr.sort((a, b) => b.daysSinceLastPayment - a.daysSinceLastPayment);

      setCriticalOverdue(criticalArr);
      setWeeklyDue(weeklyArr);
      setUpcomingDue(upcomingArr);
    } catch (err: any) {
      console.error(err);
      showError('Tahsilat takip verileri yüklenirken hata oluştu.');
    } finally {
      setLoading(false);
    }
  }, [showError]);

  useEffect(() => {
    fetchCollectionsData();
    const handleRefresh = () => fetchCollectionsData();
    window.addEventListener('refresh-data', handleRefresh);
    return () => window.removeEventListener('refresh-data', handleRefresh);
  }, [fetchCollectionsData]);

  // Aggregates for Collection Tiers
  const weeklyDueDebtSum = useMemo(() => weeklyDue.reduce((acc, curr) => acc + curr.netTotalDebt, 0), [weeklyDue]);
  const criticalOverdueDebtSum = useMemo(() => criticalOverdue.reduce((acc, curr) => acc + curr.netTotalDebt, 0), [criticalOverdue]);

  // WhatsApp Reminder Handler
  const handleSendCollectionReminder = async (item: CustomerPaymentDelayResult) => {
    if (!item.customer_phone) {
      showError(`"${item.customer_name}" firmasına ait geçerli bir telefon numarası bulunamadı.`);
      return;
    }

    const norm = normalizeTurkishPhone(item.customer_phone);
    if (!norm.isValid) {
      showError(`"${item.customer_name}" telefon numarası geçersiz: ${item.customer_phone}`);
      return;
    }

    const lastDateText = item.lastPaymentDate ? formatDate(item.lastPaymentDate) : 'Henüz ödeme yapılmadı';
    const bName = getBusinessName();
    const msg = `Merhaba ${item.customer_name},\n\nHesabınızda ${formatCurrency(item.netTotalDebt)} güncel cari borç bakiyesi bulunmaktadır.\n\nSon ödemenizin üzerinden ${item.daysSinceLastPayment} gün geçmiştir (Son ödeme tarihi: ${lastDateText}).\n\nHaftalık tahsilat takvimimiz doğrultusunda ödeme durumunuzla ilgili bilgi vermenizi rica ederiz.\n\nTeşekkür ederiz.\n${bName}`;

    await logWhatsAppShareAttempt('customers', item.customer_id, norm.normalized, {
      type: 'collection_reminder',
      customer_name: item.customer_name,
      debt: item.netTotalDebt,
      days: item.daysSinceLastPayment,
    });

    openWhatsAppWeb(norm.normalized, msg);
    showSuccess(`WhatsApp tahsilat hatırlatma mesajı açıldı (${item.customer_name}).`);
  };

  // Filtered History
  const filteredHistory = useMemo(() => {
    return paymentsList.filter((p) => {
      const matchQuery =
        p.customer_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (p.notes && p.notes.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (p.supplier_name && p.supplier_name.toLowerCase().includes(searchQuery.toLowerCase()));

      if (!matchQuery) return false;

      if (historyFilter === 'OFFSET') return p.is_offset;
      if (historyFilter === 'NORMAL') return !p.is_offset;
      if (historyFilter === 'WA_SENT') return p.audit_status?.customerSent === true;
      if (historyFilter === 'WA_NOT_SENT') return p.audit_status?.customerSent !== true;

      return true;
    });
  }, [paymentsList, searchQuery, historyFilter]);

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-6 animate-fadeIn pb-24">
      {/* Header Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-900 border border-slate-800 p-4 sm:p-6 rounded-2xl shadow-xl">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-1 rounded-lg bg-brand-600/20 text-brand-400 text-xs font-extrabold border border-brand-500/30">
              HAFTALIK DÖNGÜ SİSTEMİ
            </span>
            <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight">
              HAFTALIK TAHSİLAT TAKİP PANELİ
            </h1>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Müşterilerinizin son ödeme tarihlerini takip edin, 7-10 gündür ödeme yapmayan borçlu işletmeleri anında tespit edin.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => openPaymentModal()}
            className="bg-brand-600 hover:bg-brand-500 text-white font-extrabold px-4 py-2.5 rounded-xl text-xs sm:text-sm flex items-center gap-2 shadow-lg shadow-brand-600/20 transition-all active:scale-95"
          >
            <Plus className="w-4 h-4" />
            <span>YENİ TAHSİLAT / MAHSUP GİR</span>
          </button>
        </div>
      </div>

      {/* TOP SUMMARY METRICS (5 KEY CARDS) */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 sm:gap-4">
        <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl shadow-md">
          <span className="text-[11px] text-slate-400 font-medium uppercase block">BUGÜN TAHSİL EDİLEN</span>
          <span className="text-lg sm:text-xl font-black text-emerald-400 block mt-1">
            {formatCurrency(todayCollected)}
          </span>
          <span className="text-[10px] text-slate-500 block mt-0.5">Bugünkü Kasa Girişi</span>
        </div>

        <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl shadow-md">
          <span className="text-[11px] text-slate-400 font-medium uppercase block">BU HAFTA TAHSİL EDİLEN</span>
          <span className="text-lg sm:text-xl font-black text-emerald-300 block mt-1">
            {formatCurrency(weeklyCollected)}
          </span>
          <span className="text-[10px] text-slate-500 block mt-0.5">Son 7 Günlük Tahsilat</span>
        </div>

        <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl shadow-md">
          <span className="text-[11px] text-slate-400 font-medium uppercase block">BU AY TAHSİL EDİLEN</span>
          <span className="text-lg sm:text-xl font-black text-white block mt-1">
            {formatCurrency(monthlyCollected)}
          </span>
          <span className="text-[10px] text-slate-500 block mt-0.5">Aylık Toplam Tahsilat</span>
        </div>

        <div className="bg-amber-950/40 border border-amber-800/60 p-4 rounded-xl shadow-md">
          <span className="text-[11px] text-amber-300 font-medium uppercase block">TAHSİLAT BEKLEYEN (7-10 GÜN)</span>
          <span className="text-lg sm:text-xl font-black text-amber-400 block mt-1">
            {weeklyDue.length} Müşteri
          </span>
          <span className="text-[11px] font-extrabold text-amber-200 block mt-0.5">
            Top. Cari: {formatCurrency(weeklyDueDebtSum)}
          </span>
        </div>

        <div className="bg-rose-950/40 border border-rose-800/60 p-4 rounded-xl shadow-md">
          <span className="text-[11px] text-rose-300 font-medium uppercase block">GECİKEN TAHSİLAT (10+ GÜN)</span>
          <span className="text-lg sm:text-xl font-black text-rose-400 block mt-1">
            {criticalOverdue.length} Müşteri
          </span>
          <span className="text-[11px] font-extrabold text-rose-200 block mt-0.5">
            Top. Cari: {formatCurrency(criticalOverdueDebtSum)}
          </span>
        </div>
      </div>

      {/* VIEW SELECTION TABS */}
      <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
        <button
          onClick={() => setActiveMainTab('tracking')}
          className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-extrabold transition-all flex items-center gap-2 ${
            activeMainTab === 'tracking'
              ? 'bg-brand-600 text-white shadow-md shadow-brand-600/20'
              : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
          }`}
        >
          <Clock className="w-4 h-4" />
          <span>HAFTALIK TAHSİLAT TAKİP LİSTELERİ ({weeklyDue.length + criticalOverdue.length + upcomingDue.length})</span>
        </button>

        <button
          onClick={() => setActiveMainTab('history')}
          className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-extrabold transition-all flex items-center gap-2 ${
            activeMainTab === 'history'
              ? 'bg-brand-600 text-white shadow-md shadow-brand-600/20'
              : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
          }`}
        >
          <Receipt className="w-4 h-4" />
          <span>GEÇMİŞ TAHSİLAT HAREKETLERİ ({paymentsList.length})</span>
        </button>
      </div>

      {/* TAB 1: WEEKLY COLLECTION TRACKING PANELS */}
      {activeMainTab === 'tracking' && (
        <div className="space-y-8">
          {/* 🔴 SECTION 1: GECİKEN TAHSİLATLAR (10+ GÜN) */}
          <div className="bg-slate-900 border border-rose-900/60 p-5 rounded-2xl space-y-4 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-rose-950 text-rose-400 border border-rose-800 flex items-center justify-center font-black">
                  🔴
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-white tracking-tight flex items-center gap-2">
                    <span>GECİKEN TAHSİLATLAR</span>
                    <span className="bg-rose-950 text-rose-300 border border-rose-800 text-xs px-2.5 py-0.5 rounded-full font-black">
                      {criticalOverdue.length} MÜŞTERİ • {formatCurrency(criticalOverdueDebtSum)}
                    </span>
                  </h3>
                  <p className="text-xs text-slate-400">
                    Son ödemesinin/teslimatının üzerinden 10 günden fazla geçmiş borçlu müşteriler.
                  </p>
                </div>
              </div>
            </div>

            {criticalOverdue.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-500 bg-slate-950 rounded-xl border border-slate-800/60 flex items-center justify-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span className="font-bold text-emerald-300">Harika! 10 günden fazla geciken borçlu müşteri bulunmamaktadır.</span>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {criticalOverdue.map((item) => (
                  <div
                    key={item.customer_id}
                    className="bg-slate-950 border border-rose-900/80 p-4 rounded-xl space-y-3 relative hover:border-rose-700 transition-all shadow-md"
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <h4 className="font-bold text-white text-sm">{item.customer_name}</h4>
                        <span className="text-[11px] text-rose-400 font-extrabold block mt-0.5">
                          🔴 {item.daysSinceLastPayment} Gündür Ödeme Yok
                        </span>
                      </div>
                      <span className="text-xs font-mono font-bold text-slate-400 bg-slate-900 px-2 py-1 rounded-lg border border-slate-800">
                        {item.daysSinceLastPayment} Gün
                      </span>
                    </div>

                    <div className="bg-slate-900/80 p-3 rounded-lg border border-slate-800 space-y-1.5 text-xs">
                      <div className="flex justify-between items-center">
                        <span className="text-slate-400">Güncel Cari Borç:</span>
                        <span className="font-black text-amber-400 text-sm">{formatCurrency(item.netTotalDebt)}</span>
                      </div>
                      <div className="flex justify-between items-center text-[11px]">
                        <span className="text-slate-500">Son Ödeme Tarihi:</span>
                        <span className="font-mono text-slate-300">
                          {item.lastPaymentDate ? formatDate(item.lastPaymentDate) : 'Henüz Yok'}
                        </span>
                      </div>
                      <div className="flex justify-between items-center text-[11px]">
                        <span className="text-slate-500">Son Ödeme Tutarı:</span>
                        <span className="font-mono text-emerald-400 font-bold">
                          {item.lastPaymentAmount ? formatCurrency(item.lastPaymentAmount) : '-'}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 pt-1">
                      <button
                        onClick={() => openPaymentModal(item.customer_id)}
                        className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-2 rounded-xl text-xs flex items-center justify-center gap-1.5 shadow-md transition-all active:scale-95"
                      >
                        <Receipt className="w-3.5 h-3.5" />
                        <span>TAHSİLAT AL</span>
                      </button>

                      <button
                        onClick={() => handleSendCollectionReminder(item)}
                        className="bg-emerald-950 hover:bg-emerald-900 border border-emerald-800 text-emerald-300 font-bold px-3 py-2 rounded-xl text-xs flex items-center gap-1 transition-all"
                        title="WhatsApp Tahsilat Hatırlatma Mesajı Aç"
                      >
                        <Send className="w-3.5 h-3.5" />
                        <span>HATIRLAT</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 🟡 SECTION 2: BU HAFTA TAHSİLAT ALINACAKLAR (7-10 GÜN) */}
          <div className="bg-slate-900 border border-amber-900/60 p-5 rounded-2xl space-y-4 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-amber-950 text-amber-400 border border-amber-800 flex items-center justify-center font-black">
                  🟡
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-white tracking-tight flex items-center gap-2">
                    <span>BU HAFTA TAHSİLAT ALINACAKLAR (TAHSİLAT ZAMANI)</span>
                    <span className="bg-amber-950 text-amber-300 border border-amber-800 text-xs px-2.5 py-0.5 rounded-full font-black">
                      {weeklyDue.length} MÜŞTERİ • {formatCurrency(weeklyDueDebtSum)}
                    </span>
                  </h3>
                  <p className="text-xs text-slate-400">
                    Son ödemesinin üzerinden 7-10 gün geçmiş, bu hafta içinde ödeme istenmesi gereken borçlu müşteriler.
                  </p>
                </div>
              </div>
            </div>

            {weeklyDue.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-500 bg-slate-950 rounded-xl border border-slate-800/60 flex items-center justify-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span className="font-bold text-emerald-300">Bu hafta tahsilat zamanı gelmiş ödenmemiş müşteri bulunmamaktadır.</span>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {weeklyDue.map((item) => (
                  <div
                    key={item.customer_id}
                    className="bg-slate-950 border border-amber-900/80 p-4 rounded-xl space-y-3 relative hover:border-amber-700 transition-all shadow-md"
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <h4 className="font-bold text-white text-sm">{item.customer_name}</h4>
                        <span className="text-[11px] text-amber-400 font-extrabold block mt-0.5">
                          🟡 {item.daysSinceLastPayment} Gündür Ödeme Yok
                        </span>
                      </div>
                      <span className="text-xs font-mono font-bold text-slate-400 bg-slate-900 px-2 py-1 rounded-lg border border-slate-800">
                        {item.daysSinceLastPayment} Gün
                      </span>
                    </div>

                    <div className="bg-slate-900/80 p-3 rounded-lg border border-slate-800 space-y-1.5 text-xs">
                      <div className="flex justify-between items-center">
                        <span className="text-slate-400">Güncel Cari Borç:</span>
                        <span className="font-black text-amber-400 text-sm">{formatCurrency(item.netTotalDebt)}</span>
                      </div>
                      <div className="flex justify-between items-center text-[11px]">
                        <span className="text-slate-500">Son Ödeme Tarihi:</span>
                        <span className="font-mono text-slate-300">
                          {item.lastPaymentDate ? formatDate(item.lastPaymentDate) : 'Henüz Yok'}
                        </span>
                      </div>
                      <div className="flex justify-between items-center text-[11px]">
                        <span className="text-slate-500">Son Ödeme Tutarı:</span>
                        <span className="font-mono text-emerald-400 font-bold">
                          {item.lastPaymentAmount ? formatCurrency(item.lastPaymentAmount) : '-'}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 pt-1">
                      <button
                        onClick={() => openPaymentModal(item.customer_id)}
                        className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-2 rounded-xl text-xs flex items-center justify-center gap-1.5 shadow-md transition-all active:scale-95"
                      >
                        <Receipt className="w-3.5 h-3.5" />
                        <span>TAHSİLAT AL</span>
                      </button>

                      <button
                        onClick={() => handleSendCollectionReminder(item)}
                        className="bg-emerald-950 hover:bg-emerald-900 border border-emerald-800 text-emerald-300 font-bold px-3 py-2 rounded-xl text-xs flex items-center gap-1 transition-all"
                        title="WhatsApp Tahsilat Hatırlatma Mesajı Aç"
                      >
                        <Send className="w-3.5 h-3.5" />
                        <span>HATIRLAT</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 🟢 SECTION 3: YAKLAŞAN TAHSİLATLAR (4-6 GÜN) */}
          <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl space-y-4 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-emerald-950 text-emerald-400 border border-emerald-800 flex items-center justify-center font-black">
                  🟢
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-white tracking-tight flex items-center gap-2">
                    <span>YAKLAŞAN TAHSİLATLAR (4–6 GÜN)</span>
                    <span className="bg-slate-800 text-slate-300 border border-slate-700 text-xs px-2.5 py-0.5 rounded-full font-bold">
                      {upcomingDue.length} MÜŞTERİ
                    </span>
                  </h3>
                  <p className="text-xs text-slate-400">
                    Son ödemesinin/teslimatının üzerinden 4-6 gün geçmiş borçlu müşteriler (Yakında tahsilat zamanı gelecek).
                  </p>
                </div>
              </div>
            </div>

            {upcomingDue.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-500 bg-slate-950 rounded-xl border border-slate-800/60">
                Yaklaşan periyotta ödeme zamanı yaklaşan müşteri bulunmamaktadır.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {upcomingDue.map((item) => (
                  <div
                    key={item.customer_id}
                    className="bg-slate-950 border border-slate-800 p-4 rounded-xl space-y-3 hover:border-slate-700 transition-all"
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <h4 className="font-bold text-white text-sm">{item.customer_name}</h4>
                        <span className="text-[11px] text-emerald-400 font-extrabold block mt-0.5">
                          🟢 {item.daysSinceLastPayment} Gün Oldu
                        </span>
                      </div>
                      <span className="text-xs font-mono font-bold text-slate-400 bg-slate-900 px-2 py-1 rounded-lg border border-slate-800">
                        {item.daysSinceLastPayment} Gün
                      </span>
                    </div>

                    <div className="bg-slate-900/80 p-3 rounded-lg border border-slate-800 space-y-1.5 text-xs">
                      <div className="flex justify-between items-center">
                        <span className="text-slate-400">Güncel Cari Borç:</span>
                        <span className="font-bold text-amber-400">{formatCurrency(item.netTotalDebt)}</span>
                      </div>
                      <div className="flex justify-between items-center text-[11px]">
                        <span className="text-slate-500">Son Ödeme Tarihi:</span>
                        <span className="font-mono text-slate-300">
                          {item.lastPaymentDate ? formatDate(item.lastPaymentDate) : 'Henüz Yok'}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 pt-1">
                      <button
                        onClick={() => openPaymentModal(item.customer_id)}
                        className="w-full bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-bold py-2 rounded-xl text-xs flex items-center justify-center gap-1.5 transition-all"
                      >
                        <Receipt className="w-3.5 h-3.5 text-emerald-400" />
                        <span>Erken Tahsilat Gir</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: PAYMENTS HISTORY LIST */}
      {activeMainTab === 'history' && (
        <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl space-y-4 shadow-xl">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 border-b border-slate-800 pb-4">
            {/* Search Bar */}
            <div className="relative w-full sm:w-80">
              <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Müşteri veya açıklama ara..."
                className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-4 py-2 text-xs text-white placeholder-slate-500 outline-none focus:border-brand-500"
              />
            </div>

            {/* Filter Buttons */}
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              <button
                onClick={() => setHistoryFilter('ALL')}
                className={`px-3 py-1.5 rounded-lg font-bold transition-all ${
                  historyFilter === 'ALL' ? 'bg-brand-600 text-white' : 'bg-slate-950 text-slate-400 hover:text-white'
                }`}
              >
                Tümü ({paymentsList.length})
              </button>

              <button
                onClick={() => setHistoryFilter('NORMAL')}
                className={`px-3 py-1.5 rounded-lg font-bold transition-all ${
                  historyFilter === 'NORMAL' ? 'bg-brand-600 text-white' : 'bg-slate-950 text-slate-400 hover:text-white'
                }`}
              >
                Normal Tahsilatlar
              </button>

              <button
                onClick={() => setHistoryFilter('OFFSET')}
                className={`px-3 py-1.5 rounded-lg font-bold transition-all ${
                  historyFilter === 'OFFSET' ? 'bg-brand-600 text-white' : 'bg-slate-950 text-slate-400 hover:text-white'
                }`}
              >
                Mahsuplar
              </button>
            </div>
          </div>

          {/* History Table */}
          {filteredHistory.length === 0 ? (
            <div className="p-12 text-center text-xs text-slate-500">
              Aranan kriterlere uygun tahsilat kaydı bulunamadı.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-950 text-slate-400 uppercase font-semibold border-b border-slate-800">
                  <tr>
                    <th className="p-3">Tarih & Saat</th>
                    <th className="p-3">Müşteri / Tedarikçi</th>
                    <th className="p-3">Tür / Ödeme Yöntemi</th>
                    <th className="p-3 text-right">Tutar</th>
                    <th className="p-3 text-right">İşlem</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-slate-200">
                  {filteredHistory.map((p) => (
                    <tr key={p.id} className="hover:bg-slate-800/40 transition-colors">
                      <td className="p-3 font-mono text-slate-400">
                        {formatDateTime(p.created_at)}
                      </td>

                      <td className="p-3">
                        <span className="font-bold text-white block">{p.customer_name}</span>
                        {p.supplier_name && (
                          <span className="text-[11px] text-purple-400 block font-medium">
                            Mahsup: {p.supplier_name}
                          </span>
                        )}
                      </td>

                      <td className="p-3">
                        <span
                          className={`inline-block px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                            p.is_offset
                              ? 'bg-purple-950 text-purple-300 border border-purple-800'
                              : 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                          }`}
                        >
                          {p.payment_method}
                        </span>
                      </td>

                      <td className="p-3 text-right font-black text-emerald-400 text-sm">
                        {formatCurrency(p.amount)}
                      </td>

                      <td className="p-3 text-right">
                        <button
                          onClick={() => {
                            setSelectedDetailPayment({
                              id: p.id,
                              created_at: p.created_at,
                              amount: p.amount,
                              payment_method: p.payment_method,
                              notes: p.notes,
                              customer_id: p.customer_id,
                              customer_name: p.customer_name,
                              customer_phone: p.customer_phone,
                              supplier_id: p.supplier_id,
                              supplier_name: p.supplier_name,
                              supplier_phone: p.supplier_phone,
                              is_offset: p.is_offset,
                            });
                            setIsDetailModalOpen(true);
                          }}
                          className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-all inline-flex items-center gap-1 text-[11px] font-semibold"
                        >
                          <Eye className="w-3.5 h-3.5 text-brand-400" />
                          <span>Detay</span>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Payment Detail Modal */}
      <PaymentDetailModal
        isOpen={isDetailModalOpen}
        onClose={() => setIsDetailModalOpen(false)}
        payment={selectedDetailPayment}
      />
    </div>
  );
};
