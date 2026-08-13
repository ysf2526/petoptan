import React, { useEffect, useState, useCallback } from 'react';
import { useOutletContext, Link } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { formatCurrency, formatNumber, formatDateTime } from '@/utils/formatters';
import { DashboardStats, Product, Sale, OrderStatus, ORDER_STATUS_MAP } from '@/types/database.types';
import { useToast } from '@/context/ToastContext';
import { parseErrorMessage } from '@/utils/errors';
import { LayoutContextType } from '@/components/layout/Layout';
import { SaleDetailModal } from '@/components/modals/SaleDetailModal';
import { ConfirmDeliveryModal } from '@/components/modals/ConfirmDeliveryModal';
import { CancelSaleModal } from '@/components/modals/CancelSaleModal';
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
  ArrowRight,
  Clock,
  CheckCircle2,
  Ban,
  Eye,
} from 'lucide-react';
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
  const { showSuccess, showError } = useToast();

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
    outOfStockCount: 0,
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

  // Today's Operational Orders & Counts (Requirements 3, 5, 19)
  const [todayOrders, setTodayOrders] = useState<Sale[]>([]);
  const [todayOrderCounts, setTodayOrderCounts] = useState({
    total: 0,
    received: 0,
    preparing: 0,
    prepared: 0,
    delivered: 0,
    cancelled: 0,
  });

  // Modals state for Dashboard direct interaction
  const [selectedSaleId, setSelectedSaleId] = useState<string | null>(null);
  const [detailModalOpen, setDetailModalOpen] = useState(false);

  const [deliverySale, setDeliverySale] = useState<Sale | null>(null);
  const [deliveryModalOpen, setDeliveryModalOpen] = useState(false);

  const [cancelSale, setCancelSale] = useState<Sale | null>(null);
  const [cancelModalOpen, setCancelModalOpen] = useState(false);

  const [updatingStatusId, setUpdatingStatusId] = useState<string | null>(null);

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

      // 2. Today's Full Sales (for Operational Summary & Today's Orders list)
      const { data: todayFullSales } = await supabase
        .from('sales')
        .select('*')
        .gte('created_at', startOfToday)
        .lte('created_at', endOfToday)
        .is('deleted_at', null)
        .order('created_at', { ascending: false });

      const mappedTodayOrders: Sale[] = (todayFullSales || []).map((s) => ({
        ...s,
        order_status: s.order_status || (s.status === 'cancelled' ? 'cancelled' : 'received'),
      }));

      setTodayOrders(mappedTodayOrders);

      const tSales = mappedTodayOrders.reduce((acc, curr) => acc + Number(curr.total_amount || 0), 0);
      const tProfit = mappedTodayOrders.reduce((acc, curr) => acc + Number(curr.total_profit || 0), 0);
      const tCount = mappedTodayOrders.length;

      const tCounts = {
        total: mappedTodayOrders.length,
        received: mappedTodayOrders.filter((s) => (s.order_status || 'received') === 'received' && s.status !== 'cancelled').length,
        preparing: mappedTodayOrders.filter((s) => s.order_status === 'preparing').length,
        prepared: mappedTodayOrders.filter((s) => s.order_status === 'prepared').length,
        delivered: mappedTodayOrders.filter((s) => s.order_status === 'delivered').length,
        cancelled: mappedTodayOrders.filter((s) => s.order_status === 'cancelled' || s.status === 'cancelled').length,
      };

      setTodayOrderCounts(tCounts);

      // 3. Monthly Collections Breakdown
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

      const customerDebtMap: Record<string, number> = {};
      customerLedgers?.forEach((l) => {
        if (customerDebtMap[l.customer_id] === undefined) {
          customerDebtMap[l.customer_id] = Number(l.balance || 0);
        }
      });

      const totalCustDebt = Object.values(customerDebtMap).reduce((acc, curr) => acc + Math.max(0, curr), 0);

      const { data: supplierLedgers } = await supabase
        .from('supplier_ledger')
        .select('supplier_id, balance, credit, debit, movement_type')
        .is('deleted_at', null)
        .order('created_at', { ascending: false });

      const supplierCredMap: Record<string, number> = {};
      const supplierDebMap: Record<string, number> = {};
      const supplierLatestBalMap: Record<string, number> = {};

      supplierLedgers?.forEach((sl) => {
        if (supplierLatestBalMap[sl.supplier_id] === undefined) {
          supplierLatestBalMap[sl.supplier_id] = Number(sl.balance || 0);
        }
        const c = Number(sl.credit || 0);
        const d = Number(sl.debit || 0);
        if (sl.movement_type === 'PURCHASE' || sl.movement_type === 'ADJUSTMENT') {
          supplierCredMap[sl.supplier_id] = (supplierCredMap[sl.supplier_id] || 0) + c;
        } else {
          supplierDebMap[sl.supplier_id] = (supplierDebMap[sl.supplier_id] || 0) + d;
        }
      });

      let totalSuppDebt = 0;
      const allSupIds = Array.from(new Set(supplierLedgers?.map((sl) => sl.supplier_id) || []));
      allSupIds.forEach((sId) => {
        const latest = supplierLatestBalMap[sId] || 0;
        const net = (supplierCredMap[sId] || 0) - (supplierDebMap[sId] || 0);
        const debt = latest > 0 ? latest : Math.max(0, net);
        totalSuppDebt += debt;
      });

      // 6. Due This Week & Overdue
      const { data: activeSchedules } = await supabase
        .from('payment_schedules')
        .select('remaining_amount, due_date, status')
        .in('status', ['pending', 'partially_paid', 'overdue'])
        .is('deleted_at', null);

      let dueWeek = 0;
      let overdue = 0;

      activeSchedules?.forEach((s) => {
        const rem = Number(s.remaining_amount || 0);
        if (s.due_date < todayStr || s.status === 'overdue') {
          overdue += rem;
        } else if (s.due_date >= todayStr && s.due_date <= nextWeekStr) {
          dueWeek += rem;
        }
      });

      // 7. Warehouse & Stock Metrics
      const { data: productsData } = await supabase
        .from('products')
        .select('id, product_name, current_stock, minimum_stock, purchase_price, unit')
        .eq('active', true)
        .is('deleted_at', null);

      let totalProductsCount = productsData?.length || 0;
      let totalStockQtySum = 0;
      let totalStockCost = 0;
      let outOfStockCnt = 0;
      let criticalCnt = 0;
      const criticalProds: Product[] = [];

      productsData?.forEach((p) => {
        const stock = Number(p.current_stock || 0);
        const minStock = Number(p.minimum_stock || 0);
        const price = Number(p.purchase_price || 0);

        totalStockQtySum += stock;
        if (stock > 0) {
          totalStockCost += stock * price;
        }

        if (stock <= 0) {
          outOfStockCnt++;
        } else if (stock <= minStock) {
          criticalCnt++;
          criticalProds.push(p as Product);
        }
      });

      setCriticalProducts(criticalProds);

      // 8. Profit Target
      const currentYear = now.getFullYear();
      const currentMonth = now.getMonth() + 1;

      const { data: targetData } = await supabase
        .from('profit_targets')
        .select('target_profit')
        .eq('year', currentYear)
        .eq('month', currentMonth)
        .maybeSingle();

      const pTarget = targetData ? Number(targetData.target_profit) : 100000;
      const remTarget = Math.max(0, pTarget - mProfit);

      setStats({
        monthlySales: mSales,
        monthlyCollections: mCollections,
        monthlyProfit: mProfit,
        profitTarget: pTarget,
        remainingProfitTarget: remTarget,
        totalCustomerDebt: totalCustDebt,
        dueThisWeek: dueWeek,
        overduePayments: overdue,
        warehouseTotalProducts: totalProductsCount,
        warehouseStockCost: totalStockCost,
        criticalStockCount: criticalCnt,
        outOfStockCount: outOfStockCnt,
        todaySales: tSales,
        todayCollections: tCollections,
        todayProfit: tProfit,
        todaySaleCount: tCount,
        totalSupplierDebt: totalSuppDebt,
        monthlySupplierPurchase: 0,
        monthlySupplierOffset: offsetColl,
        cashCollections: cashColl,
        bankCollections: bankColl,
        offsetCollections: offsetColl,
      });

      // 9. Top Selling Products
      const { data: monthlyItems } = await supabase
        .from('sale_items')
        .select('product_name, quantity, total_amount')
        .gte('created_at', firstDayOfMonth)
        .is('deleted_at', null);

      const prodMap: Record<string, { name: string; qty: number; sales: number }> = {};
      monthlyItems?.forEach((it) => {
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
        .select('id, sale_number, customer_name, total_amount, payment_type, status, order_status, created_at')
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(5);

      setRecentSales(salesList || []);

      // 11. Sales Trend Chart Data (Last 7 Days)
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

  // Advance order status directly from Dashboard
  const handleAdvanceStatus = async (sale: Sale) => {
    const currentStatus: OrderStatus = (sale.order_status as OrderStatus) || (sale.status === 'cancelled' ? 'cancelled' : 'received');
    const conf = ORDER_STATUS_MAP[currentStatus];
    if (!conf || !conf.nextStatus) return;

    if (conf.nextStatus === 'delivered') {
      setDeliverySale(sale);
      setDeliveryModalOpen(true);
      return;
    }

    const nextSt = conf.nextStatus;
    setUpdatingStatusId(sale.id);

    try {
      const { error } = await supabase
        .from('sales')
        .update({ order_status: nextSt })
        .eq('id', sale.id);

      if (error) throw error;

      await supabase.from('audit_logs').insert({
        action: 'ORDER_STATUS_CHANGED',
        entity_type: 'sales',
        entity_id: sale.id,
        details: {
          order_id: sale.id,
          sale_number: sale.sale_number,
          customer_name: sale.customer_name,
          old_status: currentStatus,
          new_status: nextSt,
          timestamp: new Date().toISOString(),
        },
      });

      showSuccess(`Sipariş #${sale.sale_number} durumu: ${ORDER_STATUS_MAP[nextSt].label}`);
      fetchDashboardData();
    } catch (err) {
      showError(parseErrorMessage(err));
    } finally {
      setUpdatingStatusId(null);
    }
  };

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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900 border border-slate-800 p-4 sm:p-6 rounded-2xl shadow-lg">
        <div>
          <h2 className="text-xl font-bold text-white tracking-tight">Genel Bakış & Ticari Performans</h2>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Satış cirosu, operasyonel sipariş takibi, tahsilatlar, borç ve depo durumlarının anlık özeti.
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

      {/* BUGÜNÜN OPERASYON ÖZETİ WIDGET (REQUIREMENT 5 & 19) */}
      <div className="bg-slate-900 border border-brand-500/30 p-4 sm:p-5 rounded-2xl shadow-xl space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="p-1 rounded bg-brand-500/20 text-brand-400">
              <Truck className="w-4 h-4" />
            </span>
            <h3 className="text-sm sm:text-base font-black text-white uppercase tracking-wider">BUGÜN OPERASYON ÖZETİ</h3>
            <span className="text-xs font-mono font-bold text-brand-300 bg-brand-950 px-2 py-0.5 rounded-full border border-brand-800">
              {todayOrderCounts.total} Sipariş
            </span>
          </div>
          <Link to="/sales" className="text-xs font-bold text-brand-400 hover:underline flex items-center gap-1">
            <span>Tüm Sipariş Ekranı</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        {/* 5 Quick Status Counters */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 font-mono text-xs">
          <Link to="/sales" className="bg-slate-950/80 p-3 rounded-xl border border-amber-900/40 hover:border-amber-500 transition-all">
            <span className="text-[10px] font-sans font-bold text-amber-300/80 block uppercase">Bekleyen (Alındı)</span>
            <div className="flex items-baseline justify-between mt-1">
              <span className="text-xl font-black text-amber-300">{todayOrderCounts.received}</span>
              <span className="text-base">🟡</span>
            </div>
          </Link>

          <Link to="/sales" className="bg-slate-950/80 p-3 rounded-xl border border-orange-900/40 hover:border-orange-500 transition-all">
            <span className="text-[10px] font-sans font-bold text-orange-300/80 block uppercase">Hazırlanıyor</span>
            <div className="flex items-baseline justify-between mt-1">
              <span className="text-xl font-black text-orange-300">{todayOrderCounts.preparing}</span>
              <span className="text-base">🟠</span>
            </div>
          </Link>

          <Link to="/sales" className="bg-slate-950/80 p-3 rounded-xl border border-emerald-900/40 hover:border-emerald-500 transition-all">
            <span className="text-[10px] font-sans font-bold text-emerald-300/80 block uppercase">Hazırlandı</span>
            <div className="flex items-baseline justify-between mt-1">
              <span className="text-xl font-black text-emerald-300">{todayOrderCounts.prepared}</span>
              <span className="text-base">🟢</span>
            </div>
          </Link>

          <Link to="/sales" className="bg-slate-950/80 p-3 rounded-xl border border-sky-900/40 hover:border-sky-500 transition-all">
            <span className="text-[10px] font-sans font-bold text-sky-300/80 block uppercase">Teslim Edildi</span>
            <div className="flex items-baseline justify-between mt-1">
              <span className="text-xl font-black text-sky-300">{todayOrderCounts.delivered}</span>
              <span className="text-base">🔵</span>
            </div>
          </Link>

          <Link to="/sales" className="bg-slate-950/80 p-3 rounded-xl border border-rose-900/40 hover:border-rose-500 transition-all col-span-2 sm:col-span-1">
            <span className="text-[10px] font-sans font-bold text-rose-300/80 block uppercase">İptal Edildi</span>
            <div className="flex items-baseline justify-between mt-1">
              <span className="text-xl font-black text-rose-400">{todayOrderCounts.cancelled}</span>
              <span className="text-base">🔴</span>
            </div>
          </Link>
        </div>
      </div>

      {/* TODAY'S SNAPSHOT STRIP */}
      <div className="bg-slate-900/90 border border-slate-800/80 rounded-2xl p-4">
        <div className="flex items-center gap-2 mb-3">
          <Calendar className="w-4 h-4 text-brand-400" />
          <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider">Bugünün Özet Ciro & Finansmanı</h3>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800/60">
            <span className="text-xs text-slate-400 font-medium block">Bugünkü Satış</span>
            <span className="text-lg font-extrabold text-white">{formatCurrency(stats.todaySales)}</span>
            <span className="text-[11px] text-slate-500 block mt-0.5">{stats.todaySaleCount} Sipariş Alındı</span>
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

          <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800/60 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-400 font-medium block">STOK DURUMU</span>
                {stats.criticalStockCount > 0 && <AlertTriangle className="w-4 h-4 text-amber-400 animate-pulse" />}
              </div>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="text-sm font-extrabold text-white">Toplam: {stats.warehouseTotalProducts}</span>
                <span className="text-xs font-bold text-amber-300">Kritik: {stats.criticalStockCount}</span>
                <span className="text-xs font-bold text-rose-400">Stoksuz: {stats.outOfStockCount}</span>
              </div>
            </div>
            <Link
              to="/stock?tab=inventory&filter=CRITICAL"
              className="text-[11px] font-bold text-amber-400 hover:text-amber-300 hover:underline block mt-1 flex items-center gap-1"
            >
              <span>⚠️ Kritik stokta olan ürünleri görüntüle →</span>
            </Link>
          </div>
        </div>
      </div>

      {/* MAIN CARDS ROW */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Monthly Sales & Profit Card */}
        <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl relative overflow-hidden shadow-lg">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Bu Ayki Toplam Satış</span>
            <div className="p-2.5 bg-brand-500/10 text-brand-400 rounded-xl">
              <TrendingUp className="w-5 h-5" />
            </div>
          </div>
          <p className="text-3xl font-black text-white mt-3">{formatCurrency(stats.monthlySales)}</p>
          <div className="mt-2 pt-2 border-t border-slate-800/80 flex items-center justify-between text-xs">
            <span className="text-slate-400">Tahmini Brüt Kâr:</span>
            <span className="font-bold text-emerald-400">{formatCurrency(stats.monthlyProfit)}</span>
          </div>
        </div>

        {/* Total Customer Debt */}
        <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl relative overflow-hidden shadow-lg">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Müşteri Cari Alacaklar</span>
            <div className="p-2.5 bg-amber-500/10 text-amber-400 rounded-xl">
              <DollarSign className="w-5 h-5" />
            </div>
          </div>
          <p className="text-3xl font-black text-amber-400 mt-3">{formatCurrency(stats.totalCustomerDebt)}</p>
          <div className="mt-2 pt-2 border-t border-slate-800/80 flex items-center justify-between text-xs">
            <span className="text-slate-400">Piyasadaki Borç Toplamı</span>
            <Link to="/collections" className="font-bold text-brand-400 hover:underline">Tahsilat Planı</Link>
          </div>
        </div>
      </div>

      {/* BUGÜNÜN SİPARİŞLERİ SECTION (REQUIREMENT 3 & 19) */}
      <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl shadow-xl space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShoppingCart className="w-5 h-5 text-brand-400" />
            <h3 className="font-black text-white text-base tracking-tight uppercase">BUGÜNÜN SİPARİŞLERİ</h3>
            <span className="text-xs font-mono font-bold text-slate-400 bg-slate-950 px-2 py-0.5 rounded-md border border-slate-800">
              {todayOrders.length} Adet
            </span>
          </div>
          <Link to="/sales" className="text-xs text-brand-400 hover:underline font-bold">
            Tüm Sipariş Listesi →
          </Link>
        </div>

        {todayOrders.length === 0 ? (
          <div className="p-8 text-center bg-slate-950 rounded-xl border border-slate-800 text-slate-500 text-xs">
            Bugün henüz yeni sipariş alınmadı.
          </div>
        ) : (
          <div className="space-y-2.5">
            {todayOrders.map((s) => {
              const ordSt: OrderStatus = (s.order_status as OrderStatus) || (s.status === 'cancelled' ? 'cancelled' : 'received');
              const conf = ORDER_STATUS_MAP[ordSt] || ORDER_STATUS_MAP.received;
              const isCancelled = ordSt === 'cancelled' || s.status === 'cancelled';

              return (
                <div
                  key={s.id}
                  onClick={() => {
                    setSelectedSaleId(s.id);
                    setDetailModalOpen(true);
                  }}
                  className={`p-3.5 bg-slate-950 rounded-xl border ${conf.badgeBorder} flex flex-col sm:flex-row sm:items-center justify-between gap-3 cursor-pointer hover:bg-slate-950/80 transition-all ${
                    isCancelled ? 'opacity-65' : ''
                  }`}
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-white text-sm font-mono">#{s.sale_number}</span>
                      <span className="text-xs font-semibold text-slate-200">{s.customer_name}</span>
                      <span className="text-[11px] font-mono text-slate-400">
                        ({formatDateTime(s.created_at).split(' ')[1] || formatDateTime(s.created_at)})
                      </span>
                    </div>

                    <div className="flex items-center gap-2 text-xs font-mono">
                      <span className="text-emerald-400 font-extrabold">{formatCurrency(s.total_amount)}</span>
                      <span className="text-slate-600">•</span>
                      <span className="text-slate-400">
                        {s.payment_type === 'pesin' ? 'Peşin' : `${s.term_days || 30}G Vadeli`}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between sm:justify-end gap-3" onClick={(e) => e.stopPropagation()}>
                    <span className={`px-2.5 py-1 rounded-xl text-xs font-extrabold uppercase border ${conf.badgeBg} ${conf.badgeText} ${conf.badgeBorder}`}>
                      {conf.emoji} {conf.label}
                    </span>

                    {!isCancelled && conf.nextStatus ? (
                      <button
                        type="button"
                        onClick={() => handleAdvanceStatus(s)}
                        disabled={updatingStatusId === s.id}
                        className={`px-3 py-1.5 rounded-xl font-bold text-xs uppercase flex items-center gap-1.5 shadow-md active:scale-95 transition-all ${conf.nextActionColor}`}
                      >
                        {updatingStatusId === s.id ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <>
                            <span>{conf.nextActionLabel}</span>
                            <ArrowRight className="w-3.5 h-3.5" />
                          </>
                        )}
                      </button>
                    ) : (
                      <button
                        onClick={() => {
                          setSelectedSaleId(s.id);
                          setDetailModalOpen(true);
                        }}
                        className="p-1.5 text-slate-400 hover:text-white rounded-lg bg-slate-900"
                        title="İncele"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
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

      {/* Modals for Dashboard Interactions */}
      <SaleDetailModal
        isOpen={detailModalOpen}
        onClose={() => setDetailModalOpen(false)}
        saleId={selectedSaleId}
        onRefreshParent={fetchDashboardData}
      />

      <ConfirmDeliveryModal
        isOpen={deliveryModalOpen}
        onClose={() => setDeliveryModalOpen(false)}
        sale={deliverySale}
        onSuccess={fetchDashboardData}
      />

      <CancelSaleModal
        isOpen={cancelModalOpen}
        onClose={() => setCancelModalOpen(false)}
        sale={cancelSale}
        onSuccess={fetchDashboardData}
      />
    </div>
  );
};
