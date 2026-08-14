-- PETSHOP TOPTAN SATIŞ İŞLETME YÖNETİM SİSTEMİ
-- MIGRATION: 20260815010000_product_type_images_and_catalog.sql
-- ÜRÜN YÖNETİMİ: STOK VS ÖN SİPARİŞ ÜRÜN TİPİ, ÜRÜN FOTOĞRAFI VE KATALOG ALTYAPISI

-- 1. PRODUCTS TABLOSUNA YENİ KOLONLARIN EKLENMESİ
ALTER TABLE public.products
ADD COLUMN IF NOT EXISTS product_type TEXT NOT NULL DEFAULT 'stock' CHECK (product_type IN ('stock', 'pre_order')),
ADD COLUMN IF NOT EXISTS image_url TEXT,
ADD COLUMN IF NOT EXISTS description TEXT,
ADD COLUMN IF NOT EXISTS show_in_catalog BOOLEAN NOT NULL DEFAULT TRUE;

-- İNDEKSLER
CREATE INDEX IF NOT EXISTS idx_products_type ON public.products(product_type);
CREATE INDEX IF NOT EXISTS idx_products_catalog ON public.products(show_in_catalog);

-- 2. SUPABASE STORAGE BUCKET CREATION (product-images)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'product-images',
  'product-images',
  true,
  10485760, -- 10MB
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 10485760,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

-- 3. STORAGE ROW LEVEL SECURITY (RLS) POLİTİKALARI
-- Herkes ürün fotoğraflarını görüntüleyebilir (Public Read)
DROP POLICY IF EXISTS "Public Read Access for Product Images" ON storage.objects;
CREATE POLICY "Public Read Access for Product Images"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'product-images');

-- Oturum açmış kullanıcılar kendi klasörlerine görsel yükleyebilir (Authenticated Insert)
DROP POLICY IF EXISTS "Owner Insert Access for Product Images" ON storage.objects;
CREATE POLICY "Owner Insert Access for Product Images"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'product-images' AND auth.role() = 'authenticated');

-- Oturum açmış kullanıcılar kendi yükledikleri görselleri güncelleyebilir (Authenticated Update)
DROP POLICY IF EXISTS "Owner Update Access for Product Images" ON storage.objects;
CREATE POLICY "Owner Update Access for Product Images"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'product-images' AND auth.role() = 'authenticated');

-- Oturum açmış kullanıcılar görsellerini silebilir (Authenticated Delete)
DROP POLICY IF EXISTS "Owner Delete Access for Product Images" ON storage.objects;
CREATE POLICY "Owner Delete Access for Product Images"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'product-images' AND auth.role() = 'authenticated');
