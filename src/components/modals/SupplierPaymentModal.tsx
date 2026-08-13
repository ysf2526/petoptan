import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/context/ToastContext';
import { parseErrorMessage } from '@/utils/errors';
import { formatCurrency } from '@/utils/formatters';
import { Supplier } from '@/types/database.types';
import { SearchableSelect } from '@/components/common/SearchableSelect';
import {
  X,
  DollarSign,
  Loader2,
  CheckCircle2,
  Building2,
  AlertTriangle,
  Banknote,
  Building,
  CreditCard,
  HelpCircle,
  Calendar,
  FileText,
  Hash,
} from 'lucide-react';

interface SupplierPaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultSupplierId?: string | null;
  onSuccess?: () => void;
}

type PaymentMethodType = 'Nakit' | 'Havale/EFT' | 'Kart' | 'Diğer';

export const SupplierPaymentModal: React.FC<SupplierPaymentModalProps> = ({
  isOpen,
  onClose,
  defaultSupplierId,
  onSuccess,
}) => {
  const { showSuccess, showError } = useToast();

  const [loading, setLoading] = useState(false);
  const [fetchingSuppliers, setFetchingSuppliers] = useState(false);

  const [suppliers, setSuppliers] = useState<(Supplier & { balance: number })[]>([]);
  const [selectedSupplierId, setSelectedSupplierId] = useState<string>('');
  const [amount, setAmount] = useState<number | ''>('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethodType>('Nakit');
  const [paymentDate, setPaymentDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [referenceNumber, setReferenceNumber] = useState<string>('');
  const [notes, setNotes] = useState<string>('');

  const [showConfirmation, setShowConfirmation] = useState(false);

  const loadSuppliersData = async () => {
    setFetchingSuppliers(true);
    try {
      const { data: supData, error } = await supabase
        .from('suppliers')
        .select('*')
        .eq('active', true)
        .is('deleted_at', null)
        .order('company_name');

      if (error) throw error;

      if (supData && supData.length > 0) {
        const enriched = await Promise.all(
          supData.map(async (sup) => {
            const { data: lData } = await supabase
              .from('supplier_ledger')
              .select('balance, credit, debit, movement_type')
              .eq('supplier_id', sup.id)
              .is('deleted_at', null)
              .order('created_at', { ascending: false });

            let credPurch = 0;
            let totDeb = 0;
            lData?.forEach((row) => {
              if (row.movement_type === 'PURCHASE' || row.movement_type === 'ADJUSTMENT') {
                credPurch += Number(row.credit || 0);
              } else {
                totDeb += Number(row.debit || 0);
              }
            });

            const latestBal = Number(lData?.[0]?.balance || 0);
            const bal = latestBal > 0 ? latestBal : Math.max(0, credPurch - totDeb);

            return {
              ...sup,
              balance: bal,
            };
          })
        );

        setSuppliers(enriched);

        if (defaultSupplierId) {
          setSelectedSupplierId(defaultSupplierId);
        } else if (enriched.length > 0) {
          setSelectedSupplierId(enriched[0].id);
        }
      } else {
        setSuppliers([]);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setFetchingSuppliers(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      setAmount('');
      setReferenceNumber('');
      setNotes('');
      setShowConfirmation(false);
      setPaymentDate(new Date().toISOString().split('T')[0]);
      loadSuppliersData();
    }
  }, [isOpen, defaultSupplierId]);

  if (!isOpen) return null;

  const selectedSupplier = suppliers.find((s) => s.id === selectedSupplierId);
  const currentDebt = selectedSupplier?.balance || 0;
  const numAmount = Number(amount) || 0;
  const isOverpaying = numAmount > currentDebt;
  const remainingDebtAfterPayment = Math.max(0, currentDebt - numAmount);

  const handlePrepareSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedSupplierId) {
      showError('Lütfen bir tedarikçi firma seçin.');
      return;
    }

    if (numAmount <= 0) {
      showError('Lütfen geçerli bir ödeme tutarı girin.');
      return;
    }

    if (isOverpaying) {
      showError(`Ödeme tutarı (${formatCurrency(numAmount)}) mevcut tedarikçi borcundan (${formatCurrency(currentDebt)}) fazla olamaz.`);
      return;
    }

    setShowConfirmation(true);
  };

  const handleConfirmPayment = async () => {
    setLoading(true);

    try {
      const { data, error } = await supabase.rpc('process_supplier_payment_transaction', {
        p_supplier_id: selectedSupplierId,
        p_amount: numAmount,
        p_payment_method: paymentMethod,
        p_notes: notes.trim() || null,
        p_reference_number: referenceNumber.trim() || null,
        p_payment_date: paymentDate,
      });

      if (error) {
        showError(parseErrorMessage(error));
        setLoading(false);
        return;
      }

      if (data && data.success) {
        showSuccess(
          `"${selectedSupplier?.company_name}" firmasına ${formatCurrency(numAmount)} tutarında ödeme işlendi! Güncel borç: ${formatCurrency(data.new_balance)}`
        );
        setShowConfirmation(false);
        onClose();
        if (onSuccess) onSuccess();
      } else {
        showError('Tedarikçi ödemesi gerçekleştirilemedi.');
      }
    } catch (err) {
      showError(parseErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4">
      <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md" onClick={onClose} />

      <div className="relative bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg shadow-2xl z-10 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between bg-slate-900">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-600/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <DollarSign className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-white">Tedarikçiye Ödeme Yap</h2>
              <p className="text-xs text-slate-400">Elden, banka veya kart ödemesini işleyip borçtan düşün.</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-white rounded-lg bg-slate-800">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        {fetchingSuppliers ? (
          <div className="p-8 text-center text-slate-400 flex flex-col items-center">
            <Loader2 className="w-8 h-8 animate-spin text-emerald-500 mb-2" />
            <span>Tedarikçi Bilgileri Yükleniyor...</span>
          </div>
        ) : showConfirmation ? (
          /* STEP 2: CONFIRMATION OVERLAY */
          <div className="p-5 space-y-5 overflow-y-auto custom-scrollbar">
            <div className="bg-slate-950 p-4 rounded-xl border border-emerald-500/40 space-y-3">
              <div className="flex items-center gap-2 text-emerald-400 text-xs font-bold uppercase tracking-wider">
                <AlertTriangle className="w-4 h-4" />
                <span>Ödeme İşlem Onayı Özeti</span>
              </div>

              <div className="space-y-2 text-xs divide-y divide-slate-800/80">
                <div className="flex justify-between pt-1">
                  <span className="text-slate-400">Tedarikçi Firma:</span>
                  <span className="font-bold text-white">{selectedSupplier?.company_name}</span>
                </div>

                <div className="flex justify-between pt-2">
                  <span className="text-slate-400 font-semibold">Mevcut Borç:</span>
                  <span className="font-bold text-amber-400">{formatCurrency(currentDebt)}</span>
                </div>

                <div className="flex justify-between pt-2">
                  <span className="text-slate-400 font-semibold">Yapılacak Ödeme Tutarı:</span>
                  <span className="font-black text-emerald-400 text-sm">-{formatCurrency(numAmount)}</span>
                </div>

                <div className="flex justify-between pt-2">
                  <span className="text-slate-400">Ödeme Yöntemi:</span>
                  <span className="font-bold text-slate-200">{paymentMethod}</span>
                </div>

                {referenceNumber && (
                  <div className="flex justify-between pt-2">
                    <span className="text-slate-400">Referans / Dekont No:</span>
                    <span className="font-mono text-slate-300">{referenceNumber}</span>
                  </div>
                )}

                <div className="flex justify-between pt-3 text-sm">
                  <span className="text-slate-200 font-extrabold">Ödeme Sonrası Kalan Borç:</span>
                  <span className="font-black text-white">{formatCurrency(remainingDebtAfterPayment)}</span>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowConfirmation(false)}
                className="py-2.5 px-4 rounded-xl border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs transition-colors"
              >
                Vazgeç / Düzenle
              </button>

              <button
                type="button"
                onClick={handleConfirmPayment}
                disabled={loading}
                className="py-2.5 px-6 rounded-xl bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-white font-bold text-xs shadow-lg shadow-emerald-500/25 flex items-center gap-2 transition-all disabled:opacity-50 active:scale-98"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Ödeme İşleniyor...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Ödemeyi Onayla & Düş</span>
                  </>
                )}
              </button>
            </div>
          </div>
        ) : (
          /* STEP 1: PAYMENT FORM */
          <form onSubmit={handlePrepareSubmit} className="p-4 sm:p-6 space-y-4 overflow-y-auto custom-scrollbar">
            {/* Supplier Dropdown */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                <Building2 className="w-4 h-4 text-emerald-400" />
                <span>Ödeme Yapılacak Tedarikçi Firma *</span>
              </label>
              <SearchableSelect
                options={suppliers.map((s) => ({
                  id: s.id,
                  label: s.company_name,
                  sublabel: `Borç: ${formatCurrency(s.balance)}`,
                  searchText: `${s.contact_person || ''} ${s.phone || ''}`,
                }))}
                value={selectedSupplierId}
                onChange={(val) => setSelectedSupplierId(val)}
                placeholder="Tedarikçi adı veya tel no yazarak arayın..."
                searchPlaceholder="Tedarikçi ara..."
                emptyMessage="Eşleşen tedarikçi bulunamadı."
              />
            </div>

            {/* Current Debt Banner */}
            {selectedSupplier && (
              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 flex items-center justify-between">
                <div>
                  <span className="text-slate-400 text-xs font-semibold block">Tedarikçi Güncel Borcu</span>
                  <span className="text-xl font-black text-amber-400">{formatCurrency(currentDebt)}</span>
                </div>
                <div className="text-right">
                  <span className="text-slate-400 text-[11px] block">Ödeme Sonrası Borç</span>
                  <span className="text-sm font-extrabold text-slate-200">
                    {formatCurrency(remainingDebtAfterPayment)}
                  </span>
                </div>
              </div>
            )}

            {/* Payment Amount */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                Ödeme Tutarı (TL) *
              </label>
              <input
                type="number"
                step="0.01"
                min={0.01}
                max={currentDebt}
                required
                value={amount}
                onChange={(e) => setAmount(e.target.value === '' ? '' : Number(e.target.value))}
                placeholder="Örn: 10000.00"
                className={`w-full bg-slate-950 border rounded-xl p-3 text-white text-base font-extrabold outline-none ${
                  isOverpaying ? 'border-rose-500 text-rose-400' : 'border-slate-700 focus:border-emerald-500'
                }`}
              />

              {isOverpaying && (
                <p className="text-xs text-rose-400 font-semibold mt-1.5 flex items-center gap-1">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  <span>Ödeme tutarı mevcut borçtan ({formatCurrency(currentDebt)}) fazla olamaz!</span>
                </p>
              )}
            </div>

            {/* Payment Method Cards */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                Ödeme Yöntemi *
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {[
                  { id: 'Nakit', label: 'Elden / Nakit', icon: Banknote },
                  { id: 'Havale/EFT', label: 'Banka / EFT', icon: Building },
                  { id: 'Kart', label: 'Kredi Kartı', icon: CreditCard },
                  { id: 'Diğer', label: 'Diğer', icon: HelpCircle },
                ].map((m) => {
                  const Icon = m.icon;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setPaymentMethod(m.id as PaymentMethodType)}
                      className={`p-2.5 rounded-xl border flex flex-col items-center justify-center gap-1 text-center transition-all ${
                        paymentMethod === m.id
                          ? 'bg-emerald-950/80 border-emerald-500 text-emerald-300 shadow-inner ring-2 ring-emerald-500/30 font-bold'
                          : 'bg-slate-950 border-slate-700 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                      <span className="text-[11px] leading-tight">{m.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Payment Date & Reference Number Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5 text-slate-400" />
                  <span>Ödeme Tarihi *</span>
                </label>
                <input
                  type="date"
                  required
                  value={paymentDate}
                  onChange={(e) => setPaymentDate(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 focus:border-emerald-500 rounded-xl p-2.5 text-slate-100 text-xs outline-none font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                  <Hash className="w-3.5 h-3.5 text-slate-400" />
                  <span>Referans / Dekont No</span>
                </label>
                <input
                  type="text"
                  value={referenceNumber}
                  onChange={(e) => setReferenceNumber(e.target.value)}
                  placeholder="Örn: DEK-98124"
                  className="w-full bg-slate-950 border border-slate-700 focus:border-emerald-500 rounded-xl p-2.5 text-slate-100 text-xs outline-none"
                />
              </div>
            </div>

            {/* Notes */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                <FileText className="w-3.5 h-3.5 text-slate-400" />
                <span>Açıklama / Not</span>
              </label>
              <textarea
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Örn: Temmuz ayı vadeli fatura ödemesi"
                className="w-full bg-slate-950 border border-slate-700 focus:border-emerald-500 rounded-xl p-2.5 text-slate-100 text-xs outline-none"
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
                disabled={isOverpaying || !amount || numAmount <= 0}
                className="py-2.5 px-6 rounded-xl bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-white font-bold text-xs shadow-lg shadow-emerald-500/25 flex items-center gap-2 transition-all disabled:opacity-50 active:scale-98"
              >
                <span>Ödemeyi Kaydet</span>
                <CheckCircle2 className="w-4 h-4" />
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
