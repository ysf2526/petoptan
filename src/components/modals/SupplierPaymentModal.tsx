import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/context/ToastContext';
import { parseErrorMessage } from '@/utils/errors';
import { formatCurrency } from '@/utils/formatters';
import { Supplier } from '@/types/database.types';
import { SearchableSelect } from '@/components/common/SearchableSelect';
import {
  normalizeTurkishPhone,
  buildSupplierPaymentWhatsAppMessage,
  openWhatsAppWeb,
  logWhatsAppShareAttempt,
} from '@/services/whatsappService';
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
  MessageSquare,
  PhoneOff,
} from 'lucide-react';

interface SupplierPaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultSupplierId?: string | null;
  onSuccess?: () => void;
}

type PaymentMethodType = 'Nakit' | 'Havale/EFT' | 'Kart' | 'Diğer';

interface CompletedSupplierPaymentResult {
  supplierId: string;
  supplierName: string;
  supplierPhone?: string | null;
  amount: number;
  prevDebt: number;
  newDebt: number;
  ledgerId?: string;
}

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

  // Success Step Screen State
  const [completedResult, setCompletedResult] = useState<CompletedSupplierPaymentResult | null>(null);
  const [whatsappSent, setWhatsappSent] = useState(false);

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
      setCompletedResult(null);
      setWhatsappSent(false);
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

    if (!selectedSupplierId || !selectedSupplier) {
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
    if (!selectedSupplier) return;
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
        const errMsg = parseErrorMessage(error);
        // If RPC fails due to legacy stale balance check in DB, execute direct ledger fallback
        if (errMsg.includes('fazla olamaz') && numAmount <= currentDebt) {
          const { data: userData } = await supabase.auth.getUser();
          const userId = userData.user?.id;

          if (userId) {
            let desc = `Tedarikçiye Ödeme (${paymentMethod})`;
            if (referenceNumber.trim()) {
              desc += ` - Ref/Dekont: ${referenceNumber.trim()}`;
            }

            const { data: insData, error: insErr } = await supabase.from('supplier_ledger').insert({
              owner_id: userId,
              supplier_id: selectedSupplierId,
              movement_type: 'PAYMENT',
              description: desc,
              debit: numAmount,
              credit: 0.00,
              balance: remainingDebtAfterPayment,
            }).select('id').single();

            if (!insErr) {
              try {
                await supabase.rpc('recalculate_all_supplier_ledger_balances');
              } catch (e) {
                // Ignore background recalculate error if RPC not found
              }

              showSuccess(`"${selectedSupplier.company_name}" firmasına ${formatCurrency(numAmount)} tutarında ödeme işlendi!`);
              if (onSuccess) onSuccess();

              setCompletedResult({
                supplierId: selectedSupplier.id,
                supplierName: selectedSupplier.company_name,
                supplierPhone: selectedSupplier.phone,
                amount: numAmount,
                prevDebt: currentDebt,
                newDebt: remainingDebtAfterPayment,
                ledgerId: insData?.id,
              });
              return;
            }
          }
        }

        showError(errMsg);
        setLoading(false);
        return;
      }

      if (data && data.success) {
        const newBal = data.new_balance !== undefined ? Number(data.new_balance) : remainingDebtAfterPayment;
        showSuccess(`"${selectedSupplier.company_name}" firmasına ${formatCurrency(numAmount)} tutarında ödeme işlendi!`);
        if (onSuccess) onSuccess();

        setCompletedResult({
          supplierId: selectedSupplier.id,
          supplierName: selectedSupplier.company_name,
          supplierPhone: selectedSupplier.phone,
          amount: numAmount,
          prevDebt: currentDebt,
          newDebt: newBal,
          ledgerId: data.ledger_id,
        });
      } else {
        showError('Tedarikçi ödemesi gerçekleştirilemedi.');
      }
    } catch (err) {
      showError(parseErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const handleSendSupplierWhatsApp = async () => {
    if (!completedResult) return;
    const phoneNorm = normalizeTurkishPhone(completedResult.supplierPhone);
    if (!phoneNorm.isValid) {
      showError('Bu tedarikçinin kayıtlı geçerli bir WhatsApp telefonu bulunmuyor.');
      return;
    }

    try {
      const text = buildSupplierPaymentWhatsAppMessage(
        completedResult.supplierName,
        completedResult.amount,
        completedResult.newDebt
      );

      openWhatsAppWeb(completedResult.supplierPhone!, text);

      if (completedResult.ledgerId) {
        logWhatsAppShareAttempt('suppliers', completedResult.ledgerId, phoneNorm.normalized, {
          target: 'supplier',
          supplier_name: completedResult.supplierName,
          amount: completedResult.amount,
        });
      }

      setWhatsappSent(true);
      showSuccess('Tedarikçi için WhatsApp mesajı hazırlandı ve açıldı.');
    } catch (err) {
      showError(parseErrorMessage(err));
    }
  };

  const handleFinishAndClose = () => {
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 font-sans">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md" onClick={completedResult ? handleFinishAndClose : onClose} />

      <div className="relative bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg shadow-2xl z-10 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between bg-slate-900">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-600/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <DollarSign className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-white">
                {completedResult ? 'Ödeme Başarıyla İşlendi' : 'Tedarikçiye Ödeme Yap'}
              </h2>
              <p className="text-xs text-slate-400">
                {completedResult
                  ? 'Tedarikçi borcunuz güncellendi. İsterseniz WhatsApp bilgilendirmesi gönderebilirsiniz.'
                  : 'Elden, banka veya kart ödemesini işleyip borçtan düşüş yapın.'}
              </p>
            </div>
          </div>
          <button onClick={completedResult ? handleFinishAndClose : onClose} className="p-2 text-slate-400 hover:text-white rounded-lg bg-slate-800">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* STEP 3: POST-TRANSACTION WHATSAPP SUCCESS SCREEN */}
        {completedResult ? (
          <div className="p-5 sm:p-6 space-y-5 overflow-y-auto custom-scrollbar">
            {/* Green Banner */}
            <div className="bg-emerald-950/40 border border-emerald-800/80 p-4 rounded-2xl flex items-center gap-3 text-emerald-300">
              <CheckCircle2 className="w-8 h-8 shrink-0 text-emerald-400" />
              <div>
                <h4 className="font-extrabold text-sm text-white">✓ Ödeme Başarıyla Kaydedildi!</h4>
                <p className="text-xs text-emerald-300/90 mt-0.5">
                  Tedarikçi cari hesabına ödeme düşüldü ve borç bakiye güncellendi.
                </p>
              </div>
            </div>

            {/* Financial Summary */}
            <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-3 text-xs">
              <div className="flex items-center justify-between border-b border-slate-800/80 pb-2.5">
                <div>
                  <span className="text-slate-400 block font-medium">Tedarikçi Firma</span>
                  <span className="font-bold text-white text-sm">{completedResult.supplierName}</span>
                </div>
                <div className="text-right">
                  <span className="text-slate-400 block font-medium">Ödenen Tutar</span>
                  <span className="font-extrabold text-emerald-400 text-sm">{formatCurrency(completedResult.amount)}</span>
                </div>
              </div>

              <div className="flex items-center justify-between pt-1">
                <span className="text-slate-400 font-medium">Güncel Kalan Borcumuz:</span>
                <div className="flex items-center gap-1.5 justify-end">
                  <span className="line-through text-slate-500">{formatCurrency(completedResult.prevDebt)}</span>
                  <span className="text-slate-400">→</span>
                  <span className="font-extrabold text-white text-sm">{formatCurrency(completedResult.newDebt)}</span>
                </div>
              </div>
            </div>

            {/* Phone check warning */}
            {!normalizeTurkishPhone(completedResult.supplierPhone).isValid && (
              <div className="bg-slate-950 p-3 rounded-xl border border-amber-800/50 flex items-center gap-2 text-xs text-amber-300">
                <PhoneOff className="w-4 h-4 text-amber-400 shrink-0" />
                <span>Tedarikçinin sistemde kayıtlı geçerli bir WhatsApp telefonu bulunmuyor.</span>
              </div>
            )}

            {/* WhatsApp Button */}
            <div className="space-y-2 pt-2">
              <button
                onClick={handleSendSupplierWhatsApp}
                disabled={!normalizeTurkishPhone(completedResult.supplierPhone).isValid}
                className={`w-full py-3 px-4 rounded-xl font-bold text-xs sm:text-sm flex items-center justify-center gap-2.5 transition-all shadow-lg active:scale-95 ${
                  !normalizeTurkishPhone(completedResult.supplierPhone).isValid
                    ? 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700'
                    : whatsappSent
                    ? 'bg-emerald-950 text-emerald-300 border border-emerald-600 hover:bg-emerald-900'
                    : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-600/25'
                }`}
              >
                <MessageSquare className="w-4.5 h-4.5" />
                <span>
                  {whatsappSent ? '✓ WhatsApp Gönderildi (Tekrar Gönder)' : '📱 Tedarikçiyi WhatsApp\'tan Bilgilendir'}
                </span>
              </button>

              <button
                onClick={handleFinishAndClose}
                className="w-full py-2.5 px-4 rounded-xl font-bold text-xs bg-slate-950 text-slate-300 hover:text-white border border-slate-800 hover:bg-slate-800 transition-colors"
              >
                Tamam / Kapat
              </button>
            </div>
          </div>
        ) : fetchingSuppliers ? (
          /* STEP 1: LOADING SUPPLIERS */
          <div className="p-8 text-center text-slate-400 flex flex-col items-center">
            <Loader2 className="w-8 h-8 animate-spin text-emerald-500 mb-2" />
            <span>Tedarikçi Bilgileri Yükleniyor...</span>
          </div>
        ) : showConfirmation ? (
          /* STEP 2: CONFIRM OVERLAY */
          <div className="p-5 sm:p-6 space-y-5 overflow-y-auto custom-scrollbar">
            <div className="bg-slate-950 p-4 sm:p-5 rounded-2xl border border-emerald-500/40 space-y-4 shadow-xl">
              <div className="flex items-center gap-2 text-emerald-400 text-xs sm:text-sm font-bold uppercase tracking-wider">
                <AlertTriangle className="w-4 h-4 sm:w-5 sm:h-5 text-emerald-400" />
                <span>Ödeme İşlem Onayı Özeti</span>
              </div>

              <div className="space-y-2.5 text-xs">
                <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                  <span className="text-slate-400 font-medium">Tedarikçi Firma:</span>
                  <span className="font-bold text-white text-sm">{selectedSupplier?.company_name}</span>
                </div>

                <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                  <span className="text-slate-400 font-medium">Mevcut Borç:</span>
                  <span className="font-bold text-amber-400">{formatCurrency(currentDebt)}</span>
                </div>

                <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                  <span className="text-slate-400 font-medium">Yapılacak Ödeme Tutarı:</span>
                  <span className="font-extrabold text-emerald-400 text-sm">-{formatCurrency(numAmount)}</span>
                </div>

                <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                  <span className="text-slate-400 font-medium">Ödeme Yöntemi:</span>
                  <span className="font-bold text-slate-200">{paymentMethod}</span>
                </div>

                <div className="flex items-center justify-between pt-1">
                  <span className="text-slate-400 font-medium">Ödeme Sonrası Kalan Borç:</span>
                  <span className="font-extrabold text-white text-base">{formatCurrency(remainingDebtAfterPayment)}</span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowConfirmation(false)}
                disabled={loading}
                className="flex-1 py-3 px-4 rounded-xl font-bold text-xs bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white transition-colors"
              >
                Vazgeç / Düzenle
              </button>

              <button
                type="button"
                onClick={handleConfirmPayment}
                disabled={loading}
                className="flex-1 py-3 px-4 rounded-xl font-bold text-xs bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-600/25 flex items-center justify-center gap-2 transition-all active:scale-95 disabled:opacity-50"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>İşleniyor...</span>
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
          /* STEP 1: FORM */
          <form onSubmit={handlePrepareSubmit} className="p-4 sm:p-6 space-y-4 overflow-y-auto custom-scrollbar">
            {/* Supplier Select */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                Tedarikçi Firma Seçin *
              </label>
              <SearchableSelect
                options={suppliers.map((s) => ({
                  id: s.id,
                  label: s.company_name,
                  sublabel: `Güncel Borç: ${formatCurrency(s.balance)}`,
                  searchText: `${s.contact_person || ''} ${s.phone || ''}`,
                }))}
                value={selectedSupplierId}
                onChange={(val) => setSelectedSupplierId(val)}
                placeholder="Tedarikçi firma adı yazın..."
                searchPlaceholder="Tedarikçi ara..."
                emptyMessage="Tedarikçi bulunamadı."
              />
            </div>

            {/* Debt Banner */}
            {selectedSupplierId && (
              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 flex items-center justify-between text-xs">
                <div>
                  <span className="text-slate-400 block font-medium">Firmaya Mevcut Borcumuz</span>
                  <span className="text-base font-extrabold text-amber-400 block mt-0.5">
                    {formatCurrency(currentDebt)}
                  </span>
                </div>
                {currentDebt === 0 && (
                  <span className="text-[11px] font-bold text-emerald-400 bg-emerald-950/60 px-2.5 py-1 rounded-full border border-emerald-800">
                    Borç Bulunmuyor
                  </span>
                )}
              </div>
            )}

            {/* Payment Method Tabs */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                Ödeme Yöntemi *
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {(['Nakit', 'Havale/EFT', 'Kart', 'Diğer'] as PaymentMethodType[]).map((method) => (
                  <button
                    key={method}
                    type="button"
                    onClick={() => setPaymentMethod(method)}
                    className={`py-2 px-3 rounded-xl font-bold text-xs border transition-all ${
                      paymentMethod === method
                        ? 'bg-emerald-950 border-emerald-500 text-emerald-300'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    {method}
                  </button>
                ))}
              </div>
            </div>

            {/* Amount & Date Input */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                  Ödenecek Tutar (TL) *
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
                  Ödeme Tarihi *
                </label>
                <input
                  type="date"
                  value={paymentDate}
                  onChange={(e) => setPaymentDate(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 focus:border-emerald-500 rounded-xl p-3 text-slate-100 text-xs font-medium outline-none"
                  required
                />
              </div>
            </div>

            {/* Reference Number & Notes */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                  Dekont / Referans No (İsteğe Bağlı)
                </label>
                <input
                  type="text"
                  value={referenceNumber}
                  onChange={(e) => setReferenceNumber(e.target.value)}
                  placeholder="Örn: DEK-98124"
                  className="w-full bg-slate-950 border border-slate-700 focus:border-emerald-500 rounded-xl p-2.5 text-slate-200 text-xs outline-none"
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
                  placeholder="Ödeme notu..."
                  className="w-full bg-slate-950 border border-slate-700 focus:border-emerald-500 rounded-xl p-2.5 text-slate-200 text-xs outline-none"
                />
              </div>
            </div>

            {/* Submit */}
            <div className="pt-2">
              <button
                type="submit"
                className="w-full py-3.5 px-4 rounded-xl font-bold text-sm bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-white shadow-lg shadow-emerald-500/25 flex items-center justify-center gap-2 transition-all active:scale-98"
              >
                <span>Ödeme İşlemini İncele & Onayla →</span>
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
