import React, { useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/context/ToastContext';
import { formatCurrency, formatDateTime, formatDate } from '@/utils/formatters';
import { Sale, SaleItem, PaymentSchedule, Customer, AuditLog } from '@/types/database.types';
import { LayoutContextType } from '@/components/layout/Layout';
import { EditSaleModal } from '@/components/modals/EditSaleModal';
import { CancelSaleModal } from '@/components/modals/CancelSaleModal';
import {
  normalizeTurkishPhone,
  buildSaleWhatsAppMessage,
  openWhatsAppWeb,
  logWhatsAppShareAttempt,
} from '@/services/whatsappService';
import {
  X,
  ShoppingCart,
  Calendar,
  User,
  DollarSign,
  Loader2,
  FileText,
  CheckCircle,
  Clock,
  Send,
  Printer,
  Edit2,
  Ban,
  History,
  ShieldCheck,
} from 'lucide-react';

interface SaleDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  saleId: string | null;
  onRefreshParent?: () => void;
}

export const SaleDetailModal: React.FC<SaleDetailModalProps> = ({
  isOpen,
  onClose,
  saleId,
  onRefreshParent,
}) => {
  const { showError, showSuccess } = useToast();
  const { openSaleDocumentModal } = useOutletContext<LayoutContextType>();

  const [loading, setLoading] = useState(false);
  const [sale, setSale] = useState<Sale | null>(null);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [items, setItems] = useState<SaleItem[]>([]);
  const [schedules, setSchedules] = useState<PaymentSchedule[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);

  // Modals for editing & cancelling
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [cancelModalOpen, setCancelModalOpen] = useState(false);

  const loadDetails = async () => {
    if (!saleId) return;
    setLoading(true);
    try {
      // 1. Master sale record
      const { data: sData } = await supabase
        .from('sales')
        .select('*')
        .eq('id', saleId)
        .single();

      if (sData?.customer_id) {
        const { data: cData } = await supabase
          .from('customers')
          .select('*')
          .eq('id', sData.customer_id)
          .maybeSingle();
        setCustomer(cData as Customer);
      }

      // 2. Sale Items
      const { data: iData } = await supabase
        .from('sale_items')
        .select('*')
        .eq('sale_id', saleId)
        .is('deleted_at', null);

      // 3. Payment Schedules
      const { data: schData } = await supabase
        .from('payment_schedules')
        .select('*')
        .eq('sale_id', saleId)
        .is('deleted_at', null)
        .order('due_date', { ascending: true });

      // 4. Audit Logs
      const { data: logData } = await supabase
        .from('audit_logs')
        .select('*')
        .eq('entity_id', saleId)
        .order('created_at', { ascending: false });

      setSale(sData as Sale);
      setItems(iData || []);
      setSchedules(schData || []);
      setAuditLogs(logData || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && saleId) {
      loadDetails();
    }
  }, [isOpen, saleId]);

  if (!isOpen || !saleId) return null;

  const handleDirectWhatsApp = async () => {
    if (!sale) return;

    const phoneToUse = customer?.phone || '';
    const norm = normalizeTurkishPhone(phoneToUse);

    if (!norm.isValid) {
      showError('Müşterinin geçerli bir telefon numarası bulunmuyor.');
      return;
    }

    try {
      const msg = buildSaleWhatsAppMessage(sale, items, schedules);
      await logWhatsAppShareAttempt('sales', sale.id, norm.normalized, {
        customer_name: sale.customer_name,
        total_amount: sale.total_amount,
      });

      openWhatsAppWeb(norm.normalized, msg);
    } catch (err: any) {
      showError(err.message || 'WhatsApp gönderimi sırasında hata oluştu.');
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4">
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md" onClick={onClose} />
        <div className="relative bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl z-10 overflow-hidden">
          {/* Header */}
          <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between bg-slate-900">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-brand-600/20 border border-brand-500/30 flex items-center justify-center text-brand-400">
                <ShoppingCart className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-base sm:text-lg font-bold text-white">Sipariş Detayı #{sale?.sale_number}</h2>
                  {sale?.status === 'cancelled' && (
                    <span className="px-2 py-0.5 rounded bg-rose-950 text-rose-400 border border-rose-800 text-[10px] font-extrabold uppercase">
                      İPTAL EDİLDİ
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-400">{sale?.customer_name} — Tarih: {sale && formatDateTime(sale.created_at)}</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button onClick={onClose} className="p-2 text-slate-400 hover:text-white rounded-lg bg-slate-800">
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Action Bar */}
          {sale && (
            <div className="px-4 py-3 bg-slate-950 border-b border-slate-800 flex items-center justify-between flex-wrap gap-2 text-xs">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setEditModalOpen(true)}
                  disabled={sale.status === 'cancelled'}
                  className="px-3 py-1.5 rounded-lg bg-brand-600 hover:bg-brand-500 text-white font-bold flex items-center gap-1.5 transition-all disabled:opacity-40"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                  <span>Siparişi Düzenle</span>
                </button>

                <button
                  onClick={() => setCancelModalOpen(true)}
                  disabled={sale.status === 'cancelled'}
                  className="px-3 py-1.5 rounded-lg bg-rose-950/80 hover:bg-rose-900 border border-rose-800/80 text-rose-300 font-bold flex items-center gap-1.5 transition-all disabled:opacity-40"
                >
                  <Ban className="w-3.5 h-3.5" />
                  <span>İptal Et</span>
                </button>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => openSaleDocumentModal(sale.id)}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold flex items-center gap-1.5 transition-all"
                >
                  <FileText className="w-3.5 h-3.5 text-blue-400" />
                  <span>Belge PDF</span>
                </button>

                <button
                  onClick={handleDirectWhatsApp}
                  className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold flex items-center gap-1.5 transition-all"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>WhatsApp</span>
                </button>
              </div>
            </div>
          )}

          {/* Body */}
          {loading ? (
            <div className="p-12 text-center text-slate-400 flex flex-col items-center">
              <Loader2 className="w-8 h-8 animate-spin text-brand-500 mb-2" />
              <span>Yükleniyor...</span>
            </div>
          ) : sale ? (
            <div className="p-4 sm:p-6 overflow-y-auto space-y-5 custom-scrollbar">
              {/* Financial Metrics Strip */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800/60">
                  <span className="text-slate-400 text-[11px] block">Toplam Sipariş Tutarı</span>
                  <span className="text-base font-extrabold text-white block mt-0.5">{formatCurrency(sale.total_amount)}</span>
                </div>

                <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800/60">
                  <span className="text-slate-400 text-[11px] block">Brüt Kâr</span>
                  <span className="text-base font-extrabold text-emerald-400 block mt-0.5">{formatCurrency(sale.total_profit)}</span>
                </div>

                <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800/60">
                  <span className="text-slate-400 text-[11px] block">Tahsil Edilen</span>
                  <span className="text-base font-extrabold text-emerald-300 block mt-0.5">{formatCurrency(sale.paid_amount || 0)}</span>
                </div>

                <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800/60">
                  <span className="text-slate-400 text-[11px] block">Kalan Borç</span>
                  <span className="text-base font-extrabold text-amber-400 block mt-0.5">{formatCurrency(sale.remaining_debt || 0)}</span>
                </div>
              </div>

              {/* Items Table */}
              <div>
                <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">Satış Kalemleri</h3>
                <div className="border border-slate-800 rounded-xl overflow-hidden bg-slate-950">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-900 text-slate-400 uppercase border-b border-slate-800 font-semibold">
                      <tr>
                        <th className="p-3">Ürün Adı</th>
                        <th className="p-3 w-20 text-center">Miktar</th>
                        <th className="p-3 w-32 text-right">Birim Satış Snapshot</th>
                        <th className="p-3 w-32 text-right">Toplam Tutar</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800 text-slate-200">
                      {items.map((it) => (
                        <tr key={it.id}>
                          <td className="p-3 font-semibold text-white">{it.product_name}</td>
                          <td className="p-3 text-center font-bold">{it.quantity} {it.unit}</td>
                          <td className="p-3 text-right text-slate-100 font-medium">{formatCurrency(it.sale_price_snapshot)}</td>
                          <td className="p-3 text-right font-extrabold text-white">{formatCurrency(it.total_amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Payment Schedules List */}
              {schedules.length > 0 && (
                <div>
                  <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">Haftalık Taksit ve Vade Takibi</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    {schedules.map((s, idx) => (
                      <div key={s.id} className="bg-slate-950 p-3 rounded-xl border border-slate-800 text-xs flex flex-col justify-between">
                        <div className="flex items-center justify-between text-slate-400 mb-1">
                          <span>{idx + 1}. Taksit Vadesi</span>
                          <span className="font-semibold">{formatDate(s.due_date)}</span>
                        </div>
                        <div className="flex items-baseline justify-between mt-1">
                          <span className="text-slate-300">Tutar:</span>
                          <span className="font-bold text-white">{formatCurrency(s.amount)}</span>
                        </div>
                        <div className="flex items-baseline justify-between mt-0.5 text-[11px]">
                          <span className="text-slate-400">Tahsil Edilen:</span>
                          <span className="font-bold text-emerald-400">{formatCurrency(s.paid_amount)}</span>
                        </div>
                        <div className="mt-2 pt-2 border-t border-slate-800 flex items-center justify-between">
                          <span className="text-[10px] text-slate-500 uppercase font-semibold">Durum:</span>
                          <span
                            className={`text-[10px] font-extrabold uppercase px-1.5 py-0.5 rounded ${
                              s.status === 'paid'
                                ? 'bg-emerald-950 text-emerald-300'
                                : s.status === 'partially_paid'
                                ? 'bg-blue-950 text-blue-300'
                                : s.status === 'overdue'
                                ? 'bg-rose-950 text-rose-300'
                                : (s.status as string) === 'cancelled'
                                ? 'bg-slate-800 text-slate-400'
                                : 'bg-amber-950 text-amber-300'
                            }`}
                          >
                            {s.status === 'paid'
                              ? 'Ödendi'
                              : s.status === 'partially_paid'
                              ? 'Kısmi Ödendi'
                              : s.status === 'overdue'
                              ? 'Gecikti'
                              : (s.status as string) === 'cancelled'
                              ? 'İptal'
                              : 'Bekliyor'}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Audit Log History */}
              {auditLogs.length > 0 && (
                <div>
                  <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <History className="w-3.5 h-3.5 text-brand-400" />
                    <span>Düzenleme & İşlem Geçmişi</span>
                  </h3>
                  <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 space-y-1.5 text-xs text-slate-300 font-mono">
                    {auditLogs.map((log) => (
                      <div key={log.id} className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-900 pb-1 gap-1">
                        <span className="text-[11px] text-slate-400">{formatDateTime(log.created_at)}</span>
                        <span className="font-bold text-slate-200">
                          {log.action === 'UPDATE_SALE' && '✏️ Sipariş Düzenlendi'}
                          {log.action === 'CANCEL_SALE' && '🚫 Sipariş İptal Edildi'}
                          {log.action === 'CREATE_SALE' && '🛒 Sipariş Oluşturuldu'}
                        </span>
                        {log.details && (
                          <span className="text-[11px] text-slate-400 truncate max-w-xs">
                            {JSON.stringify(log.details)}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Note */}
              {sale.notes && (
                <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 text-xs">
                  <span className="text-slate-400 block font-semibold mb-1">Satış Notu:</span>
                  <p className="text-slate-200">{sale.notes}</p>
                </div>
              )}
            </div>
          ) : null}

          {/* Footer */}
          <div className="p-4 border-t border-slate-800 bg-slate-900 flex justify-end">
            <button
              onClick={onClose}
              className="py-2 px-5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs"
            >
              Kapat
            </button>
          </div>
        </div>
      </div>

      {/* Edit & Cancel Sub-Modals */}
      <EditSaleModal
        isOpen={editModalOpen}
        onClose={() => setEditModalOpen(false)}
        sale={sale}
        onSuccess={() => {
          loadDetails();
          if (onRefreshParent) onRefreshParent();
        }}
      />

      <CancelSaleModal
        isOpen={cancelModalOpen}
        onClose={() => setCancelModalOpen(false)}
        sale={sale}
        onSuccess={() => {
          loadDetails();
          if (onRefreshParent) onRefreshParent();
        }}
      />
    </>
  );
};
