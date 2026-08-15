-- ====================================================================
-- MOBİL ÜRÜN KATALOĞU VE ÖN SİPARİŞ SİSTEMİ MİGRATION
-- ====================================================================

-- 1. PROFILES TABLOSUNA PUBLIC KATALOG SLUG KOLONU
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS public_catalog_slug TEXT UNIQUE;

-- Var olan profillere varsayılan slug atama
UPDATE public.profiles
SET public_catalog_slug = 'petoptan-' || substring(id::text from 1 for 8)
WHERE public_catalog_slug IS NULL;

-- 2. PRODUCTS TABLOSUNA KATALOG KOLONLARI
ALTER TABLE public.products
ADD COLUMN IF NOT EXISTS product_type TEXT DEFAULT 'stock' CHECK (product_type IN ('stock', 'pre_order')),
ADD COLUMN IF NOT EXISTS show_in_catalog BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS show_price_in_catalog BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS image_url TEXT,
ADD COLUMN IF NOT EXISTS description TEXT;

-- 3. PUBLIC GÜVENLİ KATALOG GÖRÜNÜMÜ (VIEW)
-- DİKKAT: Gerçek stok miktarı (current_stock) ve alış fiyatı (purchase_price), tedarikçi (supplier_id) ASLA gösterilmez!
-- Müşteriye sadece boolean 'in_stock' ve kamuya açık bilgiler sunulur.
CREATE OR REPLACE VIEW public.public_catalog_products AS
SELECT
  p.id,
  p.owner_id,
  p.product_name,
  p.brand,
  p.category,
  p.unit,
  p.sale_price,
  p.show_price_in_catalog,
  p.image_url,
  p.description,
  (p.current_stock > 0) AS in_stock,
  p.product_type,
  prof.public_catalog_slug,
  prof.business_name AS business_name,
  prof.phone AS business_phone,
  prof.address AS business_address
FROM public.products p
JOIN public.profiles prof ON prof.id = p.owner_id
WHERE p.active = true
  AND p.show_in_catalog = true
  AND p.deleted_at IS NULL;

-- 4. PUBLIC ÖN SİPARİŞ OLUŞTURMA SUNUCU TARAFIDIR RPC (SECURITY DEFINER)
-- SIKI GÜVENLİK KONTROLLERİ:
-- - Müşteri eşleştirme/oluşturma server-side Pl/pgSQL içinde yapılır, customers tablosu public'e açılmaz.
-- - Gönderilen her product_id için: active=true, show_in_catalog=true, owner_id=v_owner_id, deleted_at IS NULL kontrolleri yapılır.
-- - Eğer ürün stokta varsa (current_stock > 0), ön sipariş verilmesi engellenir.
-- - purchase_price işletme veritabanından okunarak estimated_purchase_price doldurulur (public'e sızmaz).
CREATE OR REPLACE FUNCTION public.submit_public_pre_order(
  p_slug TEXT,
  p_customer_name TEXT,
  p_customer_phone TEXT,
  p_items JSONB,
  p_notes TEXT DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
  v_owner_id UUID;
  v_customer_id UUID;
  v_pre_order_id UUID;
  v_order_number TEXT;
  v_est_total NUMERIC(12,2) := 0.00;
  v_item JSONB;
  v_prod_id UUID;
  v_qty NUMERIC(12,2);
  v_product RECORD;
BEGIN
  IF p_slug IS NULL OR length(trim(p_slug)) = 0 THEN
    RAISE EXCEPTION 'Katalog adresi (slug) geçersiz.';
  END IF;

  -- 1. Slug üzerinden işletme sahibini bul
  SELECT id INTO v_owner_id FROM public.profiles WHERE public_catalog_slug = p_slug;
  IF v_owner_id IS NULL THEN
    BEGIN
      v_owner_id := p_slug::UUID;
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'İşletme kataloğu bulunamadı.';
    END;
  END IF;

  IF v_owner_id IS NULL THEN
    RAISE EXCEPTION 'Geçersiz katalog işletmesi.';
  END IF;

  IF p_customer_name IS NULL OR length(trim(p_customer_name)) = 0 THEN
    RAISE EXCEPTION 'Lütfen adınızı / işletme adınızı giriniz.';
  END IF;

  IF p_customer_phone IS NULL OR length(trim(p_customer_phone)) = 0 THEN
    RAISE EXCEPTION 'Lütfen telefon numaranızı giriniz.';
  END IF;

  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Ön siparişe en az 1 ürün eklenmelidir.';
  END IF;

  -- 2. Müşteriyi telefon numarasına göre güvenli sorgula (Server-Side)
  SELECT id INTO v_customer_id FROM public.customers
  WHERE owner_id = v_owner_id AND phone = p_customer_phone AND deleted_at IS NULL
  LIMIT 1;

  IF v_customer_id IS NULL THEN
    -- Aday müşteri kaydı oluştur (Server-Side)
    INSERT INTO public.customers (owner_id, business_name, contact_name, phone, notes)
    VALUES (v_owner_id, p_customer_name, p_customer_name, p_customer_phone, 'Public Katalog Ön Siparişi İle Otomatik Oluşturuldu')
    RETURNING id INTO v_customer_id;
  END IF;

  v_order_number := 'ON-SIP-' || to_char(NOW(), 'YYYYMMDD') || '-' || lpad(floor(random() * 10000)::text, 4, '0');

  INSERT INTO public.pre_orders (
    owner_id, order_number, customer_id, customer_name, status, notes, estimated_total
  ) VALUES (
    v_owner_id, v_order_number, v_customer_id, p_customer_name, 'demand_received', p_notes, 0.00
  ) RETURNING id INTO v_pre_order_id;

  -- 3. Ürünleri Doğrula ve Ekle
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_prod_id := (v_item->>'product_id')::UUID;
    v_qty := (v_item->>'quantity')::NUMERIC;

    IF v_qty IS NULL OR v_qty <= 0 THEN
      RAISE EXCEPTION 'Sipariş miktarı 0 veya negatif olamaz.';
    END IF;

    -- SIKI GÜVENLİK KONTROLÜ (TEST A, B, C, D)
    SELECT * INTO v_product FROM public.products
    WHERE id = v_prod_id
      AND owner_id = v_owner_id
      AND active = true
      AND show_in_catalog = true
      AND deleted_at IS NULL;

    IF v_product IS NULL THEN
      RAISE EXCEPTION 'Siparişteki bazı ürünler kataloğa ait değil veya satışa kapatılmış!';
    END IF;

    IF v_product.current_stock > 0 THEN
      RAISE EXCEPTION '% ürünü depoda stokta bulunmaktadır. Ön sipariş yerine doğrudan sipariş veriniz.', v_product.product_name;
    END IF;

    v_est_total := v_est_total + (v_qty * v_product.sale_price);

    -- SERVER-SIDE KORUMA: purchase_price veritabanından güvenle alınır
    INSERT INTO public.pre_order_items (
      owner_id, pre_order_id, product_id, product_name, brand, category, unit,
      demanded_quantity, fulfilled_quantity, estimated_sale_price, estimated_purchase_price, status
    ) VALUES (
      v_owner_id, v_pre_order_id, v_prod_id, v_product.product_name, v_product.brand, v_product.category, v_product.unit,
      v_qty, 0, v_product.sale_price, v_product.purchase_price, 'demand_received'
    );
  END LOOP;

  UPDATE public.pre_orders SET estimated_total = v_est_total WHERE id = v_pre_order_id;

  -- Audit Log
  INSERT INTO public.audit_logs (owner_id, action, entity_type, entity_id, details)
  VALUES (
    v_owner_id, 'SUBMIT_PUBLIC_PRE_ORDER', 'pre_orders', v_pre_order_id,
    jsonb_build_object(
      'order_number', v_order_number,
      'customer_name', p_customer_name,
      'customer_phone', p_customer_phone,
      'estimated_total', v_est_total
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'pre_order_id', v_pre_order_id,
    'order_number', v_order_number,
    'estimated_total', v_est_total
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. RLS POLİTİKALARI (CUSTOMERS VE HASSAS BİLGİLER ASLA PUBLIC'E AÇILMAZ)
-- Customers tablosuna anonim erişim HİÇBİR ŞEKİLDE YOKTUR.
-- Products tablosuna anonim erişim HİÇBİR ŞEKİLDE YOKTUR (Sadece public_catalog_products VIEW'i ve RPC çalışır).
