import React, { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/context/ToastContext';
import { parseErrorMessage } from '@/utils/errors';
import { formatCurrency, formatNumber } from '@/utils/formatters';
import { Customer, Product } from '@/types/database.types';
import {
  X,
  Plus,
  Trash2,
  ShoppingCart,
  Calendar,
  AlertCircle,
  CheckCircle2,
  Loader2,
  DollarSign,
} from 'lucide-react';

interface NewSaleModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (saleId?: string) => void;
}

interface SelectedItem {
  product_id: string;
  product_name: string;
  unit: string;
  current_stock: number;
  purchase_price: number;
  sale_price: number;
  quantity: number;
}

interface ScheduleItem {
  due_date: string;
  amount: number;
}

export const NewSaleModal: React.FC<NewSaleModalProps> = ({ isOpen, onClose, onSuccess }) => {
  const { showSuccess, showError } = useToast();

  const [loading, setLoading] = useState(false);
  const [fetchingData, setFetchingData] = useState(false);

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);

  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');
  const [paymentType, setPaymentType] = useState<'pesin' | 'vadeli'>('vadeli');
  const [termDays, setTermDays] = useState<number>(30);
  const [notes, setNotes] = useState<string>('');

  const [items, setItems] = useState<SelectedItem[]>([]);

  // Weekly payment schedules
  const [schedules, setSchedules] = useState<ScheduleItem[]>([]);
  const [customSchedules, setCustomSchedules] = useState<boolean>(false);

  // Fetch Customers & Products on modal open
  useEffect(() => {
    if (isOpen) {
      const load = async () => {
        setFetchingData(true);
        try {
          const { data: cData } = await supabase
            .from('customers')
            .select('*')
            .eq('active', true)
            .is('deleted_at', null)
            .order('business_name');

          const { data: pData } = await supabase
            .from('products')
            .select('*')
            .eq('active', true)
            .is('deleted_at', null)
            .order('product_name');

          setCustomers(cData || []);
          setProducts(pData || []);

          if (cData && cData.length > 0 && !selectedCustomerId) {
            setSelectedCustomerId(cData[0].id);
          }
        } catch (err) {
          console.error(err);
        } finally {
          setFetchingData(false);
        }
      };
      load();
    }
  }, [isOpen]);

  // Total Calculations
  const totals = useMemo(() => {
    let grandTotal = 0;
    let totalCost = 0;
    items.forEach((it) => {
      grandTotal += it.quantity * it.sale_price;
      totalCost += it.quantity * it.purchase_price;
    });
    const totalProfit = grandTotal - totalCost;
    return { grandTotal, totalCost, totalProfit };
  }, [items]);

  // Generate 4 weekly payment schedules if vadeli & custom not manually edited
  useEffect(() => {
    if (paymentType === 'vadeli' && totals.grandTotal > 0 && !customSchedules) {
      const numWeeks = 4;
      const basePerWeek = Number((totals.grandTotal / numWeeks).toFixed(2));
      let remaining = totals.grandTotal;

      const generated: ScheduleItem[] = [];
      const today = new Date();

      for (let i = 1; i <= numWeeks; i++) {
        const d = new Date(today);
        d.setDate(d.getDate() + i * 7);
        const dateStr = d.toISOString().split('T')[0];

        let amt = basePerWeek;
        if (i === numWeeks) {
          amt = Number(remaining.toFixed(2));
        } else {
          remaining -= basePerWeek;
        }

        generated.push({ due_date: dateStr, amount: Math.max(0, amt) });
      }
      setSchedules(generated);
    }
  }, [paymentType, totals.grandTotal, customSchedules]);

  if (!isOpen) return null;

  const handleAddItem = (prodId: string) => {
    if (!prodId) return;
    const prod = products.find((p) => p.id === prodId);
    if (!prod) return;

    if (prod.current_stock <= 0) {
      showError(`"${prod.product_name}" ürününde mevcut stok 0 adettir. Satış yapmadan önce depoya "Mal Girişi" yapmalısınız.`);
      return;
    }

    if (items.some((it) => it.product_id === prodId)) {
      showError('Bu ürün zaten listeye eklendi.');
      return;
    }

    setItems((prev) => [
      ...prev,
      {
        product_id: prod.id,
        product_name: prod.product_name,
        unit: prod.unit,
        current_stock: prod.current_stock,
        purchase_price: prod.purchase_price,
        sale_price: prod.sale_price,
        quantity: 1,
      },
    ]);
  };

  const handleRemoveItem = (index: number) => {
    setItems((prev) => prev.filter((_, i) => i !== index));
    setCustomSchedules(false);
  };

  const handleUpdateItem = (index: number, field: 'quantity' | 'sale_price', val: number) => {
    setItems((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: Math.max(0, val) };
      return updated;
    });
    setCustomSchedules(false);
  };

  const handleUpdateSchedule = (index: number, field: 'due_date' | 'amount', val: any) => {
    setCustomSchedules(true);
    setSchedules((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: field === 'amount' ? Math.max(0, Number(val)) : val };
      return updated;
    });
  };

  const handleAddScheduleRow = () => {
    setCustomSchedules(true);
    const lastDate = schedules.length > 0 ? schedules[schedules.length - 1].due_date : new Date().toISOString().split('T')[0];
    const nextD = new Date(lastDate);
    nextD.setDate(nextD.getDate() + 7);
    setSchedules((prev) => [...prev, { due_date: nextD.toISOString().split('T')[0], amount: 0 }]);
  };

  const handleRemoveScheduleRow = (index: number) => {
    setCustomSchedules(true);
    setSchedules((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedCustomerId) {
      showError('Lütfen bir müşteri seçiniz.');
      return;
    }

    if (items.length === 0) {
      showError('Lütfen sağ üstteki "+ Ürün Ekle..." menüsünden satışa en az 1 ürün ekleyiniz.');
      return;
    }

    // Stock sufficiency check
    for (const it of items) {
      if (it.quantity <= 0) {
        showError(`${it.product_name} için satış miktarı 0'dan büyük olmalıdır.`);
        return;
      }
      if (it.quantity > it.current_stock) {
        showError(`${it.product_name} için stok yetersiz! (Mevcut: ${it.current_stock})`);
        return;
      }
    }

    // Validate schedules sum if vadeli
    if (paymentType === 'vadeli') {
      const schedSum = Number(schedules.reduce((acc, curr) => acc + Number(curr.amount || 0), 0).toFixed(2));
      const grandSum = Number(totals.grandTotal.toFixed(2));
      if (Math.abs(schedSum - grandSum) > 0.05) {
        showError(`Taksit ödeme planı toplamı (${formatCurrency(schedSum)}) satış tutarına (${formatCurrency(grandSum)}) eşit olmalıdır.`);
        return;
      }
    }

    setLoading(true);

    try {
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + termDays);

      const itemsPayload = items.map((it) => ({
        product_id: it.product_id,
        quantity: it.quantity,
        sale_price: it.sale_price,
      }));

      const { data, error } = await supabase.rpc('create_sale_transaction', {
        p_customer_id: selectedCustomerId,
        p_payment_type: paymentType,
        p_term_days: termDays,
        p_due_date: dueDate.toISOString().split('T')[0],
        p_notes: notes,
        p_items: itemsPayload,
        p_schedules: paymentType === 'vadeli' ? schedules : null,
      });

      if (error) {
        showError(parseErrorMessage(error));
        setLoading(false);
        return;
      }

      if (data && data.success) {
        showSuccess(`Satış başarıyla tamamlandı! (#${data.sale_number})`);
        onClose();
        if (onSuccess) onSuccess(data.sale_id);
      } else {
        showError('Satış kaydı oluşturulamadı.');
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
      <div className="relative bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl z-10 overflow-hidden">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between bg-slate-900/90">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-brand-600/20 border border-brand-500/30 flex items-center justify-center text-brand-400">
              <ShoppingCart className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-white">Yeni Toptan Satış Yap</h2>
              <p className="text-xs text-slate-400">Müşteri seçin, ürün ekleyin ve ödeme planı oluşturun.</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white rounded-lg bg-slate-800/80 hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        {fetchingData ? (
          <div className="p-12 text-center text-slate-400 flex flex-col items-center justify-center">
            <Loader2 className="w-8 h-8 animate-spin text-brand-500 mb-2" />
            <span>Müşteriler ve Ürün Kataloğu Yükleniyor...</span>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6 custom-scrollbar">
            {/* Step 1: Customer & Payment Type */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 bg-slate-950 p-4 rounded-xl border border-slate-800/80">
              <div className="sm:col-span-1">
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                  Müşteri Seçin *
                </label>
                <select
                  required
                  value={selectedCustomerId}
                  onChange={(e) => setSelectedCustomerId(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl p-2.5 text-slate-100 text-sm focus:border-brand-500 outline-none"
                >
                  <option value="">-- Müşteri Seçin --</option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.business_name} ({c.contact_name || 'Yetkili Yok'})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                  Ödeme Türü *
                </label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setPaymentType('vadeli')}
                    className={`flex-1 py-2.5 px-3 rounded-xl border text-xs font-bold transition-all ${
                      paymentType === 'vadeli'
                        ? 'bg-brand-600/20 border-brand-500 text-brand-400 shadow-inner'
                        : 'bg-slate-900 border-slate-700 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Vadeli (30 Gün)
                  </button>
                  <button
                    type="button"
                    onClick={() => setPaymentType('pesin')}
                    className={`flex-1 py-2.5 px-3 rounded-xl border text-xs font-bold transition-all ${
                      paymentType === 'pesin'
                        ? 'bg-emerald-600/20 border-emerald-500 text-emerald-400 shadow-inner'
                        : 'bg-slate-900 border-slate-700 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Peşin Satış
                  </button>
                </div>
              </div>

              {paymentType === 'vadeli' && (
                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                    Vade Süresi (Gün)
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={termDays}
                    onChange={(e) => setTermDays(Number(e.target.value))}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl p-2.5 text-slate-100 text-sm focus:border-brand-500 outline-none"
                  />
                </div>
              )}
            </div>

            {/* Step 2: Add Products */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider">Satış Kalemleri</h3>
                <div className="w-72">
                  <select
                    onChange={(e) => {
                      handleAddItem(e.target.value);
                      e.target.value = '';
                    }}
                    className="w-full bg-slate-950 border border-brand-500/70 rounded-xl p-2.5 text-slate-100 text-xs font-semibold focus:ring-2 focus:ring-brand-500 outline-none"
                  >
                    <option value="">+ Ürün Ekle...</option>
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.product_name} {p.current_stock > 0 ? `(Stok: ${p.current_stock} ${p.unit})` : '(STOK YOK!)'} - {formatCurrency(p.sale_price)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Items Table */}
              <div className="border border-slate-800 rounded-xl overflow-hidden bg-slate-950/60">
                {items.length === 0 ? (
                  <div className="p-8 text-center text-slate-400 text-xs space-y-1">
                    <p className="font-bold text-amber-400">Henüz satışa ürün eklenmedi!</p>
                    <p className="text-slate-500">Sağ üstteki <span className="text-brand-400 font-semibold">+ Ürün Ekle...</span> menüsünden satılacak ürünleri seçiniz.</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-900 text-slate-400 font-semibold border-b border-slate-800 uppercase tracking-wider">
                        <tr>
                          <th className="p-3">Ürün Adı</th>
                          <th className="p-3 w-24">Mevcut Stok</th>
                          <th className="p-3 w-28">Satış Adedi</th>
                          <th className="p-3 w-36">Birim Satış Fiyatı (TL)</th>
                          <th className="p-3 w-36 text-right">Toplam Fiyat</th>
                          <th className="p-3 w-12 text-center">Sil</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60 text-slate-200">
                        {items.map((it, idx) => {
                          const isStockError = it.quantity > it.current_stock;
                          return (
                            <tr key={it.product_id} className={isStockError ? 'bg-rose-950/20' : ''}>
                              <td className="p-3 font-semibold text-slate-100">
                                {it.product_name}
                                <span className="text-[10px] text-slate-500 block font-normal">
                                  Birim: {it.unit}
                                </span>
                              </td>
                              <td className="p-3 font-medium text-slate-400">
                                {it.current_stock} {it.unit}
                              </td>
                              <td className="p-3">
                                <input
                                  type="number"
                                  min={1}
                                  max={it.current_stock}
                                  value={it.quantity}
                                  onChange={(e) => handleUpdateItem(idx, 'quantity', Number(e.target.value))}
                                  className={`w-full bg-slate-900 border rounded-lg p-1.5 text-center text-xs text-white font-bold outline-none ${
                                    isStockError ? 'border-rose-500 text-rose-300' : 'border-slate-700 focus:border-brand-500'
                                  }`}
                                />
                              </td>
                              <td className="p-3">
                                <input
                                  type="number"
                                  step="0.01"
                                  min={0}
                                  value={it.sale_price}
                                  onChange={(e) => handleUpdateItem(idx, 'sale_price', Number(e.target.value))}
                                  className="w-full bg-slate-900 border border-slate-700 focus:border-brand-500 rounded-lg p-1.5 text-right text-xs text-white font-bold outline-none"
                                />
                              </td>
                              <td className="p-3 text-right font-extrabold text-white">
                                {formatCurrency(it.quantity * it.sale_price)}
                              </td>
                              <td className="p-3 text-center">
                                <button
                                  type="button"
                                  onClick={() => handleRemoveItem(idx)}
                                  className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-rose-950/40 rounded-lg"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>

            {/* Step 3: Clean Vertical List Payment Schedule Customizer (If Vadeli) */}
            {paymentType === 'vadeli' && totals.grandTotal > 0 && (
              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800/80 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                      Haftalık Ödeme Planı (Taksitler)
                    </h3>
                    <p className="text-[11px] text-slate-400">
                      Tarihleri ve taksit tutarlarını liste üzerinden düzenleyebilirsiniz.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleAddScheduleRow}
                    className="text-xs font-semibold text-brand-400 hover:underline flex items-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Taksit Ekle</span>
                  </button>
                </div>

                {/* Vertical Clean Stack */}
                <div className="space-y-2">
                  {schedules.map((sch, sIdx) => (
                    <div
                      key={sIdx}
                      className="bg-slate-900/90 border border-slate-800 p-2.5 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                    >
                      <span className="font-semibold text-slate-200 shrink-0 min-w-[90px]">
                        {sIdx + 1}. Taksit
                      </span>

                      <div className="flex items-center gap-2 flex-1">
                        <span className="text-slate-400 text-xs font-medium">Tarih:</span>
                        <input
                          type="date"
                          value={sch.due_date}
                          onChange={(e) => handleUpdateSchedule(sIdx, 'due_date', e.target.value)}
                          className="bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-100 outline-none focus:border-brand-500"
                        />
                      </div>

                      <div className="flex items-center gap-2 flex-1 justify-start sm:justify-end">
                        <span className="text-slate-400 text-xs font-medium">Tutar:</span>
                        <div className="relative w-36">
                          <input
                            type="number"
                            step="0.01"
                            min={0}
                            value={sch.amount}
                            onChange={(e) => handleUpdateSchedule(sIdx, 'amount', e.target.value)}
                            className="w-full bg-slate-950 border border-slate-700 focus:border-brand-500 rounded-lg py-1.5 pl-2 pr-7 text-right text-xs font-bold text-white outline-none"
                          />
                          <span className="absolute right-2 top-1.5 text-[11px] font-bold text-slate-400">TL</span>
                        </div>

                        {schedules.length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleRemoveScheduleRow(sIdx)}
                            className="p-1.5 text-slate-500 hover:text-rose-400 hover:bg-rose-950/30 rounded-lg ml-1"
                            title="Taksit Sil"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Step 4: Notes */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                Satış Notu / Açıklama
              </label>
              <textarea
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Örn: Özel teslimat notu veya iskonto bilgisi..."
                className="w-full bg-slate-950 border border-slate-800 focus:border-brand-500 rounded-xl p-3 text-slate-100 text-xs outline-none"
              />
            </div>
          </form>
        )}

        {/* Footer Summary & Action (No Cost or Profit revealed for Customer Privacy) */}
        <div className="p-4 sm:p-5 border-t border-slate-800 bg-slate-900 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3 text-xs w-full sm:w-auto justify-between sm:justify-start">
            <span className="text-slate-400 font-semibold uppercase tracking-wider">Genel Toplam Tutar:</span>
            <span className="font-black text-white text-lg sm:text-xl text-brand-400">
              {formatCurrency(totals.grandTotal)}
            </span>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 sm:flex-initial py-2.5 px-4 rounded-xl border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs transition-colors"
            >
              Vazgeç
            </button>

            <button
              type="button"
              onClick={handleSubmit}
              disabled={loading}
              className="flex-1 sm:flex-initial py-2.5 px-6 rounded-xl bg-gradient-to-r from-brand-600 to-brand-500 hover:from-brand-500 hover:to-brand-400 text-white font-bold text-xs shadow-lg shadow-brand-500/25 flex items-center justify-center gap-2 transition-all disabled:opacity-50 active:scale-98"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Satış Kaydediliyor...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Satışı Tamamla ({formatCurrency(totals.grandTotal)})</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
