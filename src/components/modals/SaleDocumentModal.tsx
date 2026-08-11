import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/context/ToastContext';
import { formatCurrency, formatDate } from '@/utils/formatters';
import { Sale, SaleItem, PaymentSchedule, Customer, Profile } from '@/types/database.types';
import { buildConsolidatedPaymentPlan } from '@/services/consolidatedPaymentPlanService';
import {
  normalizeTurkishPhone,
  buildSaleWhatsAppMessage,
  logWhatsAppShareAttempt,
} from '@/services/whatsappService';
import { shareOrDownloadSalesPdf, generateSalesPdfFile, downloadPdfFile } from '@/services/pdfService';
import {
  X,
  Printer,
  Send,
  Loader2,
  FileText,
  Clock,
  Package,
  Calendar,
  Phone,
  MessageCircle,
  Mail,
  User,
  ShoppingBag,
  ShoppingCart,
  Wallet,
  AlertTriangle,
  MapPin,
  Globe,
  Tag,
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

  // Fresh Customer Accounting Metrics
  const [netTotalDebt, setNetTotalDebt] = useState(0);
  const [previousBalance, setPreviousBalance] = useState(0);
  const [currentSaleAmount, setCurrentSaleAmount] = useState(0);
  const [paymentMade, setPaymentMade] = useState(0);
  const [allCustomerSales, setAllCustomerSales] = useState<Sale[]>([]);
  const [allCustomerSchedules, setAllCustomerSchedules] = useState<PaymentSchedule[]>([]);

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
          const currentSale = sData as Sale;
          setSale(currentSale);

          // 2. Fetch active business profile for dynamic business name
          if (currentSale?.owner_id) {
            const { data: pData } = await supabase
              .from('profiles')
              .select('*')
              .eq('id', currentSale.owner_id)
              .maybeSingle();
            setProfile(pData as Profile);
          }

          // 3. Fetch customer for contact info
          let custObj: Customer | null = null;
          if (currentSale?.customer_id) {
            const { data: cData } = await supabase
              .from('customers')
              .select('*')
              .eq('id', currentSale.customer_id)
              .maybeSingle();
            custObj = cData as Customer;
            setCustomer(custObj);
          }

          // 4. Fetch sale items
          const { data: iData } = await supabase
            .from('sale_items')
            .select('*')
            .eq('sale_id', saleId)
            .is('deleted_at', null);
          setItems(iData || []);

          // 5. Fetch single sale schedules
          const { data: schData } = await supabase
            .from('payment_schedules')
            .select('*')
            .eq('sale_id', saleId)
            .is('deleted_at', null)
            .order('due_date', { ascending: true });
          setSchedules(schData || []);

          // 6. Fresh DB Ledger Query for Exact Net Customer Debt
          const { data: lData } = await supabase
            .from('customer_ledger')
            .select('balance')
            .eq('customer_id', currentSale.customer_id)
            .is('deleted_at', null)
            .order('created_at', { ascending: false })
            .limit(1);

          const totalDebt = lData?.[0]?.balance !== undefined ? Number(lData[0].balance) : Number(currentSale.remaining_debt || 0);
          const saleTotal = Number(currentSale.total_amount || 0);
          const payAmount = currentSale.payment_type === 'pesin' ? saleTotal : Number(currentSale.paid_amount || 0);
          const prevBal = Math.max(0, totalDebt - saleTotal + payAmount);

          setNetTotalDebt(totalDebt);
          setCurrentSaleAmount(saleTotal);
          setPaymentMade(payAmount);
          setPreviousBalance(prevBal);

          // 7. Fetch all active sales & schedules for consolidated customer plan
          const { data: custSalesData } = await supabase
            .from('sales')
            .select('*')
            .eq('customer_id', currentSale.customer_id)
            .is('deleted_at', null)
            .order('created_at', { ascending: false });

          const { data: custSchedulesData } = await supabase
            .from('payment_schedules')
            .select('*')
            .eq('customer_id', currentSale.customer_id)
            .is('deleted_at', null)
            .order('due_date', { ascending: true });

          setAllCustomerSales((custSalesData as Sale[]) || []);
          setAllCustomerSchedules((custSchedulesData as PaymentSchedule[]) || []);
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
      const messageText = buildSaleWhatsAppMessage(sale, items, schedules, netTotalDebt, previousBalance);

      await logWhatsAppShareAttempt('sales', sale.id, norm.normalized, {
        sale_number: sale.sale_number,
        customer_name: sale.customer_name,
      });

      const { method } = await shareOrDownloadSalesPdf(
        sale,
        items,
        schedules,
        customer,
        profile,
        norm.normalized,
        messageText
      );

      if (method === 'whatsapp_web_download') {
        showSuccess('Gerçek PDF belgesi cihazınıza indirildi! WhatsApp sohbetine dosya olarak ekleyebilirsiniz.');
      } else {
        showSuccess('WhatsApp PDF paylaşımı başlatıldı.');
      }
    } catch (err: any) {
      showError(err.message || 'WhatsApp PDF paylaşımı açılırken bir hata oluştu.');
    }
  };

  const handleDownloadPdfDirect = async () => {
    if (!sale) return;
    try {
      const pdfFile = await generateSalesPdfFile(sale, items, schedules, customer, profile);
      downloadPdfFile(pdfFile, pdfFile.name);
      showSuccess('Gerçek tek sayfa PDF indirildi.');
    } catch (err: any) {
      showError(err.message || 'PDF indirme başarısız.');
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const businessTitle = profile?.business_name?.trim() || 'PETSHOP TOPTAN';
  const businessPhone = profile?.phone?.trim() || '0532 000 00 00';
  const businessAddress = profile?.address?.trim() || 'Toptan Güven, Hızlı Tedarik';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
      <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-md" onClick={onClose} />

      <div className="relative bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-4xl shadow-2xl z-10 overflow-hidden flex flex-col my-auto max-h-[95vh]">
        {/* Top Control Bar (Hidden on Print) */}
        <div className="p-3 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3 bg-slate-900 print:hidden">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400">
              <FileText className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-xs sm:text-sm font-bold text-white">
                Satış ve Ödeme Planı Belgesi (PDF)
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

        {/* EXACT SAMPLE REPLICATION PRINTABLE CONTAINER */}
        <div className="p-2 sm:p-5 overflow-y-auto custom-scrollbar bg-slate-950 text-slate-100 flex-1">
          {loading || !sale ? (
            <div className="p-12 text-center text-slate-400 flex flex-col items-center">
              <Loader2 className="w-8 h-8 animate-spin text-brand-500 mb-2" />
              <span>Birebir PDF Şablonu Yükleniyor...</span>
            </div>
          ) : (
            <div
              id="printable-sale-document"
              className="bg-white text-slate-900 font-sans p-7 rounded-2xl shadow-xl w-full max-w-[800px] aspect-[1/1.414] mx-auto space-y-4 print:p-0 print:border-none print:shadow-none"
            >
              {/* 1. Header Section */}
              <div className="flex items-start justify-between border-b border-slate-100 pb-4">
                <div className="flex items-start gap-3.5">
                  <div className="w-16 h-16 rounded-2xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600 text-3xl shadow-sm shrink-0">
                    🐾
                  </div>
                  <div>
                    <h1 className="text-xl font-black text-slate-900 uppercase tracking-tight leading-tight">
                      {businessTitle}
                    </h1>
                    <p className="text-xs font-semibold text-blue-600 mt-0.5">
                      Toptan Pet Ürünleri & Cari Yönetimi
                    </p>
                    <div className="mt-2 space-y-0.5 text-[11px] text-slate-500 font-medium">
                      <div className="flex items-center gap-1.5">
                        <Phone className="w-3 h-3 text-blue-500" />
                        <span>{businessPhone}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <MessageCircle className="w-3 h-3 text-emerald-500" />
                        <span>{businessPhone}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Mail className="w-3 h-3 text-slate-400" />
                        <span>info@petoptan.com</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="bg-slate-50/80 border border-slate-200 rounded-xl p-3.5 space-y-1.5 text-xs text-right min-w-[240px]">
                  <h2 className="font-extrabold text-slate-900 tracking-wide text-xs uppercase">
                    SATIŞ VE ÖDEME PLANI BELGESİ
                  </h2>
                  <div className="space-y-1 text-[11px] text-slate-600 pt-1 border-t border-slate-200/60">
                    <div className="flex justify-between gap-2">
                      <span className="text-slate-500">Satış No</span>
                      <span className="font-bold text-blue-600 font-mono">: {sale.sale_number}</span>
                    </div>
                    <div className="flex justify-between gap-2">
                      <span className="text-slate-500">Tarih</span>
                      <span className="font-semibold text-slate-800 font-mono">: {formatDate(sale.created_at)}</span>
                    </div>
                    <div className="flex justify-between gap-2">
                      <span className="text-slate-500">Vade Tipi</span>
                      <span className="font-semibold text-slate-800">: {sale.payment_type === 'pesin' ? 'Peşin Satış' : `Vadeli (${sale.term_days || 30} Gün / Haftalık)`}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* 2. Customer Info Card & 3 Summary Badges */}
              <div className="grid grid-cols-12 gap-3">
                {/* Customer Details */}
                <div className="col-span-5 bg-blue-50/40 border border-blue-100 rounded-xl p-3.5 flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-1 text-[10px] font-bold text-blue-600 uppercase tracking-wider">
                      <User className="w-3 h-3" />
                      <span>MÜŞTERİ BİLGİLERİ</span>
                    </div>
                    <div className="text-sm font-extrabold text-slate-900 mt-1 leading-snug">
                      {sale.customer_name}
                    </div>
                    <div className="text-xs text-slate-600 font-medium mt-1 space-y-0.5">
                      {(customer?.contact_name || customer?.contact_person) && (
                        <div>Yetkili: <strong className="text-slate-800">{customer?.contact_name || customer?.contact_person}</strong></div>
                      )}
                      {customer?.phone && (
                        <div>Telefon: <strong className="font-mono text-slate-800">{customer.phone}</strong></div>
                      )}
                    </div>
                  </div>

                  <div className="w-11 h-11 rounded-full bg-blue-100/80 text-blue-600 flex items-center justify-center shrink-0">
                    <ShoppingBag className="w-5.5 h-5.5" />
                  </div>
                </div>

                {/* 4 Summary Accounting Cards */}
                <div className="col-span-7 grid grid-cols-4 gap-1.5">
                  <div className="bg-slate-50 border border-slate-200 p-2.5 rounded-xl text-center flex flex-col justify-center">
                    <span className="text-[9px] font-bold text-slate-500 uppercase">ÖNCEKİ BAKİYE</span>
                    <span className="text-xs font-bold text-slate-700 mt-0.5">{formatCurrency(previousBalance)}</span>
                  </div>

                  <div className="bg-blue-50/60 border border-blue-100 p-2.5 rounded-xl text-center flex flex-col justify-center">
                    <span className="text-[9px] font-bold text-blue-700 uppercase">BUGÜNKÜ SATIŞ</span>
                    <span className="text-xs font-black text-blue-600 mt-0.5">{formatCurrency(currentSaleAmount)}</span>
                  </div>

                  <div className="bg-emerald-50/60 border border-emerald-100 p-2.5 rounded-xl text-center flex flex-col justify-center">
                    <span className="text-[9px] font-bold text-emerald-700 uppercase">YAPILAN ÖDEME</span>
                    <span className="text-xs font-black text-emerald-600 mt-0.5">{formatCurrency(paymentMade)}</span>
                  </div>

                  <div className="bg-amber-50 border border-amber-200 p-2.5 rounded-xl text-center flex flex-col justify-center">
                    <span className="text-[8.5px] font-extrabold text-amber-800 uppercase leading-tight">GÜNCEL CARİ BORÇ</span>
                    <span className="text-xs font-black text-amber-600 mt-0.5">{formatCurrency(netTotalDebt)}</span>
                  </div>
                </div>
              </div>

              {/* 3. Products Table */}
              <div>
                <div className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                  <Package className="w-4 h-4 text-blue-600" />
                  <span>BUGÜNKÜ SİPARİŞ ({items.length} KALEM ÜRÜN)</span>
                </div>

                <div className="border border-slate-200 rounded-xl overflow-hidden shadow-sm bg-white">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-blue-600 text-white font-bold text-[11px] uppercase border-b border-blue-700">
                      <tr>
                        <th className="py-2.5 px-3">Ürün Adı</th>
                        <th className="py-2.5 px-2 text-center">Miktar</th>
                        <th className="py-2.5 px-2 text-center">Birim</th>
                        <th className="py-2.5 px-3 text-right">Birim Fiyat</th>
                        <th className="py-2.5 px-3 text-right">Toplam</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-slate-800">
                      {items.map((it) => (
                        <tr key={it.id}>
                          <td className="py-2.5 px-3 font-semibold text-slate-900">{it.product_name}</td>
                          <td className="py-2.5 px-2 text-center font-bold">{it.quantity}</td>
                          <td className="py-2.5 px-2 text-center text-slate-600">{it.unit}</td>
                          <td className="py-2.5 px-3 text-right font-medium">{formatCurrency(it.sale_price_snapshot)}</td>
                          <td className="py-2.5 px-3 text-right font-extrabold text-slate-900">{formatCurrency(it.total_amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-slate-50 font-bold border-t border-slate-200 text-xs">
                      <tr>
                        <td colSpan={4} className="py-2.5 px-3 text-right font-bold text-slate-900">Bugünkü Satış Tutarı:</td>
                        <td className="py-2.5 px-3 text-right font-black text-blue-700 text-sm">{formatCurrency(currentSaleAmount)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>

              {/* 4. Consolidated Payment Schedule Table */}
              <div>
                <div className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <Calendar className="w-4 h-4 text-blue-600" />
                  <span>GÜNCEL BİRLEŞİK CARİ ÖDEME PLANI</span>
                </div>

                {(() => {
                  const plan = buildConsolidatedPaymentPlan(
                    customer,
                    netTotalDebt,
                    allCustomerSales,
                    allCustomerSchedules,
                    customer?.weekly_payment_target
                  );

                  if (plan.installments.length === 0) {
                    return (
                      <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 font-bold text-center text-xs">
                        ✓ Müşterinin ödenmemiş aktif cari borcu bulunmamaktadır.
                      </div>
                    );
                  }

                  return (
                    <div className="border border-slate-200 rounded-xl overflow-hidden shadow-sm bg-white">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-blue-600 text-white font-bold text-[11px] uppercase border-b border-blue-700">
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
                              <td className="py-2 px-3 text-right font-bold text-slate-900">{formatCurrency(inst.remainingBalance)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  );
                })()}
              </div>

              {/* 5. Cari Summary Strip */}
              <div className="bg-blue-50/40 border border-blue-100 p-3.5 rounded-xl flex items-center justify-between text-xs">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center shrink-0">
                    <Clock className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="font-extrabold text-slate-900 text-sm">GÜNCEL CARİ ÖZETİ</h4>
                    <p className="text-[11px] text-slate-500 font-medium">Haftalık Birleşik Ödeme Planı</p>
                  </div>
                </div>

                <div className="flex items-center gap-6 text-right">
                  <div>
                    <span className="text-[10px] text-slate-500 font-medium block">Bugünkü Satış</span>
                    <span className="font-bold text-blue-600 text-sm">{formatCurrency(currentSaleAmount)}</span>
                  </div>

                  <div className="border-l border-slate-200 pl-6">
                    <span className="text-[10px] text-slate-500 font-medium block">Önceki Bakiye</span>
                    <span className="font-bold text-slate-700 text-sm">{formatCurrency(previousBalance)}</span>
                  </div>

                  <div className="border-l border-slate-200 pl-6">
                    <span className="text-[10px] text-slate-500 font-medium block">Güncel Cari Borç</span>
                    <span className="font-black text-amber-600 text-sm">{formatCurrency(netTotalDebt)}</span>
                  </div>
                </div>
              </div>

              {/* 6. Warning Disclaimer Box */}
              <div className="bg-amber-50/80 border border-amber-200/80 p-3 rounded-xl flex items-center gap-3 text-xs">
                <div className="w-9 h-9 rounded-lg bg-amber-100 text-amber-600 flex items-center justify-center shrink-0 font-bold text-lg">
                  <AlertTriangle className="w-5 h-5 text-amber-600" />
                </div>
                <div>
                  <p className="text-slate-700 text-[11px] font-medium leading-snug">
                    Bu belge cari hesap ve ödeme planı bilgilendirme amacıyla otomatik olarak oluşturulmuştur.
                  </p>
                  <p className="font-extrabold text-slate-900 text-[11px] mt-0.5">
                    RESMİ FATURA / E-ARŞİV FATURA YERİNE GEÇMEZ.
                  </p>
                </div>
              </div>

              {/* 7. Footer Strip */}
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
                  <span>{businessAddress}</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
