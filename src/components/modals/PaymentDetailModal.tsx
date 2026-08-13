import React, { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/context/ToastContext';
import { formatCurrency, formatDateTime } from '@/utils/formatters';
import {
  normalizeTurkishPhone,
  getBusinessName,
  buildCustomerCollectionWhatsAppMessage,
  buildCustomerOffsetWhatsAppMessage,
  buildSupplierOffsetWhatsAppMessage,
  openWhatsAppWeb,
  logWhatsAppShareAttempt,
  WhatsAppAuditStatus,
} from '@/services/whatsappService';
import {
  X,
  Receipt,
  CheckCircle2,
  AlertCircle,
  MessageSquare,
  Building2,
  User,
  ArrowRightLeft,
  Calendar,
  DollarSign,
  PhoneOff,
} from 'lucide-react';

export interface PaymentDetailItem {
  id: string;
  created_at: string;
  amount: number;
  payment_method: string;
  notes?: string | null;
  customer_id: string;
  customer_name: string;
  customer_phone?: string | null;
  supplier_id?: string | null;
  supplier_name?: string | null;
  supplier_phone?: string | null;
  is_offset: boolean;
  customer_balance?: number;
  supplier_balance?: number;
  audit_status?: WhatsAppAuditStatus;
}

interface PaymentDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  payment: PaymentDetailItem | null;
  onRefresh?: () => void;
}

export const PaymentDetailModal: React.FC<PaymentDetailModalProps> = ({
  isOpen,
  onClose,
  payment,
  onRefresh,
}) => {
  const { showSuccess, showError } = useToast();
  const [waSentState, setWaSentState] = useState<{ customer: boolean; supplier: boolean }>({
    customer: false,
    supplier: false,
  });

  if (!isOpen || !payment) return null;

  const isCustSent = waSentState.customer || payment.audit_status?.customerSent || false;
  const isSupSent = waSentState.supplier || payment.audit_status?.supplierSent || false;

  const custPhoneNorm = normalizeTurkishPhone(payment.customer_phone);
  const supPhoneNorm = normalizeTurkishPhone(payment.supplier_phone);

  const handleSendCustomerWhatsApp = async () => {
    if (!custPhoneNorm.isValid) {
      showError('Bu müşterinin sistemde geçerli bir WhatsApp telefonu bulunmuyor.');
      return;
    }

    try {
      const bizName = await getBusinessName();
      const newBal = payment.customer_balance !== undefined ? payment.customer_balance : 0;
      const text = payment.is_offset
        ? buildCustomerOffsetWhatsAppMessage(payment.customer_name, bizName, payment.amount, newBal)
        : buildCustomerCollectionWhatsAppMessage(payment.customer_name, bizName, payment.amount, newBal);

      openWhatsAppWeb(payment.customer_phone!, text);

      await logWhatsAppShareAttempt('payments', payment.id, custPhoneNorm.normalized, {
        target: 'customer',
        customer_name: payment.customer_name,
        amount: payment.amount,
      });

      setWaSentState((prev) => ({ ...prev, customer: true }));
      showSuccess('Müşteri için WhatsApp mesajı hazırlandı ve açıldı.');
      if (onRefresh) onRefresh();
    } catch (err: any) {
      showError(err.message || 'WhatsApp açılırken hata oluştu.');
    }
  };

  const handleSendSupplierWhatsApp = async () => {
    if (!payment.supplier_name) return;
    if (!supPhoneNorm.isValid) {
      showError('Bu tedarikçinin sistemde geçerli bir WhatsApp telefonu bulunmuyor.');
      return;
    }

    try {
      const newBal = payment.supplier_balance !== undefined ? payment.supplier_balance : 0;
      // STRICT PRIVACY GUARANTEE: customerName is NEVER passed to supplier message!
      const text = buildSupplierOffsetWhatsAppMessage(payment.supplier_name, payment.amount, newBal);

      openWhatsAppWeb(payment.supplier_phone!, text);

      await logWhatsAppShareAttempt('offset', payment.id, supPhoneNorm.normalized, {
        target: 'supplier',
        supplier_name: payment.supplier_name,
        amount: payment.amount,
      });

      setWaSentState((prev) => ({ ...prev, supplier: true }));
      showSuccess('Tedarikçi için WhatsApp mesajı hazırlandı ve açıldı.');
      if (onRefresh) onRefresh();
    } catch (err: any) {
      showError(err.message || 'WhatsApp açılırken hata oluştu.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 font-sans">
      <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md" onClick={onClose} />

      <div className="relative bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg shadow-2xl z-10 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between bg-slate-900">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-600/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <Receipt className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-white">Tahsilat Detayı</h2>
              <p className="text-xs text-slate-400">İşlem no: {payment.id.slice(0, 8)}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-white rounded-lg bg-slate-800">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 sm:p-6 space-y-5 overflow-y-auto custom-scrollbar text-xs">
          {/* Main Amount & Date Strip */}
          <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 flex items-center justify-between">
            <div>
              <span className="text-slate-400 block font-medium">Tahsil Edilen Tutar</span>
              <span className="text-xl font-extrabold text-emerald-400 block mt-0.5">
                {formatCurrency(payment.amount)}
              </span>
            </div>
            <div className="text-right">
              <span className="text-slate-400 block font-medium">İşlem Tarihi</span>
              <div className="flex items-center gap-1 text-slate-300 font-semibold mt-1">
                <Calendar className="w-3.5 h-3.5 text-slate-400" />
                <span>{formatDateTime(payment.created_at)}</span>
              </div>
            </div>
          </div>

          {/* Payment Details */}
          <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-3">
            <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
              <span className="text-slate-400 font-medium">Müşteri Firma:</span>
              <span className="font-bold text-white text-sm">{payment.customer_name}</span>
            </div>

            <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
              <span className="text-slate-400 font-medium">Ödeme Yöntemi:</span>
              <span className={`font-bold px-2.5 py-0.5 rounded-md ${
                payment.is_offset
                  ? 'bg-purple-950 text-purple-300 border border-purple-800'
                  : 'bg-emerald-950 text-emerald-300 border border-emerald-800'
              }`}>
                {payment.payment_method}
              </span>
            </div>

            {payment.is_offset && payment.supplier_name && (
              <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
                <span className="text-slate-400 font-medium">Mahsup Edilen Tedarikçi:</span>
                <span className="font-bold text-indigo-300 text-xs">{payment.supplier_name}</span>
              </div>
            )}

            {payment.notes && (
              <div className="flex items-center justify-between pt-1">
                <span className="text-slate-400 font-medium">Açıklama / Not:</span>
                <span className="font-medium text-slate-300 italic">{payment.notes}</span>
              </div>
            )}
          </div>

          {/* WHATSAPP AUDIT STATUSES & ACTION BUTTONS */}
          <div className="space-y-3 pt-1">
            <h4 className="font-extrabold text-slate-300 uppercase tracking-wider text-[11px]">
              WhatsApp Bildirim Durumları & Aksiyonlar
            </h4>

            {/* CUSTOMER WHATSAPP ACTION BOX */}
            <div className="bg-slate-950 p-3.5 rounded-2xl border border-slate-800 flex items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-white text-xs">Müşteri WhatsApp:</span>
                  {isCustSent ? (
                    <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded-md border border-emerald-800">
                      <CheckCircle2 className="w-3 h-3" /> Gönderildi
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-400 bg-amber-950/60 px-2 py-0.5 rounded-md border border-amber-800">
                      <AlertCircle className="w-3 h-3" /> Gönderilmedi
                    </span>
                  )}
                </div>
                {!custPhoneNorm.isValid && (
                  <p className="text-[11px] text-slate-500 mt-1 flex items-center gap-1">
                    <PhoneOff className="w-3 h-3 text-slate-500" /> Kayıtlı telefon bulunmuyor
                  </p>
                )}
              </div>

              <button
                onClick={handleSendCustomerWhatsApp}
                disabled={!custPhoneNorm.isValid}
                className={`py-2 px-3 rounded-xl font-bold text-xs flex items-center gap-1.5 transition-all shadow-md active:scale-95 ${
                  !custPhoneNorm.isValid
                    ? 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700'
                    : isCustSent
                    ? 'bg-slate-800 hover:bg-slate-700 text-emerald-400 border border-slate-700'
                    : 'bg-emerald-600 hover:bg-emerald-500 text-white'
                }`}
              >
                <MessageSquare className="w-3.5 h-3.5" />
                <span>{isCustSent ? 'Tekrar Gönder' : 'WhatsApp Gönder'}</span>
              </button>
            </div>

            {/* SUPPLIER WHATSAPP ACTION BOX (ONLY IF OFFSET) */}
            {payment.is_offset && payment.supplier_name && (
              <div className="bg-slate-950 p-3.5 rounded-2xl border border-slate-800 flex items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-white text-xs">Tedarikçi WhatsApp:</span>
                    {isSupSent ? (
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded-md border border-emerald-800">
                        <CheckCircle2 className="w-3 h-3" /> Gönderildi
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-400 bg-amber-950/60 px-2 py-0.5 rounded-md border border-amber-800">
                        <AlertCircle className="w-3 h-3" /> Gönderilmedi
                      </span>
                    )}
                  </div>
                  {!supPhoneNorm.isValid && (
                    <p className="text-[11px] text-slate-500 mt-1 flex items-center gap-1">
                      <PhoneOff className="w-3 h-3 text-slate-500" /> Kayıtlı telefon bulunmuyor
                    </p>
                  )}
                </div>

                <button
                  onClick={handleSendSupplierWhatsApp}
                  disabled={!supPhoneNorm.isValid}
                  className={`py-2 px-3 rounded-xl font-bold text-xs flex items-center gap-1.5 transition-all shadow-md active:scale-95 ${
                    !supPhoneNorm.isValid
                      ? 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700'
                      : isSupSent
                      ? 'bg-slate-800 hover:bg-slate-700 text-indigo-300 border border-slate-700'
                      : 'bg-indigo-600 hover:bg-indigo-500 text-white'
                  }`}
                >
                  <MessageSquare className="w-3.5 h-3.5" />
                  <span>{isSupSent ? 'Tekrar Gönder' : 'WhatsApp Gönder'}</span>
                </button>
              </div>
            )}
          </div>

          <div className="pt-2">
            <button
              onClick={onClose}
              className="w-full py-2.5 px-4 rounded-xl font-bold text-xs bg-slate-950 text-slate-300 hover:text-white border border-slate-800 hover:bg-slate-800 transition-colors"
            >
              Kapat
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
