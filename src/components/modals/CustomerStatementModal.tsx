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
import { generateSalesPdfFile, downloadPdfFile } from '@/services/pdfService';
import { X, Printer, Send, Users, Loader2, Calendar, Clock, AlertTriangle, User, Phone, MapPin, Globe, Tag } from 'lucide-react';

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

      // Generate a mock sale object for statement pdf rendering
      const mockSale: Sale = {
        id: lastSale?.id || 'statement',
        owner_id: customer.owner_id,
        customer_id: customer.id,
        customer_name: customer.business_name,
        sale_number: `CARİ-${formatDate(new Date().toISOString()).replace(/\./g, '')}`,
        total_amount: currentDebt,
        total_cost: 0,
        total_profit: 0,
        paid_amount: 0,
        remaining_debt: currentDebt,
        payment_type: 'vadeli',
        term_days: 30,
        due_date: null,
        status: 'paid',
        notes: 'Cari Hesap ve Vadeler Ekstresi',
        created_at: new Date().toISOString(),
        deleted_at: null,
      };

      const pdfFile = await generateSalesPdfFile(mockSale, [], upcomingSchedules, customer, profile);

      downloadPdfFile(pdfFile, pdfFile.name);

      const nav = navigator as any;
      if (nav.share && nav.canShare && nav.canShare({ files: [pdfFile] })) {
        try {
          await nav.share({
            title: pdfFile.name,
            text: messageText,
            files: [pdfFile],
          });
          showSuccess('WhatsApp PDF paylaşımı başlatıldı.');
          return;
        } catch (err: any) {
          if (err.name !== 'AbortError') console.warn(err);
        }
      }

      const digits = norm.normalized.replace(/\D/g, '');
      const encodedText = encodeURIComponent(messageText);
      window.open(`https://wa.me/${digits}?text=${encodedText}`, '_blank');
      showSuccess('Cari hesap belgesi PDF olarak cihazınıza indirildi! WhatsApp sohbetine dosya olarak ekleyebilirsiniz.');
    } catch (err: any) {
      showError(err.message || 'WhatsApp açılırken bir hata oluştu.');
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const businessTitle = profile?.business_name?.trim() || 'PETSHOP TOPTAN';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
      <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-md" onClick={onClose} />

      <div className="relative bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-4xl shadow-2xl z-10 overflow-hidden flex flex-col my-auto max-h-[95vh]">
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

        {/* Printable Container */}
        <div className="p-2 sm:p-5 overflow-y-auto custom-scrollbar bg-slate-950 text-slate-100 flex-1">
          {loading || !customer ? (
            <div className="p-12 text-center text-slate-400 flex flex-col items-center">
              <Loader2 className="w-8 h-8 animate-spin text-purple-500 mb-2" />
              <span>Cari Ekstre Hazırlanıyor...</span>
            </div>
          ) : (
            <div
              id="printable-customer-statement"
              className="bg-white text-slate-900 font-sans p-7 rounded-2xl shadow-xl w-full max-w-[800px] aspect-[1/1.414] mx-auto space-y-4 print:p-0 print:border-none print:shadow-none"
            >
              {/* Dynamic Header */}
              <div className="flex items-start justify-between border-b border-slate-100 pb-4">
                <div className="flex items-start gap-3">
                  <div className="w-14 h-14 rounded-2xl bg-purple-50 border border-purple-100 flex items-center justify-center text-purple-600 text-2xl font-bold shrink-0">
                    🐾
                  </div>
                  <div>
                    <h1 className="text-lg font-black text-slate-900 uppercase leading-tight">
                      {businessTitle}
                    </h1>
                    <h2 className="text-purple-600 font-extrabold text-xs uppercase tracking-wider mt-0.5">
                      MÜŞTERİ CARİ HESAP VE ÖDEME TAKVİMİ ÖZETİ
                    </h2>
                  </div>
                </div>
                <div className="text-right text-xs font-mono text-slate-500">
                  Rapor Tarihi: <strong className="text-slate-800">{formatDate(new Date().toISOString())}</strong>
                </div>
              </div>

              {/* Customer Info Card */}
              <div className="bg-slate-50 border border-slate-200 p-3.5 rounded-xl flex items-center justify-between">
                <div>
                  <span className="text-slate-500 uppercase font-bold text-[9px] block">MÜŞTERİ / FİRMA</span>
                  <div className="text-sm font-extrabold text-slate-900 mt-0.5">{customer.business_name}</div>
                  {(customer.contact_name || customer.contact_person) && (
                    <div className="text-slate-600 text-xs mt-0.5 font-medium">
                      Yetkili: {customer.contact_name || customer.contact_person}
                    </div>
                  )}
                </div>
                {customer.phone && <div className="text-slate-600 font-mono text-xs font-semibold">Tel: {customer.phone}</div>}
              </div>

              {/* Debt Badges */}
              <div className="grid grid-cols-3 gap-2">
                <div className="bg-amber-50/70 border border-amber-100 p-3 rounded-xl text-center">
                  <span className="text-slate-500 text-[9px] uppercase font-bold block">GÜNCEL TOPLAM BORÇ</span>
                  <span className={`text-sm font-black block mt-1 ${currentDebt > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
                    {formatCurrency(currentDebt)}
                  </span>
                </div>

                <div className="bg-blue-50/70 border border-blue-100 p-3 rounded-xl text-center">
                  <span className="text-slate-500 text-[9px] uppercase font-bold block">BU HAFTA ÖDENECEK</span>
                  <span className="text-sm font-black text-blue-600 block mt-1">
                    {formatCurrency(dueThisWeek)}
                  </span>
                </div>

                <div className="bg-rose-50/70 border border-rose-100 p-3 rounded-xl text-center">
                  <span className="text-slate-500 text-[9px] uppercase font-bold block">GECİKEN BORÇ</span>
                  <span className={`text-sm font-black block mt-1 ${overdueDebt > 0 ? 'text-rose-600' : 'text-slate-700'}`}>
                    {formatCurrency(overdueDebt)}
                  </span>
                </div>
              </div>

              {/* Consolidated Payment Plan Table */}
              <div>
                <div className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                  <Calendar className="w-4 h-4 text-purple-600" />
                  <span>GÜNCEL BİRLEŞİK CARİ ÖDEME PLANI</span>
                </div>

                {(() => {
                  const plan = buildConsolidatedPaymentPlan(customer, currentDebt, [], upcomingSchedules, customer?.weekly_payment_target);
                  if (plan.installments.length === 0) {
                    return (
                      <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-500 italic text-center text-xs">
                        Ödeme bekleyen aktif cari borç bulunmamaktadır.
                      </div>
                    );
                  }
                  return (
                    <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-sm">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-purple-600 text-white font-bold text-[11px] uppercase border-b border-purple-700">
                          <tr>
                            <th className="py-2 px-3">Hafta #</th>
                            <th className="py-2 px-3">Tahmini Vade Tarihi</th>
                            <th className="py-2 px-3 text-right">Taksit Tutarı</th>
                            <th className="py-2 px-3 text-right">Kalan Borç Bakiyesi</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 text-slate-800">
                          {plan.installments.map((inst) => (
                            <tr key={inst.weekIndex}>
                              <td className="py-2 px-3 font-bold text-slate-900">{inst.weekIndex}. HAFTA</td>
                              <td className="py-2 px-3 font-mono font-medium text-slate-700">{formatDate(inst.dueDate)}</td>
                              <td className="py-2 px-3 text-right font-extrabold text-amber-600">{formatCurrency(inst.amount)}</td>
                              <td className="py-2 px-3 text-right font-bold text-slate-800">{formatCurrency(inst.remainingBalance)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  );
                })()}
              </div>

              {/* Last Sale Info */}
              {lastSale && (
                <div className="bg-slate-50 border border-slate-200 p-3 rounded-xl flex items-center justify-between text-xs">
                  <div>
                    <span className="text-slate-500 uppercase font-semibold text-[9px] block">SON SATIŞ BİLGİSİ</span>
                    <span className="font-bold text-slate-900">{lastSale.sale_number} ({formatDate(lastSale.created_at)})</span>
                  </div>
                  <span className="font-extrabold text-emerald-600">{formatCurrency(lastSale.total_amount)}</span>
                </div>
              )}

              {/* Warning Disclaimer Box */}
              <div className="bg-amber-50/80 border border-amber-200/80 p-3 rounded-xl flex items-center gap-3 text-xs">
                <div className="w-9 h-9 rounded-lg bg-amber-100 text-amber-600 flex items-center justify-center shrink-0 font-bold text-lg">
                  <AlertTriangle className="w-5 h-5 text-amber-600" />
                </div>
                <div>
                  <p className="text-slate-700 text-[11px] font-medium leading-snug">
                    Bu belge müşteri cari durum ve ödeme takvimi bilgilendirme amacıyla hazırlanmıştır.
                  </p>
                  <p className="font-extrabold text-slate-900 text-[11px] mt-0.5">
                    RESMİ FATURA YERİNE GEÇMEZ.
                  </p>
                </div>
              </div>

              {/* Footer */}
              <div className="flex items-center justify-between text-[10px] text-slate-500 font-semibold border-t border-slate-100 pt-3">
                <div className="flex items-center gap-1">
                  <MapPin className="w-3 h-3 text-slate-400" />
                  <span>{businessTitle}</span>
                </div>
                <div className="flex items-center gap-1">
                  <Globe className="w-3 h-3 text-slate-400" />
                  <span>www.petoptan.com</span>
                </div>
                <div className="flex items-center gap-1">
                  <Tag className="w-3 h-3 text-slate-400" />
                  <span>Toptan Güven, Hızlı Tedarik</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
