import { supabase } from '@/lib/supabase';

const BUCKET_NAME = 'product-images';

export const storageService = {
  /**
   * Uploads a product image file to Supabase Storage in owner-isolated path
   */
  async uploadProductImage(file: File, userId: string, productId?: string): Promise<string> {
    const fileExt = file.name.split('.').pop() || 'jpg';
    const timestamp = Date.now();
    const cleanId = productId || Math.random().toString(36).substring(2, 9);
    const filePath = `${userId}/${cleanId}_${timestamp}.${fileExt}`;

    const { error: uploadError } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: true,
      });

    if (uploadError) {
      console.error('Supabase storage upload error:', uploadError);
      throw new Error(`Görsel yüklenemedi: ${uploadError.message}`);
    }

    const { data } = supabase.storage.from(BUCKET_NAME).getPublicUrl(filePath);
    return data.publicUrl;
  },

  /**
   * Deletes an existing product image from Supabase Storage bucket to clean up unused files
   */
  async deleteProductImage(imageUrl: string): Promise<void> {
    if (!imageUrl || !imageUrl.includes(BUCKET_NAME)) return;

    try {
      // Extract path after bucket name in publicUrl
      // e.g. https://.../storage/v1/object/public/product-images/USER_ID/PRODUCT_ID_123.jpg
      const urlParts = imageUrl.split(`${BUCKET_NAME}/`);
      if (urlParts.length < 2) return;

      const filePath = decodeURIComponent(urlParts[1]);
      const { error } = await supabase.storage.from(BUCKET_NAME).remove([filePath]);

      if (error) {
        console.warn('Storage image delete warning:', error.message);
      }
    } catch (err) {
      console.warn('Error deleting old image from storage:', err);
    }
  },
};
