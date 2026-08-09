import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate, useOutletContext } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { formatCurrency, formatDate, formatDateTime } from '@/utils/formatters';
import { Customer, CustomerLedger } from '@/types/database.types';
import { LayoutContextType } from '@/components/layout/Layout';
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
  const { openPaymentModal, openNewSaleModal, openCustomerStatementModal } = useOutletContext<LayoutContextType>();

  const [loading, setLoading] = useState(true);
  const [customer, setCustomer] = useState<Customer | null>(null);

  // Metrics
  const [totalPurchases, setTotalPurchases] = useState(0);
  const [totalPayments, setTotalPayments] = useState(0);
  const [currentDebt, setCurrentDebt] = useState(0);
  const [overdueDebt, setOverdueDebt] = useState(0);
  const [dueThisWeek, setDueThisWeek] = useState(0);
  const [lastPurchaseDate, setLastPurchaseDate] = useState<string | null>(null);
  const [lastPaymentDate, setLastPaymentDate] = useState<string | null>(null);

  // Lists
  const [purchasedProducts, setPurchasedProducts] = useState<PurchaseHistoryItem[]>([]);
  const [ledgerEntries, setLedgerEntries] = useState<CustomerLedger[]>([]);

  const fetchCustomerDetails = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      // 1. Customer record
      const { data: cData } = await supabase.from('customers').select('*').eq('id', id).single();
      setCustomer(cData as Customer);

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
      const latestBal = Number(lData?.[0]?.balance || 0);
      setCurrentDebt(latestBal);

      // Sum of debit vs credit
      const totPurchases = lData?.reduce((acc, curr) => acc + Number(curr.debit || 0), 0) || 0;
      const totPay = lData?.reduce((acc, curr) => acc + Number(curr.credit || 0), 0) || 0;
      setTotalPurchases(totPurchases);
      setTotalPayments(totPay);

      // 3. Payment Schedules (Overdue & Due this week)
      const { data: sData } = await supabase
        .from('payment_schedules')
        .select('remaining_amount, due_date, status')
        .eq('customer_id', id)
        .in('status', ['pending', 'partially_paid', 'overdue'])
        .is('deleted_at', null);

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

      // 4. Last Purchase Date & Sales History items
      const { data: salesData } = await supabase
        .from('sales')
        .select('id, sale_number, created_at')
        .eq('customer_id', id)
        .is('deleted_at', null)
        .order('created_at', { ascending: false });

      if (salesData && salesData.length > 0) {
        setLastPurchaseDate(salesData[0].created_at);

        const saleIds = salesData.map((s) => s.id);
        const { data: itemsData } = await supabase
          .from('sale_items')
          .select('sale_id, product_name, quantity, unit, total_amount, created_at')
          .in('sale_id', saleIds)
          .is('deleted_at', null)
          .order('created_at', { ascending: false });

        const saleNumMap = new Map(salesData.map((s) => [s.id, s.sale_number]));

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
  }, [fetchCustomerDetails]);

  if (loading || !customer) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-slate-400">
        <Loader2 className="w-8 h-8 animate-spin text-purple-500 mb-2" />
        <span>Müşteri Detayları Yükleniyor...</span>
      </div>
    );
  }

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
    </div>
  );
};
