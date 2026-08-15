-- PETSHOP TOPTAN SATIŞ İŞLETME YÖNETİM SİSTEMİ
-- MIGRATION: 20260815060000_strict_pre_order_stock_check_and_unified_delivery.sql
-- STOKLU ÜRÜN İÇİN ÖN SİPARİŞ ENGELİ, ÖN SİPARİŞTE TEK BUTON DÖNÜŞÜMÜ VE TESLİMATA BAĞLI BÜTÜNLEŞİK FİNANSAL İZOLASYON

-- ----------------------------------------------------------------------------
-- 1. CREATE_PRE_ORDER_TRANSACTION RPC GÜNCELLEMESİ (STOKTA OLAN ÜRÜN İÇİN ÖN SİPARİŞ ENGELLENİR)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_pre_order_transaction(
  p_customer_id UUID,
  p_notes TEXT,
  p_items JSONB
) RETURNS JSONB AS $$
DECLARE
  v_owner_id UUID;
  v_customer_name TEXT;
  v_pre_order_id UUID;
  v_order_number TEXT;
  v_year TEXT;
  v_seq INT;
  v_item JSONB;
  v_product_id UUID;
  v_prod_name TEXT;
  v_brand TEXT;
  v_category TEXT;
  v_unit TEXT;
  v_qty NUMERIC(12,2);
  v_est_price NUMERIC(12,2);
  v_total_est NUMERIC(12,2) := 0.00;
  v_items_count INT := 0;
  v_product RECORD;
BEGIN
  v_owner_id := auth.uid();
  IF v_owner_id IS NULL THEN
    RAISE EXCEPTION 'Oturum bulunamadı veya yetkisiz erişim.';
  END IF;

  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Ön sipariş oluşturmak için en az 1 ürün kalemi eklenmelidir.';
  END IF;

  SELECT business_name INTO v_customer_name
  FROM public.customers
  WHERE id = p_customer_id AND owner_id = v_owner_id AND deleted_at IS NULL;

  IF v_customer_name IS NULL THEN
    RAISE EXCEPTION 'Seçilen müşteri bulunamadı.';
  END IF;

  v_year := to_char(NOW(), 'YYYY');
  SELECT COUNT(*) + 1 INTO v_seq
  FROM public.pre_orders
  WHERE owner_id = v_owner_id AND order_number LIKE 'OS-' || v_year || '-%';

  v_order_number := 'OS-' || v_year || '-' || lpad(v_seq::text, 4, '0');

  -- HER BİR KALEM İÇİN STOK KONTROLÜ VE TOPLAM HESAPLAMA
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_product_id := (v_item->>'product_id')::UUID;
    v_prod_name := (v_item->>'product_name')::TEXT;
    v_qty := (v_item->>'quantity')::NUMERIC;
    v_est_price := COALESCE((v_item->>'estimated_sale_price')::NUMERIC, 0.00);

    IF v_qty IS NULL OR v_qty <= 0 THEN
      RAISE EXCEPTION 'Geçersiz ürün miktarı.';
    END IF;

    -- STOKTA OLAN ÜRÜN İÇİN ÖN SİPARİŞ ENGELİ (Madde 1, 2, 22)
    IF v_product_id IS NOT NULL THEN
      SELECT current_stock, product_name, product_type, unit INTO v_product
      FROM public.products
      WHERE id = v_product_id AND owner_id = v_owner_id AND deleted_at IS NULL;

      IF v_product IS NOT NULL AND v_product.product_type != 'pre_order' AND v_product.current_stock >= v_qty THEN
        RAISE EXCEPTION 'Stokta yeterli miktarda (%s %s) bulunan "%s" ürünü için Ön Sipariş oluşturulamaz. Lütfen Normal Satış/Sipariş ekranını kullanınız.',
          v_product.current_stock, COALESCE(v_product.unit, 'Adet'), v_product.product_name;
      END IF;
    END IF;

    v_total_est := v_total_est + (v_qty * v_est_price);
  END LOOP;

  INSERT INTO public.pre_orders (
    owner_id, order_number, customer_id, customer_name, status, notes, estimated_total
  ) VALUES (
    v_owner_id, v_order_number, p_customer_id, v_customer_name, 'demand_received', p_notes, v_total_est
  ) RETURNING id INTO v_pre_order_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_product_id := (v_item->>'product_id')::UUID;
    v_prod_name := (v_item->>'product_name')::TEXT;
    v_brand := (v_item->>'brand')::TEXT;
    v_category := (v_item->>'category')::TEXT;
    v_unit := COALESCE((v_item->>'unit')::TEXT, 'Adet');
    v_qty := (v_item->>'quantity')::NUMERIC;
    v_est_price := COALESCE((v_item->>'estimated_sale_price')::NUMERIC, 0.00);

    INSERT INTO public.pre_order_items (
      owner_id, pre_order_id, product_id, product_name, brand, category, unit,
      demanded_quantity, fulfilled_quantity, estimated_sale_price, status
    ) VALUES (
      v_owner_id, v_pre_order_id, v_product_id, v_prod_name, v_brand, v_category, v_unit,
      v_qty, 0.00, v_est_price, 'demand_received'
    );
    v_items_count := v_items_count + 1;
  END LOOP;

  INSERT INTO public.pre_order_status_history (
    owner_id, pre_order_id, old_status, new_status, note
  ) VALUES (
    v_owner_id, v_pre_order_id, NULL, 'demand_received', 'Ön sipariş / talep kaydı oluşturuldu.'
  );

  INSERT INTO public.audit_logs (
    owner_id, action, entity_type, entity_id, details
  ) VALUES (
    v_owner_id, 'CREATE_PRE_ORDER', 'pre_orders', v_pre_order_id,
    jsonb_build_object(
      'order_number', v_order_number,
      'customer_id', p_customer_id,
      'customer_name', v_customer_name,
      'items_count', v_items_count,
      'estimated_total', v_total_est
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'pre_order_id', v_pre_order_id,
    'order_number', v_order_number,
    'customer_name', v_customer_name,
    'total_items', v_items_count,
    'estimated_total', v_total_est
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ----------------------------------------------------------------------------
-- 2. CONVERT_PRE_ORDER_TO_SALE_TRANSACTION RPC GÜNCELLEMESİ (TEK BUTON DÖNÜŞÜMÜ & ANLIK VERİTABANI STOK KONTROLÜ)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.convert_pre_order_to_sale_transaction(
  p_pre_order_id UUID,
  p_payment_type TEXT DEFAULT 'vadeli',
  p_term_days INT DEFAULT 30,
  p_due_date DATE DEFAULT NULL,
  p_notes TEXT DEFAULT NULL,
  p_items JSONB DEFAULT NULL,
  p_schedules JSONB DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
  v_owner_id UUID;
  v_pre_order RECORD;
  v_sale_items JSONB := '[]'::JSONB;
  v_item RECORD;
  v_product RECORD;
  v_sale_result JSONB;
  v_sale_id UUID;
  v_sale_number TEXT;
  v_final_due_date DATE;
  v_item_qty NUMERIC(12,2);
  v_item_price NUMERIC(12,2);
BEGIN
  v_owner_id := auth.uid();
  IF v_owner_id IS NULL THEN
    RAISE EXCEPTION 'Oturum bulunamadı.';
  END IF;

  SELECT * INTO v_pre_order
  FROM public.pre_orders
  WHERE id = p_pre_order_id AND owner_id = v_owner_id AND deleted_at IS NULL FOR UPDATE;

  IF v_pre_order IS NULL THEN
    RAISE EXCEPTION 'Ön sipariş bulunamadı.';
  END IF;

  -- 1. DUPLICATE DÖNÜŞÜM KONTROLÜ (Madde 9 & 28)
  IF v_pre_order.status = 'converted' OR v_pre_order.converted_sale_id IS NOT NULL THEN
    RAISE EXCEPTION 'Bu ön sipariş zaten #%s numaralı gerçek siparişe dönüştürülmüştür.',
      COALESCE(v_pre_order.converted_sale_number, 'kayıtlı');
  END IF;

  IF v_pre_order.status = 'cancelled' THEN
    RAISE EXCEPTION 'İptal edilmiş ön sipariş gerçek siparişe dönüştürülemez.';
  END IF;

  v_final_due_date := COALESCE(p_due_date, (CURRENT_DATE + (COALESCE(p_term_days, 30) || ' days')::INTERVAL)::DATE);

  -- 2. VERİTABANI BAZLI GERÇEK STOK DOĞRULAMASI (Madde 6 & 8)
  FOR v_item IN 
    SELECT * FROM public.pre_order_items 
    WHERE pre_order_id = p_pre_order_id AND owner_id = v_owner_id
  LOOP
    IF v_item.product_id IS NULL THEN
      RAISE EXCEPTION 'Ürün "%s" depoda kayıtlı değil. Lütfen önce ürünü stok sistemine kaydedin.', v_item.product_name;
    END IF;

    v_item_qty := CASE WHEN v_item.fulfilled_quantity > 0 THEN v_item.fulfilled_quantity ELSE v_item.demanded_quantity END;

    SELECT sale_price, current_stock, product_name INTO v_product 
    FROM public.products 
    WHERE id = v_item.product_id AND owner_id = v_owner_id AND deleted_at IS NULL;

    IF v_product IS NULL THEN
      RAISE EXCEPTION 'Ürün "%s" stok sisteminde bulunamadı.', v_item.product_name;
    END IF;

    IF v_product.current_stock < v_item_qty THEN
      RAISE EXCEPTION 'Bu siparişi karşılamak için yeterli stok bulunmuyor. "%s" için depoda %s %s var, gereken %s %s.',
        v_product.product_name, v_product.current_stock, COALESCE(v_item.unit, 'Adet'), v_item_qty, COALESCE(v_item.unit, 'Adet');
    END IF;

    v_item_price := CASE 
      WHEN v_item.estimated_sale_price > 0 THEN v_item.estimated_sale_price
      WHEN v_product.sale_price > 0 THEN v_product.sale_price
      ELSE 0.00
    END;

    v_sale_items := v_sale_items || jsonb_build_object(
      'product_id', v_item.product_id,
      'quantity', v_item_qty,
      'sale_price', v_item_price
    );
  END LOOP;

  -- 3. MEVCUT create_sale_transaction FONKSİYONUNU ÇAĞIR (Sipariş Alındı durumunda başlar, teslim edilene kadar cari borç yazmaz)
  v_sale_result := public.create_sale_transaction(
    v_pre_order.customer_id,
    v_sale_items,
    p_payment_type,
    p_term_days,
    v_final_due_date,
    COALESCE(p_notes, 'Ön Sipariş Dönüşümü (' || v_pre_order.order_number || ')')
  );

  v_sale_id := (v_sale_result->>'sale_id')::UUID;
  v_sale_number := (v_sale_result->>'sale_number')::TEXT;

  -- 4. ÖN SİPARİŞİ 'converted' DURUMUNA GEÇİR
  UPDATE public.pre_orders
  SET status = 'converted',
      converted_sale_id = v_sale_id,
      converted_sale_number = v_sale_number,
      updated_at = NOW()
  WHERE id = p_pre_order_id;

  UPDATE public.pre_order_items
  SET status = 'converted',
      updated_at = NOW()
  WHERE pre_order_id = p_pre_order_id;

  INSERT INTO public.pre_order_status_history (
    owner_id, pre_order_id, old_status, new_status, note
  ) VALUES (
    v_owner_id, p_pre_order_id, v_pre_order.status, 'converted',
    'Ön sipariş gerçek siparişe dönüştürüldü (Gerçek Sipariş No: #' || v_sale_number || '). Sipariş Durumu: Sipariş Alındı.'
  );

  RETURN jsonb_build_object(
    'success', true,
    'pre_order_id', p_pre_order_id,
    'order_number', v_pre_order.order_number,
    'sale_id', v_sale_id,
    'sale_number', v_sale_number,
    'order_status', 'received',
    'sale_result', v_sale_result
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
