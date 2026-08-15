import { supabase } from '@/lib/supabase';
import { calculateSmartPaymentPlan } from '@/services/smartPaymentEngine';
import { calculateCustomerPaymentDelay } from '@/services/customerOverdueService';
import { formatCurrency, getISOYearMonth } from '@/utils/formatters';

export type PriorityLevel = 'CRITICAL' | 'IMPORTANT' | 'WARNING' | 'OPPORTUNITY';

export type ActionType =
  | 'SUPPLIER_PAYMENT'
  | 'CUSTOMER_PAYMENT'
  | 'WHATSAPP_CUSTOMER'
  | 'STOCK_ENTRY'
  | 'VIEW_CUSTOMER'
  | 'VIEW_PRODUCT'
  | 'PROFIT_TARGETS';

export interface AssistantInsight {
  id: string;
  category: 'SUPPLIER' | 'STOCK' | 'CUSTOMER' | 'PROFIT' | 'CASHFLOW' | 'OPPORTUNITY';
  priority: PriorityLevel;
  title: string;
  description: string;
  whyExplanation: string;
  metricPrimary?: string;
  metricSecondary?: string;
  actionType?: ActionType;
  actionPayload?: {
    supplierId?: string;
    customerId?: string;
    customerPhone?: string;
    customerName?: string;
    productId?: string;
    amount?: number;
    whatsappMessage?: string;
  };
  timeframe: 'TODAY' | 'WEEK' | 'MONTH';
}

export interface BusinessAssistantSummary {
  todayCount: number;
  criticalCount: number;
  importantCount: number;
  warningCount: number;
  opportunityCount: number;
  insights: AssistantInsight[];
  cashflow: {
    weeklyCollection: number;
    recommendedSupplierPayments: number;
    offsetsApplied: number;
    realCashOutflow: number;
    retainedCash: number;
  };
  topProfitableVsTopSold: {
    topSoldName: string;
    topSoldQty: number;
    topSoldProfit: number;
    topProfitableName: string;
    topProfitableQty: number;
    topProfitableProfit: number;
    comparisonText: string;
  } | null;
}

/**
 * Business Assistant Analysis Engine
 * Analyzes database data dynamically and builds prioritized actionable insights.
 */
export async function calculateBusinessAssistantInsights(): Promise<BusinessAssistantSummary> {
  const insights: AssistantInsight[] = [];
  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];

  // 30 Days Date Range for Stock Forecast & Sales Volume Trends
  const past30Days = new Date();
  past30Days.setDate(now.getDate() - 30);
  const past30DaysStr = past30Days.toISOString();

  // 14 Days Date Range for Previous Week Comparison
  const past14Days = new Date();
  past14Days.setDate(now.getDate() - 14);

  const past7Days = new Date();
  past7Days.setDate(now.getDate() - 7);

  // ----------------------------------------------------
  // MODULE 1: SMART SUPPLIER PAYMENT PLAN INTEGRATION
  // ----------------------------------------------------
  const smartPayment = await calculateSmartPaymentPlan();

  smartPayment.supplierPlans.forEach((plan) => {
    if (plan.recommendedCashPayment > 0) {
      const isHighPriority = plan.priorityLevel === 'HIGH';
      insights.push({
        id: `sup-${plan.supplierId}`,
        category: 'SUPPLIER',
        priority: isHighPriority ? 'CRITICAL' : 'IMPORTANT',
        title: `${plan.supplierName} Firmasına Ödeme Öneriliyor`,
        description: `Bu hafta net ${formatCurrency(plan.recommendedCashPayment)} nakit ödeme yapılması öneriliyor. (Toplam vadesi gelen: ${formatCurrency(plan.dueAmount)}, Mahsup: ${formatCurrency(plan.offsetAmount)})`,
        whyExplanation: plan.priorityReason,
        metricPrimary: `Önerilen: ${formatCurrency(plan.recommendedCashPayment)}`,
        metricSecondary: `Mahsup: ${formatCurrency(plan.offsetAmount)}`,
        actionType: 'SUPPLIER_PAYMENT',
        actionPayload: {
          supplierId: plan.supplierId,
          amount: plan.recommendedCashPayment,
        },
        timeframe: 'TODAY',
      });
    }
  });

  // ----------------------------------------------------
  // MODULE 2: OVERDUE CUSTOMER PAYMENTS (GECİKEN MÜŞTERİ ÖDEMELERİ)
  // ----------------------------------------------------
  const { data: overdueSchedules } = await supabase
    .from('payment_schedules')
    .select('*, customer:customers(id, business_name, phone)')
    .in('status', ['pending', 'partially_paid', 'overdue'])
    .lt('due_date', todayStr)
    .is('deleted_at', null)
    .order('due_date', { ascending: true });

  overdueSchedules?.forEach((sched) => {
    const cust = sched.customer as any;
    const custName = cust?.business_name || 'Bilinmeyen Müşteri';
    const amount = Number(sched.remaining_amount || sched.amount || 0);
    const dueDate = new Date(sched.due_date);
    const diffDays = Math.max(1, Math.floor((now.getTime() - dueDate.getTime()) / (1000 * 3600 * 24)));

    const waMsg = `Merhaba ${custName}, petshop işletmeniz için ${formatCurrency(amount)} tutarındaki taksit ödemenizin vadesi ${diffDays} gün gecikmiştir. Ödeme durumunu görüşmek isteriz. İyi çalışmalar dileriz.`;

    insights.push({
      id: `overdue-${sched.id}`,
      category: 'CUSTOMER',
      priority: 'CRITICAL',
      title: `${custName} Ödemesi ${diffDays} Gün Gecikmiş`,
      description: `${custName} müşterisinin ${formatCurrency(amount)} tutarındaki ödemesinin vadesi ${diffDays} gün geçmiştir.`,
      whyExplanation: `Vade Tarihi: ${sched.due_date}, Toplam Taksit Tutarı: ${formatCurrency(sched.amount)}, Kalan Borç: ${formatCurrency(amount)}. Veri payment_schedules tablosundan çekilmiştir.`,
      metricPrimary: `${formatCurrency(amount)} Borç`,
      metricSecondary: `${diffDays} Gün Gecikme`,
      actionType: 'CUSTOMER_PAYMENT',
      actionPayload: {
        customerId: cust?.id,
        customerName: custName,
        customerPhone: cust?.phone,
        amount: amount,
        whatsappMessage: waMsg,
      },
      timeframe: 'TODAY',
    });
  });

  // ----------------------------------------------------
  // MODULE 3: STOCK RUN-OUT & REORDER FORECAST (STOK ASİSTANI)
  // ----------------------------------------------------
  const { data: products } = await supabase
    .from('products')
    .select('id, product_name, current_stock, minimum_stock, purchase_price, sale_price, supplier_id')
    .is('deleted_at', null);

  const { data: sales30Days } = await supabase
    .from('sale_items')
    .select('product_id, quantity, created_at')
    .gte('created_at', past30DaysStr)
    .is('deleted_at', null);

  const productSales30Map = new Map<string, number>();
  sales30Days?.forEach((it) => {
    const qty = Number(it.quantity || 0);
    const prev = productSales30Map.get(it.product_id) || 0;
    productSales30Map.set(it.product_id, prev + qty);
  });

  products?.forEach((p) => {
    const stock = Number(p.current_stock || 0);
    const minStock = Number(p.minimum_stock || 0);
    const total30Qty = productSales30Map.get(p.id) || 0;

    if (total30Qty >= 5) {
      const avgDaily = total30Qty / 30;
      const daysLeft = stock > 0 ? stock / avgDaily : 0;

      if (daysLeft <= 7) {
        const recommendedReorder = Math.max(10, Math.ceil(avgDaily * 20)); // Suggest 20 days supply
        const roundedDays = Math.ceil(daysLeft);

        insights.push({
          id: `stock-runout-${p.id}`,
          category: 'STOCK',
          priority: stock === 0 || roundedDays <= 3 ? 'CRITICAL' : 'IMPORTANT',
          title: `${p.product_name} Yaklaşık ${roundedDays} Gün İçinde Bitecek`,
          description: `Mevcut stok: ${stock} adet. Son 30 gündeki ortalama günlük satış: ${avgDaily.toFixed(1)} adet. Önerilen sipariş: ${recommendedReorder} adet.`,
          whyExplanation: `Son 30 gün toplam satış: ${total30Qty} adet, günlük ortalama: ${avgDaily.toFixed(2)} adet. Mevcut stok (${stock} adet) / günlük satış formülü ile hesaplanmıştır.`,
          metricPrimary: `${stock} Adet Stok`,
          metricSecondary: `~${roundedDays} Gün Kaldı`,
          actionType: 'STOCK_ENTRY',
          actionPayload: {
            productId: p.id,
          },
          timeframe: 'TODAY',
        });
      }
    } else if (stock < minStock) {
      insights.push({
        id: `stock-min-${p.id}`,
        category: 'STOCK',
        priority: 'IMPORTANT',
        title: `${p.product_name} Kritik Stok Seviyesinin Altında`,
        description: `Mevcut stok (${stock} adet), tanımlanan minimum stoğun (${minStock} adet) altındadır. ${total30Qty < 5 ? '(Satış geçmişi az olduğu için gün tahmini yapılmadı)' : ''}`,
        whyExplanation: `Minimum stok limiti: ${minStock} adet, Mevcut depolanan stok: ${stock} adet. Veri products tablosundan çekilmiştir.`,
        metricPrimary: `${stock} Adet`,
        metricSecondary: `Min: ${minStock}`,
        actionType: 'STOCK_ENTRY',
        actionPayload: {
          productId: p.id,
        },
        timeframe: 'TODAY',
      });
    }
  });

  // ----------------------------------------------------
  // MODULE 4: CUSTOMER ORDER FREQUENCY DROP (MÜŞTERİ PERİYODU DÜŞÜŞÜ)
  // ----------------------------------------------------
  const { data: customerSales } = await supabase
    .from('sales')
    .select('customer_id, customer_name, created_at')
    .is('deleted_at', null)
    .order('created_at', { ascending: false });

  const { data: customersList } = await supabase
    .from('customers')
    .select('id, business_name, phone')
    .is('deleted_at', null);

  const customerLastSaleMap = new Map<string, { lastDate: Date; count: number }>();
  customerSales?.forEach((s) => {
    if (!s.customer_id) return;
    const existing = customerLastSaleMap.get(s.customer_id);
    const saleDate = new Date(s.created_at);
    if (!existing) {
      customerLastSaleMap.set(s.customer_id, { lastDate: saleDate, count: 1 });
    } else {
      customerLastSaleMap.set(s.customer_id, {
        lastDate: existing.lastDate > saleDate ? existing.lastDate : saleDate,
        count: existing.count + 1,
      });
    }
  });

  customersList?.forEach((c) => {
    const info = customerLastSaleMap.get(c.id);
    if (info && info.count >= 3) {
      const daysSince = Math.floor((now.getTime() - info.lastDate.getTime()) / (1000 * 3600 * 24));
      const expectedInterval = 10; // Standard wholesale interval threshold

      if (daysSince > expectedInterval + 5) {
        const waMsg = `Merhaba ${c.business_name}, geçen siparişinizin üzerinden biraz zaman geçti (${daysSince} gün oldu). Bu hafta dükkanınız için ihtiyacınız olan mama veya aksesuar ürünleri var mı? Güncel fiyat listemizi iletebilirim.`;

        insights.push({
          id: `cust-drop-${c.id}`,
          category: 'CUSTOMER',
          priority: 'WARNING',
          title: `${c.business_name} Alışveriş Periyodunun ${daysSince - expectedInterval} Gün Üzerine Çıktı`,
          description: `Müşteri en son ${daysSince} gün önce sipariş verdi. (Normal alışveriş sıklığı ~${expectedInterval} gün).`,
          whyExplanation: `Müşterinin toplam ${info.count} geçmiş siparişi bulunmaktadır. Son sipariş tarihi: ${info.lastDate.toLocaleDateString('tr-TR')}. Geçen süre: ${daysSince} gün.`,
          metricPrimary: `${daysSince} Gün Önce`,
          actionType: 'WHATSAPP_CUSTOMER',
          actionPayload: {
            customerId: c.id,
            customerName: c.business_name,
            customerPhone: c.phone,
            whatsappMessage: waMsg,
          },
          timeframe: 'WEEK',
        });
      }
    }
  });

  // ----------------------------------------------------
  // MODULE 4.5: 7-DAY PAYMENT OVERDUE ANALYSIS (7+ GÜN ÖDEME YAPMAYAN MÜŞTERİLER)
  // ----------------------------------------------------
  const { data: cLedgers } = await supabase
    .from('customer_ledger')
    .select('customer_id, balance')
    .is('deleted_at', null)
    .order('created_at', { ascending: false });

  const cDebtMap: Record<string, number> = {};
  cLedgers?.forEach((l) => {
    if (cDebtMap[l.customer_id] === undefined) {
      cDebtMap[l.customer_id] = Number(l.balance || 0);
    }
  });

  const { data: allP } = await supabase.from('payments').select('*').is('deleted_at', null);
  const { data: allS } = await supabase.from('sales').select('*').is('deleted_at', null);

  const overdueList: any[] = [];
  let weeklyDueCount = 0;
  let weeklyDueDebtTotal = 0;
  let criticalDueCount = 0;
  let criticalDueDebtTotal = 0;

  customersList?.forEach((c) => {
    const debt = cDebtMap[c.id] || 0;
    if (debt > 0) {
      const res = calculateCustomerPaymentDelay(c as any, debt, (allP as any) || [], (allS as any) || []);
      if (res.status !== 'normal') {
        overdueList.push(res);
        if (res.daysSinceLastPayment > 10) {
          criticalDueCount++;
          criticalDueDebtTotal += debt;
        } else if (res.daysSinceLastPayment >= 7) {
          weeklyDueCount++;
          weeklyDueDebtTotal += debt;
        }

        const waText = `Merhaba ${c.business_name}, hesabınızda ${formatCurrency(debt)} güncel cari borç bakiyesi bulunmaktadır. Son ödemenizin üzerinden ${res.daysSinceLastPayment} gün geçmiştir. Ödeme durumunuzla ilgili bilgi vermenizi rica ederiz. Teşekkürler.`;

        insights.push({
          id: `cust-overdue-${c.id}`,
          category: 'CUSTOMER',
          priority: res.daysSinceLastPayment > 10 ? 'CRITICAL' : 'IMPORTANT',
          title: `${res.daysSinceLastPayment > 10 ? '🔴' : '🟡'} ${c.business_name} — ${res.daysSinceLastPayment} Gündür Ödeme Yok`,
          description: `Güncel cari borç: ${formatCurrency(debt)}. Son ödeme/teslimat tarihinden bu yana ${res.daysSinceLastPayment} gündür tahsilat yapılmadı.`,
          whyExplanation: `Müşteri borcu 0 TL olmadıkça takip edilir. 7-10 gün uyarısı ve 10+ gün gecikme alarmı verir.`,
          metricPrimary: formatCurrency(debt),
          metricSecondary: `${res.daysSinceLastPayment} Gün`,
          actionType: 'WHATSAPP_CUSTOMER',
          actionPayload: {
            customerId: c.id,
            customerName: c.business_name,
            customerPhone: c.phone,
            whatsappMessage: waText,
          },
          timeframe: 'TODAY',
        });
      }
    }
  });

  // Summary Insight for Weekly Collections
  if (weeklyDueCount > 0 || criticalDueCount > 0) {
    const totCount = weeklyDueCount + criticalDueCount;
    const totDebt = weeklyDueDebtTotal + criticalDueDebtTotal;
    insights.push({
      id: 'weekly-collection-summary',
      category: 'CASHFLOW',
      priority: criticalDueCount > 0 ? 'CRITICAL' : 'IMPORTANT',
      title: `🔴 Bugün ${totCount} Müşteriden Ödeme İstenmesi Gerekiyor`,
      description: `Toplam ${formatCurrency(totDebt)} cari borçları bulunuyor. (${weeklyDueCount} müşteri 7-10 günlük tahsilat penceresinde, ${criticalDueCount} müşterinin ödemesi 10 günü geçti).`,
      whyExplanation: `Müşterilerden her hafta düzenli tahsilat almak işletme nakit akışı için kritik önem taşır. Tahsilat Takip Panelini inceleyin.`,
      metricPrimary: `${totCount} Müşteri`,
      metricSecondary: formatCurrency(totDebt),
      actionType: 'CUSTOMER_PAYMENT',
      timeframe: 'TODAY',
    });
  }

  // ----------------------------------------------------
  // MODULE 5: PROFIT TARGET ANALYSIS (KÂR HEDEFİ ASİSTANI)
  // ----------------------------------------------------
  const { year, month } = getISOYearMonth();
  const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  const { data: targetData } = await supabase
    .from('profit_targets')
    .select('target_profit')
    .eq('year', year)
    .eq('month', month)
    .maybeSingle();

  const { data: monthlySales } = await supabase
    .from('sales')
    .select('total_profit')
    .gte('created_at', firstDayOfMonth)
    .is('deleted_at', null);

  const targetProfit = Number(targetData?.target_profit || 100000);
  const currentProfit = monthlySales?.reduce((acc, curr) => acc + Number(curr.total_profit || 0), 0) || 0;
  const remainingProfit = Math.max(0, targetProfit - currentProfit);

  const lastDayOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const daysLeftInMonth = Math.max(1, lastDayOfMonth.getDate() - now.getDate() + 1);
  const requiredDailyProfit = remainingProfit / daysLeftInMonth;

  if (remainingProfit > 0) {
    const topMarginProds = products
      ? [...products]
          .map((p) => ({
            ...p,
            unitMargin: Number(p.sale_price || 0) - Number(p.purchase_price || 0),
          }))
          .sort((a, b) => b.unitMargin - a.unitMargin)
          .slice(0, 3)
      : [];

    const topListText = topMarginProds
      .map((p, idx) => `${idx + 1}. ${p.product_name} (${formatCurrency(p.unitMargin)}/Adet Kâr)`)
      .join(', ');

    insights.push({
      id: 'profit-target-monthly',
      category: 'PROFIT',
      priority: remainingProfit > targetProfit * 0.5 ? 'WARNING' : 'OPPORTUNITY',
      title: `Aylık Kâr Hedefine Ulaşmak İçin Günlük ~${formatCurrency(requiredDailyProfit)} Kâr Gerekiyor`,
      description: `Aylık kâr hedefinden ${formatCurrency(remainingProfit)} uzaktasın. Kalan ${daysLeftInMonth} günde bu hedefe ulaşmak için yüksek birim kârlı ürünlere odaklanabilirsin. (En kârlı ürünler: ${topListText})`,
      whyExplanation: `Bu ayki kâr hedefi: ${formatCurrency(targetProfit)}, Gerçekleşen brüt kâr: ${formatCurrency(currentProfit)}, Kalan hedef: ${formatCurrency(remainingProfit)}. Ayda kalan gün sayısı: ${daysLeftInMonth}.`,
      metricPrimary: `${formatCurrency(remainingProfit)} Kalan`,
      metricSecondary: `Günlük ~${formatCurrency(requiredDailyProfit)}`,
      actionType: 'PROFIT_TARGETS',
      timeframe: 'MONTH',
    });
  }

  // ----------------------------------------------------
  // MODULE 6: VOLUME VS PROFIT INSIGHTS (EN ÇOK SATAN VS EN ÇOK KAZANDIRAN)
  // ----------------------------------------------------
  const { data: allSaleItems } = await supabase
    .from('sale_items')
    .select('product_id, product_name, quantity, total_amount, purchase_price_snapshot, sale_price_snapshot, created_at')
    .gte('created_at', past30DaysStr)
    .is('deleted_at', null);

  let topProfitableVsTopSold: BusinessAssistantSummary['topProfitableVsTopSold'] = null;

  if (allSaleItems && allSaleItems.length > 0) {
    const itemMap = new Map<string, { qty: number; sales: number; cogs: number }>();

    allSaleItems.forEach((it) => {
      const q = Number(it.quantity || 0);
      const s = Number(it.total_amount || 0);
      const c = q * Number(it.purchase_price_snapshot || 0);

      const prev = itemMap.get(it.product_name) || { qty: 0, sales: 0, cogs: 0 };
      itemMap.set(it.product_name, {
        qty: prev.qty + q,
        sales: prev.sales + s,
        cogs: prev.cogs + c,
      });
    });

    const itemsList = Array.from(itemMap.entries()).map(([name, val]) => ({
      name,
      qty: val.qty,
      profit: Math.max(0, val.sales - val.cogs),
    }));

    const topSold = [...itemsList].sort((a, b) => b.qty - a.qty)[0];
    const topProfitable = [...itemsList].sort((a, b) => b.profit - a.profit)[0];

    if (topSold && topProfitable && topSold.name !== topProfitable.name) {
      const diffProfit = topProfitable.profit - topSold.profit;
      const compText = `"${topProfitable.name}" (${topProfitable.qty} adet satış) daha az adet satılmasına rağmen "${topSold.name}" (${topSold.qty} adet satış) ürününden +${formatCurrency(diffProfit)} daha fazla brüt kâr sağladı.`;

      topProfitableVsTopSold = {
        topSoldName: topSold.name,
        topSoldQty: topSold.qty,
        topSoldProfit: topSold.profit,
        topProfitableName: topProfitable.name,
        topProfitableQty: topProfitable.qty,
        topProfitableProfit: topProfitable.profit,
        comparisonText: compText,
      };

      insights.push({
        id: 'profit-vs-volume-insight',
        category: 'OPPORTUNITY',
        priority: 'OPPORTUNITY',
        title: `En Çok Kazandıran Ürün İçgörüsü`,
        description: compText,
        whyExplanation: `Son 30 gün verilerine göre: En çok adet satan "${topSold.name}" (${topSold.qty} adet, Kâr: ${formatCurrency(topSold.profit)}). En çok kâr getiren "${topProfitable.name}" (${topProfitable.qty} adet, Kâr: ${formatCurrency(topProfitable.profit)}).`,
        metricPrimary: `+${formatCurrency(diffProfit)} Fazla Kâr`,
        actionType: 'VIEW_PRODUCT',
        timeframe: 'WEEK',
      });
    }
  }

  // ----------------------------------------------------
  // MODULE 7: SALES GROWTH OPPORTUNITY (SATIŞ FIRSATI)
  // ----------------------------------------------------
  if (allSaleItems && allSaleItems.length > 0) {
    const thisWeekItems = allSaleItems.filter((it) => new Date(it.created_at || '') >= past7Days);
    const lastWeekItems = allSaleItems.filter((it) => {
      const d = new Date(it.created_at || '');
      return d >= past14Days && d < past7Days;
    });

    const thisWeekMap = new Map<string, number>();
    thisWeekItems.forEach((it) => {
      thisWeekMap.set(it.product_name, (thisWeekMap.get(it.product_name) || 0) + Number(it.quantity || 0));
    });

    const lastWeekMap = new Map<string, number>();
    lastWeekItems.forEach((it) => {
      lastWeekMap.set(it.product_name, (lastWeekMap.get(it.product_name) || 0) + Number(it.quantity || 0));
    });

    thisWeekMap.forEach((qtyThisWeek, prodName) => {
      const qtyLastWeek = lastWeekMap.get(prodName) || 0;
      if (qtyLastWeek >= 5 && qtyThisWeek >= qtyLastWeek * 1.35) {
        const growthPct = Math.round(((qtyThisWeek - qtyLastWeek) / qtyLastWeek) * 100);

        insights.push({
          id: `opp-growth-${prodName}`,
          category: 'OPPORTUNITY',
          priority: 'OPPORTUNITY',
          title: `${prodName} Satışlarında %${growthPct} İvme Artışı`,
          description: `${prodName} ürününün bu haftaki satışları geçen haftaya göre %${growthPct} arttı. Yüksek kâr marjını korumak için tedarik planlaması yapılması önerilir.`,
          whyExplanation: `Geçen hafta satış: ${qtyLastWeek} adet, Bu hafta satış: ${qtyThisWeek} adet. Artış oranı: %${growthPct}.`,
          metricPrimary: `%${growthPct} Artış`,
          actionType: 'VIEW_PRODUCT',
          timeframe: 'WEEK',
        });
      }
    });
  }

  // ----------------------------------------------------
  // MODULE 8: BELOW COST SALES & DISCOUNT ANALYSIS
  // ----------------------------------------------------
  if (allSaleItems && allSaleItems.length > 0 && products) {
    const productStdPriceMap = new Map<string, number>(
      products.map((p) => [p.id, Number(p.sale_price || 0)])
    );

    let totalLossAmount = 0;
    let totalLossQty = 0;
    const lossByProduct = new Map<string, { qty: number; loss: number }>();

    let totalDiscountAmount = 0;
    let totalDiscountQty = 0;
    const discountByProduct = new Map<string, { qty: number; discount: number }>();

    allSaleItems.forEach((it) => {
      const q = Number(it.quantity || 0);
      const sp = Number(it.sale_price_snapshot || 0);
      const cp = Number(it.purchase_price_snapshot || 0);
      const stdPrice = productStdPriceMap.get(it.product_id) || sp;

      if (sp < cp && cp > 0) {
        // Real Below-Cost Loss
        const loss = (cp - sp) * q;
        totalLossAmount += loss;
        totalLossQty += q;

        const prev = lossByProduct.get(it.product_name) || { qty: 0, loss: 0 };
        lossByProduct.set(it.product_name, {
          qty: prev.qty + q,
          loss: prev.loss + loss,
        });
      } else if (stdPrice > sp && sp >= cp) {
        // Profitable Sale with Customer Special Discount
        const discount = (stdPrice - sp) * q;
        totalDiscountAmount += discount;
        totalDiscountQty += q;

        const prev = discountByProduct.get(it.product_name) || { qty: 0, discount: 0 };
        discountByProduct.set(it.product_name, {
          qty: prev.qty + q,
          discount: prev.discount + discount,
        });
      }
    });

    // 1. Real Loss Warning (Only if sale price was strictly below purchase cost)
    if (totalLossQty > 0 && totalLossAmount > 0) {
      const worstProduct = Array.from(lossByProduct.entries()).sort((a, b) => b[1].loss - a[1].loss)[0];

      insights.push({
        id: 'warning-below-cost-sales',
        category: 'PROFIT',
        priority: 'WARNING',
        title: `Zararına Yapılan Satış İkazı (${totalLossQty} Adet Ürün)`,
        description: `Sistemde toplam ${totalLossQty} adet ürün alış maliyetinin altında satıldı. Zarara en çok neden olan ürün: "${worstProduct ? worstProduct[0] : ''}".`,
        whyExplanation: `Toplam Zarar: -${formatCurrency(totalLossAmount)}. Zarar veren ürün dökümü: ${worstProduct ? worstProduct[0] + ' (' + worstProduct[1].qty + ' adet, -' + formatCurrency(worstProduct[1].loss) + ' zarar)' : ''}.`,
        metricPrimary: `-${formatCurrency(totalLossAmount)} Zarar`,
        actionType: 'PROFIT_TARGETS',
        timeframe: 'MONTH',
      });
    }

    // 2. Customer Special Discount Report (When sold above cost but below standard price)
    if (totalDiscountQty > 0 && totalDiscountAmount > 0) {
      const topDiscountedProd = Array.from(discountByProduct.entries()).sort((a, b) => b[1].discount - a[1].discount)[0];

      insights.push({
        id: 'opportunity-customer-discounts',
        category: 'CUSTOMER',
        priority: 'OPPORTUNITY',
        title: `🏷️ Müşterilere Özel İndirim Analizi (${formatCurrency(totalDiscountAmount)} İndirim)`,
        description: `Son 30 gün içinde standart liste fiyatı üzerinden toplam ${formatCurrency(totalDiscountAmount)} müşteri indirimi yapıldı. Tüm indirimli satışlar maliyetin üzerinde kârlı olarak tamamlandı. En çok indirim yapılan ürün: "${topDiscountedProd ? topDiscountedProd[0] : ''}".`,
        whyExplanation: `Toplam Yapılan İndirim: ${formatCurrency(totalDiscountAmount)}. En çok indirim sağlanan ürün: ${topDiscountedProd ? topDiscountedProd[0] + ' (' + topDiscountedProd[1].qty + ' adet, ' + formatCurrency(topDiscountedProd[1].discount) + ' indirim)' : ''}.`,
        metricPrimary: `${formatCurrency(totalDiscountAmount)} İndirim Yapıldı`,
        actionType: 'PROFIT_TARGETS',
        timeframe: 'MONTH',
      });
    }
  }

  // Sort insights by priority order: CRITICAL -> IMPORTANT -> WARNING -> OPPORTUNITY
  const priorityScore: Record<PriorityLevel, number> = {
    CRITICAL: 4,
    IMPORTANT: 3,
    WARNING: 2,
    OPPORTUNITY: 1,
  };

  insights.sort((a, b) => priorityScore[b.priority] - priorityScore[a.priority]);

  // Counts
  const todayInsights = insights.filter((i) => i.timeframe === 'TODAY');
  const criticalCount = insights.filter((i) => i.priority === 'CRITICAL').length;
  const importantCount = insights.filter((i) => i.priority === 'IMPORTANT').length;
  const warningCount = insights.filter((i) => i.priority === 'WARNING').length;
  const opportunityCount = insights.filter((i) => i.priority === 'OPPORTUNITY').length;

  return {
    todayCount: todayInsights.length > 0 ? todayInsights.length : insights.length,
    criticalCount,
    importantCount,
    warningCount,
    opportunityCount,
    insights,
    cashflow: {
      weeklyCollection: smartPayment.weeklyCollection,
      recommendedSupplierPayments: smartPayment.totalRecommendedPayment,
      offsetsApplied: smartPayment.totalOffsetsApplied,
      realCashOutflow: smartPayment.totalRealCashOutflow,
      retainedCash: smartPayment.cashRetainedInBusiness,
    },
    topProfitableVsTopSold,
  };
}
