import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/context/ToastContext';
import { formatCurrency, formatDate } from '@/utils/formatters';
import { Customer, PaymentSchedule, Sale } from '@/types/database.types';
import {
  normalizeTurkishPhone,
  buildCustomerStatementMessage,
  logWhatsAppShareAttempt,
} from '@/services/whatsappService';
import { shareOrDownloadWhatsAppDocument } from '@/utils/pdfGenerator';
import { X, Printer, Send, Users, Loader2, Calendar, DollarSign, Clock } from 'lucide-react';

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
      const filename = `Cari_Ozet_${customer.business_name.replace(/\s+/g, '_')}.pdf`;

      const { method } = await shareOrDownloadWhatsAppDocument(
        docElement,
        norm.normalized,
        messageText,
        filename
      );

      if (method === 'whatsapp_web_download') {
        showSuccess('Cari hesap belgesi PDF olarak cihazınıza indirildi! WhatsApp sohbetine dosya olarak ekleyebilirsiniz.');
      } else {
        showSuccess('WhatsApp PDF paylaşımı başlatıldı.');
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

      <div className="relative bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-xl shadow-2xl z-10 overflow-hidden flex flex-col my-auto max-h-[95vh]">
        {/* Header Control Bar */}
        <div className="p-4 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3 bg-slate-900 print:hidden">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-purple-600/20 border border-purple-500/30 flex items-center justify-center text-purple-400">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-bold text-white">
                Mobil Müşteri Cari Ekstresi
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
              <span>Yazdır / PDF</span>
            </button>

            <button
              onClick={handleWhatsAppSend}
              className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-2 shadow-lg shadow-emerald-600/20 transition-all active:scale-95"
            >
              <Send className="w-4 h-4" />
              <span>WhatsApp</span>
            </button>

            <button onClick={onClose} className="p-2 text-slate-400 hover:text-white rounded-xl bg-slate-800">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Printable Mobile Container Area */}
        <div className="p-3 sm:p-6 overflow-y-auto custom-scrollbar bg-slate-950 text-slate-100 flex-1">
          {loading || !customer ? (
            <div className="p-12 text-center text-slate-400 flex flex-col items-center">
              <Loader2 className="w-8 h-8 animate-spin text-purple-500 mb-2" />
              <span>Müşteri Ekstresi Hazırlanıyor...</span>
            </div>
          ) : (
            <div
              id="printable-customer-statement"
              className="bg-slate-900 border border-slate-800 p-4 sm:p-6 rounded-2xl max-w-xl mx-auto space-y-5 text-xs shadow-2xl print:bg-white print:text-black print:p-0 print:border-none print:shadow-none"
            >
              {/* Disclaimer */}
              <div className="bg-amber-950/70 border border-amber-800/60 p-3 rounded-xl text-center text-amber-300 font-semibold text-[11px] print:bg-amber-50 print:text-amber-900 print:border-amber-400">
                ⚠️ BU BELGE RESMİ FATURA / E-ARŞİV FATURA YERİNE GEÇMEZ. CARİ HESAP BİLGİLENDİRME AMACIYLA HAZIRLANMIŞTIR.
              </div>

              {/* Title & Date */}
              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-2 print:bg-slate-50 print:border-slate-300">
                <h1 className="text-base font-black text-white uppercase print:text-black leading-tight">
                  PETSHOP TOPTAN İŞLETME SİSTEMİ
                </h1>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between text-[11px] gap-1">
                  <span className="text-blue-400 font-extrabold uppercase print:text-blue-900">
                    MÜŞTERİ CARİ HESAP & VADE TAKVİMİ ÖZETİ
                  </span>
                  <span className="text-slate-400 font-mono print:text-slate-700">
                    Tarih: {formatDate(new Date().toISOString())}
                  </span>
                </div>
              </div>

              {/* Customer Info Card */}
              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-1 print:bg-slate-50 print:border-slate-300">
                <span className="text-slate-400 uppercase font-semibold text-[10px] block print:text-slate-600">
                  MÜŞTERİ / FİRMA
                </span>
                <div className="text-base font-extrabold text-white print:text-black leading-tight">
                  {customer.business_name}
                </div>
                {(customer.contact_name || customer.contact_person) && (
                  <div className="text-slate-300 print:text-slate-800 text-xs">
                    Yetkili: {customer.contact_name || customer.contact_person}
                  </div>
                )}
                {customer.phone && (
                  <div className="text-slate-400 font-mono text-xs print:text-slate-700">
                    Telefon: {customer.phone}
                  </div>
                )}
              </div>

              {/* Stacked Debt Cards */}
              <div className="space-y-2">
                <div className="bg-slate-950 p-4 rounded-xl border-2 border-amber-500/60 flex items-center justify-between shadow-lg print:bg-slate-50 print:border-amber-600">
                  <div>
                    <span className="text-slate-400 text-[10px] font-extrabold uppercase block print:text-slate-700">
                      GÜNCEL TOPLAM BORÇ
                    </span>
                    <span className="text-xl font-black text-amber-400 block mt-0.5 print:text-amber-800">
                      {formatCurrency(currentDebt)}
                    </span>
                  </div>
                  {overdueDebt > 0 && (
                    <span className="px-2.5 py-1 rounded bg-rose-950 text-rose-300 font-extrabold text-[10px] uppercase border border-rose-800/60 print:bg-rose-100 print:text-rose-900">
                      ⚠️ {formatCurrency(overdueDebt)} GECİKEN
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2 text-center">
                  <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 print:bg-slate-50 print:border-slate-300">
                    <span className="text-slate-400 text-[10px] uppercase font-semibold block print:text-slate-600">
                      BU HAFTA ÖDENECEK
                    </span>
                    <span className="text-sm font-extrabold text-blue-400 block mt-0.5 print:text-blue-800">
                      {formatCurrency(dueThisWeek)}
                    </span>
                  </div>

                  <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 print:bg-slate-50 print:border-slate-300">
                    <span className="text-slate-400 text-[10px] uppercase font-semibold block print:text-slate-600">
                      GECİKEN BORÇ TUTARI
                    </span>
                    <span className={`text-sm font-extrabold block mt-0.5 ${overdueDebt > 0 ? 'text-rose-400 print:text-rose-800' : 'text-slate-300 print:text-slate-700'}`}>
                      {formatCurrency(overdueDebt)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Upcoming Schedules List */}
              <div className="space-y-2">
                <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider print:text-black flex items-center gap-1.5">
                  <Calendar className="w-4 h-4 text-amber-400" />
                  <span>YAKLAŞAN VADELER & TAKVİM</span>
                </h3>

                {upcomingSchedules.length === 0 ? (
                  <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl text-slate-400 italic text-center text-xs print:bg-slate-50 print:border-slate-300">
                    Ödeme bekleyen aktif taksit bulunmamaktadır.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {upcomingSchedules.slice(0, 6).map((s) => (
                      <div
                        key={s.id}
                        className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 flex items-center justify-between gap-2 text-xs print:bg-slate-50 print:border-slate-300"
                      >
                        <div>
                          <div className="font-bold text-white font-mono print:text-black">
                            Vade: {formatDate(s.due_date)}
                          </div>
                          <div className="text-[11px] text-slate-400 mt-0.5 print:text-slate-700">
                            Toplam: {formatCurrency(s.amount)} | Kalan: <span className="font-bold text-amber-400 print:text-amber-800">{formatCurrency(s.remaining_amount)}</span>
                          </div>
                        </div>

                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-extrabold uppercase ${
                            s.status === 'overdue'
                              ? 'bg-rose-950 text-rose-300 border border-rose-800/50 print:bg-rose-100 print:text-rose-800'
                              : 'bg-amber-950 text-amber-300 border border-amber-800/50 print:bg-amber-100 print:text-amber-800'
                          }`}
                        >
                          {s.status === 'overdue' ? '⚠️ GECİKTİ' : '○ BEKLİYOR'}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Last Sale */}
              {lastSale && (
                <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 flex items-center justify-between text-xs print:bg-slate-50 print:border-slate-300">
                  <div>
                    <span className="text-slate-400 uppercase font-semibold text-[10px] block print:text-slate-600">
                      SON SATIŞ BİLGİSİ
                    </span>
                    <span className="font-bold text-white print:text-black">
                      {lastSale.sale_number} ({formatDate(lastSale.created_at)})
                    </span>
                  </div>
                  <span className="font-extrabold text-emerald-400 print:text-emerald-800">
                    {formatCurrency(lastSale.total_amount)}
                  </span>
                </div>
              )}

              {/* Footer */}
              <div className="border-t border-slate-800 pt-3 text-center text-[10px] text-slate-500 font-medium print:border-slate-300 print:text-slate-600">
                <p>Bu belge müşteri cari durum ve ödeme takvimi bilgilendirme amacıyla hazırlanmıştır. Resmi fatura yerine geçmez.</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
