import React, { useEffect, useState, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/context/ToastContext';
import { parseErrorMessage } from '@/utils/errors';
import { formatCurrency, formatNumber } from '@/utils/formatters';
import { Product, Supplier } from '@/types/database.types';
import { SearchableSelect } from '@/components/common/SearchableSelect';
import { CreateProductInlineModal } from '@/components/modals/CreateProductInlineModal';
import {
  X,
  Boxes,
  Loader2,
  CheckCircle2,
  Building2,
  AlertCircle,
  DollarSign,
  Calendar,
  ArrowRight,
  Plus,
  Trash2,
  Search,
  Barcode,
  ShoppingBag,
  TrendingUp,
  Package,
} from 'lucide-react';

interface StockEntryItem {
  product_id: string;
  product_name: string;
  unit: string;
  barcode?: string | null;
  quantity: number;
  unit_cost: number;
  sale_price: number;
}

interface StockEntryModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultProductId?: string;
  onSuccess?: () => void;
}

export const StockEntryModal: React.FC<StockEntryModalProps> = ({
  isOpen,
  onClose,
  defaultProductId,
  onSuccess,
}) => {
  const { showSuccess, showError } = useToast();

  const [loading, setLoading] = useState(false);
  const [fetchingData, setFetchingData] = useState(false);

  const [products, setProducts] = useState<Product[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);

  // Form State
  const [selectedSupplierId, setSelectedSupplierId] = useState<string>('');
  const [purchaseType, setPurchaseType] = useState<'pesin' | 'vadeli' | null>(null);
  const [note, setNote] = useState<string>('');

  // Batch Items
  const [items, setItems] = useState<StockEntryItem[]>([]);

  // Search & Barcode state
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSearchProductId, setSelectedSearchProductId] = useState('');

  // Modals state
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [inlineProductModalOpen, setInlineProductModalOpen] = useState(false);

  const searchInputRef = useRef<HTMLInputElement>(null);

  const loadData = async () => {
    setFetchingData(true);
    try {
      const { data: pData } = await supabase
        .from('products')
        .select('*')
        .eq('active', true)
        .is('deleted_at', null)
        .order('product_name');

      setProducts(pData || []);

      const { data: sData } = await supabase
        .from('suppliers')
        .select('*')
        .eq('active', true)
        .is('deleted_at', null)
        .order('company_name');

      setSuppliers(sData || []);

      if (sData && sData.length > 0 && !selectedSupplierId) {
        setSelectedSupplierId(sData[0].id);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setFetchingData(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      setItems([]);
      setShowConfirmation(false);
      setPurchaseType(null);
      setSearchQuery('');
      loadData();
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && defaultProductId && products.length > 0) {
      const p = products.find((prod) => prod.id === defaultProductId);
      if (p && !items.some((i) => i.product_id === p.id)) {
        addItemToBatch(p);
      }
    }
  }, [isOpen, defaultProductId, products]);

  if (!isOpen) return null;

  const addItemToBatch = (prod: Product) => {
    if (items.some((i) => i.product_id === prod.id)) {
      showError(`"${prod.product_name}" zaten listede ekli.`);
      return;
    }

    setItems((prev) => [
      ...prev,
      {
        product_id: prod.id,
        product_name: prod.product_name,
        unit: prod.unit,
        barcode: prod.barcode,
        quantity: 1,
        unit_cost: prod.purchase_price,
        sale_price: prod.sale_price,
      },
    ]);
    setSearchQuery('');
    setSelectedSearchProductId('');
  };

  // Barcode / Search submit handler
  const handleSearchSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const query = searchQuery.trim().toLowerCase();
    if (!query) return;

    // 1. Try exact barcode match
    const exactBarcodeMatch = products.find(
      (p) => p.barcode && p.barcode.trim().toLowerCase() === query
    );

    if (exactBarcodeMatch) {
      addItemToBatch(exactBarcodeMatch);
      showSuccess(`"${exactBarcodeMatch.product_name}" sepete eklendi.`);
      return;
    }

    // 2. Try exact name match
    const nameMatch = products.find(
      (p) => p.product_name.toLowerCase() === query
    );

    if (nameMatch) {
      addItemToBatch(nameMatch);
      return;
    }

    // 3. Partial matches
    const matches = products.filter(
      (p) =>
        p.product_name.toLowerCase().includes(query) ||
        (p.barcode && p.barcode.toLowerCase().includes(query))
    );

    if (matches.length === 1) {
      addItemToBatch(matches[0]);
    } else if (matches.length === 0) {
      showError(`"${searchQuery}" ürünü veya barkodu bulunamadı. Yeni ürün oluşturabilirsiniz.`);
    }
  };

  const handleUpdateItem = (index: number, field: keyof StockEntryItem, value: any) => {
    setItems((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  };

  const handleRemoveItem = (index: number) => {
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  const selectedSupplier = suppliers.find((s) => s.id === selectedSupplierId);

  const totalBatchCost = items.reduce(
    (sum, item) => sum + (Number(item.quantity) || 0) * (Number(item.unit_cost) || 0),
    0
  );

  const totalQuantity = items.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0);

  const handlePrepareSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (items.length === 0) {
      showError('Lütfen mal girişi için en az 1 ürün ekleyin.');
      return;
    }

    if (!purchaseType) {
      showError('Lütfen ÖDEME DURUMUNU (PEŞİN veya VADELİ) seçin.');
      return;
    }

    if (purchaseType === 'vadeli' && !selectedSupplierId) {
      showError('Vadeli mal alımında tedarikçi firma seçimi zorunludur.');
      return;
    }

    // Validate quantities & costs
    for (const item of items) {
      if (item.quantity <= 0) {
        showError(`"${item.product_name}" için geçerli bir miktar girin.`);
        return;
      }
      if (item.unit_cost < 0) {
        showError(`"${item.product_name}" için alış fiyatı negatif olamaz.`);
        return;
      }
    }

    setShowConfirmation(true);
  };

  const handleConfirmBatchIntake = async () => {
    setLoading(true);

    try {
      const payloadItems = items.map((item) => ({
        product_id: item.product_id,
        quantity: item.quantity,
        unit_cost: item.unit_cost,
        sale_price: item.sale_price,
      }));

      const { data, error } = await supabase.rpc('batch_stock_entry_transaction', {
        p_supplier_id: selectedSupplierId || null,
        p_purchase_type: purchaseType || 'pesin',
        p_note: note || 'Toplu Mal Kabulü',
        p_items: payloadItems,
      });

      if (error) {
        showError(parseErrorMessage(error));
        setLoading(false);
        return;
      }

      if (data && data.success) {
        const msg = selectedSupplierId
          ? `Mal Girişi Başarıyla İşlendi! Tedarikçiye +${formatCurrency(data.debt_added)} borç yazıldı (Güncel Borç: ${formatCurrency(data.new_supplier_balance)}).`
          : `Mal Girişi Başarıyla Tamamlandı! (${data.items_processed} Kalem Ürün Stokta)`;

        showSuccess(msg);
        setShowConfirmation(false);
        onClose();
        if (onSuccess) onSuccess();
      } else {
        showError('Stok kabul işlemi gerçekleştirilemedi.');
      }
    } catch (err) {
      showError(parseErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const filteredSearchProducts = searchQuery.trim()
    ? products.filter(
        (p) =>
          p.product_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          (p.barcode && p.barcode.toLowerCase().includes(searchQuery.toLowerCase()))
      )
    : [];

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4">
        <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-md" onClick={onClose} />

        <div className="relative bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-4xl shadow-2xl z-10 overflow-hidden flex flex-col max-h-[95vh] my-auto">
          {/* Modal Header */}
          <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between bg-slate-900">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
                <Boxes className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base sm:text-lg font-bold text-white">Depoya Mal Girişi & Çoklu Stok Kabul</h2>
                <p className="text-xs text-slate-400">Tedarikçiden gelen ürünlerin stok kabulünü ve alış fiyatlarını kaydedin.</p>
              </div>
            </div>
            <button onClick={onClose} className="p-2 text-slate-400 hover:text-white rounded-lg bg-slate-800">
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Modal Body */}
          {fetchingData ? (
            <div className="p-12 text-center text-slate-400 flex flex-col items-center">
              <Loader2 className="w-8 h-8 animate-spin text-indigo-500 mb-2" />
              <span>Ürünler ve Tedarikçiler Yükleniyor...</span>
            </div>
          ) : showConfirmation ? (
            /* STEP 2: CONFIRMATION OVERLAY */
            <div className="p-5 sm:p-6 space-y-5 overflow-y-auto custom-scrollbar">
              <div className="bg-slate-950 p-5 rounded-2xl border border-indigo-500/40 space-y-4 shadow-xl">
                <div className="flex items-center gap-2 text-indigo-400 text-sm font-bold uppercase tracking-wider">
                  <AlertCircle className="w-5 h-5" />
                  <span>Depo Mal Kabulü Son Onay Özeti</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                  <div className="bg-slate-900 p-3.5 rounded-xl border border-slate-800">
                    <span className="text-slate-400 block font-medium">Tedarikçi Firma</span>
                    <span className="font-bold text-white text-sm mt-0.5 block">
                      {selectedSupplier?.company_name || 'Tedarikçi Belirtilmedi'}
                    </span>
                  </div>

                  <div className="bg-slate-900 p-3.5 rounded-xl border border-slate-800">
                    <span className="text-slate-400 block font-medium">Ödeme Durumu</span>
                    <span
                      className={`inline-block px-2.5 py-0.5 rounded text-xs font-extrabold uppercase mt-1 ${
                        purchaseType === 'vadeli'
                          ? 'bg-amber-950 text-amber-300 border border-amber-800/50'
                          : 'bg-emerald-950 text-emerald-300 border border-emerald-800/50'
                      }`}
                    >
                      {purchaseType === 'vadeli' ? 'VADELİ ALIM (+Borçlandırılır)' : 'PEŞİN ALIM (Borçsuz)'}
                    </span>
                  </div>
                </div>

                {/* Items preview table */}
                <div className="border border-slate-800 rounded-xl overflow-hidden bg-slate-900">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-950 text-slate-400 font-semibold border-b border-slate-800">
                      <tr>
                        <th className="p-3">Ürün</th>
                        <th className="p-3 text-center">Giriş Miktarı</th>
                        <th className="p-3 text-right">Birim Alış</th>
                        <th className="p-3 text-right">Satış Fiyatı</th>
                        <th className="p-3 text-right">Kalem Toplamı</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 text-slate-200">
                      {items.map((item, idx) => (
                        <tr key={idx}>
                          <td className="p-3 font-bold text-white">{item.product_name}</td>
                          <td className="p-3 text-center font-bold">{item.quantity} {item.unit}</td>
                          <td className="p-3 text-right font-medium">{formatCurrency(item.unit_cost)}</td>
                          <td className="p-3 text-right font-medium text-emerald-400">{formatCurrency(item.sale_price)}</td>
                          <td className="p-3 text-right font-extrabold text-white">
                            {formatCurrency(item.quantity * item.unit_cost)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Financial Totals */}
                <div className="bg-slate-900 p-4 rounded-xl border border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-4">
                  <div>
                    <span className="text-slate-400 text-xs font-semibold block">TOPLAM MAL ALIŞ TUTARI</span>
                    <span className="text-xl font-black text-white">{formatCurrency(totalBatchCost)}</span>
                  </div>

                  <div className="text-right">
                    <span className="text-slate-400 text-xs font-semibold block">TEDARİKÇİYE EKLENECEK BORÇ</span>
                    <span className={`text-xl font-black ${purchaseType === 'vadeli' ? 'text-amber-400' : 'text-slate-400'}`}>
                      {purchaseType === 'vadeli' ? `+${formatCurrency(totalBatchCost)}` : '0,00 TL (Borçsuz)'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Action buttons */}
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
                  onClick={handleConfirmBatchIntake}
                  disabled={loading}
                  className="py-2.5 px-6 rounded-xl bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-white font-bold text-xs shadow-lg shadow-emerald-600/25 flex items-center gap-2 transition-all disabled:opacity-50 active:scale-98"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Stoklar İşleniyor...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Mal Girişini Tamamla</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          ) : (
            /* STEP 1: MULTI-ITEM BATCH FORM */
            <form onSubmit={handlePrepareSubmit} className="p-4 sm:p-6 space-y-5 overflow-y-auto custom-scrollbar">
              {/* Top Controls: Supplier & Mandatory Payment Status Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-slate-950 p-4 rounded-2xl border border-slate-800">
                {/* Supplier Dropdown */}
                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <Building2 className="w-4 h-4 text-indigo-400" />
                    <span>1. Tedarikçi Firma Seçin *</span>
                  </label>
                  <SearchableSelect
                    options={suppliers.map((s) => ({
                      id: s.id,
                      label: s.company_name,
                      sublabel: s.contact_person || undefined,
                      searchText: `${s.phone || ''} ${s.email || ''}`,
                    }))}
                    value={selectedSupplierId}
                    onChange={(val) => setSelectedSupplierId(val)}
                    placeholder="Tedarikçi adı veya tel no yazarak arayın..."
                    searchPlaceholder="Tedarikçi ara..."
                    emptyMessage="Eşleşen tedarikçi bulunamadı."
                  />
                </div>

                {/* Ödeme Durumu Selection Cards */}
                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                    2. Ödeme Durumu (Zorunlu Seçim) *
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setPurchaseType('pesin')}
                      className={`p-2.5 rounded-xl border flex flex-col items-center justify-center transition-all text-center ${
                        purchaseType === 'pesin'
                          ? 'bg-emerald-950/80 border-emerald-500 text-emerald-300 shadow-inner ring-2 ring-emerald-500/30'
                          : 'bg-slate-900 border-slate-700 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <span className="font-extrabold text-xs block">💵 PEŞİN ALIM</span>
                      <span className="text-[10px] text-slate-400 font-normal">Borç Yazılmaz</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setPurchaseType('vadeli')}
                      className={`p-2.5 rounded-xl border flex flex-col items-center justify-center transition-all text-center ${
                        purchaseType === 'vadeli'
                          ? 'bg-amber-950/80 border-amber-500 text-amber-300 shadow-inner ring-2 ring-amber-500/30'
                          : 'bg-slate-900 border-slate-700 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <span className="font-extrabold text-xs block">📅 VADELİ ALIM</span>
                      <span className="text-[10px] text-amber-200/80 font-normal">+Tedarikçi Borcu</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Add Product Search & Barcode Bar */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                    <Barcode className="w-4 h-4 text-indigo-400" />
                    <span>3. Ürün Ekle / Barkod Okut</span>
                  </label>

                  <button
                    type="button"
                    onClick={() => setInlineProductModalOpen(true)}
                    className="text-xs font-bold text-emerald-400 hover:text-emerald-300 flex items-center gap-1 bg-emerald-950/50 border border-emerald-800/60 px-2.5 py-1 rounded-lg transition-all"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>+ Yeni Ürün Oluştur</span>
                  </button>
                </div>

                <div className="relative flex items-center gap-2">
                  <div className="relative flex-1">
                    <Search className="w-4 h-4 absolute left-3.5 top-3.5 text-slate-500" />
                    <input
                      ref={searchInputRef}
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleSearchSubmit();
                        }
                      }}
                      placeholder="Ürün adı yazın veya barkod okutun..."
                      className="w-full bg-slate-950 border border-slate-700 focus:border-indigo-500 rounded-xl py-2.5 pl-10 pr-4 text-xs sm:text-sm text-slate-100 outline-none"
                    />

                    {/* Filter dropdown list if partial matches */}
                    {filteredSearchProducts.length > 0 && (
                      <div className="absolute top-full left-0 right-0 mt-1 bg-slate-950 border border-slate-800 rounded-xl shadow-2xl z-30 max-h-48 overflow-y-auto divide-y divide-slate-800 custom-scrollbar">
                        {filteredSearchProducts.map((prod) => (
                          <button
                            key={prod.id}
                            type="button"
                            onClick={() => addItemToBatch(prod)}
                            className="w-full text-left p-3 hover:bg-slate-900 flex items-center justify-between transition-colors text-xs"
                          >
                            <div>
                              <div className="font-bold text-white">{prod.product_name}</div>
                              <div className="text-[11px] text-slate-400 font-mono">
                                Barkod: {prod.barcode || '-'} | Stok: {prod.current_stock} {prod.unit}
                              </div>
                            </div>
                            <span className="font-semibold text-slate-300">{formatCurrency(prod.purchase_price)}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Items List / Table */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs text-slate-400 font-semibold uppercase tracking-wider">
                  <span>Mal Girişi Yapılacak Ürünler ({items.length})</span>
                  <span>Toplam Miktar: {totalQuantity} Adet</span>
                </div>

                {items.length === 0 ? (
                  <div className="border-2 border-dashed border-slate-800 rounded-2xl p-8 text-center text-slate-500 space-y-2">
                    <ShoppingBag className="w-8 h-8 mx-auto text-slate-600 mb-1" />
                    <p className="text-xs font-semibold">Henüz ürün eklenmedi.</p>
                    <p className="text-[11px] text-slate-600">
                      Yukarıdaki arama çubuğundan ürün arayın, barkod okutun veya "+ Yeni Ürün Oluştur" butonuna basın.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {items.map((item, idx) => {
                      const unitProfit = item.sale_price - item.unit_cost;
                      const marginPercent =
                        item.unit_cost > 0 ? (unitProfit / item.unit_cost) * 100 : 0;

                      return (
                        <div
                          key={idx}
                          className="bg-slate-950 border border-slate-800 p-3.5 sm:p-4 rounded-xl space-y-3 relative group"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <h4 className="font-bold text-white text-sm">{item.product_name}</h4>
                              <div className="text-[11px] text-slate-400 font-mono mt-0.5">
                                {item.barcode ? `Barkod: ${item.barcode}` : 'Barkodsuz Ürün'} | Birim: {item.unit}
                              </div>
                            </div>

                            <button
                              type="button"
                              onClick={() => handleRemoveItem(idx)}
                              className="p-1.5 text-slate-500 hover:text-rose-400 hover:bg-rose-950/40 rounded-lg transition-colors"
                              title="Listeden Çıkar"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1 border-t border-slate-900">
                            {/* Miktar */}
                            <div>
                              <label className="block text-[11px] text-slate-400 font-semibold mb-1">
                                Giriş Miktarı ({item.unit}) *
                              </label>
                              <input
                                type="number"
                                step="0.01"
                                min={0.01}
                                required
                                value={item.quantity}
                                onChange={(e) =>
                                  handleUpdateItem(idx, 'quantity', Number(e.target.value) || 0)
                                }
                                className="w-full bg-slate-900 border border-slate-700 focus:border-indigo-500 rounded-lg p-2 text-white text-xs font-bold outline-none"
                              />
                            </div>

                            {/* Birim Alış Fiyatı */}
                            <div>
                              <label className="block text-[11px] text-slate-400 font-semibold mb-1">
                                Birim Alış Fiyatı (TL) *
                              </label>
                              <input
                                type="number"
                                step="0.01"
                                min={0}
                                required
                                value={item.unit_cost}
                                onChange={(e) =>
                                  handleUpdateItem(idx, 'unit_cost', Number(e.target.value) || 0)
                                }
                                className="w-full bg-slate-900 border border-slate-700 focus:border-indigo-500 rounded-lg p-2 text-white text-xs font-bold outline-none"
                              />
                            </div>

                            {/* Birim Satış Fiyatı */}
                            <div>
                              <label className="block text-[11px] text-slate-400 font-semibold mb-1">
                                Birim Satış Fiyatı (TL) *
                              </label>
                              <input
                                type="number"
                                step="0.01"
                                min={0}
                                required
                                value={item.sale_price}
                                onChange={(e) =>
                                  handleUpdateItem(idx, 'sale_price', Number(e.target.value) || 0)
                                }
                                className="w-full bg-slate-900 border border-slate-700 focus:border-indigo-500 rounded-lg p-2 text-emerald-400 text-xs font-bold outline-none"
                              />
                            </div>
                          </div>

                          {/* Live Profit Preview & Line Subtotal */}
                          <div className="flex items-center justify-between text-xs pt-1">
                            <div className="flex items-center gap-1.5">
                              <span className="text-[11px] text-slate-400 font-medium">Birim Kâr:</span>
                              <span
                                className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                                  unitProfit >= 0
                                    ? 'bg-emerald-950 text-emerald-400 border border-emerald-800/40'
                                    : 'bg-rose-950 text-rose-400 border border-rose-800/40'
                                }`}
                              >
                                {unitProfit >= 0 ? '+' : ''}
                                {formatCurrency(unitProfit)} (%{marginPercent.toFixed(1)})
                              </span>
                            </div>

                            <div className="text-right">
                              <span className="text-slate-400 text-[11px]">Kalem Toplamı: </span>
                              <span className="font-extrabold text-white text-sm">
                                {formatCurrency(item.quantity * item.unit_cost)}
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Note */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                  Açıklama / İrsaliye No / Not
                </label>
                <textarea
                  rows={2}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Örn: ABC Gıda İrsaliye No: 9812 / Toplu Depo Kabulü"
                  className="w-full bg-slate-950 border border-slate-700 focus:border-indigo-500 rounded-xl p-3 text-slate-100 text-xs outline-none"
                />
              </div>

              {/* Footer Sticky Summary Bar */}
              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-4">
                <div>
                  <span className="text-slate-400 text-xs font-semibold block uppercase">TOPLAM ALIŞ MALİYETİ</span>
                  <span className="text-xl font-black text-white">{formatCurrency(totalBatchCost)}</span>
                </div>

                <div className="flex items-center gap-3">
                  <div className="text-right hidden sm:block">
                    <span className="text-slate-400 text-xs font-semibold block uppercase">TEDARİKÇİYE EKLENECEK BORÇ</span>
                    <span className={`text-base font-black ${purchaseType === 'vadeli' ? 'text-amber-400' : 'text-slate-400'}`}>
                      {purchaseType === 'vadeli' ? `+${formatCurrency(totalBatchCost)}` : '0,00 TL'}
                    </span>
                  </div>

                  <button
                    type="submit"
                    disabled={items.length === 0}
                    className="py-3 px-6 rounded-xl bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 text-white font-bold text-xs shadow-lg shadow-indigo-500/25 flex items-center gap-2 transition-all disabled:opacity-50 active:scale-98"
                  >
                    <span>Devam Et & Onayla</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </form>
          )}
        </div>
      </div>

      {/* Inline Product Creation Modal */}
      <CreateProductInlineModal
        isOpen={inlineProductModalOpen}
        onClose={() => setInlineProductModalOpen(false)}
        initialBarcode={searchQuery}
        onSuccess={(newProduct) => {
          addItemToBatch(newProduct);
        }}
      />
    </>
  );
};
