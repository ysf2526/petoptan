-- PETSHOP TOPTAN SATIŞ İŞLETME YÖNETİM SİSTEMİ - DEMO SEED DATA
-- Test ortamında veya geliştirme aşamasında örnek veri yüklemek için kullanılır.
-- Kullanıcı ID'si (owner_id) oturum açan Supabase Auth kullanıcısının ID'si ile eşleşmelidir.

-- 1. TEDARİKÇİLER
INSERT INTO public.suppliers (id, owner_id, company_name, contact_person, phone, email, address)
VALUES
  ('11111111-1111-1111-1111-111111111111', auth.uid(), 'Lider Pet Food A.Ş.', 'Ahmet Yılmaz', '0212 555 1020', 'siparis@liderpet.com', 'İkitelli OSB No:45 İstanbul'),
  ('22222222-2222-2222-2222-222222222222', auth.uid(), 'Nestle Purina Türkiye', 'Selin Kaya', '0216 444 3040', 'toptan@purina.com.tr', 'Maslak Plaza Kat:8 İstanbul');

-- 2. ÜRÜNLER
INSERT INTO public.products (id, owner_id, product_name, brand, category, barcode, unit, purchase_price, sale_price, current_stock, minimum_stock, supplier_id, supplier)
VALUES
  ('a1111111-1111-1111-1111-111111111111', auth.uid(), 'Royal Canin Adult Medium 15 KG', 'Royal Canin', 'Köpek Maması', '869012345601', 'Çuval', 1800.00, 2200.00, 45.00, 10.00, '11111111-1111-1111-1111-111111111111', 'Lider Pet Food A.Ş.'),
  ('a2222222-2222-2222-2222-222222222222', auth.uid(), 'Pro Plan Sterilised Tavuklu 10 KG', 'Pro Plan', 'Kedi Maması', '869012345602', 'Çuval', 1400.00, 1750.00, 30.00, 8.00, '22222222-2222-2222-2222-222222222222', 'Nestle Purina Türkiye'),
  ('a3333333-3333-3333-3333-333333333333', auth.uid(), 'Reflex Plus Somonlu Yetişkin Kedi Maması 15 KG', 'Reflex', 'Kedi Maması', '869012345603', 'Çuval', 850.00, 1100.00, 60.00, 15.00, '11111111-1111-1111-1111-111111111111', 'Lider Pet Food A.Ş.'),
  ('a4444444-4444-4444-4444-444444444444', auth.uid(), 'Whiskas Biftekli Yaş Kedi Maması 85gr (24lü Koli)', 'Whiskas', 'Konserve & Yaş Mama', '869012345604', 'Koli', 320.00, 420.00, 5.00, 12.00, '22222222-2222-2222-2222-222222222222', 'Nestle Purina Türkiye'), -- Kritik stok örneği
  ('a5555555-5555-5555-5555-555555555555', auth.uid(), 'Bentonit Topaklaşan Kedi Kumu 10L (4lü Paket)', 'PetClean', 'Kedi Kumu', '869012345605', 'Paket', 180.00, 250.00, 80.00, 20.00, '11111111-1111-1111-1111-111111111111', 'Lider Pet Food A.Ş.');

-- 3. MÜŞTERİLER
INSERT INTO public.customers (id, owner_id, business_name, contact_name, phone, email, address, tax_number, tax_office, payment_term_days)
VALUES
  ('c1111111-1111-1111-1111-111111111111', auth.uid(), 'Kadıköy Pet Dünyası', 'Mehmet Demir', '0532 100 2030', 'kadikoypet@gmail.com', 'Moda Cad. No:12 Kadıköy / İstanbul', '1234567890', 'Kadıköy VD', 30),
  ('c2222222-2222-2222-2222-222222222222', auth.uid(), 'Pawland Petstore & Veteriner', 'Zeynep Arslan', '0533 200 3040', 'info@pawland.com', 'Bağdat Cad. No:150 Suadiye / İstanbul', '9876543210', 'Erenköy VD', 30),
  ('c3333333-3333-3333-3333-333333333333', auth.uid(), 'Pati Gross Market', 'Ali Yıldız', '0535 400 5060', 'patigross@hotmail.com', 'Atatürk Cad. No:88 Bakırköy / İstanbul', '4567891230', 'Bakırköy VD', 30),
  ('c4444444-4444-4444-4444-444444444444', auth.uid(), 'Dostlar Petshop', 'Caner Şahin', '0536 700 8090', 'dostlarpet@gmail.com', 'Barbaros Bulvarı No:42 Beşiktaş / İstanbul', '3216549870', 'Beşiktaş VD', 30),
  ('c5555555-5555-5555-5555-555555555555', auth.uid(), 'VetLife Veteriner Kliniği', 'Dr. Burak Çelik', '0537 888 9900', 'burak@vetlife.com', 'Dereboyu Cad. No:19 Mecidiyeköy / İstanbul', '7891234560', 'Şişli VD', 30);
