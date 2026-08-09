-- PETSHOP TOPTAN SATIŞ İŞLETME YÖNETİM SİSTEMİ
-- Migration: Supplier Ledger & Supplier Offset Payment System

-- 1. SUPPLIER LEDGER TABLE
CREATE TABLE IF NOT EXISTS public.supplier_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  supplier_id UUID NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  movement_type TEXT NOT NULL CHECK (movement_type IN ('PURCHASE', 'PAYMENT', 'OFFSET', 'ADJUSTMENT', 'RETURN')),
  description TEXT NOT NULL,
  debit NUMERIC(12,2) DEFAULT 0.00 CHECK (debit >= 0),   -- Borç Kapama / Mahsup (Tedarikçi Borcunu Azaltır)
  credit NUMERIC(12,2) DEFAULT 0.00 CHECK (credit >= 0),  -- Vadeli Mal Alımı (Tedarikçi Borcunu Artırır)
  balance NUMERIC(12,2) DEFAULT 0.00 CHECK (balance >= 0), -- Güncel Tedarikçi Borç Bakiyesi
  reference_id UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

-- INDEXES FOR SUPPLIER LEDGER
CREATE INDEX IF NOT EXISTS idx_supplier_ledger_owner ON public.supplier_ledger(owner_id);
CREATE INDEX IF NOT EXISTS idx_supplier_ledger_supplier ON public.supplier_ledger(supplier_id);
CREATE INDEX IF NOT EXISTS idx_supplier_ledger_created ON public.supplier_ledger(created_at);

-- RLS POLICIES FOR SUPPLIER LEDGER
ALTER TABLE public.supplier_ledger ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage their own supplier ledger" ON public.supplier_ledger FOR ALL USING (owner_id = auth.uid());

-- 2. ALTER PAYMENTS TABLE FOR SUPPLIER OFFSET
ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS supplier_id UUID REFERENCES public.suppliers(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS payment_type TEXT DEFAULT 'CUSTOMER_PAYMENT';

-- Add Constraint: Tedarikçiye Mahsup requires supplier_id
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'check_supplier_offset_requires_supplier_id'
  ) THEN
    ALTER TABLE public.payments
      ADD CONSTRAINT check_supplier_offset_requires_supplier_id
      CHECK (payment_method != 'Tedarikçiye Mahsup' OR supplier_id IS NOT NULL);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_payments_supplier ON public.payments(supplier_id);


-- 3. ATOMIC PROCESS SUPPLIER OFFSET TRANSACTION PROCEDURE
CREATE OR REPLACE FUNCTION public.process_supplier_offset_transaction(
  p_customer_id UUID,
  p_supplier_id UUID,
  p_amount NUMERIC(12,2),
  p_notes TEXT DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
  v_owner_id UUID;
  v_payment_id UUID;
  v_customer_name TEXT;
  v_supplier_name TEXT;
  v_cust_prev_balance NUMERIC(12,2) := 0.00;
  v_cust_new_balance NUMERIC(12,2) := 0.00;
  v_sup_prev_balance NUMERIC(12,2) := 0.00;
  v_sup_new_balance NUMERIC(12,2) := 0.00;
  v_rem_pay NUMERIC(12,2);
  v_sched RECORD;
  v_apply NUMERIC(12,2);
  v_new_paid NUMERIC(12,2);
  v_new_rem NUMERIC(12,2);
  v_sched_status TEXT;
BEGIN
  v_owner_id := auth.uid();
  IF v_owner_id IS NULL THEN
    RAISE EXCEPTION 'Oturum açmış kullanıcı bulunamadı.';
  END IF;

  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'Mahsup tutarı 0 veya negatif olamaz.';
  END IF;

  -- Validate Customer ownership and fetch current debt
  SELECT business_name INTO v_customer_name
  FROM public.customers
  WHERE id = p_customer_id AND owner_id = v_owner_id AND deleted_at IS NULL;

  IF v_customer_name IS NULL THEN
    RAISE EXCEPTION 'Müşteri bulunamadı veya yetkiniz yok.';
  END IF;

  -- Validate Supplier ownership
  SELECT company_name INTO v_supplier_name
  FROM public.suppliers
  WHERE id = p_supplier_id AND owner_id = v_owner_id AND deleted_at IS NULL;

  IF v_supplier_name IS NULL THEN
    RAISE EXCEPTION 'Tedarikçi bulunamadı veya yetkiniz yok.';
  END IF;

  -- Get Customer's current balance with lock
  SELECT COALESCE(balance, 0.00) INTO v_cust_prev_balance
  FROM public.customer_ledger
  WHERE customer_id = p_customer_id AND owner_id = v_owner_id AND deleted_at IS NULL
  ORDER BY created_at DESC LIMIT 1 FOR UPDATE;

  IF v_cust_prev_balance < p_amount THEN
    RAISE EXCEPTION 'Mahsup tutarı (%) müşterinin kalan borcundan (%) fazla olamaz.', p_amount, v_cust_prev_balance;
  END IF;

  -- Get Supplier's current balance with lock
  SELECT COALESCE(balance, 0.00) INTO v_sup_prev_balance
  FROM public.supplier_ledger
  WHERE supplier_id = p_supplier_id AND owner_id = v_owner_id AND deleted_at IS NULL
  ORDER BY created_at DESC LIMIT 1 FOR UPDATE;

  IF v_sup_prev_balance < p_amount THEN
    RAISE EXCEPTION 'Mahsup tutarı (%) tedarikçinin kalan borcundan (%) fazla olamaz.', p_amount, v_sup_prev_balance;
  END IF;

  -- 1. Create Payment record for customer
  INSERT INTO public.payments (
    owner_id, customer_id, supplier_id, amount, payment_method, payment_type, payment_date, notes
  ) VALUES (
    v_owner_id, p_customer_id, p_supplier_id, p_amount, 'Tedarikçiye Mahsup', 'SUPPLIER_OFFSET', CURRENT_DATE, p_notes
  ) RETURNING id INTO v_payment_id;

  -- 2. Update Customer Ledger
  v_cust_new_balance := v_cust_prev_balance - p_amount;

  INSERT INTO public.customer_ledger (
    owner_id, customer_id, payment_id, movement_type, description, debit, credit, balance
  ) VALUES (
    v_owner_id, p_customer_id, v_payment_id, 'ÖDEME', 'Tahsilat - ' || v_supplier_name || ' Mahsup', 0, p_amount, v_cust_new_balance
  );

  -- 3. Update Customer Payment Schedules (oldest due_date first)
  v_rem_pay := p_amount;

  FOR v_sched IN
    SELECT * FROM public.payment_schedules
    WHERE customer_id = p_customer_id AND owner_id = v_owner_id AND status IN ('pending', 'partially_paid', 'overdue') AND deleted_at IS NULL
    ORDER BY due_date ASC, created_at ASC FOR UPDATE
  LOOP
    EXIT WHEN v_rem_pay <= 0;

    v_apply := LEAST(v_rem_pay, v_sched.remaining_amount);
    v_new_paid := v_sched.paid_amount + v_apply;
    v_new_rem := v_sched.remaining_amount - v_apply;

    IF v_new_rem = 0 THEN
      v_sched_status := 'paid';
    ELSE
      v_sched_status := 'partially_paid';
    END IF;

    UPDATE public.payment_schedules
    SET paid_amount = v_new_paid,
        remaining_amount = v_new_rem,
        status = v_sched_status,
        paid_at = CASE WHEN v_new_rem = 0 THEN NOW() ELSE paid_at END
    WHERE id = v_sched.id;

    -- Update parent sale
    UPDATE public.sales
    SET paid_amount = paid_amount + v_apply,
        remaining_debt = GREATEST(0, remaining_debt - v_apply),
        status = CASE WHEN (remaining_debt - v_apply) <= 0 THEN 'paid' ELSE 'partially_paid' END
    WHERE id = v_sched.sale_id;

    v_rem_pay := v_rem_pay - v_apply;
  END LOOP;

  -- 4. Update Supplier Ledger
  v_sup_new_balance := v_sup_prev_balance - p_amount;

  INSERT INTO public.supplier_ledger (
    owner_id, supplier_id, movement_type, description, debit, credit, balance, reference_id
  ) VALUES (
    v_owner_id, p_supplier_id, 'OFFSET', v_customer_name || ' kart ödemesi - Mahsup', p_amount, 0, v_sup_new_balance, v_payment_id
  );

  -- 5. Audit Log Entry
  INSERT INTO public.audit_logs (
    owner_id, action, entity_type, entity_id, details
  ) VALUES (
    v_owner_id, 'SUPPLIER_OFFSET', 'payments', v_payment_id,
    jsonb_build_object(
      'customer_name', v_customer_name,
      'supplier_name', v_supplier_name,
      'amount', p_amount,
      'old_customer_balance', v_cust_prev_balance,
      'new_customer_balance', v_cust_new_balance,
      'old_supplier_balance', v_sup_prev_balance,
      'new_supplier_balance', v_sup_new_balance
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'payment_id', v_payment_id,
    'new_customer_balance', v_cust_new_balance,
    'new_supplier_balance', v_sup_new_balance
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 4. UPDATE STOCK ENTRY TRANSACTION TO SUPPORT SUPPLIER DEBT FOR VADELİ MAL ALIMI
CREATE OR REPLACE FUNCTION public.stock_entry_transaction(
  p_product_id UUID,
  p_movement_type TEXT, -- PURCHASE, ADJUSTMENT, RETURN, DAMAGE
  p_quantity NUMERIC(12,2),
  p_unit_cost NUMERIC(12,2) DEFAULT NULL,
  p_note TEXT DEFAULT NULL,
  p_purchase_type TEXT DEFAULT 'pesin', -- pesin, vadeli
  p_supplier_id UUID DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
  v_owner_id UUID;
  v_product RECORD;
  v_supplier_name TEXT;
  v_new_stock NUMERIC(12,2);
  v_cost NUMERIC(12,2);
  v_purchase_total NUMERIC(12,2);
  v_sup_prev_balance NUMERIC(12,2) := 0.00;
  v_sup_new_balance NUMERIC(12,2) := 0.00;
BEGIN
  v_owner_id := auth.uid();
  IF v_owner_id IS NULL THEN
    RAISE EXCEPTION 'Oturum açmış kullanıcı bulunamadı.';
  END IF;

  IF p_quantity <= 0 THEN
    RAISE EXCEPTION 'İşlem miktarı 0 veya negatif olamaz.';
  END IF;

  IF p_unit_cost IS NOT NULL AND p_unit_cost < 0 THEN
    RAISE EXCEPTION 'Birim alış fiyatı negatif olamaz.';
  END IF;

  SELECT * INTO v_product FROM public.products
  WHERE id = p_product_id AND owner_id = v_owner_id AND deleted_at IS NULL FOR UPDATE;

  IF v_product IS NULL THEN
    RAISE EXCEPTION 'Ürün bulunamadı.';
  END IF;

  v_cost := COALESCE(p_unit_cost, v_product.purchase_price);

  IF p_movement_type IN ('PURCHASE', 'RETURN', 'INITIAL') THEN
    v_new_stock := v_product.current_stock + p_quantity;
  ELSIF p_movement_type IN ('DAMAGE') THEN
    IF v_product.current_stock < p_quantity THEN
      RAISE EXCEPTION 'Zayiat düşülecek stok miktarı mevcut stoktan ( % ) büyük olamaz.', v_product.current_stock;
    END IF;
    v_new_stock := v_product.current_stock - p_quantity;
  ELSIF p_movement_type = 'ADJUSTMENT' THEN
    v_new_stock := p_quantity; -- Absolute count set
  ELSE
    RAISE EXCEPTION 'Geçersiz stok hareket tipi: %', p_movement_type;
  END IF;

  -- Update product current stock and optional unit cost if purchase
  UPDATE public.products
  SET current_stock = v_new_stock,
      purchase_price = CASE WHEN p_movement_type = 'PURCHASE' AND p_unit_cost IS NOT NULL AND p_unit_cost > 0 THEN p_unit_cost ELSE purchase_price END,
      supplier_id = CASE WHEN p_supplier_id IS NOT NULL THEN p_supplier_id ELSE supplier_id END,
      updated_at = NOW()
  WHERE id = p_product_id;

  -- Insert movement log
  INSERT INTO public.stock_movements (
    owner_id, product_id, movement_type, quantity, unit_cost, note
  ) VALUES (
    v_owner_id, p_product_id, p_movement_type, p_quantity, v_cost, p_note
  );

  -- Create Supplier Ledger entry if vadeli mal alımı
  IF p_movement_type = 'PURCHASE' AND p_purchase_type = 'vadeli' AND p_supplier_id IS NOT NULL THEN
    SELECT company_name INTO v_supplier_name
    FROM public.suppliers
    WHERE id = p_supplier_id AND owner_id = v_owner_id AND deleted_at IS NULL;

    IF v_supplier_name IS NOT NULL THEN
      v_purchase_total := ROUND(p_quantity * v_cost, 2);

      SELECT COALESCE(balance, 0.00) INTO v_sup_prev_balance
      FROM public.supplier_ledger
      WHERE supplier_id = p_supplier_id AND owner_id = v_owner_id AND deleted_at IS NULL
      ORDER BY created_at DESC LIMIT 1 FOR UPDATE;

      v_sup_new_balance := v_sup_prev_balance + v_purchase_total;

      INSERT INTO public.supplier_ledger (
        owner_id, supplier_id, movement_type, description, debit, credit, balance
      ) VALUES (
        v_owner_id, p_supplier_id, 'PURCHASE', 'Vadeli Mal Alımı - ' || v_product.product_name || ' (' || p_quantity || ' Adet)', 0, v_purchase_total, v_sup_new_balance
      );
    END IF;
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
      'old_stock', v_product.current_stock,
      'new_stock', v_new_stock,
      'quantity', p_quantity,
      'note', p_note
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'product_id', p_product_id,
    'new_stock', v_new_stock
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
