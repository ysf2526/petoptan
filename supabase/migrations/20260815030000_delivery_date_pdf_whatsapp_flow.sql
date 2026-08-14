-- PETSHOP TOPTAN SATIŞ İŞLETME YÖNETİM SİSTEMİ
-- MIGRATION: 20260815030000_delivery_date_pdf_whatsapp_flow.sql
-- PDF VE WHATSAPP BİLGİLENDİRMESİNİ SADECE "TESLİM EDİLDİ" AŞAMASINA BAĞLAMA VE TESLİM TARİHLİ ÖDEME PLANI

-- 1. SALES TABLOSUNA DÜZENLENMİŞ TESLİMAT VE WHATSAPP KOLONLARININ EKLENMESİ
ALTER TABLE public.sales
ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS pdf_generated_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS whatsapp_sent_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS whatsapp_status TEXT NOT NULL DEFAULT 'not_sent' CHECK (whatsapp_status IN ('not_sent', 'sent'));

CREATE INDEX IF NOT EXISTS idx_sales_delivered_at ON public.sales(delivered_at);
CREATE INDEX IF NOT EXISTS idx_sales_whatsapp_status ON public.sales(whatsapp_status);

-- ----------------------------------------------------------------------------
-- 2. TESLİM EDİLDİ & SATIŞ KESİNLEŞTİRME ATOMİK RPC FUNCTION
-- ----------------------------------------------------------------------------
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
  v_total_cust_debt NUMERIC(12,2) := 0.00;
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

  -- DUPLICATE TESLİMAT KONTROLÜ (Madde 11)
  IF v_sale.order_status = 'delivered' AND v_sale.delivered_at IS NOT NULL THEN
    RETURN jsonb_build_object(
      'success', true,
      'already_delivered', true,
      'sale_id', p_sale_id,
      'sale_number', v_sale.sale_number,
      'delivered_at', v_sale.delivered_at,
      'message', 'Bu sipariş zaten ' || to_char(v_sale.delivered_at, 'DD.MM.YYYY HH24:MI') || ' tarihinde teslim edilmiş.'
    );
  END IF;

  -- Teslimat zamanını belirle (Varsayılan: Şu anki Zaman)
  v_delivery_time := COALESCE(p_delivered_at, NOW());
  v_delivery_date := (v_delivery_time AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Istanbul')::DATE;
  v_term_days := COALESCE(p_term_days, v_sale.term_days, 30);
  v_due_date := COALESCE(p_due_date, v_delivery_date + (v_term_days || ' days')::INTERVAL);

  -- 1. Sales tablosunu güncelle
  UPDATE public.sales
  SET order_status = 'delivered',
      delivered_at = v_delivery_time,
      pdf_generated_at = NOW(),
      due_date = v_due_date,
      term_days = v_term_days,
      updated_at = NOW()
  WHERE id = p_sale_id AND owner_id = v_owner_id;

  -- 2. Ödeme Planını TESLİM TARİHİNDEN BAŞLATARAK yeniden oluştur (Madde 3 & 5)
  IF v_sale.payment_type = 'vadeli' THEN
    -- Eski henüz ödenmemiş planı temizle ve teslim tarihli yeni plan yaz
    DELETE FROM public.payment_schedules 
    WHERE sale_id = p_sale_id AND owner_id = v_owner_id AND status = 'pending';

    INSERT INTO public.payment_schedules (
      owner_id, customer_id, sale_id, due_date, amount, paid_amount, remaining_amount, status
    ) VALUES (
      v_owner_id, v_sale.customer_id, p_sale_id, v_due_date,
      v_sale.remaining_debt, 0.00, v_sale.remaining_debt, 'pending'
    );
  END IF;

  -- 3. Müşterinin Güncel Cari Bakiyesini Hesapla
  SELECT balance INTO v_total_cust_debt FROM public.customer_ledger
  WHERE customer_id = v_sale.customer_id AND owner_id = v_owner_id AND deleted_at IS NULL
  ORDER BY created_at DESC, id DESC LIMIT 1;
  IF v_total_cust_debt IS NULL THEN v_total_cust_debt := 0.00; END IF;

  -- Audit Log
  INSERT INTO public.audit_logs (
    owner_id, action, entity_type, entity_id, details
  ) VALUES (
    v_owner_id, 'CONFIRM_DELIVERY_SALE', 'sales', p_sale_id,
    jsonb_build_object(
      'sale_number', v_sale.sale_number,
      'customer_name', v_sale.customer_name,
      'delivered_at', v_delivery_time,
      'total_amount', v_sale.total_amount,
      'net_customer_debt', v_total_cust_debt
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
    'net_customer_debt', v_total_cust_debt
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ----------------------------------------------------------------------------
-- 3. WHATSAPP GÖNDERİM DURUMU GÜNCELLEME RPC
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mark_sale_whatsapp_sent_transaction(
  p_sale_id UUID
) RETURNS JSONB AS $$
DECLARE
  v_owner_id UUID;
  v_sale RECORD;
BEGIN
  v_owner_id := auth.uid();
  IF v_owner_id IS NULL THEN
    RAISE EXCEPTION 'Oturum açmış kullanıcı bulunamadı.';
  END IF;

  SELECT * INTO v_sale FROM public.sales
  WHERE id = p_sale_id AND owner_id = v_owner_id AND deleted_at IS NULL FOR UPDATE;

  IF v_sale IS NULL THEN
    RAISE EXCEPTION 'Sipariş bulunamadı.';
  END IF;

  UPDATE public.sales
  SET whatsapp_status = 'sent',
      whatsapp_sent_at = NOW(),
      updated_at = NOW()
  WHERE id = p_sale_id AND owner_id = v_owner_id;

  INSERT INTO public.audit_logs (
    owner_id, action, entity_type, entity_id, details
  ) VALUES (
    v_owner_id, 'WHATSAPP_PDF_SENT', 'sales', p_sale_id,
    jsonb_build_object(
      'sale_number', v_sale.sale_number,
      'customer_name', v_sale.customer_name,
      'sent_at', NOW()
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'sale_id', p_sale_id,
    'whatsapp_status', 'sent',
    'whatsapp_sent_at', NOW()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
