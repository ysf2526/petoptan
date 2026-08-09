import React from 'react';
import { useLocation } from 'react-router-dom';
import { formatDateTime } from '@/utils/formatters';
import { Plus, Search, Calendar } from 'lucide-react';

interface HeaderProps {
  onOpenNewSale?: () => void;
  onOpenPayment?: () => void;
  onOpenStockEntry?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  onOpenNewSale,
  onOpenPayment,
  onOpenStockEntry,
}) => {
  const location = useLocation();

  const getPageTitle = (path: string) => {
    switch (path) {
      case '/':
        return 'Ana Dashboard';
      case '/sales':
        return 'Satış Geçmişi & Yönetimi';
      case '/products':
        return 'Ürün Kataloğu & Stok Kartları';
      case '/stock':
        return 'Stok Hareketleri & Depo';
      case '/customers':
        return 'Müşteri Kayıtları';
      case '/ledger':
        return 'Cari Hesap Ekstresi';
      case '/collections':
        return 'Tahsilat & Ödeme Planları';
      case '/suppliers':
        return 'Tedarikçi Yönetimi';
      case '/profit-targets':
        return 'Aylık Kâr Hedefi & Öneriler';
      case '/reports':
        return 'Ticari Raporlar & Analizler';
      case '/audit-logs':
        return 'İşlem Denetim Günlüğü (Audit Log)';
      case '/settings':
        return 'Sistem Ayarları';
      default:
        return 'Petshop Toptan Satış';
    }
  };

  return (
    <header className="bg-slate-900/80 backdrop-blur-md border-b border-slate-800 sticky top-0 z-20 px-4 lg:px-8 py-3.5 flex items-center justify-between">
      {/* Title & Today's Date */}
      <div>
        <h1 className="text-base sm:text-lg font-bold text-white tracking-tight">
          {getPageTitle(location.pathname)}
        </h1>
        <div className="hidden sm:flex items-center gap-1.5 text-xs text-slate-400 mt-0.5">
          <Calendar className="w-3.5 h-3.5 text-brand-400" />
          <span>{formatDateTime(new Date())}</span>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex items-center gap-2">
        {onOpenNewSale && (
          <button
            onClick={onOpenNewSale}
            className="bg-brand-600 hover:bg-brand-500 text-white font-semibold px-3 py-1.5 rounded-lg shadow-md shadow-brand-600/20 text-xs sm:text-sm flex items-center gap-1.5 transition-all"
          >
            <Plus className="w-4 h-4" />
            <span className="hidden xs:inline">Yeni Satış</span>
          </button>
        )}

        {onOpenPayment && (
          <button
            onClick={onOpenPayment}
            className="bg-emerald-600 hover:bg-emerald-500 text-white font-semibold px-3 py-1.5 rounded-lg shadow-md shadow-emerald-600/20 text-xs sm:text-sm flex items-center gap-1.5 transition-all"
          >
            <Plus className="w-4 h-4" />
            <span className="hidden xs:inline">Tahsilat Gir</span>
          </button>
        )}

        {onOpenStockEntry && (
          <button
            onClick={onOpenStockEntry}
            className="bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-semibold px-3 py-1.5 rounded-lg text-xs sm:text-sm flex items-center gap-1.5 transition-all"
          >
            <Plus className="w-4 h-4" />
            <span className="hidden xs:inline">Mal Girişi</span>
          </button>
        )}
      </div>
    </header>
  );
};
