import { supabase } from '@/lib/supabase';
import { PublicCatalogProduct, Product } from '@/types/database.types';

export interface PublicPreOrderItemInput {
  product_id: string;
  quantity: number;
}

export const catalogService = {
  /**
   * Fetches public catalog products using the secure public_catalog_products VIEW.
   * Excludes purchase_price, supplier_id, and numeric current_stock.
   */
  async getPublicCatalog(slug: string): Promise<{
    businessName: string;
    businessPhone: string | null;
    businessAddress: string | null;
    products: PublicCatalogProduct[];
  }> {
    if (!slug) throw new Error('Geçersiz katalog adresi.');

    // Query secure public_catalog_products view
    const { data, error } = await supabase
      .from('public_catalog_products')
      .select('*')
      .or(`public_catalog_slug.eq.${slug},owner_id.eq.${slug}`);

    if (error) {
      console.error('getPublicCatalog error:', error);
      throw new Error('Katalog ürünleri yüklenirken hata oluştu.');
    }

    if (!data || data.length === 0) {
      // Check if profile exists even if no products
      const { data: profData } = await supabase
        .from('profiles')
        .select('business_name, phone, address')
        .or(`public_catalog_slug.eq.${slug},id.eq.${slug}`)
        .maybeSingle();

      return {
        businessName: profData?.business_name || 'Petshop Toptan Kataloğu',
        businessPhone: profData?.phone || null,
        businessAddress: profData?.address || null,
        products: [],
      };
    }

    const first = data[0];
    return {
      businessName: first.business_name || 'Petshop Toptan Kataloğu',
      businessPhone: first.business_phone || null,
      businessAddress: first.business_address || null,
      products: data as PublicCatalogProduct[],
    };
  },

  /**
   * Calls secure server-side RPC submit_public_pre_order.
   * Performs server-side phone matching & item ownership/stock validation.
   */
  async submitPublicPreOrder(
    slug: string,
    customerName: string,
    customerPhone: string,
    items: PublicPreOrderItemInput[],
    notes?: string
  ): Promise<{ success: boolean; order_number: string; estimated_total: number }> {
    const { data, error } = await supabase.rpc('submit_public_pre_order', {
      p_slug: slug,
      p_customer_name: customerName,
      p_customer_phone: customerPhone,
      p_items: items,
      p_notes: notes || null,
    });

    if (error) {
      console.error('submitPublicPreOrder error:', error);
      throw new Error(error.message || 'Ön sipariş gönderilirken sunucu hatası oluştu.');
    }

    if (!data || !data.success) {
      throw new Error('Ön sipariş oluşturulamadı.');
    }

    return data;
  },

  /**
   * Uploads product image to Supabase Storage 'product-images' bucket.
   * Returns public URL of the uploaded image.
   */
  async uploadProductImage(file: File, productId: string): Promise<string> {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData?.user) throw new Error('Oturum açmış kullanıcı bulunamadı.');

    const fileExt = file.name.split('.').pop() || 'jpg';
    const filePath = `${userData.user.id}/${productId}_${Date.now()}.${fileExt}`;

    const { error: uploadError } = await supabase.storage
      .from('product-images')
      .upload(filePath, file, { upsert: true });

    if (uploadError) {
      console.error('Image upload error:', uploadError);
      // Fallback: convert file to Base64 data URL if storage bucket is not configured
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.readAsDataURL(file);
      });
    }

    const { data: publicUrlData } = supabase.storage
      .from('product-images')
      .getPublicUrl(filePath);

    return publicUrlData.publicUrl;
  },

  /**
   * Fetches or generates owner's public catalog slug.
   */
  async getOwnerCatalogSlug(): Promise<string> {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData?.user) throw new Error('Oturum açılmamış.');

    const { data: profile } = await supabase
      .from('profiles')
      .select('public_catalog_slug')
      .eq('id', userData.user.id)
      .single();

    if (profile?.public_catalog_slug) {
      return profile.public_catalog_slug;
    }

    const defaultSlug = `petoptan-${userData.user.id.substring(0, 8)}`;
    await supabase
      .from('profiles')
      .update({ public_catalog_slug: defaultSlug })
      .eq('id', userData.user.id);

    return defaultSlug;
  },
};
