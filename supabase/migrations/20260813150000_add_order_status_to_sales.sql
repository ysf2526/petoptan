-- MIGRATION: Add operational order_status column to sales table
-- Date: 2026-08-13
-- Author: Antigravity

ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS order_status TEXT NOT NULL DEFAULT 'received';

-- Update existing cancelled sales
UPDATE public.sales
SET order_status = 'cancelled'
WHERE status = 'cancelled';

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_sales_order_status ON public.sales(order_status);

-- Update create_sale_transaction procedure to set default order_status
CREATE OR REPLACE FUNCTION public.create_sale_transaction(
  p_customer_id UUID,
  p_items JSONB,
  p_payment_type TEXT,
  p_term_days INT DEFAULT 30,
  p_due_date DATE DEFAULT NULL,
  p_notes TEXT DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
  v_owner_id UUID;
  v_customer_name TEXT;
  v_sale_id UUID;
  v_sale_number TEXT;
  v_total_amount NUMERIC(12,2) := 0.00;
  v_total_cost NUMERIC(12,2) := 0.00;
  v_total_profit NUMERIC(12,2) := 0.00;
  v_status TEXT;
  v_prev_balance NUMERIC(12,2) := 0.00;
  v_new_balance NUMERIC(12,2) := 0.00;

  v_item JSONB;
  v_prod_id UUID;
  v_qty NUMERIC(12,2);
  v_unit_sale_price NUMERIC(12,2);
  v_product RECORD;
  v_item_cost NUMERIC(12,2);
  v_item_total NUMERIC(12,2);
  v_item_profit NUMERIC(12,2);
BEGIN
  v_owner_id := auth.uid();
  IF v_owner_id IS NULL THEN
    RAISE EXCEPTION 'Oturum açmış kullanıcı bulunamadı.';
  END IF;

  SELECT business_name INTO v_customer_name FROM public.customers
  WHERE id = p_customer_id AND owner_id = v_owner_id AND deleted_at IS NULL;

  IF v_customer_name IS NULL THEN
    RAISE EXCEPTION 'Müşteri bulunamadı veya silinmiş.';
  END IF;

  v_sale_number := 'SAT-' || to_char(NOW(), 'YYYYMMDD') || '-' || lpad(floor(random() * 10000)::text, 4, '0');
  v_status := CASE WHEN p_payment_type = 'pesin' THEN 'paid' ELSE 'pending' END;

  INSERT INTO public.sales (
    owner_id, sale_number, customer_id, customer_name, total_amount, total_cost, total_profit,
    payment_type, term_days, due_date, status, order_status, paid_amount, remaining_debt, notes
  ) VALUES (
    v_owner_id, v_sale_number, p_customer_id, v_customer_name, 0, 0, 0,
    p_payment_type, p_term_days, p_due_date, v_status, 'received',
    CASE WHEN p_payment_type = 'pesin' THEN 0 ELSE 0 END,
    0, p_notes
  ) RETURNING id INTO v_sale_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_prod_id := (v_item->>'product_id')::UUID;
    v_qty := (v_item->>'quantity')::NUMERIC;
    v_unit_sale_price := (v_item->>'sale_price')::NUMERIC;

    IF v_qty <= 0 THEN
      RAISE EXCEPTION 'Satış miktarı 0 veya negatif olamaz.';
    END IF;

    IF v_unit_sale_price < 0 THEN
      RAISE EXCEPTION 'Satış fiyatı negatif olamaz.';
    END IF;

    SELECT * INTO v_product FROM public.products
    WHERE id = v_prod_id AND owner_id = v_owner_id AND deleted_at IS NULL FOR UPDATE;

    IF v_product IS NULL THEN
      RAISE EXCEPTION 'Ürün (ID: %) bulunamadı.', v_prod_id;
    END IF;

    IF v_product.current_stock < v_qty THEN
      RAISE EXCEPTION '% ürününün stok miktarı yetersiz! Depoda % adet var, satılmak istenen: %',
        v_product.product_name, v_product.current_stock, v_qty;
    END IF;

    v_item_cost := v_qty * v_product.purchase_price;
    v_item_total := v_qty * v_unit_sale_price;
    v_item_profit := v_item_total - v_item_cost;

    v_total_amount := v_total_amount + v_item_total;
    v_total_cost := v_total_cost + v_item_cost;
    v_total_profit := v_total_profit + v_item_profit;

    INSERT INTO public.sale_items (
      owner_id, sale_id, product_id, product_name, unit, quantity,
      purchase_price_snapshot, sale_price_snapshot, total_amount, total_cost, total_profit
    ) VALUES (
      v_owner_id, v_sale_id, v_prod_id, v_product.product_name, v_product.unit, v_qty,
      v_product.purchase_price, v_unit_sale_price, v_item_total, v_item_cost, v_item_profit
    );

    UPDATE public.products
    SET current_stock = current_stock - v_qty, updated_at = NOW()
    WHERE id = v_prod_id AND owner_id = v_owner_id;

    INSERT INTO public.stock_movements (
      owner_id, product_id, movement_type, quantity, unit_cost, reference_id, note
    ) VALUES (
      v_owner_id, v_prod_id, 'SALE', v_qty, v_product.purchase_price, v_sale_id,
      'Toptan Satış #' || v_sale_number || ' - Müşteri: ' || v_customer_name
    );
  END LOOP;

  UPDATE public.sales
  SET total_amount = v_total_amount,
      total_cost = v_total_cost,
      total_profit = v_total_profit,
      paid_amount = CASE WHEN p_payment_type = 'pesin' THEN v_total_amount ELSE 0.00 END,
      remaining_debt = CASE WHEN p_payment_type = 'pesin' THEN 0.00 ELSE v_total_amount END
  WHERE id = v_sale_id AND owner_id = v_owner_id;

  SELECT balance INTO v_prev_balance FROM public.customer_ledger
  WHERE customer_id = p_customer_id AND owner_id = v_owner_id AND deleted_at IS NULL
  ORDER BY created_at DESC, id DESC LIMIT 1;
  IF v_prev_balance IS NULL THEN v_prev_balance := 0.00; END IF;

  v_new_balance := v_prev_balance + v_total_amount;
  INSERT INTO public.customer_ledger (
    owner_id, customer_id, sale_id, movement_type, description, debit, credit, balance
  ) VALUES (
    v_owner_id, p_customer_id, v_sale_id, 'BORÇ', 'Toptan Satış #' || v_sale_number, v_total_amount, 0, v_new_balance
  );

  IF p_payment_type = 'pesin' THEN
    v_prev_balance := v_new_balance;
    v_new_balance := v_prev_balance - v_total_amount;

    INSERT INTO public.payments (
      owner_id, customer_id, amount, payment_method, payment_type, payment_date, notes
    ) VALUES (
      v_owner_id, p_customer_id, v_total_amount, 'Nakit', 'pesin_satis', NOW()::DATE::TEXT, 'Peşin Satış Tahsilatı #' || v_sale_number
    );

    INSERT INTO public.customer_ledger (
      owner_id, customer_id, sale_id, movement_type, description, debit, credit, balance
    ) VALUES (
      v_owner_id, p_customer_id, v_sale_id, 'ÖDEME', 'Peşin Tahsilat #' || v_sale_number, 0, v_total_amount, v_new_balance
    );
  ELSE
    INSERT INTO public.payment_schedules (
      owner_id, customer_id, sale_id, due_date, amount, paid_amount, remaining_amount, status
    ) VALUES (
      v_owner_id, p_customer_id, v_sale_id, COALESCE(p_due_date, (NOW() + (p_term_days || ' days')::INTERVAL)::DATE),
      v_total_amount, 0.00, v_total_amount, 'pending'
    );
  END IF;

  INSERT INTO public.audit_logs (
    owner_id, action, entity_type, entity_id, details
  ) VALUES (
    v_owner_id, 'CREATE_SALE', 'sales', v_sale_id,
    jsonb_build_object('sale_number', v_sale_number, 'total_amount', v_total_amount, 'customer_name', v_customer_name, 'payment_type', p_payment_type, 'order_status', 'received')
  );

  INSERT INTO public.audit_logs (
    owner_id, action, entity_type, entity_id, details
  ) VALUES (
    v_owner_id, 'ORDER_STATUS_CHANGED', 'sales', v_sale_id,
    jsonb_build_object('sale_number', v_sale_number, 'customer_name', v_customer_name, 'old_status', NULL, 'new_status', 'received')
  );

  RETURN jsonb_build_object(
    'success', true,
    'sale_id', v_sale_id,
    'sale_number', v_sale_number,
    'total_amount', v_total_amount,
    'total_profit', v_total_profit
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update cancel_sale_transaction to update order_status to 'cancelled'
CREATE OR REPLACE FUNCTION public.cancel_sale_transaction(
  p_sale_id UUID,
  p_reason TEXT DEFAULT 'Kullanıcı İptali'
) RETURNS JSONB AS $$
DECLARE
  v_owner_id UUID;
  v_sale RECORD;
  v_sale_number TEXT;
  v_customer_id UUID;
  v_total_amount NUMERIC(12,2);
  v_remaining_debt NUMERIC(12,2);
  v_item RECORD;
  v_old_order_status TEXT;
BEGIN
  v_owner_id := auth.uid();
  IF v_owner_id IS NULL THEN
    RAISE EXCEPTION 'Oturum açmış kullanıcı bulunamadı.';
  END IF;

  SELECT * INTO v_sale FROM public.sales
  WHERE id = p_sale_id AND owner_id = v_owner_id AND deleted_at IS NULL FOR UPDATE;

  IF v_sale IS NULL THEN
    RAISE EXCEPTION 'Sipariş bulunamadı veya silinmiş.';
  END IF;

  IF v_sale.status = 'cancelled' OR v_sale.order_status = 'cancelled' THEN
    RAISE EXCEPTION 'Bu sipariş zaten iptal edilmiştir.';
  END IF;

  v_sale_number := v_sale.sale_number;
  v_customer_id := v_sale.customer_id;
  v_total_amount := v_sale.total_amount;
  v_remaining_debt := v_sale.remaining_debt;
  v_old_order_status := COALESCE(v_sale.order_status, 'received');

  FOR v_item IN
    SELECT product_id, quantity, purchase_price_snapshot, product_name
    FROM public.sale_items
    WHERE sale_id = p_sale_id AND deleted_at IS NULL
  LOOP
    UPDATE public.products
    SET current_stock = current_stock + v_item.quantity, updated_at = NOW()
    WHERE id = v_item.product_id AND owner_id = v_owner_id;

    INSERT INTO public.stock_movements (
      owner_id, product_id, movement_type, quantity, unit_cost, reference_id, note
    ) VALUES (
      v_owner_id, v_item.product_id, 'RETURN', v_item.quantity, v_item.purchase_price_snapshot, p_sale_id,
      'Sipariş İptal İadesi (#' || v_sale_number || ' - ' || v_item.product_name || ')'
    );
  END LOOP;

  UPDATE public.sales
  SET status = 'cancelled',
      order_status = 'cancelled',
      remaining_debt = 0.00,
      notes = COALESCE(notes, '') || ' [İptal Sebebi: ' || COALESCE(p_reason, 'Kullanıcı İptali') || ']'
  WHERE id = p_sale_id AND owner_id = v_owner_id;

  UPDATE public.customer_ledger
  SET debit = 0.00,
      description = 'Sipariş İptal Edildi (#' || v_sale_number || ')'
  WHERE sale_id = p_sale_id AND owner_id = v_owner_id AND movement_type = 'BORÇ';

  DELETE FROM public.customer_ledger
  WHERE sale_id = p_sale_id AND owner_id = v_owner_id AND movement_type IN ('DÜZELTME', 'İADE');

  PERFORM public.recalculate_customer_ledger(v_customer_id, v_owner_id);

  UPDATE public.payment_schedules
  SET status = 'paid', remaining_amount = 0.00, paid_at = NOW()
  WHERE sale_id = p_sale_id AND owner_id = v_owner_id;

  INSERT INTO public.audit_logs (
    owner_id, action, entity_type, entity_id, details
  ) VALUES (
    v_owner_id, 'CANCEL_SALE', 'sales', p_sale_id,
    jsonb_build_object('sale_number', v_sale_number, 'reason', p_reason, 'refunded_debt', v_remaining_debt)
  );

  INSERT INTO public.audit_logs (
    owner_id, action, entity_type, entity_id, details
  ) VALUES (
    v_owner_id, 'ORDER_STATUS_CHANGED', 'sales', p_sale_id,
    jsonb_build_object('sale_number', v_sale_number, 'customer_name', v_sale.customer_name, 'old_status', v_old_order_status, 'new_status', 'cancelled')
  );

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Sipariş başarıyla iptal edildi ve stoklar depoya iade edildi.'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
