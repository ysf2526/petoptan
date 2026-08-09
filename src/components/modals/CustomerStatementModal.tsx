import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/context/ToastContext';
import { formatCurrency, formatDateTime, formatDate } from '@/utils/formatters';
import { Customer, CustomerLedger, PaymentSchedule, Sale } from '@/types/database.types';
import {
  normalizeTurkishPhone,
  buildCustomerStatementMessage,
  openWhatsAppWeb,
  logWhatsAppShareAttempt,
} from '@/services/whatsappService';
import { shareOrDownloadWhatsAppDocument } from '@/utils/pdfGenerator';
import { X, Printer, Send, Users, Loader2, FileText, Calendar, DollarSign } from 'lucide-react';

interface CustomerStatementModalProps {
  isOpen: boolean;
  onClose: () => void;
  customerId: string | null;
}

export const CustomerStatementModal: React.FC<CustomerStatementModalProps> = ({
  isOpen,
  onClose,
  customerId,
}) => {
  const { showError, showSuccess } = useToast();

  const [loading, setLoading] = useState(false);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [currentDebt, setCurrentDebt] = useState<number>(0);
  const [dueThisWeek, setDueThisWeek] = useState<number>(0);
  const [overdueDebt, setOverdueDebt] = useState<number>(0);
  const [upcomingSchedules, setUpcomingSchedules] = useState<PaymentSchedule[]>([]);
  const [lastSale, setLastSale] = useState<Sale | null>(null);

  useEffect(() => {
    if (isOpen && customerId) {
      const loadCustomerData = async () => {
        setLoading(true);
        try {
          const now = new Date();
          const todayStr = now.toISOString().split('T')[0];
          const nextWeekDate = new Date();
          nextWeekDate.setDate(now.getDate() + 7);
          const nextWeekStr = nextWeekDate.toISOString().split('T')[0];

          // 1. Fetch customer
          const { data: cData, error: cErr } = await supabase
            .from('customers')
            .select('*')
            .eq('id', customerId)
            .single();

          if (cErr) throw cErr;
          setCustomer(cData as Customer);

          // 2. Customer Ledger Balance
          const { data: lData } = await supabase
            .from('customer_ledger')
            .select('balance')
            .eq('customer_id', customerId)
            .is('deleted_at', null)
            .order('created_at', { ascending: false })
            .limit(1);

          const bal = lData?.[0]?.balance ? Number(lData[0].balance) : 0;
          setCurrentDebt(bal);

          // 3. Payment Schedules
          const { data: schData } = await supabase
            .from('payment_schedules')
            .select('*')
            .eq('customer_id', customerId)
            .in('status', ['pending', 'partially_paid', 'overdue'])
            .is('deleted_at', null)
            .order('due_date', { ascending: true });

          let dueW = 0;
          let overD = 0;
          const upList: PaymentSchedule[] = [];

          schData?.forEach((s) => {
            const rem = Number(s.remaining_amount || 0);
            if (s.due_date < todayStr || s.status === 'overdue') {
              overD += rem;
            } else if (s.due_date >= todayStr && s.due_date <= nextWeekStr) {
              dueW += rem;
            }
            upList.push(s as PaymentSchedule);
          });

          setDueThisWeek(dueW);
          setOverdueDebt(overD);
          setUpcomingSchedules(upList);

          // 4. Last Sale
          const { data: sData } = await supabase
            .from('sales')
            .select('*')
            .eq('customer_id', customerId)
            .is('deleted_at', null)
            .order('created_at', { ascending: false })
            .limit(1);

          setLastSale(sData?.[0] ? (sData[0] as Sale) : null);
        } catch (err: any) {
          console.error(err);
          showError(err.message || 'Müşteri bilgileri yüklenemedi.');
        } finally {
          setLoading(false);
        }
      };
      loadCustomerData();
    }
  }, [isOpen, customerId, showError]);

  if (!isOpen || !customerId) return null;

  const handleWhatsAppSend = async () => {
    if (!customer) return;

    const norm = normalizeTurkishPhone(customer.phone);
    if (!norm.isValid) {
      showError('Müşterinin geçerli bir telefon numarası bulunmuyor.');
      return;
    }

    try {
      const messageText = buildCustomerStatementMessage(
        customer.business_name,
        currentDebt,
        dueThisWeek,
        overdueDebt,
        upcomingSchedules,
        lastSale?.created_at,
        lastSale?.total_amount
      );

      await logWhatsAppShareAttempt('customers', customer.id, norm.normalized, {
        customer_name: customer.business_name,
        type: 'customer_statement',
      });

      const docElement = document.getElementById('printable-customer-statement');
      const filename = `Cari_Ozet_${customer.business_name.replace(/\s+/g, '_')}.html`;

      const { method } = await shareOrDownloadWhatsAppDocument(
        docElement,
        norm.normalized,
        messageText,
        filename
      );

      if (method === 'whatsapp_web_download') {
        showSuccess('Cari hesap belgesi indirildi! WhatsApp sohbetine ek olarak ekleyebilirsiniz.');
      } else {
        showSuccess('WhatsApp paylaşımı başlatıldı.');
      }
    } catch (err: any) {
      showError(err.message || 'WhatsApp açılırken bir hata oluştu.');
    }
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
      <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-md" onClick={onClose} />

      <div className="relative bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-3xl shadow-2xl z-10 overflow-hidden flex flex-col my-auto max-h-[95vh]">
        {/* Header Control Bar */}
        <div className="p-4 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3 bg-slate-900 print:hidden">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-purple-600/20 border border-purple-500/30 flex items-center justify-center text-purple-400">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-bold text-white">
                Müşteri Cari ve Ödeme Planı Bilgilendirme
              </h2>
              <p className="text-xs text-slate-400">{customer?.business_name}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs flex items-center gap-2 border border-slate-700 transition-all"
            >
              <Printer className="w-4 h-4 text-brand-400" />
              <span>Yazdır / PDF Al</span>
            </button>

            <button
              onClick={handleWhatsAppSend}
              className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-2 shadow-lg shadow-emerald-600/20 transition-all active:scale-95"
            >
              <Send className="w-4 h-4" />
              <span>WhatsApp'tan Gönder</span>
            </button>

            <button onClick={onClose} className="p-2 text-slate-400 hover:text-white rounded-xl bg-slate-800">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Printable Area */}
        <div className="p-4 sm:p-8 overflow-y-auto custom-scrollbar bg-slate-950 text-slate-100 flex-1">
          {loading || !customer ? (
            <div className="p-12 text-center text-slate-400 flex flex-col items-center">
              <Loader2 className="w-8 h-8 animate-spin text-purple-500 mb-2" />
              <span>Müşteri Ekstresi Hazırlanıyor...</span>
            </div>
          ) : (
            <div id="printable-customer-statement" className="bg-slate-900 border border-slate-800 p-6 sm:p-10 rounded-2xl max-w-2xl mx-auto space-y-6 text-xs shadow-2xl print:bg-white print:text-black print:p-0 print:border-none print:shadow-none">
              {/* Disclaimer */}
              <div className="bg-amber-950/60 border border-amber-800/50 p-3 rounded-xl text-center text-amber-300 font-semibold print:bg-amber-100 print:text-amber-900 print:border-amber-400">
                ⚠️ BU BELGE RESMİ FATURA / E-ARŞİV FATURA YERİNE GEÇMEZ. CARİ HESAP BİLGİLENDİRME AMACIYLA HAZIRLANMIŞTIR.
              </div>

              {/* Title & Customer */}
              <div className="flex items-start justify-between border-b border-slate-800 pb-4 print:border-gray-300">
                <div>
                  <h1 className="text-lg font-black text-white uppercase print:text-black">PETSHOP TOPTAN İŞLETME SİSTEMİ</h1>
                  <h2 className="text-brand-400 font-extrabold text-xs uppercase mt-0.5 print:text-blue-900">
                    MÜŞTERİ CARİ HESAP VE ÖDEME TAKVİMİ ÖZETİ
                  </h2>
                </div>
                <div className="text-right text-[11px] text-slate-400 print:text-gray-600">
                  Rapor Tarihi: <span className="font-bold text-white print:text-black">{formatDate(new Date().toISOString())}</span>
                </div>
              </div>

              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 print:bg-gray-50 print:border-gray-300">
                <span className="text-slate-400 uppercase font-semibold text-[10px] block print:text-gray-600">MÜŞTERİ / FİRMA</span>
                <div className="text-base font-extrabold text-white mt-0.5 print:text-black">{customer.business_name}</div>
                {customer.contact_name && <div className="text-slate-300 print:text-gray-700">Yetkili: {customer.contact_name}</div>}
                {customer.phone && <div className="text-slate-400 print:text-gray-600 font-mono">Telefon: {customer.phone}</div>}
              </div>

              {/* Debt Cards Grid */}
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 text-center print:bg-gray-50 print:border-gray-300">
                  <span className="text-slate-400 text-[10px] uppercase font-medium block print:text-gray-600">GÜNCEL TOPLAM BORÇ</span>
                  <span className={`text-base font-black block mt-1 ${currentDebt > 0 ? 'text-amber-400 print:text-amber-800' : 'text-emerald-400 print:text-emerald-800'}`}>
                    {formatCurrency(currentDebt)}
                  </span>
                </div>

                <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 text-center print:bg-gray-50 print:border-gray-300">
                  <span className="text-slate-400 text-[10px] uppercase font-medium block print:text-gray-600">BU HAFTA ÖDENECEK</span>
                  <span className="text-base font-black text-brand-400 block mt-1 print:text-blue-800">
                    {formatCurrency(dueThisWeek)}
                  </span>
                </div>

                <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 text-center print:bg-gray-50 print:border-gray-300">
                  <span className="text-slate-400 text-[10px] uppercase font-medium block print:text-gray-600">GECİKEN BORÇ</span>
                  <span className={`text-base font-black block mt-1 ${overdueDebt > 0 ? 'text-rose-400 print:text-rose-800' : 'text-slate-300 print:text-gray-700'}`}>
                    {formatCurrency(overdueDebt)}
                  </span>
                </div>
              </div>

              {/* Upcoming Schedules Table */}
              <div>
                <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-2 print:text-black">YAKLAŞAN VADELER & ÖDEME TAKVİMİ</h3>
                {upcomingSchedules.length === 0 ? (
                  <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl text-slate-400 italic text-center print:bg-gray-50 print:border-gray-300">
                    Ödeme bekleyen aktif taksit bulunmamaktadır.
                  </div>
                ) : (
                  <div className="border border-slate-800 rounded-xl overflow-hidden bg-slate-950 print:border-gray-300 print:bg-white">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-900 text-slate-400 uppercase border-b border-slate-800 font-semibold print:bg-gray-100 print:text-black">
                        <tr>
                          <th className="p-3">Vade Tarihi</th>
                          <th className="p-3 text-right">Tutar</th>
                          <th className="p-3 text-right">Kalan Tutar</th>
                          <th className="p-3 text-center">Durum</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/80 text-slate-200 print:divide-gray-200 print:text-black">
                        {upcomingSchedules.slice(0, 6).map((s) => (
                          <tr key={s.id}>
                            <td className="p-3 font-mono font-semibold text-white print:text-black">{formatDate(s.due_date)}</td>
                            <td className="p-3 text-right font-medium text-slate-300 print:text-black">{formatCurrency(s.amount)}</td>
                            <td className="p-3 text-right font-bold text-amber-400 print:text-amber-800">{formatCurrency(s.remaining_amount)}</td>
                            <td className="p-3 text-center">
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] font-extrabold uppercase ${
                                  s.status === 'overdue' ? 'bg-rose-950 text-rose-300' : 'bg-amber-950 text-amber-300'
                                }`}
                              >
                                {s.status === 'overdue' ? 'GECİKTİ' : 'BEKLİYOR'}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Last Sale Info */}
              {lastSale && (
                <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 flex items-center justify-between print:bg-gray-50 print:border-gray-300">
                  <div>
                    <span className="text-slate-400 uppercase font-semibold text-[10px] block print:text-gray-600">SON ALIŞ BİLGİSİ</span>
                    <span className="text-xs font-bold text-white print:text-black">{lastSale.sale_number} ({formatDate(lastSale.created_at)})</span>
                  </div>
                  <span className="text-sm font-extrabold text-emerald-400 print:text-emerald-800">{formatCurrency(lastSale.total_amount)}</span>
                </div>
              )}

              {/* Footer */}
              <div className="border-t border-slate-800 pt-4 text-center text-[10px] text-slate-500 font-medium print:border-gray-300 print:text-gray-600">
                <p>Bu belge müşteri cari durum ve ödeme takvimi bilgilendirme amacıyla hazırlanmıştır. Resmi fatura yerine geçmez.</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
