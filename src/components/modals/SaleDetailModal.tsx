import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { formatCurrency, formatDateTime, formatDate } from '@/utils/formatters';
import { Sale, SaleItem, PaymentSchedule } from '@/types/database.types';
import { X, ShoppingCart, Calendar, User, DollarSign, Loader2, FileText, CheckCircle, Clock } from 'lucide-react';

interface SaleDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  saleId: string | null;
}

export const SaleDetailModal: React.FC<SaleDetailModalProps> = ({
  isOpen,
  onClose,
  saleId,
}) => {
  const [loading, setLoading] = useState(false);
  const [sale, setSale] = useState<Sale | null>(null);
  const [items, setItems] = useState<SaleItem[]>([]);
  const [schedules, setSchedules] = useState<PaymentSchedule[]>([]);

  useEffect(() => {
    if (isOpen && saleId) {
      const loadDetails = async () => {
        setLoading(true);
        try {
          // 1. Master sale record
          const { data: sData } = await supabase
            .from('sales')
            .select('*')
            .eq('id', saleId)
            .single();

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

          setSale(sData as Sale);
          setItems(iData || []);
          setSchedules(schData || []);
        } catch (err) {
          console.error(err);
        } finally {
          setLoading(false);
        }
      };
      loadDetails();
    }
  }, [isOpen, saleId]);

  if (!isOpen || !saleId) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4">
      <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md" onClick={onClose} />

      <div className="relative bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-3xl shadow-2xl z-10 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between bg-slate-900">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-brand-600/20 border border-brand-500/30 flex items-center justify-center text-brand-400">
              <ShoppingCart className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-white">
                Satış Detayı #{sale?.sale_number}
              </h2>
              <p className="text-xs text-slate-400">
                {sale ? formatDateTime(sale.created_at) : 'Satış kaydı'}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-white rounded-lg bg-slate-800">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        {loading || !sale ? (
          <div className="p-12 text-center text-slate-400 flex flex-col items-center">
            <Loader2 className="w-8 h-8 animate-spin text-brand-500 mb-2" />
            <span>Satış Detayları Yükleniyor...</span>
          </div>
        ) : (
          <div className="p-4 sm:p-6 overflow-y-auto space-y-6 custom-scrollbar">
            {/* Customer & Status Banner */}
            <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
              <div>
                <span className="text-slate-400 block font-medium">Müşteri / İşletme</span>
                <span className="text-sm font-bold text-white block mt-0.5">{sale.customer_name}</span>
              </div>
              <div>
                <span className="text-slate-400 block font-medium">Ödeme Türü & Vade</span>
                <span className="text-sm font-bold text-slate-200 block mt-0.5">
                  {sale.payment_type === 'pesin' ? 'Peşin Satış' : `Vadeli (${sale.term_days || 30} Gün)`}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block font-medium">Durum</span>
                <span
                  className={`inline-block mt-1 px-2.5 py-1 rounded-md text-[11px] font-extrabold uppercase ${
                    sale.status === 'paid'
                      ? 'bg-emerald-950 text-emerald-300 border border-emerald-800/50'
                      : 'bg-amber-950 text-amber-300 border border-amber-800/50'
                  }`}
                >
                  {sale.status === 'paid' ? 'Ödendi' : 'Ödeme Bekliyor'}
                </span>
              </div>
            </div>

            {/* Financial Snapshots */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800/60">
                <span className="text-slate-400 text-[11px] block">Toplam Satış Tutarı</span>
                <span className="text-base font-extrabold text-white block mt-0.5">{formatCurrency(sale.total_amount)}</span>
              </div>
              <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800/60">
                <span className="text-slate-400 text-[11px] block">Alış Maliyeti</span>
                <span className="text-base font-bold text-slate-300 block mt-0.5">{formatCurrency(sale.total_cost)}</span>
              </div>
              <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800/60">
                <span className="text-slate-400 text-[11px] block">Hesaplanan Kâr</span>
                <span className="text-base font-extrabold text-emerald-400 block mt-0.5">{formatCurrency(sale.total_profit)}</span>
              </div>
              <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800/60">
                <span className="text-slate-400 text-[11px] block">Kalan Borç</span>
                <span className="text-base font-extrabold text-amber-400 block mt-0.5">{formatCurrency(sale.remaining_debt)}</span>
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
                      <th className="p-3 w-28 text-right">Alış Snapshot</th>
                      <th className="p-3 w-28 text-right">Satış Snapshot</th>
                      <th className="p-3 w-28 text-right">Toplam Tutar</th>
                      <th className="p-3 w-28 text-right">Kâr</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800 text-slate-200">
                    {items.map((it) => (
                      <tr key={it.id}>
                        <td className="p-3 font-semibold text-white">{it.product_name}</td>
                        <td className="p-3 text-center font-bold">{it.quantity} {it.unit}</td>
                        <td className="p-3 text-right text-slate-400">{formatCurrency(it.purchase_price_snapshot)}</td>
                        <td className="p-3 text-right text-slate-100 font-medium">{formatCurrency(it.sale_price_snapshot)}</td>
                        <td className="p-3 text-right font-extrabold text-white">{formatCurrency(it.total_amount)}</td>
                        <td className="p-3 text-right font-bold text-emerald-400">{formatCurrency(it.total_profit)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Payment Schedules List if Vadeli */}
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
                              : 'bg-amber-950 text-amber-300'
                          }`}
                        >
                          {s.status === 'paid'
                            ? 'Ödendi'
                            : s.status === 'partially_paid'
                            ? 'Kısmi Ödendi'
                            : s.status === 'overdue'
                            ? 'Gecikti'
                            : 'Bekliyor'}
                        </span>
                      </div>
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
        )}

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
  );
};
