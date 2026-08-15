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
    paddingTop: 18,
    paddingBottom: 22,
    paddingHorizontal: 22,
    backgroundColor: '#FFFFFF',
    color: '#0F172A',
    fontFamily: 'Roboto',
  },

  // 1. COVER PAGE DESIGN (PETIVOX CORPORATE B2B)
  coverPage: {
    padding: 32,
    backgroundColor: '#0B192C', // Deep Corporate Navy
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
    width: 120,
    height: 120,
    borderRadius: 18,
    objectFit: 'contain',
  },
  coverHeroCard: {
    marginVertical: 'auto',
    backgroundColor: '#1E293B',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#334155',
    padding: 24,
    textAlign: 'center',
    alignItems: 'center',
  },
  coverBrandTitle: {
    fontSize: 16,
    fontWeight: 700,
    color: '#38BDF8', // Cyan Accent
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
    color: '#94A3B8', // Soft slate text
    marginBottom: 16,
    lineHeight: 1.4,
    maxWidth: 380,
  },
  coverBadge: {
    backgroundColor: '#0284C7', // Sky Blue badge
    color: '#FFFFFF',
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 14,
    fontSize: 10,
    fontWeight: 700,
    alignSelf: 'center',
  },
  coverFooterCard: {
    backgroundColor: '#0F172A',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#1E293B',
    padding: 16,
    color: '#FFFFFF',
  },
  coverContactHeading: {
    fontSize: 9,
    color: '#38BDF8',
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
    width: 30,
    height: 30,
    borderRadius: 6,
    objectFit: 'contain',
  },
  headerBrandText: {
    fontSize: 10,
    fontWeight: 700,
    color: '#0F172A',
    letterSpacing: 0.5,
  },
  headerCatalogTitle: {
    fontSize: 9,
    color: '#0284C7',
    fontWeight: 700,
    textTransform: 'uppercase',
  },

  // CATEGORY BANNER
  categoryBanner: {
    backgroundColor: '#0F172A',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    marginBottom: 8,
    marginTop: 2,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  categoryTitleText: {
    fontSize: 11,
    fontWeight: 700,
    color: '#FFFFFF',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  // 3. PRODUCT GRID (2 COLS x 3 ROWS = 6 ITEMS PER PAGE)
  gridContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 8,
  },
  productCard: {
    width: '48.8%',
    height: 216,
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
    height: 105,
    width: '100%',
    backgroundColor: '#FAFAFA',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    marginBottom: 5,
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
    color: '#0284C7',
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
    fontSize: 13,
    fontWeight: 700,
    color: '#0369A1', // Strong Blue Price
  },
  priceBadge: {
    backgroundColor: '#E0F2FE',
    color: '#0369A1',
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
    left: 22,
    right: 22,
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
    backgroundColor: '#0B192C',
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
    color: '#94A3B8',
    marginBottom: 24,
    lineHeight: 1.5,
    maxWidth: 400,
  },
  contactCardGroup: {
    width: '100%',
    gap: 12,
  },
  contactCard: {
    backgroundColor: '#1E293B',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#334155',
    padding: 14,
    alignItems: 'center',
  },
  contactCardLabel: {
    fontSize: 8.5,
    color: '#38BDF8',
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

interface CatalogItem {
  product: Product;
  category: string;
}

interface CategoryGroupOnPage {
  categoryName: string;
  items: Product[];
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

  // EXACT REQ: 6 PRODUCTS PER PAGE (2 COLS x 3 ROWS)
  const ITEMS_PER_PAGE = 6;

  // Flatten products ordered by category
  const allCatalogItems: CatalogItem[] = [];
  Object.entries(productsByCategory).forEach(([cat, items]) => {
    items.forEach((p) => {
      allCatalogItems.push({ product: p, category: cat });
    });
  });

  // Partition into pages of exactly 6 items max
  const pagesOfItems: CatalogItem[][] = [];
  for (let i = 0; i < allCatalogItems.length; i += ITEMS_PER_PAGE) {
    pagesOfItems.push(allCatalogItems.slice(i, i + ITEMS_PER_PAGE));
  }

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

      {/* 2. PRODUCT PAGES (6 PRODUCTS PER PAGE - 2 COLS x 3 ROWS) */}
      {pagesOfItems.map((pageItems, pageIdx) => {
        // Group the 6 items on this page by category while preserving order
        const categoriesOnPage: CategoryGroupOnPage[] = [];
        pageItems.forEach((ci) => {
          const lastGroup = categoriesOnPage[categoriesOnPage.length - 1];
          if (lastGroup && lastGroup.categoryName === ci.category) {
            lastGroup.items.push(ci.product);
          } else {
            categoriesOnPage.push({
              categoryName: ci.category,
              items: [ci.product],
            });
          }
        });

        return (
          <Page key={`catalog_page_${pageIdx}`} size="A4" style={styles.page}>
            {/* Inner Header */}
            <View style={styles.innerHeader}>
              <View style={styles.headerLeft}>
                <Image src={logoUrl} style={styles.headerLogoImage} />
                <Text style={styles.headerBrandText}>{businessName}</Text>
              </View>
              <Text style={styles.headerCatalogTitle}>TOPTAN ÜRÜN KATALOĞU</Text>
            </View>

            {/* Render Category Sections on this Page */}
            {categoriesOnPage.map((catGroup, catIdx) => (
              <View key={`cat_${pageIdx}_${catIdx}`} style={{ marginBottom: 6 }}>
                {/* Category Header */}
                <View style={styles.categoryBanner}>
                  <Text style={styles.categoryTitleText}>{catGroup.categoryName}</Text>
                </View>

                {/* Product Grid (2 columns x items) */}
                <View style={styles.gridContainer}>
                  {catGroup.items.map((product) => (
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
              </View>
            ))}

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
      })}

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

        <View style={{ borderTopWidth: 1, borderTopColor: '#1E293B', paddingTop: 12, textAlign: 'center' }}>
          <Text style={{ fontSize: 8.5, color: '#94A3B8' }}>
            Petivox Toptan Satış • Petshop İşletmelerinin Güvenilir Tedarikçisi • {generatedDate}
          </Text>
        </View>
      </Page>
    </Document>
  );
};

