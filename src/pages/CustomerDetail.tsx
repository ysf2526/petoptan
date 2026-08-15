import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useParams, useNavigate, useOutletContext } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/context/ToastContext';
import { formatCurrency, formatDate, formatDateTime } from '@/utils/formatters';
import { Customer, CustomerLedger, Sale, PaymentSchedule, PreOrder, PRE_ORDER_STATUS_MAP } from '@/types/database.types';
import { preOrderService } from '@/services/preOrderService';
import { LayoutContextType } from '@/components/layout/Layout';
import { calculateNetCustomerDebt } from '@/services/consolidatedPaymentPlanService';
import { calculateCustomerPaymentDelay } from '@/services/customerOverdueService';
import {
  Users,
  ArrowLeft,
  Receipt,
  ShoppingCart,
  Phone,
  Mail,
  MapPin,
  Calendar,
  Loader2,
  BookOpen,
  DollarSign,
  Send,
  AlertTriangle,
  Clock,
  Target,
  CheckCircle2,
  Save,
  ClipboardList,
} from 'lucide-react';

interface PurchaseHistoryItem {
  sale_id: string;
  sale_number: string;
  date: string;
  product_name: string;
  quantity: number;
  unit: string;
  total_amount: number;
}

export const CustomerDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { showSuccess, showError } = useToast();
  const { openPaymentModal, openNewSaleModal, openCustomerStatementModal } = useOutletContext<LayoutContextType>();

  const [loading, setLoading] = useState(true);
  const [savingTarget, setSavingTarget] = useState(false);
  const [customer, setCustomer] = useState<Customer | null>(null);

  // Metrics
  const [totalPurchases, setTotalPurchases] = useState(0);
  const [totalPayments, setTotalPayments] = useState(0);
  const [currentDebt, setCurrentDebt] = useState(0);
  const [overdueDebt, setOverdueDebt] = useState(0);
  const [dueThisWeek, setDueThisWeek] = useState(0);
  const [lastPurchaseDate, setLastPurchaseDate] = useState<string | null>(null);
  const [lastPaymentDate, setLastPaymentDate] = useState<string | null>(null);
  const [weeklyTargetInput, setWeeklyTargetInput] = useState<number>(0);

  // Lists
  const [purchasedProducts, setPurchasedProducts] = useState<PurchaseHistoryItem[]>([]);
  const [ledgerEntries, setLedgerEntries] = useState<CustomerLedger[]>([]);
  const [salesList, setSalesList] = useState<Sale[]>([]);
  const [paymentSchedules, setPaymentSchedules] = useState<PaymentSchedule[]>([]);
  const [customerPreOrders, setCustomerPreOrders] = useState<PreOrder[]>([]);

  const fetchCustomerDetails = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      // Fetch Customer Pre-Orders
      preOrderService.getPreOrders('ALL').then((allPOs) => {
        const custPOs = allPOs.filter((po) => po.customer_id === id);
        setCustomerPreOrders(custPOs);
      }).catch(err => console.error(err));
      // 1. Customer record
      const { data: cData } = await supabase.from('customers').select('*').eq('id', id).single();
      const cust = cData as Customer;
      setCustomer(cust);
      setWeeklyTargetInput(Number(cust?.weekly_payment_target || 0));

      const todayStr = new Date().toISOString().split('T')[0];
      const nextWeekDate = new Date();
      nextWeekDate.setDate(nextWeekDate.getDate() + 7);
      const nextWeekStr = nextWeekDate.toISOString().split('T')[0];

      // 2. Ledger Entries & Current Debt
      const { data: lData } = await supabase
        .from('customer_ledger')
        .select('*')
        .eq('customer_id', id)
        .is('deleted_at', null)
        .order('created_at', { ascending: false });

      setLedgerEntries(lData || []);

      // Sum of actual sales purchases (BORÇ) vs real cash payments (ÖDEME)
      const totPurchases = lData?.filter((curr) => curr.movement_type === 'BORÇ').reduce((acc, curr) => acc + Number(curr.debit || 0), 0) || 0;
      const totPay = lData?.filter((curr) => curr.movement_type === 'ÖDEME').reduce((acc, curr) => acc + Number(curr.credit || 0), 0) || 0;
      setTotalPurchases(totPurchases);
      setTotalPayments(totPay);

      // 3. Payment Schedules
      const { data: sData } = await supabase
        .from('payment_schedules')
        .select('*')
        .eq('customer_id', id)
        .is('deleted_at', null)
        .order('due_date', { ascending: true });

      setPaymentSchedules((sData as PaymentSchedule[]) || []);

      let ovD = 0;
      let dueW = 0;
      sData?.forEach((s) => {
        const rem = Number(s.remaining_amount || 0);
        if (s.due_date < todayStr || s.status === 'overdue') {
          ovD += rem;
        } else if (s.due_date >= todayStr && s.due_date <= nextWeekStr) {
          dueW += rem;
        }
      });
      setOverdueDebt(ovD);
      setDueThisWeek(dueW);

      // 4. Sales History items & Total Sales
      const { data: salesData } = await supabase
        .from('sales')
        .select('*')
        .eq('customer_id', id)
        .is('deleted_at', null)
        .order('created_at', { ascending: false });

      const salesArr = (salesData as Sale[]) || [];
      setSalesList(salesArr);

      const totPurchasesFromSales = salesArr
        .filter((s) => s.status !== 'cancelled')
        .reduce((acc, s) => acc + Number(s.total_amount || 0), 0);

      setTotalPurchases(totPurchasesFromSales > 0 ? totPurchasesFromSales : totPurchases);

      // Fail-safe Current Debt Calculation using single source of truth helper
      const { netTotalDebt: finalDebt } = calculateNetCustomerDebt({
        ledgerEntries: lData,
        salesList: salesArr,
      });
      setCurrentDebt(finalDebt);

      if (salesArr.length > 0) {
        setLastPurchaseDate(salesArr[0].created_at);

        const saleIds = salesArr.map((s) => s.id);
        const { data: itemsData } = await supabase
          .from('sale_items')
          .select('sale_id, product_name, quantity, unit, total_amount, created_at')
          .in('sale_id', saleIds)
          .is('deleted_at', null)
          .order('created_at', { ascending: false });

        const saleNumMap = new Map(salesArr.map((s) => [s.id, s.sale_number]));

        const history: PurchaseHistoryItem[] = (itemsData || []).map((it) => ({
          sale_id: it.sale_id,
          sale_number: saleNumMap.get(it.sale_id) || '',
          date: it.created_at,
          product_name: it.product_name,
          quantity: Number(it.quantity || 0),
          unit: it.unit,
          total_amount: Number(it.total_amount || 0),
        }));
        setPurchasedProducts(history);
      } else {
        setLastPurchaseDate(null);
        setPurchasedProducts([]);
      }

      // 5. Last Payment Date
      const { data: payData } = await supabase
        .from('payments')
        .select('payment_date')
        .eq('customer_id', id)
        .is('deleted_at', null)
        .order('payment_date', { ascending: false })
        .limit(1);

      setLastPaymentDate(payData?.[0]?.payment_date || null);
    } catch (err) {
      console.error('Müşteri detay hatası:', err);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchCustomerDetails();

    const handleRefresh = () => fetchCustomerDetails();
    window.addEventListener('refresh-data', handleRefresh);
    return () => window.removeEventListener('refresh-data', handleRefresh);
  }, [fetchCustomerDetails]);

  const handleSaveWeeklyTarget = async () => {
    if (!id) return;
    setSavingTarget(true);
    try {
      const { error } = await supabase.rpc('update_customer_weekly_target', {
        p_customer_id: id,
        p_weekly_target: Math.max(0, weeklyTargetInput),
      });

      if (error) {
        showError(error.message);
      } else {
        showSuccess(`Haftalık ödeme hedefi (${formatCurrency(weeklyTargetInput)}) güncellendi.`);
        if (customer) {
          setCustomer({ ...customer, weekly_payment_target: weeklyTargetInput });
        }
      }
    } catch (err: any) {
      showError(err.message || 'Hedef güncellenemedi.');
    } finally {
      setSavingTarget(false);
    }
  };

  if (loading || !customer) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-slate-400">
        <Loader2 className="w-8 h-8 animate-spin text-purple-500 mb-2" />
        <span>Müşteri Detayları Yükleniyor...</span>
      </div>
    );
  }

  const activeSalesCount = salesList.filter((s) => s.status !== 'cancelled').length;

  return (
    <div className="space-y-6 pb-8">
      {/* Top Navigation & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900 border border-slate-800 p-4 sm:p-6 rounded-2xl">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/customers')}
            className="p-2 text-slate-400 hover:text-white rounded-xl bg-slate-800 border border-slate-700"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h2 className="text-xl font-bold text-white tracking-tight">{customer.business_name}</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Yetkili: {customer.contact_name || 'Belirtilmedi'} • Vade: {customer.payment_term_days || 30} Gün
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => openCustomerStatementModal(customer.id)}
            className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-4 py-2 rounded-xl text-xs sm:text-sm flex items-center gap-1.5 shadow-lg shadow-emerald-600/20 transition-all active:scale-95"
          >
            <Send className="w-4 h-4" />
            <span>CARİ ÖZETİ WHATSAPP'TAN GÖNDER</span>
          </button>

          <button
            onClick={() => openPaymentModal(customer.id)}
            className="bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-bold px-4 py-2 rounded-xl text-xs sm:text-sm flex items-center gap-1.5 transition-all"
          >
            <Receipt className="w-4 h-4 text-emerald-400" />
            <span>Tahsilat Gir</span>
          </button>

          <button
            onClick={openNewSaleModal}
            className="bg-brand-600 hover:bg-brand-500 text-white font-bold px-4 py-2 rounded-xl text-xs sm:text-sm flex items-center gap-1.5 shadow-lg shadow-brand-600/20"
          >
            <ShoppingCart className="w-4 h-4" />
            <span>Satış Yap</span>
          </button>
        </div>
      </div>

      {/* METRICS STRIP */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl">
          <span className="text-xs text-slate-400 font-medium block">Güncel Borç Bakiyesi</span>
          <span className={`text-xl font-extrabold block mt-1 ${currentDebt > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
            {formatCurrency(currentDebt)}
          </span>
          <span className="text-[11px] text-slate-500 block mt-0.5">Toplam Net Borç</span>
        </div>

        <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl">
          <span className="text-xs text-slate-400 font-medium block">Geciken Borç</span>
          <span className={`text-xl font-bold block mt-1 ${overdueDebt > 0 ? 'text-rose-400' : 'text-slate-300'}`}>
            {formatCurrency(overdueDebt)}
          </span>
          <span className="text-[11px] text-slate-500 block mt-0.5">Vadesi Geçmiş Alacak</span>
        </div>

        <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl">
          <span className="text-xs text-slate-400 font-medium block">Bu Hafta Ödenecek</span>
          <span className="text-xl font-bold text-brand-400 block mt-1">{formatCurrency(dueThisWeek)}</span>
          <span className="text-[11px] text-slate-500 block mt-0.5">Gelecek 7 Günlük Vade</span>
        </div>

        <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl">
          <span className="text-xs text-slate-400 font-medium block">Toplam Alış / Ödeme</span>
          <div className="text-xs font-bold text-slate-200 mt-1 space-y-0.5">
            <div>Alış: <span className="text-white">{formatCurrency(totalPurchases)}</span></div>
            <div>Tahsilat: <span className="text-emerald-400">{formatCurrency(totalPayments)}</span></div>
          </div>
        </div>
      </div>

      {/* 🔴 7 GÜNLÜK ÖDEME GECİKMESİ VE CARİ HESAP ÖZETİ SECTION */}
      {(() => {
        const delayRes = calculateCustomerPaymentDelay(customer, currentDebt, (ledgerEntries as any) || [], salesList || []);
        return (
          <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl space-y-4 shadow-xl">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-4">
              <div className="flex items-center gap-3">
                <div
                  className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                    delayRes.status === 'critical_14_days'
                      ? 'bg-rose-950 text-rose-400 border border-rose-800'
                      : delayRes.status === 'warning_7_days'
                      ? 'bg-amber-950 text-amber-400 border border-amber-800'
                      : 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                  }`}
                >
                  <Clock className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
                    <span>GÜNCEL CARİ HESAP VE GECİKME TAKİBİ</span>
                    {delayRes.badgeLabel && (
                      <span
                        className={`text-xs font-extrabold px-2.5 py-0.5 rounded-full ${
                          delayRes.status === 'critical_14_days'
                            ? 'bg-rose-950 text-rose-300 border border-rose-800'
                            : 'bg-amber-950 text-amber-300 border border-amber-800'
                        }`}
                      >
                        {delayRes.badgeLabel}
                      </span>
                    )}
                  </h3>
                  <p className="text-xs text-slate-400">
                    Sistem 7 gün boyunca ödeme yapmayan borçlu müşterileri otomatik olarak uyarır.
                  </p>
                </div>
              </div>
            </div>

            {/* Delay Warning Banner */}
            {delayRes.warningMessage && (
              <div
                className={`p-4 rounded-xl border text-xs flex items-start gap-3 ${
                  delayRes.status === 'critical_14_days'
                    ? 'bg-rose-950/60 border-rose-800 text-rose-200'
                    : 'bg-amber-950/60 border-amber-800 text-amber-200'
                }`}
              >
                <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5 animate-bounce" />
                <div>
                  <span className="font-extrabold text-sm block">{delayRes.warningMessage}</span>
                  <p className="mt-1 leading-relaxed text-[11px] opacity-90">
                    Bu müşterinin son ödeme/teslimat tarihinden beri {delayRes.daysSinceLastPayment} gündür tahsilat yapılmamıştır. Müşteriden ödeme alınması gerekmektedir.
                  </p>
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-950 p-4 rounded-xl border border-slate-800 text-xs">
              <div>
                <span className="text-slate-500 block">Güncel Cari Borç</span>
                <span className="text-base font-black text-amber-400 block mt-0.5">{formatCurrency(currentDebt)}</span>
              </div>
              <div>
                <span className="text-slate-500 block">Son Ödeme Tarihi</span>
                <span className="text-base font-bold text-white block mt-0.5">
                  {lastPaymentDate ? formatDate(lastPaymentDate) : 'Henüz Ödeme Yok'}
                </span>
              </div>
              <div>
                <span className="text-slate-500 block">Ödeme Yapılmayan Süre</span>
                <span className="text-base font-bold text-brand-400 block mt-0.5">
                  {currentDebt > 0 ? `${delayRes.daysSinceLastPayment} Gün` : 'Borç 0 TL'}
                </span>
              </div>
              <div>
                <span className="text-slate-500 block">Son Satış Tarihi</span>
                <span className="text-base font-bold text-slate-300 block mt-0.5">
                  {lastPurchaseDate ? formatDate(lastPurchaseDate) : 'Henüz Satış Yok'}
                </span>
              </div>
            </div>
          </div>
        );
      })()}

      {/* CUSTOMER CONTACT & DATES CARD */}
      <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
        <div className="space-y-1.5">
          <span className="text-slate-400 font-semibold uppercase block">İletişim Bilgileri</span>
          <div className="flex items-center gap-2 text-slate-200">
            <Phone className="w-3.5 h-3.5 text-slate-500" />
            <span>{customer.phone || 'Telefon Yok'}</span>
          </div>
          <div className="flex items-center gap-2 text-slate-200">
            <Mail className="w-3.5 h-3.5 text-slate-500" />
            <span>{customer.email || 'E-posta Yok'}</span>
          </div>
          <div className="flex items-center gap-2 text-slate-200">
            <MapPin className="w-3.5 h-3.5 text-slate-500 shrink-0" />
            <span>{customer.address || 'Adres Girilmedi'}</span>
          </div>
        </div>

        <div className="space-y-1.5">
          <span className="text-slate-400 font-semibold uppercase block">Vergi Bilgileri</span>
          <div className="text-slate-300">Vergi No: <span className="font-mono font-bold text-white">{customer.tax_number || '-'}</span></div>
          <div className="text-slate-300">Vergi Dairesi: <span className="font-bold text-white">{customer.tax_office || '-'}</span></div>
        </div>

        <div className="space-y-1.5">
          <span className="text-slate-400 font-semibold uppercase block">Son Hareket Tarihleri</span>
          <div className="text-slate-300">Son Alış Tarihi: <span className="font-bold text-white">{formatDate(lastPurchaseDate)}</span></div>
          <div className="text-slate-300">Son Tahsilat Tarihi: <span className="font-bold text-emerald-400">{formatDate(lastPaymentDate)}</span></div>
        </div>
      </div>

      {/* TWO TABS / SECTIONS: PURCHASED PRODUCTS HISTORY & LEDGER TIMELINE */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Purchased Products History */}
        <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl shadow-lg flex flex-col">
          <h3 className="text-sm font-bold text-white uppercase tracking-wider mb-3">
            Müşterinin Aldığı Ürünler Geçmişi
          </h3>
          <div className="border border-slate-800 rounded-xl overflow-hidden bg-slate-950 flex-1">
            {purchasedProducts.length === 0 ? (
              <p className="p-8 text-center text-xs text-slate-500">Henüz ürün alım kaydı yok.</p>
            ) : (
              <div className="overflow-x-auto max-h-96 custom-scrollbar">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-900 text-slate-400 uppercase font-semibold border-b border-slate-800 sticky top-0">
                    <tr>
                      <th className="p-3">Tarih</th>
                      <th className="p-3">Ürün Adı</th>
                      <th className="p-3 text-center">Adet</th>
                      <th className="p-3 text-right">Tutar</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800 text-slate-200">
                    {purchasedProducts.map((item, idx) => (
                      <tr key={idx} className="hover:bg-slate-900/60">
                        <td className="p-3 text-slate-400 font-mono">{formatDate(item.date)}</td>
                        <td className="p-3 font-semibold text-slate-100">{item.product_name}</td>
                        <td className="p-3 text-center font-bold">{item.quantity} {item.unit}</td>
                        <td className="p-3 text-right font-extrabold text-white">{formatCurrency(item.total_amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Customer Ledger History Timeline */}
        <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl shadow-lg flex flex-col">
          <h3 className="text-sm font-bold text-white uppercase tracking-wider mb-3">
            Cari Hesap Ekstresi (Borç / Ödeme Timeline)
          </h3>
          <div className="border border-slate-800 rounded-xl overflow-hidden bg-slate-950 flex-1">
            {ledgerEntries.length === 0 ? (
              <p className="p-8 text-center text-xs text-slate-500">Cari hareket bulunmuyor.</p>
            ) : (
              <div className="overflow-x-auto max-h-96 custom-scrollbar">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-900 text-slate-400 uppercase font-semibold border-b border-slate-800 sticky top-0">
                    <tr>
                      <th className="p-3">Tarih</th>
                      <th className="p-3">İşlem Tipi</th>
                      <th className="p-3">Açıklama</th>
                      <th className="p-3 text-right">Borç (+)</th>
                      <th className="p-3 text-right">Ödeme (-)</th>
                      <th className="p-3 text-right">Bakiye</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800 text-slate-200">
                    {ledgerEntries.map((l) => (
                      <tr key={l.id} className="hover:bg-slate-900/60">
                        <td className="p-3 text-slate-400 font-mono">{formatDate(l.created_at)}</td>
                        <td className="p-3 font-bold">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-extrabold ${
                              l.movement_type === 'BORÇ'
                                ? 'bg-amber-950 text-amber-300 border border-amber-800/40'
                                : l.description.includes('Mahsup')
                                ? 'bg-purple-950 text-purple-300 border border-purple-800/40'
                                : 'bg-emerald-950 text-emerald-300 border border-emerald-800/40'
                            }`}
                          >
                            {l.description.includes('Mahsup') ? 'MAHSUP' : l.movement_type}
                          </span>
                        </td>
                        <td className="p-3 text-slate-300">{l.description}</td>
                        <td className="p-3 text-right font-bold text-amber-400">
                          {l.debit > 0 ? formatCurrency(l.debit) : '-'}
                        </td>
                        <td className="p-3 text-right font-bold text-emerald-400">
                          {l.credit > 0 ? formatCurrency(l.credit) : '-'}
                        </td>
                        <td className="p-3 text-right font-extrabold text-white">
                          {formatCurrency(l.balance)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* CUSTOMER PRE-ORDERS SECTION */}

      <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl shadow-lg space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ClipboardList className="w-5 h-5 text-amber-400" />
            <h3 className="text-sm font-bold text-white uppercase tracking-wider">
              Müşterinin Ön Siparişleri ({customerPreOrders.length})
            </h3>
          </div>
          <button
            onClick={() => navigate('/pre-orders')}
            className="text-xs text-brand-400 hover:underline font-semibold"
          >
            Tüm Ön Siparişlere Git →
          </button>
        </div>

        <div className="border border-slate-800 rounded-xl overflow-hidden bg-slate-950">
          {customerPreOrders.length === 0 ? (
            <p className="p-8 text-center text-xs text-slate-500">
              Bu müşteriye ait aktif veya geçmiş ön sipariş kaydı bulunmuyor.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-900 text-slate-400 uppercase font-semibold border-b border-slate-800">
                  <tr>
                    <th className="p-3">Sipariş No</th>
                    <th className="p-3">Tarih</th>
                    <th className="p-3">Ürünler</th>
                    <th className="p-3 text-center">Durum</th>
                    <th className="p-3 text-right">Tahmini Tutar</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800 text-slate-200">
                  {customerPreOrders.map((po) => {
                    const cfg = PRE_ORDER_STATUS_MAP[po.status] || { label: po.status, badgeBg: 'bg-slate-800', badgeText: 'text-slate-300' };
                    const itemNames = (po.pre_order_items || []).map(i => `${i.product_name} (${i.demanded_quantity} ${i.unit})`).join(', ');
                    return (
                      <tr key={po.id} className="hover:bg-slate-900/60 cursor-pointer" onClick={() => navigate('/pre-orders')}>
                        <td className="p-3 font-bold text-white">{po.order_number}</td>
                        <td className="p-3 text-slate-400">{formatDate(po.created_at)}</td>
                        <td className="p-3 text-slate-300 truncate max-w-xs">{itemNames}</td>
                        <td className="p-3 text-center">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${cfg.badgeBg} ${cfg.badgeText}`}>
                            {cfg.label}
                          </span>
                        </td>
                        <td className="p-3 text-right font-bold text-amber-300">
                          {po.estimated_total > 0 ? formatCurrency(po.estimated_total) : '-'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

