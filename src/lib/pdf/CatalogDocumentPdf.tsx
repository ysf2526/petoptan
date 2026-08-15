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

// Register Turkish-compatible font if needed or use standard Helvetica
Font.registerHyphenationCallback((word) => [word]);

const styles = StyleSheet.create({
  page: {
    padding: 30,
    backgroundColor: '#0F172A', // Dark slate bg for ultra-modern look
    color: '#F8FAFC',
    fontFamily: 'Helvetica',
  },
  coverPage: {
    padding: 40,
    backgroundColor: '#090D16',
    color: '#FFFFFF',
    fontFamily: 'Helvetica',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'space-between',
    height: '100%',
  },
  coverHeader: {
    borderBottomWidth: 3,
    borderBottomColor: '#9333EA', // Purple brand accent
    paddingBottom: 20,
    marginBottom: 40,
  },
  coverLogoBox: {
    width: 60,
    height: 60,
    borderRadius: 16,
    backgroundColor: '#9333EA',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 15,
  },
  coverLogoText: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  coverBusinessName: {
    fontSize: 26,
    fontWeight: 'bold',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  coverTagline: {
    fontSize: 12,
    color: '#C084FC',
    marginTop: 4,
    fontWeight: 'bold',
  },
  coverBody: {
    marginVertical: 'auto',
    textAlign: 'center',
    padding: 20,
    backgroundColor: '#1E293B',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#334155',
  },
  coverTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 10,
  },
  coverSubtitle: {
    fontSize: 14,
    color: '#94A3B8',
    marginBottom: 20,
  },
  coverBadge: {
    backgroundColor: '#9333EA',
    color: '#FFFFFF',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    fontSize: 12,
    fontWeight: 'bold',
    alignSelf: 'center',
  },
  coverFooter: {
    borderTopWidth: 1,
    borderTopColor: '#334155',
    paddingTop: 20,
    marginTop: 40,
  },
  coverContactTitle: {
    fontSize: 11,
    color: '#C084FC',
    fontWeight: 'bold',
    marginBottom: 6,
    textTransform: 'uppercase',
  },
  coverContactText: {
    fontSize: 10,
    color: '#CBD5E1',
    marginBottom: 4,
  },

  // CATALOG INNER PAGES
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
    paddingBottom: 10,
    marginBottom: 15,
  },
  headerTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  headerSubtitle: {
    fontSize: 9,
    color: '#C084FC',
  },
  categoryTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FFFFFF',
    backgroundColor: '#1E293B',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    marginBottom: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#9333EA',
  },
  gridContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  productCard: {
    width: '48%',
    backgroundColor: '#1E293B',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#334155',
    padding: 10,
    marginBottom: 12,
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'space-between',
    height: 220,
  },
  imageBox: {
    height: 100,
    backgroundColor: '#0F172A',
    borderRadius: 8,
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
    fontSize: 8,
    color: '#64748B',
    fontWeight: 'bold',
    textTransform: 'uppercase',
  },
  brandBadge: {
    fontSize: 8,
    fontWeight: 'bold',
    color: '#C084FC',
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  productName: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 4,
    height: 26,
  },
  unitText: {
    fontSize: 8,
    color: '#94A3B8',
    marginBottom: 6,
  },
  descriptionText: {
    fontSize: 8,
    color: '#CBD5E1',
    marginBottom: 6,
    height: 20,
  },
  cardFooter: {
    borderTopWidth: 1,
    borderTopColor: '#334155',
    paddingTop: 6,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  priceLabel: {
    fontSize: 7,
    color: '#64748B',
    textTransform: 'uppercase',
  },
  priceValue: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#34D399', // Emerald green price
  },
  footer: {
    position: 'absolute',
    bottom: 20,
    left: 30,
    right: 30,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#1E293B',
    paddingTop: 8,
  },
  footerText: {
    fontSize: 8,
    color: '#64748B',
  },
  pageNumber: {
    fontSize: 8,
    color: '#64748B',
    fontWeight: 'bold',
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

  // Chunk array into pages of N items for clean PDF rendering
  const ITEMS_PER_PAGE = 6; // 2 cols x 3 rows per page fits perfectly on A4

  return (
    <Document title={`${businessName} - Ürün Kataloğu`}>
      {/* COVER PAGE */}
      <Page size="A4" style={styles.coverPage}>
        <View style={styles.coverHeader}>
          <View style={styles.coverLogoBox}>
            <Text style={styles.coverLogoText}>P</Text>
          </View>
          <Text style={styles.coverBusinessName}>{businessName}</Text>
          <Text style={styles.coverTagline}>TOPTAN PETSHOP ÜRÜN KATALOĞU</Text>
        </View>

        <View style={styles.coverBody}>
          <Text style={styles.coverTitle}>ÜRÜN KATALOĞU</Text>
          <Text style={styles.coverSubtitle}>
            Profesyonel Toptan Petshop Ürünleri ve Güncel Fiyat Listesi
          </Text>
          <Text style={styles.coverBadge}>TOPTAN SATIŞ ÖZEL KATALOĞU</Text>
        </View>

        <View style={styles.coverFooter}>
          <Text style={styles.coverContactTitle}>İLETİŞİM VE SİPARİŞ BİLGİLERİ</Text>
          <Text style={styles.coverContactText}>İşletme Adı: {businessName}</Text>
          <Text style={styles.coverContactText}>Telefon / WhatsApp: {phone}</Text>
          <Text style={styles.coverContactText}>Adres: {address}</Text>
          <Text style={styles.coverContactText}>Katalog Tarihi: {generatedDate}</Text>
        </View>
      </Page>

      {/* PRODUCT PAGES GROUPED BY CATEGORY */}
      {Object.entries(productsByCategory).map(([category, items]) => {
        // Chunk items by 6 per page
        const pagesCount = Math.ceil(items.length / ITEMS_PER_PAGE);
        const pagesArray = Array.from({ length: pagesCount });

        return pagesArray.map((_, pageIdx) => {
          const pageItems = items.slice(pageIdx * ITEMS_PER_PAGE, (pageIdx + 1) * ITEMS_PER_PAGE);

          return (
            <Page key={`${category}_page_${pageIdx}`} size="A4" style={styles.page}>
              {/* Header */}
              <View style={styles.header}>
                <Text style={styles.headerTitle}>{businessName}</Text>
                <Text style={styles.headerSubtitle}>Toptan Ürün Kataloğu</Text>
              </View>

              {/* Category Heading (show on first page of category) */}
              <Text style={styles.categoryTitle}>
                {category.toUpperCase()} {pagesCount > 1 ? `(Sayfa ${pageIdx + 1}/${pagesCount})` : ''}
              </Text>

              {/* Products Grid */}
              <View style={styles.gridContainer}>
                {pageItems.map((product) => (
                  <View key={product.id} style={styles.productCard} wrap={false}>
                    {/* Image */}
                    <View style={styles.imageBox}>
                      {product.image_url ? (
                        <Image src={product.image_url} style={styles.productImage} />
                      ) : (
                        <View style={styles.placeholderBox}>
                          <Text style={styles.placeholderText}>🐾 Görsel Yok</Text>
                        </View>
                      )}
                    </View>

                    {/* Content */}
                    <View>
                      {product.brand && (
                        <Text style={styles.brandBadge}>{product.brand}</Text>
                      )}
                      <Text style={styles.productName}>{product.product_name}</Text>
                      <Text style={styles.unitText}>Ambalaj / Birim: {product.unit || 'Adet'}</Text>
                      {product.description && (
                        <Text style={styles.descriptionText}>
                          {product.description.length > 55
                            ? `${product.description.substring(0, 55)}...`
                            : product.description}
                        </Text>
                      )}
                    </View>

                    {/* Footer / Price */}
                    <View style={styles.cardFooter}>
                      <View>
                        <Text style={styles.priceLabel}>TOPTAN FİYAT</Text>
                        <Text style={styles.priceValue}>
                          {product.sale_price.toLocaleString('tr-TR', {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}{' '}
                          TL
                        </Text>
                      </View>
                    </View>
                  </View>
                ))}
              </View>

              {/* Page Footer */}
              <View style={styles.footer} fixed>
                <Text style={styles.footerText}>
                  {businessName} • Sipariş için Tel/WhatsApp: {phone}
                </Text>
                <Text
                  style={styles.pageNumber}
                  render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`}
                />
              </View>
            </Page>
          );
        });
      })}
    </Document>
  );
};
