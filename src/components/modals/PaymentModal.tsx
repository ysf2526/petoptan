import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/context/ToastContext';
import { parseErrorMessage } from '@/utils/errors';
import { formatCurrency, formatDate } from '@/utils/formatters';
import { Customer, Supplier, PaymentMethod } from '@/types/database.types';
import { X, Receipt, Loader2, CheckCircle2, ArrowRightLeft, ShieldAlert } from 'lucide-react';

interface PaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultCustomerId?: string | null;
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
  const [suppliers, setSuppliers] = useState<{ id: string; company_name: string; debt: number }[]>([]);

  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');
  const [selectedSupplierId, setSelectedSupplierId] = useState<string>('');
  const [amount, setAmount] = useState<number | ''>('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('Nakit');
  const [notes, setNotes] = useState<string>('');

  const [debtSummary, setDebtSummary] = useState<CustomerDebtSummary>({
    totalDebt: 0,
    dueThisWeek: 0,
    overdue: 0,
    lastPaymentDate: null,
  });

  const selectedSupplierDebt = suppliers.find((s) => s.id === selectedSupplierId)?.debt || 0;

  // Load customers & suppliers with debt
  useEffect(() => {
    if (isOpen) {
      const loadInitialData = async () => {
        setFetchingData(true);
        try {
          // 1. Fetch Customers
          const { data: cData } = await supabase
            .from('customers')
            .select('*')
            .eq('active', true)
            .is('deleted_at', null)
            .order('business_name');

          setCustomers(cData || []);
          if (defaultCustomerId) {
            setSelectedCustomerId(defaultCustomerId);
          } else if (cData && cData.length > 0) {
            setSelectedCustomerId(cData[0].id);
          }

          // 2. Fetch Suppliers & calculate their current payable balance
          const { data: sData } = await supabase
            .from('suppliers')
            .select('id, company_name')
            .eq('active', true)
            .is('deleted_at', null)
            .order('company_name');

          if (sData && sData.length > 0) {
            const listWithDebt = await Promise.all(
              sData.map(async (sup) => {
                const { data: ledgerData } = await supabase
                  .from('supplier_ledger')
                  .select('balance')
                  .eq('supplier_id', sup.id)
                  .is('deleted_at', null)
                  .order('created_at', { ascending: false })
                  .limit(1);

                const debt = Number(ledgerData?.[0]?.balance || 0);
                return { id: sup.id, company_name: sup.company_name, debt };
              })
            );

            setSuppliers(listWithDebt);
            if (listWithDebt.length > 0) {
              const indebted = listWithDebt.find((s) => s.debt > 0) || listWithDebt[0];
              setSelectedSupplierId(indebted.id);
            }
          }
        } catch (e) {
          console.error(e);
        } finally {
          setFetchingData(false);
        }
      };
      loadInitialData();
    }
  }, [isOpen, defaultCustomerId]);

  // Load customer debt summary whenever selected customer changes
  useEffect(() => {
    if (selectedCustomerId) {
      const loadCustomerMetrics = async () => {
        try {
          const todayStr = new Date().toISOString().split('T')[0];
          const nextWeekDate = new Date();
          nextWeekDate.setDate(nextWeekDate.getDate() + 7);
          const nextWeekStr = nextWeekDate.toISOString().split('T')[0];

          // 1. Current Balance from Customer Ledger
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

  // Update selected supplier debt when supplier changes
  useEffect(() => {
    if (selectedSupplierId) {
      const found = suppliers.find((s) => s.id === selectedSupplierId);
      setSelectedSupplierDebt(found ? found.debt : 0);
    }
  }, [selectedSupplierId, suppliers]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedCustomerId) {
      showError('Lütfen bir müşteri seçin.');
      return;
    }

    const payAmt = Number(amount);
    if (isNaN(payAmt) || payAmt <= 0) {
      showError('Lütfen geçerli bir tutar girin.');
      return;
    }

    if (paymentMethod === 'Tedarikçiye Mahsup') {
      if (!selectedSupplierId) {
        showError('Lütfen mahsup edilecek tedarikçiyi seçiniz.');
        return;
      }
      if (payAmt > debtSummary.totalDebt) {
        showError(`Mahsup tutarı (${formatCurrency(payAmt)}) müşterinin kalan borcundan (${formatCurrency(debtSummary.totalDebt)}) fazla olamaz.`);
        return;
      }
      if (payAmt > selectedSupplierDebt) {
        showError(`Mahsup tutarı (${formatCurrency(payAmt)}) tedarikçinin kalan borcundan (${formatCurrency(selectedSupplierDebt)}) fazla olamaz.`);
        return;
      }
    }

    setLoading(true);

    try {
      if (paymentMethod === 'Tedarikçiye Mahsup') {
        const { data, error } = await supabase.rpc('process_supplier_offset_transaction', {
          p_customer_id: selectedCustomerId,
          p_supplier_id: selectedSupplierId,
          p_amount: payAmt,
          p_notes: notes,
        });

        if (error) {
          showError(parseErrorMessage(error));
          setLoading(false);
          return;
        }

        if (data && data.success) {
          showSuccess(`Tedarikçi Mahsubu başarıyla kaydedildi! (Müşteri Kalan Borç: ${formatCurrency(data.new_customer_balance)} / Tedarikçi Kalan Borç: ${formatCurrency(data.new_supplier_balance)})`);
          onClose();
          if (onSuccess) onSuccess();
        } else {
          showError('Tedarikçi mahsup işlemi gerçekleştirilemedi.');
        }
      } else {
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
      }
    } catch (err) {
      showError(parseErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const payAmtNum = Number(amount || 0);
  const remainingCustDebtAfter = Math.max(0, debtSummary.totalDebt - payAmtNum);
  const remainingSupDebtAfter = Math.max(0, selectedSupplierDebt - payAmtNum);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md" onClick={onClose} />

      {/* Modal Card */}
      <div className="relative bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg shadow-2xl z-10 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between bg-slate-900">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-600/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <Receipt className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-white">Tahsilat / Mahsup Gir</h2>
              <p className="text-xs text-slate-400">Nakit, Havale veya Tedarikçiye Mahsuplu ödeme girin.</p>
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
            <span>Veriler Yükleniyor...</span>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-4 sm:p-6 space-y-5 overflow-y-auto custom-scrollbar">
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
                  <span className="text-slate-400 block font-medium">Müşteri Güncel Borcu</span>
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

            {/* Payment Method Selection */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                Ödeme Yöntemi *
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {(['Nakit', 'Havale/EFT', 'Diğer', 'Tedarikçiye Mahsup'] as PaymentMethod[]).map((method) => (
                  <button
                    key={method}
                    type="button"
                    onClick={() => setPaymentMethod(method)}
                    className={`py-2.5 px-2 rounded-xl border text-[11px] font-bold transition-all text-center ${
                      paymentMethod === method
                        ? method === 'Tedarikçiye Mahsup'
                          ? 'bg-purple-600/20 border-purple-500 text-purple-300 shadow-inner'
                          : 'bg-emerald-600/20 border-emerald-500 text-emerald-400 shadow-inner'
                        : 'bg-slate-950 border-slate-700 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {method}
                  </button>
                ))}
              </div>
            </div>

            {/* Supplier Select Section if Tedarikçiye Mahsup */}
            {paymentMethod === 'Tedarikçiye Mahsup' && (
              <div className="bg-purple-950/30 border border-purple-800/60 p-4 rounded-xl space-y-3">
                <div className="flex items-center gap-2 text-purple-300 text-xs font-bold uppercase tracking-wider">
                  <ArrowRightLeft className="w-4 h-4" />
                  <span>Tedarikçiye Mahsup Detayı</span>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Tedarikçi Seçin *
                  </label>
                  <select
                    required
                    value={selectedSupplierId}
                    onChange={(e) => setSelectedSupplierId(e.target.value)}
                    className="w-full bg-slate-900 border border-purple-700/80 rounded-xl p-2.5 text-slate-100 text-sm focus:border-purple-500 outline-none"
                  >
                    <option value="">-- Tedarikçi Seçin --</option>
                    {suppliers.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.company_name} (Borcunuz: {formatCurrency(s.debt)})
                      </option>
                    ))}
                  </select>
                </div>

                {selectedSupplierId && (
                  <div className="p-3 bg-slate-900/90 rounded-lg border border-purple-800/40 text-xs space-y-1.5">
                    <div className="flex justify-between text-slate-300">
                      <span>Tedarikçiye Güncel Borcunuz:</span>
                      <span className={`font-bold ${selectedSupplierDebt > 0 ? 'text-amber-400' : 'text-rose-400'}`}>
                        {formatCurrency(selectedSupplierDebt)}
                      </span>
                    </div>

                    {selectedSupplierDebt <= 0 && (
                      <div className="p-2.5 bg-rose-950/40 border border-rose-900/60 rounded-lg text-rose-300 text-[11px] leading-relaxed">
                        ⚠️ Seçilen tedarikçi firmaya sistemde kayıtlı borcunuz bulunmamaktadır (0,00 TL). Tedarikçiler sayfasından <strong>"+ Borç Ekle"</strong> butonuna tıklayarak borç kaydı (Örn: 80.000 TL) oluşturabilirsiniz.
                      </div>
                    )}

                    {payAmtNum > 0 && selectedSupplierDebt > 0 && (
                      <div className="border-t border-slate-800 pt-1 mt-1 space-y-1">
                        <div className="flex justify-between text-slate-400">
                          <span>Mahsup Sonrası Müşteri Borcu:</span>
                          <span className="font-bold text-emerald-400">{formatCurrency(remainingCustDebtAfter)}</span>
                        </div>
                        <div className="flex justify-between text-slate-400">
                          <span>Mahsup Sonrası Tedarikçi Borcu:</span>
                          <span className="font-bold text-purple-300">{formatCurrency(remainingSupDebtAfter)}</span>
                        </div>
                        <div className="flex justify-between text-slate-500 text-[10px] italic pt-0.5">
                          <span>Kasaya/Bankaya Para Girişi:</span>
                          <span>0.00 TL (Sanal POS Mahsubu)</span>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Payment Amount */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                {paymentMethod === 'Tedarikçiye Mahsup' ? 'Mahsup Tutarı (TL) *' : 'Tahsilat Tutarı (TL) *'}
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

            {/* Notes */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                Not / Açıklama
              </label>
              <textarea
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={paymentMethod === 'Tedarikçiye Mahsup' ? 'Örn: Tedarikçi Sanal POS Slip No: 8821' : 'Örn: Garanti Bankası Havalesi / Makbuz No: 4920'}
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
                className={`py-2.5 px-6 rounded-xl font-bold text-xs shadow-lg flex items-center gap-2 transition-all disabled:opacity-50 active:scale-98 text-white ${
                  paymentMethod === 'Tedarikçiye Mahsup'
                    ? 'bg-gradient-to-r from-purple-600 to-purple-500 hover:from-purple-500 hover:to-purple-400 shadow-purple-500/25'
                    : 'bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 shadow-emerald-500/25'
                }`}
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Kaydediliyor...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    <span>
                      {paymentMethod === 'Tedarikçiye Mahsup' ? 'Mahsubu Onayla' : 'Tahsilatı Kaydet'} ({formatCurrency(Number(amount || 0))})
                    </span>
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
