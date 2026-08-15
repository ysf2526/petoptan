import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  X, 
  Clock, 
  CheckCircle, 
  Package, 
  User, 
  Calendar, 
  FileText, 
  AlertCircle, 
  ShoppingCart, 
  Ban, 
  MessageSquare,
  ChevronRight,
  Boxes,
  CheckCircle2,
  AlertTriangle
} from 'lucide-react';
import { 
  PreOrder, 
  PreOrderStatusHistory, 
  PreOrderStatus, 
  PRE_ORDER_STATUS_MAP 
} from '@/types/database.types';
import { preOrderService } from '@/services/preOrderService';
import { formatDate, formatCurrency } from '@/utils/formatters';
import { openWhatsAppWeb, buildPreOrderWhatsAppMessage } from '@/services/whatsappService';
import { useToast } from '@/context/ToastContext';

interface PreOrderDetailModalProps {
  preOrder: PreOrder | null;
  isOpen: boolean;
  onClose: () => void;
  onRefresh: () => void;
}

export const PreOrderDetailModal: React.FC<PreOrderDetailModalProps> = ({
  preOrder,
  isOpen,
  onClose,
  onRefresh,
}) => {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [history, setHistory] = useState<PreOrderStatusHistory[]>([]);
  const [loading, setLoading] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [showConvertConfirm, setShowConvertConfirm] = useState(false);
  const [paymentType, setPaymentType] = useState<'pesin' | 'vadeli'>('vadeli');
  const [termDays, setTermDays] = useState<number>(30);

  useEffect(() => {
    if (isOpen && preOrder) {
      fetchHistory();
    }
  }, [isOpen, preOrder]);

  const fetchHistory = async () => {
    if (!preOrder) return;
    try {
      const logs = await preOrderService.getPreOrderStatusHistory(preOrder.id);
      setHistory(logs);
    } catch (err) {
      console.error(err);
    }
  };

  if (!isOpen || !preOrder) return null;

  const isConverted = preOrder.status === 'converted' || !!preOrder.converted_sale_id;
  const isCancelled = preOrder.status === 'cancelled';
  const isStockReady = preOrder.status === 'stock_ready';

  const currentStatusConfig = PRE_ORDER_STATUS_MAP[preOrder.status] || {
    label: preOrder.status,
    badgeBg: 'bg-slate-800',
    badgeText: 'text-slate-300',
    badgeBorder: 'border-slate-700',
    emoji: '⚙️',
  };

  const handleStatusChange = async (newStatus: PreOrderStatus) => {
    try {
      setLoading(true);
      await preOrderService.updatePreOrderStatus(preOrder.id, newStatus, `Durum "${PRE_ORDER_STATUS_MAP[newStatus]?.label}" olarak güncellendi.`);
      showToast(`Sipariş durumu "${PRE_ORDER_STATUS_MAP[newStatus]?.label}" yapıldı.`, 'success');
      onRefresh();
      fetchHistory();
    } catch (err: any) {
      showToast(err.message || 'Durum değiştirilirken hata oluştu.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleMarkStockReady = async () => {
    try {
      setLoading(true);
      const res = await preOrderService.markStockReady(preOrder.id);
      showToast(res.message || 'Ürünlerin stoğu oluştu. Sipariş artık hazırlama aşamasına geçirilebilir.', 'success');
      onRefresh();
      fetchHistory();
    } catch (err: any) {
      showToast(err.message || 'Stok durumu güncellenirken hata oluştu.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleCancelOrder = async () => {
    try {
      setLoading(true);
      await preOrderService.cancelPreOrder(preOrder.id, cancelReason || 'Kullanıcı tarafından iptal edildi.');
      showToast('Ön sipariş iptal edildi. Stok ve cari borç değişmedi.', 'success');
      setShowCancelConfirm(false);
      onRefresh();
      onClose();
    } catch (err: any) {
      showToast(err.message || 'İptal edilirken bir hata oluştu.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleConvertToSale = async () => {
    try {
      setLoading(true);
      const res = await preOrderService.convertPreOrderToSale(
        preOrder.id,
        paymentType,
        termDays,
        undefined,
        `Ön Sipariş Dönüşümü (${preOrder.order_number})`
      );
      showToast(
        `Ön sipariş gerçek siparişe dönüştürüldü! Sipariş No: #${res.sale_number} (Durum: Sipariş Alındı)`,
        'success'
      );
      setShowConvertConfirm(false);
      onRefresh();
      onClose();
      // Navigate to sales page to see the newly received order
      navigate('/sales');
    } catch (err: any) {
      showToast(err.message || 'Satışa dönüştürülürken bir hata oluştu.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleSendWhatsApp = () => {
    const phone = preOrder.customers?.phone;
    if (!phone) {
      showToast('Müşteriye ait telefon numarası bulunmuyor.', 'error');
      return;
    }
    const msg = buildPreOrderWhatsAppMessage(
      preOrder.customer_name,
      preOrder.order_number,
      (preOrder.pre_order_items || []).map((i) => ({
        product_name: i.product_name,
        demanded_quantity: i.demanded_quantity,
        unit: i.unit,
      })),
      preOrder.notes
    );
    openWhatsAppWeb(phone, msg);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-sm animate-fadeIn overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-3xl shadow-2xl overflow-hidden text-slate-200 my-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-slate-800 bg-slate-900/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-brand-500/10 border border-brand-500/20 flex items-center justify-center text-brand-400 font-bold text-lg">
              {currentStatusConfig.emoji}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-bold text-white tracking-tight text-lg">
                  {preOrder.order_number}
                </h2>
                <span
                  className={`text-xs font-semibold px-2.5 py-0.5 rounded-full border ${currentStatusConfig.badgeBg} ${currentStatusConfig.badgeText} ${currentStatusConfig.badgeBorder}`}
                >
                  {currentStatusConfig.label}
                </span>
              </div>
              <p className="text-xs text-slate-400 flex items-center gap-2 mt-0.5">
                <span>{preOrder.customer_name}</span> • <span>{formatDate(preOrder.created_at)}</span>
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 sm:p-5 space-y-5 max-h-[75vh] overflow-y-auto custom-scrollbar">
          {/* Action Bar & Step Buttons */}
          {!isConverted && !isCancelled && (
            <div className="bg-slate-800/60 border border-slate-700/60 rounded-2xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold text-white uppercase tracking-wider">
                    Ön Sipariş İş Akışı Adımları
                  </p>
                  <p className="text-[11px] text-slate-400">
                    Depo stok durumuna göre siparişi aşamalı olarak hazırlayın
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <select
                    value={preOrder.status}
                    onChange={(e) => handleStatusChange(e.target.value as PreOrderStatus)}
                    disabled={loading}
                    className="bg-slate-900 border border-slate-700 text-white text-xs rounded-xl px-3 py-1.5 outline-none font-semibold"
                  >
                    <option value="demand_received">📋 TALEP ALINDI</option>
                    <option value="supply_pending">📦 TEDARİK BEKLİYOR</option>
                    <option value="supplied">🏬 TEDARİK EDİLDİ</option>
                    <option value="stock_ready">🟢 STOK OLUŞTU</option>
                  </select>

                  <button
                    type="button"
                    onClick={() => setShowCancelConfirm(true)}
                    className="bg-rose-950/60 border border-rose-800/60 hover:bg-rose-900/60 text-rose-300 text-xs font-medium px-2.5 py-1.5 rounded-xl transition-colors flex items-center gap-1"
                  >
                    <Ban className="w-3.5 h-3.5" />
                    <span>İptal Et</span>
                  </button>
                </div>
              </div>

              {/* Single Action Button: STOK GELDİ, SİPARİŞİ HAZIRLA */}
              <div className="pt-1">
                <button
                  type="button"
                  onClick={() => setShowConvertConfirm(true)}
                  disabled={loading}
                  className="w-full p-3.5 rounded-xl bg-gradient-to-r from-emerald-600 via-teal-600 to-brand-600 hover:from-emerald-500 hover:to-brand-500 text-white font-extrabold text-xs sm:text-sm flex items-center justify-center gap-2.5 shadow-xl shadow-emerald-600/25 transition-all active:scale-98 border border-emerald-400/30"
                >
                  <ShoppingCart className="w-5 h-5" />
                  <span>📦 STOK GELDİ, SİPARİŞİ HAZIRLA</span>
                </button>
              </div>
            </div>
          )}


          {/* Converted Info Notice Banner (Madde 14 & 15) */}
          {isConverted && (
            <div className="bg-sky-950/60 border border-sky-800/80 rounded-2xl p-4 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sky-300 font-extrabold text-xs sm:text-sm">
                  <CheckCircle2 className="w-5 h-5 text-sky-400 shrink-0" />
                  <span>
                    Bu ön sipariş #{preOrder.converted_sale_number || 'kayıtlı'} numaralı gerçek siparişe dönüştürülmüştür.
                  </span>
                </div>
                <button
                  onClick={() => {
                    onClose();
                    navigate('/sales');
                  }}
                  className="bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold px-3 py-1.5 rounded-xl transition-all flex items-center gap-1 shadow-md"
                >
                  <span>Siparişlere Git</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
              <p className="text-xs text-slate-300 pl-7">
                Sipariş durumu varsayılan olarak <strong>🟡 Sipariş Alındı</strong> olarak kaydedilmiştir. Siparişler ekranından adım adım <i>Hazırlanıyor</i>, <i>Hazırlandı</i> ve <i>Teslim Edildi</i> aşamalarına geçirebilirsiniz.
              </p>
            </div>
          )}

          {/* Convert to Sale Confirmation Overlay Form */}
          {showConvertConfirm && (
            <div className="bg-slate-950 border border-brand-500/40 rounded-2xl p-4 space-y-4 shadow-2xl animate-fadeIn">
              <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                <div className="flex items-center gap-2 text-brand-400 font-bold text-sm">
                  <ShoppingCart className="w-4 h-4" />
                  <span>Gerçek Siparişe Dönüştür & Siparişi Hazırla</span>
                </div>
                <span className="text-[10px] text-amber-400 font-semibold bg-amber-950/60 px-2 py-0.5 rounded">
                  Status: 🟡 Sipariş Alındı olarak başlayacaktır
                </span>
              </div>

              <p className="text-xs text-slate-300 leading-relaxed">
                Bu işlem stok düşecek, Müşteri Carisine Borç yazacak ve siparişi <strong>Sipariş Alındı</strong> durumuna alacaktır. Otomatik teslim edildi yapılmaz.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Ödeme Türü</label>
                  <select
                    value={paymentType}
                    onChange={(e) => setPaymentType(e.target.value as 'pesin' | 'vadeli')}
                    className="w-full bg-slate-900 border border-slate-700 text-white text-xs rounded-xl px-3 py-2.5 outline-none font-semibold"
                  >
                    <option value="vadeli">Vadeli Satış</option>
                    <option value="pesin">Peşin Satış</option>
                  </select>
                </div>

                {paymentType === 'vadeli' && (
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">Vade Süresi (Gün)</label>
                    <input
                      type="number"
                      value={termDays}
                      onChange={(e) => setTermDays(Number(e.target.value))}
                      className="w-full bg-slate-900 border border-slate-700 text-white text-xs rounded-xl px-3 py-2.5 outline-none font-bold"
                    />
                  </div>
                )}
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowConvertConfirm(false)}
                  className="px-3.5 py-2 text-xs text-slate-400 hover:text-white"
                >
                  Vazgeç
                </button>
                <button
                  type="button"
                  onClick={handleConvertToSale}
                  disabled={loading}
                  className="bg-gradient-to-r from-brand-600 to-brand-500 hover:from-brand-500 hover:to-brand-400 text-white text-xs font-bold px-5 py-2.5 rounded-xl transition-all shadow-lg shadow-brand-500/25 flex items-center gap-1.5"
                >
                  {loading ? 'İşleniyor...' : 'Siparişi Oluştur (Sipariş Alındı)'}
                </button>
              </div>
            </div>
          )}

          {/* Cancel Confirmation Overlay Form */}
          {showCancelConfirm && (
            <div className="bg-rose-950/40 border border-rose-800/60 rounded-xl p-4 space-y-3 animate-fadeIn">
              <div className="flex items-center gap-2 text-rose-400 font-bold text-sm">
                <Ban className="w-4 h-4" />
                <span>Ön Siparişi İptal Et</span>
              </div>
              <p className="text-xs text-slate-300">
                Ön sipariş iptal edilecek. Stok ve cari borçlarda <strong>hiçbir değişiklik yapılmayacaktır</strong>.
              </p>
              <input
                type="text"
                placeholder="İptal nedeni (Opsiyonel)..."
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 text-white text-xs rounded-xl px-3 py-2 outline-none"
              />
              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setShowCancelConfirm(false)}
                  className="px-3 py-1.5 text-xs text-slate-400 hover:text-white"
                >
                  Vazgeç
                </button>
                <button
                  type="button"
                  onClick={handleCancelOrder}
                  disabled={loading}
                  className="bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold px-4 py-2 rounded-xl transition-colors"
                >
                  {loading ? 'İptal Ediliyor...' : 'İptali Onayla'}
                </button>
              </div>
            </div>
          )}

          {/* Customer & Order Notes */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="bg-slate-800/40 border border-slate-800 rounded-xl p-3.5 text-xs space-y-1">
              <span className="text-slate-400 flex items-center gap-1 font-medium">
                <User className="w-3.5 h-3.5 text-brand-400" /> Müşteri Bilgisi
              </span>
              <p className="font-bold text-white text-sm">{preOrder.customer_name}</p>
              <p className="text-slate-400">{preOrder.customers?.phone || 'Telefon kaydı yok'}</p>
            </div>

            <div className="bg-slate-800/40 border border-slate-800 rounded-xl p-3.5 text-xs space-y-1">
              <span className="text-slate-400 flex items-center gap-1 font-medium">
                <FileText className="w-3.5 h-3.5 text-amber-400" /> Sipariş Notu
              </span>
              <p className="font-semibold text-slate-200">
                {preOrder.notes || 'Özel not eklenmemiş.'}
              </p>
            </div>
          </div>

          {/* Items Table */}
          <div>
            <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">
              Sipariş Edilen Ürün Kalemleri
            </h3>

            <div className="border border-slate-800 rounded-xl overflow-hidden bg-slate-900">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-800/60 text-slate-400 font-semibold border-b border-slate-800">
                  <tr>
                    <th className="p-3">Ürün Adı</th>
                    <th className="p-3 text-center">Talep Miktarı</th>
                    <th className="p-3 text-center">Mevcut Stok</th>
                    <th className="p-3 text-center">Tahmini Fiyat</th>
                    <th className="p-3 text-right">Durum</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {(preOrder.pre_order_items || []).map((item) => {
                    const itemConfig = PRE_ORDER_STATUS_MAP[item.status] || currentStatusConfig;
                    const stock = item.products?.current_stock ?? 0;
                    const hasEnough = stock >= item.demanded_quantity;

                    return (
                      <tr key={item.id} className="hover:bg-slate-800/30 transition-colors">
                        <td className="p-3 font-medium text-white">
                          <div>{item.product_name}</div>
                          {item.brand && <div className="text-[11px] text-slate-400">{item.brand}</div>}
                        </td>
                        <td className="p-3 text-center font-bold text-amber-300">
                          {item.demanded_quantity} {item.unit}
                        </td>
                        <td className="p-3 text-center font-bold">
                          <span
                            className={`px-2 py-0.5 rounded text-[11px] ${
                              hasEnough
                                ? 'bg-emerald-950 text-emerald-300 border border-emerald-800/40'
                                : 'bg-rose-950 text-rose-300 border border-rose-800/40'
                            }`}
                          >
                            {stock} {item.unit}
                          </span>
                        </td>
                        <td className="p-3 text-center text-slate-300">
                          {item.estimated_sale_price > 0
                            ? formatCurrency(item.estimated_sale_price)
                            : '-'}
                        </td>
                        <td className="p-3 text-right">
                          <span
                            className={`inline-block text-[11px] font-semibold px-2 py-0.5 rounded-md ${itemConfig.badgeBg} ${itemConfig.badgeText}`}
                          >
                            {itemConfig.label}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Status Timeline History */}
          <div>
            <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-slate-400" />
              Sipariş Durum Geçmişi
            </h3>

            {history.length === 0 ? (
              <p className="text-xs text-slate-500 italic">Geçmiş kaydı bulunamadı.</p>
            ) : (
              <div className="space-y-2 border-l-2 border-slate-800 ml-2 pl-4">
                {history.map((h) => {
                  const cfg = PRE_ORDER_STATUS_MAP[h.new_status as PreOrderStatus];
                  return (
                    <div key={h.id} className="relative text-xs">
                      <div className="absolute -left-[21px] top-1 w-2.5 h-2.5 rounded-full bg-brand-500 ring-4 ring-slate-900" />
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-white">{cfg?.label || h.new_status}</span>
                        <span className="text-[11px] text-slate-400">{formatDate(h.created_at)}</span>
                      </div>
                      {h.note && <p className="text-slate-400 mt-0.5">{h.note}</p>}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 sm:p-5 border-t border-slate-800 bg-slate-900/50 flex items-center justify-between">
          <button
            type="button"
            onClick={handleSendWhatsApp}
            className="text-xs text-emerald-400 hover:text-emerald-300 font-semibold flex items-center gap-1.5 bg-emerald-950/40 border border-emerald-800/40 px-3 py-2 rounded-xl transition-all"
          >
            <MessageSquare className="w-4 h-4" />
            <span>WhatsApp ile Müşteriye Gönder</span>
          </button>

          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition-colors"
          >
            Kapat
          </button>
        </div>
      </div>
    </div>
  );
};
