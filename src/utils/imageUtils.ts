/**
 * Image Processing and Compression Utility for Mobile Camera & Gallery Uploads
 */

export interface ProcessedImageResult {
  file: File;
  previewUrl: string;
}

/**
 * Resizes and compresses high-resolution camera/gallery images before uploading to Supabase Storage
 * Target: Max width/height 1024px, JPEG/WebP format, ~200-400KB size
 */
export async function compressAndProcessImage(
  inputFile: File,
  maxWidth = 1024,
  maxHeight = 1024,
  quality = 0.82
): Promise<ProcessedImageResult> {
  // Check file type
  const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
  if (!validTypes.includes(inputFile.type.toLowerCase())) {
    throw new Error('Lütfen geçerli bir görsel dosyası seçin (JPG, PNG veya WebP).');
  }

  // Check original size limit (10MB limit)
  if (inputFile.size > 10 * 1024 * 1024) {
    throw new Error('Seçilen fotoğraf çok büyük (Maksimum 10MB olmalıdır).');
  }

  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(inputFile);

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);

      let width = img.width;
      let height = img.height;

      // Calculate new dimensions respecting aspect ratio
      if (width > maxWidth || height > maxHeight) {
        if (width > height) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        } else {
          width = Math.round((width * maxHeight) / height);
          height = maxHeight;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Görsel işleme tuvali (canvas) başlatılamadı.'));
        return;
      }

      // Draw image onto canvas
      ctx.drawImage(img, 0, 0, width, height);

      // Convert canvas to WebP or JPEG blob
      const outputType = inputFile.type === 'image/png' ? 'image/png' : 'image/jpeg';
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error('Görsel sıkıştırma işlemi başarısız oldu.'));
            return;
          }

          const fileName = inputFile.name.replace(/\.[^/.]+$/, '') + '.jpg';
          const compressedFile = new File([blob], fileName, {
            type: outputType,
            lastModified: Date.now(),
          });

          const previewUrl = URL.createObjectURL(compressedFile);
          resolve({ file: compressedFile, previewUrl });
        },
        outputType,
        quality
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Görsel dosyası okunamadı veya bozuk.'));
    };

    img.src = objectUrl;
  });
}
