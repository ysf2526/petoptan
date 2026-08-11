import React, { useEffect, useState, useCallback } from 'react';
import { useOutletContext, Link } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { formatCurrency, formatNumber, getISOYearMonth } from '@/utils/formatters';
import { DashboardStats, Product } from '@/types/database.types';
import { LayoutContextType } from '@/components/layout/Layout';
import {
  TrendingUp,
  Receipt,
  DollarSign,
  Target,
  Users,
  Calendar,
  AlertTriangle,
  Package,
  Boxes,
  ShoppingCart,
  PlusCircle,
  ArrowUpRight,
  TrendingDown,
  ChevronRight,
  Loader2,
  RefreshCw,
  Truck,
} from 'lucide-react';
import { SmartSupplierPaymentPlan } from '@/components/dashboard/SmartSupplierPaymentPlan';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
} from 'recharts';

export const Dashboard: React.FC = () => {
  const { openNewSaleModal, openPaymentModal, openStockEntryModal } =
    useOutletContext<LayoutContextType>();

  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<DashboardStats>({
    monthlySales: 0,
    monthlyCollections: 0,
    monthlyProfit: 0,
    profitTarget: 100000,
    remainingProfitTarget: 100000,
    totalCustomerDebt: 0,
    dueThisWeek: 0,
    overduePayments: 0,
    warehouseTotalProducts: 0,
    warehouseStockCost: 0,
    criticalStockCount: 0,
    todaySales: 0,
    todayCollections: 0,
    todayProfit: 0,
    todaySaleCount: 0,
    totalSupplierDebt: 0,
    monthlySupplierPurchase: 0,
    monthlySupplierOffset: 0,
    cashCollections: 0,
    bankCollections: 0,
    offsetCollections: 0,
  });

  const [topSellingProducts, setTopSellingProducts] = useState<any[]>([]);
  const [criticalProducts, setCriticalProducts] = useState<Product[]>([]);
  const [recentSales, setRecentSales] = useState<any[]>([]);
  const [salesTrend, setSalesTrend] = useState<any[]>([]);

  const fetchDashboardData = useCallback(async () => {
    setLoading(true);
    try {
      const now = new Date();
      const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
      const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59).toISOString();

      const nextWeekDate = new Date();
      nextWeekDate.setDate(now.getDate() + 7);
      const nextWeekStr = nextWeekDate.toISOString().split('T')[0];
      const todayStr = now.toISOString().split('T')[0];

      // 1. Monthly Sales & Profit
      const { data: monthlySalesData } = await supabase
        .from('sales')
        .select('total_amount, total_profit, created_at')
        .gte('created_at', firstDayOfMonth)
        .is('deleted_at', null);

      const mSales = monthlySalesData?.reduce((acc, curr) => acc + Number(curr.total_amount || 0), 0) || 0;
      const mProfit = monthlySalesData?.reduce((acc, curr) => acc + Number(curr.total_profit || 0), 0) || 0;

      // 2. Today's Sales & Profit
      const { data: todaySalesData } = await supabase
        .from('sales')
        .select('total_amount, total_profit')
        .gte('created_at', startOfToday)
        .lte('created_at', endOfToday)
        .is('deleted_at', null);

      const tSales = todaySalesData?.reduce((acc, curr) => acc + Number(curr.total_amount || 0), 0) || 0;
      const tProfit = todaySalesData?.reduce((acc, curr) => acc + Number(curr.total_profit || 0), 0) || 0;
      const tCount = todaySalesData?.length || 0;

      // 3. Monthly Collections & Breakdown (Nakit, Banka, Tedarikçi Mahsubu)
      const { data: monthlyCollectionsData } = await supabase
        .from('payments')
        .select('amount, payment_method')
        .gte('payment_date', firstDayOfMonth.split('T')[0])
        .is('deleted_at', null);

      let mCollections = 0;
      let cashColl = 0;
      let bankColl = 0;
      let offsetColl = 0;

      monthlyCollectionsData?.forEach((p) => {
        const amt = Number(p.amount || 0);
        mCollections += amt;
        if (p.payment_method === 'Nakit') cashColl += amt;
        else if (p.payment_method === 'Havale/EFT') bankColl += amt;
        else if (p.payment_method === 'Tedarikçiye Mahsup') offsetColl += amt;
      });

      // 4. Today's Collections
      const { data: todayCollectionsData } = await supabase
        .from('payments')
        .select('amount')
        .eq('payment_date', todayStr)
        .is('deleted_at', null);

      const tCollections = todayCollectionsData?.reduce((acc, curr) => acc + Number(curr.amount || 0), 0) || 0;

      // 5. Total Customer Debt & Supplier Debt
      const { data: customerLedgers } = await supabase
        .from('customer_ledger')
        .select('customer_id, balance, created_at')
        .is('deleted_at', null)
        .order('created_at', { ascending: false });

      const customerLatestBalances: Record<string, number> = {};
      customerLedgers?.forEach((item) => {
        if (customerLatestBalances[item.customer_id] === undefined) {
          customerLatestBalances[item.customer_id] = Number(item.balance || 0);
        }
      });
      const totDebt = Object.values(customerLatestBalances).reduce((acc, val) => acc + (val > 0 ? val : 0), 0);

      // Supplier Debt & Monthly Supplier Metrics
      const { data: supplierLedgers } = await supabase
        .from('supplier_ledger')
        .select('supplier_id, balance, credit, debit, movement_type, created_at')
        .is('deleted_at', null)
        .order('created_at', { ascending: false });

      const supplierLatestBalances: Record<string, number> = {};
      let mSupPurchase = 0;
      let mSupOffset = 0;

      supplierLedgers?.forEach((item) => {
        if (supplierLatestBalances[item.supplier_id] === undefined) {
          supplierLatestBalances[item.supplier_id] = Number(item.balance || 0);
        }
        if (item.created_at >= firstDayOfMonth) {
          if (item.movement_type === 'PURCHASE') mSupPurchase += Number(item.credit || 0);
          else if (item.movement_type === 'OFFSET') mSupOffset += Number(item.debit || 0);
        }
      });
      const totSupDebt = Object.values(supplierLatestBalances).reduce((acc, val) => acc + (val > 0 ? val : 0), 0);

      // 6. Payment Schedules: Due this week & Overdue
      const { data: schedules } = await supabase
        .from('payment_schedules')
        .select('remaining_amount, due_date, status')
        .in('status', ['pending', 'partially_paid', 'overdue'])
        .is('deleted_at', null);

      let dueWeek = 0;
      let overdue = 0;
      schedules?.forEach((s) => {
        const rem = Number(s.remaining_amount || 0);
        if (s.due_date < todayStr || s.status === 'overdue') {
          overdue += rem;
        } else if (s.due_date >= todayStr && s.due_date <= nextWeekStr) {
          dueWeek += rem;
        }
      });

      // 7. Warehouse Products & Cost & Critical Stock
      const { data: products } = await supabase
        .from('products')
        .select('*')
        .is('deleted_at', null)
        .eq('active', true);

      let totProdCount = 0;
      let stockCost = 0;
      const criticals: Product[] = [];

      products?.forEach((p) => {
        const stock = Number(p.current_stock || 0);
        const minStock = Number(p.minimum_stock || 0);
        const cost = Number(p.purchase_price || 0);

        totProdCount += stock;
        stockCost += stock * cost;

        if (stock < minStock) {
          criticals.push(p as Product);
        }
      });

      // 8. Profit Target for current month
      const { year, month } = getISOYearMonth();
      const { data: targetData } = await supabase
        .from('profit_targets')
        .select('target_profit')
        .eq('year', year)
        .eq('month', month)
        .maybeSingle();

      const pTarget = Number(targetData?.target_profit || 100000);
      const remTarget = Math.max(0, pTarget - mProfit);

      setStats({
        monthlySales: mSales,
        monthlyCollections: mCollections,
        monthlyProfit: mProfit,
        profitTarget: pTarget,
        remainingProfitTarget: remTarget,
        totalCustomerDebt: totDebt,
        dueThisWeek: dueWeek,
        overduePayments: overdue,
        warehouseTotalProducts: totProdCount,
        warehouseStockCost: stockCost,
        criticalStockCount: criticals.length,
        todaySales: tSales,
        todayCollections: tCollections,
        todayProfit: tProfit,
        todaySaleCount: tCount,
        totalSupplierDebt: totSupDebt,
        monthlySupplierPurchase: mSupPurchase,
        monthlySupplierOffset: mSupOffset,
        cashCollections: cashColl,
        bankCollections: bankColl,
        offsetCollections: offsetColl,
      });

      setCriticalProducts(criticals.slice(0, 5));

      // 9. Top Selling Products Analytics
      const { data: items } = await supabase
        .from('sale_items')
        .select('product_name, quantity, total_amount')
        .is('deleted_at', null);

      const prodMap: Record<string, { name: string; qty: number; sales: number }> = {};
      items?.forEach((it) => {
        if (!prodMap[it.product_name]) {
          prodMap[it.product_name] = { name: it.product_name, qty: 0, sales: 0 };
        }
        prodMap[it.product_name].qty += Number(it.quantity || 0);
        prodMap[it.product_name].sales += Number(it.total_amount || 0);
      });

      const prodList = Object.values(prodMap);
      setTopSellingProducts([...prodList].sort((a, b) => b.qty - a.qty).slice(0, 5));

      // 10. Recent Sales
      const { data: salesList } = await supabase
        .from('sales')
        .select('id, sale_number, customer_name, total_amount, payment_type, status, created_at')
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(5);

      setRecentSales(salesList || []);

      // 11. Sales Trend Chart Data (Last 7 Days - Revenue only)
      const last7Days = Array.from({ length: 7 }, (_, i) => {
        const d = new Date();
        d.setDate(d.getDate() - (6 - i));
        return d.toISOString().split('T')[0];
      });

      const trendData = last7Days.map((dayStr) => {
        const daySales = monthlySalesData?.filter((s) => s.created_at.startsWith(dayStr)) || [];
        const total = daySales.reduce((sum, s) => sum + Number(s.total_amount || 0), 0);
        const formattedDay = new Date(dayStr).toLocaleDateString('tr-TR', { weekday: 'short', day: 'numeric' });
        return { name: formattedDay, Satış: total };
      });

      setSalesTrend(trendData);
    } catch (err) {
      console.error('Dashboard yükleme hatası:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboardData();
    const handleRefresh = () => fetchDashboardData();
    window.addEventListener('refresh-data', handleRefresh);
    return () => window.removeEventListener('refresh-data', handleRefresh);
  }, [fetchDashboardData]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-slate-400">
        <Loader2 className="w-10 h-10 animate-spin text-brand-500 mb-3" />
        <p className="text-sm font-semibold">Ticari Veriler Yükleniyor...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-8">
      {/* Top Banner & Refresh */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900 border border-slate-800 p-4 sm:p-6 rounded-2xl">
        <div>
          <h2 className="text-xl font-bold text-white tracking-tight">Genel Bakış & Ticari Performans</h2>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Satış cirosu, tahsilatlar, müşteri ve tedarikçi borç durumlarının anlık özeti.
          </p>
        </div>
        <button
          onClick={fetchDashboardData}
          className="self-start sm:self-center flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold py-2 px-3.5 rounded-xl border border-slate-700 transition-all active:scale-95"
        >
          <RefreshCw className="w-3.5 h-3.5 text-brand-400" />
          <span>Verileri Yenile</span>
        </button>
      </div>

      {/* Quick Actions Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <button
          onClick={openNewSaleModal}
          className="flex items-center gap-3 p-3.5 bg-gradient-to-r from-brand-600 to-brand-500 hover:from-brand-500 hover:to-brand-400 text-white rounded-xl shadow-lg shadow-brand-500/20 transition-all active:scale-98"
        >
          <ShoppingCart className="w-5 h-5 shrink-0" />
          <div className="text-left leading-tight">
            <span className="block font-bold text-sm">Yeni Satış</span>
            <span className="text-[10px] text-brand-100 font-normal">Sipariş Oluştur</span>
          </div>
        </button>

        <button
          onClick={() => openPaymentModal()}
          className="flex items-center gap-3 p-3.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl shadow-lg shadow-emerald-600/20 transition-all active:scale-98"
        >
          <Receipt className="w-5 h-5 shrink-0" />
          <div className="text-left leading-tight">
            <span className="block font-bold text-sm">Tahsilat Gir</span>
            <span className="text-[10px] text-emerald-100 font-normal">Ödeme Al</span>
          </div>
        </button>

        <button
          onClick={() => openStockEntryModal()}
          className="flex items-center gap-3 p-3.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl transition-all active:scale-98"
        >
          <Boxes className="w-5 h-5 text-indigo-400 shrink-0" />
          <div className="text-left leading-tight">
            <span className="block font-bold text-sm">Mal Girişi</span>
            <span className="text-[10px] text-slate-400 font-normal">Depoya Ekle</span>
          </div>
        </button>

        <Link
          to="/customers"
          className="flex items-center gap-3 p-3.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl transition-all active:scale-98"
        >
          <Users className="w-5 h-5 text-purple-400 shrink-0" />
          <div className="text-left leading-tight">
            <span className="block font-bold text-sm">Müşteri Ekle</span>
            <span className="text-[10px] text-slate-400 font-normal">Kayıt Oluştur</span>
          </div>
        </Link>

        <Link
          to="/products"
          className="flex items-center gap-3 p-3.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl transition-all col-span-2 sm:col-span-1 active:scale-98"
        >
          <Package className="w-5 h-5 text-amber-400 shrink-0" />
          <div className="text-left leading-tight">
            <span className="block font-bold text-sm">Ürün Ekle</span>
            <span className="text-[10px] text-slate-400 font-normal">Kart Aç</span>
          </div>
        </Link>
      </div>

      {/* TODAY'S SNAPSHOT STRIP */}
      <div className="bg-slate-900/90 border border-slate-800/80 rounded-2xl p-4">
        <div className="flex items-center gap-2 mb-3">
          <Calendar className="w-4 h-4 text-brand-400" />
          <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider">Bugünün Özet Operasyonu</h3>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800/60">
            <span className="text-xs text-slate-400 font-medium block">Bugünkü Satış</span>
            <span className="text-lg font-extrabold text-white">{formatCurrency(stats.todaySales)}</span>
            <span className="text-[11px] text-slate-500 block mt-0.5">{stats.todaySaleCount} İşlem Yapıldı</span>
          </div>

          <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800/60">
            <span className="text-xs text-slate-400 font-medium block">Bugünkü Tahsilat</span>
            <span className="text-lg font-extrabold text-emerald-400">{formatCurrency(stats.todayCollections)}</span>
            <span className="text-[11px] text-slate-500 block mt-0.5">Kasaya Giren</span>
          </div>

          <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800/60">
            <span className="text-xs text-slate-400 font-medium block">Tedarikçi Borcu</span>
            <span className="text-lg font-extrabold text-amber-400">{formatCurrency(stats.totalSupplierDebt)}</span>
            <span className="text-[11px] text-slate-500 block mt-0.5">Toptancı Firmalara</span>
          </div>

          <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800/60">
            <span className="text-xs text-slate-400 font-medium block">Kritik Stok Uyarısı</span>
            <div className="flex items-center gap-2">
              <span className={`text-lg font-extrabold ${stats.criticalStockCount > 0 ? 'text-amber-400' : 'text-slate-300'}`}>
                {stats.criticalStockCount} Ürün
              </span>
              {stats.criticalStockCount > 0 && <AlertTriangle className="w-4 h-4 text-amber-400 animate-pulse" />}
            </div>
            <Link to="/products" className="text-[11px] text-brand-400 hover:underline block mt-0.5">
              İncele & Sipariş Ver &rarr;
            </Link>
          </div>
        </div>
      </div>

      {/* AKILLI TEDARİKÇİ ÖDEME PLANI VE NAKİT AKIŞI MOTORU */}
      <SmartSupplierPaymentPlan onRefreshParent={fetchDashboardData} />

      {/* MONTHLY MAIN METRICS GRID */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Monthly Sales */}
        <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl relative overflow-hidden shadow-lg">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Bu Ay Toplam Satış</span>
            <div className="p-2.5 bg-brand-500/10 text-brand-400 rounded-xl">
              <TrendingUp className="w-5 h-5" />
            </div>
          </div>
          <p className="text-2xl font-extrabold text-white mt-3">{formatCurrency(stats.monthlySales)}</p>
          <p className="text-xs text-slate-400 mt-1">Brüt Satış Cirosu</p>
        </div>

        {/* Monthly Collections */}
        <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl relative overflow-hidden shadow-lg">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Bu Ay Toplam Tahsilat</span>
            <div className="p-2.5 bg-emerald-500/10 text-emerald-400 rounded-xl">
              <Receipt className="w-5 h-5" />
            </div>
          </div>
          <p className="text-2xl font-extrabold text-emerald-400 mt-3">{formatCurrency(stats.monthlyCollections)}</p>
          <div className="text-[11px] text-slate-400 mt-1 space-y-0.5 font-medium">
            <div className="flex justify-between">
              <span>Nakit/Banka:</span>
              <span className="text-slate-200 font-bold">{formatCurrency(stats.cashCollections + stats.bankCollections)}</span>
            </div>
            <div className="flex justify-between text-purple-400">
              <span>Tedarikçi Mahsubu:</span>
              <span className="font-bold">{formatCurrency(stats.offsetCollections)}</span>
            </div>
          </div>
        </div>

        {/* Total Customer Debt */}
        <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl relative overflow-hidden shadow-lg">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Toplam Müşteri Alacağı</span>
            <div className="p-2.5 bg-amber-500/10 text-amber-400 rounded-xl">
              <Users className="w-5 h-5" />
            </div>
          </div>
          <p className="text-2xl font-extrabold text-amber-400 mt-3">{formatCurrency(stats.totalCustomerDebt)}</p>
          <p className="text-xs text-slate-400 mt-1">Piyasadaki Toplam Müşteri Borcu</p>
        </div>

        {/* Total Supplier Debt */}
        <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl relative overflow-hidden shadow-lg">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Toplam Tedarikçi Borcu</span>
            <div className="p-2.5 bg-purple-500/10 text-purple-400 rounded-xl">
              <Truck className="w-5 h-5" />
            </div>
          </div>
          <p className="text-2xl font-extrabold text-purple-400 mt-3">{formatCurrency(stats.totalSupplierDebt)}</p>
          <p className="text-xs text-slate-400 mt-1">Tedarikçilere Ödenecek Borç</p>
        </div>
      </div>

      {/* SECONDARY METRICS & FINANCING */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Due This Week */}
        <div className="bg-slate-900/70 border border-slate-800 p-4 rounded-xl">
          <span className="text-xs text-slate-400 font-medium block">Bu Hafta Tahsil Edilecek</span>
          <span className="text-xl font-bold text-brand-400 block mt-1">{formatCurrency(stats.dueThisWeek)}</span>
          <span className="text-[11px] text-slate-500 block mt-0.5">Gelecek 7 Gün İçindeki Vadeler</span>
        </div>

        {/* Overdue Payments */}
        <div className="bg-slate-900/70 border border-slate-800 p-4 rounded-xl">
          <span className="text-xs text-slate-400 font-medium block">Geciken Ödemeler</span>
          <span className="text-xl font-bold text-rose-400 block mt-1">{formatCurrency(stats.overduePayments)}</span>
          <span className="text-[11px] text-slate-500 block mt-0.5">Vadesi Geçmiş Alacaklar</span>
        </div>

        {/* Monthly Supplier Offset */}
        <div className="bg-slate-900/70 border border-slate-800 p-4 rounded-xl">
          <span className="text-xs text-slate-400 font-medium block">Bu Ay Sanal POS Mahsubu</span>
          <span className="text-xl font-bold text-purple-400 block mt-1">{formatCurrency(stats.offsetCollections)}</span>
          <span className="text-[11px] text-slate-500 block mt-0.5">Tedarikçi Borcundan Düşülen</span>
        </div>

        {/* Stock Cost */}
        <div className="bg-slate-900/70 border border-slate-800 p-4 rounded-xl">
          <span className="text-xs text-slate-400 font-medium block">Depo Stok Maliyeti</span>
          <span className="text-xl font-bold text-slate-200 block mt-1">{formatCurrency(stats.warehouseStockCost)}</span>
          <span className="text-[11px] text-slate-500 block mt-0.5">{formatNumber(stats.warehouseTotalProducts)} Adet Toplam Ürün</span>
        </div>
      </div>

      {/* CHARTS & ANALYTICS ROW */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Sales Chart (2 Cols) */}
        <div className="lg:col-span-2 bg-slate-900 border border-slate-800 p-5 rounded-2xl shadow-lg flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-bold text-white text-base">Son 7 Günlük Satış Trendi</h3>
              <p className="text-xs text-slate-400">Günlük satış cirosu grafik görünümü</p>
            </div>
          </div>
          <div className="h-64 w-full mt-2">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={salesTrend}>
                <defs>
                  <linearGradient id="colorSatiss" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#0c8de9" stopOpacity={0.4}/>
                    <stop offset="95%" stopColor="#0c8de9" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="name" stroke="#64748b" fontSize={12} />
                <YAxis stroke="#64748b" fontSize={12} tickFormatter={(v) => `${v / 1000}k`} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '12px' }}
                  formatter={(value: any) => [formatCurrency(Number(value)), 'Satış Ciro']}
                />
                <Area type="monotone" dataKey="Satış" stroke="#0c8de9" strokeWidth={2.5} fillOpacity={1} fill="url(#colorSatiss)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Top Selling Products */}
        <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl shadow-lg flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-white text-base">En Çok Satan Ürünler</h3>
              <Link to="/reports" className="text-xs text-brand-400 hover:underline">Tümünü Gör</Link>
            </div>
            <div className="space-y-3">
              {topSellingProducts.length === 0 ? (
                <p className="text-xs text-slate-500 italic py-6 text-center">Henüz satış verisi oluşmadı.</p>
              ) : (
                topSellingProducts.map((p, idx) => (
                  <div key={idx} className="flex items-center justify-between p-2.5 bg-slate-950/60 rounded-xl border border-slate-800/40">
                    <div className="truncate pr-2">
                      <span className="text-xs font-semibold text-slate-200 block truncate">{p.name}</span>
                      <span className="text-[11px] text-slate-400">{formatNumber(p.qty)} Adet Satıldı</span>
                    </div>
                    <span className="text-xs font-bold text-brand-400 shrink-0">{formatCurrency(p.sales)}</span>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-800">
            <Link to="/sales" className="text-xs font-semibold text-slate-300 hover:text-white flex items-center justify-between">
              <span>Satış Sayfasına Git</span>
              <ChevronRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </div>

      {/* BOTTOM SECTION: RECENT SALES & CRITICAL STOCK */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Sales List */}
        <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl shadow-lg">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-white text-base">Son Satışlar</h3>
            <Link to="/sales" className="text-xs text-brand-400 hover:underline">Tüm Satışlar</Link>
          </div>
          <div className="space-y-2.5">
            {recentSales.length === 0 ? (
              <p className="text-xs text-slate-500 italic py-6 text-center">Kayıtlı satış bulunmuyor.</p>
            ) : (
              recentSales.map((s) => (
                <div key={s.id} className="flex items-center justify-between p-3 bg-slate-950/70 rounded-xl border border-slate-800/60">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-white">{s.sale_number}</span>
                      <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase ${s.payment_type === 'pesin' ? 'bg-emerald-950 text-emerald-300 border border-emerald-800/50' : 'bg-amber-950 text-amber-300 border border-amber-800/50'}`}>
                        {s.payment_type === 'pesin' ? 'Peşin' : 'Vadeli'}
                      </span>
                    </div>
                    <span className="text-xs text-slate-400 block mt-0.5">{s.customer_name}</span>
                  </div>
                  <div className="text-right">
                    <span className="text-xs font-extrabold text-white block">{formatCurrency(s.total_amount)}</span>
                    <span className="text-[10px] text-slate-500">{new Date(s.created_at).toLocaleDateString('tr-TR')}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Critical Stock List */}
        <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl shadow-lg">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-400" />
              <h3 className="font-bold text-white text-base">Kritik Stok Seviyesindeki Ürünler</h3>
            </div>
            <Link to="/products" className="text-xs text-brand-400 hover:underline">Tüm Ürünler</Link>
          </div>
          <div className="space-y-2.5">
            {criticalProducts.length === 0 ? (
              <p className="text-xs text-emerald-400 italic py-6 text-center font-medium">
                Tüm ürünlerin stok seviyeleri yeterli durumda.
              </p>
            ) : (
              criticalProducts.map((p) => (
                <div key={p.id} className="flex items-center justify-between p-3 bg-slate-950/70 rounded-xl border border-amber-900/40">
                  <div>
                    <span className="text-xs font-bold text-white block">{p.product_name}</span>
                    <span className="text-[11px] text-slate-400">Min. Stok: {formatNumber(p.minimum_stock)} {p.unit}</span>
                  </div>
                  <div className="text-right">
                    <span className="text-xs font-black text-amber-400 block">{formatNumber(p.current_stock)} {p.unit}</span>
                    <button
                      onClick={() => openStockEntryModal(p.id)}
                      className="text-[10px] text-brand-400 hover:underline font-semibold"
                    >
                      + Mal Girişi Yap
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
