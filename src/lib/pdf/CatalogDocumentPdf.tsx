import React from 'react';
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Image,
  Font,
} from '@react-pdf/renderer';
import { Product, Profile } from '@/types/database.types';

Font.registerHyphenationCallback((word) => [word]);

const styles = StyleSheet.create({
  // PAGE LAYOUT - CLEAN WHITE & PREMIUM SLATE
  page: {
    padding: 30,
    backgroundColor: '#FFFFFF',
    color: '#0F172A',
    fontFamily: 'Helvetica',
  },

  // 1. COVER PAGE DESIGN
  coverPage: {
    padding: 40,
    backgroundColor: '#FFFFFF',
    color: '#0F172A',
    fontFamily: 'Helvetica',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'space-between',
    height: '100%',
  },
  coverTopBar: {
    height: 8,
    backgroundColor: '#7C3AED', // Premium Purple Accent
    borderRadius: 4,
    marginBottom: 24,
  },
  coverHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 30,
    gap: 16,
  },
  coverLogoBox: {
    width: 64,
    height: 64,
    borderRadius: 16,
    backgroundColor: '#7C3AED',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  coverLogoText: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  coverBusinessName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#0F172A',
    letterSpacing: 0.5,
  },
  coverTagline: {
    fontSize: 11,
    color: '#7C3AED',
    marginTop: 3,
    fontWeight: 'bold',
    textTransform: 'uppercase',
  },
  coverHeroBox: {
    marginVertical: 'auto',
    backgroundColor: '#F8FAFC',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 30,
    textAlign: 'center',
  },
  coverTitle: {
    fontSize: 30,
    fontWeight: 'bold',
    color: '#0F172A',
    marginBottom: 12,
  },
  coverSubtitle: {
    fontSize: 13,
    color: '#64748B',
    marginBottom: 24,
    lineHeight: 1.4,
  },
  coverPillBadge: {
    backgroundColor: '#7C3AED',
    color: '#FFFFFF',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 24,
    fontSize: 12,
    fontWeight: 'bold',
    alignSelf: 'center',
  },
  coverFooterCard: {
    backgroundColor: '#0F172A',
    borderRadius: 16,
    padding: 20,
    color: '#FFFFFF',
    marginTop: 20,
  },
  coverContactHeading: {
    fontSize: 11,
    color: '#C084FC',
    fontWeight: 'bold',
    marginBottom: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  coverContactItem: {
    fontSize: 10,
    color: '#E2E8F0',
    marginBottom: 6,
    lineHeight: 1.4,
  },

  // 2. INNER PAGE HEADER & FOOTER
  innerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: '#F1F5F9',
    paddingBottom: 10,
    marginBottom: 16,
  },
  headerBusiness: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#0F172A',
  },
  headerCatalogTitle: {
    fontSize: 10,
    color: '#7C3AED',
    fontWeight: 'bold',
  },

  // CATEGORY BANNER
  categoryBanner: {
    backgroundColor: '#7C3AED',
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
    marginBottom: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  categoryTitleText: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#FFFFFF',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  categoryPageMeta: {
    fontSize: 9,
    color: '#E9D5FF',
    fontWeight: 'bold',
  },

  // 3. PRODUCT GRID (2 COLS x 2 ROWS = 4 ITEMS PER PAGE FOR MAXIMUM MOBILE LEGIBILITY)
  gridContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 12,
  },
  productCard: {
    width: '48.5%',
    height: 275, // Generous height for large text & image
    backgroundColor: '#F8FAFC',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 12,
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  imageContainer: {
    height: 125,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    marginBottom: 10,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  productImage: {
    width: '100%',
    height: '100%',
    objectFit: 'contain',
  },
  placeholderBox: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholderText: {
    fontSize: 9,
    color: '#94A3B8',
    fontWeight: 'bold',
    textTransform: 'uppercase',
  },
  brandText: {
    fontSize: 9,
    fontWeight: 'bold',
    color: '#7C3AED',
    textTransform: 'uppercase',
    marginBottom: 3,
  },
  productTitle: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#0F172A',
    marginBottom: 4,
    height: 28, // Fix height for 2 lines title
  },
  unitBadge: {
    fontSize: 9,
    color: '#64748B',
    marginBottom: 4,
    fontWeight: 'bold',
  },
  descText: {
    fontSize: 8,
    color: '#64748B',
    height: 22,
    lineHeight: 1.3,
  },
  priceRow: {
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    paddingTop: 8,
    marginTop: 4,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  priceTag: {
    fontSize: 7,
    fontWeight: 'bold',
    color: '#64748B',
    textTransform: 'uppercase',
  },
  priceAmount: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#059669', // Emerald Green Price
  },
  priceBadge: {
    backgroundColor: '#D1FAE5',
    color: '#065F46',
    fontSize: 7,
    fontWeight: 'bold',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 6,
  },

  // FOOTER
  footer: {
    position: 'absolute',
    bottom: 25,
    left: 30,
    right: 30,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    paddingTop: 8,
  },
  footerText: {
    fontSize: 8,
    color: '#94A3B8',
  },
  pageNumber: {
    fontSize: 8,
    color: '#64748B',
    fontWeight: 'bold',
  },

  // 4. CLOSING CONTACT PAGE (SON SAYFA)
  contactPage: {
    padding: 40,
    backgroundColor: '#0F172A',
    color: '#FFFFFF',
    fontFamily: 'Helvetica',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'space-between',
    height: '100%',
  },
  contactHero: {
    marginVertical: 'auto',
    alignItems: 'center',
    textAlign: 'center',
    paddingHorizontal: 20,
  },
  contactMainTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 12,
  },
  contactSubTitle: {
    fontSize: 14,
    color: '#94A3B8',
    marginBottom: 30,
    lineHeight: 1.5,
    maxWidth: 400,
  },
  contactCardGroup: {
    width: '100%',
    gap: 16,
  },
  contactCard: {
    backgroundColor: '#1E293B',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#334155',
    padding: 20,
    alignItems: 'center',
  },
  contactCardLabel: {
    fontSize: 10,
    color: '#C084FC',
    fontWeight: 'bold',
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  contactCardValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
});

interface CatalogDocumentPdfProps {
  profile: Profile | null;
  productsByCategory: Record<string, Product[]>;
  generatedDate: string;
}

export const CatalogDocumentPdf: React.FC<CatalogDocumentPdfProps> = ({
  profile,
  productsByCategory,
  generatedDate,
}) => {
  const businessName = profile?.business_name || 'PETSHOP TOPTAN İŞLETME';
  const phone = profile?.phone || '0555 000 0000';
  const address = profile?.address || 'Toptancılar Sitesi, Türkiye';

  // 4 ITEMS PER PAGE (2 COLS x 2 ROWS) FOR MAXIMUM MOBILE READABILITY ON WHATSAPP
  const ITEMS_PER_PAGE = 4;

  return (
    <Document title={`${businessName} - Toptan Ürün Kataloğu`}>
      {/* 1. COVER PAGE */}
      <Page size="A4" style={styles.coverPage}>
        <View>
          <View style={styles.coverTopBar} />
          <View style={styles.coverHeader}>
            <View style={styles.coverLogoBox}>
              <Text style={styles.coverLogoText}>P</Text>
            </View>
            <View>
              <Text style={styles.coverBusinessName}>{businessName}</Text>
              <Text style={styles.coverTagline}>PETSHOP İŞLETMELERİ İÇİN TOPTAN ÜRÜNLER</Text>
            </View>
          </View>
        </View>

        <View style={styles.coverHeroBox}>
          <Text style={styles.coverTitle}>TOPTAN ÜRÜN KATALOĞU</Text>
          <Text style={styles.coverSubtitle}>
            Petshop İşletmeleri İçin Özel Güncel Ürün Kataloğu ve Toptan Fiyat Listesi
          </Text>
          <Text style={styles.coverPillBadge}>PROFESYONEL TOPTAN SATIŞ KATALOĞU</Text>
        </View>

        <View style={styles.coverFooterCard}>
          <Text style={styles.coverContactHeading}>İLETİŞİM VE İŞLETME BİLGİLERİ</Text>
          <Text style={styles.coverContactItem}>Firma / İşletme: {businessName}</Text>
          <Text style={styles.coverContactItem}>Telefon & WhatsApp Sipariş: {phone}</Text>
          <Text style={styles.coverContactItem}>Adres: {address}</Text>
          <Text style={styles.coverContactItem}>Katalog Güncelleme Tarihi: {generatedDate}</Text>
        </View>
      </Page>

      {/* 2. PRODUCT PAGES GROUPED BY CATEGORY (4 ITEMS PER PAGE) */}
      {Object.entries(productsByCategory).map(([category, items]) => {
        const pagesCount = Math.ceil(items.length / ITEMS_PER_PAGE);
        const pagesArray = Array.from({ length: pagesCount });

        return pagesArray.map((_, pageIdx) => {
          const pageItems = items.slice(pageIdx * ITEMS_PER_PAGE, (pageIdx + 1) * ITEMS_PER_PAGE);

          return (
            <Page key={`${category}_page_${pageIdx}`} size="A4" style={styles.page}>
              {/* Header */}
              <View style={styles.innerHeader}>
                <Text style={styles.headerBusiness}>{businessName}</Text>
                <Text style={styles.headerCatalogTitle}>Toptan Ürün Kataloğu</Text>
              </View>

              {/* Category Heading Banner */}
              <View style={styles.categoryBanner}>
                <Text style={styles.categoryTitleText}>{category}</Text>
                {pagesCount > 1 && (
                  <Text style={styles.categoryPageMeta}>
                    Bölüm Sayfası {pageIdx + 1} / {pagesCount}
                  </Text>
                )}
              </View>

              {/* 2x2 Product Grid */}
              <View style={styles.gridContainer}>
                {pageItems.map((product) => (
                  <View key={product.id} style={styles.productCard} wrap={false}>
                    {/* Image Container */}
                    <View style={styles.imageContainer}>
                      {product.image_url ? (
                        <Image src={product.image_url} style={styles.productImage} />
                      ) : (
                        <View style={styles.placeholderBox}>
                          <Text style={styles.placeholderText}>🐾 Görsel Yok</Text>
                        </View>
                      )}
                    </View>

                    {/* Product Metadata */}
                    <View>
                      {product.brand && <Text style={styles.brandText}>{product.brand}</Text>}
                      <Text style={styles.productTitle}>{product.product_name}</Text>
                      <Text style={styles.unitBadge}>Ambalaj / Birim: {product.unit || 'Adet'}</Text>
                      {product.description && (
                        <Text style={styles.descText}>
                          {product.description.length > 50
                            ? `${product.description.substring(0, 50)}...`
                            : product.description}
                        </Text>
                      )}
                    </View>

                    {/* Price Section */}
                    <View style={styles.priceRow}>
                      <View>
                        <Text style={styles.priceTag}>TOPTAN FİYAT</Text>
                        <Text style={styles.priceAmount}>
                          {product.sale_price.toLocaleString('tr-TR', {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}{' '}
                          TL
                        </Text>
                      </View>
                      <Text style={styles.priceBadge}>TOPTAN</Text>
                    </View>
                  </View>
                ))}
              </View>

              {/* Page Footer */}
              <View style={styles.footer} fixed>
                <Text style={styles.footerText}>
                  {businessName} • Sipariş Hattı: {phone}
                </Text>
                <Text
                  style={styles.pageNumber}
                  render={({ pageNumber, totalPages }) => `Sayfa ${pageNumber} / ${totalPages}`}
                />
              </View>
            </Page>
          );
        });
      })}

      {/* 3. CLOSING CONTACT PAGE (SON SAYFA) */}
      <Page size="A4" style={styles.contactPage}>
        <View style={styles.contactHero}>
          <Text style={styles.contactMainTitle}>SİPARİŞ VE İLETİŞİM</Text>
          <Text style={styles.contactSubTitle}>
            Kataloğumuzdaki ürünler hakkında detaylı bilgi almak veya sipariş vermek için bizimle doğrudan WhatsApp veya telefon üzerinden iletişime geçebilirsiniz.
          </Text>

          <View style={styles.contactCardGroup}>
            <View style={styles.contactCard}>
              <Text style={styles.contactCardLabel}>TELEFON & WHATSAPP SİPARİŞ HATTI</Text>
              <Text style={styles.contactCardValue}>{phone}</Text>
            </View>

            <View style={styles.contactCard}>
              <Text style={styles.contactCardLabel}>FİRMA ÜNVANI</Text>
              <Text style={styles.contactCardValue}>{businessName}</Text>
            </View>

            <View style={styles.contactCard}>
              <Text style={styles.contactCardLabel}>ADRES</Text>
              <Text style={styles.contactCardValue}>{address}</Text>
            </View>
          </View>
        </View>

        <View style={{ borderTopWidth: 1, borderTopColor: '#334155', paddingTop: 15, textAlign: 'center' }}>
          <Text style={{ fontSize: 9, color: '#94A3B8' }}>
            {businessName} • Petshop İşletmelerine Özel Toptan Satış Kataloğu • {generatedDate}
          </Text>
        </View>
      </Page>
    </Document>
  );
};
