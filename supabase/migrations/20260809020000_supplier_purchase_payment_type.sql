-- Migration: 20260809020000_supplier_purchase_payment_type.sql
-- Description: İyileştirilmiş Mal Girişi ve Peşin / Vadeli Tedarikçi Borç Yönetimi Stored Procedure

CREATE OR REPLACE FUNCTION public.stock_entry_transaction(
  p_product_id UUID,
  p_movement_type TEXT,
  p_quantity NUMERIC,
  p_unit_cost NUMERIC DEFAULT NULL,
  p_note TEXT DEFAULT NULL,
  p_purchase_type TEXT DEFAULT 'pesin', -- 'pesin' | 'vadeli'
  p_supplier_id UUID DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
  v_owner_id UUID;
  v_product RECORD;
  v_new_stock NUMERIC;
  v_cost NUMERIC;
  v_movement_id UUID;
  v_supplier_name TEXT;
  v_sup_prev_balance NUMERIC := 0.00;
  v_sup_new_balance NUMERIC := 0.00;
  v_purchase_total NUMERIC := 0.00;
BEGIN
  -- Authenticate owner
  v_owner_id := auth.uid();
  IF v_owner_id IS NULL THEN
    RAISE EXCEPTION 'Oturum bulunamadı veya yetkisiz erişim.';
  END IF;

  -- Input validations
  IF p_quantity <= 0 AND p_movement_type != 'ADJUSTMENT' THEN
    RAISE EXCEPTION 'Miktar 0''dan büyük olmalıdır.';
  END IF;

  -- Lock product record
  SELECT * INTO v_product
  FROM public.products
  WHERE id = p_product_id AND owner_id = v_owner_id AND deleted_at IS NULL FOR UPDATE;

  IF v_product IS NULL THEN
    RAISE EXCEPTION 'Ürün bulunamadı.';
  END IF;

  -- Validate Supplier if supplier_id passed
  IF p_supplier_id IS NOT NULL THEN
    SELECT company_name INTO v_supplier_name
    FROM public.suppliers
    WHERE id = p_supplier_id AND owner_id = v_owner_id AND deleted_at IS NULL;

    IF v_supplier_name IS NULL THEN
      RAISE EXCEPTION 'Seçilen tedarikçi bulunamadı.';
    END IF;
  END IF;

  v_cost := COALESCE(p_unit_cost, v_product.purchase_price);
  IF v_cost < 0 THEN
    RAISE EXCEPTION 'Birim alış fiyatı negatif olamaz.';
  END IF;

  -- Calculate new stock level
  IF p_movement_type IN ('PURCHASE', 'RETURN', 'INITIAL') THEN
    v_new_stock := v_product.current_stock + p_quantity;
  ELSIF p_movement_type IN ('DAMAGE') THEN
    IF v_product.current_stock < p_quantity THEN
      RAISE EXCEPTION 'Zayiat düşülecek stok miktarı mevcut stoktan ( % ) büyük olamaz.', v_product.current_stock;
    END IF;
    v_new_stock := v_product.current_stock - p_quantity;
  ELSIF p_movement_type = 'ADJUSTMENT' THEN
    v_new_stock := p_quantity;
  ELSE
    RAISE EXCEPTION 'Geçersiz stok hareket tipi: %', p_movement_type;
  END IF;

  -- Update product current stock, purchase price, and supplier_id
  UPDATE public.products
  SET current_stock = v_new_stock,
      purchase_price = CASE WHEN p_movement_type = 'PURCHASE' AND v_cost > 0 THEN v_cost ELSE purchase_price END,
      supplier_id = CASE WHEN p_supplier_id IS NOT NULL THEN p_supplier_id ELSE supplier_id END,
      updated_at = NOW()
  WHERE id = p_product_id;

  -- Insert stock movement record
  INSERT INTO public.stock_movements (
    owner_id, product_id, movement_type, quantity, unit_cost, note
  ) VALUES (
    v_owner_id, p_product_id, p_movement_type, p_quantity, v_cost, p_note
  ) RETURNING id INTO v_movement_id;

  -- Process Supplier Ledger ONLY IF PURCHASE AND VADELI AND SUPPLIER IS SELECTED
  IF p_movement_type = 'PURCHASE' AND LOWER(p_purchase_type) = 'vadeli' AND p_supplier_id IS NOT NULL THEN
    v_purchase_total := ROUND(p_quantity * v_cost, 2);

    -- Lock latest supplier ledger balance
    SELECT COALESCE(balance, 0.00) INTO v_sup_prev_balance
    FROM public.supplier_ledger
    WHERE supplier_id = p_supplier_id AND owner_id = v_owner_id AND deleted_at IS NULL
    ORDER BY created_at DESC LIMIT 1 FOR UPDATE;

    v_sup_new_balance := v_sup_prev_balance + v_purchase_total;

    INSERT INTO public.supplier_ledger (
      owner_id, supplier_id, movement_type, description, debit, credit, balance, reference_id
    ) VALUES (
      v_owner_id,
      p_supplier_id,
      'PURCHASE',
      'Vadeli Mal Alımı - ' || v_product.product_name || ' (' || p_quantity || ' ' || COALESCE(v_product.unit, 'Adet') || ')',
      0.00,
      v_purchase_total,
      v_sup_new_balance,
      v_movement_id
    );
  END IF;

  -- Audit log
  INSERT INTO public.audit_logs (
    owner_id, action, entity_type, entity_id, details
  ) VALUES (
    v_owner_id, 'STOCK_MOVEMENT', 'products', p_product_id,
    jsonb_build_object(
      'product_name', v_product.product_name,
      'movement_type', p_movement_type,
      'purchase_type', p_purchase_type,
      'supplier_id', p_supplier_id,
      'old_stock', v_product.current_stock,
      'new_stock', v_new_stock,
      'quantity', p_quantity,
      'unit_cost', v_cost,
      'debt_added', v_purchase_total,
      'new_supplier_balance', v_sup_new_balance,
      'note', p_note
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'product_id', p_product_id,
    'new_stock', v_new_stock,
    'purchase_type', p_purchase_type,
    'debt_added', v_purchase_total,
    'new_supplier_balance', v_sup_new_balance
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
