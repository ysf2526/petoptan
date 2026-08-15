import React from 'react';
import { Document, Page, Text, View, StyleSheet, Font } from '@react-pdf/renderer';
import { Sale, SaleItem, Customer, Profile } from '@/types/database.types';
import { formatCurrency, formatDate } from '@/utils/formatters';

// Register Turkish-compatible Roboto font
Font.register({
  family: 'Roboto',
  fonts: [
    { src: 'https://cdnjs.cloudflare.com/ajax/libs/ink/3.1.10/fonts/Roboto/roboto-light-webfont.ttf', fontWeight: 300 },
    { src: 'https://cdnjs.cloudflare.com/ajax/libs/ink/3.1.10/fonts/Roboto/roboto-regular-webfont.ttf', fontWeight: 400 },
    { src: 'https://cdnjs.cloudflare.com/ajax/libs/ink/3.1.10/fonts/Roboto/roboto-medium-webfont.ttf', fontWeight: 500 },
    { src: 'https://cdnjs.cloudflare.com/ajax/libs/ink/3.1.10/fonts/Roboto/roboto-bold-webfont.ttf', fontWeight: 700 },
  ],
});

const styles = StyleSheet.create({
  page: {
    padding: 24,
    fontSize: 9,
    fontFamily: 'Roboto',
    color: '#0f172a',
    backgroundColor: '#ffffff',
  },

  // 1. Header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    borderBottomWidth: 1,
    borderBottomColor: '#cbd5e1',
    paddingBottom: 10,
    marginBottom: 10,
  },
  businessTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#0f172a',
    textTransform: 'uppercase',
  },
  businessSubtitle: {
    fontSize: 8,
    color: '#2563eb',
    marginTop: 2,
    fontWeight: 500,
  },
  contactText: {
    fontSize: 7.5,
    color: '#64748b',
    marginTop: 2,
  },
  docBadge: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 4,
    padding: 6,
    textAlign: 'right',
    minWidth: 160,
  },
  docTitle: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#1e40af',
    textTransform: 'uppercase',
  },
  docMeta: {
    fontSize: 8,
    color: '#334155',
    marginTop: 3,
  },

  // 2. Customer Box
  customerCard: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 4,
    padding: 8,
    marginBottom: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  customerLabel: {
    fontSize: 7.5,
    fontWeight: 'bold',
    color: '#2563eb',
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  customerName: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#0f172a',
  },
  customerSub: {
    fontSize: 8,
    color: '#475569',
    marginTop: 1,
  },

  // 3. Financial Summary Strip
  summaryStrip: {
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 4,
    padding: 8,
    marginBottom: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    textAlign: 'center',
  },
  summaryItem: {
    flex: 1,
  },
  summaryLabel: {
    fontSize: 7,
    fontWeight: 'bold',
    color: '#475569',
    textTransform: 'uppercase',
  },
  summaryVal: {
    fontSize: 10,
    fontWeight: 'bold',
    marginTop: 2,
  },

  // 4. Products Table
  sectionHeader: {
    fontSize: 8.5,
    fontWeight: 'bold',
    color: '#1e293b',
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  table: {
    width: '100%',
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 4,
    overflow: 'hidden',
  },
  tHead: {
    backgroundColor: '#1e40af',
    color: '#ffffff',
    flexDirection: 'row',
    paddingVertical: 4,
    paddingHorizontal: 6,
    fontSize: 8,
    fontWeight: 'bold',
  },
  tRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
    paddingVertical: 4,
    paddingHorizontal: 6,
    fontSize: 8,
  },
  tFoot: {
    backgroundColor: '#f8fafc',
    flexDirection: 'row',
    paddingVertical: 5,
    paddingHorizontal: 6,
    fontSize: 8,
    fontWeight: 'bold',
    borderTopWidth: 1,
    borderTopColor: '#cbd5e1',
  },

  // Table columns
  colName: { flex: 3.5 },
  colQty: { flex: 1, textAlign: 'center' },
  colUnit: { flex: 1, textAlign: 'center' },
  colPrice: { flex: 1.5, textAlign: 'right' },
  colTotal: { flex: 1.5, textAlign: 'right' },

  // 5. Disclaimer & Footer
  warningBox: {
    backgroundColor: '#fffbeb',
    borderWidth: 1,
    borderColor: '#fde68a',
    borderRadius: 4,
    padding: 6,
    marginTop: 10,
    marginBottom: 8,
    textAlign: 'center',
  },
  warningText: {
    fontSize: 7.5,
    color: '#92400e',
  },
  warningBold: {
    fontSize: 8,
    fontWeight: 'bold',
    color: '#78350f',
    marginTop: 1,
  },
  footer: {
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    paddingTop: 6,
    flexDirection: 'row',
    justifyContent: 'space-between',
    fontSize: 7,
    color: '#64748b',
  },
});

interface SalesDocumentPdfProps {
  sale: Sale;
  items: SaleItem[];
  customer: Customer | null;
  profile: Profile | null;
  previousBalance: number;
  currentSaleAmount: number;
  paymentMade: number;
  netTotalDebt: number;
}

export const SalesDocumentPdf: React.FC<SalesDocumentPdfProps> = ({
  sale,
  items,
  customer,
  profile,
  previousBalance,
  currentSaleAmount,
  paymentMade,
  netTotalDebt,
}) => {
  const businessTitle = profile?.business_name?.trim() || 'PETSHOP TOPTAN';
  const businessPhone = profile?.phone?.trim() || '0532 000 00 00';
  const businessAddress = profile?.address?.trim() || 'Toptan Güven, Hızlı Tedarik';

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* 1. Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.businessTitle}>{businessTitle}</Text>
            <Text style={styles.businessSubtitle}>Toptan Pet Ürünleri & Cari Hesap Ekstresi</Text>
            <Text style={styles.contactText}>
              Tel: {businessPhone} | Adres: {businessAddress}
            </Text>
          </View>

          <View style={styles.docBadge}>
            <Text style={styles.docTitle}>SATIŞ & CARİ HESAP BELGESİ</Text>
            <Text style={styles.docMeta}>Satış No: {sale.sale_number}</Text>
            <Text style={styles.docMeta}>Tarih: {formatDate(sale.created_at)}</Text>
            <Text style={styles.docMeta}>
              Ödeme Tipi: {sale.payment_type === 'pesin' ? 'Peşin Satış' : 'Açık Hesap (Cari)'}
            </Text>
          </View>
        </View>

        {/* 2. Customer Info */}
        <View style={styles.customerCard}>
          <View>
            <Text style={styles.customerLabel}>MÜŞTERİ BİLGİLERİ</Text>
            <Text style={styles.customerName}>{sale.customer_name}</Text>
            {(customer?.contact_name || customer?.contact_person) && (
              <Text style={styles.customerSub}>Yetkili: {customer?.contact_name || customer?.contact_person}</Text>
            )}
          </View>
          {customer?.phone && (
            <View style={{ justifyContent: 'flex-end' }}>
              <Text style={styles.customerSub}>Tel: {customer.phone}</Text>
            </View>
          )}
        </View>

        {/* 3. Products Table (BUGÜNKÜ SİPARİŞ) */}
        <Text style={styles.sectionHeader}>BUGÜNKÜ SİPARİŞ ({items.length} KALEM ÜRÜN)</Text>
        <View style={styles.table}>
          <View style={styles.tHead}>
            <Text style={styles.colName}>Ürün Adı</Text>
            <Text style={styles.colQty}>Miktar</Text>
            <Text style={styles.colUnit}>Birim</Text>
            <Text style={styles.colPrice}>Birim Fiyat</Text>
            <Text style={styles.colTotal}>Toplam</Text>
          </View>
          {items.map((it) => (
            <View key={it.id} style={styles.tRow}>
              <Text style={styles.colName}>{it.product_name}</Text>
              <Text style={styles.colQty}>{it.quantity}</Text>
              <Text style={styles.colUnit}>{it.unit}</Text>
              <Text style={styles.colPrice}>{formatCurrency(it.sale_price_snapshot)}</Text>
              <Text style={styles.colTotal}>{formatCurrency(it.total_amount)}</Text>
            </View>
          ))}
          <View style={styles.tFoot}>
            <Text style={{ flex: 6.5, textAlign: 'right' }}>Bugünkü Satış Tutarı:</Text>
            <Text style={{ flex: 1.5, textAlign: 'right', fontSize: 9 }}>{formatCurrency(currentSaleAmount)}</Text>
          </View>
        </View>

        {/* 4. Financial Accounting Strip (CARİ DURUM ÖZETİ) */}
        <Text style={styles.sectionHeader}>GÜNCEL CARİ HESAP ÖZETİ</Text>
        <View style={styles.summaryStrip}>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryLabel}>ÖNCEKİ BAKİYE</Text>
            <Text style={[styles.summaryVal, { color: '#475569' }]}>{formatCurrency(previousBalance)}</Text>
          </View>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryLabel}>BUGÜNKÜ SATIŞ</Text>
            <Text style={[styles.summaryVal, { color: '#1e40af' }]}>{formatCurrency(currentSaleAmount)}</Text>
          </View>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryLabel}>YAPILAN ÖDEME</Text>
            <Text style={[styles.summaryVal, { color: '#15803d' }]}>{formatCurrency(paymentMade)}</Text>
          </View>
          <View style={styles.summaryItem}>
            <Text style={[styles.summaryLabel, { color: '#b45309' }]}>GÜNCEL TOPLAM CARİ BORÇ</Text>
            <Text style={[styles.summaryVal, { color: '#d97706', fontSize: 11 }]}>{formatCurrency(netTotalDebt)}</Text>
          </View>
        </View>

        {/* 5. Legal Disclaimer */}
        <View style={styles.warningBox}>
          <Text style={styles.warningText}>
            Bu belge güncel cari hesap durum bilgilendirmesi amacıyla oluşturulmuştur.
          </Text>
          <Text style={styles.warningBold}>RESMİ FATURA / E-ARŞİV FATURA YERİNE GEÇMEZ.</Text>
        </View>

        {/* 6. Footer */}
        <View style={styles.footer}>
          <Text>📍 {businessTitle}</Text>
          <Text>🌐 www.petoptan.com</Text>
          <Text>🏷️ Toptan Güven, Hızlı Tedarik</Text>
        </View>
      </Page>
    </Document>
  );
};
