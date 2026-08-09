# PETSHOP TOPTAN SATIŞ İŞLETME YÖNETİM SİSTEMİ

Petshoplara toptan ürün satan tek kişilik işletmeler için geliştirilmiş, yüksek veri bütünlüğü, stok hassasiyeti ve finansal doğruluk odaklı web tabanlı işletme yönetim sistemi.

---

## 🚀 Öne Çıkan Özellikler

1. **Güvenli Kimlik Doğrulama (Supabase Auth & RLS)**:
   - Şifre hardcode edilmez, dışarıya kapalı admin girişi.
   - Database seviyesinde **Row Level Security (RLS)** ile `owner_id = auth.uid()` izolasyonu.
   - Frontend `localStorage` üzerinde hiçbir finansal/ticari veri tutulmaz.

2. **Atomic Veritabanı İşlemleri (PostgreSQL Stored Procedures)**:
   - **`create_sale_transaction`**: Satış oluşturma, stok düşme, stok hareketi ekleme, cari borç yazma, 30 günlük haftalık taksit planlama ve audit log yazma işlemlerini tek bir veritabanı transaction'ında (ACID) gerçekleştirir. Herhangi bir hatada tam rollback yapar.
   - **`process_payment_transaction`**: Tahsilat kaydı, cari borç düşme ve `payment_schedules` vadelerine otomatik sırasıyla dağıtım işlemlerini hatasız yürütür.
   - **`stock_entry_transaction`**: Depo mal kabullerini ve stok sayım düzeltmelerini anlık günceller.

3. **Stok & Ürün Kartı Hassasiyeti**:
   - Ürün fiyatı değiştiğinde geçmiş satışların alış/satış snapshot fiyatları **asla değişmez**.
   - Birim kâr ve kâr oranı hesaplamaları canlı olarak gösterilir.
   - Kritik stok seviyesi altına düşen ürünler Dashboard'da anında uyarı verir.

4. **Vade Takibi & Haftalık Taksitlendirme**:
   - 30 günlük standart vadeli satışlarda 4 haftalık ödeme takvimi otomatik üretilir ve esnek olarak düzenlenebilir.
   - Tahsilat girildiğinde en eski vadesi geçmiş veya bekleyen taksitten itibaren tutar otomatik düşülür.

5. **Aylık Kâr Hedefi & Akıllı Satış Önerisi Engine**:
   - Belirlenen aylık kâr hedefine (örn. 100.000 TL) göre gerçekleşen kâr, kalan kâr, günlük gerekli ortalama kâr ve ay sonu tahmini kâr projeksiyonu.
   - Kalan kâr hedefine ulaşmak için ürünlerin birim kârı ve geçmiş satış sıklığını analiz eden **otomatik satış miktarı öneri algoritması**.

6. **Çift Yönlü Responsive Tasarım (Mobil & Masaüstü)**:
   - Masaüstü: Sol gezinti barı (Sidebar) ve zengin performans grafikleri.
   - Mobil: Alt navigasyon çubuğu (Bottom Navigation) ve tek dokunuşla hızlı satış/tahsilat deneyimi.

---

## 🛠️ Kurulum & Çalıştırma Adımları

### 1. Bağımlılıkları Yükleme
```bash
npm install
```

### 2. Ortam Değişkenleri (.env)
Geliştirme dizinindeki `.env` dosyasını Supabase projenize göre düzenleyin:
```env
VITE_SUPABASE_URL=https://<YOUR-PROJECT-REF>.supabase.co
VITE_SUPABASE_ANON_KEY=<YOUR-SUPABASE-ANON-KEY>
```

### 3. Veritabanı Migrasyonu (Supabase SQL)
Supabase Dashboard > SQL Editor ekranına gidin ve sırasıyla çalıştırın:
1. `supabase/migrations/20260809000000_schema_and_transactions.sql`
2. *(Opsiyonel Test Verisi)*: `supabase/seed.sql`

### 4. Lokal Sunucuyu Başlatma
```bash
npm run dev
```
Uygulama `http://localhost:3000` adresinde çalışacaktır.

---

## 🛡️ Production Veritabanı Yedekleme Stratejisi (PostgreSQL Backup)

Gerçek ticari verilerin kaybolmaması için production ortamında uygulanması gereken kontroller:

1. **Supabase Point-in-Time Recovery (PITR)**:
   - Supabase Dashboard > Database > Backups sekmesinden PITR (Saniyik Fiziksel Yedekleme) özelliğini aktif edin. Herhangi bir felaket durumunda veritabanını dilediğiniz saniyeye geri döndürebilirsiniz.
2. **Günlük Otomatik Yedekler (Daily Scheduled Backups)**:
   - Supabase projesinde otomatik günlük yedeklerin aktif olduğunu doğrulayın.
3. **pg_dump ile Manuel Dış Yedekleme (Cronjob)**:
   - Kritik finansal verilerin bağımsız bir sunucuya yedeklenmesi için nightly cron job ayarlayın:
   ```bash
   pg_dump -h db.<YOUR-PROJECT-REF>.supabase.co -U postgres -d postgres -F c -b -v -f "petoptan_backup_$(date +%Y%m%d).dump"
   ```

---

## 🧪 Uygulama Test Senaryoları (Verification Matrix)

System standardizasyonunu doğrulamak için aşağıdaki testler başarıyla çalışmaktadır:

* **TEST 1 (Satış & Stok & Borç)**:
  - Alış: 100 TL, Satış: 150 TL, Stok: 20 olan üründen 5 adet vadeli satış yapıldığında -> Stok 15'e iner, Müşteri borcu 750 TL, Kâr 250 TL hesaplanır.
* **TEST 2 (Tahsilat Düşüşü)**:
  - Müşteri 250 TL ödeme yaptığında -> Güncel borç 750 TL'den 500 TL'ye iner, ödeme planı güncellenir.
* **TEST 3 (Snapshot Fiyat İzolasyonu)**:
  - Ürünün güncel satış fiyatı 160 TL yapıldığında -> Geçmiş satıştaki birim fiyat 150 TL olarak sabit kalır.
* **TEST 4 (Mal Girişi)**:
  - Depoya 50 adet mal girişi yapıldığında -> Stok 15'ten 65'e yükselir ve `stock_movements` tablosuna `PURCHASE` kaydı düşer.
* **TEST 5 (Kritik Stok Uyarısı)**:
  - Minimum stok 70 belirlendiğinde stok 65 olduğu için ürün hem Dashboard'da hem de Stok Kartlarında "Kritik Stok" uyarısı verir.
* **TEST 6 (30 Gün Vade & Haftalık Taksit Hesabı)**:
  - 10.000 TL tutarında 30 gün vadeli satış yapıldığında üretilen 4 haftalık ödeme takviminin toplamı tam olarak 10.000 TL olur.
* **TEST 7 (Transaction Rollback Hata Güvenliği)**:
  - Satış esnasında veritabanı veya stok hatası oluştuğunda hiçbir kayıt yarıda kalmaz, stok düşmez ve borç eklenmez.
