-- PETSHOP TOPTAN SATIŞ İŞLETME YÖNETİM SİSTEMİ
-- Migration: 20260813180000_fix_supplier_payment_balance_check.sql
-- Description: Tedarikçi ödemesi yaparken toplam net bakiye (SUM credit - SUM debit) üzerinden borç kontrolü yapılması ve bakiye senkronizasyonu

CREATE OR REPLACE FUNCTION public.process_supplier_payment_transaction(
  p_supplier_id UUID,
  p_amount NUMERIC(12,2),
  p_payment_method TEXT DEFAULT 'Nakit', -- 'Nakit' | 'Havale/EFT' | 'Kart' | 'Diğer'
  p_notes TEXT DEFAULT NULL,
  p_reference_number TEXT DEFAULT NULL,
  p_payment_date DATE DEFAULT CURRENT_DATE
) RETURNS JSONB AS $$
DECLARE
  v_owner_id UUID;
  v_supplier_name TEXT;
  v_sup_prev_balance NUMERIC(12,2) := 0.00;
  v_sup_new_balance NUMERIC(12,2) := 0.00;
  v_ledger_id UUID;
  v_desc TEXT;
BEGIN
  -- Authenticate user owner
  v_owner_id := auth.uid();
  IF v_owner_id IS NULL THEN
    RAISE EXCEPTION 'Oturum bulunamadı veya yetkisiz erişim.';
  END IF;

  -- Input validations
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'Ödeme tutarı 0''dan büyük olmalıdır.';
  END IF;

  -- Lock supplier record
  SELECT company_name INTO v_supplier_name
  FROM public.suppliers
  WHERE id = p_supplier_id AND owner_id = v_owner_id AND deleted_at IS NULL;

  IF v_supplier_name IS NULL THEN
    RAISE EXCEPTION 'Seçilen tedarikçi firma bulunamadı.';
  END IF;

  -- Compute true current net supplier debt: SUM(credit) - SUM(debit)
  SELECT COALESCE(SUM(credit) - SUM(debit), 0.00) INTO v_sup_prev_balance
  FROM public.supplier_ledger
  WHERE supplier_id = p_supplier_id AND owner_id = v_owner_id AND deleted_at IS NULL;

  IF v_sup_prev_balance < 0 THEN
    v_sup_prev_balance := 0.00;
  END IF;

  -- Overpayment check against actual net debt
  IF p_amount > v_sup_prev_balance THEN
    RAISE EXCEPTION 'Ödeme tutarı ( % TL ) mevcut tedarikçi borcundan ( % TL ) fazla olamaz.', p_amount, v_sup_prev_balance;
  END IF;

  v_sup_new_balance := ROUND(v_sup_prev_balance - p_amount, 2);

  v_desc := 'Tedarikçiye Ödeme (' || COALESCE(p_payment_method, 'Nakit') || ')';
  IF p_reference_number IS NOT NULL AND TRIM(p_reference_number) != '' THEN
    v_desc := v_desc || ' - Ref/Dekont: ' || TRIM(p_reference_number);
  END IF;

  -- Insert Supplier Ledger PAYMENT record
  INSERT INTO public.supplier_ledger (
    owner_id, supplier_id, movement_type, description, debit, credit, balance
  ) VALUES (
    v_owner_id,
    p_supplier_id,
    'PAYMENT',
    v_desc,
    p_amount,
    0.00,
    v_sup_new_balance
  ) RETURNING id INTO v_ledger_id;

  -- Recalculate all running balances for this supplier
  PERFORM public.recalculate_all_supplier_ledger_balances();

  -- Audit Log
  INSERT INTO public.audit_logs (
    owner_id, action, entity_type, entity_id, details
  ) VALUES (
    v_owner_id, 'SUPPLIER_PAYMENT', 'supplier_ledger', v_ledger_id,
    jsonb_build_object(
      'supplier_id', p_supplier_id,
      'supplier_name', v_supplier_name,
      'amount', p_amount,
      'payment_method', p_payment_method,
      'reference_number', p_reference_number,
      'payment_date', p_payment_date,
      'prev_balance', v_sup_prev_balance,
      'new_balance', v_sup_new_balance,
      'notes', p_notes
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'ledger_id', v_ledger_id,
    'amount', p_amount,
    'prev_balance', v_sup_prev_balance,
    'new_balance', v_sup_new_balance
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.process_supplier_payment_transaction(UUID, NUMERIC, TEXT, TEXT, TEXT, DATE) TO authenticated;
