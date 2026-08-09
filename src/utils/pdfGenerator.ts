import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';

/**
 * Strict Single-Page PDF / Document Generator & Web Share Helper
 * Generates REAL binary PDF files (application/pdf) strictly fitted to 1 Single A4 Page.
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
 * STRICTLY FITTED TO 1 SINGLE A4 PAGE (210mm x 297mm).
 */
export async function createPdfFileFromElement(element: HTMLElement, filename: string): Promise<File> {
  const baseFilename = filename.replace(/\.(html|pdf)$/i, '');
  const pdfFilename = `${baseFilename}.pdf`;

  // 1. Render DOM element to high-res canvas
  const canvas = await html2canvas(element, {
    scale: 2, // High resolution for crisp text rendering
    useCORS: true,
    logging: false,
    backgroundColor: '#020617', // Match dark theme background
  });

  const imgData = canvas.toDataURL('image/jpeg', 0.95);

  // 2. Create A4 jsPDF instance (210mm x 297mm)
  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pdfWidth = pdf.internal.pageSize.getWidth(); // 210 mm
  const pdfHeight = pdf.internal.pageSize.getHeight(); // 297 mm

  let imgWidth = pdfWidth;
  let imgHeight = (canvas.height * pdfWidth) / canvas.width;

  // FIT TO 1 SINGLE A4 PAGE GUARANTEE:
  // If image height exceeds A4 height (297 mm), scale down proportionally so it fits on EXACTLY 1 page!
  if (imgHeight > pdfHeight) {
    const scaleFactor = pdfHeight / imgHeight;
    imgHeight = pdfHeight;
    imgWidth = pdfWidth * scaleFactor;
  }

  // Center horizontally if scaled down
  const xOffset = (pdfWidth - imgWidth) / 2;

  pdf.addImage(imgData, 'JPEG', xOffset, 0, imgWidth, imgHeight);

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
 * Attempts to share genuine 1-page PDF document via native Web Share API (Mobile Safari/Chrome)
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

  // Generate genuine single-page PDF file
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
