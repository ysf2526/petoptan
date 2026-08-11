-- PETSHOP TOPTAN SATIŞ İŞLETME YÖNETİM SİSTEMİ
-- Migration: Fix Customer Ledger Running Balances & Update RPC Procedures

-- 1. Helper Function to Recalculate All Customer Running Balances
CREATE OR REPLACE FUNCTION public.recalculate_all_customer_ledger_balances()
RETURNS void AS $$
DECLARE
  v_cust RECORD;
  v_ledger RECORD;
  v_running_bal NUMERIC(12,2);
BEGIN
  FOR v_cust IN SELECT DISTINCT customer_id FROM public.customer_ledger WHERE deleted_at IS NULL LOOP
    v_running_bal := 0.00;

    FOR v_ledger IN
      SELECT id, debit, credit
      FROM public.customer_ledger
      WHERE customer_id = v_cust.customer_id AND deleted_at IS NULL
      ORDER BY created_at ASC, id ASC
    LOOP
      v_running_bal := v_running_bal + COALESCE(v_ledger.debit, 0.00) - COALESCE(v_ledger.credit, 0.00);

      UPDATE public.customer_ledger
      SET balance = v_running_bal
      WHERE id = v_ledger.id;
    END LOOP;
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.recalculate_all_customer_ledger_balances() TO authenticated;

-- Run initial recalculation to fix existing broken ledger rows immediately
SELECT public.recalculate_all_customer_ledger_balances();


-- 2. UPDATED UPDATE_SALE_TRANSACTION PROCEDURE (With Proper Running Balance)
CREATE OR REPLACE FUNCTION public.update_sale_transaction(
  p_sale_id UUID,
  p_items JSONB,    -- [{product_id, quantity, sale_price, purchase_price}]
  p_notes TEXT DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
  v_owner_id UUID;
  v_sale RECORD;
  v_sale_number TEXT;
  v_customer_id UUID;
  v_old_total NUMERIC(12,2);
  v_old_paid NUMERIC(12,2);
  v_item JSONB;
  v_product RECORD;
  v_prod_id UUID;
  v_new_qty NUMERIC(12,2);
  v_unit_sale_price NUMERIC(12,2);
  v_unit_cost NUMERIC(12,2);
  v_item_total NUMERIC(12,2);
  v_item_cost NUMERIC(12,2);
  v_item_profit NUMERIC(12,2);
  v_new_total_amount NUMERIC(12,2) := 0.00;
  v_new_total_cost NUMERIC(12,2) := 0.00;
  v_new_total_profit NUMERIC(12,2) := 0.00;
  v_total_diff NUMERIC(12,2);
  v_new_remaining_debt NUMERIC(12,2);
  v_new_status TEXT;

  v_delta_qty NUMERIC(12,2);
  v_unpaid_count INT;
  v_new_sched_amount NUMERIC(12,2);
  v_prev_balance NUMERIC(12,2) := 0.00;
  v_new_balance NUMERIC(12,2) := 0.00;
BEGIN
  v_owner_id := auth.uid();
  IF v_owner_id IS NULL THEN
    RAISE EXCEPTION 'Oturum açmış kullanıcı bulunamadı.';
  END IF;

  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Sipariş en az 1 ürün içermelidir.';
  END IF;

  -- Lock sale row
  SELECT * INTO v_sale FROM public.sales
  WHERE id = p_sale_id AND owner_id = v_owner_id AND deleted_at IS NULL FOR UPDATE;

  IF v_sale IS NULL THEN
    RAISE EXCEPTION 'Sipariş bulunamadı veya silinmiş.';
  END IF;

  IF v_sale.status = 'cancelled' THEN
    RAISE EXCEPTION 'İptal edilmiş bir sipariş düzenlenemez.';
  END IF;

  v_sale_number := v_sale.sale_number;
  v_customer_id := v_sale.customer_id;
  v_old_total := v_sale.total_amount;
  v_old_paid := v_sale.paid_amount;

  -- Create temp tables for stock reconciliation
  CREATE TEMP TABLE tmp_old_items ON COMMIT DROP AS
  SELECT product_id, SUM(quantity) as old_qty, MAX(purchase_price_snapshot) as old_cost
  FROM public.sale_items
  WHERE sale_id = p_sale_id AND deleted_at IS NULL
  GROUP BY product_id;

  CREATE TEMP TABLE tmp_new_items (
    product_id UUID,
    new_qty NUMERIC(12,2),
    sale_price NUMERIC(12,2),
    purchase_price NUMERIC(12,2)
  ) ON COMMIT DROP;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_prod_id := (v_item->>'product_id')::UUID;
    v_new_qty := (v_item->>'quantity')::NUMERIC;
    v_unit_sale_price := (v_item->>'sale_price')::NUMERIC;
    v_unit_cost := COALESCE((v_item->>'purchase_price')::NUMERIC, 0.00);

    IF v_new_qty <= 0 THEN
      RAISE EXCEPTION 'Ürün miktarı 0 veya negatif olamaz.';
    END IF;

    INSERT INTO tmp_new_items (product_id, new_qty, sale_price, purchase_price)
    VALUES (v_prod_id, v_new_qty, v_unit_sale_price, v_unit_cost);
  END LOOP;

  -- Reconcile Stock Movements & Update Stock for all affected products
  FOR v_product IN
    SELECT p.id, p.product_name, p.current_stock, p.unit, p.purchase_price,
           COALESCE(o.old_qty, 0) as old_qty,
           COALESCE(n.new_qty, 0) as new_qty,
           COALESCE(n.sale_price, 0) as sale_price,
           COALESCE(n.purchase_price, p.purchase_price) as cost_price
    FROM (
      SELECT product_id FROM tmp_old_items
      UNION
      SELECT product_id FROM tmp_new_items
    ) ids
    JOIN public.products p ON p.id = ids.product_id AND p.owner_id = v_owner_id
    LEFT JOIN tmp_old_items o ON o.product_id = p.id
    LEFT JOIN tmp_new_items n ON n.product_id = p.id
  LOOP
    v_delta_qty := v_product.new_qty - v_product.old_qty;

    IF v_delta_qty > 0 THEN
      -- Customer requested MORE quantity -> deduct additional stock
      IF v_product.current_stock < v_delta_qty THEN
        RAISE EXCEPTION 'Yetersiz stok: % ürünü için % adet daha stok gereklidir. Mevcut stok: %',
          v_product.product_name, v_delta_qty, v_product.current_stock;
      END IF;

      UPDATE public.products
      SET current_stock = current_stock - v_delta_qty, updated_at = NOW()
      WHERE id = v_product.id;

      INSERT INTO public.stock_movements (
        owner_id, product_id, movement_type, quantity, unit_cost, reference_id, note
      ) VALUES (
        v_owner_id, v_product.id, 'SALE', v_delta_qty, v_product.cost_price, p_sale_id,
        'Sipariş Düzenleme (+' || v_delta_qty || ' ' || v_product.unit || ')'
      );

    ELSIF v_delta_qty < 0 THEN
      -- Customer requested LESS quantity or removed item -> return stock to warehouse
      UPDATE public.products
      SET current_stock = current_stock + ABS(v_delta_qty), updated_at = NOW()
      WHERE id = v_product.id;

      INSERT INTO public.stock_movements (
        owner_id, product_id, movement_type, quantity, unit_cost, reference_id, note
      ) VALUES (
        v_owner_id, v_product.id, 'RETURN', ABS(v_delta_qty), v_product.cost_price, p_sale_id,
        'Sipariş Düzenleme İadesi (-' || ABS(v_delta_qty) || ' ' || v_product.unit || ')'
      );
    END IF;
  END LOOP;

  -- Delete old sale_items and insert new sale_items
  DELETE FROM public.sale_items WHERE sale_id = p_sale_id AND owner_id = v_owner_id;

  FOR v_product IN
    SELECT p.id, p.product_name, p.unit, p.purchase_price,
           n.new_qty, n.sale_price, n.purchase_price as custom_cost
    FROM tmp_new_items n
    JOIN public.products p ON p.id = n.product_id
  LOOP
    v_unit_cost := CASE WHEN v_product.custom_cost > 0 THEN v_product.custom_cost ELSE v_product.purchase_price END;
    v_item_total := ROUND(v_product.new_qty * v_product.sale_price, 2);
    v_item_cost := ROUND(v_product.new_qty * v_unit_cost, 2);
    v_item_profit := v_item_total - v_item_cost;

    v_new_total_amount := v_new_total_amount + v_item_total;
    v_new_total_cost := v_new_total_cost + v_item_cost;
    v_new_total_profit := v_new_total_profit + v_item_profit;

    INSERT INTO public.sale_items (
      owner_id, sale_id, product_id, product_name, unit, quantity,
      purchase_price_snapshot, sale_price_snapshot, total_amount, total_cost, total_profit
    ) VALUES (
      v_owner_id, p_sale_id, v_product.id, v_product.product_name, v_product.unit, v_product.new_qty,
      v_unit_cost, v_product.sale_price, v_item_total, v_item_cost, v_item_profit
    );
  END LOOP;

  -- Total difference and remaining debt calculations
  v_total_diff := v_new_total_amount - v_old_total;
  v_new_remaining_debt := GREATEST(0.00, v_new_total_amount - v_old_paid);
  v_new_status := CASE
    WHEN v_old_paid >= v_new_total_amount THEN 'paid'
    WHEN v_old_paid > 0 THEN 'partially_paid'
    ELSE 'pending'
  END;

  -- Update master sales table
  UPDATE public.sales
  SET total_amount = v_new_total_amount,
      total_cost = v_new_total_cost,
      total_profit = v_new_total_profit,
      remaining_debt = v_new_remaining_debt,
      status = v_new_status,
      notes = COALESCE(p_notes, notes)
  WHERE id = p_sale_id AND owner_id = v_owner_id;

  -- Adjust customer ledger with running balance
  IF v_total_diff <> 0 THEN
    SELECT COALESCE(balance, 0.00) INTO v_prev_balance
    FROM public.customer_ledger
    WHERE customer_id = v_customer_id AND owner_id = v_owner_id AND deleted_at IS NULL
    ORDER BY created_at DESC, id DESC LIMIT 1;

    IF v_total_diff > 0 THEN
      v_new_balance := v_prev_balance + v_total_diff;

      INSERT INTO public.customer_ledger (
        owner_id, customer_id, sale_id, movement_type, description, debit, credit, balance
      ) VALUES (
        v_owner_id, v_customer_id, p_sale_id, 'BORÇ',
        'Sipariş Güncelleme Borç Artışı (#' || v_sale_number || ')', v_total_diff, 0.00, v_new_balance
      );
    ELSE
      v_new_balance := v_prev_balance - ABS(v_total_diff);

      INSERT INTO public.customer_ledger (
        owner_id, customer_id, sale_id, movement_type, description, debit, credit, balance
      ) VALUES (
        v_owner_id, v_customer_id, p_sale_id, 'DÜZELTME',
        'Sipariş Güncelleme Borç İndirimi (#' || v_sale_number || ')', 0.00, ABS(v_total_diff), v_new_balance
      );
    END IF;
  END IF;

  -- Recalculate unpaid payment schedules safely
  SELECT COUNT(*) INTO v_unpaid_count
  FROM public.payment_schedules
  WHERE sale_id = p_sale_id AND status IN ('pending', 'partially_paid', 'overdue') AND deleted_at IS NULL;

  IF v_unpaid_count > 0 THEN
    IF v_new_remaining_debt <= 0 THEN
      -- Fully paid or debt cleared -> cancel remaining unpaid schedules
      UPDATE public.payment_schedules
      SET status = 'paid', remaining_amount = 0.00, paid_at = NOW()
      WHERE sale_id = p_sale_id AND status IN ('pending', 'partially_paid', 'overdue') AND deleted_at IS NULL;
    ELSE
      -- Recalculate remaining unpaid schedules evenly
      v_new_sched_amount := ROUND(v_new_remaining_debt / v_unpaid_count, 2);

      UPDATE public.payment_schedules
      SET amount = v_new_sched_amount,
          remaining_amount = GREATEST(0.00, v_new_sched_amount - paid_amount),
          status = CASE WHEN paid_amount >= v_new_sched_amount THEN 'paid' ELSE 'pending' END
      WHERE sale_id = p_sale_id AND status IN ('pending', 'partially_paid', 'overdue') AND deleted_at IS NULL;
    END IF;
  END IF;

  -- Audit Log
  INSERT INTO public.audit_logs (owner_id, action, entity_type, entity_id, details)
  VALUES (
    v_owner_id, 'UPDATE_SALE', 'SALE', p_sale_id,
    json_build_object(
      'sale_number', v_sale_number,
      'old_total', v_old_total,
      'new_total', v_new_total_amount,
      'diff', v_total_diff
    )
  );

  RETURN json_build_object(
    'success', true,
    'sale_id', p_sale_id,
    'sale_number', v_sale_number,
    'old_total', v_old_total,
    'new_total', v_new_total_amount,
    'diff', v_total_diff
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.update_sale_transaction(UUID, JSONB, TEXT) TO authenticated;


-- 3. UPDATED CANCEL_SALE_TRANSACTION PROCEDURE (With Proper Running Balance)
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
  v_prev_balance NUMERIC(12,2) := 0.00;
  v_new_balance NUMERIC(12,2) := 0.00;
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

  IF v_sale.status = 'cancelled' THEN
    RAISE EXCEPTION 'Bu sipariş zaten iptal edilmiştir.';
  END IF;

  v_sale_number := v_sale.sale_number;
  v_customer_id := v_sale.customer_id;
  v_total_amount := v_sale.total_amount;
  v_remaining_debt := v_sale.remaining_debt;

  -- Restore stock for all items in this sale
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

  -- Mark sales as cancelled and remaining debt as 0
  UPDATE public.sales
  SET status = 'cancelled',
      remaining_debt = 0.00,
      notes = COALESCE(notes, '') || ' [İptal Sebebi: ' || COALESCE(p_reason, 'Kullanıcı İptali') || ']'
  WHERE id = p_sale_id AND owner_id = v_owner_id;

  -- Zero out customer debt in ledger with running balance
  IF v_remaining_debt > 0 THEN
    SELECT COALESCE(balance, 0.00) INTO v_prev_balance
    FROM public.customer_ledger
    WHERE customer_id = v_customer_id AND owner_id = v_owner_id AND deleted_at IS NULL
    ORDER BY created_at DESC, id DESC LIMIT 1;

    v_new_balance := GREATEST(0.00, v_prev_balance - v_remaining_debt);

    INSERT INTO public.customer_ledger (
      owner_id, customer_id, sale_id, movement_type, description, debit, credit, balance
    ) VALUES (
      v_owner_id, v_customer_id, p_sale_id, 'İADE',
      'Sipariş İptali İadesi (#' || v_sale_number || ')', 0.00, v_remaining_debt, v_new_balance
    );
  END IF;

  -- Mark remaining payment schedules as cancelled
  UPDATE public.payment_schedules
  SET status = 'cancelled', remaining_amount = 0.00
  WHERE sale_id = p_sale_id AND status IN ('pending', 'partially_paid', 'overdue') AND deleted_at IS NULL;

  -- Audit log
  INSERT INTO public.audit_logs (owner_id, action, entity_type, entity_id, details)
  VALUES (
    v_owner_id, 'CANCEL_SALE', 'SALE', p_sale_id,
    json_build_object('sale_number', v_sale_number, 'reason', p_reason, 'refunded_debt', v_remaining_debt)
  );

  RETURN json_build_object(
    'success', true,
    'sale_id', p_sale_id,
    'sale_number', v_sale_number,
    'refunded_debt', v_remaining_debt
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.cancel_sale_transaction(UUID, TEXT) TO authenticated;
