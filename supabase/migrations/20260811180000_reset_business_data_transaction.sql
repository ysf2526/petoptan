-- PETSHOP TOPTAN SATIŞ İŞLETME YÖNETİM SİSTEMİ
-- Migration: Reset Business Data Stored Procedure (Owner-Isolated & FK Safe)

CREATE OR REPLACE FUNCTION public.reset_business_data_transaction()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_owner_id uuid;
BEGIN
  v_owner_id := auth.uid();
  IF v_owner_id IS NULL THEN
    RAISE EXCEPTION 'Yetkisiz işlem: Oturum açmış kullanıcı bulunamadı.';
  END IF;

  -- 1. Pre-Order & Supply detail tables (Safe FK Order)
  DELETE FROM public.pre_order_status_history WHERE owner_id = v_owner_id;
  DELETE FROM public.pre_order_items WHERE owner_id = v_owner_id;
  DELETE FROM public.supply_order_items WHERE owner_id = v_owner_id;
  DELETE FROM public.pre_orders WHERE owner_id = v_owner_id;
  DELETE FROM public.supply_orders WHERE owner_id = v_owner_id;

  -- 2. Child / Detail tables (Foreign Key order)
  DELETE FROM public.sale_items WHERE owner_id = v_owner_id;
  DELETE FROM public.payment_schedules WHERE owner_id = v_owner_id;
  DELETE FROM public.customer_ledger WHERE owner_id = v_owner_id;
  DELETE FROM public.supplier_ledger WHERE owner_id = v_owner_id;
  DELETE FROM public.stock_movements WHERE owner_id = v_owner_id;

  -- 3. Core Operational Transaction tables
  DELETE FROM public.payments WHERE owner_id = v_owner_id;
  DELETE FROM public.sales WHERE owner_id = v_owner_id;

  -- 4. Inventory & Entity Master tables
  DELETE FROM public.products WHERE owner_id = v_owner_id;
  DELETE FROM public.categories WHERE owner_id = v_owner_id;
  DELETE FROM public.customers WHERE owner_id = v_owner_id;
  DELETE FROM public.suppliers WHERE owner_id = v_owner_id;

  -- 5. Target & Log tables
  DELETE FROM public.profit_targets WHERE owner_id = v_owner_id;
  DELETE FROM public.audit_logs WHERE owner_id = v_owner_id;

  -- 6. Add single reset audit log
  INSERT INTO public.audit_logs (owner_id, action, entity_type, details)
  VALUES (v_owner_id, 'RESET_BUSINESS_DATA', 'SYSTEM', json_build_object('timestamp', NOW(), 'status', 'SUCCESS'));

  RETURN json_build_object(
    'success', true,
    'message', 'İşletme verileri başarıyla sıfırlandı. Kullanıcı hesabınız ve profil bilgileriniz korundu.'
  );
EXCEPTION WHEN OTHERS THEN
  RAISE EXCEPTION 'Veri sıfırlama hatası: %', SQLERRM;
END;
$$;

GRANT EXECUTE ON FUNCTION public.reset_business_data_transaction() TO authenticated;
