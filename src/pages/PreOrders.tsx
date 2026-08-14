import React, { useState, useEffect } from 'react';
import { 
  ClipboardList, 
  Plus, 
  Search, 
  Filter, 
  Eye, 
  Clock, 
  CheckCircle, 
  Package, 
  Ban,
  Truck,
  RefreshCw
} from 'lucide-react';
import { PreOrder, PreOrderStatus, PRE_ORDER_STATUS_MAP } from '@/types/database.types';
import { preOrderService } from '@/services/preOrderService';
import { formatDate, formatCurrency } from '@/utils/formatters';
import { NewPreOrderModal } from '@/components/modals/NewPreOrderModal';
import { PreOrderDetailModal } from '@/components/modals/PreOrderDetailModal';

export const PreOrders: React.FC = () => {
  const [preOrders, setPreOrders] = useState<PreOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<PreOrderStatus | 'ALL'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  
  const [isNewModalOpen, setIsNewModalOpen] = useState(false);
  const [selectedPreOrder, setSelectedPreOrder] = useState<PreOrder | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);

  useEffect(() => {
    fetchPreOrders();
  }, [filterStatus, searchQuery]);

  const fetchPreOrders = async () => {
    try {
      setLoading(true);
      const data = await preOrderService.getPreOrders(filterStatus, searchQuery);
      setPreOrders(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenDetail = (order: PreOrder) => {
    setSelectedPreOrder(order);
    setIsDetailModalOpen(true);
  };

  const statusTabs: { key: PreOrderStatus | 'ALL'; label: string }[] = [
    { key: 'ALL', label: 'Tümü' },
    { key: 'demand_received', label: '📋 Talep Alındı' },
    { key: 'supply_pending', label: '📦 Tedarik Bekliyor' },
    { key: 'supplied', label: '🏬 Tedarik Edildi' },
    { key: 'stock_ready', label: '🟢 Stoğu Oluştu' },
    { key: 'converted', label: '📦 Gerçek Siparişe Dönüştü' },
    { key: 'cancelled', label: '🔴 İptal Edildi' },
  ];


  return (
    <div className="space-y-6 pb-12 animate-fadeIn">
      {/* Top Banner & Title */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900 border border-slate-800 p-5 rounded-2xl shadow-xl">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-brand-600 to-brand-400 flex items-center justify-center text-white text-2xl font-black shadow-lg shadow-brand-500/20">
            📋
          </div>
          <div>
            <h1 className="text-xl font-bold text-white tracking-tight">Ön Siparişler</h1>
            <p className="text-xs text-slate-400">
              Henüz depoda olmayan ürünler için müşteri talepleri ve ön sipariş yönetimi
            </p>
          </div>
        </div>

        {/* Action Button - Prominent for Mobile & Field Use */}
        <button
          onClick={() => setIsNewModalOpen(true)}
          className="w-full sm:w-auto bg-gradient-to-r from-brand-600 to-brand-500 hover:from-brand-500 hover:to-brand-400 text-white font-bold px-5 py-3 rounded-xl shadow-lg shadow-brand-500/25 flex items-center justify-center gap-2 transition-all duration-200 text-sm active:scale-98"
        >
          <Plus className="w-5 h-5" />
          <span>+ Yeni Ön Sipariş Al</span>
        </button>
      </div>

      {/* Filter Tabs & Search Bar */}
      <div className="space-y-4">
        {/* Status Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-2 custom-scrollbar">
          {statusTabs.map((tab) => {
            const isActive = filterStatus === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setFilterStatus(tab.key)}
                className={`whitespace-nowrap px-4 py-2 rounded-xl text-xs font-semibold transition-all duration-150 ${
                  isActive
                    ? 'bg-brand-600 text-white shadow-md shadow-brand-600/20'
                    : 'bg-slate-900/80 text-slate-400 hover:bg-slate-800 hover:text-slate-200 border border-slate-800'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Search Bar */}
        <div className="flex items-center gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3.5 top-3 text-slate-500" />
            <input
              type="text"
              placeholder="Müşteri adı, sipariş numarası (OS-2026-...) ara..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-900 border border-slate-800 focus:border-brand-500 rounded-xl pl-10 pr-4 py-2.5 text-xs text-white placeholder-slate-500 outline-none transition-colors"
            />
          </div>
          <button
            onClick={fetchPreOrders}
            className="p-2.5 bg-slate-900 border border-slate-800 text-slate-400 hover:text-white rounded-xl transition-colors"
            title="Yenile"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Pre-Orders Table & Mobile Cards */}
      {loading ? (
        <div className="p-12 text-center text-slate-500 text-sm">Ön siparişler yükleniyor...</div>
      ) : preOrders.length === 0 ? (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center text-slate-400 space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-slate-800 flex items-center justify-center text-slate-500 mx-auto text-xl">
            📋
          </div>
          <p className="text-sm font-semibold text-white">Ön sipariş bulunamadı</p>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            Arama ve filtre kriterlerinize uyan ön sipariş kaydı yok veya henüz hiç müşteri talebi almadınız.
          </p>
          <button
            onClick={() => setIsNewModalOpen(true)}
            className="inline-flex items-center gap-2 bg-brand-600 hover:bg-brand-500 text-white font-semibold text-xs px-4 py-2.5 rounded-xl transition-colors shadow-lg shadow-brand-500/20"
          >
            <Plus className="w-4 h-4" />
            <span>İlk Ön Siparişi Oluştur</span>
          </button>
        </div>
      ) : (
        <>
          {/* Desktop Table View */}
          <div className="hidden lg:block bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-800/60 text-slate-400 font-semibold border-b border-slate-800">
                <tr>
                  <th className="p-4">Sipariş No</th>
                  <th className="p-4">Müşteri</th>
                  <th className="p-4">Tarih</th>
                  <th className="p-4 text-center">Ürün Kalemi</th>
                  <th className="p-4 text-center">Toplam Adet</th>
                  <th className="p-4 text-center">Durum</th>
                  <th className="p-4 text-right">İşlem</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {preOrders.map((order) => {
                  const statusCfg = PRE_ORDER_STATUS_MAP[order.status] || {
                    label: order.status,
                    badgeBg: 'bg-slate-800',
                    badgeText: 'text-slate-300',
                    badgeBorder: 'border-slate-700',
                    emoji: '⚙️',
                  };

                  const totalQty = (order.pre_order_items || []).reduce(
                    (sum, i) => sum + (Number(i.demanded_quantity) || 0),
                    0
                  );

                  return (
                    <tr
                      key={order.id}
                      onClick={() => handleOpenDetail(order)}
                      className="hover:bg-slate-800/40 cursor-pointer transition-colors"
                    >
                      <td className="p-4 font-bold text-white">{order.order_number}</td>
                      <td className="p-4">
                        <div className="font-semibold text-slate-200">{order.customer_name}</div>
                        {order.notes && (
                          <div className="text-[11px] text-slate-400 truncate max-w-[200px]">
                            {order.notes}
                          </div>
                        )}
                      </td>
                      <td className="p-4 text-slate-400">{formatDate(order.created_at)}</td>
                      <td className="p-4 text-center font-semibold text-slate-300">
                        {order.pre_order_items?.length || 0} Kalem
                      </td>
                      <td className="p-4 text-center font-bold text-amber-300">{totalQty} Adet</td>
                      <td className="p-4 text-center">
                        <span
                          className={`inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full border ${statusCfg.badgeBg} ${statusCfg.badgeText} ${statusCfg.badgeBorder}`}
                        >
                          <span>{statusCfg.emoji}</span>
                          <span>{statusCfg.label}</span>
                        </span>
                      </td>
                      <td className="p-4 text-right">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOpenDetail(order);
                          }}
                          className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
                          title="Detay İncele"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile Cards View */}
          <div className="lg:hidden space-y-3">
            {preOrders.map((order) => {
              const statusCfg = PRE_ORDER_STATUS_MAP[order.status] || {
                label: order.status,
                badgeBg: 'bg-slate-800',
                badgeText: 'text-slate-300',
                badgeBorder: 'border-slate-700',
                emoji: '⚙️',
              };

              const totalQty = (order.pre_order_items || []).reduce(
                (sum, i) => sum + (Number(i.demanded_quantity) || 0),
                0
              );

              return (
                <div
                  key={order.id}
                  onClick={() => handleOpenDetail(order)}
                  className="bg-slate-900 border border-slate-800 p-4 rounded-2xl space-y-3 shadow-lg active:scale-99 transition-all cursor-pointer"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-white text-sm">{order.order_number}</span>
                    <span
                      className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-full border ${statusCfg.badgeBg} ${statusCfg.badgeText} ${statusCfg.badgeBorder}`}
                    >
                      {statusCfg.emoji} {statusCfg.label}
                    </span>
                  </div>

                  <div>
                    <h3 className="font-bold text-slate-200 text-sm">{order.customer_name}</h3>
                    <p className="text-xs text-slate-400">
                      Tarih: {formatDate(order.created_at)}
                    </p>
                  </div>

                  <div className="flex items-center justify-between text-xs pt-2 border-t border-slate-800/80">
                    <span className="text-slate-400">
                      {order.pre_order_items?.length || 0} Kalem Ürün
                    </span>
                    <span className="font-bold text-amber-300 bg-amber-950/40 px-2.5 py-1 rounded-lg border border-amber-800/40">
                      Toplam {totalQty} Adet Talep
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Modals */}
      <NewPreOrderModal
        isOpen={isNewModalOpen}
        onClose={() => setIsNewModalOpen(false)}
        onSuccess={fetchPreOrders}
      />

      <PreOrderDetailModal
        preOrder={selectedPreOrder}
        isOpen={isDetailModalOpen}
        onClose={() => setIsDetailModalOpen(false)}
        onRefresh={fetchPreOrders}
      />
    </div>
  );
};
