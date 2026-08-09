import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/context/ToastContext';
import { formatCurrency, formatDate } from '@/utils/formatters';
import { Sale, SaleItem, PaymentSchedule, Customer, Profile } from '@/types/database.types';
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
  const [profile, setProfile] = useState<Profile | null>(null);
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

          // 2. Fetch active business profile for dynamic business name
          if (sData?.owner_id) {
            const { data: pData } = await supabase
              .from('profiles')
              .select('*')
              .eq('id', sData.owner_id)
              .maybeSingle();
            setProfile(pData as Profile);
          }

          // 3. Fetch customer for contact info
          if (sData?.customer_id) {
            const { data: cData } = await supabase
              .from('customers')
              .select('*')
              .eq('id', sData.customer_id)
              .maybeSingle();
            setCustomer(cData as Customer);
          }

          // 4. Fetch sale items
          const { data: iData } = await supabase
            .from('sale_items')
            .select('*')
            .eq('sale_id', saleId)
            .is('deleted_at', null);
          setItems(iData || []);

          // 5. Fetch payment schedules
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
      const filename = `Satis_Belgesi_${sale.sale_number}.pdf`;

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
        showSuccess('Belge PDF olarak cihazınıza indirildi! WhatsApp sohbetine dosya olarak ekleyebilirsiniz.');
      } else {
        showSuccess('WhatsApp PDF paylaşımı başlatıldı.');
      }
    } catch (err: any) {
      showError(err.message || 'WhatsApp PDF paylaşımı açılırken bir hata oluştu.');
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const businessTitle = profile?.business_name?.trim() || 'TOPTAN PET DÜNYASI';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
      <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-md" onClick={onClose} />

      <div className="relative bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-3xl shadow-2xl z-10 overflow-hidden flex flex-col my-auto max-h-[95vh]">
        {/* Top Control Bar (Hidden on Print) */}
        <div className="p-3.5 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3 bg-slate-900 print:hidden">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400">
              <FileText className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-xs sm:text-sm font-bold text-white">
                Satış Belgesi & Ödeme Planı (PDF)
              </h2>
              <p className="text-[11px] text-slate-400">#{sale?.sale_number}</p>
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

        {/* SINGLE-PAGE COMPACT PRINTABLE A4 CONTAINER AREA */}
        <div className="p-3 sm:p-6 overflow-y-auto custom-scrollbar bg-slate-950 text-slate-100 flex-1">
          {loading || !sale ? (
            <div className="p-10 text-center text-slate-400 flex flex-col items-center">
              <Loader2 className="w-7 h-7 animate-spin text-brand-500 mb-2" />
              <span>Kompakt PDF Oluşturuluyor...</span>
            </div>
          ) : (
            <div
              id="printable-sale-document"
              className="bg-slate-900 border border-slate-800 p-5 sm:p-7 rounded-2xl max-w-2xl mx-auto space-y-4 text-[11px] shadow-2xl print:bg-white print:text-black print:p-0 print:border-none print:shadow-none"
            >
              {/* Official Invoice Disclaimer Bar */}
              <div className="bg-amber-950/60 border border-amber-800/40 p-2 rounded-xl text-center text-amber-300 font-medium text-[10px] print:bg-amber-50 print:text-amber-900 print:border-amber-300">
                ⚠️ BU BELGE RESMİ FATURA / E-ARŞİV FATURA YERİNE GEÇMEZ. CARİ HESAP VE ÖDEME PLANI BİLGİLENDİRME AMACIYLA HAZIRLANMIŞTIR.
              </div>

              {/* 1. Header: Dynamic Business Name & Sale Metadata */}
              <div className="flex flex-row items-center justify-between border-b border-slate-800/80 pb-3 print:border-slate-300">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400 font-bold text-lg print:border-blue-700 print:text-blue-900">
                    🐾
                  </div>
                  <div>
                    <h1 className="text-base font-black text-white uppercase tracking-tight print:text-black leading-tight">
                      {businessTitle}
                    </h1>
                    <div className="text-[10px] text-slate-400 font-medium print:text-slate-600 flex items-center gap-2 mt-0.5">
                      {profile?.phone && <span>Tel: {profile.phone}</span>}
                      {profile?.address && <span>• {profile.address}</span>}
                    </div>
                  </div>
                </div>

                <div className="bg-slate-950 px-3.5 py-2 rounded-xl border border-slate-800 text-right print:bg-slate-50 print:border-slate-300">
                  <h2 className="font-black text-blue-400 text-xs tracking-wide uppercase print:text-blue-900">
                    SATIŞ VE ÖDEME PLANI BELGESİ
                  </h2>
                  <div className="text-[10px] text-slate-300 font-mono mt-0.5 print:text-slate-800 space-x-1.5">
                    <span>Satış No: <strong className="text-white print:text-black">{sale.sale_number}</strong></span>
                    <span>• Tarih: <strong className="text-white print:text-black">{formatDate(sale.created_at)}</strong></span>
                  </div>
                </div>
              </div>

              {/* 2. Customer Info & Top 3 Summary Strip */}
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-stretch">
                {/* Customer Details */}
                <div className="sm:col-span-6 bg-slate-950 p-3 rounded-xl border border-slate-800 print:bg-slate-50 print:border-slate-300 flex flex-col justify-between">
                  <div>
                    <span className="text-slate-400 font-bold uppercase text-[9px] tracking-wider block print:text-slate-600">
                      🐾 MÜŞTERİ BİLGİLERİ
                    </span>
                    <div className="text-xs font-extrabold text-white print:text-black mt-0.5 leading-snug">
                      {sale.customer_name}
                    </div>
                  </div>
                  <div className="text-[10px] text-slate-300 print:text-slate-700 mt-1 flex flex-wrap gap-x-3">
                    {(customer?.contact_name || customer?.contact_person) && (
                      <span>Yetkili: <strong>{customer?.contact_name || customer?.contact_person}</strong></span>
                    )}
                    {customer?.phone && <span>Tel: <strong className="font-mono">{customer.phone}</strong></span>}
                  </div>
                </div>

                {/* 3 Summary Badges */}
                <div className="sm:col-span-6 grid grid-cols-3 gap-2">
                  <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800 text-center flex flex-col justify-center print:bg-slate-50 print:border-slate-300">
                    <span className="text-slate-400 text-[9px] font-bold uppercase block print:text-slate-600">
                      TOPLAM SATIŞ
                    </span>
                    <span className="text-xs font-black text-white block mt-0.5 print:text-black">
                      {formatCurrency(sale.total_amount)}
                    </span>
                  </div>

                  <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800 text-center flex flex-col justify-center print:bg-slate-50 print:border-slate-300">
                    <span className="text-slate-400 text-[9px] font-bold uppercase block print:text-slate-600">
                      ÖDENEN
                    </span>
                    <span className="text-xs font-black text-emerald-400 block mt-0.5 print:text-emerald-700">
                      {formatCurrency(sale.paid_amount || 0)}
                    </span>
                  </div>

                  <div className="bg-slate-950 p-2.5 rounded-xl border border-amber-500/50 text-center flex flex-col justify-center print:bg-slate-50 print:border-amber-400">
                    <span className="text-amber-400 text-[9px] font-extrabold uppercase block print:text-amber-800">
                      KALAN BORÇ
                    </span>
                    <span className="text-xs font-black text-amber-400 block mt-0.5 print:text-amber-800">
                      {formatCurrency(sale.remaining_debt || 0)}
                    </span>
                  </div>
                </div>
              </div>

              {/* 3. Compact Products Table */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <h3 className="text-[10px] font-bold text-slate-300 uppercase tracking-wider print:text-black flex items-center gap-1">
                    <Package className="w-3.5 h-3.5 text-blue-400" />
                    <span>SATIN ALINAN ÜRÜNLER ({items.length})</span>
                  </h3>
                </div>

                <div className="border border-slate-800 rounded-xl overflow-hidden bg-slate-950 print:border-slate-300 print:bg-white">
                  <table className="w-full text-left text-[11px]">
                    <thead className="bg-slate-900 text-slate-400 uppercase border-b border-slate-800 font-semibold print:bg-slate-100 print:text-slate-900 print:border-slate-300 text-[9px]">
                      <tr>
                        <th className="py-2 px-3">Ürün Adı</th>
                        <th className="py-2 px-2 text-center">Miktar</th>
                        <th className="py-2 px-2 text-center">Birim</th>
                        <th className="py-2 px-3 text-right">Birim Fiyat</th>
                        <th className="py-2 px-3 text-right">Toplam</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/80 text-slate-200 print:divide-slate-200 print:text-black">
                      {items.map((it) => (
                        <tr key={it.id}>
                          <td className="py-2 px-3 font-semibold text-white print:text-black">
                            {it.product_name}
                          </td>
                          <td className="py-2 px-2 text-center font-bold">{it.quantity}</td>
                          <td className="py-2 px-2 text-center font-medium text-slate-400 print:text-slate-700">{it.unit}</td>
                          <td className="py-2 px-3 text-right font-medium">{formatCurrency(it.sale_price_snapshot)}</td>
                          <td className="py-2 px-3 text-right font-extrabold text-white print:text-black">
                            {formatCurrency(it.total_amount)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-slate-900/60 font-bold border-t border-slate-800 text-[10px] print:bg-slate-50 print:border-slate-300">
                      <tr>
                        <td colSpan={4} className="py-1.5 px-3 text-right text-slate-400 print:text-slate-700">Ürün Toplamı:</td>
                        <td className="py-1.5 px-3 text-right text-white print:text-black font-extrabold">{formatCurrency(sale.total_amount)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>

              {/* 4. Compact 4-Week Payment Plan Table */}
              <div>
                <h3 className="text-[10px] font-bold text-slate-300 uppercase tracking-wider mb-1.5 print:text-black flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5 text-amber-400" />
                  <span>HAFTALIK ÖDEME PLANISI & VADE TAKVİMİ ({schedules.length} TAKSİT)</span>
                </h3>

                {schedules.length === 0 ? (
                  <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl text-slate-400 italic text-center text-[10px] print:bg-slate-50 print:border-slate-300">
                    Peşin Satış — Haftalık taksit planı bulunmamaktadır.
                  </div>
                ) : (
                  <div className="border border-slate-800 rounded-xl overflow-hidden bg-slate-950 print:border-slate-300 print:bg-white">
                    <table className="w-full text-left text-[11px]">
                      <thead className="bg-slate-900 text-slate-400 uppercase border-b border-slate-800 font-semibold print:bg-slate-100 print:text-slate-900 print:border-slate-300 text-[9px]">
                        <tr>
                          <th className="py-1.5 px-3">Taksit #</th>
                          <th className="py-1.5 px-3">Vade Tarihi</th>
                          <th className="py-1.5 px-3 text-right">Taksit Tutarı</th>
                          <th className="py-1.5 px-3 text-right">Ödenen</th>
                          <th className="py-1.5 px-3 text-center">Durum</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/80 text-slate-200 print:divide-slate-200 print:text-black">
                        {schedules.map((s, idx) => (
                          <tr key={s.id}>
                            <td className="py-1.5 px-3 font-bold text-white print:text-black">
                              {idx + 1}. HAFTA
                            </td>
                            <td className="py-1.5 px-3 font-mono font-semibold text-slate-300 print:text-slate-800">
                              {formatDate(s.due_date)}
                            </td>
                            <td className="py-1.5 px-3 text-right font-bold text-white print:text-black">
                              {formatCurrency(s.amount)}
                            </td>
                            <td className="py-1.5 px-3 text-right font-bold text-emerald-400 print:text-emerald-700">
                              {formatCurrency(s.paid_amount || 0)}
                            </td>
                            <td className="py-1.5 px-3 text-center">
                              <span
                                className={`px-2 py-0.5 rounded text-[9px] font-extrabold uppercase ${
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
                                {s.status === 'partially_paid' && '◐ KISMİ ÖDENDİ'}
                                {s.status === 'overdue' && '⚠️ GECİKTİ'}
                                {s.status === 'pending' && '○ BEKLİYOR'}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* 5. Compact Payment Term Summary Strip */}
              <div className="bg-slate-950 border border-slate-800 p-2.5 rounded-xl flex items-center justify-between text-[10px] print:bg-slate-50 print:border-slate-300">
                <div className="flex items-center gap-1.5 font-bold text-white print:text-black uppercase">
                  <Clock className="w-3.5 h-3.5 text-blue-400 print:text-blue-700" />
                  <span>30 GÜNLÜK VADE ÖZETİ</span>
                </div>

                <div className="font-semibold text-slate-300 print:text-black flex items-center gap-3">
                  <span>Toplam: <strong className="text-white print:text-black">{formatCurrency(sale.total_amount)}</strong></span>
                  <span>Ödenen: <strong className="text-emerald-400 print:text-emerald-700">{formatCurrency(sale.paid_amount || 0)}</strong></span>
                  <span>Kalan: <strong className="text-amber-400 print:text-amber-800 font-black">{formatCurrency(sale.remaining_debt || 0)}</strong></span>
                </div>
              </div>

              {/* 6. Compact Footer Legal Disclaimer */}
              <div className="border-t border-slate-800/80 pt-2 text-center text-[9px] text-slate-500 font-medium space-y-0.5 print:border-slate-300 print:text-slate-600">
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
