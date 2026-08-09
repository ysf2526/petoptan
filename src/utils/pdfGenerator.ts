import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';

/**
 * Full A4 Width PDF Generator & Web Share Helper
 * Generates REAL binary PDF files (application/pdf) covering 100% of standard A4 page dimensions (210mm x 297mm).
 */

/**
 * Downloads a File or Blob directly to the user's computer or mobile device downloads.
 */
export function downloadFile(file: File | Blob, filename: string) {
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
 * Renders an HTML Element into a genuine PDF Binary File (application/pdf)
 * Filling 100% of the A4 page (210mm x 297mm) with zero side white margins (pillarboxing).
 */
export async function createPdfFileFromElement(element: HTMLElement, filename: string): Promise<File> {
  const baseFilename = filename.replace(/\.(html|pdf)$/i, '');
  const pdfFilename = `${baseFilename}.pdf`;

  // 1. Render DOM element to crisp high-res canvas
  const canvas = await html2canvas(element, {
    scale: 2, // High resolution for crisp text rendering
    useCORS: true,
    logging: false,
    backgroundColor: '#ffffff', // Clean white background
  });

  const imgData = canvas.toDataURL('image/jpeg', 0.98);

  // 2. Create standard A4 jsPDF instance (210mm x 297mm)
  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pdfWidth = pdf.internal.pageSize.getWidth(); // 210 mm
  const pdfHeight = pdf.internal.pageSize.getHeight(); // 297 mm

  // Stretch 100% to A4 page dimensions without side margins
  pdf.addImage(imgData, 'JPEG', 0, 0, pdfWidth, pdfHeight);

  // 3. Output genuine PDF ArrayBuffer & Blob
  const pdfArrayBuffer = pdf.output('arraybuffer');
  const pdfBlob = new Blob([pdfArrayBuffer], { type: 'application/pdf' });

  // 4. Wrap into File object with MIME application/pdf
  const pdfFile = new File([pdfBlob], pdfFilename, { type: 'application/pdf' });

  // Runtime Validation
  if (pdfFile.type !== 'application/pdf' || !pdfFile.name.endsWith('.pdf')) {
    throw new Error('Belge PDF (application/pdf) olarak oluşturulamadı.');
  }

  return pdfFile;
}

/**
 * Attempts to share genuine PDF document via native Web Share API (Mobile Safari/Chrome)
 * If unsupported (Desktop Chrome), falls back to downloading the PDF file + opening WhatsApp Web deep link.
 */
export async function shareOrDownloadWhatsAppDocument(
  element: HTMLElement | null,
  phone: string,
  messageText: string,
  documentFilename: string
): Promise<{ method: 'native_share' | 'whatsapp_web_download'; pdfFile: File }> {
  if (!element) {
    throw new Error('PDF render edilmek üzere belge elemanı bulunamadı.');
  }

  // Generate genuine PDF file
  const pdfFile = await createPdfFileFromElement(element, documentFilename);

  // Runtime check
  if (pdfFile.type !== 'application/pdf' || !pdfFile.name.endsWith('.pdf')) {
    throw new Error('Belge PDF olarak oluşturulamadı.');
  }

  // Always trigger direct download of the PDF file
  downloadFile(pdfFile, pdfFile.name);

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
