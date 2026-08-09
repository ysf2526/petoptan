import React, { useEffect, useState, useCallback } from 'react';
import { useOutletContext } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { formatDateTime, formatCurrency, formatNumber } from '@/utils/formatters';
import { StockMovement, MovementType } from '@/types/database.types';
import { LayoutContextType } from '@/components/layout/Layout';
import { Boxes, Search, Plus, Loader2, ArrowUpRight, ArrowDownLeft, RefreshCcw, AlertTriangle } from 'lucide-react';

export const StockMovements: React.FC = () => {
  const { openStockEntryModal } = useOutletContext<LayoutContextType>();

  const [loading, setLoading] = useState(true);
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('ALL');

  const fetchMovements = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('stock_movements')
        .select(`
          *,
          products (product_name, brand, unit)
        `)
        .is('deleted_at', null)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setMovements(data || []);
    } catch (err) {
      console.error('Stok hareketleri yükleme hatası:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMovements();
    const handleRefresh = () => fetchMovements();
    window.addEventListener('refresh-data', handleRefresh);
    return () => window.removeEventListener('refresh-data', handleRefresh);
  }, [fetchMovements]);

  const filteredMovements = movements.filter((m) => {
    const q = searchQuery.toLowerCase().trim();
    const prodName = m.products?.product_name?.toLowerCase() || '';
    const note = m.note?.toLowerCase() || '';
    const matchesQuery = !q || prodName.includes(q) || note.includes(q);

    const matchesType = typeFilter === 'ALL' || m.movement_type === typeFilter;
    return matchesQuery && matchesType;
  });

  const getBadgeStyle = (type: MovementType) => {
    switch (type) {
      case 'PURCHASE':
        return 'bg-emerald-950 text-emerald-300 border-emerald-800/50';
      case 'SALE':
        return 'bg-brand-950 text-brand-300 border-brand-800/50';
      case 'RETURN':
        return 'bg-purple-950 text-purple-300 border-purple-800/50';
      case 'ADJUSTMENT':
        return 'bg-indigo-950 text-indigo-300 border-indigo-800/50';
      case 'DAMAGE':
        return 'bg-rose-950 text-rose-300 border-rose-800/50';
      default:
        return 'bg-slate-800 text-slate-300 border-slate-700';
    }
  };

  const getMovementLabel = (type: MovementType) => {
    switch (type) {
      case 'PURCHASE':
        return 'Mal Girişi (+)';
      case 'SALE':
        return 'Satış (-)';
      case 'RETURN':
        return 'İade (+)';
      case 'ADJUSTMENT':
        return 'Sayım Düzeltme';
      case 'DAMAGE':
        return 'Hasar/Zayiat (-)';
      case 'INITIAL':
        return 'İlk Stok';
      default:
        return type;
    }
  };

  return (
    <div className="space-y-6">
      {/* Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900 border border-slate-800 p-4 sm:p-6 rounded-2xl">
        <div>
          <h2 className="text-xl font-bold text-white tracking-tight">Stok Hareketleri & Depo Girişleri</h2>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Gelen ürünlerin, satış çıkışlarının ve depo sayım düzeltmelerinin tam audit günlüğü.
          </p>
        </div>
        <button
          onClick={() => openStockEntryModal()}
          className="self-start sm:self-center bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 text-white font-bold px-4 py-2.5 rounded-xl shadow-lg shadow-indigo-500/20 text-xs sm:text-sm flex items-center gap-2 transition-all active:scale-95"
        >
          <Plus className="w-4 h-4" />
          <span>Depoya Mal Girişi Yap</span>
        </button>
      </div>

      {/* Filters */}
      <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl flex flex-col sm:flex-row items-center gap-3">
        <div className="relative flex-1 w-full">
          <Search className="w-4 h-4 absolute left-3.5 top-3 text-slate-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Ürün adı veya açıklama ile arayın..."
            className="w-full bg-slate-950 border border-slate-700 focus:border-indigo-500 rounded-xl py-2 pl-10 pr-4 text-xs sm:text-sm text-slate-100 placeholder-slate-500 outline-none"
          />
        </div>

        <div className="w-full sm:w-56">
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="w-full bg-slate-950 border border-slate-700 focus:border-indigo-500 rounded-xl p-2 text-xs text-slate-100 outline-none"
          >
            <option value="ALL">Tüm Stok Hareketleri</option>
            <option value="PURCHASE">Mal Girişleri (+)</option>
            <option value="SALE">Satış Çıkışları (-)</option>
            <option value="RETURN">İadeler (+)</option>
            <option value="ADJUSTMENT">Sayım Düzeltmeleri</option>
            <option value="DAMAGE">Zayiat/Hasar (-)</option>
          </select>
        </div>
      </div>

      {/* Movements Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        {loading ? (
          <div className="p-12 text-center text-slate-400 flex flex-col items-center">
            <Loader2 className="w-8 h-8 animate-spin text-indigo-500 mb-2" />
            <span>Stok Geçmişi Yükleniyor...</span>
          </div>
        ) : filteredMovements.length === 0 ? (
          <div className="p-12 text-center text-slate-500 text-sm">
            Kayıtlı stok hareketi bulunamadı.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950 text-slate-400 uppercase tracking-wider font-semibold border-b border-slate-800">
                <tr>
                  <th className="p-4">Tarih / Saat</th>
                  <th className="p-4">Ürün Bilgisi</th>
                  <th className="p-4 text-center">İşlem Tipi</th>
                  <th className="p-4 text-center">Miktar</th>
                  <th className="p-4 text-right">Birim Alış Maliyeti</th>
                  <th className="p-4">Açıklama / Not</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70 text-slate-200">
                {filteredMovements.map((m) => (
                  <tr key={m.id} className="hover:bg-slate-800/40 transition-colors">
                    <td className="p-4 font-mono text-slate-400">
                      {formatDateTime(m.created_at)}
                    </td>

                    <td className="p-4 font-bold text-slate-100">
                      {m.products?.product_name || 'Bilinmeyen Ürün'}
                    </td>

                    <td className="p-4 text-center">
                      <span
                        className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase border ${getBadgeStyle(
                          m.movement_type
                        )}`}
                      >
                        {getMovementLabel(m.movement_type)}
                      </span>
                    </td>

                    <td className="p-4 text-center font-extrabold text-sm text-white">
                      {m.movement_type === 'PURCHASE' || m.movement_type === 'RETURN' ? '+' : m.movement_type === 'SALE' || m.movement_type === 'DAMAGE' ? '-' : ''}
                      {formatNumber(m.quantity)} {m.products?.unit || 'Adet'}
                    </td>

                    <td className="p-4 text-right font-medium text-slate-300">
                      {formatCurrency(m.unit_cost)}
                    </td>

                    <td className="p-4 text-slate-400 max-w-xs truncate">
                      {m.note || '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
