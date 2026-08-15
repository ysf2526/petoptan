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
import { PETIVOX_LOGO_BASE64 } from '@/assets/petivoxLogoBase64';

// 1. REGISTER ROBOTO TTF FONT WITH FULL TURKISH UNICODE (LATIN-EXT) SUPPORT
Font.register({
  family: 'Roboto',
  fonts: [
    {
      src: 'https://cdn.jsdelivr.net/fontsource/fonts/roboto@latest/latin-ext-400-normal.ttf',
      fontWeight: 400,
    },
    {
      src: 'https://cdn.jsdelivr.net/fontsource/fonts/roboto@latest/latin-ext-700-normal.ttf',
      fontWeight: 700,
    },
  ],
});

Font.registerHyphenationCallback((word) => [word]);

const styles = StyleSheet.create({
  // PAGE DEFAULTS
  page: {
    padding: 28,
    backgroundColor: '#FFFFFF',
    color: '#0F172A',
    fontFamily: 'Roboto',
  },

  // 1. COVER PAGE DESIGN (PETIVOX BRANDED)
  coverPage: {
    padding: 36,
    backgroundColor: '#0A2E23', // Petivox Dark Forest Green
    color: '#FFFFFF',
    fontFamily: 'Roboto',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'space-between',
    height: '100%',
  },
  coverLogoBox: {
    alignItems: 'center',
    marginTop: 20,
    marginBottom: 20,
  },
  coverLogoImage: {
    width: 220,
    height: 70,
    objectFit: 'contain',
  },
  coverHeroCard: {
    marginVertical: 'auto',
    backgroundColor: '#0D382B',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#154D3C',
    padding: 28,
    textAlign: 'center',
  },
  coverMainTitle: {
    fontSize: 26,
    fontWeight: 700,
    color: '#FFFFFF',
    marginBottom: 10,
    letterSpacing: 0.5,
  },
  coverSubtitle: {
    fontSize: 13,
    color: '#A7F3D0', // Soft mint green
    marginBottom: 20,
    lineHeight: 1.4,
  },
  coverPillBadge: {
    backgroundColor: '#10B981', // Emerald badge
    color: '#FFFFFF',
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 20,
    fontSize: 11,
    fontWeight: 700,
    alignSelf: 'center',
  },
  coverFooterCard: {
    backgroundColor: '#052219',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#0F4232',
    padding: 18,
    color: '#FFFFFF',
  },
  coverContactHeading: {
    fontSize: 10,
    color: '#34D399',
    fontWeight: 700,
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  coverContactText: {
    fontSize: 10,
    color: '#E2E8F0',
    marginBottom: 4,
    lineHeight: 1.4,
  },

  // 2. INNER PAGE HEADER & FOOTER
  innerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: '#E2E8F0',
    paddingBottom: 8,
    marginBottom: 14,
  },
  headerLogoImage: {
    width: 110,
    height: 32,
    objectFit: 'contain',
  },
  headerCatalogTitle: {
    fontSize: 10,
    color: '#0A2E23',
    fontWeight: 700,
  },

  // CATEGORY BANNER
  categoryBanner: {
    backgroundColor: '#0A2E23',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 9,
    marginBottom: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  categoryTitleText: {
    fontSize: 14,
    fontWeight: 700,
    color: '#FFFFFF',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  categoryPageMeta: {
    fontSize: 9,
    color: '#A7F3D0',
    fontWeight: 700,
  },

  // 3. PRODUCT GRID (2 COLS x 2 ROWS = 4 ITEMS PER PAGE FOR MAXIMUM WHATSAPP LEGIBILITY)
  gridContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 12,
  },
  productCard: {
    width: '48.5%',
    height: 270,
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 12,
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  imageContainer: {
    height: 120,
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    marginBottom: 8,
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
    fontWeight: 700,
    textTransform: 'uppercase',
  },
  brandText: {
    fontSize: 9,
    fontWeight: 700,
    color: '#059669',
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  productTitle: {
    fontSize: 11,
    fontWeight: 700,
    color: '#0F172A',
    marginBottom: 3,
    lineHeight: 1.3,
  },
  unitBadge: {
    fontSize: 9,
    color: '#64748B',
    marginBottom: 4,
    fontWeight: 700,
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
    fontWeight: 700,
    color: '#64748B',
    textTransform: 'uppercase',
  },
  priceAmount: {
    fontSize: 16,
    fontWeight: 700,
    color: '#059669', // Emerald Green Price
  },
  priceBadge: {
    backgroundColor: '#D1FAE5',
    color: '#065F46',
    fontSize: 7,
    fontWeight: 700,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 6,
  },

  // FOOTER
  footer: {
    position: 'absolute',
    bottom: 22,
    left: 28,
    right: 28,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    paddingTop: 8,
  },
  footerText: {
    fontSize: 8,
    color: '#64748B',
  },
  pageNumber: {
    fontSize: 8,
    color: '#64748B',
    fontWeight: 700,
  },

  // 4. CLOSING CONTACT PAGE (SON SAYFA)
  contactPage: {
    padding: 36,
    backgroundColor: '#0A2E23',
    color: '#FFFFFF',
    fontFamily: 'Roboto',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'space-between',
    height: '100%',
  },
  contactHero: {
    marginVertical: 'auto',
    alignItems: 'center',
    textAlign: 'center',
    paddingHorizontal: 16,
  },
  contactMainTitle: {
    fontSize: 26,
    fontWeight: 700,
    color: '#FFFFFF',
    marginBottom: 10,
  },
  contactSubTitle: {
    fontSize: 13,
    color: '#A7F3D0',
    marginBottom: 26,
    lineHeight: 1.5,
    maxWidth: 420,
  },
  contactCardGroup: {
    width: '100%',
    gap: 14,
  },
  contactCard: {
    backgroundColor: '#0D382B',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#154D3C',
    padding: 16,
    alignItems: 'center',
  },
  contactCardLabel: {
    fontSize: 9,
    color: '#34D399',
    fontWeight: 700,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  contactCardValue: {
    fontSize: 16,
    fontWeight: 700,
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
  const businessName = profile?.business_name || 'Petivox Toptan Satış';
  const phone = profile?.phone || '0555 000 0000';
  const address = profile?.address || 'Toptancılar Sitesi, Türkiye';

  // Petivox Logo (Base64 embedded for 100% reliable PDF rendering)
  const logoUrl = PETIVOX_LOGO_BASE64;

  // 4 ITEMS PER PAGE (2 COLS x 2 ROWS) FOR MAXIMUM WHATSAPP & MOBILE LEGIBILITY
  const ITEMS_PER_PAGE = 4;

  return (
    <Document title={`${businessName} - TOPTAN ÜRÜN KATALOĞU`}>
      {/* 1. COVER PAGE */}
      <Page size="A4" style={styles.coverPage}>
        <View style={styles.coverLogoBox}>
          <Image src={logoUrl} style={styles.coverLogoImage} />
        </View>

        <View style={styles.coverHeroCard}>
          <Text style={styles.coverMainTitle}>TOPTAN ÜRÜN KATALOĞU</Text>
          <Text style={styles.coverSubtitle}>
            Petshop İşletmeleri İçin Güncel Ürün Kataloğu ve Toptan Fiyat Listesi
          </Text>
          <Text style={styles.coverPillBadge}>PETIVOX TOPTAN SATIŞ</Text>
        </View>

        <View style={styles.coverFooterCard}>
          <Text style={styles.coverContactHeading}>İLETİŞİM VE İŞLETME BİLGİLERİ</Text>
          <Text style={styles.coverContactText}>Firma Ünvanı: {businessName}</Text>
          <Text style={styles.coverContactText}>Telefon & WhatsApp Sipariş Hat: {phone}</Text>
          <Text style={styles.coverContactText}>Adres: {address}</Text>
          <Text style={styles.coverContactText}>Katalog Tarihi: {generatedDate}</Text>
        </View>
      </Page>

      {/* 2. PRODUCT PAGES GROUPED BY CATEGORY */}
      {Object.entries(productsByCategory).map(([category, items]) => {
        const pagesCount = Math.ceil(items.length / ITEMS_PER_PAGE);
        const pagesArray = Array.from({ length: pagesCount });

        return pagesArray.map((_, pageIdx) => {
          const pageItems = items.slice(pageIdx * ITEMS_PER_PAGE, (pageIdx + 1) * ITEMS_PER_PAGE);

          return (
            <Page key={`${category}_page_${pageIdx}`} size="A4" style={styles.page}>
              {/* Header */}
              <View style={styles.innerHeader}>
                <Image src={logoUrl} style={styles.headerLogoImage} />
                <Text style={styles.headerCatalogTitle}>TOPTAN ÜRÜN KATALOĞU</Text>
              </View>

              {/* Category Heading Banner */}
              <View style={styles.categoryBanner}>
                <Text style={styles.categoryTitleText}>{category}</Text>
                {pagesCount > 1 && (
                  <Text style={styles.categoryPageMeta}>
                    Sayfa {pageIdx + 1} / {pagesCount}
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
                  Petivox Toptan Satış • Telefon / WhatsApp: {phone}
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
          <Image src={logoUrl} style={{ width: 200, height: 60, objectFit: 'contain', marginBottom: 20 }} />

          <Text style={styles.contactMainTitle}>SİPARİŞ VE İLETİŞİM</Text>
          <Text style={styles.contactSubTitle}>
            Kataloğumuzdaki ürünler hakkında detaylı bilgi almak veya siparişlerinizi iletmek için bizimle WhatsApp üzerinden doğrudan iletişime geçebilirsiniz.
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
          </View>
        </View>

        <View style={{ borderTopWidth: 1, borderTopColor: '#0F4232', paddingTop: 14, textAlign: 'center' }}>
          <Text style={{ fontSize: 9, color: '#A7F3D0' }}>
            Petivox Toptan Satış • Petshop İşletmelerinin Güvenilir Tedarikçisi • {generatedDate}
          </Text>
        </View>
      </Page>
    </Document>
  );
};
