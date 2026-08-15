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
import { Product, Profile } from '../../types/database.types';

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
    paddingTop: 16,
    paddingBottom: 22,
    paddingHorizontal: 20,
    backgroundColor: '#FFFFFF',
    color: '#0F172A',
    fontFamily: 'Roboto',
  },

  // 1. COVER PAGE DESIGN (PETIVOX CORPORATE DARK GREEN B2B)
  coverPage: {
    padding: 32,
    backgroundColor: '#0A2E23', // Petivox Corporate Dark Forest Green
    color: '#FFFFFF',
    fontFamily: 'Roboto',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'space-between',
    height: '100%',
  },
  coverLogoBox: {
    alignItems: 'center',
    marginTop: 15,
    marginBottom: 10,
  },
  coverLogoImage: {
    width: 125,
    height: 125,
    borderRadius: 18,
    objectFit: 'contain',
  },
  coverHeroCard: {
    marginVertical: 'auto',
    backgroundColor: '#0D382B',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#154D3C',
    padding: 24,
    textAlign: 'center',
    alignItems: 'center',
  },
  coverBrandTitle: {
    fontSize: 16,
    fontWeight: 700,
    color: '#A7F3D0', // Mint Accent
    marginBottom: 8,
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  coverMainTitle: {
    fontSize: 24,
    fontWeight: 700,
    color: '#FFFFFF',
    marginBottom: 10,
    letterSpacing: 0.5,
  },
  coverSubtitle: {
    fontSize: 11,
    color: '#E2E8F0',
    marginBottom: 16,
    lineHeight: 1.4,
    maxWidth: 380,
  },
  coverBadge: {
    backgroundColor: '#10B981', // Emerald Green Badge
    color: '#FFFFFF',
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 14,
    fontSize: 9.5,
    fontWeight: 700,
    alignSelf: 'center',
  },
  coverFooterCard: {
    backgroundColor: '#052219',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#0F4232',
    padding: 16,
    color: '#FFFFFF',
  },
  coverContactHeading: {
    fontSize: 9,
    color: '#34D399',
    fontWeight: 700,
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  coverContactText: {
    fontSize: 9.5,
    color: '#E2E8F0',
    marginBottom: 3,
    lineHeight: 1.4,
  },

  // 2. INNER PAGE HEADER & FOOTER
  innerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1.5,
    borderBottomColor: '#CBD5E1',
    paddingBottom: 6,
    marginBottom: 10,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerLogoImage: {
    width: 28,
    height: 28,
    borderRadius: 6,
    objectFit: 'contain',
  },
  headerBrandText: {
    fontSize: 10,
    fontWeight: 700,
    color: '#0A2E23',
    letterSpacing: 0.5,
  },
  headerCatalogTitle: {
    fontSize: 9,
    color: '#059669',
    fontWeight: 700,
    textTransform: 'uppercase',
  },

  // SECTION CATEGORY BANNER
  categoryBanner: {
    backgroundColor: '#0A2E23', // Dark Forest Green
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginBottom: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderLeftWidth: 4,
    borderLeftColor: '#10B981', // Mint left accent border
  },
  categoryTitleText: {
    fontSize: 12,
    fontWeight: 700,
    color: '#FFFFFF',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  categorySubtitleText: {
    fontSize: 8,
    color: '#A7F3D0',
    fontWeight: 700,
    letterSpacing: 0.5,
  },

  // 3. PRODUCT GRID (2 COLS x 3 ROWS = MAX 6 ITEMS PER PAGE)
  gridContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 10,
  },
  productCard: {
    width: '48.8%',
    height: 228,
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 8,
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'space-between',
  },
  imageContainer: {
    height: 118,
    width: '100%',
    backgroundColor: '#FAFAFA',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    marginBottom: 6,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    padding: 4,
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
    fontSize: 8.5,
    color: '#94A3B8',
    fontWeight: 700,
    textTransform: 'uppercase',
  },
  metaContainer: {
    flex: 1,
    justifyContent: 'flex-start',
  },
  brandText: {
    fontSize: 7.5,
    fontWeight: 700,
    color: '#059669', // Emerald Brand Tag
    textTransform: 'uppercase',
    marginBottom: 1,
    letterSpacing: 0.3,
  },
  productTitle: {
    fontSize: 9.5,
    fontWeight: 700,
    color: '#0F172A',
    marginBottom: 2,
    lineHeight: 1.25,
    maxHeight: 25,
    overflow: 'hidden',
  },
  unitBadge: {
    fontSize: 8,
    color: '#64748B',
    fontWeight: 400,
    marginTop: 1,
  },
  priceRow: {
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    paddingTop: 5,
    marginTop: 4,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  priceTag: {
    fontSize: 6.5,
    fontWeight: 700,
    color: '#64748B',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    marginBottom: 1,
  },
  priceAmount: {
    fontSize: 13.5,
    fontWeight: 700,
    color: '#0D382B', // Deep Green Price
  },
  priceBadge: {
    backgroundColor: '#D1FAE5',
    color: '#065F46',
    fontSize: 7,
    fontWeight: 700,
    paddingHorizontal: 6,
    paddingVertical: 2.5,
    borderRadius: 4,
  },

  // FOOTER
  footer: {
    position: 'absolute',
    bottom: 14,
    left: 20,
    right: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    paddingTop: 6,
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
    padding: 32,
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
    fontSize: 24,
    fontWeight: 700,
    color: '#FFFFFF',
    marginBottom: 10,
    letterSpacing: 0.5,
  },
  contactSubTitle: {
    fontSize: 11,
    color: '#A7F3D0',
    marginBottom: 24,
    lineHeight: 1.5,
    maxWidth: 400,
  },
  contactCardGroup: {
    width: '100%',
    gap: 12,
  },
  contactCard: {
    backgroundColor: '#0D382B',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#154D3C',
    padding: 14,
    alignItems: 'center',
  },
  contactCardLabel: {
    fontSize: 8.5,
    color: '#34D399',
    fontWeight: 700,
    textTransform: 'uppercase',
    marginBottom: 4,
    letterSpacing: 0.5,
  },
  contactCardValue: {
    fontSize: 15,
    fontWeight: 700,
    color: '#FFFFFF',
  },
});

interface CatalogDocumentPdfProps {
  profile: Profile | null;
  productsByCategory: Record<string, Product[]>;
  generatedDate: string;
}

interface CategoryPageData {
  categoryName: string;
  items: Product[];
  pageIndexInCategory: number;
  totalPagesInCategory: number;
}

const formatPackagingUnit = (unit?: string | null) => {
  if (!unit || !unit.trim()) return 'Adet';
  let formatted = unit.trim();
  formatted = formatted.replace(/\s*[\/,]\s*/g, ' • ');
  return formatted;
};

export const CatalogDocumentPdf: React.FC<CatalogDocumentPdfProps> = ({
  profile,
  productsByCategory,
  generatedDate,
}) => {
  const businessName = profile?.business_name || 'Petivox Toptan Satış';
  const phone = profile?.phone || '0555 000 0000';

  // Real Petivox Logo (Public static JPG asset - DO NOT CHANGE)
  const logoUrl = typeof window !== 'undefined' ? '/Petivx.jpg' : 'public/Petivx.jpg';

  // EXACT REQ: MAX 6 PRODUCTS PER PAGE (2 COLS x 3 ROWS)
  const ITEMS_PER_PAGE = 6;

  // STRICT CATEGORY ISOLATION ALGORITHM:
  // Each category gets its OWN isolated page sequence!
  // No page will EVER mix products from two different categories!
  const pages: CategoryPageData[] = [];

  Object.entries(productsByCategory).forEach(([categoryName, items]) => {
    if (!items || items.length === 0) return;

    const totalPagesForCat = Math.ceil(items.length / ITEMS_PER_PAGE);

    for (let pIdx = 0; pIdx < totalPagesForCat; pIdx++) {
      const pageItems = items.slice(pIdx * ITEMS_PER_PAGE, (pIdx + 1) * ITEMS_PER_PAGE);
      pages.push({
        categoryName,
        items: pageItems,
        pageIndexInCategory: pIdx,
        totalPagesInCategory: totalPagesForCat,
      });
    }
  });

  return (
    <Document title={`${businessName} - TOPTAN ÜRÜN KATALOĞU`}>
      {/* 1. COVER PAGE (KAPAK SAYFASI) */}
      <Page size="A4" style={styles.coverPage}>
        <View style={styles.coverLogoBox}>
          <Image src={logoUrl} style={styles.coverLogoImage} />
        </View>

        <View style={styles.coverHeroCard}>
          <Text style={styles.coverBrandTitle}>PETIVOX</Text>
          <Text style={styles.coverMainTitle}>TOPTAN ÜRÜN KATALOĞU</Text>
          <Text style={styles.coverSubtitle}>
            Petshop İşletmeleri İçin Güncel Ürün Kataloğu ve Toptan Fiyat Listesi
          </Text>
          <View style={styles.coverBadge}>
            <Text>GÜNCEL TOPTAN FİYAT LİSTESİ</Text>
          </View>
        </View>

        <View style={styles.coverFooterCard}>
          <Text style={styles.coverContactHeading}>İLETİŞİM BİLGİLERİ</Text>
          <Text style={styles.coverContactText}>Firma Ünvanı: {businessName}</Text>
          <Text style={styles.coverContactText}>Telefon & WhatsApp Sipariş Hattı: {phone}</Text>
          <Text style={styles.coverContactText}>Katalog Tarihi: {generatedDate}</Text>
        </View>
      </Page>

      {/* 2. ISOLATED CATEGORY PRODUCT PAGES */}
      {pages.map((pageData, pageIdx) => (
        <Page key={`cat_page_${pageIdx}`} size="A4" style={styles.page}>
          {/* Inner Header */}
          <View style={styles.innerHeader}>
            <View style={styles.headerLeft}>
              <Image src={logoUrl} style={styles.headerLogoImage} />
              <Text style={styles.headerBrandText}>{businessName}</Text>
            </View>
            <Text style={styles.headerCatalogTitle}>TOPTAN ÜRÜN KATALOĞU</Text>
          </View>

          {/* Dedicated Category Banner Header */}
          <View style={styles.categoryBanner}>
            <Text style={styles.categoryTitleText}>
              {pageData.categoryName}
              {pageData.totalPagesInCategory > 1 ? ` (${pageData.pageIndexInCategory + 1}/${pageData.totalPagesInCategory})` : ''}
            </Text>
            <Text style={styles.categorySubtitleText}>TOPTAN ÜRÜNLER</Text>
          </View>

          {/* Product Grid (Max 6 products: 2 cols x 3 rows) */}
          <View style={styles.gridContainer}>
            {pageData.items.map((product) => (
              <View key={product.id} style={styles.productCard} wrap={false}>
                {/* Product Image */}
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
                <View style={styles.metaContainer}>
                  {product.brand && (
                    <Text style={styles.brandText}>{product.brand}</Text>
                  )}
                  <Text style={styles.productTitle}>
                    {product.product_name}
                  </Text>
                  <Text style={styles.unitBadge}>
                    {formatPackagingUnit(product.unit)}
                  </Text>
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
      ))}

      {/* 3. CLOSING CONTACT PAGE (SON SAYFA) */}
      <Page size="A4" style={styles.contactPage}>
        <View style={styles.contactHero}>
          <Image
            src={logoUrl}
            style={{ width: 110, height: 110, borderRadius: 16, objectFit: 'contain', marginBottom: 16 }}
          />

          <Text style={styles.contactMainTitle}>SİPARİŞ VE İLETİŞİM</Text>
          <Text style={styles.contactSubTitle}>
            PETIVOX TOPTAN SATIŞ{"\n\n"}
            Kataloğumuzdaki ürünler hakkında bilgi almak, stok ve sipariş detaylarını öğrenmek için bizimle iletişime geçebilirsiniz.
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

        <View style={{ borderTopWidth: 1, borderTopColor: '#154D3C', paddingTop: 12, textAlign: 'center' }}>
          <Text style={{ fontSize: 8.5, color: '#A7F3D0' }}>
            Petivox Toptan Satış • Petshop İşletmelerinin Güvenilir Tedarikçisi • {generatedDate}
          </Text>
        </View>
      </Page>
    </Document>
  );
};

