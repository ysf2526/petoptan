import React, { useEffect, useState, useCallback } from 'react';
import { useOutletContext } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { formatCurrency, formatDateTime } from '@/utils/formatters';
import { Sale } from '@/types/database.types';
import { LayoutContextType } from '@/components/layout/Layout';
import { SaleDetailModal } from '@/components/modals/SaleDetailModal';
import { ShoppingCart, Search, Plus, Eye, Loader2, Calendar, FileText } from 'lucide-react';

export const Sales: React.FC = () => {
  const { openNewSaleModal, openSaleDocumentModal } = useOutletContext<LayoutContextType>();

  const [loading, setLoading] = useState(true);
  const [sales, setSales] = useState<Sale[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [paymentTypeFilter, setPaymentTypeFilter] = useState<string>('ALL');

  // Detail Modal State
  const [selectedSaleId, setSelectedSaleId] = useState<string | null>(null);
  const [detailModalOpen, setDetailModalOpen] = useState(false);

  const fetchSales = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('sales')
        .select('*')
        .is('deleted_at', null)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setSales(data || []);
    } catch (err) {
      console.error('Satışları yükleme hatası:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSales();
    const handleRefresh = () => fetchSales();
    window.addEventListener('refresh-data', handleRefresh);
    return () => window.removeEventListener('refresh-data', handleRefresh);
  }, [fetchSales]);

  const filteredSales = sales.filter((s) => {
    const q = searchQuery.toLowerCase().trim();
    const matchesQuery =
      !q ||
      s.sale_number.toLowerCase().includes(q) ||
      s.customer_name.toLowerCase().includes(q);

    const matchesType = paymentTypeFilter === 'ALL' || s.payment_type === paymentTypeFilter;
    return matchesQuery && matchesType;
  });

  return (
    <div className="space-y-6">
      {/* Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900 border border-slate-800 p-4 sm:p-6 rounded-2xl">
        <div>
          <h2 className="text-xl font-bold text-white tracking-tight">Satış Geçmişi & Yönetimi</h2>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Geçmiş toptan satış kayıtları, snapshot birim fiyatları, kâr oranları ve vade durumları.
          </p>
        </div>
        <button
          onClick={openNewSaleModal}
          className="self-start sm:self-center bg-gradient-to-r from-brand-600 to-brand-500 hover:from-brand-500 hover:to-brand-400 text-white font-bold px-4 py-2.5 rounded-xl shadow-lg shadow-brand-500/20 text-xs sm:text-sm flex items-center gap-2 transition-all active:scale-95"
        >
          <Plus className="w-4 h-4" />
          <span>Yeni Satış Yap</span>
        </button>
      </div>

      {/* Search & Filter */}
      <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl flex flex-col sm:flex-row items-center gap-3">
        <div className="relative flex-1 w-full">
          <Search className="w-4 h-4 absolute left-3.5 top-3 text-slate-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Satış No veya Müşteri Adı ile arayın..."
            className="w-full bg-slate-950 border border-slate-700 focus:border-brand-500 rounded-xl py-2 pl-10 pr-4 text-xs sm:text-sm text-slate-100 placeholder-slate-500 outline-none"
          />
        </div>

        <div className="w-full sm:w-48">
          <select
            value={paymentTypeFilter}
            onChange={(e) => setPaymentTypeFilter(e.target.value)}
            className="w-full bg-slate-950 border border-slate-700 focus:border-brand-500 rounded-xl p-2 text-xs text-slate-100 outline-none"
          >
            <option value="ALL">Tüm Ödeme Türleri</option>
            <option value="vadeli">Vadeli Satışlar</option>
            <option value="pesin">Peşin Satışlar</option>
          </select>
        </div>
      </div>

      {/* Sales Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        {loading ? (
          <div className="p-12 text-center text-slate-400 flex flex-col items-center">
            <Loader2 className="w-8 h-8 animate-spin text-brand-500 mb-2" />
            <span>Satış Kayıtları Yükleniyor...</span>
          </div>
        ) : filteredSales.length === 0 ? (
          <div className="p-12 text-center text-slate-500 text-sm">
            Kayıtlı satış işlemi bulunamadı.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950 text-slate-400 uppercase tracking-wider font-semibold border-b border-slate-800">
                <tr>
                  <th className="p-4">Satış No & Tarih</th>
                  <th className="p-4">Müşteri</th>
                  <th className="p-4 text-center">Tür & Vade</th>
                  <th className="p-4 text-right">Toplam Tutar</th>
                  <th className="p-4 text-right">Alış Maliyeti</th>
                  <th className="p-4 text-right">Net Kâr</th>
                  <th className="p-4 text-center">Durum</th>
                  <th className="p-4 text-right">İşlem</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70 text-slate-200">
                {filteredSales.map((s) => {
                  const isCancelled = s.status === 'cancelled';

                  return (
                    <tr
                      key={s.id}
                      onClick={() => {
                        setSelectedSaleId(s.id);
                        setDetailModalOpen(true);
                      }}
                      className={`hover:bg-slate-800/50 cursor-pointer transition-colors ${
                        isCancelled ? 'bg-slate-950/40 opacity-75' : ''
                      }`}
                    >
                      <td className="p-4">
                        <span className={`font-bold text-white block text-sm ${isCancelled ? 'line-through text-slate-500' : ''}`}>
                          {s.sale_number}
                        </span>
                        <span className="text-[11px] text-slate-400">{formatDateTime(s.created_at)}</span>
                      </td>

                      <td className="p-4 font-semibold text-slate-100">
                        {s.customer_name}
                      </td>

                      <td className="p-4 text-center">
                        <span
                          className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                            s.payment_type === 'pesin'
                              ? 'bg-emerald-950 text-emerald-300 border border-emerald-800/50'
                              : 'bg-amber-950 text-amber-300 border border-amber-800/50'
                          }`}
                        >
                          {s.payment_type === 'pesin' ? 'Peşin' : `Vadeli (${s.term_days || 30} Gün)`}
                        </span>
                      </td>

                      <td className={`p-4 text-right font-extrabold text-sm ${isCancelled ? 'line-through text-slate-500' : 'text-white'}`}>
                        {formatCurrency(s.total_amount)}
                      </td>

                      <td className="p-4 text-right font-medium text-slate-400">
                        {formatCurrency(s.total_cost)}
                      </td>

                      <td className={`p-4 text-right font-bold ${isCancelled ? 'line-through text-slate-500' : 'text-emerald-400'}`}>
                        {formatCurrency(s.total_profit)}
                      </td>

                      <td className="p-4 text-center">
                        <span
                          className={`inline-block px-2 py-0.5 rounded text-[10px] font-extrabold uppercase ${
                            isCancelled
                              ? 'bg-rose-950/80 text-rose-400 border border-rose-800/60'
                              : s.status === 'paid'
                              ? 'bg-emerald-950 text-emerald-300'
                              : 'bg-amber-950 text-amber-300'
                          }`}
                        >
                          {isCancelled ? 'İptal Edildi' : s.status === 'paid' ? 'Ödendi' : 'Ödeme Bekliyor'}
                        </span>
                      </td>

                      <td className="p-4 text-right">
                        <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                          <button
                            onClick={() => openSaleDocumentModal(s.id)}
                            className="px-2.5 py-1 text-xs font-semibold text-blue-300 bg-blue-950/60 hover:bg-blue-900/60 border border-blue-800/40 rounded-lg flex items-center gap-1 transition-all"
                            title="Satış Belgesini Gör / Yazdır"
                          >
                            <FileText className="w-3.5 h-3.5" />
                            <span>Belge</span>
                          </button>

                          <button
                            onClick={() => {
                              setSelectedSaleId(s.id);
                              setDetailModalOpen(true);
                            }}
                            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg"
                            title="Detayları İncele & Düzenle"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Sale Detail Modal */}
      <SaleDetailModal
        isOpen={detailModalOpen}
        onClose={() => setDetailModalOpen(false)}
        saleId={selectedSaleId}
        onRefreshParent={fetchSales}
      />
    </div>
  );
};
