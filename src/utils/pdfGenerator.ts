/**
 * Mobile-First PDF / HTML Document Generator & Web Share Helper
 * Optimized for mobile phone screens (375px - 430px viewports) when opened via WhatsApp.
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
 * Generates a stand-alone Mobile-First HTML/Printable Document File from an HTML Element.
 * Embeds styling & UTF-8 encoding for 100% Turkish character accuracy on all phone screens.
 */
export function createDocumentFileFromElement(element: HTMLElement, filename: string): File {
  const elementHtml = element.innerHTML;

  const fullDocumentHtml = `<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>${filename}</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');
    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background-color: #020617;
      color: #f8fafc;
      margin: 0;
      padding: 12px;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .mobile-doc-wrapper {
      max-width: 600px;
      margin: 0 auto;
      width: 100%;
    }
    @media print {
      body {
        background-color: #ffffff !important;
        color: #000000 !important;
        padding: 0 !important;
      }
      .mobile-doc-wrapper {
        max-width: 100% !important;
      }
    }
  </style>
</head>
<body>
  <div class="mobile-doc-wrapper">
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
  let docFile: File | null = null;
  if (element) {
    docFile = createDocumentFileFromElement(element, documentFilename);
    downloadFile(docFile, documentFilename);
  }

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

  const digits = phone.replace(/\D/g, '');
  const encodedText = encodeURIComponent(messageText);
  const url = `https://wa.me/${digits}?text=${encodedText}`;
  window.open(url, '_blank');

  return { method: 'whatsapp_web_download' };
}
