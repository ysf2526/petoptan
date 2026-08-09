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
  Clock,
  Package,
  Calendar,
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

      <div className="relative bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl shadow-2xl z-10 overflow-hidden flex flex-col my-auto max-h-[95vh]">
        {/* Top Control Bar (Hidden on Print) */}
        <div className="p-4 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3 bg-slate-900 print:hidden">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-bold text-white">
                Mobil Öncelikli Satış Belgesi
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

        {/* MOBILE-FIRST DOCUMENT CONTAINER AREA */}
        <div className="p-3 sm:p-6 overflow-y-auto custom-scrollbar bg-slate-950 text-slate-100 flex-1">
          {loading || !sale ? (
            <div className="p-12 text-center text-slate-400 flex flex-col items-center">
              <Loader2 className="w-8 h-8 animate-spin text-brand-500 mb-2" />
              <span>Mobil Belge Oluşturuluyor...</span>
            </div>
          ) : (
            <div
              id="printable-sale-document"
              className="bg-slate-900 border border-slate-800 p-4 sm:p-6 rounded-2xl max-w-xl mx-auto space-y-5 text-xs shadow-2xl print:bg-white print:text-black print:p-0 print:border-none print:shadow-none"
            >
              {/* Disclaimer Bar */}
              <div className="bg-amber-950/70 border border-amber-800/60 p-3 rounded-xl text-center text-amber-300 font-semibold text-[11px] leading-snug print:bg-amber-50 print:text-amber-900 print:border-amber-400">
                ⚠️ BU BELGE RESMİ FATURA / E-ARŞİV FATURA YERİNE GEÇMEZ. CARİ HESAP VE ÖDEME PLANI BİLGİLENDİRME AMACIYLA HAZIRLANMIŞTIR.
              </div>

              {/* 1. Header (Vertical Stacked Mobile Header) */}
              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-3 print:bg-slate-50 print:border-slate-300">
                <div className="flex items-center gap-2">
                  <span className="text-xl">🐾</span>
                  <div>
                    <h1 className="text-base font-black text-white tracking-tight uppercase print:text-black leading-tight">
                      PETSHOP TOPTAN İŞLETME SİSTEMİ
                    </h1>
                    <p className="text-[11px] text-slate-400 font-medium print:text-slate-700">
                      Toptan Pet Ürünleri & Cari Yönetimi
                    </p>
                  </div>
                </div>

                <div className="pt-2 border-t border-slate-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-[11px] text-slate-300 print:border-slate-300 print:text-slate-800">
                  <div className="font-extrabold text-blue-400 uppercase tracking-wide print:text-blue-900">
                    SATIŞ VE ÖDEME PLANI BELGESİ
                  </div>
                  <div className="font-mono text-slate-400 print:text-slate-700">
                    No: <span className="font-bold text-white print:text-black">{sale.sale_number}</span> | Tarih: <span className="font-bold text-white print:text-black">{formatDate(sale.created_at)}</span>
                  </div>
                </div>
              </div>

              {/* 2. Customer Info Card */}
              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-1.5 print:bg-slate-50 print:border-slate-300">
                <span className="text-slate-400 font-bold uppercase text-[10px] tracking-wider block print:text-slate-600">
                  🐾 MÜŞTERİ BİLGİLERİ
                </span>
                <div className="text-base font-extrabold text-white print:text-black leading-tight">
                  {sale.customer_name}
                </div>
                {(customer?.contact_name || customer?.contact_person) && (
                  <div className="text-slate-300 font-medium print:text-slate-800 text-xs">
                    Yetkili: {customer?.contact_name || customer?.contact_person}
                  </div>
                )}
                {customer?.phone && (
                  <div className="text-slate-400 font-mono text-xs print:text-slate-700">
                    Telefon: {customer.phone}
                  </div>
                )}
                {customer?.address && (
                  <div className="text-slate-400 text-[11px] pt-1 leading-relaxed print:text-slate-700 border-t border-slate-900 print:border-slate-200 mt-1">
                    Adres: {customer.address}
                  </div>
                )}
              </div>

              {/* 3. Stacked Financial Summary Cards (KALAN BORÇ PROMINENT) */}
              <div className="space-y-2">
                <div className="bg-slate-950 p-4 rounded-xl border-2 border-amber-500/60 flex items-center justify-between shadow-lg print:bg-slate-50 print:border-amber-600">
                  <div>
                    <span className="text-slate-400 text-[10px] font-extrabold uppercase block print:text-slate-700">
                      KALAN TOPLAM BORÇ
                    </span>
                    <span className="text-xl sm:text-2xl font-black text-amber-400 block mt-0.5 print:text-amber-800">
                      {formatCurrency(sale.remaining_debt || 0)}
                    </span>
                  </div>
                  <div className="text-right text-[11px]">
                    <span className="inline-block px-2.5 py-1 rounded-lg bg-amber-950 text-amber-300 font-extrabold border border-amber-800/60 print:bg-amber-100 print:text-amber-900">
                      {sale.payment_type === 'pesin' ? 'PEŞİN SATIŞ' : `${sale.term_days || 30} GÜN VADELİ`}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 text-center">
                  <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 print:bg-slate-50 print:border-slate-300">
                    <span className="text-slate-400 text-[10px] font-semibold uppercase block print:text-slate-600">
                      TOPLAM SATIŞ TUTARI
                    </span>
                    <span className="text-sm font-extrabold text-white block mt-0.5 print:text-black">
                      {formatCurrency(sale.total_amount)}
                    </span>
                  </div>

                  <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 print:bg-slate-50 print:border-slate-300">
                    <span className="text-slate-400 text-[10px] font-semibold uppercase block print:text-slate-600">
                      ÖDENEN TUTAR
                    </span>
                    <span className="text-sm font-extrabold text-emerald-400 block mt-0.5 print:text-emerald-700">
                      {formatCurrency(sale.paid_amount || 0)}
                    </span>
                  </div>
                </div>
              </div>

              {/* 4. Product Cards List (NO WIDE TABLE, STACKED CARDS FOR MOBILE) */}
              <div className="space-y-2">
                <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider print:text-black flex items-center gap-1.5">
                  <Package className="w-4 h-4 text-blue-400" />
                  <span>SATIN ALINAN ÜRÜNLER ({items.length})</span>
                </h3>

                <div className="space-y-2">
                  {items.map((it, idx) => (
                    <div
                      key={it.id}
                      className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 space-y-2 print:bg-slate-50 print:border-slate-300"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="font-bold text-white text-xs print:text-black leading-snug break-words">
                          {idx + 1}. {it.product_name}
                        </div>
                        <span className="font-mono text-slate-400 text-[11px] shrink-0 print:text-slate-700">
                          {it.unit}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-[11px] pt-1.5 border-t border-slate-900 print:border-slate-200">
                        <div>
                          <span className="text-slate-400 print:text-slate-600 block">Miktar & Birim Fiyat</span>
                          <span className="font-semibold text-slate-200 print:text-black">
                            {it.quantity} {it.unit} × {formatCurrency(it.sale_price_snapshot)}
                          </span>
                        </div>

                        <div className="text-right">
                          <span className="text-slate-400 print:text-slate-600 block font-semibold">KALEM TOPLAMI</span>
                          <span className="font-extrabold text-white text-sm print:text-black">
                            {formatCurrency(it.total_amount)}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* 5. Weekly Payment Schedule Stacked Cards */}
              <div className="space-y-2">
                <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider print:text-black flex items-center gap-1.5">
                  <Calendar className="w-4 h-4 text-amber-400" />
                  <span>HAFTALIK ÖDEME PLANISI ({schedules.length} TAKSİT)</span>
                </h3>

                {schedules.length === 0 ? (
                  <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl text-slate-400 italic text-center text-xs print:bg-slate-50 print:border-slate-300 print:text-slate-700">
                    Peşin Satış — Haftalık taksit planı bulunmamaktadır.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {schedules.map((s, idx) => (
                      <div
                        key={s.id}
                        className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 flex items-center justify-between gap-3 print:bg-slate-50 print:border-slate-300"
                      >
                        <div>
                          <div className="font-extrabold text-white text-xs print:text-black">
                            {idx + 1}. HAFTA — <span className="font-mono font-semibold text-slate-300 print:text-slate-800">{formatDate(s.due_date)}</span>
                          </div>
                          <div className="text-[11px] text-slate-400 mt-0.5 print:text-slate-700">
                            Ödenecek: <span className="font-bold text-white print:text-black">{formatCurrency(s.amount)}</span>
                            {s.paid_amount > 0 && (
                              <span> | Ödenen: <span className="font-bold text-emerald-400 print:text-emerald-700">{formatCurrency(s.paid_amount)}</span></span>
                            )}
                          </div>
                        </div>

                        <div>
                          <span
                            className={`inline-block px-2.5 py-1 rounded text-[10px] font-extrabold uppercase ${
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

              {/* 6. Vade Özeti Banner */}
              <div className="bg-slate-950 border border-slate-800 p-3.5 rounded-xl flex items-center justify-between gap-2 text-[11px] print:bg-slate-50 print:border-slate-300">
                <div className="flex items-center gap-1.5 font-bold text-white print:text-black">
                  <Clock className="w-4 h-4 text-blue-400 print:text-blue-700" />
                  <span>30 GÜNLÜK VADE ÖZETİ</span>
                </div>

                <div className="font-semibold text-slate-300 print:text-black">
                  Toplam: <span className="font-bold text-white print:text-black">{formatCurrency(sale.total_amount)}</span> | Kalan: <span className="font-extrabold text-amber-400 print:text-amber-800">{formatCurrency(sale.remaining_debt || 0)}</span>
                </div>
              </div>

              {/* 7. Footer Legal Disclaimer */}
              <div className="border-t border-slate-800 pt-3 text-center text-[10px] text-slate-500 font-medium space-y-1 print:border-slate-300 print:text-slate-600">
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
