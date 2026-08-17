import React from 'react';
import { X, Package, ClipboardList, Eye, EyeOff, ImageIcon, Tag, Truck, Barcode, DollarSign } from 'lucide-react';
import { Product } from '@/types/database.types';
import { formatCurrency, formatNumber } from '@/utils/formatters';

interface ProductDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  product: Product;
  openDemandQty?: number;
}

export const ProductDetailModal: React.FC<ProductDetailModalProps> = ({
  isOpen,
  onClose,
  product,
  openDemandQty = 0,
}) => {
  if (!isOpen || !product) return null;

  const isPreOrder = product.product_type === 'pre_order';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-150">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-slate-900">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-brand-600/20 border border-brand-500/30 flex items-center justify-center text-brand-400">
              {isPreOrder ? <ClipboardList className="w-5 h-5" /> : <Package className="w-5 h-5" />}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-white text-base">{product.product_name}</h3>
                <span
                  className={`px-2 py-0.5 rounded text-[10px] font-extrabold border ${
                    isPreOrder
                      ? 'bg-amber-950/80 text-amber-300 border-amber-800/60'
                      : 'bg-emerald-950/80 text-emerald-300 border-emerald-800/60'
                  }`}
                >
                  {isPreOrder ? '📋 ÖN SİPARİŞ ÜRÜNÜ' : '📦 STOK ÜRÜNÜ'}
                </span>
              </div>
              <p className="text-xs text-slate-400">Ürün Kartı & Detaylı İnceleme</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-5 custom-scrollbar">
          {/* Large Image Showcase */}
          <div className="w-full h-64 rounded-2xl bg-slate-950 border border-slate-800 overflow-hidden flex items-center justify-center p-3">
            {product.image_url ? (
              <img
                src={product.image_url}
                alt={product.product_name}
                className="w-full h-full object-contain"
              />
            ) : (
              <div className="flex flex-col items-center gap-2 text-slate-600">
                <ImageIcon className="w-12 h-12" />
                <span className="text-xs font-semibold">Fotoğraf Yüklenmemiş</span>
              </div>
            )}
          </div>

          {/* Description if available */}
          {product.description && (
            <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                Açıklama / Detaylar
              </span>
              <p className="text-xs text-slate-200 leading-relaxed">{product.description}</p>
            </div>
          )}

          {/* Core Info Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
            <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
              <span className="text-slate-500 font-semibold block mb-1">Marka</span>
              <span className="font-bold text-white truncate block">{product.brand || 'Markasız'}</span>
            </div>

            <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
              <span className="text-slate-500 font-semibold block mb-1">Kategori</span>
              <span className="font-bold text-white truncate block">{product.category || 'Kategorisiz'}</span>
            </div>

            <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
              <span className="text-slate-500 font-semibold block mb-1">Barkod</span>
              <span className="font-mono font-bold text-slate-300 truncate block">{product.barcode || '-'}</span>
            </div>

            <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
              <span className="text-slate-500 font-semibold block mb-1">Mevcut Stok</span>
              <span className="font-extrabold text-emerald-400 text-sm block">
                {formatNumber(product.current_stock)} {product.unit}
              </span>
            </div>

            <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
              <span className="text-slate-500 font-semibold block mb-1">Açık Ön Sipariş</span>
              <span className="font-extrabold text-amber-400 text-sm block">
                {formatNumber(openDemandQty)} {product.unit}
              </span>
            </div>

            <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
              <span className="text-slate-500 font-semibold block mb-1">PDF Katalog</span>
              {product.show_in_catalog !== false ? (
                <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-400 mt-0.5">
                  <Eye className="w-3.5 h-3.5" /> PDF'te Açık
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-500 mt-0.5">
                  <EyeOff className="w-3.5 h-3.5" /> PDF'te Gizli
                </span>
              )}
            </div>
          </div>

          {/* Internal Business Financial Info (Enterprise Isolated) */}
          <div className="p-4 bg-slate-950 border border-slate-800 rounded-2xl space-y-3">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block border-b border-slate-800/80 pb-2">
              🔒 İşletme İçi Ticari & Finansal Bilgiler
            </span>

            <div className="grid grid-cols-2 gap-4 text-xs">
              <div>
                <span className="text-slate-500 block mb-0.5">Tedarikçi Firma</span>
                <span className="font-bold text-slate-200">{product.supplier || 'Belirlenmedi'}</span>
              </div>

              <div>
                <span className="text-slate-500 block mb-0.5">Alış Fiyatı</span>
                <span className="font-bold text-slate-200">
                  {product.purchase_price > 0 ? formatCurrency(product.purchase_price) : 'Belirlenmedi'}
                </span>
              </div>

              <div>
                <span className="text-slate-500 block mb-0.5">Satış Fiyatı</span>
                <span className="font-extrabold text-white text-sm">
                  {product.sale_price > 0 ? formatCurrency(product.sale_price) : 'Belirlenmedi'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-950 border-t border-slate-800 flex justify-end">
          <button
            onClick={onClose}
            className="py-2 px-5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs transition-colors"
          >
            Kapat
          </button>
        </div>
      </div>
    </div>
  );
};
