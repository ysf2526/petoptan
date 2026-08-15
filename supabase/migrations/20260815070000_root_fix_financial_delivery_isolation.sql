-- PETSHOP TOPTAN SATIŞ İŞLETME YÖNETİM SİSTEMİ
-- MIGRATION: 20260815070000_root_fix_financial_delivery_isolation.sql
-- SATIŞ / CARİ / ÖDEME PLANI / PDF / WHATSAPP KÖKTEN DÜZELTME VE TESLİMATA BAĞLI KESİN FİNANSAL İZOLASYON

-- 1. SALES TABLOSUNDA GEREKLİ KOLONLARIN VARLIĞINI GARANTİ ETME
ALTER TABLE public.sales
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW(),
ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS pdf_generated_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS whatsapp_sent_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS whatsapp_status TEXT NOT NULL DEFAULT 'not_sent' CHECK (whatsapp_status IN ('not_sent', 'sent'));

CREATE INDEX IF NOT EXISTS idx_sales_delivered_at ON public.sales(delivered_at);

-- ----------------------------------------------------------------------------
-- 2. CREATE_SALE_TRANSACTION RPC PROSEDÜRÜ (CARİ BORÇ VE ÖDEME PLANI YAZIMI KÖKTEN KALDIRILDI)
--    Satış oluşturulur, stok düşer, ancak delivered_at IS NULL olduğu sürece cariye 1 TL borç yazmaz!
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_sale_transaction(
  p_customer_id UUID,
  p_items JSONB,
  p_payment_type TEXT DEFAULT 'vadeli',
  p_term_days INT DEFAULT 30,
  p_due_date DATE DEFAULT NULL,
  p_notes TEXT DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
  v_owner_id UUID;
  v_customer_name TEXT;
  v_sale_id UUID;
  v_sale_number TEXT;
  v_total_amount NUMERIC(12,2) := 0.00;
  v_total_cost NUMERIC(12,2) := 0.00;
  v_total_profit NUMERIC(12,2) := 0.00;
  v_status TEXT;

  v_item JSONB;
  v_prod_id UUID;
  v_qty NUMERIC(12,2);
  v_unit_sale_price NUMERIC(12,2);
  v_product RECORD;
  v_item_cost NUMERIC(12,2);
  v_item_total NUMERIC(12,2);
  v_item_profit NUMERIC(12,2);
BEGIN
  v_owner_id := auth.uid();
  IF v_owner_id IS NULL THEN
    RAISE EXCEPTION 'Oturum açmış kullanıcı bulunamadı.';
  END IF;

  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Satış kaydı için en az 1 ürün eklenmelidir.';
  END IF;

  SELECT business_name INTO v_customer_name FROM public.customers
  WHERE id = p_customer_id AND owner_id = v_owner_id AND deleted_at IS NULL;

  IF v_customer_name IS NULL THEN
    RAISE EXCEPTION 'Müşteri bulunamadı veya silinmiş.';
  END IF;

  v_sale_number := 'SAT-' || to_char(NOW(), 'YYYYMMDD') || '-' || lpad(floor(random() * 10000)::text, 4, '0');
  v_status := CASE WHEN p_payment_type = 'pesin' THEN 'paid' ELSE 'pending' END;

  -- Sales tablosuna sipariş kaydı ekle (order_status = 'received', delivered_at = NULL)
  INSERT INTO public.sales (
    owner_id, sale_number, customer_id, customer_name, total_amount, total_cost, total_profit,
    payment_type, term_days, due_date, status, order_status, delivered_at, paid_amount, remaining_debt, notes
  ) VALUES (
    v_owner_id, v_sale_number, p_customer_id, v_customer_name, 0, 0, 0,
    p_payment_type, p_term_days, p_due_date, v_status, 'received', NULL, 0.00, 0.00, p_notes
  ) RETURNING id INTO v_sale_id;

  -- Ürün kalemlerini işleme ve depodan stok düşümü
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_prod_id := (v_item->>'product_id')::UUID;
    v_qty := (v_item->>'quantity')::NUMERIC;
    v_unit_sale_price := (v_item->>'sale_price')::NUMERIC;

    IF v_qty <= 0 THEN
      RAISE EXCEPTION 'Satış miktarı 0 veya negatif olamaz.';
    END IF;

    IF v_unit_sale_price < 0 THEN
      RAISE EXCEPTION 'Satış fiyatı negatif olamaz.';
    END IF;

    SELECT * INTO v_product FROM public.products
    WHERE id = v_prod_id AND owner_id = v_owner_id AND deleted_at IS NULL FOR UPDATE;

    IF v_product IS NULL THEN
      RAISE EXCEPTION 'Ürün bulunamadı (ID: %).', v_prod_id;
    END IF;

    IF v_product.current_stock < v_qty THEN
      RAISE EXCEPTION '% ürününün stok miktarı yetersiz! Depoda % adet var, satılmak istenen: %',
        v_product.product_name, v_product.current_stock, v_qty;
    END IF;

    v_item_cost := v_qty * v_product.purchase_price;
    v_item_total := v_qty * v_unit_sale_price;
    v_item_profit := v_item_total - v_item_cost;

    v_total_amount := v_total_amount + v_item_total;
    v_total_cost := v_total_cost + v_item_cost;
    v_total_profit := v_total_profit + v_item_profit;

    INSERT INTO public.sale_items (
      owner_id, sale_id, product_id, product_name, unit, quantity,
      purchase_price_snapshot, sale_price_snapshot, total_amount, total_cost, total_profit
    ) VALUES (
      v_owner_id, v_sale_id, v_prod_id, v_product.product_name, v_product.unit, v_qty,
      v_product.purchase_price, v_unit_sale_price, v_item_total, v_item_cost, v_item_profit
    );

    UPDATE public.products
    SET current_stock = current_stock - v_qty, updated_at = NOW()
    WHERE id = v_prod_id AND owner_id = v_owner_id;

    INSERT INTO public.stock_movements (
      owner_id, product_id, movement_type, quantity, unit_cost, reference_id, note
    ) VALUES (
      v_owner_id, v_prod_id, 'SALE', v_qty, v_product.purchase_price, v_sale_id,
      'Toptan Satış Siparişi #' || v_sale_number || ' - Müşteri: ' || v_customer_name
    );
  END LOOP;

  UPDATE public.sales
  SET total_amount = v_total_amount,
      total_cost = v_total_cost,
      total_profit = v_total_profit,
      paid_amount = CASE WHEN p_payment_type = 'pesin' THEN v_total_amount ELSE 0.00 END,
      remaining_debt = CASE WHEN p_payment_type = 'pesin' THEN 0.00 ELSE v_total_amount END
  WHERE id = v_sale_id AND owner_id = v_owner_id;

  -- KESİN KURAL: delivered_at IS NULL olduğu sürece customer_ledger VE payment_schedules KAYDI YAZILMAZ!

  INSERT INTO public.audit_logs (
    owner_id, action, entity_type, entity_id, details
  ) VALUES (
    v_owner_id, 'CREATE_SALE_ORDER_PENDING_DELIVERY', 'sales', v_sale_id,
    jsonb_build_object(
      'sale_number', v_sale_number,
      'total_amount', v_total_amount,
      'customer_name', v_customer_name,
      'payment_type', p_payment_type,
      'order_status', 'received',
      'delivered', false
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'sale_id', v_sale_id,
    'sale_number', v_sale_number,
    'total_amount', v_total_amount,
    'total_profit', v_total_profit,
    'order_status', 'received',
    'delivered', false
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ----------------------------------------------------------------------------
-- 3. CONFIRM_DELIVERY_AND_FINALIZE_SALE_TRANSACTION RPC PROSEDÜRÜ
--    SADECE TESLİM EDİLDİĞİ ANDA CARİ BORÇ YAZILIR VE VADE TESLİMAT TARİHİNDEN BAŞLAR!
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
  v_new_balance NUMERIC(12,2) := 0.00;
  v_ledger_exists INT;
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

  -- Teslimat zamanı ve vadesinin fiili teslim anından başlatılması (Europe/Istanbul)
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

  -- MÜŞTERİ CARİSİNE KESİN FİNANSAL BORÇ YAZILMASI
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

  -- FİİLİ TESLİM TARİHİNDEN İTİBAREN ÖDEME PLANININ OLUŞTURULMASI
  IF v_sale.payment_type = 'vadeli' AND v_sale.remaining_debt > 0 THEN
    DELETE FROM public.payment_schedules 
    WHERE sale_id = p_sale_id AND owner_id = v_owner_id AND status = 'pending';

    INSERT INTO public.payment_schedules (
      owner_id, customer_id, sale_id, due_date, amount, paid_amount, remaining_amount, status
    ) VALUES (
      v_owner_id, v_sale.customer_id, p_sale_id, v_due_date,
      v_sale.remaining_debt, 0.00, v_sale.remaining_debt, 'pending'
    );
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
