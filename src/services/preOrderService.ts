import { supabase } from '@/lib/supabase';
import { 
  PreOrder, 
  PreOrderItem, 
  PreOrderStatusHistory, 
  PreOrderStatus, 
  SupplyDemandAnalysisItem,
  ProductUnit 
} from '@/types/database.types';

export const preOrderService = {
  /**
   * Fetch all pre orders with optional status filter and search query
   */
  async getPreOrders(filterStatus: PreOrderStatus | 'ALL' = 'ALL', searchQuery: string = ''): Promise<PreOrder[]> {
    let query = supabase
      .from('pre_orders')
      .select(`
        *,
        pre_order_items (
          *,
          products (
            current_stock,
            purchase_price,
            sale_price
          )
        ),
        customers (
          business_name,
          phone
        )
      `)
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    if (filterStatus && filterStatus !== 'ALL') {
      query = query.eq('status', filterStatus);
    }

    if (searchQuery.trim()) {
      const search = `%${searchQuery.trim()}%`;
      query = query.or(`order_number.ilike.${search},customer_name.ilike.${search}`);
    }

    const { data, error } = await query;
    if (error) {
      console.error('Error fetching pre-orders:', error);
      throw error;
    }
    return data || [];
  },

  /**
   * Fetch single pre order by ID
   */
  async getPreOrderById(id: string): Promise<PreOrder | null> {
    const { data, error } = await supabase
      .from('pre_orders')
      .select(`
        *,
        pre_order_items (
          *,
          products (
            current_stock,
            purchase_price,
            sale_price
          )
        ),
        customers (
          business_name,
          phone
        )
      `)
      .eq('id', id)
      .is('deleted_at', null)
      .single();

    if (error) {
      console.error('Error fetching pre-order detail:', error);
      throw error;
    }
    return data;
  },

  /**
   * Fetch pre order status history
   */
  async getPreOrderStatusHistory(preOrderId: string): Promise<PreOrderStatusHistory[]> {
    const { data, error } = await supabase
      .from('pre_order_status_history')
      .select('*')
      .eq('pre_order_id', preOrderId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching pre-order status history:', error);
      throw error;
    }
    return data || [];
  },

  /**
   * Create new Pre-Order via atomic RPC
   */
  async createPreOrder(
    customerId: string,
    notes: string,
    items: Array<{
      product_id?: string | null;
      product_name: string;
      brand?: string;
      category?: string;
      unit?: string;
      quantity: number;
      estimated_sale_price?: number;
    }>
  ) {
    const { data, error } = await supabase.rpc('create_pre_order_transaction', {
      p_customer_id: customerId,
      p_notes: notes,
      p_items: items,
    });

    if (error) {
      console.error('RPC create_pre_order_transaction error:', error);
      throw error;
    }
    return data;
  },

  /**
   * Create temporary demand product if item is not registered in system
   */
  async createUnregisteredProduct(
    productName: string,
    brand?: string,
    category?: string,
    barcode?: string,
    unit: ProductUnit = 'Adet'
  ) {
    const { data: user } = await supabase.auth.getUser();
    if (!user?.user) throw new Error('Oturum kapalı');

    const { data, error } = await supabase
      .from('products')
      .insert({
        owner_id: user.user.id,
        product_type: 'pre_order',
        product_name: productName,
        brand: brand || null,
        category: category || null,
        barcode: barcode || null,
        unit: unit,
        purchase_price: 0,
        sale_price: 0,
        current_stock: 0,
        minimum_stock: 0,
        show_in_catalog: true,
        active: true,
      })
      .select()
      .single();


    if (error) {
      console.error('Error creating unregistered demand product:', error);
      throw error;
    }
    return data;
  },

  /**
   * Update Pre-Order status
   */
  async updatePreOrderStatus(preOrderId: string, newStatus: PreOrderStatus, note?: string) {
    const { data, error } = await supabase.rpc('update_pre_order_status_transaction', {
      p_pre_order_id: preOrderId,
      p_new_status: newStatus,
      p_note: note || null,
    });

    if (error) {
      console.error('RPC update_pre_order_status_transaction error:', error);
      throw error;
    }
    return data;
  },

  /**
   * Analyze supply demand per product from all open pre-orders
   */
  async getSupplyDemandAnalysis(): Promise<SupplyDemandAnalysisItem[]> {
    // 1. Fetch active pre order items (not delivered, not cancelled)
    const { data: items, error: itemsError } = await supabase
      .from('pre_order_items')
      .select(`
        *,
        pre_orders!inner (
          id,
          order_number,
          customer_id,
          customer_name,
          status,
          created_at
        ),
        products (
          id,
          product_name,
          brand,
          category,
          unit,
          current_stock,
          purchase_price,
          sale_price
        )
      `)
      .not('status', 'in', '("delivered","cancelled")');

    if (itemsError) {
      console.error('Error analyzing supply demand:', itemsError);
      throw itemsError;
    }

    // 2. Fetch all products to match current stocks
    const { data: products } = await supabase
      .from('products')
      .select('*')
      .is('deleted_at', null);

    const productMap = new Map<string, any>();
    (products || []).forEach((p) => productMap.set(p.id, p));

    // Group items by product name / product_id
    const grouped = new Map<string, SupplyDemandAnalysisItem>();

    (items || []).forEach((item: any) => {
      const key = item.product_id || item.product_name.toLowerCase().trim();
      const existing = grouped.get(key);

      const prod = item.product_id ? productMap.get(item.product_id) : null;
      const currentStock = prod ? Number(prod.current_stock) || 0 : 0;
      const demanded = Number(item.demanded_quantity) || 0;
      const fulfilled = Number(item.fulfilled_quantity) || 0;

      if (!existing) {
        grouped.set(key, {
          product_id: item.product_id || null,
          product_name: item.product_name,
          brand: item.brand || prod?.brand || null,
          category: item.category || prod?.category || null,
          unit: item.unit || prod?.unit || 'Adet',
          total_demanded: demanded,
          current_stock: currentStock,
          reserved_stock: fulfilled,
          open_demand: Math.max(0, demanded - fulfilled),
          needed_quantity: Math.max(0, demanded - fulfilled - Math.max(0, currentStock - fulfilled)),
          assigned_supplier_id: item.supplier_id || null,
          assigned_supplier_name: item.supplier_name || null,
          estimated_purchase_price: item.estimated_purchase_price || prod?.purchase_price || 0,
          pre_order_items: [item],
        });
      } else {
        existing.total_demanded += demanded;
        existing.reserved_stock += fulfilled;
        existing.open_demand += Math.max(0, demanded - fulfilled);
        existing.needed_quantity = Math.max(0, existing.total_demanded - Math.max(0, existing.current_stock));
        if (item.supplier_id) {
          existing.assigned_supplier_id = item.supplier_id;
          existing.assigned_supplier_name = item.supplier_name;
        }
        existing.pre_order_items.push(item);
      }
    });

    return Array.from(grouped.values());
  },

  /**
   * Create Supply Order for Supplier
   */
  async createSupplyOrder(
    supplierId: string,
    notes: string,
    items: Array<{
      product_id?: string | null;
      product_name: string;
      quantity: number;
      unit_cost?: number;
      pre_order_item_id?: string | null;
    }>
  ) {
    const { data, error } = await supabase.rpc('create_supply_order_transaction', {
      p_supplier_id: supplierId,
      p_notes: notes,
      p_items: items,
    });

    if (error) {
      console.error('RPC create_supply_order_transaction error:', error);
      throw error;
    }
    return data;
  },

  /**
   * Fulfill open pre orders with available/arriving stock
   */
  async fulfillPreOrders(fulfillments: Array<{ pre_order_item_id: string; fulfill_quantity: number }>) {
    const { data, error } = await supabase.rpc('fulfill_pre_orders_transaction', {
      p_fulfillments: fulfillments,
    });

    if (error) {
      console.error('RPC fulfill_pre_orders_transaction error:', error);
      throw error;
    }
    return data;
  },

  /**
   * Convert completed pre order to real sale (triggers inventory reduction, sale record, customer ledger debt)
   */
  async convertPreOrderToSale(
    preOrderId: string,
    paymentType: 'pesin' | 'vadeli' = 'vadeli',
    termDays: number = 30,
    dueDate?: string,
    notes?: string,
    itemsOverride?: any,
    schedules?: any
  ) {
    const { data, error } = await supabase.rpc('convert_pre_order_to_sale_transaction', {
      p_pre_order_id: preOrderId,
      p_payment_type: paymentType,
      p_term_days: termDays,
      p_due_date: dueDate || null,
      p_notes: notes || null,
      p_items: itemsOverride || null,
      p_schedules: schedules || null,
    });

    if (error) {
      console.error('RPC convert_pre_order_to_sale_transaction error:', error);
      throw error;
    }
    return data;
  },

  /**
   * Cancel Pre-Order
   */
  async cancelPreOrder(preOrderId: string, reason?: string) {
    const { data, error } = await supabase.rpc('cancel_pre_order_transaction', {
      p_pre_order_id: preOrderId,
      p_reason: reason || null,
    });

    if (error) {
      console.error('RPC cancel_pre_order_transaction error:', error);
      throw error;
    }
    return data;
  },

  /**
   * Fetch Dashboard metrics for pre orders & supply demand
   */
  async getDashboardPreOrderStats() {
    const { data: preOrders } = await supabase
      .from('pre_orders')
      .select('id, status, pre_order_items(demanded_quantity, fulfilled_quantity)')
      .is('deleted_at', null);

    const openPreOrders = (preOrders || []).filter(
      (o) => o.status !== 'delivered' && o.status !== 'cancelled'
    );

    let totalDemandedProductsQty = 0;
    let supplyPendingCount = 0;
    let waitingPreparationCount = 0;

    openPreOrders.forEach((o) => {
      if (o.status === 'supply_pending' || o.status === 'demand_received') {
        supplyPendingCount++;
      }
      if (o.status === 'preparing' || o.status === 'prepared') {
        waitingPreparationCount++;
      }
      (o.pre_order_items || []).forEach((item: any) => {
        totalDemandedProductsQty += Number(item.demanded_quantity) || 0;
      });
    });

    const supplyDemand = await this.getSupplyDemandAnalysis();
    const topShortage = supplyDemand.filter((item) => item.needed_quantity > 0);

    return {
      openPreOrdersCount: openPreOrders.length,
      totalDemandedProductsQty,
      supplyPendingCount,
      waitingPreparationCount,
      topShortageProducts: topShortage.slice(0, 5),
      totalMissingProductsQty: topShortage.reduce((sum, i) => sum + i.needed_quantity, 0),
    };
  },
};
