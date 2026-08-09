-- Migration: 20260809040000_process_supplier_payment_transaction.sql
-- Description: Tedarikçiye Doğrudan Ödeme Yapma, Borçtan Düşme ve Ödeme İptali (Reversal) Stored Procedure'leri

-- 1. PROCESS SUPPLIER PAYMENT TRANSACTION RPC
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

  -- Lock latest supplier ledger balance
  SELECT COALESCE(balance, 0.00) INTO v_sup_prev_balance
  FROM public.supplier_ledger
  WHERE supplier_id = p_supplier_id AND owner_id = v_owner_id AND deleted_at IS NULL
  ORDER BY created_at DESC LIMIT 1 FOR UPDATE;

  -- Overpayment check
  IF p_amount > v_sup_prev_balance THEN
    RAISE EXCEPTION 'Ödeme tutarı ( % TL ) mevcut tedarikçi borcundan ( % TL ) fazla olamaz.', p_amount, v_sup_prev_balance;
  END IF;

  v_sup_new_balance := ROUND(v_sup_prev_balance - p_amount, 2);

  v_desc := 'Tedarikçiye Ödeme (' || COALESCE(p_payment_method, 'Nakit') || ')';
  IF p_reference_number IS NOT NULL AND TRIM(p_reference_number) != '' THEN
    v_desc := v_desc || ' - Ref/Dekont: ' || TRIM(p_reference_number);
  END IF;

  -- Insert Supplier Ledger PAYMENT record (debit reduces debt)
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


-- 2. CANCEL SUPPLIER PAYMENT TRANSACTION RPC
CREATE OR REPLACE FUNCTION public.cancel_supplier_payment_transaction(
  p_ledger_id UUID,
  p_reason TEXT DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
  v_owner_id UUID;
  v_ledger RECORD;
  v_sup_prev_balance NUMERIC(12,2) := 0.00;
  v_sup_new_balance NUMERIC(12,2) := 0.00;
  v_reversal_id UUID;
BEGIN
  -- Authenticate user owner
  v_owner_id := auth.uid();
  IF v_owner_id IS NULL THEN
    RAISE EXCEPTION 'Oturum bulunamadı veya yetkisiz erişim.';
  END IF;

  -- Find target ledger row
  SELECT * INTO v_ledger
  FROM public.supplier_ledger
  WHERE id = p_ledger_id AND owner_id = v_owner_id AND deleted_at IS NULL FOR UPDATE;

  IF v_ledger IS NULL THEN
    RAISE EXCEPTION 'İptal edilecek tedarikçi ödeme kaydı bulunamadı.';
  END IF;

  IF v_ledger.movement_type != 'PAYMENT' THEN
    RAISE EXCEPTION 'Yalnızca tedarikçi ödeme (PAYMENT) hareketleri iptal edilebilir.';
  END IF;

  -- Lock latest balance for supplier
  SELECT COALESCE(balance, 0.00) INTO v_sup_prev_balance
  FROM public.supplier_ledger
  WHERE supplier_id = v_ledger.supplier_id AND owner_id = v_owner_id AND deleted_at IS NULL
  ORDER BY created_at DESC LIMIT 1 FOR UPDATE;

  v_sup_new_balance := ROUND(v_sup_prev_balance + v_ledger.debit, 2);

  -- Soft delete target payment row
  UPDATE public.supplier_ledger
  SET deleted_at = NOW()
  WHERE id = p_ledger_id;

  -- Insert Reversal Ledger Row (credit restores debt)
  INSERT INTO public.supplier_ledger (
    owner_id, supplier_id, movement_type, description, debit, credit, balance, reference_id
  ) VALUES (
    v_owner_id,
    v_ledger.supplier_id,
    'ADJUSTMENT',
    'İPTAL EDİLDİ: ' || v_ledger.description || COALESCE(' (' || p_reason || ')', ''),
    0.00,
    v_ledger.debit,
    v_sup_new_balance,
    p_ledger_id
  ) RETURNING id INTO v_reversal_id;

  -- Audit Log
  INSERT INTO public.audit_logs (
    owner_id, action, entity_type, entity_id, details
  ) VALUES (
    v_owner_id, 'CANCEL_SUPPLIER_PAYMENT', 'supplier_ledger', p_ledger_id,
    jsonb_build_object(
      'supplier_id', v_ledger.supplier_id,
      'canceled_amount', v_ledger.debit,
      'prev_balance', v_sup_prev_balance,
      'new_balance', v_sup_new_balance,
      'reason', p_reason
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'reversal_id', v_reversal_id,
    'restored_amount', v_ledger.debit,
    'new_balance', v_sup_new_balance
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
