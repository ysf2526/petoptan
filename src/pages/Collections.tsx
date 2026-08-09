import React, { useEffect, useState, useCallback } from 'react';
import { useOutletContext } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { formatCurrency } from '@/utils/formatters';
import { Customer } from '@/types/database.types';
import { LayoutContextType } from '@/components/layout/Layout';
import { Receipt, Search, Plus, Loader2, AlertTriangle, Calendar, CheckCircle2 } from 'lucide-react';

interface CollectionCustomerSummary {
  id: string;
  business_name: string;
  contact_name: string | null;
  phone: string | null;
  total_debt: number;
  due_this_week: number;
  due_next_week: number;
  due_today: number;
  overdue: number;
}

export const Collections: React.FC = () => {
  const { openPaymentModal } = useOutletContext<LayoutContextType>();

  const [loading, setLoading] = useState(true);
  const [summaries, setSummaries] = useState<CollectionCustomerSummary[]>([]);
  const [searchQuery, setSearchQuery] = useState('');

  // Top Metrics
  const [metrics, setMetrics] = useState({
    totalDebt: 0,
    dueThisWeek: 0,
    dueNextWeek: 0,
    overdue: 0,
    dueToday: 0,
  });

  const fetchCollectionsData = useCallback(async () => {
    setLoading(true);
    try {
      const todayStr = new Date().toISOString().split('T')[0];

      const nextWeekDate = new Date();
      nextWeekDate.setDate(nextWeekDate.getDate() + 7);
      const nextWeekStr = nextWeekDate.toISOString().split('T')[0];

      const afterNextWeekDate = new Date();
      afterNextWeekDate.setDate(afterNextWeekDate.getDate() + 14);
      const afterNextWeekStr = afterNextWeekDate.toISOString().split('T')[0];

      // 1. Customers list
      const { data: cData } = await supabase
        .from('customers')
        .select('*')
        .is('deleted_at', null)
        .eq('active', true)
        .order('business_name');

      // 2. Ledger balances
      const { data: lData } = await supabase
        .from('customer_ledger')
        .select('customer_id, balance, created_at')
        .is('deleted_at', null)
        .order('created_at', { ascending: false });

      const balanceMap: Record<string, number> = {};
      lData?.forEach((l) => {
        if (balanceMap[l.customer_id] === undefined) {
          balanceMap[l.customer_id] = Number(l.balance || 0);
        }
      });

      // 3. Payment Schedules
      const { data: sData } = await supabase
        .from('payment_schedules')
        .select('customer_id, remaining_amount, due_date, status')
        .in('status', ['pending', 'partially_paid', 'overdue'])
        .is('deleted_at', null);

      const customerSchedulesMap: Record<
        string,
        { dueThisWeek: number; dueNextWeek: number; overdue: number; dueToday: number }
      > = {};

      let gTotalDebt = 0;
      let gDueThisWeek = 0;
      let gDueNextWeek = 0;
      let gOverdue = 0;
      let gDueToday = 0;

      sData?.forEach((s) => {
        const rem = Number(s.remaining_amount || 0);
        const cId = s.customer_id;

        if (!customerSchedulesMap[cId]) {
          customerSchedulesMap[cId] = { dueThisWeek: 0, dueNextWeek: 0, overdue: 0, dueToday: 0 };
        }

        if (s.due_date === todayStr) {
          customerSchedulesMap[cId].dueToday += rem;
          gDueToday += rem;
        }

        if (s.due_date < todayStr || s.status === 'overdue') {
          customerSchedulesMap[cId].overdue += rem;
          gOverdue += rem;
        } else if (s.due_date >= todayStr && s.due_date <= nextWeekStr) {
          customerSchedulesMap[cId].dueThisWeek += rem;
          gDueThisWeek += rem;
        } else if (s.due_date > nextWeekStr && s.due_date <= afterNextWeekStr) {
          customerSchedulesMap[cId].dueNextWeek += rem;
          gDueNextWeek += rem;
        }
      });

      const list: CollectionCustomerSummary[] = (cData || []).map((c) => {
        const debt = balanceMap[c.id] || 0;
        gTotalDebt += debt > 0 ? debt : 0;
        const sch = customerSchedulesMap[c.id] || { dueThisWeek: 0, dueNextWeek: 0, overdue: 0, dueToday: 0 };

        return {
          id: c.id,
          business_name: c.business_name,
          contact_name: c.contact_name,
          phone: c.phone,
          total_debt: debt,
          due_this_week: sch.dueThisWeek,
          due_next_week: sch.dueNextWeek,
          due_today: sch.dueToday,
          overdue: sch.overdue,
        };
      });

      setSummaries(list);
      setMetrics({
        totalDebt: gTotalDebt,
        dueThisWeek: gDueThisWeek,
        dueNextWeek: gDueNextWeek,
        overdue: gOverdue,
        dueToday: gDueToday,
      });
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCollectionsData();
  }, [fetchCollectionsData]);

  const filtered = summaries.filter((s) => {
    const q = searchQuery.toLowerCase().trim();
    return !q || s.business_name.toLowerCase().includes(q) || (s.contact_name && s.contact_name.toLowerCase().includes(q));
  });

  return (
    <div className="space-y-6">
      {/* Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900 border border-slate-800 p-4 sm:p-6 rounded-2xl">
        <div>
          <h2 className="text-xl font-bold text-white tracking-tight">Cari / Tahsilat Dashboard'u</h2>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Haftalık ödeme planları, bugün tahsil edilecek borçlar ve geciken alacakların yönetimi.
          </p>
        </div>
        <button
          onClick={() => openPaymentModal()}
          className="self-start sm:self-center bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-white font-bold px-4 py-2.5 rounded-xl shadow-lg shadow-emerald-500/20 text-xs sm:text-sm flex items-center gap-2 transition-all active:scale-95"
        >
          <Plus className="w-4 h-4" />
          <span>Yeni Tahsilat Gir</span>
        </button>
      </div>

      {/* TOP COLLECTION METRICS GRID */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl">
          <span className="text-xs text-slate-400 font-medium block">Toplam Alacak</span>
          <span className="text-lg font-extrabold text-amber-400 block mt-1">{formatCurrency(metrics.totalDebt)}</span>
          <span className="text-[10px] text-slate-500 block">Piyasadaki Toplam Bakiye</span>
        </div>

        <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl">
          <span className="text-xs text-slate-400 font-medium block">Bugün Tahsil Edilecek</span>
          <span className="text-lg font-extrabold text-emerald-400 block mt-1">{formatCurrency(metrics.dueToday)}</span>
          <span className="text-[10px] text-slate-500 block">Bugün Vadesi Gelen</span>
        </div>

        <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl">
          <span className="text-xs text-slate-400 font-medium block">Bu Hafta Tahsilat</span>
          <span className="text-lg font-extrabold text-brand-400 block mt-1">{formatCurrency(metrics.dueThisWeek)}</span>
          <span className="text-[10px] text-slate-500 block">7 Günlük Vade</span>
        </div>

        <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl">
          <span className="text-xs text-slate-400 font-medium block">Gelecek Hafta Tahsilat</span>
          <span className="text-lg font-extrabold text-indigo-400 block mt-1">{formatCurrency(metrics.dueNextWeek)}</span>
          <span className="text-[10px] text-slate-500 block">8-14 Günlük Vade</span>
        </div>

        <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl col-span-2 sm:col-span-1">
          <span className="text-xs text-slate-400 font-medium block">Geciken Alacak</span>
          <span className="text-lg font-extrabold text-rose-400 block mt-1">{formatCurrency(metrics.overdue)}</span>
          <span className="text-[10px] text-slate-500 block">Vadesi Geçmiş Vadeliler</span>
        </div>
      </div>

      {/* Search Bar */}
      <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl">
        <div className="relative w-full">
          <Search className="w-4 h-4 absolute left-3.5 top-3 text-slate-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Müşteri firma veya yetkili adı ile arayın..."
            className="w-full bg-slate-950 border border-slate-700 focus:border-emerald-500 rounded-xl py-2 pl-10 pr-4 text-xs sm:text-sm text-slate-100 placeholder-slate-500 outline-none"
          />
        </div>
      </div>

      {/* Customer Collection List */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        {loading ? (
          <div className="p-12 text-center text-slate-400 flex flex-col items-center">
            <Loader2 className="w-8 h-8 animate-spin text-emerald-500 mb-2" />
            <span>Tahsilat Verileri Yükleniyor...</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center text-slate-500 text-sm">
            Kayıtlı borçlu müşteri bulunamadı.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950 text-slate-400 uppercase tracking-wider font-semibold border-b border-slate-800">
                <tr>
                  <th className="p-4">Müşteri Firma</th>
                  <th className="p-4 text-right">Toplam Borç</th>
                  <th className="p-4 text-right">Bugün Vadesi</th>
                  <th className="p-4 text-right">Bu Hafta Ödenecek</th>
                  <th className="p-4 text-right">Geciken Borç</th>
                  <th className="p-4 text-center">İşlem</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70 text-slate-200">
                {filtered.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-800/40 transition-colors">
                    <td className="p-4">
                      <span className="font-bold text-white block text-sm">{c.business_name}</span>
                      <span className="text-[11px] text-slate-400">{c.contact_name || 'Yetkili Yok'} • {c.phone || '-'}</span>
                    </td>

                    <td className="p-4 text-right font-extrabold text-amber-400 text-sm">
                      {formatCurrency(c.total_debt)}
                    </td>

                    <td className="p-4 text-right font-bold text-emerald-400">
                      {c.due_today > 0 ? formatCurrency(c.due_today) : '-'}
                    </td>

                    <td className="p-4 text-right font-bold text-brand-400">
                      {c.due_this_week > 0 ? formatCurrency(c.due_this_week) : '-'}
                    </td>

                    <td className="p-4 text-right font-bold">
                      <span className={c.overdue > 0 ? 'text-rose-400' : 'text-slate-400'}>
                        {c.overdue > 0 ? formatCurrency(c.overdue) : '0 TL'}
                      </span>
                    </td>

                    <td className="p-4 text-center">
                      <button
                        onClick={() => openPaymentModal(c.id)}
                        className="bg-emerald-600/20 border border-emerald-500/40 text-emerald-300 hover:bg-emerald-600 hover:text-white font-bold py-1.5 px-3 rounded-lg text-xs transition-all active:scale-95"
                      >
                        Tahsil Et
                      </button>
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
