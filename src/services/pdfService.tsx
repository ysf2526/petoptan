import React from 'react';
import { pdf } from '@react-pdf/renderer';
import { supabase } from '@/lib/supabase';
import { Sale, SaleItem, PaymentSchedule, Customer, Profile } from '@/types/database.types';
import { SalesDocumentPdf } from '@/lib/pdf/SalesDocumentPdf';
import { buildConsolidatedPaymentPlan } from '@/services/consolidatedPaymentPlanService';

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
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

/**
 * Compiles a Sales Document into a genuine PDF binary File object (application/pdf).
 * Fetches fresh DB customer balance & consolidated payment plan before compiling PDF.
 */
export async function generateSalesPdfFile(
  sale: Sale,
  items: SaleItem[],
  schedules: PaymentSchedule[],
  customer: Customer | null,
  profile: Profile | null
): Promise<File> {
  const customerId = sale.customer_id;

  // 1. Fetch fresh customer ledger balance directly from DB to avoid state cache bugs
  const { data: lData } = await supabase
    .from('customer_ledger')
    .select('balance')
    .eq('customer_id', customerId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(1);

  const netTotalDebt = lData?.[0]?.balance !== undefined ? Number(lData[0].balance) : Number(sale.remaining_debt || 0);

  // 2. Fetch fresh customer sales and payment schedules for consolidated plan
  const { data: salesData } = await supabase
    .from('sales')
    .select('*')
    .eq('customer_id', customerId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false });

  const { data: schedulesData } = await supabase
    .from('payment_schedules')
    .select('*')
    .eq('customer_id', customerId)
    .is('deleted_at', null)
    .order('due_date', { ascending: true });

  // 3. Compute accurate financial metrics
  const currentSaleAmount = Number(sale.total_amount || 0);
  const paymentMade = sale.payment_type === 'pesin' ? currentSaleAmount : Number(sale.paid_amount || 0);
  const previousBalance = Math.max(0, netTotalDebt - currentSaleAmount + paymentMade);

  // 4. Generate consolidated payment plan over netTotalDebt
  const plan = buildConsolidatedPaymentPlan(
    customer,
    netTotalDebt,
    (salesData as Sale[]) || [],
    (schedulesData as PaymentSchedule[]) || [],
    customer?.weekly_payment_target
  );

  const filename = `Satis_Belgesi_${sale.sale_number}.pdf`;

  // Render React PDF component tree into PDF blob using React.createElement
  const element = React.createElement(SalesDocumentPdf, {
    sale,
    items,
    customer,
    profile,
    previousBalance,
    currentSaleAmount,
    paymentMade,
    netTotalDebt,
    consolidatedInstallments: plan.installments,
  });

  const pdfInstance = pdf(element as any);
  const pdfBlob = await pdfInstance.toBlob();

  // Create genuine File with application/pdf MIME type
  const pdfFile = new File([pdfBlob], filename, { type: 'application/pdf' });

  // Runtime validation
  if (pdfFile.type !== 'application/pdf' || !pdfFile.name.endsWith('.pdf')) {
    throw new Error('Belge PDF (application/pdf) olarak oluşturulamadı.');
  }

  return pdfFile;
}

/**
 * Downloads and Shares genuine PDF file via native Web Share API or WhatsApp link.
 */
export async function shareOrDownloadSalesPdf(
  sale: Sale,
  items: SaleItem[],
  schedules: PaymentSchedule[],
  customer: Customer | null,
  profile: Profile | null,
  phone: string,
  messageText: string
): Promise<{ method: 'native_share' | 'whatsapp_web_download'; pdfFile: File }> {
  // Generate genuine PDF file with fresh DB data
  const pdfFile = await generateSalesPdfFile(sale, items, schedules, customer, profile);

  // Always trigger direct download of the PDF file
  downloadPdfFile(pdfFile, pdfFile.name);

  // Attempt native Web Share API with files (iOS Safari / Android Chrome)
  const nav = navigator as any;
  if (nav.share && nav.canShare && nav.canShare({ files: [pdfFile] })) {
    try {
      await nav.share({
        title: pdfFile.name,
        text: messageText,
        files: [pdfFile],
      });
      return { method: 'native_share', pdfFile };
    } catch (err: any) {
      if (err.name === 'AbortError') {
        return { method: 'native_share', pdfFile };
      }
      console.warn('Native PDF share failed, falling back to WhatsApp Web link:', err);
    }
  }

  // Web Fallback: WhatsApp Web link
  const digits = phone.replace(/\D/g, '');
  const encodedText = encodeURIComponent(messageText);
  const url = `https://wa.me/${digits}?text=${encodedText}`;
  window.open(url, '_blank');

  return { method: 'whatsapp_web_download', pdfFile };
}
