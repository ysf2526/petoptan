import React from 'react';
import { pdf } from '@react-pdf/renderer';
import { supabase } from '@/lib/supabase';
import { Sale, SaleItem, PaymentSchedule, Customer, Profile } from '@/types/database.types';
import { SalesDocumentPdf } from '@/lib/pdf/SalesDocumentPdf';
import { calculateNetCustomerDebt } from '@/services/consolidatedPaymentPlanService';

/**
 * Native PDF Generator Service using @react-pdf/renderer
 * Compiles 100% native vector single-page A4 PDFs in binary format (application/pdf).
 */

/**
 * Downloads a File or Blob directly to the user's computer or mobile device downloads.
 */
export function downloadPdfFile(file: File | Blob, filename: string) {
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Generates a native vector PDF File for a Sale Document with Clean Financial Summary.
 */
export async function generateSalesPdfFile(
  sale: Sale,
  items: SaleItem[],
  schedules: PaymentSchedule[],
  customer: Customer | null,
  profile: Profile | null
): Promise<File> {
  const customerId = sale.customer_id;

  // 1. Fetch fresh customer sales
  const { data: salesData } = await supabase
    .from('sales')
    .select('*')
    .eq('customer_id', customerId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false });

  // 2. Fetch fresh customer ledger
  const { data: lData } = await supabase
    .from('customer_ledger')
    .select('*')
    .eq('customer_id', customerId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false });

  // 3. Compute net total debt & previous balance
  const { netTotalDebt, previousBalance, currentSaleAmount, paymentMade } = calculateNetCustomerDebt({
    ledgerEntries: lData || [],
    salesList: salesData || [],
    currentSale: sale,
  });

  const pdfDoc = (
    <SalesDocumentPdf
      sale={sale}
      items={items}
      customer={customer}
      profile={profile}
      previousBalance={previousBalance}
      currentSaleAmount={currentSaleAmount}
      paymentMade={paymentMade}
      netTotalDebt={netTotalDebt}
    />
  );

  const blob = await pdf(pdfDoc).toBlob();
  const fileName = `Satis_Cari_${sale.sale_number}_${new Date().toISOString().slice(0, 10)}.pdf`;

  return new File([blob], fileName, { type: 'application/pdf' });
}

/**
 * Generates PDF File, downloads it to user's device AND triggers Web Share / WhatsApp Web dispatch.
 */
export async function shareOrDownloadSalesPdf(
  sale: Sale,
  items: SaleItem[],
  schedules: PaymentSchedule[],
  customer: Customer | null,
  profile: Profile | null,
  phoneFormatted: string,
  messageText: string
): Promise<{ pdfFile: File; method: 'web_share' | 'whatsapp_web_download' }> {
  const pdfFile = await generateSalesPdfFile(sale, items, schedules, customer, profile);

  // Always trigger direct device download
  downloadPdfFile(pdfFile, pdfFile.name);

  // Try Web Share API with File
  if (navigator.share && navigator.canShare && navigator.canShare({ files: [pdfFile] })) {
    try {
      await navigator.share({
        title: `Satış Belgesi - ${sale.sale_number}`,
        text: messageText,
        files: [pdfFile],
      });
      return { pdfFile, method: 'web_share' };
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        console.warn('Web Share failed, fallback to WhatsApp Web download mode:', err);
      }
    }
  }

  // Fallback: WhatsApp Web with text and file downloaded
  const encodedText = encodeURIComponent(messageText);
  const cleanPhone = phoneFormatted.replace(/\D/g, '');
  const waUrl = `https://web.whatsapp.com/send?phone=${cleanPhone}&text=${encodedText}`;
  window.open(waUrl, '_blank');

  return { pdfFile, method: 'whatsapp_web_download' };
}
