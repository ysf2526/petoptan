import React from 'react';
import { pdf } from '@react-pdf/renderer';
import { supabase } from '@/lib/supabase';
import { Product, Profile } from '@/types/database.types';
import { CatalogDocumentPdf } from '@/lib/pdf/CatalogDocumentPdf';
import { formatDate } from '@/utils/formatters';

export const catalogPdfService = {
  /**
   * Fetches fresh profile and catalog products, groups them by category,
   * and renders a native vector PDF Blob using @react-pdf/renderer.
   */
  async generateCatalogPdfBlob(): Promise<{ blob: Blob; filename: string; profile: Profile | null; totalProducts: number }> {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData?.user) throw new Error('Oturum açılmamış.');

    // 1. Fetch Profile
    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userData.user.id)
      .single();

    // 2. Fetch Catalog Products (show_in_catalog = true, active = true)
    const { data: productsData, error } = await supabase
      .from('products')
      .select('*')
      .eq('active', true)
      .eq('show_in_catalog', true)
      .is('deleted_at', null)
      .order('category', { ascending: true })
      .order('product_name', { ascending: true });

    if (error) {
      console.error('Error fetching catalog products:', error);
      throw new Error('Katalog ürünleri yüklenirken veritabanı hatası oluştu.');
    }

    const products = productsData || [];
    if (products.length === 0) {
      throw new Error('Katalogda gösterilmek üzere işaretlenmiş ürün bulunamadı. Lütfen Ürünler ekranından ürünleri katalogda gösterecek şekilde ayarlayın.');
    }

    // 3. Group by Category
    const productsByCategory: Record<string, Product[]> = {};
    products.forEach((p) => {
      const cat = p.category?.trim() || 'Genel Ürünler';
      if (!productsByCategory[cat]) {
        productsByCategory[cat] = [];
      }
      productsByCategory[cat].push(p);
    });

    const generatedDate = formatDate(new Date().toISOString());

    // 4. Render PDF Document Blob
    const docElement = (
      <CatalogDocumentPdf
        profile={profile}
        productsByCategory={productsByCategory}
        generatedDate={generatedDate}
      />
    );

    const pdfInstance = pdf(docElement);
    const blob = await pdfInstance.toBlob();

    // Clean Filename
    const cleanBusinessName = (profile?.business_name || 'PetOptan')
      .replace(/[^a-zA-Z0-9çğıöşüÇĞİÖŞÜ_]/g, '_')
      .replace(/_+/g, '_');
    const filename = `${cleanBusinessName}_Toptan_Urun_Katalogu.pdf`;

    return { blob, filename, profile, totalProducts: products.length };
  },

  /**
   * Downloads the compiled PDF directly to device.
   */
  async downloadCatalogPdf(): Promise<void> {
    const { blob, filename } = await this.generateCatalogPdfBlob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  },
};
