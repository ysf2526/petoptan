-- PETSHOP TOPTAN SATIŞ İŞLETME YÖNETİM SİSTEMİ
-- Migration: Customer Weekly Payment Target & Consolidated Plan Support

-- 1. Add weekly_payment_target column to customers table
ALTER TABLE public.customers
ADD COLUMN IF NOT EXISTS weekly_payment_target NUMERIC(12,2) DEFAULT 0.00 CHECK (weekly_payment_target >= 0);

-- 2. Function to update customer weekly payment target
CREATE OR REPLACE FUNCTION public.update_customer_weekly_target(
  p_customer_id UUID,
  p_weekly_target NUMERIC(12,2)
) RETURNS JSONB AS $$
DECLARE
  v_owner_id UUID;
BEGIN
  v_owner_id := auth.uid();
  IF v_owner_id IS NULL THEN
    RAISE EXCEPTION 'Oturum açmış kullanıcı bulunamadı.';
  END IF;

  UPDATE public.customers
  SET weekly_payment_target = GREATEST(0.00, COALESCE(p_weekly_target, 0.00)),
      updated_at = NOW()
  WHERE id = p_customer_id AND owner_id = v_owner_id AND deleted_at IS NULL;

  -- Audit log
  INSERT INTO public.audit_logs (owner_id, action, entity_type, entity_id, details)
  VALUES (
    v_owner_id, 'UPDATE_CUSTOMER_WEEKLY_TARGET', 'CUSTOMER', p_customer_id,
    jsonb_build_object('weekly_payment_target', p_weekly_target)
  );

  RETURN jsonb_build_object('success', true, 'weekly_payment_target', p_weekly_target);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.update_customer_weekly_target(UUID, NUMERIC) TO authenticated;
