import React, { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { formatCurrency, formatDateTime, formatDate } from '@/utils/formatters';
import { CustomerLedger, Customer } from '@/types/database.types';
import { BookOpen, Search, Filter, Loader2, ArrowUpRight, ArrowDownLeft } from 'lucide-react';

export const Ledger: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [ledger, setLedger] = useState<CustomerLedger[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const fetchLedger = useCallback(async () => {
    setLoading(true);
    try {
      const { data: cData } = await supabase
        .from('customers')
        .select('*')
        .is('deleted_at', null)
        .order('business_name');
      setCustomers(cData || []);

      let query = supabase
        .from('customer_ledger')
        .select(`
          *,
          customers (business_name)
        `)
        .is('deleted_at', null)
        .order('created_at', { ascending: false });

      if (selectedCustomerId !== 'ALL') {
        query = query.eq('customer_id', selectedCustomerId);
      }

      const { data, error } = await query;
      if (error) throw error;

      setLedger(data || []);
    } catch (err) {
      console.error('Cari yükleme hatası:', err);
    } finally {
      setLoading(false);
    }
  }, [selectedCustomerId]);

  useEffect(() => {
    fetchLedger();
  }, [fetchLedger]);

  const filteredLedger = ledger.filter((l) => {
    const q = searchQuery.toLowerCase().trim();
    const custName = (l as any).customers?.business_name?.toLowerCase() || '';
    const desc = l.description?.toLowerCase() || '';
    return !q || custName.includes(q) || desc.includes(q);
  });

  const totalDebit = filteredLedger.reduce((sum, item) => sum + Number(item.debit || 0), 0);
  const totalCredit = filteredLedger.reduce((sum, item) => sum + Number(item.credit || 0), 0);

  return (
    <div className="space-y-6">
      {/* Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900 border border-slate-800 p-4 sm:p-6 rounded-2xl">
        <div>
          <h2 className="text-xl font-bold text-white tracking-tight">Cari Hesap Hareketleri & Ekstre</h2>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Tüm borç, tahsilat, iade ve düzeltme hareketlerinin şeffaf kayıt günlüğü.
          </p>
        </div>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl flex items-center justify-between">
          <div>
            <span className="text-xs text-slate-400 font-medium block">Filtrelenen Borç Toplamı</span>
            <span className="text-xl font-extrabold text-amber-400 block mt-1">{formatCurrency(totalDebit)}</span>
          </div>
          <div className="p-3 bg-amber-500/10 text-amber-400 rounded-xl">
            <ArrowUpRight className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl flex items-center justify-between">
          <div>
            <span className="text-xs text-slate-400 font-medium block">Filtrelenen Tahsilat Toplamı</span>
            <span className="text-xl font-extrabold text-emerald-400 block mt-1">{formatCurrency(totalCredit)}</span>
          </div>
          <div className="p-3 bg-emerald-500/10 text-emerald-400 rounded-xl">
            <ArrowDownLeft className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="relative sm:col-span-2">
          <Search className="w-4 h-4 absolute left-3.5 top-3 text-slate-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Açıklama veya firma adı ile arayın..."
            className="w-full bg-slate-950 border border-slate-700 focus:border-brand-500 rounded-xl py-2 pl-10 pr-4 text-xs sm:text-sm text-slate-100 placeholder-slate-500 outline-none"
          />
        </div>

        <div>
          <select
            value={selectedCustomerId}
            onChange={(e) => setSelectedCustomerId(e.target.value)}
            className="w-full bg-slate-950 border border-slate-700 focus:border-brand-500 rounded-xl p-2 text-xs text-slate-100 outline-none"
          >
            <option value="ALL">Tüm Müşteriler</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.business_name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        {loading ? (
          <div className="p-12 text-center text-slate-400 flex flex-col items-center">
            <Loader2 className="w-8 h-8 animate-spin text-brand-500 mb-2" />
            <span>Cari Ekstre Yükleniyor...</span>
          </div>
        ) : filteredLedger.length === 0 ? (
          <div className="p-12 text-center text-slate-500 text-sm">
            Kayıtlı cari hareket bulunamadı.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950 text-slate-400 uppercase tracking-wider font-semibold border-b border-slate-800">
                <tr>
                  <th className="p-4">Tarih</th>
                  <th className="p-4">Müşteri</th>
                  <th className="p-4 text-center">Hareket Tipi</th>
                  <th className="p-4">Açıklama</th>
                  <th className="p-4 text-right">Borç (TL)</th>
                  <th className="p-4 text-right">Ödeme (TL)</th>
                  <th className="p-4 text-right">Devreden Bakiye</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70 text-slate-200">
                {filteredLedger.map((l) => (
                  <tr key={l.id} className="hover:bg-slate-800/40 transition-colors">
                    <td className="p-4 font-mono text-slate-400">
                      {formatDate(l.created_at)}
                    </td>

                    <td className="p-4 font-bold text-slate-100">
                      {(l as any).customers?.business_name || 'Bilinmeyen Müşteri'}
                    </td>

                    <td className="p-4 text-center font-bold">
                      <span
                        className={`inline-block px-2.5 py-0.5 rounded text-[10px] uppercase font-extrabold ${
                          l.movement_type === 'BORÇ'
                            ? 'bg-amber-950 text-amber-300 border border-amber-800/50'
                            : l.description.includes('Mahsup')
                            ? 'bg-purple-950 text-purple-300 border border-purple-800/50'
                            : 'bg-emerald-950 text-emerald-300 border border-emerald-800/50'
                        }`}
                      >
                        {l.description.includes('Mahsup') ? 'MAHSUP' : l.movement_type}
                      </span>
                    </td>

                    <td className="p-4 text-slate-300">
                      {l.description}
                    </td>

                    <td className="p-4 text-right font-bold text-amber-400">
                      {l.debit > 0 ? formatCurrency(l.debit) : '-'}
                    </td>

                    <td className="p-4 text-right font-bold text-emerald-400">
                      {l.credit > 0 ? formatCurrency(l.credit) : '-'}
                    </td>

                    <td className="p-4 text-right font-extrabold text-white">
                      {formatCurrency(l.balance)}
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
