import React, { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { formatCurrency, formatNumber, formatDate } from '@/utils/formatters';
import {
  BarChart3,
  Calendar,
  Download,
  Loader2,
  TrendingUp,
  Receipt,
  DollarSign,
  Package,
  Users,
  Boxes,
  FileSpreadsheet,
  Truck,
} from 'lucide-react';

type DatePreset = 'TODAY' | 'THIS_WEEK' | 'THIS_MONTH' | 'LAST_MONTH' | 'CUSTOM';
type ReportTab = 'SALES' | 'PRODUCT_SALES' | 'CUSTOMER_SALES' | 'PROFIT' | 'COLLECTION' | 'STOCK' | 'SUPPLIER';

export const Reports: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<ReportTab>('SALES');
  const [datePreset, setDatePreset] = useState<DatePreset>('THIS_MONTH');

  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');

  const [reportData, setReportData] = useState<any[]>([]);
  const [summaryTotals, setSummaryTotals] = useState({
    totalAmount: 0,
    totalCost: 0,
    totalProfit: 0,
    itemCount: 0,
  });

  // Calculate Date Ranges based on Presets
  const getPresetDates = (preset: DatePreset) => {
    const now = new Date();
    let sDate = new Date();
    let eDate = new Date();

    if (preset === 'TODAY') {
      sDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      eDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
    } else if (preset === 'THIS_WEEK') {
      const day = now.getDay();
      const diff = now.getDate() - day + (day === 0 ? -6 : 1); // Monday
      sDate = new Date(now.setDate(diff));
      eDate = new Date();
    } else if (preset === 'THIS_MONTH') {
      sDate = new Date(now.getFullYear(), now.getMonth(), 1);
      eDate = new Date();
    } else if (preset === 'LAST_MONTH') {
      sDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      eDate = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
    }

    return {
      startISO: sDate.toISOString(),
      endISO: eDate.toISOString(),
      startFormatted: sDate.toISOString().split('T')[0],
      endFormatted: eDate.toISOString().split('T')[0],
    };
  };

  const fetchReport = useCallback(async () => {
    setLoading(true);
    try {
      let sISO = '';
      let eISO = '';

      if (datePreset === 'CUSTOM') {
        sISO = startDate ? new Date(startDate).toISOString() : new Date(0).toISOString();
        eISO = endDate ? new Date(endDate + 'T23:59:59').toISOString() : new Date().toISOString();
      } else {
        const p = getPresetDates(datePreset);
        sISO = p.startISO;
        eISO = p.endISO;
      }

      if (activeTab === 'SALES' || activeTab === 'PROFIT') {
        const { data: sales } = await supabase
          .from('sales')
          .select('*')
          .gte('created_at', sISO)
          .lte('created_at', eISO)
          .is('deleted_at', null)
          .order('created_at', { ascending: false });

        const list = sales || [];
        const totAmt = list.reduce((acc, curr) => acc + Number(curr.total_amount || 0), 0);
        const totCost = list.reduce((acc, curr) => acc + Number(curr.total_cost || 0), 0);
        const totProf = list.reduce((acc, curr) => acc + Number(curr.total_profit || 0), 0);

        setReportData(list);
        setSummaryTotals({ totalAmount: totAmt, totalCost: totCost, totalProfit: totProf, itemCount: list.length });
      } else if (activeTab === 'PRODUCT_SALES') {
        const { data: items } = await supabase
          .from('sale_items')
          .select('*')
          .gte('created_at', sISO)
          .lte('created_at', eISO)
          .is('deleted_at', null);

        const prodMap: Record<string, any> = {};
        items?.forEach((it) => {
          if (!prodMap[it.product_name]) {
            prodMap[it.product_name] = {
              product_name: it.product_name,
              unit: it.unit,
              qty: 0,
              totalAmount: 0,
              totalCost: 0,
              totalProfit: 0,
            };
          }
          prodMap[it.product_name].qty += Number(it.quantity || 0);
          prodMap[it.product_name].totalAmount += Number(it.total_amount || 0);
          prodMap[it.product_name].totalCost += Number(it.total_cost || 0);
          prodMap[it.product_name].totalProfit += Number(it.total_profit || 0);
        });

        const list = Object.values(prodMap).sort((a, b) => b.totalAmount - a.totalAmount);
        const totAmt = list.reduce((acc, curr) => acc + curr.totalAmount, 0);
        const totCost = list.reduce((acc, curr) => acc + curr.totalCost, 0);
        const totProf = list.reduce((acc, curr) => acc + curr.totalProfit, 0);

        setReportData(list);
        setSummaryTotals({ totalAmount: totAmt, totalCost: totCost, totalProfit: totProf, itemCount: list.length });
      } else if (activeTab === 'CUSTOMER_SALES') {
        const { data: sales } = await supabase
          .from('sales')
          .select('*')
          .gte('created_at', sISO)
          .lte('created_at', eISO)
          .is('deleted_at', null);

        const custMap: Record<string, any> = {};
        sales?.forEach((s) => {
          if (!custMap[s.customer_name]) {
            custMap[s.customer_name] = {
              customer_name: s.customer_name,
              count: 0,
              totalAmount: 0,
              totalProfit: 0,
            };
          }
          custMap[s.customer_name].count += 1;
          custMap[s.customer_name].totalAmount += Number(s.total_amount || 0);
          custMap[s.customer_name].totalProfit += Number(s.total_profit || 0);
        });

        const list = Object.values(custMap).sort((a, b) => b.totalAmount - a.totalAmount);
        const totAmt = list.reduce((acc, curr) => acc + curr.totalAmount, 0);
        const totProf = list.reduce((acc, curr) => acc + curr.totalProfit, 0);

        setReportData(list);
        setSummaryTotals({ totalAmount: totAmt, totalCost: 0, totalProfit: totProf, itemCount: list.length });
      } else if (activeTab === 'COLLECTION') {
        const sDateStr = sISO.split('T')[0];
        const eDateStr = eISO.split('T')[0];

        const { data: pays } = await supabase
          .from('payments')
          .select(`
            *,
            customers (business_name)
          `)
          .gte('payment_date', sDateStr)
          .lte('payment_date', eDateStr)
          .is('deleted_at', null)
          .order('payment_date', { ascending: false });

        const list = pays || [];
        const totAmt = list.reduce((acc, curr) => acc + Number(curr.amount || 0), 0);

        setReportData(list);
        setSummaryTotals({ totalAmount: totAmt, totalCost: 0, totalProfit: 0, itemCount: list.length });
      } else if (activeTab === 'STOCK') {
        const { data: prods } = await supabase
          .from('products')
          .select('*')
          .is('deleted_at', null)
          .order('product_name');

        const list = prods || [];
        const totCost = list.reduce((acc, curr) => acc + Number(curr.current_stock || 0) * Number(curr.purchase_price || 0), 0);
        const totVal = list.reduce((acc, curr) => acc + Number(curr.current_stock || 0) * Number(curr.sale_price || 0), 0);

        setReportData(list);
        setSummaryTotals({ totalAmount: totVal, totalCost: totCost, totalProfit: totVal - totCost, itemCount: list.length });
      } else if (activeTab === 'SUPPLIER') {
        const { data: supLogs } = await supabase
          .from('supplier_ledger')
          .select(`
            *,
            suppliers (company_name)
          `)
          .gte('created_at', sISO)
          .lte('created_at', eISO)
          .is('deleted_at', null)
          .order('created_at', { ascending: false });

        const list = supLogs || [];
        const totPurch = list.reduce((acc, curr) => acc + Number(curr.credit || 0), 0);
        const totOff = list.reduce((acc, curr) => acc + (curr.movement_type === 'OFFSET' ? Number(curr.debit || 0) : 0), 0);

        setReportData(list);
        setSummaryTotals({ totalAmount: totPurch, totalCost: totOff, totalProfit: totPurch - totOff, itemCount: list.length });
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [activeTab, datePreset, startDate, endDate]);

  useEffect(() => {
    fetchReport();
  }, [fetchReport]);

  const exportCSV = () => {
    if (reportData.length === 0) return;
    const jsonStr = JSON.stringify(reportData, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `report_${activeTab}_${datePreset}.json`;
    a.click();
  };

  return (
    <div className="space-y-6 pb-8">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900 border border-slate-800 p-4 sm:p-6 rounded-2xl">
        <div>
          <h2 className="text-xl font-bold text-white tracking-tight">Ticari Raporlar & Analizler</h2>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Satış, kâr, tahsilat, müşteri ve depo stok raporlarını dilediğiniz tarih aralığında süzün.
          </p>
        </div>
        <button
          onClick={exportCSV}
          className="self-start sm:self-center bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-bold px-4 py-2 rounded-xl text-xs sm:text-sm flex items-center gap-2 transition-all active:scale-95"
        >
          <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
          <span>Veriyi Dışa Aktır (Export)</span>
        </button>
      </div>

      {/* REPORT TYPE TABS */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2 custom-scrollbar">
        {[
          { id: 'SALES', label: 'Satış Raporu', icon: ShoppingCart },
          { id: 'PRODUCT_SALES', label: 'Ürün Bazında Satış', icon: Package },
          { id: 'CUSTOMER_SALES', label: 'Müşteri Bazında Satış', icon: Users },
          { id: 'PROFIT', label: 'Kâr Raporu', icon: DollarSign },
          { id: 'COLLECTION', label: 'Tahsilat Raporu', icon: Receipt },
          { id: 'STOCK', label: 'Stok Raporu', icon: Boxes },
          { id: 'SUPPLIER', label: 'Tedarikçi & Mahsup', icon: Truck },
        ].map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as ReportTab)}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all border ${
                activeTab === tab.id
                  ? 'bg-brand-600 border-brand-500 text-white shadow-lg shadow-brand-500/20'
                  : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* DATE PRESETS BAR */}
      <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-2 flex-wrap w-full sm:w-auto">
          {[
            { id: 'TODAY', label: 'Bugün' },
            { id: 'THIS_WEEK', label: 'Bu Hafta' },
            { id: 'THIS_MONTH', label: 'Bu Ay' },
            { id: 'LAST_MONTH', label: 'Geçen Ay' },
            { id: 'CUSTOM', label: 'Özel Tarih Aralığı' },
          ].map((p) => (
            <button
              key={p.id}
              onClick={() => setDatePreset(p.id as DatePreset)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all border ${
                datePreset === p.id
                  ? 'bg-indigo-600/20 border-indigo-500 text-indigo-300'
                  : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        {datePreset === 'CUSTOM' && (
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="bg-slate-950 border border-slate-700 rounded-lg p-1.5 text-xs text-white outline-none"
            />
            <span className="text-slate-500 text-xs">-</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="bg-slate-950 border border-slate-700 rounded-lg p-1.5 text-xs text-white outline-none"
            />
          </div>
        )}
      </div>

      {/* SUMMARY TOTALS STRIP */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl">
          <span className="text-xs text-slate-400 font-medium block">Toplam Ciro / Değer</span>
          <span className="text-xl font-extrabold text-white block mt-1">{formatCurrency(summaryTotals.totalAmount)}</span>
          <span className="text-[10px] text-slate-500 block">{summaryTotals.itemCount} Kayıt İncelendi</span>
        </div>

        {activeTab !== 'COLLECTION' && (
          <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl">
            <span className="text-xs text-slate-400 font-medium block">Toplam Maliyet</span>
            <span className="text-xl font-bold text-slate-300 block mt-1">{formatCurrency(summaryTotals.totalCost)}</span>
            <span className="text-[10px] text-slate-500 block">Ürün Alış Maliyetleri</span>
          </div>
        )}

        {activeTab !== 'COLLECTION' && (
          <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl">
            <span className="text-xs text-slate-400 font-medium block">Net Kâr</span>
            <span className="text-xl font-extrabold text-emerald-400 block mt-1">{formatCurrency(summaryTotals.totalProfit)}</span>
            <span className="text-[10px] text-slate-500 block">Dönemsel Net Kâr</span>
          </div>
        )}
      </div>

      {/* REPORT DATA TABLE */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        {loading ? (
          <div className="p-12 text-center text-slate-400 flex flex-col items-center">
            <Loader2 className="w-8 h-8 animate-spin text-brand-500 mb-2" />
            <span>Rapor Verileri Hesaplanıyor...</span>
          </div>
        ) : reportData.length === 0 ? (
          <div className="p-12 text-center text-slate-500 text-sm">
            Seçilen kritere uygun rapor kaydı bulunamadı.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950 text-slate-400 uppercase tracking-wider font-semibold border-b border-slate-800">
                {activeTab === 'SALES' || activeTab === 'PROFIT' ? (
                  <tr>
                    <th className="p-4">Satış No & Tarih</th>
                    <th className="p-4">Müşteri</th>
                    <th className="p-4 text-center">Tür</th>
                    <th className="p-4 text-right">Satış Tutarı</th>
                    <th className="p-4 text-right">Alış Maliyeti</th>
                    <th className="p-4 text-right">Kâr</th>
                  </tr>
                ) : activeTab === 'PRODUCT_SALES' ? (
                  <tr>
                    <th className="p-4">Ürün Adı</th>
                    <th className="p-4 text-center">Toplam Satış Adedi</th>
                    <th className="p-4 text-right">Toplam Ciro</th>
                    <th className="p-4 text-right">Toplam Maliyet</th>
                    <th className="p-4 text-right">Toplam Kâr</th>
                  </tr>
                ) : activeTab === 'CUSTOMER_SALES' ? (
                  <tr>
                    <th className="p-4">Müşteri Firma</th>
                    <th className="p-4 text-center">Alış Adedi</th>
                    <th className="p-4 text-right">Toplam Ciro</th>
                    <th className="p-4 text-right">Getirdiği Kâr</th>
                  </tr>
                ) : activeTab === 'COLLECTION' ? (
                  <tr>
                    <th className="p-4">Ödeme Tarihi</th>
                    <th className="p-4">Müşteri Firma</th>
                    <th className="p-4 text-center">Yöntem</th>
                    <th className="p-4 text-right">Tahsilat Tutarı</th>
                  </tr>
                ) : activeTab === 'SUPPLIER' ? (
                  <tr>
                    <th className="p-4">Tarih</th>
                    <th className="p-4">Tedarikçi Firma</th>
                    <th className="p-4 text-center">İşlem Türü</th>
                    <th className="p-4">Açıklama</th>
                    <th className="p-4 text-right">Alacak (+) / Borç (-)</th>
                    <th className="p-4 text-right">Bakiye (TL)</th>
                  </tr>
                ) : (
                  <tr>
                    <th className="p-4">Ürün Adı</th>
                    <th className="p-4 text-center">Stok Seviyesi</th>
                    <th className="p-4 text-right">Birim Alış</th>
                    <th className="p-4 text-right">Birim Satış</th>
                    <th className="p-4 text-right">Stok Maliyet Değeri</th>
                    <th className="p-4 text-right">Stok Satış Değeri</th>
                  </tr>
                )}
              </thead>

              <tbody className="divide-y divide-slate-800/70 text-slate-200">
                {reportData.map((row, idx) => (
                  <tr key={idx} className="hover:bg-slate-800/40 transition-colors">
                    {activeTab === 'SALES' || activeTab === 'PROFIT' ? (
                      <>
                        <td className="p-4 font-bold text-white">
                          {row.sale_number}
                          <span className="text-[11px] text-slate-400 block font-normal">{formatDate(row.created_at)}</span>
                        </td>
                        <td className="p-4 font-semibold">{row.customer_name}</td>
                        <td className="p-4 text-center font-bold">{row.payment_type === 'pesin' ? 'Peşin' : 'Vadeli'}</td>
                        <td className="p-4 text-right font-extrabold text-white">{formatCurrency(row.total_amount)}</td>
                        <td className="p-4 text-right text-slate-400">{formatCurrency(row.total_cost)}</td>
                        <td className="p-4 text-right font-bold text-emerald-400">{formatCurrency(row.total_profit)}</td>
                      </>
                    ) : activeTab === 'PRODUCT_SALES' ? (
                      <>
                        <td className="p-4 font-bold text-white">{row.product_name}</td>
                        <td className="p-4 text-center font-bold">{formatNumber(row.qty)} {row.unit}</td>
                        <td className="p-4 text-right font-extrabold text-white">{formatCurrency(row.totalAmount)}</td>
                        <td className="p-4 text-right text-slate-400">{formatCurrency(row.totalCost)}</td>
                        <td className="p-4 text-right font-bold text-emerald-400">{formatCurrency(row.totalProfit)}</td>
                      </>
                    ) : activeTab === 'CUSTOMER_SALES' ? (
                      <>
                        <td className="p-4 font-bold text-white">{row.customer_name}</td>
                        <td className="p-4 text-center font-bold">{row.count} İşlem</td>
                        <td className="p-4 text-right font-extrabold text-white">{formatCurrency(row.totalAmount)}</td>
                        <td className="p-4 text-right font-bold text-emerald-400">{formatCurrency(row.totalProfit)}</td>
                      </>
                    ) : activeTab === 'COLLECTION' ? (
                      <>
                        <td className="p-4 font-mono text-slate-400">{formatDate(row.payment_date)}</td>
                        <td className="p-4 font-bold text-white">{row.customers?.business_name || 'Müşteri'}</td>
                        <td className="p-4 text-center font-semibold text-emerald-400">{row.payment_method}</td>
                        <td className="p-4 text-right font-extrabold text-emerald-400">{formatCurrency(row.amount)}</td>
                      </>
                    ) : activeTab === 'SUPPLIER' ? (
                      <>
                        <td className="p-4 font-mono text-slate-400">{formatDate(row.created_at)}</td>
                        <td className="p-4 font-bold text-white">{row.suppliers?.company_name || 'Tedarikçi'}</td>
                        <td className="p-4 text-center font-bold">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] uppercase font-extrabold ${
                              row.movement_type === 'PURCHASE'
                                ? 'bg-amber-950 text-amber-300 border border-amber-800/40'
                                : row.movement_type === 'OFFSET'
                                ? 'bg-purple-950 text-purple-300 border border-purple-800/40'
                                : 'bg-emerald-950 text-emerald-300 border border-emerald-800/40'
                            }`}
                          >
                            {row.movement_type === 'PURCHASE' ? 'Mal Alımı' : row.movement_type === 'OFFSET' ? 'POS Mahsup' : row.movement_type}
                          </span>
                        </td>
                        <td className="p-4 text-slate-300">{row.description}</td>
                        <td className="p-4 text-right font-bold">
                          {row.credit > 0 ? (
                            <span className="text-amber-400">+{formatCurrency(row.credit)}</span>
                          ) : (
                            <span className="text-purple-400">-{formatCurrency(row.debit)}</span>
                          )}
                        </td>
                        <td className="p-4 text-right font-extrabold text-white">{formatCurrency(row.balance)}</td>
                      </>
                    ) : (
                      <>
                        <td className="p-4 font-bold text-white">{row.product_name}</td>
                        <td className="p-4 text-center font-extrabold text-amber-400">{formatNumber(row.current_stock)} {row.unit}</td>
                        <td className="p-4 text-right text-slate-400">{formatCurrency(row.purchase_price)}</td>
                        <td className="p-4 text-right text-slate-200">{formatCurrency(row.sale_price)}</td>
                        <td className="p-4 text-right font-bold text-slate-300">{formatCurrency(row.current_stock * row.purchase_price)}</td>
                        <td className="p-4 text-right font-extrabold text-emerald-400">{formatCurrency(row.current_stock * row.sale_price)}</td>
                      </>
                    )}
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
