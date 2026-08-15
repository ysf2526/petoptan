-- PETSHOP TOPTAN SATIŞ İŞLETME YÖNETİM SİSTEMİ
-- MIGRATION: 20260815080000_consolidated_payment_schedule_flow.sql
-- TESLİM EDİLEN VADELİ SATIŞLAR İÇİN 4 HAFTALIK TAKSİT KAYITLARININ OLUŞTURULMASI VE TARİH BAZLI KONSOLİDASYON

CREATE OR REPLACE FUNCTION public.confirm_delivery_and_finalize_sale_transaction(
  p_sale_id UUID,
  p_delivered_at TIMESTAMPTZ DEFAULT NULL,
  p_payment_type TEXT DEFAULT NULL,
  p_term_days INT DEFAULT NULL,
  p_due_date DATE DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
  v_owner_id UUID;
  v_sale RECORD;
  v_delivery_time TIMESTAMPTZ;
  v_delivery_date DATE;
  v_term_days INT;
  v_due_date DATE;
  v_prev_balance NUMERIC(12,2) := 0.00;
  v_new_balance NUMERIC(12,2) := 0.00;
  v_ledger_exists INT;

  v_weekly_amt NUMERIC(12,2);
  v_rem_amt NUMERIC(12,2);
  v_i INT;
  v_sched_due DATE;
  v_sched_amt NUMERIC(12,2);
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
    RAISE EXCEPTION 'İptal edilmiş sipariş teslim edilemez.';
  END IF;

  -- IDEMPOTENCY / ÇİFTE İŞLEM KORUMASI
  IF v_sale.order_status = 'delivered' AND v_sale.delivered_at IS NOT NULL THEN
    SELECT balance INTO v_new_balance FROM public.customer_ledger
    WHERE customer_id = v_sale.customer_id AND owner_id = v_owner_id AND deleted_at IS NULL
    ORDER BY created_at DESC, id DESC LIMIT 1;

    RETURN jsonb_build_object(
      'success', true,
      'already_delivered', true,
      'sale_id', p_sale_id,
      'sale_number', v_sale.sale_number,
      'delivered_at', v_sale.delivered_at,
      'net_customer_debt', COALESCE(v_new_balance, 0.00),
      'message', 'Bu sipariş zaten teslim edilmiş.'
    );
  END IF;

  v_delivery_time := COALESCE(p_delivered_at, NOW());
  v_delivery_date := (v_delivery_time AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Istanbul')::DATE;
  v_term_days := COALESCE(p_term_days, v_sale.term_days, 30);
  v_due_date := COALESCE(p_due_date, v_delivery_date + (v_term_days || ' days')::INTERVAL);

  UPDATE public.sales
  SET order_status = 'delivered',
      delivered_at = v_delivery_time,
      pdf_generated_at = NOW(),
      due_date = v_due_date,
      term_days = v_term_days,
      updated_at = NOW()
  WHERE id = p_sale_id AND owner_id = v_owner_id;

  -- 1. MÜŞTERİ CARİSİNE KESİN FİNANSAL BORÇ YAZILMASI
  SELECT COUNT(*) INTO v_ledger_exists FROM public.customer_ledger
  WHERE sale_id = p_sale_id AND owner_id = v_owner_id AND movement_type = 'BORÇ' AND deleted_at IS NULL;

  IF v_ledger_exists = 0 THEN
    SELECT balance INTO v_prev_balance FROM public.customer_ledger
    WHERE customer_id = v_sale.customer_id AND owner_id = v_owner_id AND deleted_at IS NULL
    ORDER BY created_at DESC, id DESC LIMIT 1;
    IF v_prev_balance IS NULL THEN v_prev_balance := 0.00; END IF;

    v_new_balance := v_prev_balance + v_sale.total_amount;

    INSERT INTO public.customer_ledger (
      owner_id, customer_id, sale_id, movement_type, description, debit, credit, balance
    ) VALUES (
      v_owner_id, v_sale.customer_id, p_sale_id, 'BORÇ',
      'Toptan Satış #' || v_sale.sale_number || ' (Teslim Edildi)',
      v_sale.total_amount, 0.00, v_new_balance
    );

    IF v_sale.payment_type = 'pesin' THEN
      v_prev_balance := v_new_balance;
      v_new_balance := v_prev_balance - v_sale.total_amount;

      INSERT INTO public.payments (
        owner_id, customer_id, amount, payment_method, payment_type, payment_date, notes
      ) VALUES (
        v_owner_id, v_sale.customer_id, v_sale.total_amount, 'Nakit', 'pesin_satis', v_delivery_date::TEXT, 'Peşin Satış Tahsilatı #' || v_sale.sale_number
      );

      INSERT INTO public.customer_ledger (
        owner_id, customer_id, sale_id, movement_type, description, debit, credit, balance
      ) VALUES (
        v_owner_id, v_sale.customer_id, p_sale_id, 'ÖDEME', 'Peşin Tahsilat #' || v_sale.sale_number, 0.00, v_sale.total_amount, v_new_balance
      );
    END IF;
  ELSE
    SELECT balance INTO v_new_balance FROM public.customer_ledger
    WHERE customer_id = v_sale.customer_id AND owner_id = v_owner_id AND deleted_at IS NULL
    ORDER BY created_at DESC, id DESC LIMIT 1;
  END IF;

  -- 2. FİİLİ TESLİM TARİHİNDEN İTİBAREN 4 HAFTALIK TAKSİT PLANININ YAZILMASI
  IF v_sale.payment_type = 'vadeli' AND v_sale.remaining_debt > 0 THEN
    DELETE FROM public.payment_schedules 
    WHERE sale_id = p_sale_id AND owner_id = v_owner_id AND status = 'pending';

    v_rem_amt := v_sale.remaining_debt;
    v_weekly_amt := ROUND(v_rem_amt / 4.0, 2);

    FOR v_i IN 1..4 LOOP
      v_sched_due := v_delivery_date + (v_i * 7 || ' days')::INTERVAL;
      IF v_i = 4 THEN
        v_sched_amt := v_rem_amt; -- Son taksit yuvarlama farkını kapatır
      ELSE
        v_sched_amt := v_weekly_amt;
        v_rem_amt := v_rem_amt - v_weekly_amt;
      END IF;

      INSERT INTO public.payment_schedules (
        owner_id, customer_id, sale_id, due_date, amount, paid_amount, remaining_amount, status
      ) VALUES (
        v_owner_id, v_sale.customer_id, p_sale_id, v_sched_due,
        v_sched_amt, 0.00, v_sched_amt, 'pending'
      );
    END LOOP;
  END IF;

  INSERT INTO public.audit_logs (
    owner_id, action, entity_type, entity_id, details
  ) VALUES (
    v_owner_id, 'CONFIRM_DELIVERY_FINALIZE_FINANCIALS', 'sales', p_sale_id,
    jsonb_build_object(
      'sale_number', v_sale.sale_number,
      'customer_name', v_sale.customer_name,
      'delivered_at', v_delivery_time,
      'total_amount', v_sale.total_amount,
      'net_customer_debt', v_new_balance
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'already_delivered', false,
    'sale_id', p_sale_id,
    'sale_number', v_sale.sale_number,
    'delivered_at', v_delivery_time,
    'delivery_date_str', to_char(v_delivery_time, 'DD.MM.YYYY HH24:MI'),
    'order_status', 'delivered',
    'net_customer_debt', COALESCE(v_new_balance, 0.00)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
