-- PETSHOP TOPTAN SATIŞ İŞLETME YÖNETİM SİSTEMİ
-- Migration: 20260813190000_fix_supplier_offset_balance_check.sql
-- Description: Mahsup işleminde müşteri ve tedarikçi borç kontrolünü net cari bakiyeler (SUM) üzerinden gerçekleştirme

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
  v_ledger_id UUID;
BEGIN
  v_owner_id := auth.uid();
  IF v_owner_id IS NULL THEN
    RAISE EXCEPTION 'Oturum açmış kullanıcı bulunamadı.';
  END IF;

  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'Mahsup tutarı 0 veya negatif olamaz.';
  END IF;

  -- Validate Customer ownership
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

  -- Get Customer's true current net balance: SUM(debit) - SUM(credit)
  SELECT COALESCE(SUM(debit) - SUM(credit), 0.00) INTO v_cust_prev_balance
  FROM public.customer_ledger
  WHERE customer_id = p_customer_id AND owner_id = v_owner_id AND deleted_at IS NULL;

  IF v_cust_prev_balance <= 0 THEN
    SELECT COALESCE(SUM(remaining_amount), 0.00) INTO v_cust_prev_balance
    FROM public.payment_schedules
    WHERE customer_id = p_customer_id AND owner_id = v_owner_id AND status IN ('pending', 'partially_paid', 'overdue') AND deleted_at IS NULL;
  END IF;

  IF v_cust_prev_balance < 0 THEN
    v_cust_prev_balance := 0.00;
  END IF;

  IF v_cust_prev_balance < p_amount THEN
    RAISE EXCEPTION 'Mahsup tutarı ( % TL ) müşterinin kalan borcundan ( % TL ) fazla olamaz.', p_amount, v_cust_prev_balance;
  END IF;

  -- Get Supplier's true current net balance: SUM(credit) - SUM(debit)
  SELECT COALESCE(SUM(credit) - SUM(debit), 0.00) INTO v_sup_prev_balance
  FROM public.supplier_ledger
  WHERE supplier_id = p_supplier_id AND owner_id = v_owner_id AND deleted_at IS NULL;

  IF v_sup_prev_balance < 0 THEN
    v_sup_prev_balance := 0.00;
  END IF;

  IF v_sup_prev_balance < p_amount THEN
    RAISE EXCEPTION 'Mahsup tutarı (%) tedarikçinin kalan borcundan (%) fazla olamaz.', p_amount, v_sup_prev_balance;
  END IF;

  -- 1. Create Payment record for customer
  INSERT INTO public.payments (
    owner_id, customer_id, supplier_id, amount, payment_method, payment_type, payment_date, notes
  ) VALUES (
    v_owner_id, p_customer_id, p_supplier_id, p_amount, 'Tedarikçiye Mahsup', 'CUSTOMER_PAYMENT', CURRENT_DATE, p_notes
  ) RETURNING id INTO v_payment_id;

  -- 2. Create Customer Ledger Entry (credit reduces customer debt)
  v_cust_new_balance := ROUND(v_cust_prev_balance - p_amount, 2);

  INSERT INTO public.customer_ledger (
    owner_id, customer_id, payment_id, movement_type, description, debit, credit, balance
  ) VALUES (
    v_owner_id, p_customer_id, v_payment_id, 'ÖDEME', 'Tedarikçiye Mahsup (' || v_supplier_name || ')', 0.00, p_amount, v_cust_new_balance
  );

  -- 3. Create Supplier Ledger Entry (debit reduces supplier debt)
  v_sup_new_balance := ROUND(v_sup_prev_balance - p_amount, 2);

  INSERT INTO public.supplier_ledger (
    owner_id, supplier_id, movement_type, description, debit, credit, balance, reference_id
  ) VALUES (
    v_owner_id, p_supplier_id, 'OFFSET', 'Müşteriden Mahsup (' || v_customer_name || ')', p_amount, 0.00, v_sup_new_balance, v_payment_id
  ) RETURNING id INTO v_ledger_id;

  -- Recalculate running balances for both customer and supplier
  PERFORM public.recalculate_all_supplier_ledger_balances();

  -- 4. Apply payment to payment schedules (oldest due_date first)
  v_rem_pay := p_amount;
  FOR v_sched IN
    SELECT id, amount, paid_amount, remaining_amount
    FROM public.payment_schedules
    WHERE customer_id = p_customer_id AND owner_id = v_owner_id AND status IN ('pending', 'partially_paid', 'overdue') AND deleted_at IS NULL
    ORDER BY due_date ASC
  LOOP
    EXIT WHEN v_rem_pay <= 0;

    v_apply := LEAST(v_rem_pay, v_sched.remaining_amount);
    v_new_paid := v_sched.paid_amount + v_apply;
    v_new_rem := v_sched.remaining_amount - v_apply;
    v_sched_status := CASE WHEN v_new_rem = 0 THEN 'paid' ELSE 'partially_paid' END;

    UPDATE public.payment_schedules
    SET paid_amount = v_new_paid,
        remaining_amount = v_new_rem,
        status = v_sched_status,
        paid_at = CASE WHEN v_sched_status = 'paid' THEN NOW() ELSE paid_at END
    WHERE id = v_sched.id;

    v_rem_pay := v_rem_pay - v_apply;
  END LOOP;

  -- 5. Audit Log
  INSERT INTO public.audit_logs (owner_id, action, entity_type, entity_id, details)
  VALUES (
    v_owner_id, 'PROCESS_SUPPLIER_OFFSET', 'payments', v_payment_id,
    jsonb_build_object(
      'customer_id', p_customer_id,
      'customer_name', v_customer_name,
      'supplier_id', p_supplier_id,
      'supplier_name', v_supplier_name,
      'amount', p_amount,
      'new_customer_balance', v_cust_new_balance,
      'new_supplier_balance', v_sup_new_balance
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'payment_id', v_payment_id,
    'customer_name', v_customer_name,
    'supplier_name', v_supplier_name,
    'amount', p_amount,
    'prev_customer_balance', v_cust_prev_balance,
    'new_customer_balance', v_cust_new_balance,
    'prev_supplier_balance', v_sup_prev_balance,
    'new_supplier_balance', v_sup_new_balance
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.process_supplier_offset_transaction(UUID, UUID, NUMERIC, TEXT) TO authenticated;
