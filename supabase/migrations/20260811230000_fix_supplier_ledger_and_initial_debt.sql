-- PETSHOP TOPTAN SATIŞ İŞLETME YÖNETİM SİSTEMİ
-- Migration: 20260811230000_fix_supplier_ledger_and_initial_debt.sql
-- Description: Stored procedures for adding supplier initial debt/adjustments and recalculating running balances

-- 1. Function to add initial debt / balance adjustment to a supplier
CREATE OR REPLACE FUNCTION public.add_supplier_debt_transaction(
  p_supplier_id UUID,
  p_amount NUMERIC(12,2),
  p_description TEXT DEFAULT 'Açılış Borcu / Bakiye Düzeltme'
) RETURNS JSONB AS $$
DECLARE
  v_owner_id UUID;
  v_prev_bal NUMERIC(12,2) := 0.00;
  v_new_bal NUMERIC(12,2) := 0.00;
  v_supplier_name TEXT;
BEGIN
  v_owner_id := auth.uid();
  IF v_owner_id IS NULL THEN
    RAISE EXCEPTION 'Oturum açmış kullanıcı bulunamadı.';
  END IF;

  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'Eklenen borç tutarı 0 veya negatif olamaz.';
  END IF;

  SELECT company_name INTO v_supplier_name
  FROM public.suppliers
  WHERE id = p_supplier_id AND owner_id = v_owner_id AND deleted_at IS NULL;

  IF v_supplier_name IS NULL THEN
    RAISE EXCEPTION 'Tedarikçi bulunamadı veya yetkiniz yok.';
  END IF;

  -- Lock latest ledger row for supplier
  SELECT COALESCE(balance, 0.00) INTO v_prev_bal
  FROM public.supplier_ledger
  WHERE supplier_id = p_supplier_id AND owner_id = v_owner_id AND deleted_at IS NULL
  ORDER BY created_at DESC LIMIT 1 FOR UPDATE;

  v_new_bal := v_prev_bal + p_amount;

  INSERT INTO public.supplier_ledger (
    owner_id, supplier_id, movement_type, description, debit, credit, balance
  ) VALUES (
    v_owner_id, p_supplier_id, 'ADJUSTMENT', COALESCE(p_description, 'Açılış Borcu / Bakiye Düzeltme'), 0.00, p_amount, v_new_bal
  );

  INSERT INTO public.audit_logs (owner_id, action, entity_type, entity_id, details)
  VALUES (
    v_owner_id, 'ADD_SUPPLIER_DEBT', 'suppliers', p_supplier_id,
    jsonb_build_object('supplier_name', v_supplier_name, 'amount', p_amount, 'old_balance', v_prev_bal, 'new_balance', v_new_bal, 'description', p_description)
  );

  RETURN jsonb_build_object('success', true, 'supplier_name', v_supplier_name, 'new_balance', v_new_bal);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.add_supplier_debt_transaction(UUID, NUMERIC, TEXT) TO authenticated;

-- 2. Function to recalculate all supplier ledger running balances
CREATE OR REPLACE FUNCTION public.recalculate_all_supplier_ledger_balances()
RETURNS void AS $$
DECLARE
  v_sup RECORD;
  v_ledger RECORD;
  v_running_bal NUMERIC(12,2);
BEGIN
  FOR v_sup IN SELECT DISTINCT supplier_id FROM public.supplier_ledger WHERE deleted_at IS NULL LOOP
    v_running_bal := 0.00;

    FOR v_ledger IN
      SELECT id, debit, credit
      FROM public.supplier_ledger
      WHERE supplier_id = v_sup.supplier_id AND deleted_at IS NULL
      ORDER BY created_at ASC, id ASC
    LOOP
      v_running_bal := v_running_bal + COALESCE(v_ledger.credit, 0.00) - COALESCE(v_ledger.debit, 0.00);

      UPDATE public.supplier_ledger
      SET balance = v_running_bal
      WHERE id = v_ledger.id;
    END LOOP;
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.recalculate_all_supplier_ledger_balances() TO authenticated;
