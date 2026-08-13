import React, { useEffect, useState, useCallback } from 'react';
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
import { Customer } from '@/types/database.types';
import { LayoutContextType } from '@/components/layout/Layout';
import {
  getWhatsAppAuditStatusesForPayments,
  buildCustomerCollectionWhatsAppMessage,
  buildCustomerOffsetWhatsAppMessage,
  buildSupplierOffsetWhatsAppMessage,
  normalizeTurkishPhone,
  openWhatsAppWeb,
  logWhatsAppShareAttempt,
  getBusinessName,
  WhatsAppAuditStatus,
} from '@/services/whatsappService';
import { PaymentDetailModal, PaymentDetailItem } from '@/components/modals/PaymentDetailModal';
import { ExpectedCollectionModal, ExpectedCustomerItem } from '@/components/modals/ExpectedCollectionModal';
import { useToast } from '@/context/ToastContext';
import {
  Receipt,
  Search,
  Plus,
  Loader2,
  AlertTriangle,
  Calendar,
  CheckCircle2,
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
} from 'lucide-react';

type TimeframeType = 'daily' | 'weekly' | 'monthly';
type FilterType = 'ALL' | 'WA_SENT' | 'WA_NOT_SENT' | 'OFFSET' | 'NORMAL';

interface PerformanceMetrics {
  required: number;
  collected: number;
  remaining: number;
  rate: number;
  uniqueCustomersCount: number;
}

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
  const [activeTab, setActiveTab] = useState<TimeframeType>('daily');
  const [activeFilter, setActiveFilter] = useState<FilterType>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Performance Summaries
  const [dailyMetrics, setDailyMetrics] = useState<PerformanceMetrics>({ required: 0, collected: 0, remaining: 0, rate: 0, uniqueCustomersCount: 0 });
  const [weeklyMetrics, setWeeklyMetrics] = useState<PerformanceMetrics>({ required: 0, collected: 0, remaining: 0, rate: 0, uniqueCustomersCount: 0 });
  const [monthlyMetrics, setMonthlyMetrics] = useState<PerformanceMetrics>({ required: 0, collected: 0, remaining: 0, rate: 0, uniqueCustomersCount: 0 });

  // Cash breakdown metrics
  const [paymentMethodTotals, setPaymentMethodTotals] = useState({
    totalCollected: 0,
    cashInHand: 0,
    offsetTotal: 0,
    nakit: 0,
    kart: 0,
    eft: 0,
  });

  // Overdue Summary
  const [overdueSummary, setOverdueSummary] = useState<{ totalAmount: number; customerCount: number }>({ totalAmount: 0, customerCount: 0 });

  // Collections list
  const [paymentsList, setPaymentsList] = useState<PaymentRecord[]>([]);

  // Modals state
  const [selectedDetailPayment, setSelectedDetailPayment] = useState<PaymentDetailItem | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);

  const [expectedModalData, setExpectedModalData] = useState<{ isOpen: boolean; title: string; items: ExpectedCustomerItem[] }>({
    isOpen: false,
    title: '',
    items: [],
  });

  const [rawSchedules, setRawSchedules] = useState<any[]>([]);
  const [customersMap, setCustomersMap] = useState<Record<string, Customer>>({});

  const fetchCollectionsCenterData = useCallback(async () => {
    setLoading(true);
    try {
      const todayRange = getTodayRangeTR();
      const weekRange = getThisWeekRangeTR();
      const monthRange = getThisMonthRangeTR();

      // 1. Fetch Customers
      const { data: cData } = await supabase
        .from('customers')
        .select('*')
        .is('deleted_at', null);

      const custMap: Record<string, Customer> = {};
      cData?.forEach((c) => {
        custMap[c.id] = c;
      });
      setCustomersMap(custMap);

      // 2. Fetch Suppliers
      const { data: supData } = await supabase
        .from('suppliers')
        .select('id, company_name, phone')
        .is('deleted_at', null);

      const supMap: Record<string, { company_name: string; phone?: string | null }> = {};
      supData?.forEach((s) => {
        supMap[s.id] = s;
      });

      // 3. Fetch Payment Schedules for Targets (Gereken)
      const { data: sData } = await supabase
        .from('payment_schedules')
        .select('customer_id, remaining_amount, amount, due_date, status')
        .is('deleted_at', null);

      setRawSchedules(sData || []);

      let dailyReq = 0;
      let weeklyReq = 0;
      let monthlyReq = 0;
      let overdueAmt = 0;
      const overdueCustSet = new Set<string>();

      sData?.forEach((s) => {
        const rem = Number(s.remaining_amount || 0);
        const orig = Number(s.amount || 0);
        const amt = s.status === 'paid' ? orig : rem;
        const dueDate = s.due_date;

        if (dueDate === todayRange.dateStr) {
          dailyReq += amt;
        }

        if (dueDate >= weekRange.startDateStr && dueDate <= weekRange.endDateStr) {
          weeklyReq += amt;
        }

        if (dueDate >= monthRange.startDateStr && dueDate <= monthRange.endDateStr) {
          monthlyReq += amt;
        }

        if ((dueDate < todayRange.dateStr || s.status === 'overdue') && rem > 0) {
          overdueAmt += rem;
          overdueCustSet.add(s.customer_id);
        }
      });

      setOverdueSummary({ totalAmount: overdueAmt, customerCount: overdueCustSet.size });

      // 4. Fetch Actual Payments (Yapılan Tahsilatlar)
      const { data: pData } = await supabase
        .from('payments')
        .select('*, customer:customers(business_name, phone), supplier:suppliers(company_name, phone)')
        .is('deleted_at', null)
        .order('created_at', { ascending: false });

      let dailyCol = 0;
      let weeklyCol = 0;
      let monthlyCol = 0;

      const dailyCustSet = new Set<string>();
      const weeklyCustSet = new Set<string>();
      const monthlyCustSet = new Set<string>();

      let totCol = 0;
      let cashIn = 0;
      let offsetSum = 0;
      let nakitSum = 0;
      let kartSum = 0;
      let eftSum = 0;

      const formattedList: PaymentRecord[] = (pData || []).map((p) => {
        const amt = Number(p.amount || 0);
        const createdIso = p.created_at;
        const createdDateStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul' }).format(new Date(createdIso));
        const method = p.payment_method || 'Nakit';
        const isOffset = method === 'Tedarikçiye Mahsup' || !!p.supplier_id;

        totCol += amt;
        if (isOffset) {
          offsetSum += amt;
        } else {
          cashIn += amt;
          if (method === 'Nakit') nakitSum += amt;
          else if (method === 'Kart' || method.includes('Kart')) kartSum += amt;
          else if (method.includes('Havale') || method.includes('EFT')) eftSum += amt;
        }

        if (createdDateStr === todayRange.dateStr) {
          dailyCol += amt;
          if (p.customer_id) dailyCustSet.add(p.customer_id);
        }

        if (createdDateStr >= weekRange.startDateStr && createdDateStr <= weekRange.endDateStr) {
          weeklyCol += amt;
          if (p.customer_id) weeklyCustSet.add(p.customer_id);
        }

        if (createdDateStr >= monthRange.startDateStr && createdDateStr <= monthRange.endDateStr) {
          monthlyCol += amt;
          if (p.customer_id) monthlyCustSet.add(p.customer_id);
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

      // Fetch WhatsApp Audit Logs for all payments
      const paymentIds = formattedList.map((p) => p.id);
      const auditMap = await getWhatsAppAuditStatusesForPayments(paymentIds);

      const listWithAudits = formattedList.map((p) => ({
        ...p,
        audit_status: auditMap[p.id] || { customerSent: false, supplierSent: false },
      }));

      setPaymentsList(listWithAudits);

      // Compute metrics
      setDailyMetrics({
        required: dailyReq,
        collected: dailyCol,
        remaining: Math.max(0, dailyReq - dailyCol),
        rate: dailyReq > 0 ? Number(((dailyCol / dailyReq) * 100).toFixed(1)) : (dailyCol > 0 ? 100 : 0),
        uniqueCustomersCount: dailyCustSet.size,
      });

      setWeeklyMetrics({
        required: weeklyReq,
        collected: weeklyCol,
        remaining: Math.max(0, weeklyReq - weeklyCol),
        rate: weeklyReq > 0 ? Number(((weeklyCol / weeklyReq) * 100).toFixed(1)) : (weeklyCol > 0 ? 100 : 0),
        uniqueCustomersCount: weeklyCustSet.size,
      });

      setMonthlyMetrics({
        required: monthlyReq,
        collected: monthlyCol,
        remaining: Math.max(0, monthlyReq - monthlyCol),
        rate: monthlyReq > 0 ? Number(((monthlyCol / monthlyReq) * 100).toFixed(1)) : (monthlyCol > 0 ? 100 : 0),
        uniqueCustomersCount: monthlyCustSet.size,
      });

      setPaymentMethodTotals({
        totalCollected: totCol,
        cashInHand: cashIn,
        offsetTotal: offsetSum,
        nakit: nakitSum,
        kart: kartSum,
        eft: eftSum,
      });

    } catch (err) {
      console.error('Tahsilat merkezi veri yükleme hatası:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCollectionsCenterData();
  }, [fetchCollectionsCenterData]);

  // Open Expected / Overdue Modal Handler
  const handleOpenExpectedModal = (type: 'overdue' | 'today' | 'this_week') => {
    const todayRange = getTodayRangeTR();
    const weekRange = getThisWeekRangeTR();

    let title = '';
    const filteredItems: ExpectedCustomerItem[] = [];

    if (type === 'overdue') {
      title = '⚠️ Gecikmiş Tahsilatlar Listesi';
      const map: Record<string, { due: number; maxDate: string }> = {};

      rawSchedules.forEach((s) => {
        const rem = Number(s.remaining_amount || 0);
        if ((s.due_date < todayRange.dateStr || s.status === 'overdue') && rem > 0) {
          if (!map[s.customer_id]) {
            map[s.customer_id] = { due: 0, maxDate: s.due_date };
          }
          map[s.customer_id].due += rem;
          if (s.due_date < map[s.customer_id].maxDate) {
            map[s.customer_id].maxDate = s.due_date;
          }
        }
      });

      Object.entries(map).forEach(([cId, val]) => {
        const cust = customersMap[cId];
        filteredItems.push({
          customerId: cId,
          businessName: cust?.business_name || 'Müşteri',
          contactName: cust?.contact_name,
          phone: cust?.phone,
          dueAmount: val.due,
          dueDate: val.maxDate,
          status: 'overdue',
        });
      });
    } else if (type === 'today') {
      title = '📅 Bugün Tahsil Edilmesi Gereken Müşteriler';
      const map: Record<string, { due: number }> = {};

      rawSchedules.forEach((s) => {
        const rem = Number(s.remaining_amount || 0);
        if (s.due_date === todayRange.dateStr && rem > 0) {
          map[s.customer_id] = { due: (map[s.customer_id]?.due || 0) + rem };
        }
      });

      Object.entries(map).forEach(([cId, val]) => {
        const cust = customersMap[cId];
        filteredItems.push({
          customerId: cId,
          businessName: cust?.business_name || 'Müşteri',
          contactName: cust?.contact_name,
          phone: cust?.phone,
          dueAmount: val.due,
          dueDate: todayRange.dateStr,
          status: 'today',
        });
      });
    }

    setExpectedModalData({
      isOpen: true,
      title,
      items: filteredItems,
    });
  };

  // Quick WhatsApp Handler from table
  const handleQuickSendCustomerWhatsApp = async (p: PaymentRecord, e: React.MouseEvent) => {
    e.stopPropagation();
    const phoneNorm = normalizeTurkishPhone(p.customer_phone);
    if (!phoneNorm.isValid) {
      showError('Bu müşterinin geçerli bir WhatsApp telefonu yok.');
      return;
    }

    try {
      const bizName = await getBusinessName();
      const text = p.is_offset
        ? buildCustomerOffsetWhatsAppMessage(p.customer_name, bizName, p.amount, p.customer_balance || 0)
        : buildCustomerCollectionWhatsAppMessage(p.customer_name, bizName, p.amount, p.customer_balance || 0);

      openWhatsAppWeb(p.customer_phone!, text);

      await logWhatsAppShareAttempt('payments', p.id, phoneNorm.normalized, {
        target: 'customer',
        customer_name: p.customer_name,
        amount: p.amount,
      });

      showSuccess('Müşteri WhatsApp mesajı hazırlandı.');
      fetchCollectionsCenterData();
    } catch (err: any) {
      showError(err.message || 'WhatsApp gönderilemedi.');
    }
  };

  const handleQuickSendSupplierWhatsApp = async (p: PaymentRecord, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!p.supplier_name) return;
    const phoneNorm = normalizeTurkishPhone(p.supplier_phone);
    if (!phoneNorm.isValid) {
      showError('Bu tedarikçinin geçerli bir WhatsApp telefonu yok.');
      return;
    }

    try {
      // STRICT PRIVACY GUARANTEE: customerName is NEVER passed to supplier message!
      const text = buildSupplierOffsetWhatsAppMessage(p.supplier_name, p.amount, p.supplier_balance || 0);

      openWhatsAppWeb(p.supplier_phone!, text);

      await logWhatsAppShareAttempt('offset', p.id, phoneNorm.normalized, {
        target: 'supplier',
        supplier_name: p.supplier_name,
        amount: p.amount,
      });

      showSuccess('Tedarikçi WhatsApp mesajı hazırlandı.');
      fetchCollectionsCenterData();
    } catch (err: any) {
      showError(err.message || 'WhatsApp gönderilemedi.');
    }
  };

  // Active metrics based on current tab selection
  const currentMetrics = activeTab === 'daily' ? dailyMetrics : activeTab === 'weekly' ? weeklyMetrics : monthlyMetrics;
  const currentTabTitle = activeTab === 'daily' ? 'BUGÜN' : activeTab === 'weekly' ? 'BU HAFTA' : 'BU AY';

  // Filtered Payments
  const filteredPayments = paymentsList.filter((p) => {
    const matchesSearch =
      p.customer_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (p.supplier_name && p.supplier_name.toLowerCase().includes(searchQuery.toLowerCase())) ||
      p.amount.toString().includes(searchQuery);

    if (!matchesSearch) return false;

    if (activeFilter === 'WA_SENT') {
      return p.audit_status?.customerSent || (p.is_offset && p.audit_status?.supplierSent);
    }
    if (activeFilter === 'WA_NOT_SENT') {
      return !p.audit_status?.customerSent || (p.is_offset && !p.audit_status?.supplierSent);
    }
    if (activeFilter === 'OFFSET') {
      return p.is_offset;
    }
    if (activeFilter === 'NORMAL') {
      return !p.is_offset;
    }

    return true;
  });

  return (
    <div className="p-4 sm:p-6 md:p-8 space-y-6 sm:space-y-8 font-sans max-w-7xl mx-auto">
      {/* HEADER SECTION */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
              Tahsilat Yönetim Merkezi
            </h1>
            <span className="bg-emerald-950 text-emerald-400 border border-emerald-800 text-[11px] font-bold px-2.5 py-0.5 rounded-full">
              Canlı Takip
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Günlük, haftalık ve aylık tahsilat hedefleri, tahsilat geçmişi ve WhatsApp bildirim durumları.
          </p>
        </div>

        <button
          onClick={() => openPaymentModal()}
          className="py-3 px-5 rounded-2xl font-bold text-xs sm:text-sm bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-white shadow-xl shadow-emerald-600/25 flex items-center justify-center gap-2 transition-all active:scale-98 shrink-0"
        >
          <Plus className="w-4 h-4 sm:w-5 sm:h-5" />
          <span>Yeni Tahsilat / Mahsup Gir</span>
        </button>
      </div>

      {/* OVERDUE ALERTS BANNER (If any) */}
      {overdueSummary.customerCount > 0 && (
        <div
          onClick={() => handleOpenExpectedModal('overdue')}
          className="bg-amber-950/40 border border-amber-800/80 hover:border-amber-600 p-4 sm:p-5 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 cursor-pointer transition-all shadow-lg group"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-600/20 border border-amber-500/40 flex items-center justify-center text-amber-400 shrink-0">
              <AlertTriangle className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <h3 className="font-extrabold text-white text-sm sm:text-base group-hover:text-amber-300 transition-colors">
                ⚠️ Gecikmiş Tahsilat Uyarısı! ({overdueSummary.customerCount} Müşteri)
              </h3>
              <p className="text-xs text-amber-300/90 mt-0.5">
                Vadesi geçmiş toplam <strong className="text-amber-200">{formatCurrency(overdueSummary.totalAmount)}</strong> ödenmemiş alacağınız bulunuyor.
              </p>
            </div>
          </div>
          <span className="text-xs font-extrabold text-amber-400 bg-amber-900/60 px-3 py-1.5 rounded-xl border border-amber-700/60 self-start sm:self-auto group-hover:bg-amber-800 transition-colors">
            Geciken Müşterileri Listele →
          </span>
        </div>
      )}

      {/* TOP SUMMARY CARDS (DAILY, WEEKLY, MONTHLY MOBILE FIRST) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6">
        {/* DAILY CARD */}
        <div
          onClick={() => setActiveTab('daily')}
          className={`p-5 rounded-3xl border transition-all cursor-pointer ${
            activeTab === 'daily'
              ? 'bg-slate-900 border-emerald-500/70 shadow-xl shadow-emerald-950/40 ring-1 ring-emerald-500/50'
              : 'bg-slate-900/70 border-slate-800/90 hover:border-slate-700'
          }`}
        >
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-emerald-400 animate-ping" />
              <h3 className="font-extrabold text-white text-base">BUGÜN</h3>
            </div>
            <span className="text-xs font-bold text-slate-400 bg-slate-800 px-2.5 py-1 rounded-lg">
              {dailyMetrics.uniqueCustomersCount} Müşteri
            </span>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400 font-medium">Gereken Target:</span>
              <span className="font-extrabold text-white text-sm">{formatCurrency(dailyMetrics.required)}</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400 font-medium">Tahsil Edilen:</span>
              <span className="font-extrabold text-emerald-400 text-sm">{formatCurrency(dailyMetrics.collected)}</span>
            </div>
            <div className="flex items-center justify-between text-xs pt-1 border-t border-slate-800">
              <span className="text-slate-400 font-medium">Kalan Hedef:</span>
              <span className="font-extrabold text-amber-400 text-sm">{formatCurrency(dailyMetrics.remaining)}</span>
            </div>
          </div>

          {/* Progress Bar */}
          <div className="mt-4 pt-2">
            <div className="flex items-center justify-between text-xs mb-1.5 font-bold">
              <span className="text-slate-300">Tahsilat Oranı</span>
              <span className={dailyMetrics.rate >= 100 ? 'text-emerald-400' : 'text-brand-400'}>
                %{dailyMetrics.rate}
              </span>
            </div>
            <div className="w-full h-2.5 bg-slate-950 rounded-full overflow-hidden p-0.5 border border-slate-800">
              <div
                className="h-full rounded-full bg-gradient-to-r from-emerald-600 to-emerald-400 transition-all duration-500"
                style={{ width: `${Math.min(100, dailyMetrics.rate)}%` }}
              />
            </div>
          </div>

          {dailyMetrics.rate >= 100 && (
            <div className="mt-3 text-[11px] font-bold text-emerald-400 bg-emerald-950/60 p-2 rounded-xl border border-emerald-800/80 flex items-center justify-center gap-1.5">
              <CheckCircle className="w-3.5 h-3.5" />
              <span>✓ Günlük tahsilat hedefi tamamlandı!</span>
            </div>
          )}
        </div>

        {/* WEEKLY CARD */}
        <div
          onClick={() => setActiveTab('weekly')}
          className={`p-5 rounded-3xl border transition-all cursor-pointer ${
            activeTab === 'weekly'
              ? 'bg-slate-900 border-emerald-500/70 shadow-xl shadow-emerald-950/40 ring-1 ring-emerald-500/50'
              : 'bg-slate-900/70 border-slate-800/90 hover:border-slate-700'
          }`}
        >
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-brand-400" />
              <h3 className="font-extrabold text-white text-base">BU HAFTA</h3>
            </div>
            <span className="text-xs font-bold text-slate-400 bg-slate-800 px-2.5 py-1 rounded-lg">
              {weeklyMetrics.uniqueCustomersCount} Müşteri
            </span>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400 font-medium">Gereken Target:</span>
              <span className="font-extrabold text-white text-sm">{formatCurrency(weeklyMetrics.required)}</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400 font-medium">Tahsil Edilen:</span>
              <span className="font-extrabold text-emerald-400 text-sm">{formatCurrency(weeklyMetrics.collected)}</span>
            </div>
            <div className="flex items-center justify-between text-xs pt-1 border-t border-slate-800">
              <span className="text-slate-400 font-medium">Kalan Hedef:</span>
              <span className="font-extrabold text-amber-400 text-sm">{formatCurrency(weeklyMetrics.remaining)}</span>
            </div>
          </div>

          {/* Progress Bar */}
          <div className="mt-4 pt-2">
            <div className="flex items-center justify-between text-xs mb-1.5 font-bold">
              <span className="text-slate-300">Haftalık Başarım</span>
              <span className="text-brand-400">%{weeklyMetrics.rate}</span>
            </div>
            <div className="w-full h-2.5 bg-slate-950 rounded-full overflow-hidden p-0.5 border border-slate-800">
              <div
                className="h-full rounded-full bg-gradient-to-r from-brand-600 to-brand-400 transition-all duration-500"
                style={{ width: `${Math.min(100, weeklyMetrics.rate)}%` }}
              />
            </div>
          </div>
        </div>

        {/* MONTHLY CARD */}
        <div
          onClick={() => setActiveTab('monthly')}
          className={`p-5 rounded-3xl border transition-all cursor-pointer ${
            activeTab === 'monthly'
              ? 'bg-slate-900 border-emerald-500/70 shadow-xl shadow-emerald-950/40 ring-1 ring-emerald-500/50'
              : 'bg-slate-900/70 border-slate-800/90 hover:border-slate-700'
          }`}
        >
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-purple-400" />
              <h3 className="font-extrabold text-white text-base">BU AY</h3>
            </div>
            <span className="text-xs font-bold text-slate-400 bg-slate-800 px-2.5 py-1 rounded-lg">
              {monthlyMetrics.uniqueCustomersCount} Müşteri
            </span>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400 font-medium">Gereken Target:</span>
              <span className="font-extrabold text-white text-sm">{formatCurrency(monthlyMetrics.required)}</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400 font-medium">Tahsil Edilen:</span>
              <span className="font-extrabold text-emerald-400 text-sm">{formatCurrency(monthlyMetrics.collected)}</span>
            </div>
            <div className="flex items-center justify-between text-xs pt-1 border-t border-slate-800">
              <span className="text-slate-400 font-medium">Kalan Hedef:</span>
              <span className="font-extrabold text-amber-400 text-sm">{formatCurrency(monthlyMetrics.remaining)}</span>
            </div>
          </div>

          {/* Progress Bar */}
          <div className="mt-4 pt-2">
            <div className="flex items-center justify-between text-xs mb-1.5 font-bold">
              <span className="text-slate-300">Aylık Başarım</span>
              <span className="text-purple-400">%{monthlyMetrics.rate}</span>
            </div>
            <div className="w-full h-2.5 bg-slate-950 rounded-full overflow-hidden p-0.5 border border-slate-800">
              <div
                className="h-full rounded-full bg-gradient-to-r from-purple-600 to-purple-400 transition-all duration-500"
                style={{ width: `${Math.min(100, monthlyMetrics.rate)}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* CASH FLOW VS OFFSET BREAKDOWN STRIP */}
      <div className="bg-slate-900 border border-slate-800 p-5 rounded-3xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Receipt className="w-5 h-5 text-emerald-400" />
            <h3 className="font-extrabold text-white text-base">Tahsilat Kanalları & Kasa/Mahsup Ayrımı</h3>
          </div>
          <span className="text-xs text-slate-400">Gerçek para ve borç mahsubu takibi</span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div className="bg-slate-950 p-3.5 rounded-2xl border border-slate-800">
            <span className="text-slate-400 block font-medium">Toplam Tahsilat</span>
            <span className="text-sm sm:text-base font-extrabold text-white block mt-0.5">
              {formatCurrency(paymentMethodTotals.totalCollected)}
            </span>
          </div>

          <div className="bg-slate-950 p-3.5 rounded-2xl border border-emerald-900/50">
            <span className="text-emerald-400 block font-bold">Gerçek Para (Kasa/Banka)</span>
            <span className="text-sm sm:text-base font-extrabold text-emerald-300 block mt-0.5">
              {formatCurrency(paymentMethodTotals.cashInHand)}
            </span>
          </div>

          <div className="bg-slate-950 p-3.5 rounded-2xl border border-purple-900/50">
            <span className="text-purple-400 block font-bold">Tedarikçiye Mahsup</span>
            <span className="text-sm sm:text-base font-extrabold text-purple-300 block mt-0.5">
              {formatCurrency(paymentMethodTotals.offsetTotal)}
            </span>
          </div>

          <div className="bg-slate-950 p-3.5 rounded-2xl border border-slate-800 flex flex-col justify-between">
            <span className="text-slate-400 font-medium block">Nakit / Kart / EFT Split</span>
            <div className="flex items-center gap-2 text-[11px] font-bold text-slate-300 mt-1">
              <span>Nakit: {formatCurrency(paymentMethodTotals.nakit)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* PERFORMANCE CHART COMPONENT */}
      <div className="bg-slate-900 border border-slate-800 p-5 rounded-3xl space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-emerald-400" />
            <h3 className="font-extrabold text-white text-base">
              {currentTabTitle} Tahsilat Performans Grafiği
            </h3>
          </div>
          <div className="flex items-center gap-2 text-xs font-bold">
            <span className="flex items-center gap-1 text-slate-400">
              <span className="w-2.5 h-2.5 rounded-full bg-slate-700 inline-block" /> Gereken
            </span>
            <span className="flex items-center gap-1 text-emerald-400">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" /> Tahsil Edilen
            </span>
          </div>
        </div>

        {/* Visual Bar Comparison */}
        <div className="space-y-3 pt-2">
          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>Gereken Tahsilat Hedefi</span>
              <span className="font-bold text-white">{formatCurrency(currentMetrics.required)}</span>
            </div>
            <div className="w-full h-4 bg-slate-950 rounded-xl overflow-hidden p-0.5 border border-slate-800">
              <div className="h-full rounded-lg bg-slate-700 transition-all duration-500" style={{ width: '100%' }} />
            </div>
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>Gerçekleşen Tahsilat</span>
              <span className="font-extrabold text-emerald-400">{formatCurrency(currentMetrics.collected)}</span>
            </div>
            <div className="w-full h-4 bg-slate-950 rounded-xl overflow-hidden p-0.5 border border-slate-800">
              <div
                className="h-full rounded-lg bg-gradient-to-r from-emerald-600 to-emerald-400 transition-all duration-500"
                style={{
                  width: `${currentMetrics.required > 0 ? Math.min(100, (currentMetrics.collected / currentMetrics.required) * 100) : (currentMetrics.collected > 0 ? 100 : 0)}%`,
                }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* COLLECTION HISTORY SECTION WITH FILTERS */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-xl space-y-4 p-4 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
          <div>
            <h3 className="font-extrabold text-white text-lg">Yapılan Tahsilatlar Geçmişi</h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Tüm tahsilat ve mahsup hareketlerinin WhatsApp iletişim durumları.
            </p>
          </div>

          {/* Search Input */}
          <div className="relative w-full sm:w-72">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Müşteri veya tutar ara..."
              className="w-full bg-slate-950 border border-slate-800 focus:border-emerald-500 rounded-xl pl-9 pr-3 py-2 text-xs text-slate-200 outline-none"
            />
          </div>
        </div>

        {/* Filter Pills */}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {[
            { id: 'ALL', label: 'Tümü' },
            { id: 'WA_SENT', label: '✓ WhatsApp Gönderildi' },
            { id: 'WA_NOT_SENT', label: '⚠️ WhatsApp Gönderilmedi' },
            { id: 'OFFSET', label: 'Tedarikçiye Mahsup' },
            { id: 'NORMAL', label: 'Normal Tahsilat' },
          ].map((f) => (
            <button
              key={f.id}
              onClick={() => setActiveFilter(f.id as FilterType)}
              className={`py-1.5 px-3 rounded-xl font-bold transition-all ${
                activeFilter === f.id
                  ? 'bg-emerald-950 border border-emerald-500 text-emerald-300'
                  : 'bg-slate-950 border border-slate-800 text-slate-400 hover:text-white'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* TABLE / CARDS LIST */}
        {loading ? (
          <div className="p-12 text-center text-slate-400 flex flex-col items-center">
            <Loader2 className="w-8 h-8 animate-spin text-emerald-500 mb-2" />
            <span>Tahsilatlar Yükleniyor...</span>
          </div>
        ) : filteredPayments.length === 0 ? (
          <div className="p-12 text-center text-slate-500 text-xs">
            Filtreye uygun tahsilat kaydı bulunamadı.
          </div>
        ) : (
          <>
            {/* Desktop Table View */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400 font-semibold uppercase tracking-wider text-[11px]">
                    <th className="py-3 px-4">Tarih & Saat</th>
                    <th className="py-3 px-4">Müşteri</th>
                    <th className="py-3 px-4">Tutar</th>
                    <th className="py-3 px-4">Ödeme Yöntemi</th>
                    <th className="py-3 px-4">Müşteri WA</th>
                    <th className="py-3 px-4">Tedarikçi WA</th>
                    <th className="py-3 px-4 text-right">Aksiyonlar</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {filteredPayments.map((p) => {
                    const isCustSent = p.audit_status?.customerSent;
                    const isSupSent = p.audit_status?.supplierSent;

                    return (
                      <tr
                        key={p.id}
                        onClick={() => {
                          setSelectedDetailPayment(p);
                          setIsDetailModalOpen(true);
                        }}
                        className="hover:bg-slate-800/40 transition-colors cursor-pointer"
                      >
                        <td className="py-3.5 px-4 text-slate-300 font-medium">
                          {formatDateTime(p.created_at)}
                        </td>
                        <td className="py-3.5 px-4 font-bold text-white">
                          {p.customer_name}
                        </td>
                        <td className="py-3.5 px-4 font-extrabold text-emerald-400 text-sm">
                          {formatCurrency(p.amount)}
                        </td>
                        <td className="py-3.5 px-4">
                          <span className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border ${
                            p.is_offset
                              ? 'bg-purple-950/80 text-purple-300 border-purple-800'
                              : 'bg-emerald-950/80 text-emerald-300 border-emerald-800'
                          }`}>
                            {p.is_offset ? `Mahsup → ${p.supplier_name || 'Tedarikçi'}` : p.payment_method}
                          </span>
                        </td>

                        {/* Customer WA Status */}
                        <td className="py-3.5 px-4">
                          {isCustSent ? (
                            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-800">
                              <CheckCircle2 className="w-3 h-3" /> Gönderildi
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-400 bg-amber-950/60 px-2 py-0.5 rounded border border-amber-800">
                              <AlertTriangle className="w-3 h-3" /> Gönderilmedi
                            </span>
                          )}
                        </td>

                        {/* Supplier WA Status */}
                        <td className="py-3.5 px-4">
                          {p.is_offset ? (
                            isSupSent ? (
                              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-800">
                                <CheckCircle2 className="w-3 h-3" /> Gönderildi
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-400 bg-amber-950/60 px-2 py-0.5 rounded border border-amber-800">
                                <AlertTriangle className="w-3 h-3" /> Gönderilmedi
                              </span>
                            )
                          ) : (
                            <span className="text-slate-500 text-[11px]">—</span>
                          )}
                        </td>

                        {/* Actions */}
                        <td className="py-3.5 px-4 text-right">
                          <div className="flex items-center justify-end gap-2" onClick={(e) => e.stopPropagation()}>
                            <button
                              onClick={(e) => handleQuickSendCustomerWhatsApp(p, e)}
                              className="py-1 px-2.5 rounded-lg font-bold text-[11px] bg-emerald-600 hover:bg-emerald-500 text-white flex items-center gap-1 transition-all"
                              title="Müşteriye WhatsApp Gönder"
                            >
                              <MessageSquare className="w-3 h-3" />
                              <span>{isCustSent ? 'Tekrar' : 'WA Gönder'}</span>
                            </button>

                            <button
                              onClick={() => {
                                setSelectedDetailPayment(p);
                                setIsDetailModalOpen(true);
                              }}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-white bg-slate-800"
                              title="Detay İncele"
                            >
                              <Eye className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile Card View */}
            <div className="md:hidden space-y-3">
              {filteredPayments.map((p) => {
                const isCustSent = p.audit_status?.customerSent;
                const isSupSent = p.audit_status?.supplierSent;

                return (
                  <div
                    key={p.id}
                    onClick={() => {
                      setSelectedDetailPayment(p);
                      setIsDetailModalOpen(true);
                    }}
                    className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-3 cursor-pointer"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-medium text-slate-400">
                        {formatDateTime(p.created_at)}
                      </span>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                        p.is_offset
                          ? 'bg-purple-950 text-purple-300 border-purple-800'
                          : 'bg-emerald-950 text-emerald-300 border-emerald-800'
                      }`}>
                        {p.is_offset ? `Mahsup → ${p.supplier_name || 'Tedarikçi'}` : p.payment_method}
                      </span>
                    </div>

                    <div className="flex items-center justify-between">
                      <h4 className="font-extrabold text-white text-sm">{p.customer_name}</h4>
                      <span className="font-extrabold text-emerald-400 text-base">{formatCurrency(p.amount)}</span>
                    </div>

                    <div className="flex items-center justify-between text-[11px] pt-1 border-t border-slate-800/60">
                      <div className="flex items-center gap-2">
                        <span className="text-slate-400 font-medium">Müşteri WA:</span>
                        {isCustSent ? (
                          <span className="text-emerald-400 font-bold">✓ Gönderildi</span>
                        ) : (
                          <span className="text-amber-400 font-bold">⚠ Gönderilmedi</span>
                        )}
                      </div>

                      <button
                        onClick={(e) => handleQuickSendCustomerWhatsApp(p, e)}
                        className="py-1 px-3 rounded-lg font-bold text-xs bg-emerald-600 text-white flex items-center gap-1"
                      >
                        <MessageSquare className="w-3 h-3" />
                        <span>WA Gönder</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* DETAIL MODAL */}
      <PaymentDetailModal
        isOpen={isDetailModalOpen}
        onClose={() => setIsDetailModalOpen(false)}
        payment={selectedDetailPayment}
        onRefresh={fetchCollectionsCenterData}
      />

      {/* EXPECTED CUSTOMERS MODAL */}
      <ExpectedCollectionModal
        isOpen={expectedModalData.isOpen}
        onClose={() => setExpectedModalData((prev) => ({ ...prev, isOpen: false }))}
        title={expectedModalData.title}
        items={expectedModalData.items}
        onSelectCustomerPayment={(customerId) => openPaymentModal(customerId)}
      />
    </div>
  );
};
