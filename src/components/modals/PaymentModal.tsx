import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/context/ToastContext';
import { parseErrorMessage } from '@/utils/errors';
import { formatCurrency, formatDate } from '@/utils/formatters';
import { Customer, PaymentMethod } from '@/types/database.types';
import { X, Receipt, Loader2, CheckCircle2, DollarSign, AlertTriangle } from 'lucide-react';

interface PaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultCustomerId?: string;
  onSuccess?: () => void;
}

interface CustomerDebtSummary {
  totalDebt: number;
  dueThisWeek: number;
  overdue: number;
  lastPaymentDate: string | null;
}

export const PaymentModal: React.FC<PaymentModalProps> = ({
  isOpen,
  onClose,
  defaultCustomerId,
  onSuccess,
}) => {
  const { showSuccess, showError } = useToast();

  const [loading, setLoading] = useState(false);
  const [fetchingData, setFetchingData] = useState(false);
  const [customers, setCustomers] = useState<Customer[]>([]);

  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');
  const [amount, setAmount] = useState<number | ''>('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('Nakit');
  const [notes, setNotes] = useState<string>('');

  const [debtSummary, setDebtSummary] = useState<CustomerDebtSummary>({
    totalDebt: 0,
    dueThisWeek: 0,
    overdue: 0,
    lastPaymentDate: null,
  });

  // Load customers
  useEffect(() => {
    if (isOpen) {
      const loadCustomers = async () => {
        setFetchingData(true);
        try {
          const { data } = await supabase
            .from('customers')
            .select('*')
            .eq('active', true)
            .is('deleted_at', null)
            .order('business_name');

          setCustomers(data || []);
          if (defaultCustomerId) {
            setSelectedCustomerId(defaultCustomerId);
          } else if (data && data.length > 0) {
            setSelectedCustomerId(data[0].id);
          }
        } catch (e) {
          console.error(e);
        } finally {
          setFetchingData(false);
        }
      };
      loadCustomers();
    }
  }, [isOpen, defaultCustomerId]);

  // Load debt summary whenever selected customer changes
  useEffect(() => {
    if (selectedCustomerId) {
      const loadCustomerMetrics = async () => {
        try {
          const todayStr = new Date().toISOString().split('T')[0];
          const nextWeekDate = new Date();
          nextWeekDate.setDate(nextWeekDate.getDate() + 7);
          const nextWeekStr = nextWeekDate.toISOString().split('T')[0];

          // 1. Current Balance from Ledger
          const { data: ledgerData } = await supabase
            .from('customer_ledger')
            .select('balance')
            .eq('customer_id', selectedCustomerId)
            .is('deleted_at', null)
            .order('created_at', { ascending: false })
            .limit(1);

          const totDebt = Number(ledgerData?.[0]?.balance || 0);

          // 2. Schedules metrics
          const { data: schedData } = await supabase
            .from('payment_schedules')
            .select('remaining_amount, due_date, status')
            .eq('customer_id', selectedCustomerId)
            .in('status', ['pending', 'partially_paid', 'overdue'])
            .is('deleted_at', null);

          let dueW = 0;
          let ovD = 0;
          schedData?.forEach((s) => {
            const rem = Number(s.remaining_amount || 0);
            if (s.due_date < todayStr || s.status === 'overdue') {
              ovD += rem;
            } else if (s.due_date >= todayStr && s.due_date <= nextWeekStr) {
              dueW += rem;
            }
          });

          // 3. Last Payment Date
          const { data: payData } = await supabase
            .from('payments')
            .select('payment_date')
            .eq('customer_id', selectedCustomerId)
            .is('deleted_at', null)
            .order('payment_date', { ascending: false })
            .limit(1);

          const lastPay = payData?.[0]?.payment_date || null;

          setDebtSummary({
            totalDebt: totDebt,
            dueThisWeek: dueW,
            overdue: ovD,
            lastPaymentDate: lastPay,
          });

          if (totDebt > 0 && amount === '') {
            setAmount(totDebt);
          }
        } catch (err) {
          console.error(err);
        }
      };
      loadCustomerMetrics();
    }
  }, [selectedCustomerId]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedCustomerId) {
      showError('Lütfen bir müşteri seçin.');
      return;
    }

    const payAmt = Number(amount);
    if (isNaN(payAmt) || payAmt <= 0) {
      showError('Lütfen geçerli bir ödeme tutarı girin.');
      return;
    }

    setLoading(true);

    try {
      const { data, error } = await supabase.rpc('process_payment_transaction', {
        p_customer_id: selectedCustomerId,
        p_amount: payAmt,
        p_payment_method: paymentMethod,
        p_notes: notes,
      });

      if (error) {
        showError(parseErrorMessage(error));
        setLoading(false);
        return;
      }

      if (data && data.success) {
        showSuccess(`Tahsilat başarıyla kaydedildi! (Yeni Bakiye: ${formatCurrency(data.new_balance)})`);
        onClose();
        if (onSuccess) onSuccess();
      } else {
        showError('Tahsilat işlemi kaydedilemedi.');
      }
    } catch (err) {
      showError(parseErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md" onClick={onClose} />

      {/* Modal Card */}
      <div className="relative bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg shadow-2xl z-10 overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between bg-slate-900">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-600/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <Receipt className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-white">Yeni Tahsilat Gir</h2>
              <p className="text-xs text-slate-400">Müşteriden alınan tahsilatı veritabanına işleyin.</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white rounded-lg bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        {fetchingData ? (
          <div className="p-8 text-center text-slate-400 flex flex-col items-center">
            <Loader2 className="w-8 h-8 animate-spin text-emerald-500 mb-2" />
            <span>Müşteriler Yükleniyor...</span>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-4 sm:p-6 space-y-5">
            {/* Customer Select */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                Müşteri Seçin *
              </label>
              <select
                required
                value={selectedCustomerId}
                onChange={(e) => setSelectedCustomerId(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-slate-100 text-sm focus:border-emerald-500 outline-none"
              >
                <option value="">-- Müşteri Seçin --</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.business_name} ({c.contact_name || 'Yetkili Yok'})
                  </option>
                ))}
              </select>
            </div>

            {/* Selected Customer Financial Snapshot Strip */}
            {selectedCustomerId && (
              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 grid grid-cols-2 gap-3 text-xs">
                <div>
                  <span className="text-slate-400 block font-medium">Güncel Toplam Borç</span>
                  <span className="text-sm font-extrabold text-amber-400 block mt-0.5">
                    {formatCurrency(debtSummary.totalDebt)}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block font-medium">Bu Hafta Ödenecek</span>
                  <span className="text-sm font-bold text-brand-400 block mt-0.5">
                    {formatCurrency(debtSummary.dueThisWeek)}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block font-medium">Vadesi Geçen Borç</span>
                  <span className={`text-sm font-bold block mt-0.5 ${debtSummary.overdue > 0 ? 'text-rose-400' : 'text-slate-300'}`}>
                    {formatCurrency(debtSummary.overdue)}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block font-medium">Son Ödeme Tarihi</span>
                  <span className="text-sm font-semibold text-slate-200 block mt-0.5">
                    {formatDate(debtSummary.lastPaymentDate)}
                  </span>
                </div>
              </div>
            )}

            {/* Payment Amount */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                Tahsilat Tutarı (TL) *
              </label>
              <div className="relative">
                <input
                  type="number"
                  step="0.01"
                  min={0.01}
                  required
                  value={amount}
                  onChange={(e) => setAmount(e.target.value === '' ? '' : Number(e.target.value))}
                  placeholder="0.00"
                  className="w-full bg-slate-950 border border-slate-700 focus:border-emerald-500 rounded-xl p-3 text-white text-lg font-extrabold outline-none text-right pr-12"
                />
                <span className="absolute right-4 top-3.5 text-slate-400 font-bold text-sm">TL</span>
              </div>
            </div>

            {/* Payment Method */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                Ödeme Yöntemi *
              </label>
              <div className="grid grid-cols-3 gap-2">
                {(['Nakit', 'Havale/EFT', 'Diğer'] as PaymentMethod[]).map((method) => (
                  <button
                    key={method}
                    type="button"
                    onClick={() => setPaymentMethod(method)}
                    className={`py-2.5 px-3 rounded-xl border text-xs font-bold transition-all ${
                      paymentMethod === method
                        ? 'bg-emerald-600/20 border-emerald-500 text-emerald-400 shadow-inner'
                        : 'bg-slate-950 border-slate-700 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {method}
                  </button>
                ))}
              </div>
            </div>

            {/* Notes */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                Not / Açıklama
              </label>
              <textarea
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Örn: Garanti Bankası Havalesi / Makbuz No: 4920"
                className="w-full bg-slate-950 border border-slate-700 focus:border-emerald-500 rounded-xl p-3 text-slate-100 text-xs outline-none"
              />
            </div>

            {/* Actions */}
            <div className="pt-3 border-t border-slate-800 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={onClose}
                className="py-2.5 px-4 rounded-xl border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs transition-colors"
              >
                Vazgeç
              </button>

              <button
                type="submit"
                disabled={loading || !amount}
                className="py-2.5 px-6 rounded-xl bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-white font-bold text-xs shadow-lg shadow-emerald-500/25 flex items-center gap-2 transition-all disabled:opacity-50 active:scale-98"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Kaydediliyor...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Tahsilatı Kaydet ({formatCurrency(Number(amount || 0))})</span>
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
