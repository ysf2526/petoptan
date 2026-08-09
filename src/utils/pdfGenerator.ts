/**
 * PDF / Document Generator & Web Share Helper
 * Handles automatic PDF file generation, downloading, and native Web Share / WhatsApp deep linking.
 */

/**
 * Downloads a Blob/File directly to the user's computer/phone memory.
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
 * Generates an A4 HTML/Printable Document File from an HTML Element.
 * Creates a clean, self-contained HTML/PDF document Blob for offline viewing & sharing.
 */
export function createDocumentFileFromElement(element: HTMLElement, filename: string): File {
  const elementHtml = element.innerHTML;
  
  const fullDocumentHtml = `<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${filename}</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      background-color: #ffffff;
      color: #000000;
      margin: 0;
      padding: 20px;
      -webkit-print-color-adjust: exact;
    }
    .print-container {
      max-width: 800px;
      margin: 0 auto;
      background: #ffffff;
      padding: 30px;
      border: 1px solid #e2e8f0;
      border-radius: 12px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
    }
    th, td {
      padding: 8px 12px;
      border-bottom: 1px solid #e2e8f0;
    }
    @media print {
      body { padding: 0; }
      .print-container { border: none; padding: 0; max-width: 100%; }
    }
  </style>
</head>
<body>
  <div className="print-container">
    ${elementHtml}
  </div>
</body>
</html>`;

  const blob = new Blob([fullDocumentHtml], { type: 'text/html;charset=utf-8' });
  return new File([blob], filename, { type: 'text/html;charset=utf-8' });
}

/**
 * Attempts to share document via native Web Share API (Mobile Safari/Chrome)
 * If unsupported (Desktop Chrome), falls back to downloading the file + opening WhatsApp Web deep link.
 */
export async function shareOrDownloadWhatsAppDocument(
  element: HTMLElement | null,
  phone: string,
  messageText: string,
  documentFilename: string
): Promise<{ method: 'native_share' | 'whatsapp_web_download' }> {
  // 1. If element exists, create document file
  let docFile: File | null = null;
  if (element) {
    docFile = createDocumentFileFromElement(element, documentFilename);
    // Always trigger download so file is immediately available in Downloads folder
    downloadFile(docFile, documentFilename);
  }

  // 2. Check if native Web Share API with files is supported (iOS Safari / Android Chrome)
  const nav = navigator as any;
  if (docFile && nav.share && nav.canShare && nav.canShare({ files: [docFile] })) {
    try {
      await nav.share({
        title: documentFilename,
        text: messageText,
        files: [docFile],
      });
      return { method: 'native_share' };
    } catch (err: any) {
      if (err.name === 'AbortError') {
        return { method: 'native_share' };
      }
      console.warn('Native share failed, falling back to WhatsApp Web link:', err);
    }
  }

  // 3. Desktop / Web fallback: WhatsApp Web link with prefilled message
  const digits = phone.replace(/\D/g, '');
  const encodedText = encodeURIComponent(messageText);
  const url = `https://wa.me/${digits}?text=${encodedText}`;
  window.open(url, '_blank');

  return { method: 'whatsapp_web_download' };
}
