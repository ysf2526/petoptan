import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/context/ToastContext';
import { formatCurrency, formatDate } from '@/utils/formatters';
import { Customer, PaymentSchedule, Sale, Profile } from '@/types/database.types';
import {
  normalizeTurkishPhone,
  buildCustomerStatementMessage,
  logWhatsAppShareAttempt,
} from '@/services/whatsappService';
import { shareOrDownloadWhatsAppDocument } from '@/utils/pdfGenerator';
import { X, Printer, Send, Users, Loader2, Calendar, Clock } from 'lucide-react';

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
  const [profile, setProfile] = useState<Profile | null>(null);
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

          // 2. Fetch business profile
          if (cData?.owner_id) {
            const { data: pData } = await supabase
              .from('profiles')
              .select('*')
              .eq('id', cData.owner_id)
              .maybeSingle();
            setProfile(pData as Profile);
          }

          // 3. Customer Ledger Balance
          const { data: lData } = await supabase
            .from('customer_ledger')
            .select('balance')
            .eq('customer_id', customerId)
            .is('deleted_at', null)
            .order('created_at', { ascending: false })
            .limit(1);

          const bal = lData?.[0]?.balance ? Number(lData[0].balance) : 0;
          setCurrentDebt(bal);

          // 4. Payment Schedules
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

          // 5. Last Sale
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

  const businessTitle = profile?.business_name?.trim() || 'TOPTAN PET DÜNYASI';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
      <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-md" onClick={onClose} />

      <div className="relative bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl shadow-2xl z-10 overflow-hidden flex flex-col my-auto max-h-[95vh]">
        {/* Header Control Bar */}
        <div className="p-3 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3 bg-slate-900 print:hidden">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-purple-600/20 border border-purple-500/30 flex items-center justify-center text-purple-400">
              <Users className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-xs sm:text-sm font-bold text-white">
                Müşteri Cari Ekstresi (PDF)
              </h2>
              <p className="text-[11px] text-slate-400">{customer?.business_name}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs flex items-center gap-1.5 border border-slate-700 transition-all"
            >
              <Printer className="w-3.5 h-3.5 text-brand-400" />
              <span>Yazdır</span>
            </button>

            <button
              onClick={handleWhatsAppSend}
              className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-1.5 shadow-lg shadow-emerald-600/20 transition-all active:scale-95"
            >
              <Send className="w-3.5 h-3.5" />
              <span>WhatsApp PDF Gönder</span>
            </button>

            <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-white rounded-xl bg-slate-800">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Printable Single-Page Compact Container Area */}
        <div className="p-2 sm:p-5 overflow-y-auto custom-scrollbar bg-slate-950 text-slate-100 flex-1">
          {loading || !customer ? (
            <div className="p-10 text-center text-slate-400 flex flex-col items-center">
              <Loader2 className="w-7 h-7 animate-spin text-purple-500 mb-2" />
              <span>1 Sayfa Ekstre Hazırlanıyor...</span>
            </div>
          ) : (
            <div
              id="printable-customer-statement"
              className="bg-slate-900 border border-slate-800 p-4 sm:p-5 rounded-2xl max-w-xl mx-auto space-y-3 text-[10px] shadow-2xl print:bg-white print:text-black print:p-0 print:border-none print:shadow-none"
            >
              {/* Disclaimer */}
              <div className="bg-amber-950/60 border border-amber-800/40 py-1.5 px-3 rounded-lg text-center text-amber-300 font-medium text-[9px] print:bg-amber-50 print:text-amber-900 print:border-amber-300">
                ⚠️ BU BELGE RESMİ FATURA YERİNE GEÇMEZ. CARİ HESAP BİLGİLENDİRME AMACIYLA HAZIRLANMIŞTIR.
              </div>

              {/* Dynamic Header */}
              <div className="flex flex-row items-center justify-between border-b border-slate-800/80 pb-2.5 print:border-slate-300">
                <div>
                  <h1 className="text-sm font-black text-white uppercase print:text-black leading-tight">
                    {businessTitle}
                  </h1>
                  <h2 className="text-blue-400 font-extrabold text-[9px] uppercase tracking-wider mt-0.5 print:text-blue-900">
                    MÜŞTERİ CARİ HESAP VE ÖDEME TAKVİMİ ÖZETİ
                  </h2>
                </div>
                <div className="text-right text-[9px] text-slate-400 font-mono print:text-slate-700">
                  Tarih: {formatDate(new Date().toISOString())}
                </div>
              </div>

              {/* Customer Info Card */}
              <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800 flex items-center justify-between print:bg-slate-50 print:border-slate-300">
                <div>
                  <span className="text-slate-400 uppercase font-bold text-[8px] block print:text-slate-600">MÜŞTERİ / FİRMA</span>
                  <div className="text-xs font-extrabold text-white mt-0.5 print:text-black">{customer.business_name}</div>
                  {(customer.contact_name || customer.contact_person) && (
                    <div className="text-slate-300 text-[9px] print:text-slate-700">
                      Yetkili: {customer.contact_name || customer.contact_person}
                    </div>
                  )}
                </div>
                {customer.phone && <div className="text-slate-400 print:text-slate-700 font-mono text-[9px]">Tel: {customer.phone}</div>}
              </div>

              {/* Compact Debt Badges */}
              <div className="grid grid-cols-3 gap-1.5">
                <div className="bg-slate-950 p-2 rounded-xl border border-slate-800 text-center print:bg-slate-50 print:border-slate-300">
                  <span className="text-slate-400 text-[8px] uppercase font-bold block print:text-slate-600">GÜNCEL TOPLAM BORÇ</span>
                  <span className={`text-xs font-black block mt-0.5 ${currentDebt > 0 ? 'text-amber-400 print:text-amber-800' : 'text-emerald-400 print:text-emerald-800'}`}>
                    {formatCurrency(currentDebt)}
                  </span>
                </div>

                <div className="bg-slate-950 p-2 rounded-xl border border-slate-800 text-center print:bg-slate-50 print:border-slate-300">
                  <span className="text-slate-400 text-[8px] uppercase font-bold block print:text-slate-600">BU HAFTA ÖDENECEK</span>
                  <span className="text-xs font-black text-blue-400 block mt-0.5 print:text-blue-800">
                    {formatCurrency(dueThisWeek)}
                  </span>
                </div>

                <div className="bg-slate-950 p-2 rounded-xl border border-slate-800 text-center print:bg-slate-50 print:border-slate-300">
                  <span className="text-slate-400 text-[8px] uppercase font-bold block print:text-slate-600">GECİKEN BORÇ</span>
                  <span className={`text-xs font-black block mt-0.5 ${overdueDebt > 0 ? 'text-rose-400 print:text-rose-800' : 'text-slate-300 print:text-slate-700'}`}>
                    {formatCurrency(overdueDebt)}
                  </span>
                </div>
              </div>

              {/* Upcoming Schedules Compact Table */}
              <div>
                <h3 className="text-[9px] font-bold text-slate-300 uppercase tracking-wider mb-1 print:text-black flex items-center gap-1">
                  <Calendar className="w-3 h-3 text-amber-400" />
                  <span>YAKLAŞAN VADELER & ÖDEME TAKVİMİ</span>
                </h3>
                {upcomingSchedules.length === 0 ? (
                  <div className="p-2.5 bg-slate-950 border border-slate-800 rounded-xl text-slate-400 italic text-center text-[9px] print:bg-slate-50 print:border-slate-300">
                    Ödeme bekleyen aktif taksit bulunmamaktadır.
                  </div>
                ) : (
                  <div className="border border-slate-800 rounded-xl overflow-hidden bg-slate-950 print:border-slate-300 print:bg-white">
                    <table className="w-full text-left text-[10px]">
                      <thead className="bg-slate-900 text-slate-400 uppercase border-b border-slate-800 font-semibold print:bg-slate-100 print:text-slate-900 print:border-slate-300 text-[8px]">
                        <tr>
                          <th className="py-1 px-2.5">Vade Tarihi</th>
                          <th className="py-1 px-2.5 text-right">Tutar</th>
                          <th className="py-1 px-2.5 text-right">Kalan Tutar</th>
                          <th className="py-1 px-2.5 text-center">Durum</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/80 text-slate-200 print:divide-slate-200 print:text-black">
                        {upcomingSchedules.slice(0, 6).map((s) => (
                          <tr key={s.id}>
                            <td className="py-1 px-2.5 font-mono font-semibold text-white print:text-black">{formatDate(s.due_date)}</td>
                            <td className="py-1 px-2.5 text-right font-medium text-slate-300 print:text-slate-800">{formatCurrency(s.amount)}</td>
                            <td className="py-1 px-2.5 text-right font-bold text-amber-400 print:text-amber-800">{formatCurrency(s.remaining_amount)}</td>
                            <td className="py-1 px-2.5 text-center">
                              <span
                                className={`px-1.5 py-0.5 rounded text-[8px] font-extrabold uppercase ${
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
                <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800 flex items-center justify-between text-[9px] print:bg-slate-50 print:border-slate-300">
                  <div>
                    <span className="text-slate-400 uppercase font-semibold text-[8px] block print:text-slate-600">SON SATIŞ BİLGİSİ</span>
                    <span className="font-bold text-white print:text-black">{lastSale.sale_number} ({formatDate(lastSale.created_at)})</span>
                  </div>
                  <span className="font-extrabold text-emerald-400 print:text-emerald-800">{formatCurrency(lastSale.total_amount)}</span>
                </div>
              )}

              {/* Footer */}
              <div className="border-t border-slate-800/80 pt-1.5 text-center text-[8px] text-slate-500 font-medium print:border-slate-300 print:text-slate-600">
                <p>Bu belge müşteri cari durum ve ödeme takvimi bilgilendirme amacıyla hazırlanmıştır. Resmi fatura yerine geçmez.</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
