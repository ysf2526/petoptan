import React, { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/context/ToastContext';
import { parseErrorMessage } from '@/utils/errors';
import { formatCurrency, formatDateTime, formatNumber } from '@/utils/formatters';
import { Product, StockMovement, MovementType } from '@/types/database.types';
import {
  X,
  Boxes,
  Loader2,
  Plus,
  ArrowUpRight,
  ArrowDownLeft,
  Calendar,
  Barcode,
  Tag,
  AlertTriangle,
  History,
  DollarSign,
  TrendingUp,
} from 'lucide-react';

interface ProductStockDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  productId: string | null;
  onOpenStockEntry?: (productId: string) => void;
}

export const ProductStockDetailModal: React.FC<ProductStockDetailModalProps> = ({
  isOpen,
  onClose,
  productId,
  onOpenStockEntry,
}) => {
  const { showError } = useToast();

  const [loading, setLoading] = useState(false);
  const [product, setProduct] = useState<Product | null>(null);
  const [movements, setMovements] = useState<StockMovement[]>([]);

  const fetchProductDetails = useCallback(async () => {
    if (!productId) return;
    setLoading(true);
    try {
      // Fetch product info
      const { data: prodData, error: prodErr } = await supabase
        .from('products')
        .select('*')
        .eq('id', productId)
        .single();

      if (prodErr) throw prodErr;
      setProduct(prodData);

      // Fetch stock movements for this product
      const { data: movData, error: movErr } = await supabase
        .from('stock_movements')
        .select('*')
        .eq('product_id', productId)
        .is('deleted_at', null)
        .order('created_at', { ascending: false });

      if (movErr) throw movErr;
      setMovements(movData || []);
    } catch (err) {
      showError(parseErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [productId, showError]);

  useEffect(() => {
    if (isOpen && productId) {
      fetchProductDetails();
    } else {
      setProduct(null);
      setMovements([]);
    }
  }, [isOpen, productId, fetchProductDetails]);

  if (!isOpen) return null;

  // Compute total in and total out
  let totalIn = 0;
  let totalOut = 0;

  movements.forEach((m) => {
    const qty = Number(m.quantity || 0);
    if (m.movement_type === 'PURCHASE' || m.movement_type === 'RETURN' || m.movement_type === 'INITIAL') {
      totalIn += qty;
    } else if (m.movement_type === 'SALE' || m.movement_type === 'DAMAGE') {
      totalOut += qty;
    } else if (m.movement_type === 'ADJUSTMENT') {
      if (qty >= 0) totalIn += qty;
      else totalOut += Math.abs(qty);
    }
  });

  const getBadgeStyle = (type: MovementType) => {
    switch (type) {
      case 'PURCHASE':
        return 'bg-emerald-950 text-emerald-300 border-emerald-800/50';
      case 'SALE':
        return 'bg-brand-950 text-brand-300 border-brand-800/50';
      case 'RETURN':
        return 'bg-purple-950 text-purple-300 border-purple-800/50';
      case 'ADJUSTMENT':
        return 'bg-indigo-950 text-indigo-300 border-indigo-800/50';
      case 'DAMAGE':
        return 'bg-rose-950 text-rose-300 border-rose-800/50';
      case 'INITIAL':
        return 'bg-sky-950 text-sky-300 border-sky-800/50';
      default:
        return 'bg-slate-800 text-slate-300 border-slate-700';
    }
  };

  const getMovementLabel = (type: MovementType) => {
    switch (type) {
      case 'PURCHASE':
        return 'Mal Girişi';
      case 'SALE':
        return 'Satış';
      case 'RETURN':
        return 'İade';
      case 'ADJUSTMENT':
        return 'Sayım Düzeltme';
      case 'DAMAGE':
        return 'Hasar / Zayiat';
      case 'INITIAL':
        return 'İlk Stok';
      default:
        return type;
    }
  };

  const stock = product ? Number(product.current_stock || 0) : 0;
  const minStock = product ? Number(product.minimum_stock || 0) : 0;
  const isOut = stock === 0;
  const isNegative = stock < 0;
  const isCritical = stock > 0 && stock <= minStock;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 font-sans">
      <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-md" onClick={onClose} />

      <div className="relative bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-3xl shadow-2xl z-10 overflow-hidden flex flex-col max-h-[92vh] my-auto">
        {/* Modal Header */}
        <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between bg-slate-900">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
              <Boxes className="w-5 h-5" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-base sm:text-lg font-bold text-white leading-tight">
                  {product?.product_name || 'Ürün Stok Detayı'}
                </h2>
                {isNegative && (
                  <span className="bg-rose-950 text-rose-400 border border-rose-800 text-[10px] font-extrabold px-2 py-0.5 rounded-full flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" /> NEGATİF STOK
                  </span>
                )}
                {isOut && (
                  <span className="bg-rose-950 text-rose-400 border border-rose-800 text-[10px] font-extrabold px-2 py-0.5 rounded-full">
                    🔴 STOK YOK
                  </span>
                )}
                {isCritical && (
                  <span className="bg-amber-950 text-amber-300 border border-amber-800 text-[10px] font-extrabold px-2 py-0.5 rounded-full flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3 text-amber-400" /> KRİTİK STOK
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                {product?.brand ? `${product.brand} ` : ''}
                {product?.category ? `• ${product.category} ` : ''}
                {product?.barcode ? `• Barkod: ${product.barcode}` : ''}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-white rounded-lg bg-slate-800">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Content */}
        {loading ? (
          <div className="p-12 text-center text-slate-400 flex flex-col items-center">
            <Loader2 className="w-8 h-8 animate-spin text-indigo-500 mb-2" />
            <span>Stok Detayları Yükleniyor...</span>
          </div>
        ) : product ? (
          <div className="p-4 sm:p-6 space-y-6 overflow-y-auto custom-scrollbar">
            {/* KPI Cards Header */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
              {/* MEVCUT STOK */}
              <div
                className={`p-4 rounded-2xl border ${
                  isNegative
                    ? 'bg-rose-950/40 border-rose-800/80 text-rose-300'
                    : isOut
                    ? 'bg-rose-950/30 border-rose-800/50 text-rose-300'
                    : isCritical
                    ? 'bg-amber-950/40 border-amber-800/80 text-amber-300'
                    : 'bg-emerald-950/30 border-emerald-800/50 text-emerald-300'
                }`}
              >
                <span className="text-[11px] font-extrabold uppercase tracking-wider block opacity-80">
                  MEVCUT STOK
                </span>
                <div className="text-2xl sm:text-3xl font-black mt-1 tracking-tight flex items-baseline gap-1">
                  <span>{formatNumber(stock)}</span>
                  <span className="text-xs font-semibold opacity-90">{product.unit || 'Adet'}</span>
                </div>
                <div className="text-[11px] mt-1 font-medium opacity-80">
                  {isNegative
                    ? '⚠️ Stok eksiye düşmüş'
                    : isOut
                    ? 'Depoda ürün tükenmiş'
                    : isCritical
                    ? `Kritik seviye (Min: ${product.minimum_stock})`
                    : `Güvenli seviye (Min: ${product.minimum_stock})`}
                </div>
              </div>

              {/* TOPLAM GİRİŞ */}
              <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800">
                <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400 block">
                  TOPLAM GİRİŞ
                </span>
                <div className="text-2xl font-extrabold text-emerald-400 mt-1 flex items-baseline gap-1">
                  <span>+{formatNumber(totalIn)}</span>
                  <span className="text-xs font-medium text-slate-400">{product.unit || 'Adet'}</span>
                </div>
                <div className="text-[11px] text-slate-400 mt-1">
                  Mal alımları ve iadeler dahil
                </div>
              </div>

              {/* TOPLAM ÇIKIŞ */}
              <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800">
                <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400 block">
                  TOPLAM ÇIKIŞ
                </span>
                <div className="text-2xl font-extrabold text-brand-400 mt-1 flex items-baseline gap-1">
                  <span>-{formatNumber(totalOut)}</span>
                  <span className="text-xs font-medium text-slate-400">{product.unit || 'Adet'}</span>
                </div>
                <div className="text-[11px] text-slate-400 mt-1">
                  Satışlar ve zaiyatlar dahil
                </div>
              </div>
            </div>

            {/* Financial Info Box */}
            <div className="bg-slate-950/70 p-4 rounded-2xl border border-slate-800/80 grid grid-cols-2 sm:grid-cols-3 gap-4 text-xs">
              <div>
                <span className="text-slate-400 block">Alış Fiyatı</span>
                <span className="text-sm font-bold text-slate-200 mt-0.5 block">
                  {formatCurrency(product.purchase_price)}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block">Satış Fiyatı</span>
                <span className="text-sm font-bold text-white mt-0.5 block">
                  {formatCurrency(product.sale_price)}
                </span>
              </div>
              <div className="col-span-2 sm:col-span-1">
                <span className="text-slate-400 block">Mevcut Stok Değeri</span>
                <span className="text-sm font-extrabold text-amber-400 mt-0.5 block">
                  {formatCurrency(Math.max(0, stock) * Number(product.purchase_price || 0))}
                </span>
              </div>
            </div>

            {/* Stock Movement History Section */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm font-bold text-white">
                  <History className="w-4 h-4 text-indigo-400" />
                  <span>Stok Hareket Geçmişi ({movements.length})</span>
                </div>
                {onOpenStockEntry && (
                  <button
                    onClick={() => {
                      onClose();
                      onOpenStockEntry(product.id);
                    }}
                    className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs px-3 py-1.5 rounded-xl flex items-center gap-1.5 transition-all shadow-md shadow-indigo-600/20"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Depoya Mal Girişi Yap</span>
                  </button>
                )}
              </div>

              {movements.length === 0 ? (
                <div className="bg-slate-950 p-6 rounded-xl border border-slate-800 text-center text-slate-500 text-xs">
                  Bu ürün için kaydedilmiş stok hareketi bulunamadı.
                </div>
              ) : (
                <div className="bg-slate-950 rounded-xl border border-slate-800 overflow-hidden">
                  <div className="overflow-x-auto max-h-72 custom-scrollbar">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-900/90 text-slate-400 uppercase tracking-wider font-semibold border-b border-slate-800 sticky top-0">
                        <tr>
                          <th className="p-3">Tarih / Saat</th>
                          <th className="p-3 text-center">İşlem Tipi</th>
                          <th className="p-3 text-center">Miktar</th>
                          <th className="p-3 text-right">Birim Alış</th>
                          <th className="p-3">Açıklama / Not</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60 text-slate-300">
                        {movements.map((m) => {
                          const isPlus =
                            m.movement_type === 'PURCHASE' ||
                            m.movement_type === 'RETURN' ||
                            m.movement_type === 'INITIAL' ||
                            (m.movement_type === 'ADJUSTMENT' && Number(m.quantity) >= 0);
                          const isMinus =
                            m.movement_type === 'SALE' ||
                            m.movement_type === 'DAMAGE' ||
                            (m.movement_type === 'ADJUSTMENT' && Number(m.quantity) < 0);

                          return (
                            <tr key={m.id} className="hover:bg-slate-900/40 transition-colors">
                              <td className="p-3 font-mono text-slate-400 text-[11px]">
                                {formatDateTime(m.created_at)}
                              </td>
                              <td className="p-3 text-center">
                                <span
                                  className={`inline-block px-2 py-0.5 rounded text-[10px] font-extrabold uppercase border ${getBadgeStyle(
                                    m.movement_type
                                  )}`}
                                >
                                  {getMovementLabel(m.movement_type)}
                                </span>
                              </td>
                              <td className="p-3 text-center font-extrabold">
                                <span
                                  className={
                                    isPlus
                                      ? 'text-emerald-400'
                                      : isMinus
                                      ? 'text-brand-400'
                                      : 'text-slate-200'
                                  }
                                >
                                  {isPlus ? '+' : isMinus ? '-' : ''}
                                  {formatNumber(m.quantity)} {product.unit || 'Adet'}
                                </span>
                              </td>
                              <td className="p-3 text-right font-medium text-slate-300">
                                {formatCurrency(m.unit_cost)}
                              </td>
                              <td className="p-3 text-slate-400 max-w-xs truncate">
                                {m.note || '-'}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
};
