import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/context/ToastContext';
import { formatCurrency, formatDate } from '@/utils/formatters';
import { Sale, SaleItem, PaymentSchedule, Customer } from '@/types/database.types';
import {
  normalizeTurkishPhone,
  buildSaleWhatsAppMessage,
  logWhatsAppShareAttempt,
} from '@/services/whatsappService';
import { shareOrDownloadWhatsAppDocument } from '@/utils/pdfGenerator';
import {
  X,
  Printer,
  Send,
  Loader2,
  FileText,
  CheckCircle2,
  AlertTriangle,
  Calendar,
  DollarSign,
  UserCheck,
  Building2,
  Clock,
  Check,
} from 'lucide-react';

interface SaleDocumentModalProps {
  isOpen: boolean;
  onClose: () => void;
  saleId: string | null;
}

export const SaleDocumentModal: React.FC<SaleDocumentModalProps> = ({
  isOpen,
  onClose,
  saleId,
}) => {
  const { showError, showSuccess } = useToast();

  const [loading, setLoading] = useState(false);
  const [sale, setSale] = useState<Sale | null>(null);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [items, setItems] = useState<SaleItem[]>([]);
  const [schedules, setSchedules] = useState<PaymentSchedule[]>([]);

  useEffect(() => {
    if (isOpen && saleId) {
      const loadData = async () => {
        setLoading(true);
        try {
          // 1. Fetch sale
          const { data: sData, error: sErr } = await supabase
            .from('sales')
            .select('*')
            .eq('id', saleId)
            .single();

          if (sErr) throw sErr;
          setSale(sData as Sale);

          // 2. Fetch customer for contact info
          if (sData?.customer_id) {
            const { data: cData } = await supabase
              .from('customers')
              .select('*')
              .eq('id', sData.customer_id)
              .maybeSingle();
            setCustomer(cData as Customer);
          }

          // 3. Fetch sale items
          const { data: iData } = await supabase
            .from('sale_items')
            .select('*')
            .eq('sale_id', saleId)
            .is('deleted_at', null);
          setItems(iData || []);

          // 4. Fetch payment schedules
          const { data: schData } = await supabase
            .from('payment_schedules')
            .select('*')
            .eq('sale_id', saleId)
            .is('deleted_at', null)
            .order('due_date', { ascending: true });
          setSchedules(schData || []);
        } catch (err: any) {
          console.error(err);
          showError(err.message || 'Belge detayları yüklenemedi.');
        } finally {
          setLoading(false);
        }
      };
      loadData();
    }
  }, [isOpen, saleId, showError]);

  if (!isOpen || !saleId) return null;

  const handleWhatsAppSend = async () => {
    if (!sale) return;

    const phoneToUse = customer?.phone || '';
    const norm = normalizeTurkishPhone(phoneToUse);

    if (!norm.isValid) {
      showError('Müşterinin geçerli bir telefon numarası bulunmuyor.');
      return;
    }

    try {
      const messageText = buildSaleWhatsAppMessage(sale, items, schedules);
      const docElement = document.getElementById('printable-sale-document');
      const filename = `Satis_Belgesi_${sale.sale_number}.html`;

      await logWhatsAppShareAttempt('sales', sale.id, norm.normalized, {
        sale_number: sale.sale_number,
        customer_name: sale.customer_name,
      });

      const { method } = await shareOrDownloadWhatsAppDocument(
        docElement,
        norm.normalized,
        messageText,
        filename
      );

      if (method === 'whatsapp_web_download') {
        showSuccess('Belge cihazınıza indirildi! WhatsApp sohbetine ek olarak ekleyebilirsiniz.');
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

      <div className="relative bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-4xl shadow-2xl z-10 overflow-hidden flex flex-col my-auto max-h-[95vh]">
        {/* Top Control Bar (Hidden on Print) */}
        <div className="p-4 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3 bg-slate-900 print:hidden">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-bold text-white">
                Satış ve Ödeme Planı Bilgilendirme Belgesi
              </h2>
              <p className="text-xs text-slate-400">#{sale?.sale_number}</p>
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

        {/* DOCUMENT CONTENT AREA (A4 Printable Layout) */}
        <div className="p-4 sm:p-8 overflow-y-auto custom-scrollbar bg-slate-950 text-slate-100 flex-1">
          {loading || !sale ? (
            <div className="p-12 text-center text-slate-400 flex flex-col items-center">
              <Loader2 className="w-8 h-8 animate-spin text-brand-500 mb-2" />
              <span>Belge Oluşturuluyor...</span>
            </div>
          ) : (
            <div
              id="printable-sale-document"
              className="bg-slate-900 border border-slate-800 p-6 sm:p-10 rounded-2xl max-w-3xl mx-auto space-y-6 text-xs shadow-2xl print:bg-white print:text-black print:p-0 print:border-none print:shadow-none"
            >
              {/* Official Invoice Disclaimer Bar */}
              <div className="bg-amber-950/60 border border-amber-800/50 p-3 rounded-xl text-center text-amber-300 font-semibold text-[11px] print:bg-amber-50 print:text-amber-900 print:border-amber-400">
                ⚠️ BU BELGE RESMİ FATURA / E-ARŞİV FATURA YERİNE GEÇMEZ. CARİ HESAP VE ÖDEME PLANI BİLGİLENDİRME AMACIYLA HAZIRLANMIŞTIR.
              </div>

              {/* 1. Header: Logo, Business Info & Sale Metadata */}
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 border-b border-slate-800 pb-6 print:border-slate-300">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xl">🐾</span>
                    <h1 className="text-xl font-black text-white tracking-tight uppercase print:text-black">
                      PETSHOP TOPTAN İŞLETME SİSTEMİ
                    </h1>
                  </div>
                  <p className="text-slate-400 font-semibold text-xs print:text-slate-700">
                    Toptan Pet Ürünleri & Cari Yönetimi
                  </p>
                  <div className="pt-1 text-[11px] text-slate-400 space-y-0.5 print:text-slate-600">
                    <div>Telefon: <span className="font-bold text-slate-200 print:text-black">0532 000 00 00</span></div>
                    <div>WhatsApp: <span className="font-bold text-slate-200 print:text-black">0532 000 00 00</span></div>
                    <div>E-posta: <span className="font-bold text-slate-200 print:text-black">info@petoptan.com</span></div>
                  </div>
                </div>

                <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 sm:text-right min-w-[240px] print:bg-slate-50 print:border-slate-300">
                  <h2 className="font-black text-blue-400 text-sm tracking-wider uppercase print:text-blue-900">
                    SATIŞ BELGESİ
                  </h2>
                  <div className="mt-2 space-y-1 text-[11px] text-slate-300 print:text-slate-800">
                    <div>Satış No: <span className="font-bold font-mono text-white print:text-black">{sale.sale_number}</span></div>
                    <div>Tarih: <span className="font-bold font-mono text-white print:text-black">{formatDate(sale.created_at)}</span></div>
                    <div>Vade Tipi: <span className="font-bold text-white print:text-black">{sale.payment_type === 'pesin' ? 'Peşin Satış' : `Vadeli (${sale.term_days || 30} Gün / Haftalık)`}</span></div>
                  </div>
                </div>
              </div>

              {/* 2. Customer Info Card */}
              <div className="bg-slate-950 p-4 sm:p-5 rounded-xl border border-slate-800 grid grid-cols-1 sm:grid-cols-2 gap-4 print:bg-slate-50 print:border-slate-300">
                <div>
                  <span className="text-slate-400 font-bold uppercase text-[10px] tracking-wider block print:text-slate-600">
                    🐾 MÜŞTERİ BİLGİLERİ
                  </span>
                  <div className="text-base font-extrabold text-white mt-1 print:text-black">
                    {sale.customer_name}
                  </div>
                  {(customer?.contact_name || customer?.contact_person) && (
                    <div className="text-slate-300 font-medium mt-1 print:text-slate-800">
                      Yetkili: {customer?.contact_name || customer?.contact_person}
                    </div>
                  )}
                  {customer?.phone && (
                    <div className="text-slate-400 font-mono mt-0.5 print:text-slate-700">
                      Tel: {customer.phone}
                    </div>
                  )}
                </div>

                {customer?.address && (
                  <div>
                    <span className="text-slate-400 font-bold uppercase text-[10px] tracking-wider block print:text-slate-600">
                      TESLİMAT / ADRES
                    </span>
                    <p className="text-slate-300 mt-1 leading-relaxed print:text-slate-800 font-medium">
                      {customer.address}
                    </p>
                  </div>
                )}
              </div>

              {/* 3. Dynamic Top Financial Metric Cards */}
              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 print:bg-slate-50 print:border-slate-300">
                  <span className="text-slate-400 text-[10px] font-semibold uppercase block print:text-slate-600">
                    TOPLAM SATIŞ
                  </span>
                  <span className="text-base font-black text-white block mt-0.5 print:text-black">
                    {formatCurrency(sale.total_amount)}
                  </span>
                </div>

                <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 print:bg-slate-50 print:border-slate-300">
                  <span className="text-slate-400 text-[10px] font-semibold uppercase block print:text-slate-600">
                    TOPLAM ÖDENEN
                  </span>
                  <span className="text-base font-black text-emerald-400 block mt-0.5 print:text-emerald-700">
                    {formatCurrency(sale.paid_amount || 0)}
                  </span>
                </div>

                <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 print:bg-slate-50 print:border-slate-300">
                  <span className="text-slate-400 text-[10px] font-semibold uppercase block print:text-slate-600">
                    KALAN BORÇ
                  </span>
                  <span className="text-base font-black text-amber-400 block mt-0.5 print:text-amber-800">
                    {formatCurrency(sale.remaining_debt || 0)}
                  </span>
                </div>
              </div>

              {/* 4. Products Table */}
              <div>
                <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-2 print:text-black">
                  SATIN ALINAN ÜRÜNLER
                </h3>
                <div className="border border-slate-800 rounded-xl overflow-hidden bg-slate-950 print:border-slate-300 print:bg-white">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-900 text-slate-400 uppercase border-b border-slate-800 font-semibold print:bg-slate-100 print:text-slate-900 print:border-slate-300">
                      <tr>
                        <th className="p-3">Ürün</th>
                        <th className="p-3 text-center">Miktar</th>
                        <th className="p-3 text-center">Birim</th>
                        <th className="p-3 text-right">Birim Fiyat</th>
                        <th className="p-3 text-right">Toplam</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/80 text-slate-200 print:divide-slate-200 print:text-black">
                      {items.map((it) => (
                        <tr key={it.id}>
                          <td className="p-3 font-semibold text-white print:text-black leading-snug">
                            {it.product_name}
                          </td>
                          <td className="p-3 text-center font-bold">{it.quantity}</td>
                          <td className="p-3 text-center font-medium text-slate-400 print:text-slate-700">{it.unit}</td>
                          <td className="p-3 text-right font-medium">{formatCurrency(it.sale_price_snapshot)}</td>
                          <td className="p-3 text-right font-extrabold text-white print:text-black">
                            {formatCurrency(it.total_amount)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* 5. Weekly Payment Schedule Grid */}
              <div>
                <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-2 print:text-black">
                  HAFTALIK ÖDEME PLANI
                </h3>
                {schedules.length === 0 ? (
                  <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl text-slate-400 italic text-center print:bg-slate-50 print:border-slate-300 print:text-slate-700">
                    Peşin Satış — Haftalık taksit planı bulunmamaktadır.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    {schedules.map((s, idx) => (
                      <div
                        key={s.id}
                        className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 space-y-2 print:bg-slate-50 print:border-slate-300"
                      >
                        <div className="flex items-center justify-between border-b border-slate-800/80 pb-2 print:border-slate-200">
                          <span className="font-extrabold text-white text-xs print:text-black">
                            0{idx + 1} {idx + 1}. HAFTA
                          </span>
                          <span className="font-mono text-[10px] text-slate-400 print:text-slate-600">
                            {formatDate(s.due_date)}
                          </span>
                        </div>

                        <div className="space-y-1 text-[11px]">
                          <div className="flex justify-between">
                            <span className="text-slate-400 print:text-slate-600">Ödenecek:</span>
                            <span className="font-bold text-white print:text-black">{formatCurrency(s.amount)}</span>
                          </div>

                          <div className="flex justify-between">
                            <span className="text-slate-400 print:text-slate-600">Ödenen:</span>
                            <span className="font-bold text-emerald-400 print:text-emerald-700">{formatCurrency(s.paid_amount || 0)}</span>
                          </div>
                        </div>

                        <div className="pt-1.5 border-t border-slate-800/60 flex items-center justify-between print:border-slate-200">
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-extrabold uppercase ${
                              s.status === 'paid'
                                ? 'bg-emerald-950 text-emerald-300 border border-emerald-800/50 print:bg-emerald-100 print:text-emerald-800'
                                : s.status === 'partially_paid'
                                ? 'bg-amber-950 text-amber-300 border border-amber-800/50 print:bg-amber-100 print:text-amber-800'
                                : s.status === 'overdue'
                                ? 'bg-rose-950 text-rose-300 border border-rose-800/50 print:bg-rose-100 print:text-rose-800'
                                : 'bg-slate-800 text-slate-300 border border-slate-700 print:bg-slate-200 print:text-slate-800'
                            }`}
                          >
                            {s.status === 'paid' && '✓ ÖDENDİ'}
                            {s.status === 'partially_paid' && '◐ KISMEN ÖDENDİ'}
                            {s.status === 'overdue' && '⚠️ GECİKTİ'}
                            {s.status === 'pending' && '○ BEKLİYOR'}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* 6. Vade Özeti Panel */}
              <div className="bg-slate-950 border border-slate-800 p-4 rounded-xl flex flex-col sm:flex-row items-center justify-between gap-3 text-xs print:bg-slate-50 print:border-slate-300">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-blue-400 print:text-blue-700" />
                  <span className="font-bold text-white print:text-black uppercase">
                    30 GÜNLÜK VADE ({schedules.length} Haftalık Ödeme Planı)
                  </span>
                </div>

                <div className="flex items-center gap-4 text-slate-300 print:text-black font-semibold">
                  <div>Toplam: <span className="font-bold text-white print:text-black">{formatCurrency(sale.total_amount)}</span></div>
                  <div>Ödenen: <span className="font-bold text-emerald-400 print:text-emerald-700">{formatCurrency(sale.paid_amount || 0)}</span></div>
                  <div>Kalan: <span className="font-bold text-amber-400 print:text-amber-800">{formatCurrency(sale.remaining_debt || 0)}</span></div>
                </div>
              </div>

              {/* 7. Footer Legal Disclaimer */}
              <div className="border-t border-slate-800 pt-4 text-center text-[10px] text-slate-500 font-medium space-y-1 print:border-slate-300 print:text-slate-600">
                <p>Bu belge cari hesap ve ödeme planı bilgilendirme amacıyla otomatik olarak oluşturulmuştur.</p>
                <p className="font-bold text-slate-400 print:text-black">RESMİ FATURA / E-ARŞİV FATURA YERİNE GEÇMEZ.</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
