import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/context/ToastContext';
import { parseErrorMessage } from '@/utils/errors';
import { formatCurrency, formatNumber, formatDate } from '@/utils/formatters';
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
  AlertTriangle,
  Tag,
  Lightbulb,
  AlertOctagon,
  FileText,
  Send,
  ArrowRight,
  TrendingUp,
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
  purchase_price: number; // Cost Price
  std_sale_price: number; // Standard Retail Price
  sale_price: number; // Active Transaction Price
  quantity: number;
}

interface ScheduleItem {
  due_date: string;
  amount: number;
}

interface CustomerLastPrice {
  price: number;
  date: string;
}

interface PostSaleSuccessData {
  saleId: string;
  saleNumber: string;
  currentSaleTotal: number;
  prevBalance: number;
  newTotalDebt: number;
  weeklyTarget: number;
  estimatedWeeks: number;
  customerId: string;
  customerName: string;
}

export const NewSaleModal: React.FC<NewSaleModalProps> = ({ isOpen, onClose, onSuccess }) => {
  const navigate = useNavigate();
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

  // Customer previous purchase prices map: product_id -> { price, date }
  const [customerLastPriceMap, setCustomerLastPriceMap] = useState<Record<string, CustomerLastPrice>>({});

  // Weekly payment schedules
  const [schedules, setSchedules] = useState<ScheduleItem[]>([]);
  const [customSchedules, setCustomSchedules] = useState<boolean>(false);

  // Below Cost Confirmation Modal State
  const [belowCostModalOpen, setBelowCostModalOpen] = useState(false);

  // Post Sale Success Modal State
  const [postSaleData, setPostSaleData] = useState<PostSaleSuccessData | null>(null);

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

  // Fetch customer last purchase prices whenever selectedCustomerId changes
  useEffect(() => {
    if (isOpen && selectedCustomerId) {
      const fetchLastPrices = async () => {
        try {
          const { data: salesData } = await supabase
            .from('sales')
            .select('id, created_at')
            .eq('customer_id', selectedCustomerId)
            .is('deleted_at', null)
            .order('created_at', { ascending: false })
            .limit(20);

          if (!salesData || salesData.length === 0) {
            setCustomerLastPriceMap({});
            return;
          }

          const saleIds = salesData.map((s) => s.id);
          const saleDateMap = new Map(salesData.map((s) => [s.id, s.created_at]));

          const { data: itemsData } = await supabase
            .from('sale_items')
            .select('product_id, sale_price_snapshot, sale_id, created_at')
            .in('sale_id', saleIds)
            .is('deleted_at', null)
            .order('created_at', { ascending: false });

          const priceMap: Record<string, CustomerLastPrice> = {};
          itemsData?.forEach((it) => {
            if (!priceMap[it.product_id]) {
              priceMap[it.product_id] = {
                price: Number(it.sale_price_snapshot || 0),
                date: it.created_at || saleDateMap.get(it.sale_id) || '',
              };
            }
          });

          setCustomerLastPriceMap(priceMap);
        } catch (err) {
          console.error('Müşteri son fiyatlar yüklenirken hata:', err);
        }
      };
      fetchLastPrices();
    }
  }, [isOpen, selectedCustomerId]);

  // Total Calculations
  const totals = useMemo(() => {
    let grandTotal = 0;
    let totalCost = 0;
    let totalLoss = 0;
    let lossItemCount = 0;

    items.forEach((it) => {
      const lineTotal = it.quantity * it.sale_price;
      const lineCost = it.quantity * it.purchase_price;
      grandTotal += lineTotal;
      totalCost += lineCost;

      if (it.sale_price < it.purchase_price) {
        totalLoss += (it.purchase_price - it.sale_price) * it.quantity;
        lossItemCount += 1;
      }
    });

    const totalProfit = grandTotal - totalCost;
    return { grandTotal, totalCost, totalProfit, totalLoss, lossItemCount };
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
        purchase_price: Number(prod.purchase_price || 0),
        std_sale_price: Number(prod.sale_price || 0),
        sale_price: Number(prod.sale_price || 0),
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

  const handleApplyCustomerPrice = (index: number, lastPrice: number) => {
    handleUpdateItem(index, 'sale_price', lastPrice);
    showSuccess(`Müşterinin son alış fiyatı (${formatCurrency(lastPrice)}) uygulandı.`);
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

  const executeSaleSubmission = async () => {
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
        setBelowCostModalOpen(false);

        // Fetch customer info and balance to populate Post Sale Success Summary Modal
        const selectedCust = customers.find((c) => c.id === selectedCustomerId);
        const { data: lData } = await supabase
          .from('customer_ledger')
          .select('balance')
          .eq('customer_id', selectedCustomerId)
          .is('deleted_at', null)
          .order('created_at', { ascending: false })
          .limit(1);

        const currentTotalDebt = lData?.[0]?.balance ? Number(lData[0].balance) : totals.grandTotal;
        const prevBal = Math.max(0, currentTotalDebt - totals.grandTotal);
        const target = selectedCust?.weekly_payment_target && Number(selectedCust.weekly_payment_target) > 0
          ? Number(selectedCust.weekly_payment_target)
          : Math.ceil(currentTotalDebt / 4);

        const weeks = Math.ceil(currentTotalDebt / (target || 1));

        setPostSaleData({
          saleId: data.sale_id,
          saleNumber: data.sale_number,
          currentSaleTotal: totals.grandTotal,
          prevBalance: prevBal,
          newTotalDebt: currentTotalDebt,
          weeklyTarget: target,
          estimatedWeeks: weeks,
          customerId: selectedCustomerId,
          customerName: selectedCust?.business_name || '',
        });

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

    // Check if any items are below cost
    if (totals.totalLoss > 0) {
      setBelowCostModalOpen(true);
      return;
    }

    // Proceed if no loss
    executeSaleSubmission();
  };

  return (
    <>
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
                <p className="text-xs text-slate-400">Esnek satış fiyatı belirleyin, alış maliyeti uyarılarını takip edin.</p>
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
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl p-2.5 text-slate-100 text-sm focus:border-brand-500 outline-none font-semibold"
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
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl p-2.5 text-slate-100 text-sm focus:border-brand-500 outline-none font-bold"
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
                            <th className="p-3">Ürün Detayı & Fiyat Bilgisi</th>
                            <th className="p-3 w-24">Mevcut Stok</th>
                            <th className="p-3 w-28">Satış Adedi</th>
                            <th className="p-3 w-40">Özel Satış Fiyatı (TL)</th>
                            <th className="p-3 w-36 text-right">Toplam Tutar</th>
                            <th className="p-3 w-12 text-center">Sil</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/60 text-slate-200">
                          {items.map((it, idx) => {
                            const isStockError = it.quantity > it.current_stock;
                            const isLoss = it.sale_price < it.purchase_price;
                            const isZeroProfit = it.sale_price === it.purchase_price;
                            const isDiscounted = it.sale_price < it.std_sale_price && !isLoss && !isZeroProfit;

                            const unitDiff = it.sale_price - it.purchase_price;
                            const unitLossAmount = it.purchase_price - it.sale_price;
                            const discountAmount = it.std_sale_price - it.sale_price;
                            const discountPct = it.std_sale_price > 0 ? Math.round((discountAmount / it.std_sale_price) * 100) : 0;
                            const marginPct = it.sale_price > 0 ? ((unitDiff / it.sale_price) * 100).toFixed(1) : 0;

                            const lastPriceInfo = customerLastPriceMap[it.product_id];

                            return (
                              <tr key={it.product_id} className={isLoss ? 'bg-rose-950/20' : isStockError ? 'bg-amber-950/20' : ''}>
                                <td className="p-3 space-y-1">
                                  <div className="font-bold text-slate-100 flex items-center gap-2">
                                    <span>{it.product_name}</span>
                                    <span className="text-[10px] text-slate-500 font-normal">({it.unit})</span>
                                  </div>

                                  <div className="flex flex-wrap items-center gap-2 text-[11px]">
                                    <span className="text-slate-400">Alış: <strong className="text-slate-200">{formatCurrency(it.purchase_price)}</strong></span>
                                    <span className="text-slate-500">|</span>
                                    <span className="text-slate-400">Standart Satış: <strong className="text-slate-200">{formatCurrency(it.std_sale_price)}</strong></span>

                                    {/* Indicator Badges */}
                                    {isLoss && (
                                      <span className="px-2 py-0.5 rounded bg-rose-950 text-rose-300 border border-rose-800 text-[10px] font-black flex items-center gap-1">
                                        <AlertTriangle className="w-3 h-3 text-rose-400 animate-pulse" />
                                        <span>ZARARLI SATIŞ (-{formatCurrency(unitLossAmount)} Birim Zarar)</span>
                                      </span>
                                    )}

                                    {isZeroProfit && (
                                      <span className="px-2 py-0.5 rounded bg-amber-950 text-amber-300 border border-amber-800 text-[10px] font-bold">
                                        ⚠️ Kâr Oluşmuyor (%0 Marj)
                                      </span>
                                    )}

                                    {isDiscounted && (
                                      <span className="px-2 py-0.5 rounded bg-indigo-950 text-indigo-300 border border-indigo-800 text-[10px] font-bold flex items-center gap-1">
                                        <Tag className="w-3 h-3 text-indigo-400" />
                                        <span>%{discountPct} İndirim (Kâr: +{formatCurrency(unitDiff)})</span>
                                      </span>
                                    )}

                                    {!isLoss && !isZeroProfit && !isDiscounted && (
                                      <span className="text-[10px] text-emerald-400 font-semibold">
                                        (Kâr: +{formatCurrency(unitDiff)} - %{marginPct} Marj)
                                      </span>
                                    )}
                                  </div>

                                  {/* Müşteri Son Alış Fiyatı İpucu */}
                                  {lastPriceInfo && (
                                    <div className="flex items-center gap-1.5 text-[10px] text-amber-300 pt-0.5">
                                      <Lightbulb className="w-3 h-3 text-amber-400" />
                                      <span>Müşterinin Son Alış Fiyatı: <strong>{formatCurrency(lastPriceInfo.price)}</strong> ({formatDate(lastPriceInfo.date)})</span>
                                      {it.sale_price !== lastPriceInfo.price && (
                                        <button
                                          type="button"
                                          onClick={() => handleApplyCustomerPrice(idx, lastPriceInfo.price)}
                                          className="px-1.5 py-0.5 rounded bg-amber-950 hover:bg-amber-900 border border-amber-700/60 text-amber-200 font-extrabold text-[9px] transition-all ml-1"
                                        >
                                          Kullan: {formatCurrency(lastPriceInfo.price)}
                                        </button>
                                      )}
                                    </div>
                                  )}
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
                                    className={`w-full bg-slate-900 border rounded-lg p-1.5 text-right text-xs font-black outline-none ${
                                      isLoss
                                        ? 'border-rose-500 text-rose-300 bg-rose-950/40'
                                        : isDiscounted
                                        ? 'border-indigo-500 text-indigo-300'
                                        : 'border-slate-700 focus:border-brand-500 text-white'
                                    }`}
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

                        <div className="flex items-center gap-2 flex-1">
                          <span className="text-slate-400 text-xs font-medium">Tutar:</span>
                          <input
                            type="number"
                            step="0.01"
                            value={sch.amount}
                            onChange={(e) => handleUpdateSchedule(sIdx, 'amount', e.target.value)}
                            className="w-32 bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-100 font-bold text-right outline-none focus:border-brand-500"
                          />
                          <span className="text-slate-400 text-xs font-semibold">TL</span>
                        </div>

                        {schedules.length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleRemoveScheduleRow(sIdx)}
                            className="p-1 text-slate-400 hover:text-rose-400 self-end sm:self-center"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Notes */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                  Satış Notu / Açıklama
                </label>
                <textarea
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="İsteğe bağlı satış notu..."
                  className="w-full bg-slate-950 border border-slate-700 focus:border-brand-500 rounded-xl p-3 text-xs text-slate-100 outline-none"
                />
              </div>

              {/* Below Cost Loss Warning Banner */}
              {totals.totalLoss > 0 && (
                <div className="bg-rose-950/60 border border-rose-800 p-4 rounded-xl text-xs space-y-1.5 text-rose-200">
                  <div className="flex items-center gap-2 font-bold text-white text-sm">
                    <AlertTriangle className="w-5 h-5 text-rose-400 animate-bounce" />
                    <span>⚠️ DİKKAT: BU SATIŞTA ZARARLI ÜRÜNLER VAR!</span>
                  </div>
                  <p>
                    Satıştaki {totals.lossItemCount} adet ürün alış maliyetinin altında fiyatlandırılmıştır. Toplam tahmini net zarar: <strong className="text-rose-300 font-black">-{formatCurrency(totals.totalLoss)}</strong>.
                  </p>
                  <p className="text-slate-300 text-[11px]">
                    Satış kaydını engellemiyoruz, zarara rağmen tamamlamak isterseniz onay verip satışı bitirebilirsiniz.
                  </p>
                </div>
              )}

              {/* Footer Bar Summary */}
              <div className="bg-slate-950 border border-slate-800 p-4 rounded-xl flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="flex items-center gap-6 text-xs w-full sm:w-auto justify-around sm:justify-start">
                  <div>
                    <span className="text-slate-400 block text-[11px]">Toplam Alış Maliyeti</span>
                    <span className="font-bold text-slate-300 text-sm">{formatCurrency(totals.totalCost)}</span>
                  </div>

                  <div>
                    <span className="text-slate-400 block text-[11px]">Tahmini Brüt Kâr/Zarar</span>
                    <span className={`font-black text-sm ${totals.totalProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {totals.totalProfit >= 0 ? `+${formatCurrency(totals.totalProfit)}` : formatCurrency(totals.totalProfit)}
                    </span>
                  </div>

                  <div>
                    <span className="text-slate-400 block text-[11px]">Genel Toplam Tutar</span>
                    <span className="font-black text-white text-base sm:text-lg">{formatCurrency(totals.grandTotal)}</span>
                  </div>
                </div>

                <div className="flex items-center gap-3 w-full sm:w-auto">
                  <button
                    type="button"
                    onClick={onClose}
                    className="flex-1 sm:flex-none px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs transition-all"
                  >
                    Vazgeç
                  </button>

                  <button
                    type="submit"
                    disabled={loading || items.length === 0}
                    className={`flex-1 sm:flex-none font-bold px-6 py-2.5 rounded-xl text-xs flex items-center justify-center gap-2 transition-all shadow-lg active:scale-95 disabled:opacity-40 ${
                      totals.totalLoss > 0
                        ? 'bg-amber-600 hover:bg-amber-500 text-white shadow-amber-600/20'
                        : 'bg-gradient-to-r from-brand-600 to-brand-500 hover:from-brand-500 hover:to-brand-400 text-white shadow-brand-500/20'
                    }`}
                  >
                    {loading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>İşlem Yapılıyor...</span>
                      </>
                    ) : totals.totalLoss > 0 ? (
                      <>
                        <AlertTriangle className="w-4 h-4" />
                        <span>Zarara Rağmen İlerle</span>
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="w-4 h-4" />
                        <span>Satışı Tamamla</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </form>
          )}
        </div>
      </div>

      {/* BELOW COST LOSS CONFIRMATION MODAL */}
      {belowCostModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4">
          <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md" onClick={() => setBelowCostModalOpen(false)} />
          <div className="relative bg-slate-900 border border-rose-800 rounded-2xl w-full max-w-lg p-6 shadow-2xl z-10 space-y-5">
            <div className="flex items-center gap-3 border-b border-slate-800 pb-4">
              <div className="w-10 h-10 rounded-xl bg-rose-600/20 border border-rose-500/40 flex items-center justify-center text-rose-400 shrink-0">
                <AlertOctagon className="w-6 h-6 animate-pulse" />
              </div>
              <div>
                <h3 className="text-base sm:text-lg font-black text-white">⚠️ ZARARINA SATIŞ ONAYI</h3>
                <p className="text-xs text-rose-300 font-semibold">Alış Maliyetinin Altında Ürün Var</p>
              </div>
            </div>

            <div className="bg-rose-950/40 border border-rose-900/60 p-4 rounded-xl text-xs text-slate-200 leading-relaxed space-y-2">
              <p className="font-bold text-white text-sm">
                Bu satış alış maliyetinizin altındadır.
              </p>
              <p className="text-slate-300">
                Satıştaki {totals.lossItemCount} üründen toplam <strong className="text-rose-300 font-bold">-{formatCurrency(totals.totalLoss)}</strong> tutarında net zarar oluşmaktadır.
              </p>
              <p className="text-slate-400 text-[11px] pt-1">
                Jest, stok eritme veya kampanya amacıyla zararına satışı onaylayıp işlemi tamamlayabilirsiniz.
              </p>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setBelowCostModalOpen(false)}
                disabled={loading}
                className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs transition-all"
              >
                Vazgeç
              </button>

              <button
                type="button"
                onClick={executeSaleSubmission}
                disabled={loading}
                className="px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-black text-xs transition-all shadow-lg shadow-rose-600/30 active:scale-95 flex items-center gap-2"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Kaydediliyor...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    <span>ZARARA RAĞMEN SATIŞI TAMAMLA</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* POST SALE SUCCESS SUMMARY MODAL */}
      {postSaleData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4">
          <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-md" onClick={() => { setPostSaleData(null); onClose(); }} />
          <div className="relative bg-slate-900 border border-brand-500/50 rounded-2xl w-full max-w-lg p-6 shadow-2xl z-10 space-y-5">
            <div className="flex items-center gap-3 border-b border-slate-800 pb-4">
              <div className="w-12 h-12 rounded-2xl bg-emerald-600/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 shrink-0">
                <CheckCircle2 className="w-7 h-7" />
              </div>
              <div>
                <h3 className="text-base sm:text-lg font-black text-white">SATIŞ BAŞARIYLA TAMAMLANDI</h3>
                <p className="text-xs text-brand-400 font-bold">Sipariş No: #{postSaleData.saleNumber} ({postSaleData.customerName})</p>
              </div>
            </div>

            {/* Financial Summary Stack */}
            <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 text-xs space-y-3">
              <div className="flex items-center justify-between text-slate-300">
                <span>Bugünkü Alışveriş:</span>
                <span className="font-bold text-white text-sm">{formatCurrency(postSaleData.currentSaleTotal)}</span>
              </div>
              <div className="flex items-center justify-between text-slate-400">
                <span>Önceki Bakiye:</span>
                <span className="font-semibold text-slate-300">{formatCurrency(postSaleData.prevBalance)}</span>
              </div>

              <div className="pt-2 border-t border-slate-800 flex items-center justify-between">
                <span className="font-bold text-amber-300 uppercase">YENİ TOPLAM CARİ BORÇ:</span>
                <span className="font-black text-amber-400 text-lg sm:text-xl">{formatCurrency(postSaleData.newTotalDebt)}</span>
              </div>

              <div className="pt-2 border-t border-slate-800/60 grid grid-cols-2 gap-2 text-[11px] text-slate-400">
                <div>
                  <span>Haftalık Ödeme Hedefi:</span>
                  <strong className="block text-white text-xs font-bold mt-0.5">{formatCurrency(postSaleData.weeklyTarget)}</strong>
                </div>
                <div>
                  <span>Tahmini Kapanış Süresi:</span>
                  <strong className="block text-brand-400 text-xs font-bold mt-0.5">{postSaleData.estimatedWeeks} Hafta</strong>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
              <button
                type="button"
                onClick={() => {
                  setPostSaleData(null);
                  onClose();
                  navigate(`/customers/${postSaleData.customerId}`);
                }}
                className="w-full py-2.5 px-3 rounded-xl bg-brand-600 hover:bg-brand-500 text-white font-bold text-xs flex items-center justify-center gap-2 transition-all shadow-lg shadow-brand-600/20"
              >
                <TrendingUp className="w-4 h-4" />
                <span>CARİ ÖDEME PLANINI GÖR</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setPostSaleData(null);
                  onClose();
                  navigate(`/customers/${postSaleData.customerId}`);
                }}
                className="w-full py-2.5 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-bold text-xs flex items-center justify-center gap-2 transition-all"
              >
                <FileText className="w-4 h-4 text-emerald-400" />
                <span>PDF & WHATSAPP GÖNDER</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
