import React, { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { formatDateTime } from '@/utils/formatters';
import { AuditLog } from '@/types/database.types';
import { ShieldCheck, Search, Loader2, Filter } from 'lucide-react';

export const AuditLogs: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [actionFilter, setActionFilter] = useState('ALL');

  const fetchAuditLogs = useCallback(async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('audit_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(200);

      if (actionFilter !== 'ALL') {
        query = query.eq('action', actionFilter);
      }

      const { data, error } = await query;
      if (error) throw error;
      setLogs(data || []);
    } catch (err) {
      console.error('Audit logs yükleme hatası:', err);
    } finally {
      setLoading(false);
    }
  }, [actionFilter]);

  useEffect(() => {
    fetchAuditLogs();
  }, [fetchAuditLogs]);

  const filteredLogs = logs.filter((l) => {
    const q = searchQuery.toLowerCase().trim();
    const action = l.action.toLowerCase();
    const entity = l.entity_type.toLowerCase();
    const details = JSON.stringify(l.details || {}).toLowerCase();
    return !q || action.includes(q) || entity.includes(q) || details.includes(q);
  });

  const getActionBadgeClass = (action: string) => {
    if (action.includes('LOGIN')) return 'bg-emerald-950 text-emerald-300 border-emerald-800/50';
    if (action.includes('LOGOUT')) return 'bg-slate-800 text-slate-400 border-slate-700';
    if (action.includes('SALE')) return 'bg-brand-950 text-brand-300 border-brand-800/50';
    if (action.includes('PAYMENT')) return 'bg-emerald-950 text-emerald-300 border-emerald-800/50';
    if (action.includes('STOCK')) return 'bg-indigo-950 text-indigo-300 border-indigo-800/50';
    return 'bg-purple-950 text-purple-300 border-purple-800/50';
  };

  return (
    <div className="space-y-6 pb-8">
      {/* Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900 border border-slate-800 p-4 sm:p-6 rounded-2xl">
        <div>
          <h2 className="text-xl font-bold text-white tracking-tight">Sistem Denetim Günlüğü (Audit Log)</h2>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Giriş/çıkışlar, fiyat değişiklikleri, stok düzeltmeleri ve finansal tüm kritik kullanıcı eylemlerinin geri dönük kayıtları.
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl flex flex-col sm:flex-row items-center gap-3">
        <div className="relative flex-1 w-full">
          <Search className="w-4 h-4 absolute left-3.5 top-3 text-slate-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="İşlem adı veya detaylarda arayın..."
            className="w-full bg-slate-950 border border-slate-700 focus:border-brand-500 rounded-xl py-2 pl-10 pr-4 text-xs sm:text-sm text-slate-100 placeholder-slate-500 outline-none"
          />
        </div>

        <div className="w-full sm:w-60">
          <select
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            className="w-full bg-slate-950 border border-slate-700 focus:border-brand-500 rounded-xl p-2 text-xs text-slate-100 outline-none"
          >
            <option value="ALL">Tüm Eylemler</option>
            <option value="LOGIN">Giriş Yapma (LOGIN)</option>
            <option value="LOGOUT">Çıkış Yapma (LOGOUT)</option>
            <option value="CREATE_SALE">Satış Oluşturma</option>
            <option value="CREATE_PAYMENT">Tahsilat Alma</option>
            <option value="STOCK_MOVEMENT">Stok Düzeltme / Mal Girişi</option>
            <option value="CREATE_PRODUCT">Ürün Ekleme</option>
            <option value="UPDATE_PRODUCT">Ürün Fiyat / Kart Düzenleme</option>
            <option value="CREATE_CUSTOMER">Müşteri Ekleme</option>
          </select>
        </div>
      </div>

      {/* Logs Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        {loading ? (
          <div className="p-12 text-center text-slate-400 flex flex-col items-center">
            <Loader2 className="w-8 h-8 animate-spin text-brand-500 mb-2" />
            <span>Denetim Günlüğü Yükleniyor...</span>
          </div>
        ) : filteredLogs.length === 0 ? (
          <div className="p-12 text-center text-slate-500 text-sm">
            Kayıtlı denetim günlüğü bulunamadı.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950 text-slate-400 uppercase tracking-wider font-semibold border-b border-slate-800">
                <tr>
                  <th className="p-4">Tarih / Saat</th>
                  <th className="p-4 text-center">Eylem Kodu</th>
                  <th className="p-4">Varlık Tipi</th>
                  <th className="p-4">Detaylar</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70 text-slate-200">
                {filteredLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-800/40 transition-colors">
                    <td className="p-4 font-mono text-slate-400">
                      {formatDateTime(log.created_at)}
                    </td>

                    <td className="p-4 text-center">
                      <span
                        className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase border ${getActionBadgeClass(
                          log.action
                        )}`}
                      >
                        {log.action}
                      </span>
                    </td>

                    <td className="p-4 font-semibold text-slate-300 uppercase">
                      {log.entity_type}
                    </td>

                    <td className="p-4 font-mono text-[11px] text-slate-300 max-w-md truncate">
                      {JSON.stringify(log.details)}
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
