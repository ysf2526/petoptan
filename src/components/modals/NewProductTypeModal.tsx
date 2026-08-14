import React from 'react';
import { X, Package, ClipboardList } from 'lucide-react';
import { ProductType } from '@/types/database.types';

interface NewProductTypeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectType: (type: ProductType) => void;
}

export const NewProductTypeModal: React.FC<NewProductTypeModalProps> = ({
  isOpen,
  onClose,
  onSelectType,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="p-6 border-b border-slate-800 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-white tracking-tight">Ne Tür Ürün Eklemek İstiyorsunuz?</h2>
            <p className="text-xs text-slate-400 mt-0.5">Eklemek istediğiniz ürün kategorisini seçiniz</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Options Grid */}
        <div className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Option 1: STOK ÜRÜNÜ */}
          <button
            onClick={() => onSelectType('stock')}
            className="flex flex-col text-left p-5 rounded-2xl bg-slate-950 border border-slate-800 hover:border-brand-500/60 hover:bg-slate-800/60 transition-all group shadow-lg active:scale-98"
          >
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-brand-600 to-brand-400 flex items-center justify-center text-white font-bold text-xl mb-4 group-hover:scale-110 transition-transform shadow-lg shadow-brand-500/20">
              <Package className="w-6 h-6" />
            </div>

            <span className="font-extrabold text-white text-base tracking-tight mb-1 flex items-center gap-2">
              📦 STOK ÜRÜNÜ
            </span>
            <p className="text-xs text-slate-400 leading-relaxed">
              Deponuzda bulunan veya normal stok takibinde kullanılacak standart ürün kartı.
            </p>
          </button>

          {/* Option 2: ÖN SİPARİŞ ÜRÜNÜ */}
          <button
            onClick={() => onSelectType('pre_order')}
            className="flex flex-col text-left p-5 rounded-2xl bg-slate-950 border border-amber-900/50 hover:border-amber-500/60 hover:bg-amber-950/20 transition-all group shadow-lg active:scale-98"
          >
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-amber-600 to-amber-400 flex items-center justify-center text-white font-bold text-xl mb-4 group-hover:scale-110 transition-transform shadow-lg shadow-amber-500/20">
              <ClipboardList className="w-6 h-6" />
            </div>

            <span className="font-extrabold text-amber-300 text-base tracking-tight mb-1 flex items-center gap-2">
              📋 ÖN SİPARİŞ ÜRÜNÜ
            </span>
            <p className="text-xs text-slate-400 leading-relaxed">
              Henüz depoda bulunmayan, petshoplardan talep ve ön sipariş toplamak amacıyla açılan ürün.
            </p>
          </button>
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-950/50 border-t border-slate-800 text-center">
          <p className="text-xs text-slate-500">
            💡 Ön sipariş ürünleri depoya girdiğinde otomatik olarak stoklu ürüne dönüşür.
          </p>
        </div>
      </div>
    </div>
  );
};
