import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/context/ToastContext';
import { parseErrorMessage } from '@/utils/errors';
import { formatCurrency, formatDate } from '@/utils/formatters';
import { Customer, Supplier, PaymentMethod } from '@/types/database.types';
import { SearchableSelect } from '@/components/common/SearchableSelect';
import {
  normalizeTurkishPhone,
  getBusinessName,
  buildCustomerCollectionWhatsAppMessage,
  buildCustomerOffsetWhatsAppMessage,
  buildSupplierOffsetWhatsAppMessage,
  openWhatsAppWeb,
  logWhatsAppShareAttempt,
} from '@/services/whatsappService';
import {
  X,
  Receipt,
  Loader2,
  CheckCircle2,
  ArrowRightLeft,
  ShieldAlert,
  Send,
  MessageSquare,
  AlertCircle,
  PhoneOff,
} from 'lucide-react';

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

interface CompletedTransactionResult {
  type: 'COLLECTION' | 'OFFSET';
  customerId: string;
  customerName: string;
  customerPhone?: string | null;
  supplierId?: string;
  supplierName?: string;
  supplierPhone?: string | null;
  amount: number;
  prevCustDebt: number;
  newCustDebt: number;
  prevSupDebt?: number;
  newSupDebt?: number;
  paymentId?: string;
}

export const PaymentModal: React.FC<PaymentModalProps> = ({
  isOpen,
  onClose,
  defaultCustomerId,
  onSuccess,
}) => {
  const { showSuccess, showError, showToast } = useToast();

  const [loading, setLoading] = useState(false);
  const [fetchingData, setFetchingData] = useState(false);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [suppliers, setSuppliers] = useState<(Supplier & { debt: number })[]>([]);

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

  // Success Step Screen State
  const [completedResult, setCompletedResult] = useState<CompletedTransactionResult | null>(null);
  const [whatsappSent, setWhatsappSent] = useState<{ customer: boolean; supplier: boolean }>({
    customer: false,
    supplier: false,
  });

  const selectedSupplier = suppliers.find((s) => s.id === selectedSupplierId);
  const selectedSupplierDebt = selectedSupplier?.debt || 0;

  // Load customers & suppliers with debt
  useEffect(() => {
    if (isOpen) {
      setCompletedResult(null);
      setWhatsappSent({ customer: false, supplier: false });
      setNotes('');
      setAmount('');

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
            .select('*')
            .eq('active', true)
            .is('deleted_at', null)
            .order('company_name');

          if (sData && sData.length > 0) {
            const listWithDebt = await Promise.all(
              sData.map(async (sup) => {
                const { data: ledgerData } = await supabase
                  .from('supplier_ledger')
                  .select('balance, credit, debit, movement_type')
                  .eq('supplier_id', sup.id)
                  .is('deleted_at', null)
                  .order('created_at', { ascending: false });

                let credPurch = 0;
                let totDeb = 0;
                ledgerData?.forEach((row) => {
                  if (row.movement_type === 'PURCHASE' || row.movement_type === 'ADJUSTMENT') {
                    credPurch += Number(row.credit || 0);
                  } else {
                    totDeb += Number(row.debit || 0);
                  }
                });

                const latestBal = Number(ledgerData?.[0]?.balance || 0);
                const debt = latestBal > 0 ? latestBal : Math.max(0, credPurch - totDeb);
                return { ...sup, debt };
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

          // 1. Current Balance from Customer Ledger (net debit - credit)
          const { data: ledgerRows } = await supabase
            .from('customer_ledger')
            .select('debit, credit, balance')
            .eq('customer_id', selectedCustomerId)
            .is('deleted_at', null)
            .order('created_at', { ascending: false });

          let cDeb = 0;
          let cCred = 0;
          ledgerRows?.forEach((r) => {
            cDeb += Number(r.debit || 0);
            cCred += Number(r.credit || 0);
          });

          const latestBal = Number(ledgerRows?.[0]?.balance || 0);
          const calcNetDebt = cDeb - cCred;

          // 2. Schedules metrics
          const { data: schedData } = await supabase
            .from('payment_schedules')
            .select('remaining_amount, due_date, status')
            .eq('customer_id', selectedCustomerId)
            .in('status', ['pending', 'partially_paid', 'overdue'])
            .is('deleted_at', null);

          let dueW = 0;
          let ovD = 0;
          let schedSum = 0;
          schedData?.forEach((s) => {
            const rem = Number(s.remaining_amount || 0);
            schedSum += rem;
            if (s.due_date < todayStr || s.status === 'overdue') {
              ovD += rem;
            } else if (s.due_date >= todayStr && s.due_date <= nextWeekStr) {
              dueW += rem;
            }
          });

          // Accurate customer debt: latest balance if > 0, else max of net ledger balance or active schedules sum
          const totDebt = latestBal > 0 ? latestBal : Math.max(0, calcNetDebt, schedSum);

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

  const selectedCustomer = customers.find((c) => c.id === selectedCustomerId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedCustomerId || !selectedCustomer) {
      showError('Lütfen bir müşteri seçin.');
      return;
    }

    const payAmt = Number(amount);
    if (isNaN(payAmt) || payAmt <= 0) {
      showError('Lütfen geçerli bir tutar girin.');
      return;
    }

    if (paymentMethod === 'Tedarikçiye Mahsup') {
      if (!selectedSupplierId || !selectedSupplier) {
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
          const errMsg = parseErrorMessage(error);
          if (errMsg.includes('fazla olamaz') && payAmt <= debtSummary.totalDebt && payAmt <= selectedSupplierDebt) {
            const { data: userData } = await supabase.auth.getUser();
            const userId = userData.user?.id;

            if (userId) {
              const newCustBal = Math.max(0, debtSummary.totalDebt - payAmt);
              const newSupBal = Math.max(0, selectedSupplierDebt - payAmt);

              // 1. Insert payment record
              const { data: payRec, error: payErr } = await supabase.from('payments').insert({
                owner_id: userId,
                customer_id: selectedCustomerId,
                supplier_id: selectedSupplierId,
                amount: payAmt,
                payment_method: 'Tedarikçiye Mahsup',
                payment_type: 'CUSTOMER_PAYMENT',
                payment_date: new Date().toISOString().split('T')[0],
                notes: notes || null,
              }).select('id').single();

              if (!payErr && payRec) {
                // 2. Insert customer_ledger
                await supabase.from('customer_ledger').insert({
                  owner_id: userId,
                  customer_id: selectedCustomerId,
                  payment_id: payRec.id,
                  movement_type: 'ÖDEME',
                  description: `Tedarikçiye Mahsup (${selectedSupplier?.company_name})`,
                  debit: 0.00,
                  credit: payAmt,
                  balance: newCustBal,
                });

                // 3. Insert supplier_ledger
                await supabase.from('supplier_ledger').insert({
                  owner_id: userId,
                  supplier_id: selectedSupplierId,
                  movement_type: 'OFFSET',
                  description: `Müşteriden Mahsup (${selectedCustomer.business_name})`,
                  debit: payAmt,
                  credit: 0.00,
                  balance: newSupBal,
                  reference_id: payRec.id,
                });

                // Recalculate balances in background
                try { await supabase.rpc('recalculate_all_customer_ledger_balances'); } catch (e) {}
                try { await supabase.rpc('recalculate_all_supplier_ledger_balances'); } catch (e) {}

                showSuccess(`Tedarikçi Mahsubu kaydedildi!`);
                if (onSuccess) onSuccess();

                setCompletedResult({
                  type: 'OFFSET',
                  customerId: selectedCustomer.id,
                  customerName: selectedCustomer.business_name,
                  customerPhone: selectedCustomer.phone,
                  supplierId: selectedSupplier?.id,
                  supplierName: selectedSupplier?.company_name,
                  supplierPhone: selectedSupplier?.phone,
                  amount: payAmt,
                  prevCustDebt: debtSummary.totalDebt,
                  newCustDebt: newCustBal,
                  prevSupDebt: selectedSupplierDebt,
                  newSupDebt: newSupBal,
                  paymentId: payRec.id,
                });
                return;
              }
            }
          }

          showError(errMsg);
          setLoading(false);
          return;
        }

        const newCustBal = data?.new_customer_balance !== undefined ? Number(data.new_customer_balance) : Math.max(0, debtSummary.totalDebt - payAmt);
        const newSupBal = data?.new_supplier_balance !== undefined ? Number(data.new_supplier_balance) : Math.max(0, selectedSupplierDebt - payAmt);

        showSuccess(`Tedarikçi Mahsubu kaydedildi!`);
        if (onSuccess) onSuccess();

        setCompletedResult({
          type: 'OFFSET',
          customerId: selectedCustomer.id,
          customerName: selectedCustomer.business_name,
          customerPhone: selectedCustomer.phone,
          supplierId: selectedSupplier?.id,
          supplierName: selectedSupplier?.company_name,
          supplierPhone: selectedSupplier?.phone,
          amount: payAmt,
          prevCustDebt: debtSummary.totalDebt,
          newCustDebt: newCustBal,
          prevSupDebt: selectedSupplierDebt,
          newSupDebt: newSupBal,
          paymentId: data?.payment_id,
        });
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

        const newBal = data?.new_balance !== undefined ? Number(data.new_balance) : Math.max(0, debtSummary.totalDebt - payAmt);

        showSuccess(`Tahsilat başarıyla kaydedildi!`);
        if (onSuccess) onSuccess();

        setCompletedResult({
          type: 'COLLECTION',
          customerId: selectedCustomer.id,
          customerName: selectedCustomer.business_name,
          customerPhone: selectedCustomer.phone,
          amount: payAmt,
          prevCustDebt: debtSummary.totalDebt,
          newCustDebt: newBal,
          paymentId: data?.payment_id,
        });
      }
    } catch (err) {
      showError(parseErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  // WhatsApp Sending Handlers
  const handleSendCustomerWhatsApp = async () => {
    if (!completedResult) return;
    const phoneNorm = normalizeTurkishPhone(completedResult.customerPhone);
    if (!phoneNorm.isValid) {
      showError('Bu müşterinin kayıtlı geçerli bir WhatsApp telefonu bulunmuyor.');
      return;
    }

    try {
      const bizName = await getBusinessName();
      const text =
        completedResult.type === 'OFFSET'
          ? buildCustomerOffsetWhatsAppMessage(
              completedResult.customerName,
              bizName,
              completedResult.amount,
              completedResult.newCustDebt
            )
          : buildCustomerCollectionWhatsAppMessage(
              completedResult.customerName,
              bizName,
              completedResult.amount,
              completedResult.newCustDebt
            );

      openWhatsAppWeb(completedResult.customerPhone!, text);

      if (completedResult.paymentId) {
        logWhatsAppShareAttempt('payments', completedResult.paymentId, phoneNorm.normalized, {
          target: 'customer',
          customer_name: completedResult.customerName,
          amount: completedResult.amount,
        });
      }

      setWhatsappSent((prev) => ({ ...prev, customer: true }));
      showSuccess('Müşteri için WhatsApp mesajı hazırlandı ve açıldı.');
    } catch (err) {
      showError(parseErrorMessage(err));
    }
  };

  const handleSendSupplierWhatsApp = async () => {
    if (!completedResult || !completedResult.supplierName) return;
    const phoneNorm = normalizeTurkishPhone(completedResult.supplierPhone);
    if (!phoneNorm.isValid) {
      showError('Bu tedarikçinin kayıtlı geçerli bir WhatsApp telefonu bulunmuyor.');
      return;
    }

    try {
      const text = buildSupplierOffsetWhatsAppMessage(
        completedResult.supplierName,
        completedResult.amount,
        completedResult.newSupDebt || 0
      );

      openWhatsAppWeb(completedResult.supplierPhone!, text);

      if (completedResult.paymentId) {
        logWhatsAppShareAttempt('offset', completedResult.paymentId, phoneNorm.normalized, {
          target: 'supplier',
          supplier_name: completedResult.supplierName,
          amount: completedResult.amount,
        });
      }

      setWhatsappSent((prev) => ({ ...prev, supplier: true }));
      showSuccess('Tedarikçi için WhatsApp mesajı hazırlandı ve açıldı.');
    } catch (err) {
      showError(parseErrorMessage(err));
    }
  };

  const handleSendBothWhatsApp = async () => {
    let customerOk = false;
    let supplierOk = false;

    if (completedResult?.customerPhone && normalizeTurkishPhone(completedResult.customerPhone).isValid) {
      await handleSendCustomerWhatsApp();
      customerOk = true;
    } else {
      showError('Müşterinin geçerli bir WhatsApp numarası bulunmuyor.');
    }

    setTimeout(async () => {
      if (completedResult?.supplierPhone && normalizeTurkishPhone(completedResult.supplierPhone).isValid) {
        await handleSendSupplierWhatsApp();
        supplierOk = true;
      } else {
        showError('Tedarikçinin geçerli bir WhatsApp numarası bulunmuyor.');
      }
    }, 1200);
  };

  const handleFinishAndClose = () => {
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md" onClick={completedResult ? handleFinishAndClose : onClose} />

      {/* Modal Card */}
      <div className="relative bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg shadow-2xl z-10 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between bg-slate-900">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-600/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <Receipt className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-white">
                {completedResult ? 'İşlem Başarıyla Kaydedildi' : 'Tahsilat / Mahsup Gir'}
              </h2>
              <p className="text-xs text-slate-400">
                {completedResult
                  ? 'Finansal işlem veritabanına işlendi. İsterseniz WhatsApp bildirimi gönderebilirsiniz.'
                  : 'Nakit, Havale veya Tedarikçiye Mahsuplu ödeme girin.'}
              </p>
            </div>
          </div>
          <button
            onClick={completedResult ? handleFinishAndClose : onClose}
            className="p-2 text-slate-400 hover:text-white rounded-lg bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* STEP 2: POST-TRANSACTION WHATSAPP & SUCCESS SCREEN */}
        {completedResult ? (
          <div className="p-5 sm:p-6 space-y-5 overflow-y-auto custom-scrollbar">
            {/* Green Check Banner */}
            <div className="bg-emerald-950/40 border border-emerald-800/80 p-4 rounded-2xl flex items-center gap-3 text-emerald-300">
              <CheckCircle2 className="w-8 h-8 shrink-0 text-emerald-400" />
              <div>
                <h4 className="font-extrabold text-sm text-white">
                  {completedResult.type === 'OFFSET' ? '✓ Tedarikçi Mahsubu Tamamlandı' : '✓ Tahsilat İşlemi Kaydedildi'}
                </h4>
                <p className="text-xs text-emerald-300/90 mt-0.5">
                  Finansal bakiye güncellemesi veritabanında başarıyla gerçekleştirildi.
                </p>
              </div>
            </div>

            {/* Financial Balances Summary Box */}
            <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-3 text-xs">
              {/* Customer Debt Info */}
              <div className="flex items-center justify-between border-b border-slate-800/80 pb-2.5">
                <div>
                  <span className="text-slate-400 block font-medium">Müşteri</span>
                  <span className="font-bold text-white text-sm">{completedResult.customerName}</span>
                </div>
                <div className="text-right">
                  <span className="text-slate-400 block font-medium">Güncel Borç</span>
                  <div className="flex items-center gap-1.5 justify-end mt-0.5">
                    <span className="line-through text-slate-500">{formatCurrency(completedResult.prevCustDebt)}</span>
                    <span className="text-slate-400">→</span>
                    <span className="font-extrabold text-amber-400 text-sm">
                      {formatCurrency(completedResult.newCustDebt)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Supplier Debt Info (if Offset) */}
              {completedResult.type === 'OFFSET' && completedResult.supplierName && (
                <div className="flex items-center justify-between pt-1">
                  <div>
                    <span className="text-slate-400 block font-medium">Mahsup Edilen Tedarikçi</span>
                    <span className="font-bold text-white text-sm">{completedResult.supplierName}</span>
                  </div>
                  <div className="text-right">
                    <span className="text-slate-400 block font-medium">Tedarikçi Güncel Borcumuz</span>
                    <div className="flex items-center gap-1.5 justify-end mt-0.5">
                      <span className="line-through text-slate-500">
                        {formatCurrency(completedResult.prevSupDebt || 0)}
                      </span>
                      <span className="text-slate-400">→</span>
                      <span className="font-extrabold text-emerald-400 text-sm">
                        {formatCurrency(completedResult.newSupDebt || 0)}
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Phone warnings if missing */}
            {completedResult.type === 'COLLECTION' && !normalizeTurkishPhone(completedResult.customerPhone).isValid && (
              <div className="bg-slate-950 p-3 rounded-xl border border-amber-800/50 flex items-center gap-2 text-xs text-amber-300">
                <PhoneOff className="w-4 h-4 text-amber-400 shrink-0" />
                <span>Müşterinin sistemde kayıtlı geçerli bir WhatsApp telefonu bulunmuyor.</span>
              </div>
            )}

            {/* WHATSAPP ACTION BUTTONS */}
            <div className="space-y-2.5 pt-2">
              {completedResult.type === 'COLLECTION' ? (
                /* SINGLE CUSTOMER COLLECTION WHATSAPP BUTTON */
                <button
                  onClick={handleSendCustomerWhatsApp}
                  disabled={!normalizeTurkishPhone(completedResult.customerPhone).isValid}
                  className={`w-full py-3 px-4 rounded-xl font-bold text-xs sm:text-sm flex items-center justify-center gap-2.5 transition-all shadow-lg active:scale-95 ${
                    !normalizeTurkishPhone(completedResult.customerPhone).isValid
                      ? 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700'
                      : whatsappSent.customer
                      ? 'bg-emerald-950 text-emerald-300 border border-emerald-600 hover:bg-emerald-900'
                      : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-600/25'
                  }`}
                >
                  <MessageSquare className="w-4.5 h-4.5" />
                  <span>
                    {whatsappSent.customer
                      ? '✓ WhatsApp Gönderildi (Tekrar Gönder)'
                      : '📱 WhatsApp\'tan Müşteriyi Bilgilendir'}
                  </span>
                </button>
              ) : (
                /* OFFSET 3 WHATSAPP BUTTONS */
                <div className="space-y-2">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {/* Customer WA button */}
                    <button
                      onClick={handleSendCustomerWhatsApp}
                      disabled={!normalizeTurkishPhone(completedResult.customerPhone).isValid}
                      className={`py-2.5 px-3 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition-all ${
                        !normalizeTurkishPhone(completedResult.customerPhone).isValid
                          ? 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700'
                          : whatsappSent.customer
                          ? 'bg-emerald-950 text-emerald-300 border border-emerald-600'
                          : 'bg-emerald-600 hover:bg-emerald-500 text-white'
                      }`}
                    >
                      <MessageSquare className="w-4 h-4" />
                      <span>{whatsappSent.customer ? 'Müşteri (Gönderildi ✓)' : '📱 Müşteriye Gönder'}</span>
                    </button>

                    {/* Supplier WA button */}
                    <button
                      onClick={handleSendSupplierWhatsApp}
                      disabled={!normalizeTurkishPhone(completedResult.supplierPhone).isValid}
                      className={`py-2.5 px-3 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition-all ${
                        !normalizeTurkishPhone(completedResult.supplierPhone).isValid
                          ? 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700'
                          : whatsappSent.supplier
                          ? 'bg-emerald-950 text-emerald-300 border border-emerald-600'
                          : 'bg-indigo-600 hover:bg-indigo-500 text-white'
                      }`}
                    >
                      <MessageSquare className="w-4 h-4" />
                      <span>{whatsappSent.supplier ? 'Tedarikçi (Gönderildi ✓)' : '📱 Tedarikçiye Gönder'}</span>
                    </button>
                  </div>

                  {/* Both sides WA button */}
                  <button
                    onClick={handleSendBothWhatsApp}
                    className="w-full py-2.5 px-4 rounded-xl font-bold text-xs bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700 flex items-center justify-center gap-2 transition-all active:scale-95"
                  >
                    <Send className="w-4 h-4 text-emerald-400" />
                    <span>📱 İki Tarafa da WhatsApp Gönder</span>
                  </button>
                </div>
              )}

              {/* Close Button */}
              <button
                onClick={handleFinishAndClose}
                className="w-full py-2.5 px-4 rounded-xl font-bold text-xs bg-slate-950 text-slate-300 hover:text-white border border-slate-800 hover:bg-slate-800 transition-colors"
              >
                Tamam / Kapat
              </button>
            </div>
          </div>
        ) : fetchingData ? (
          /* STEP 1: LOADING DATA */
          <div className="p-8 text-center text-slate-400 flex flex-col items-center">
            <Loader2 className="w-8 h-8 animate-spin text-emerald-500 mb-2" />
            <span>Veriler Yükleniyor...</span>
          </div>
        ) : (
          /* STEP 1: TRANSACTION FORM */
          <form onSubmit={handleSubmit} className="p-4 sm:p-6 space-y-5 overflow-y-auto custom-scrollbar">
            {/* Customer Select */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                Müşteri Seçin *
              </label>
              <SearchableSelect
                options={customers.map((c) => ({
                  id: c.id,
                  label: c.business_name,
                  sublabel: c.contact_name || undefined,
                  searchText: `${c.phone || ''} ${c.tax_number || ''}`,
                }))}
                value={selectedCustomerId}
                onChange={(val) => setSelectedCustomerId(val)}
                placeholder="Müşteri adı veya tel no yazın..."
                searchPlaceholder="Müşteri ara..."
                emptyMessage="Eşleşen müşteri bulunamadı."
              />
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
              </div>
            )}

            {/* Payment Method Tabs */}
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
                    className={`py-2 px-3 rounded-xl font-bold text-xs border transition-all ${
                      paymentMethod === method
                        ? method === 'Tedarikçiye Mahsup'
                          ? 'bg-purple-950 border-purple-500 text-purple-300'
                          : 'bg-emerald-950 border-emerald-500 text-emerald-300'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    {method}
                  </button>
                ))}
              </div>
            </div>

            {/* IF TEDARİKÇİYE MAHSUP SELECTED */}
            {paymentMethod === 'Tedarikçiye Mahsup' && (
              <div className="bg-purple-950/30 border border-purple-800/60 p-4 rounded-2xl space-y-4">
                <div className="flex items-center gap-2 text-purple-300 font-bold text-xs uppercase tracking-wider">
                  <ArrowRightLeft className="w-4 h-4 text-purple-400" />
                  <span>Mahsup Edilecek Tedarikçi Seçimi</span>
                </div>

                <div>
                  <SearchableSelect
                    options={suppliers.map((s) => ({
                      id: s.id,
                      label: s.company_name,
                      sublabel: `Mevcut Borcumuz: ${formatCurrency(s.debt)}`,
                    }))}
                    value={selectedSupplierId}
                    onChange={(val) => setSelectedSupplierId(val)}
                    placeholder="Tedarikçi firma seçin..."
                    searchPlaceholder="Tedarikçi ara..."
                    emptyMessage="Tedarikçi bulunamadı."
                  />
                </div>

                {selectedSupplierId && (
                  <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 flex items-center justify-between text-xs">
                    <span className="text-slate-400">Seçilen Tedarikçiye Borcumuz:</span>
                    <span className="font-extrabold text-emerald-400 text-sm">
                      {formatCurrency(selectedSupplierDebt)}
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* Amount & Notes Input */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                  Tahsilat / Mahsup Tutarı (TL) *
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value === '' ? '' : Number(e.target.value))}
                  placeholder="0.00"
                  className="w-full bg-slate-950 border border-slate-700 focus:border-emerald-500 rounded-xl p-3 text-white text-base font-extrabold outline-none"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                  Açıklama / Not
                </label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Dekont no veya not ekleyin..."
                  className="w-full bg-slate-950 border border-slate-700 focus:border-emerald-500 rounded-xl p-3 text-slate-200 text-xs outline-none"
                />
              </div>
            </div>

            {/* Submit Button */}
            <div className="pt-2">
              <button
                type="submit"
                disabled={loading}
                className="w-full py-3.5 px-4 rounded-xl font-bold text-sm bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-white shadow-lg shadow-emerald-500/25 flex items-center justify-center gap-2 transition-all active:scale-98 disabled:opacity-50"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Kaydediliyor...</span>
                  </>
                ) : (
                  <span>
                    {paymentMethod === 'Tedarikçiye Mahsup' ? 'Tedarikçi Mahsubunu Onayla & İşle' : 'Tahsilatı İşle & Kaydet'}
                  </span>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
