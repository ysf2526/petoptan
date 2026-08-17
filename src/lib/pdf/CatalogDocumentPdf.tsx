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

  // 1. COVER PAGE DESIGN (DIRECT FULL A4 PAGE POSTER IMAGE)
  coverPage: {
    padding: 0,
    margin: 0,
    backgroundColor: '#FFFFFF',
    height: '100%',
    width: '100%',
  },
  coverFullPosterImage: {
    width: '100%',
    height: '100%',
    objectFit: 'contain',
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
    width: 32,
    height: 28,
    borderRadius: 4,
    objectFit: 'contain',
  },
  headerBrandText: {
    fontSize: 10,
    fontWeight: 700,
    color: '#043933',
    letterSpacing: 0.5,
  },
  headerCatalogTitle: {
    fontSize: 9,
    color: '#059669',
    fontWeight: 700,
    textTransform: 'uppercase',
  },

  // SECTION CATEGORY BANNER (UNIFIED DESIGN SYSTEM)
  categoryBanner: {
    backgroundColor: '#043933', // Deep Petivox Teal
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
    height: 232,
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
    height: 124,
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
    color: '#043933', // Deep Petivox Teal Price
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
    backgroundColor: '#043933', // Deep Petivox Teal
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
    backgroundColor: '#002E28',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#0D685E',
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
  displayCategoryTitle: string;
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

// Formats category headers cleanly for customers without touching database values
const formatCategoryDisplayTitle = (rawCategory: string): string => {
  if (!rawCategory) return 'ÜRÜNLER';
  const upper = rawCategory.trim().toUpperCase();

  // REQ 6: Map reward & wet cat food to concise "ÖDÜL MAMALARI" or "KONSERVE / YAŞ MAMALAR"
  if (upper.includes('ÖDÜL') || upper.includes('ODUL')) {
    return 'ÖDÜL MAMALARI';
  }
  if (upper.includes('KONSERVE') || upper.includes('YAŞ MAMA') || upper.includes('YAS MAMA')) {
    return 'KONSERVE / YAŞ MAMALAR';
  }
  if (upper === 'KEDİ MAMASI' || upper === 'KEDI MAMASI') {
    return 'KEDİ MAMALARI';
  }
  if (upper === 'KÖPEK MAMASI' || upper === 'KOPEK MAMASI') {
    return 'KÖPEK MAMALARI';
  }
  return upper;
};

/**
 * Custom category sorting priority for PDF catalog:
 * 1. Food / Mama categories FIRST (Kedi Maması, Köpek Maması, Konserve & Yaş Mama, Ödül Mamaları)
 * 2. Other categories MIDDLE (Kedi Kumu, Sağlık & Bakım, etc.)
 * 3. Accessories & Toys LAST (Aksesuar & Oyuncak, etc.)
 */
export const getCategorySortRank = (categoryName: string): number => {
  if (!categoryName) return 999;
  const upper = categoryName.trim().toUpperCase();

  // 1. Food / Mama categories (First / Start)
  if (upper.includes('KEDİ MAMASI') || upper.includes('KEDI MAMASI')) return 10;
  if (upper.includes('KÖPEK MAMASI') || upper.includes('KOPEK MAMASI')) return 11;
  if (upper.includes('KONSERVE') || upper.includes('YAŞ MAMA') || upper.includes('YAS MAMA')) return 12;
  if (upper.includes('ÖDÜL') || upper.includes('ODUL')) return 13;
  if (upper.includes('MAMA')) return 14;

  // 3. Accessories & Toys categories (Last / End)
  if (upper.includes('AKSESUAR') || upper.includes('OYUNCAK')) return 100;

  // 2. Middle categories (Kedi Kumu, Sağlık & Bakım, etc.)
  if (upper.includes('KUM')) return 50;
  if (upper.includes('SAĞLIK') || upper.includes('SAGLIK') || upper.includes('BAKIM')) return 51;

  // Default for other categories
  return 70;
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

  // Cover Page Full Image (User uploaded poster image directly as Cover Page 1)
  const coverFullPosterUrl = typeof window !== 'undefined' ? '/catalog_cover_full.jpg' : 'public/catalog_cover_full.jpg';

  // EXACT REQ: MAX 6 PRODUCTS PER PAGE (2 COLS x 3 ROWS)
  const ITEMS_PER_PAGE = 6;

  // STRICT CATEGORY ISOLATION ALGORITHM:
  // Each category gets its OWN isolated page sequence!
  // No page will EVER mix products from two different categories!
  const pages: CategoryPageData[] = [];

  const sortedCategories = Object.keys(productsByCategory).sort((a, b) => {
    const rankA = getCategorySortRank(a);
    const rankB = getCategorySortRank(b);
    if (rankA !== rankB) {
      return rankA - rankB;
    }
    return a.localeCompare(b, 'tr');
  });

  sortedCategories.forEach((categoryName) => {
    const items = productsByCategory[categoryName];
    if (!items || items.length === 0) return;

    const displayCategoryTitle = formatCategoryDisplayTitle(categoryName);
    const totalPagesForCat = Math.ceil(items.length / ITEMS_PER_PAGE);

    for (let pIdx = 0; pIdx < totalPagesForCat; pIdx++) {
      const pageItems = items.slice(pIdx * ITEMS_PER_PAGE, (pIdx + 1) * ITEMS_PER_PAGE);
      pages.push({
        categoryName,
        displayCategoryTitle,
        items: pageItems,
        pageIndexInCategory: pIdx,
        totalPagesInCategory: totalPagesForCat,
      });
    }
  });

  return (
    <Document title={`${businessName} - TOPTAN ÜRÜN KATALOĞU`}>
      {/* 1. COVER PAGE (DIRECT FULL PAGE USER POSTER IMAGE) */}
      <Page size="A4" style={styles.coverPage}>
        <Image src={coverFullPosterUrl} style={styles.coverFullPosterImage} />
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
              {pageData.displayCategoryTitle}
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

        <View style={{ borderTopWidth: 1, borderTopColor: '#0D685E', paddingTop: 12, textAlign: 'center' }}>
          <Text style={{ fontSize: 8.5, color: '#A7F3D0' }}>
            Petivox Toptan Satış • Petshop İşletmelerinin Güvenilir Tedarikçisi • {generatedDate}
          </Text>
        </View>
      </Page>
    </Document>
  );
};

