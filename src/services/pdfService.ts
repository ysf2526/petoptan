import React from 'react';
import { pdf } from '@react-pdf/renderer';
import { Sale, SaleItem, PaymentSchedule, Customer, Profile } from '@/types/database.types';
import { SalesDocumentPdf } from '@/lib/pdf/SalesDocumentPdf';

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
 */
export async function generateSalesPdfFile(
  sale: Sale,
  items: SaleItem[],
  schedules: PaymentSchedule[],
  customer: Customer | null,
  profile: Profile | null
): Promise<File> {
  const filename = `Satis_Belgesi_${sale.sale_number}.pdf`;

  // Render React PDF component tree into PDF blob
  const pdfInstance = pdf(
    <SalesDocumentPdf
      sale={sale}
      items={items}
      schedules={schedules}
      customer={customer}
      profile={profile}
    />
  );

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
  // Generate genuine PDF file
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
