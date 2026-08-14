import React, { useState, useEffect } from 'react';
import { 
  PackageSearch, 
  Truck, 
  PlusCircle, 
  CheckCircle, 
  AlertTriangle, 
  Layers, 
  RefreshCw,
  X,
  FileCheck,
  Building2
} from 'lucide-react';
import { SupplyDemandAnalysisItem, Supplier, Product } from '@/types/database.types';
import { preOrderService } from '@/services/preOrderService';
import { supabase } from '@/lib/supabase';
import { formatCurrency } from '@/utils/formatters';
import { useToast } from '@/context/ToastContext';
import { FulfillPreOrderModal } from '@/components/modals/FulfillPreOrderModal';

export const SupplyPlan: React.FC = () => {
  const { showToast } = useToast();
  const [analysis, setAnalysis] = useState<SupplyDemandAnalysisItem[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Assign Supplier Modal state
  const [selectedItemForSupplier, setSelectedItemForSupplier] = useState<SupplyDemandAnalysisItem | null>(null);
  const [assignedSupplierId, setAssignedSupplierId] = useState('');
  const [unitCost, setUnitCost] = useState<number>(0);
  const [orderQty, setOrderQty] = useState<number>(0);
  const [supplyNotes, setSupplyNotes] = useState('');
  
  // Create Supply Order State
  const [isFulfillModalOpen, setIsFulfillModalOpen] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const data = await preOrderService.getSupplyDemandAnalysis();
      setAnalysis(data);

      const { data: sups } = await supabase
        .from('suppliers')
        .select('*')
        .is('deleted_at', null)
        .eq('active', true)
        .order('company_name');
      setSuppliers(sups || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenAssignSupplier = (item: SupplyDemandAnalysisItem) => {
    setSelectedItemForSupplier(item);
    setAssignedSupplierId(item.assigned_supplier_id || (suppliers[0]?.id || ''));
    setUnitCost(item.estimated_purchase_price || 0);
    setOrderQty(item.needed_quantity > 0 ? item.needed_quantity : item.total_demanded);
    setSupplyNotes('');
  };

  const handleCreateSupplyOrder = async () => {
    if (!selectedItemForSupplier || !assignedSupplierId) {
      showToast('Lütfen bir tedarikçi seçiniz.', 'error');
      return;
    }
    if (orderQty <= 0) {
      showToast('Sipariş miktarı 0’dan büyük olmalıdır.', 'error');
      return;
    }

    try {
      setLoading(true);
      const itemsToOrder = selectedItemForSupplier.pre_order_items.map((pi) => ({
        product_id: selectedItemForSupplier.product_id,
        product_name: selectedItemForSupplier.product_name,
        quantity: pi.demanded_quantity - pi.fulfilled_quantity,
        unit_cost: unitCost,
        pre_order_item_id: pi.id,
      }));

      const res = await preOrderService.createSupplyOrder(
        assignedSupplierId,
        supplyNotes || `Tedarik Siparişi (${selectedItemForSupplier.product_name})`,
        itemsToOrder.length > 0
          ? itemsToOrder
          : [
              {
                product_id: selectedItemForSupplier.product_id,
                product_name: selectedItemForSupplier.product_name,
                quantity: orderQty,
                unit_cost: unitCost,
              },
            ]
      );

      showToast(`Tedarik Siparişi (${res.supply_order_number}) başarıyla oluşturuldu! (Stok/Cari henüz etkilenmedi)`, 'success');
      setSelectedItemForSupplier(null);
      fetchData();
    } catch (err: any) {
      showToast(err.message || 'Tedarik siparişi oluşturulurken hata oluştu.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const totalDemandedAll = analysis.reduce((sum, i) => sum + i.total_demanded, 0);
  const totalNeededAll = analysis.reduce((sum, i) => sum + i.needed_quantity, 0);

  return (
    <div className="space-y-6 pb-12 animate-fadeIn">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900 border border-slate-800 p-5 rounded-2xl shadow-xl">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-purple-600 to-brand-500 flex items-center justify-center text-white text-2xl font-black shadow-lg shadow-purple-500/20">
            📦
          </div>
          <div>
            <h1 className="text-xl font-bold text-white tracking-tight">Tedarik Planı & İhtiyaç Analizi</h1>
            <p className="text-xs text-slate-400">
              Müşterilerden toplanan ön siparişler ile mevcut stokları karşılaştırarak eksik ürünleri tedarik et
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsFulfillModalOpen(true)}
            className="w-full sm:w-auto bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-4 py-2.5 rounded-xl text-xs sm:text-sm transition-all flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20"
          >
            <Layers className="w-4 h-4" />
            <span>Ön Siparişleri Karşıla</span>
          </button>

          <button
            onClick={fetchData}
            className="p-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl transition-colors"
            title="Analizi Yenile"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl space-y-1">
          <p className="text-xs text-slate-400 font-medium">Farklı Ürün Sayısı</p>
          <p className="text-xl sm:text-2xl font-black text-white">{analysis.length}</p>
        </div>

        <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl space-y-1">
          <p className="text-xs text-slate-400 font-medium">Toplam Talep Adedi</p>
          <p className="text-xl sm:text-2xl font-black text-amber-400">{totalDemandedAll} Adet</p>
        </div>

        <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl space-y-1">
          <p className="text-xs text-slate-400 font-medium">Net Eksik / Tedarik İhtiyacı</p>
          <p className="text-xl sm:text-2xl font-black text-rose-400">{totalNeededAll} Adet</p>
        </div>

        <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl space-y-1">
          <p className="text-xs text-slate-400 font-medium">Aktif Tedarikçi Sayısı</p>
          <p className="text-xl sm:text-2xl font-black text-brand-400">{suppliers.length}</p>
        </div>
      </div>

      {/* Main Analysis Table */}
      {loading ? (
        <div className="p-12 text-center text-slate-500 text-sm">Tedarik ihtiyacı analiz ediliyor...</div>
      ) : analysis.length === 0 ? (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center text-slate-400 space-y-3">
          <CheckCircle className="w-12 h-12 text-emerald-400 mx-auto opacity-80" />
          <p className="text-sm font-semibold text-white">Tedarik edilecek ürün bulunmuyor!</p>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            Açık ön sipariş talebiniz yok veya mevcut stoklarınız açık tüm ön siparişleri karşılamaya yetiyor.
          </p>
        </div>
      ) : (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
          <div className="p-4 border-b border-slate-800 bg-slate-900/50 flex items-center justify-between">
            <h2 className="font-bold text-white text-sm">BU HAFTA TOPLAM ÜRÜN TALEPLERİ VE TEDARİK DURUMU</h2>
            <span className="text-xs text-slate-400">{analysis.length} Kalem Ürün</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-800/60 text-slate-400 font-semibold border-b border-slate-800">
                <tr>
                  <th className="p-4">Ürün Adı / Marka</th>
                  <th className="p-4 text-center">Toplam Talep</th>
                  <th className="p-4 text-center">Mevcut Stok</th>
                  <th className="p-4 text-center">Rezerve Stok</th>
                  <th className="p-4 text-center">Açık Talep</th>
                  <th className="p-4 text-center">Eksik Miktar</th>
                  <th className="p-4 text-center">Atanan Tedarikçi</th>
                  <th className="p-4 text-right">İşlem</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {analysis.map((item, idx) => {
                  const hasShortage = item.needed_quantity > 0;
                  return (
                    <tr
                      key={item.product_id || idx}
                      className={`hover:bg-slate-800/40 transition-colors ${
                        hasShortage ? 'bg-rose-950/10' : ''
                      }`}
                    >
                      <td className="p-4">
                        <div className="font-bold text-white">{item.product_name}</div>
                        <div className="text-[11px] text-slate-400">
                          {item.brand ? `${item.brand} • ` : ''}Birim: {item.unit}
                        </div>
                      </td>
                      <td className="p-4 text-center font-bold text-slate-200">
                        {item.total_demanded} {item.unit}
                      </td>
                      <td className="p-4 text-center font-bold text-emerald-400">
                        {item.current_stock} {item.unit}
                      </td>
                      <td className="p-4 text-center text-slate-400">
                        {item.reserved_stock} {item.unit}
                      </td>
                      <td className="p-4 text-center font-bold text-amber-300">
                        {item.open_demand} {item.unit}
                      </td>
                      <td className="p-4 text-center">
                        {hasShortage ? (
                          <span className="inline-flex items-center gap-1 font-black text-rose-400 bg-rose-950/60 border border-rose-800/60 px-2.5 py-1 rounded-lg">
                            <AlertTriangle className="w-3 h-3" />
                            {item.needed_quantity} {item.unit} Eksik
                          </span>
                        ) : (
                          <span className="text-emerald-400 font-semibold">✓ Stok Yeterli</span>
                        )}
                      </td>
                      <td className="p-4 text-center">
                        {item.assigned_supplier_name ? (
                          <span className="text-brand-300 font-semibold bg-brand-950/60 border border-brand-800/60 px-2 py-0.5 rounded-md">
                            {item.assigned_supplier_name}
                          </span>
                        ) : (
                          <span className="text-slate-500 italic">Atanmadı</span>
                        )}
                      </td>
                      <td className="p-4 text-right">
                        <button
                          onClick={() => handleOpenAssignSupplier(item)}
                          className="bg-brand-600/20 border border-brand-500/30 hover:bg-brand-600 hover:text-white text-brand-300 font-semibold px-3 py-1.5 rounded-xl transition-all text-xs flex items-center gap-1 ml-auto"
                        >
                          <Truck className="w-3.5 h-3.5" />
                          <span>[Tedarikçi Ata]</span>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Assign Supplier & Create Supply Order Modal */}
      {selectedItemForSupplier && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fadeIn">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden text-slate-200">
            <div className="flex items-center justify-between p-5 border-b border-slate-800 bg-slate-900/50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400">
                  <Building2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-white tracking-tight">Tedarikçi Ata & Sipariş Oluştur</h3>
                  <p className="text-xs text-slate-400">{selectedItemForSupplier.product_name}</p>
                </div>
              </div>
              <button
                onClick={() => setSelectedItemForSupplier(null)}
                className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4 text-xs">
              <div className="bg-slate-800/60 p-3 rounded-xl border border-slate-700/60 flex justify-between items-center">
                <div>
                  <span className="text-slate-400">Ön Sipariş Talebi:</span>
                  <span className="ml-1 font-bold text-amber-300">
                    {selectedItemForSupplier.total_demanded} {selectedItemForSupplier.unit}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400">Eksik Miktar:</span>
                  <span className="ml-1 font-bold text-rose-400">
                    {selectedItemForSupplier.needed_quantity} {selectedItemForSupplier.unit}
                  </span>
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-300 mb-1.5">Tedarikçi Firma Seçin</label>
                <select
                  value={assignedSupplierId}
                  onChange={(e) => setAssignedSupplierId(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 text-white rounded-xl px-4 py-2.5 outline-none font-medium"
                >
                  <option value="">-- Tedarikçi Seçiniz --</option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.company_name} {s.contact_person ? `(${s.contact_person})` : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-300 mb-1.5">Sipariş Miktarı ({selectedItemForSupplier.unit})</label>
                  <input
                    type="number"
                    min="1"
                    value={orderQty}
                    onChange={(e) => setOrderQty(Number(e.target.value))}
                    className="w-full bg-slate-800 border border-slate-700 text-white font-bold rounded-xl px-3 py-2 text-center outline-none"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-300 mb-1.5">Birim Alış Fiyatı (TL)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={unitCost}
                    onChange={(e) => setUnitCost(Number(e.target.value))}
                    className="w-full bg-slate-800 border border-slate-700 text-white font-bold rounded-xl px-3 py-2 text-right outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-300 mb-1.5">Sipariş Notu</label>
                <input
                  type="text"
                  placeholder="Tedarikçi sipariş notu..."
                  value={supplyNotes}
                  onChange={(e) => setSupplyNotes(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 text-white rounded-xl px-3 py-2 outline-none"
                />
              </div>

              <div className="bg-purple-950/40 border border-purple-800/40 p-3 rounded-xl text-purple-300 text-[11px]">
                ℹ️ Bu aşamada mal depoya henüz girmediği için <strong>stok artmayacak ve tedarikçi borcu oluşmayacaktır</strong>.
              </div>
            </div>

            <div className="p-5 border-t border-slate-800 bg-slate-900/50 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setSelectedItemForSupplier(null)}
                className="px-4 py-2.5 rounded-xl border border-slate-700 text-slate-300 hover:bg-slate-800 font-medium text-xs transition-colors"
              >
                İptal
              </button>
              <button
                type="button"
                onClick={handleCreateSupplyOrder}
                disabled={loading}
                className="bg-purple-600 hover:bg-purple-500 text-white font-semibold px-5 py-2.5 rounded-xl text-xs transition-colors flex items-center gap-2 shadow-lg shadow-purple-500/20 disabled:opacity-50"
              >
                <FileCheck className="w-4 h-4" />
                <span>Tedarik Siparişi Oluştur</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Fulfill Pre Order Modal */}
      <FulfillPreOrderModal
        isOpen={isFulfillModalOpen}
        onClose={() => setIsFulfillModalOpen(false)}
        onSuccess={fetchData}
      />
    </div>
  );
};
