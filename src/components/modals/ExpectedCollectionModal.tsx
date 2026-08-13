import React from 'react';
import { formatCurrency, formatDate } from '@/utils/formatters';
import { X, Calendar, AlertTriangle, Receipt, Phone, ArrowRight } from 'lucide-react';

export interface ExpectedCustomerItem {
  customerId: string;
  businessName: string;
  contactName?: string | null;
  phone?: string | null;
  dueAmount: number;
  dueDate: string;
  status: 'today' | 'overdue' | 'this_week';
}

interface ExpectedCollectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  items: ExpectedCustomerItem[];
  onSelectCustomerPayment: (customerId: string) => void;
}

export const ExpectedCollectionModal: React.FC<ExpectedCollectionModalProps> = ({
  isOpen,
  onClose,
  title,
  items,
  onSelectCustomerPayment,
}) => {
  if (!isOpen) return null;

  const totalAmount = items.reduce((acc, curr) => acc + curr.dueAmount, 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 font-sans">
      <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md" onClick={onClose} />

      <div className="relative bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg shadow-2xl z-10 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between bg-slate-900">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-600/20 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-white">{title}</h2>
              <p className="text-xs text-slate-400">
                Toplam {items.length} müşteri • {formatCurrency(totalAmount)}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-white rounded-lg bg-slate-800">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Customer List */}
        <div className="p-4 sm:p-5 space-y-3 overflow-y-auto custom-scrollbar max-h-[65vh]">
          {items.length === 0 ? (
            <div className="p-8 text-center text-slate-500 text-xs">
              Listelenecek beklenen ödeme kaydı bulunamadı.
            </div>
          ) : (
            items.map((item, idx) => (
              <div
                key={`${item.customerId}-${idx}`}
                className="bg-slate-950 p-4 rounded-2xl border border-slate-800/80 hover:border-slate-700 transition-all flex items-center justify-between gap-3"
              >
                <div className="space-y-1 overflow-hidden">
                  <div className="flex items-center gap-2">
                    <span className="font-extrabold text-white text-sm truncate">{item.businessName}</span>
                    {item.status === 'overdue' && (
                      <span className="text-[10px] font-extrabold text-amber-400 bg-amber-950/80 px-2 py-0.5 rounded border border-amber-800/60">
                        Gecikmiş
                      </span>
                    )}
                  </div>
                  {item.contactName && (
                    <p className="text-xs text-slate-400">{item.contactName}</p>
                  )}
                  <div className="flex items-center gap-3 text-[11px] text-slate-500 pt-0.5">
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3 h-3 text-slate-500" />
                      Vade: {formatDate(item.dueDate)}
                    </span>
                    {item.phone && (
                      <span className="flex items-center gap-1">
                        <Phone className="w-3 h-3 text-slate-500" />
                        {item.phone}
                      </span>
                    )}
                  </div>
                </div>

                <div className="text-right shrink-0 space-y-2">
                  <span className="font-extrabold text-amber-400 text-sm block">
                    {formatCurrency(item.dueAmount)}
                  </span>
                  <button
                    onClick={() => {
                      onClose();
                      onSelectCustomerPayment(item.customerId);
                    }}
                    className="py-1.5 px-3 rounded-xl font-bold text-xs bg-emerald-600 hover:bg-emerald-500 text-white shadow-md shadow-emerald-600/20 flex items-center gap-1.5 transition-all active:scale-95"
                  >
                    <Receipt className="w-3.5 h-3.5" />
                    <span>Tahsilat Al</span>
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-900">
          <button
            onClick={onClose}
            className="w-full py-2.5 px-4 rounded-xl font-bold text-xs bg-slate-950 text-slate-300 hover:text-white border border-slate-800 hover:bg-slate-800 transition-colors"
          >
            Kapat
          </button>
        </div>
      </div>
    </div>
  );
};
