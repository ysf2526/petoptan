-- PETSHOP TOPTAN SATIŞ İŞLETME YÖNETİM SİSTEMİ
-- MIGRATION: 20260815020000_fix_pre_order_conversion_flow.sql
-- ÖN SİPARİŞ -> STOK OLUŞTU -> GERÇEK SİPARİŞ (ALINDI) AKIŞI DÜZELTMESİ

-- 1. PRE_ORDERS TABLOSUNA DÖNÜŞTÜRÜLEN SATIŞ İLİŞKİ KOLONLARININ EKLENMESİ
ALTER TABLE public.pre_orders
ADD COLUMN IF NOT EXISTS converted_sale_id UUID REFERENCES public.sales(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS converted_sale_number TEXT;

CREATE INDEX IF NOT EXISTS idx_pre_orders_converted_sale ON public.pre_orders(converted_sale_id);

-- ----------------------------------------------------------------------------
-- 2. "ÜRÜNLERİN STOĞU OLUŞTU" (STOCK_READY) RPC FUNCTION
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mark_pre_order_stock_ready_transaction(
  p_pre_order_id UUID
) RETURNS JSONB AS $$
DECLARE
  v_owner_id UUID;
  v_pre_order RECORD;
  v_item RECORD;
  v_product RECORD;
  v_needed_qty NUMERIC(12,2);
  v_missing_qty NUMERIC(12,2);
BEGIN
  v_owner_id := auth.uid();
  IF v_owner_id IS NULL THEN
    RAISE EXCEPTION 'Oturum bulunamadı veya yetkisiz erişim.';
  END IF;

  SELECT * INTO v_pre_order
  FROM public.pre_orders
  WHERE id = p_pre_order_id AND owner_id = v_owner_id AND deleted_at IS NULL FOR UPDATE;

  IF v_pre_order IS NULL THEN
    RAISE EXCEPTION 'Ön sipariş bulunamadı.';
  END IF;

  IF v_pre_order.status = 'converted' OR v_pre_order.converted_sale_id IS NOT NULL THEN
    RAISE EXCEPTION 'Bu ön sipariş zaten gerçek siparişe dönüştürülmüştür.';
  END IF;

  IF v_pre_order.status = 'cancelled' THEN
    RAISE EXCEPTION 'İptal edilmiş ön sipariş stok durumu güncellenemez.';
  END IF;

  -- Her bir kalem için depodaki stok yeterliliğini kontrol et
  FOR v_item IN 
    SELECT * FROM public.pre_order_items 
    WHERE pre_order_id = p_pre_order_id AND owner_id = v_owner_id
  LOOP
    IF v_item.product_id IS NULL THEN
      RAISE EXCEPTION 'Ürün "%" depoda kayıtlı değil. Lütfen önce ürünü stok sistemine kaydedin.', v_item.product_name;
    END IF;

    v_needed_qty := GREATEST(0, v_item.demanded_quantity - v_item.fulfilled_quantity);

    IF v_needed_qty > 0 THEN
      SELECT current_stock, product_name INTO v_product 
      FROM public.products 
      WHERE id = v_item.product_id AND owner_id = v_owner_id AND deleted_at IS NULL;

      IF v_product IS NULL THEN
        RAISE EXCEPTION 'Ürün "%" stok sisteminde bulunamadı.', v_item.product_name;
      END IF;

      IF v_product.current_stock < v_needed_qty THEN
        v_missing_qty := v_needed_qty - v_product.current_stock;
        RAISE EXCEPTION 'Bu siparişi tamamen karşılamak için %s %s daha "%s" stoğu gerekiyor (Mevcut Stok: %s, İstenen: %s).',
          v_missing_qty, v_item.unit, v_product.product_name, v_product.current_stock, v_needed_qty;
      END IF;
    END IF;
  END LOOP;

  -- Stoklar yeterliyse ön sipariş durumunu 'stock_ready' yap
  UPDATE public.pre_orders
  SET status = 'stock_ready',
      updated_at = NOW()
  WHERE id = p_pre_order_id;

  UPDATE public.pre_order_items
  SET status = 'stock_ready',
      updated_at = NOW()
  WHERE pre_order_id = p_pre_order_id;

  INSERT INTO public.pre_order_status_history (
    owner_id, pre_order_id, old_status, new_status, note
  ) VALUES (
    v_owner_id, p_pre_order_id, v_pre_order.status, 'stock_ready',
    'Ürünlerin stoğu tamamlandı. Sipariş artık gerçek sipariş olarak hazırlanabilir.'
  );

  RETURN jsonb_build_object(
    'success', true,
    'pre_order_id', p_pre_order_id,
    'order_number', v_pre_order.order_number,
    'status', 'stock_ready',
    'message', 'Ürünlerin stoğu oluştu. Sipariş artık hazırlama aşamasına geçirilebilir.'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ----------------------------------------------------------------------------
-- 3. ÖN SİPARİŞİ GERÇEK SİPARİŞE DÖNÜŞTÜRME (SİPARİŞ ALINDI DİLİMİNDE) RPC
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

  -- 1. DUPLICATE SATIŞ KONTROLÜ (Madde 15)
  IF v_pre_order.status = 'converted' OR v_pre_order.converted_sale_id IS NOT NULL THEN
    RAISE EXCEPTION 'Bu ön sipariş zaten #%s numaralı gerçek siparişe dönüştürülmüştür.',
      COALESCE(v_pre_order.converted_sale_number, 'kayıtlı');
  END IF;

  IF v_pre_order.status = 'cancelled' THEN
    RAISE EXCEPTION 'İptal edilmiş ön sipariş gerçek siparişe dönüştürülemez.';
  END IF;

  v_final_due_date := COALESCE(p_due_date, (CURRENT_DATE + (COALESCE(p_term_days, 30) || ' days')::INTERVAL)::DATE);

  -- 2. ÜRÜN VE STOK KONTROLÜ
  IF p_items IS NOT NULL AND jsonb_array_length(p_items) > 0 THEN
    v_sale_items := p_items;
  ELSE
    FOR v_item IN 
      SELECT * FROM public.pre_order_items 
      WHERE pre_order_id = p_pre_order_id AND owner_id = v_owner_id
    LOOP
      IF v_item.product_id IS NULL THEN
        RAISE EXCEPTION 'Ürün "%" depoda kayıtlı değil. Lütfen önce ürünü stok sistemine kaydedin.', v_item.product_name;
      END IF;

      SELECT sale_price, current_stock INTO v_product 
      FROM public.products 
      WHERE id = v_item.product_id AND owner_id = v_owner_id AND deleted_at IS NULL;

      v_item_price := CASE 
        WHEN v_item.estimated_sale_price > 0 THEN v_item.estimated_sale_price
        WHEN v_product.sale_price > 0 THEN v_product.sale_price
        ELSE 0.00
      END;

      v_item_qty := CASE WHEN v_item.fulfilled_quantity > 0 THEN v_item.fulfilled_quantity ELSE v_item.demanded_quantity END;

      v_sale_items := v_sale_items || jsonb_build_object(
        'product_id', v_item.product_id,
        'quantity', v_item_qty,
        'sale_price', v_item_price
      );
    END LOOP;
  END IF;

  -- 3. MEVCUT create_sale_transaction FONKSİYONUNU ÇAĞIR (Sipariş Alındı durumunda başlar)
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

  -- 4. ÖN SİPARİŞİ 'converted' DURUMUNA GEÇİR VE SATIŞ KİMLİĞİNİ İLİŞKİLENDİR
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
