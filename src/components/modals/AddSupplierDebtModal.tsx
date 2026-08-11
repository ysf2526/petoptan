import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/context/ToastContext';
import { parseErrorMessage } from '@/utils/errors';
import { formatCurrency } from '@/utils/formatters';
import { Supplier } from '@/types/database.types';
import { X, Plus, Loader2, CheckCircle2, Truck, AlertCircle } from 'lucide-react';

interface AddSupplierDebtModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultSupplierId?: string | null;
  onSuccess?: () => void;
}

export const AddSupplierDebtModal: React.FC<AddSupplierDebtModalProps> = ({
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
  const [description, setDescription] = useState<string>('Açılış Borcu / Eski Mal Alımı');

  useEffect(() => {
    if (isOpen) {
      const loadSuppliers = async () => {
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
                  .select('balance')
                  .eq('supplier_id', sup.id)
                  .is('deleted_at', null)
                  .order('created_at', { ascending: false })
                  .limit(1);

                return {
                  ...sup,
                  balance: Number(lData?.[0]?.balance || 0),
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
        } catch (err) {
          console.error(err);
        } finally {
          setFetchingSuppliers(false);
        }
      };
      setAmount('');
      setDescription('Açılış Borcu / Eski Mal Alımı');
      loadSuppliers();
    }
  }, [isOpen, defaultSupplierId]);

  if (!isOpen) return null;

  const selectedSupplier = suppliers.find((s) => s.id === selectedSupplierId);
  const currentDebt = selectedSupplier?.balance || 0;
  const numAmount = Number(amount) || 0;
  const newDebt = currentDebt + numAmount;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedSupplierId) {
      showError('Lütfen bir tedarikçi firma seçin.');
      return;
    }

    if (numAmount <= 0) {
      showError('Lütfen 0’dan büyük geçerli bir borç tutarı girin.');
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('add_supplier_debt_transaction', {
        p_supplier_id: selectedSupplierId,
        p_amount: numAmount,
        p_description: description.trim() || 'Açılış Borcu / Bakiye Düzeltme',
      });

      if (error) throw error;

      if (data && data.success) {
        showSuccess(
          `"${data.supplier_name}" tedarikçisine +${formatCurrency(numAmount)} borç kaydı eklendi. Güncel borç: ${formatCurrency(data.new_balance)}.`
        );
        onClose();
        if (onSuccess) onSuccess();
      }
    } catch (err) {
      showError(parseErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4">
      <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-md" onClick={onClose} />

      <div className="relative bg-slate-900 border border-amber-500/40 rounded-2xl w-full max-w-lg shadow-2xl z-10 overflow-hidden flex flex-col my-auto">
        <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-900">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-600/20 border border-amber-500/40 flex items-center justify-center text-amber-400">
              <Plus className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-extrabold text-white">Tedarikçi Borcu / Bakiye Ekle</h2>
              <p className="text-xs text-amber-300 font-medium">Açılış Borcu veya Eski Alış Kaydı Ekleme</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-white rounded-xl bg-slate-800">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 sm:p-6 space-y-4">
          {fetchingSuppliers ? (
            <div className="p-8 text-center text-slate-400 flex flex-col items-center">
              <Loader2 className="w-6 h-6 animate-spin text-amber-500 mb-2" />
              <span>Tedarikçi Firmalar Yükleniyor...</span>
            </div>
          ) : (
            <>
              {/* Supplier Selection */}
              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5">
                  Tedarikçi Firma *
                </label>
                <select
                  value={selectedSupplierId}
                  onChange={(e) => setSelectedSupplierId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 focus:border-amber-500 rounded-xl p-3 text-white font-bold text-sm outline-none"
                >
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.company_name} (Mevcut Borç: {formatCurrency(s.balance)})
                    </option>
                  ))}
                </select>
              </div>

              {/* Debt Summary Strip */}
              {selectedSupplier && (
                <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 grid grid-cols-3 gap-2 text-center text-xs">
                  <div>
                    <span className="text-[9px] text-slate-400 font-bold uppercase block">Mevcut Borç</span>
                    <span className="font-extrabold text-slate-200 mt-0.5 block">{formatCurrency(currentDebt)}</span>
                  </div>
                  <div>
                    <span className="text-[9px] text-amber-400 font-bold uppercase block">+ Eklenecek</span>
                    <span className="font-black text-amber-400 mt-0.5 block">+{formatCurrency(numAmount)}</span>
                  </div>
                  <div>
                    <span className="text-[9px] text-emerald-400 font-bold uppercase block">Yeni Borç</span>
                    <span className="font-black text-emerald-400 mt-0.5 block">{formatCurrency(newDebt)}</span>
                  </div>
                </div>
              )}

              {/* Amount Input */}
              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5">
                  Eklenen Borç Tutarı (TL) *
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  required
                  value={amount}
                  onChange={(e) => setAmount(e.target.value ? Number(e.target.value) : '')}
                  placeholder="Örn: 80000"
                  className="w-full bg-slate-950 border border-amber-500/50 focus:border-amber-400 rounded-xl p-3 text-amber-400 font-black text-lg outline-none"
                />
              </div>

              {/* Description Input */}
              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5">
                  Açıklama / İşlem Nedeni
                </label>
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Örn: Eski Mal Alımı Borcu / Açılış Bakiyesi"
                  className="w-full bg-slate-950 border border-slate-700 focus:border-amber-500 rounded-xl p-2.5 text-slate-200 text-xs outline-none"
                />
              </div>

              {/* Info Note */}
              <div className="bg-amber-950/40 border border-amber-900/60 p-3 rounded-xl flex items-start gap-2.5 text-xs text-amber-200">
                <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <p className="leading-relaxed text-[11px]">
                  Bu işlem tedarikçinin cari hesabına belirtilen tutarı borç olarak işler. Müşteriden ödeme alırken <strong>Tedarikçiye Mahsup</strong> seçeneğini kullanabilmek için tedarikçi borcunun girilmiş olması gereklidir.
                </p>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs transition-all"
                >
                  Vazgeç
                </button>

                <button
                  type="submit"
                  disabled={loading || numAmount <= 0}
                  className="px-5 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-slate-950 font-black text-xs transition-all shadow-lg shadow-amber-600/20 flex items-center gap-2 disabled:opacity-50"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Kaydediliyor...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      <span>BORÇ KAYDINI İŞLE</span>
                    </>
                  )}
                </button>
              </div>
            </>
          )}
        </form>
      </div>
    </div>
  );
};
