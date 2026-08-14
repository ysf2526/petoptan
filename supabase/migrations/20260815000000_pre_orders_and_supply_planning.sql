-- PETSHOP TOPTAN SATIŞ İŞLETME YÖNETİM SİSTEMİ
-- MIGRATION: 20260815000000_pre_orders_and_supply_planning.sql
-- ÖN SİPARİŞ / TALEP TOPLAMA + TEDARİK PLANLAMA MODÜLÜ TABLOLARI VE SAKLI YORDAMLARI (RPC)

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. PRE_ORDERS TABLE (Müşteri Ön Sipariş Ana Kayıtları)
CREATE TABLE IF NOT EXISTS public.pre_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  order_number TEXT NOT NULL,
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
  customer_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'demand_received', 
  -- Statuses: demand_received (TALEP ALINDI), supply_pending (TEDARİK BEKLİYOR), supplied (TEDARİK EDİLDİ), 
  --           preparing (HAZIRLANIYOR), prepared (HAZIRLANDI), delivered (TESLİM EDİLDİ), cancelled (İPTAL EDİLDİ)
  notes TEXT,
  estimated_total NUMERIC(12,2) DEFAULT 0.00 CHECK (estimated_total >= 0),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

-- 2. PRE_ORDER_ITEMS TABLE (Ön Sipariş Ürün Kalemleri)
CREATE TABLE IF NOT EXISTS public.pre_order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  pre_order_id UUID NOT NULL REFERENCES public.pre_orders(id) ON DELETE CASCADE,
  product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  product_name TEXT NOT NULL,
  brand TEXT,
  category TEXT,
  unit TEXT DEFAULT 'Adet',
  demanded_quantity NUMERIC(12,2) NOT NULL CHECK (demanded_quantity > 0),
  fulfilled_quantity NUMERIC(12,2) NOT NULL DEFAULT 0.00 CHECK (fulfilled_quantity >= 0),
  estimated_sale_price NUMERIC(12,2) DEFAULT 0.00 CHECK (estimated_sale_price >= 0),
  supplier_id UUID REFERENCES public.suppliers(id) ON DELETE SET NULL,
  supplier_name TEXT,
  estimated_purchase_price NUMERIC(12,2) DEFAULT 0.00 CHECK (estimated_purchase_price >= 0),
  status TEXT DEFAULT 'demand_received',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. PRE_ORDER_STATUS_HISTORY TABLE (Ön Sipariş Durum Tarihçesi)
CREATE TABLE IF NOT EXISTS public.pre_order_status_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  pre_order_id UUID NOT NULL REFERENCES public.pre_orders(id) ON DELETE CASCADE,
  old_status TEXT,
  new_status TEXT NOT NULL,
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. SUPPLY_ORDERS TABLE (Tedarikçiye Verilen Tedarik Siparişleri)
CREATE TABLE IF NOT EXISTS public.supply_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  supply_order_number TEXT NOT NULL,
  supplier_id UUID NOT NULL REFERENCES public.suppliers(id) ON DELETE RESTRICT,
  supplier_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ordered', -- ordered, partially_received, received, cancelled
  total_items INT NOT NULL DEFAULT 0,
  total_estimated_cost NUMERIC(12,2) DEFAULT 0.00 CHECK (total_estimated_cost >= 0),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

-- 5. SUPPLY_ORDER_ITEMS TABLE (Tedarik Sipariş Kalemleri)
CREATE TABLE IF NOT EXISTS public.supply_order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  supply_order_id UUID NOT NULL REFERENCES public.supply_orders(id) ON DELETE CASCADE,
  product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  product_name TEXT NOT NULL,
  quantity NUMERIC(12,2) NOT NULL CHECK (quantity > 0),
  unit_cost NUMERIC(12,2) DEFAULT 0.00 CHECK (unit_cost >= 0),
  pre_order_item_id UUID REFERENCES public.pre_order_items(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- İNDEKSLER (PERFORMANS İÇİN)
CREATE INDEX IF NOT EXISTS idx_pre_orders_owner ON public.pre_orders(owner_id);
CREATE INDEX IF NOT EXISTS idx_pre_orders_customer ON public.pre_orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_pre_orders_status ON public.pre_orders(status);
CREATE INDEX IF NOT EXISTS idx_pre_order_items_order ON public.pre_order_items(pre_order_id);
CREATE INDEX IF NOT EXISTS idx_pre_order_items_prod ON public.pre_order_items(product_id);
CREATE INDEX IF NOT EXISTS idx_pre_order_status_history_order ON public.pre_order_status_history(pre_order_id);
CREATE INDEX IF NOT EXISTS idx_supply_orders_owner ON public.supply_orders(owner_id);
CREATE INDEX IF NOT EXISTS idx_supply_orders_supplier ON public.supply_orders(supplier_id);
CREATE INDEX IF NOT EXISTS idx_supply_order_items_order ON public.supply_order_items(supply_order_id);

-- ROW LEVEL SECURITY (RLS) POLİTİKALARI
ALTER TABLE public.pre_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pre_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pre_order_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supply_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supply_order_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own pre_orders" ON public.pre_orders FOR ALL USING (owner_id = auth.uid());
CREATE POLICY "Users manage own pre_order_items" ON public.pre_order_items FOR ALL USING (owner_id = auth.uid());
CREATE POLICY "Users manage own pre_order_status_history" ON public.pre_order_status_history FOR ALL USING (owner_id = auth.uid());
CREATE POLICY "Users manage own supply_orders" ON public.supply_orders FOR ALL USING (owner_id = auth.uid());
CREATE POLICY "Users manage own supply_order_items" ON public.supply_order_items FOR ALL USING (owner_id = auth.uid());

-- ----------------------------------------------------------------------------
-- SAKLI YORDAMLAR (RPCs)
-- ----------------------------------------------------------------------------

-- 1. ATOMİK ÖN SİPARİŞ OLUŞTURMA PROCEDURE
CREATE OR REPLACE FUNCTION public.create_pre_order_transaction(
  p_customer_id UUID,
  p_notes TEXT,
  p_items JSONB -- [{ product_id, product_name, brand, category, unit, quantity, estimated_sale_price }]
) RETURNS JSONB AS $$
DECLARE
  v_owner_id UUID;
  v_customer_name TEXT;
  v_pre_order_id UUID;
  v_order_number TEXT;
  v_seq INT;
  v_year TEXT;
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
BEGIN
  v_owner_id := auth.uid();
  IF v_owner_id IS NULL THEN
    RAISE EXCEPTION 'Oturum bulunamadı veya yetkisiz erişim.';
  END IF;

  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Ön sipariş oluşturmak için en az 1 ürün kalemi eklenmelidir.';
  END IF;

  -- Müşteri kontrolü
  SELECT business_name INTO v_customer_name
  FROM public.customers
  WHERE id = p_customer_id AND owner_id = v_owner_id AND deleted_at IS NULL;

  IF v_customer_name IS NULL THEN
    RAISE EXCEPTION 'Seçilen müşteri bulunamadı.';
  END IF;

  -- Sipariş Numarası Üretme (OS-2026-0001)
  v_year := to_char(NOW(), 'YYYY');
  SELECT COUNT(*) + 1 INTO v_seq
  FROM public.pre_orders
  WHERE owner_id = v_owner_id AND order_number LIKE 'OS-' || v_year || '-%';

  v_order_number := 'OS-' || v_year || '-' || lpad(v_seq::text, 4, '0');

  -- Toplam tutar hesaplama ve kalem kontrolü
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_qty := (v_item->>'quantity')::NUMERIC;
    v_est_price := COALESCE((v_item->>'estimated_sale_price')::NUMERIC, 0.00);
    IF v_qty IS NULL OR v_qty <= 0 THEN
      RAISE EXCEPTION 'Geçersiz ürün miktarı.';
    END IF;
    v_total_est := v_total_est + (v_qty * v_est_price);
  END LOOP;

  -- Ön Sipariş Ana Kaydı
  INSERT INTO public.pre_orders (
    owner_id, order_number, customer_id, customer_name, status, notes, estimated_total
  ) VALUES (
    v_owner_id, v_order_number, p_customer_id, v_customer_name, 'demand_received', p_notes, v_total_est
  ) RETURNING id INTO v_pre_order_id;

  -- Kalemleri Ekleme
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

  -- Durum Geçmişi Kaydı
  INSERT INTO public.pre_order_status_history (
    owner_id, pre_order_id, old_status, new_status, note
  ) VALUES (
    v_owner_id, v_pre_order_id, NULL, 'demand_received', 'Ön sipariş / talep kaydı oluşturuldu.'
  );

  -- Audit log
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


-- 2. ÖN SİPARİŞ DURUM GÜNCELLEME PROCEDURE
CREATE OR REPLACE FUNCTION public.update_pre_order_status_transaction(
  p_pre_order_id UUID,
  p_new_status TEXT,
  p_note TEXT DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
  v_owner_id UUID;
  v_old_status TEXT;
  v_order_num TEXT;
BEGIN
  v_owner_id := auth.uid();
  IF v_owner_id IS NULL THEN
    RAISE EXCEPTION 'Oturum bulunamadı.';
  END IF;

  SELECT status, order_number INTO v_old_status, v_order_num
  FROM public.pre_orders
  WHERE id = p_pre_order_id AND owner_id = v_owner_id AND deleted_at IS NULL FOR UPDATE;

  IF v_old_status IS NULL THEN
    RAISE EXCEPTION 'Ön sipariş bulunamadı.';
  END IF;

  IF v_old_status = p_new_status THEN
    RETURN jsonb_build_object('success', true, 'message', 'Durum zaten aynı.');
  END IF;

  -- Update status
  UPDATE public.pre_orders
  SET status = p_new_status,
      updated_at = NOW()
  WHERE id = p_pre_order_id;

  -- Also update items status
  UPDATE public.pre_order_items
  SET status = p_new_status,
      updated_at = NOW()
  WHERE pre_order_id = p_pre_order_id;

  -- Record history
  INSERT INTO public.pre_order_status_history (
    owner_id, pre_order_id, old_status, new_status, note
  ) VALUES (
    v_owner_id, p_pre_order_id, v_old_status, p_new_status, p_note
  );

  RETURN jsonb_build_object(
    'success', true,
    'pre_order_id', p_pre_order_id,
    'order_number', v_order_num,
    'old_status', v_old_status,
    'new_status', p_new_status
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 3. ÖN SİPARİŞ KARŞILAMA (FULFILLMENT) PROCEDURE
CREATE OR REPLACE FUNCTION public.fulfill_pre_orders_transaction(
  p_fulfillments JSONB -- Array of [{ pre_order_item_id, fulfill_quantity }]
) RETURNS JSONB AS $$
DECLARE
  v_owner_id UUID;
  v_item JSONB;
  v_item_id UUID;
  v_qty NUMERIC(12,2);
  v_pre_order_item RECORD;
  v_pre_order RECORD;
  v_new_fulfilled NUMERIC(12,2);
  v_is_fully_fulfilled BOOLEAN;
  v_has_partial BOOLEAN;
  v_processed_count INT := 0;
BEGIN
  v_owner_id := auth.uid();
  IF v_owner_id IS NULL THEN
    RAISE EXCEPTION 'Oturum bulunamadı.';
  END IF;

  IF p_fulfillments IS NULL OR jsonb_array_length(p_fulfillments) = 0 THEN
    RAISE EXCEPTION 'Karşılanacak ön sipariş kalemi seçilmedi.';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_fulfillments)
  LOOP
    v_item_id := (v_item->>'pre_order_item_id')::UUID;
    v_qty := (v_item->>'fulfill_quantity')::NUMERIC;

    IF v_item_id IS NULL OR v_qty IS NULL OR v_qty <= 0 THEN
      CONTINUE;
    END IF;

    SELECT * INTO v_pre_order_item
    FROM public.pre_order_items
    WHERE id = v_item_id AND owner_id = v_owner_id FOR UPDATE;

    IF v_pre_order_item IS NULL THEN
      CONTINUE;
    END IF;

    v_new_fulfilled := LEAST(v_pre_order_item.demanded_quantity, v_pre_order_item.fulfilled_quantity + v_qty);

    UPDATE public.pre_order_items
    SET fulfilled_quantity = v_new_fulfilled,
        status = CASE 
          WHEN v_new_fulfilled >= v_pre_order_item.demanded_quantity THEN 'prepared'
          ELSE 'preparing'
        END,
        updated_at = NOW()
    WHERE id = v_item_id;

    v_processed_count := v_processed_count + 1;

    -- Update parent pre_order status if needed
    SELECT * INTO v_pre_order
    FROM public.pre_orders
    WHERE id = v_pre_order_item.pre_order_id AND owner_id = v_owner_id FOR UPDATE;

    -- Check all items for this order
    SELECT 
      BOOL_AND(fulfilled_quantity >= demanded_quantity) AS fully_done,
      BOOL_OR(fulfilled_quantity > 0) AS partial_done
    INTO v_is_fully_fulfilled, v_has_partial
    FROM public.pre_order_items
    WHERE pre_order_id = v_pre_order_item.pre_order_id;

    IF v_is_fully_fulfilled THEN
      IF v_pre_order.status != 'prepared' AND v_pre_order.status != 'delivered' THEN
        UPDATE public.pre_orders SET status = 'prepared', updated_at = NOW() WHERE id = v_pre_order.id;
        INSERT INTO public.pre_order_status_history (owner_id, pre_order_id, old_status, new_status, note)
        VALUES (v_owner_id, v_pre_order.id, v_pre_order.status, 'prepared', 'Tüm kalemler depodaki stokla karşılandı ve hazırlandı.');
      END IF;
    ELSIF v_has_partial THEN
      IF v_pre_order.status = 'demand_received' OR v_pre_order.status = 'supply_pending' OR v_pre_order.status = 'supplied' THEN
        UPDATE public.pre_orders SET status = 'preparing', updated_at = NOW() WHERE id = v_pre_order.id;
        INSERT INTO public.pre_order_status_history (owner_id, pre_order_id, old_status, new_status, note)
        VALUES (v_owner_id, v_pre_order.id, v_pre_order.status, 'preparing', 'Sipariş kısmen karşılandı ve hazırlanıyor.');
      END IF;
    END IF;

  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'items_fulfilled', v_processed_count
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 4. ÖN SİPARİŞİ GERÇEK SATIŞA DÖNÜŞTÜRME PROCEDURE
CREATE OR REPLACE FUNCTION public.convert_pre_order_to_sale_transaction(
  p_pre_order_id UUID,
  p_payment_type TEXT DEFAULT 'vadeli',
  p_term_days INT DEFAULT 30,
  p_due_date DATE DEFAULT NULL,
  p_notes TEXT DEFAULT NULL,
  p_items JSONB DEFAULT NULL, -- Optional array of [{ product_id, quantity, sale_price }] to override prices/quantities
  p_schedules JSONB DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
  v_owner_id UUID;
  v_pre_order RECORD;
  v_sale_items JSONB := '[]'::JSONB;
  v_item RECORD;
  v_product RECORD;
  v_sale_result JSONB;
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

  IF v_pre_order.status = 'delivered' THEN
    RAISE EXCEPTION 'Bu ön sipariş zaten daha önce satışa dönüştürülmüş ve teslim edilmiş.';
  END IF;

  IF v_pre_order.status = 'cancelled' THEN
    RAISE EXCEPTION 'İptal edilmiş ön sipariş satışa dönüştürülemez.';
  END IF;

  -- Due date hesaplama
  v_final_due_date := COALESCE(p_due_date, (CURRENT_DATE + (COALESCE(p_term_days, 30) || ' days')::INTERVAL)::DATE);

  -- Prepare items array for create_sale_transaction
  IF p_items IS NOT NULL AND jsonb_array_length(p_items) > 0 THEN
    v_sale_items := p_items;
  ELSE
    -- Build items array from pre_order_items
    FOR v_item IN 
      SELECT * FROM public.pre_order_items 
      WHERE pre_order_id = p_pre_order_id AND owner_id = v_owner_id
    LOOP
      IF v_item.product_id IS NULL THEN
        RAISE EXCEPTION 'Ürün "%" depoda kayıtlı değil. Lütfen önce ürünü stok sistemine kaydedin.', v_item.product_name;
      END IF;

      -- Check product sale price
      SELECT sale_price INTO v_product FROM public.products WHERE id = v_item.product_id;
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

  -- Mevcut create_sale_transaction fonksiyonunu çağır (stok düşer, satış ve cari borç oluşur)
  v_sale_result := public.create_sale_transaction(
    v_pre_order.customer_id,
    p_payment_type,
    p_term_days,
    v_final_due_date,
    COALESCE(p_notes, 'Ön Sipariş Dönüşümü (' || v_pre_order.order_number || ')'),
    v_sale_items,
    p_schedules
  );

  -- Update pre_order status to delivered
  UPDATE public.pre_orders
  SET status = 'delivered',
      updated_at = NOW()
  WHERE id = p_pre_order_id;

  UPDATE public.pre_order_items
  SET status = 'delivered',
      updated_at = NOW()
  WHERE pre_order_id = p_pre_order_id;

  INSERT INTO public.pre_order_status_history (
    owner_id, pre_order_id, old_status, new_status, note
  ) VALUES (
    v_owner_id, p_pre_order_id, v_pre_order.status, 'delivered',
    'Ön sipariş teslim edildi ve gerçek satışa dönüştürüldü (Satış No: ' || (v_sale_result->>'sale_number') || ').'
  );

  RETURN jsonb_build_object(
    'success', true,
    'pre_order_id', p_pre_order_id,
    'order_number', v_pre_order.order_number,
    'sale_result', v_sale_result
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 5. ÖN SİPARİŞ İPTAL PROCEDURE
CREATE OR REPLACE FUNCTION public.cancel_pre_order_transaction(
  p_pre_order_id UUID,
  p_reason TEXT DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
  v_owner_id UUID;
  v_old_status TEXT;
  v_order_num TEXT;
BEGIN
  v_owner_id := auth.uid();
  IF v_owner_id IS NULL THEN
    RAISE EXCEPTION 'Oturum bulunamadı.';
  END IF;

  SELECT status, order_number INTO v_old_status, v_order_num
  FROM public.pre_orders
  WHERE id = p_pre_order_id AND owner_id = v_owner_id AND deleted_at IS NULL FOR UPDATE;

  IF v_old_status IS NULL THEN
    RAISE EXCEPTION 'Ön sipariş bulunamadı.';
  END IF;

  IF v_old_status = 'delivered' THEN
    RAISE EXCEPTION 'Teslim edilmiş ön sipariş iptal edilemez.';
  END IF;

  UPDATE public.pre_orders
  SET status = 'cancelled',
      updated_at = NOW()
  WHERE id = p_pre_order_id;

  UPDATE public.pre_order_items
  SET status = 'cancelled',
      updated_at = NOW()
  WHERE pre_order_id = p_pre_order_id;

  INSERT INTO public.pre_order_status_history (
    owner_id, pre_order_id, old_status, new_status, note
  ) VALUES (
    v_owner_id, p_pre_order_id, v_old_status, 'cancelled', COALESCE(p_reason, 'İptal edildi.')
  );

  RETURN jsonb_build_object(
    'success', true,
    'pre_order_id', p_pre_order_id,
    'order_number', v_order_num,
    'status', 'cancelled'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 6. TEDARİK SİPARİŞİ OLUŞTURMA PROCEDURE
CREATE OR REPLACE FUNCTION public.create_supply_order_transaction(
  p_supplier_id UUID,
  p_notes TEXT,
  p_items JSONB -- [{ product_id, product_name, quantity, unit_cost, pre_order_item_id }]
) RETURNS JSONB AS $$
DECLARE
  v_owner_id UUID;
  v_supplier_name TEXT;
  v_supply_order_id UUID;
  v_supply_order_number TEXT;
  v_year TEXT;
  v_seq INT;
  v_item JSONB;
  v_qty NUMERIC(12,2);
  v_cost NUMERIC(12,2);
  v_total_cost NUMERIC(12,2) := 0.00;
  v_item_count INT := 0;
  v_pre_item_id UUID;
BEGIN
  v_owner_id := auth.uid();
  IF v_owner_id IS NULL THEN
    RAISE EXCEPTION 'Oturum bulunamadı.';
  END IF;

  SELECT company_name INTO v_supplier_name
  FROM public.suppliers
  WHERE id = p_supplier_id AND owner_id = v_owner_id AND deleted_at IS NULL;

  IF v_supplier_name IS NULL THEN
    RAISE EXCEPTION 'Tedarikçi bulunamadı.';
  END IF;

  v_year := to_char(NOW(), 'YYYY');
  SELECT COUNT(*) + 1 INTO v_seq
  FROM public.supply_orders
  WHERE owner_id = v_owner_id AND supply_order_number LIKE 'TS-' || v_year || '-%';

  v_supply_order_number := 'TS-' || v_year || '-' || lpad(v_seq::text, 4, '0');

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_qty := (v_item->>'quantity')::NUMERIC;
    v_cost := COALESCE((v_item->>'unit_cost')::NUMERIC, 0.00);
    v_total_cost := v_total_cost + (v_qty * v_cost);
    v_item_count := v_item_count + 1;
  END LOOP;

  INSERT INTO public.supply_orders (
    owner_id, supply_order_number, supplier_id, supplier_name, status, total_items, total_estimated_cost, notes
  ) VALUES (
    v_owner_id, v_supply_order_number, p_supplier_id, v_supplier_name, 'ordered', v_item_count, v_total_cost, p_notes
  ) RETURNING id INTO v_supply_order_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_qty := (v_item->>'quantity')::NUMERIC;
    v_cost := COALESCE((v_item->>'unit_cost')::NUMERIC, 0.00);
    v_pre_item_id := (v_item->>'pre_order_item_id')::UUID;

    INSERT INTO public.supply_order_items (
      owner_id, supply_order_id, product_id, product_name, quantity, unit_cost, pre_order_item_id
    ) VALUES (
      v_owner_id, v_supply_order_id, (v_item->>'product_id')::UUID, (v_item->>'product_name')::TEXT, v_qty, v_cost, v_pre_item_id
    );

    -- Link pre order item supplier info if provided
    IF v_pre_item_id IS NOT NULL THEN
      UPDATE public.pre_order_items
      SET supplier_id = p_supplier_id,
          supplier_name = v_supplier_name,
          estimated_purchase_price = v_cost,
          status = 'supply_pending',
          updated_at = NOW()
      WHERE id = v_pre_item_id;

      -- Check parent pre_order status
      UPDATE public.pre_orders
      SET status = 'supply_pending',
          updated_at = NOW()
      WHERE id = (SELECT pre_order_id FROM public.pre_order_items WHERE id = v_pre_item_id)
        AND status = 'demand_received';
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'supply_order_id', v_supply_order_id,
    'supply_order_number', v_supply_order_number,
    'supplier_name', v_supplier_name,
    'total_items', v_item_count,
    'total_estimated_cost', v_total_cost
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 7. GÜNCELLENMİŞ İŞLETME VERİLERİNİ SIFIRLAMA PROCEDURE (FK SAFE & PRE-ORDERS INCLUDED)
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

