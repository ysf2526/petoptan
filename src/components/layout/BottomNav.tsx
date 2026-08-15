import React, { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import {
  LayoutDashboard,
  ShoppingCart,
  Users,
  BookOpen,
  MoreHorizontal,
  Package,
  Boxes,
  Receipt,
  Truck,
  TrendingUp,
  BarChart3,
  ShieldCheck,
  Settings,
  LogOut,
  X,
  Bot,
  ClipboardList,
  PackageSearch,
  FileText,
} from 'lucide-react';

interface NavItem {
  to: string;
  label: string;
  icon: any;
  badge?: string;
  highlight?: boolean;
}

export const BottomNav: React.FC = () => {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { logout, profile, user } = useAuth();

  const mainNav: NavItem[] = [
    { to: '/', label: 'Ana Sayfa', icon: LayoutDashboard },
    { to: '/pre-orders', label: 'Ön Sipariş', icon: ClipboardList },
    { to: '/sales', label: 'Satış', icon: ShoppingCart },
    { to: '/customers', label: 'Müşteriler', icon: Users },
  ];

  const moreNav: NavItem[] = [
    { to: '/catalog', label: 'PDF Ürün Kataloğu', icon: FileText, badge: 'YENİ', highlight: true },
    { to: '/pre-orders', label: 'Ön Siparişler', icon: ClipboardList },
    { to: '/supply-plan', label: 'Tedarik Planı', icon: PackageSearch },
    { to: '/assistant', label: 'İşletme Asistanı', icon: Bot },
    { to: '/products', label: 'Ürünler & Stok Kartları', icon: Package },
    { to: '/stock', label: 'Stok & Depo Girişi', icon: Boxes },
    { to: '/ledger', label: 'Cari Hesaplar', icon: BookOpen },
    { to: '/collections', label: 'Tahsilatlar & Vadeler', icon: Receipt },
    { to: '/suppliers', label: 'Tedarikçiler', icon: Truck },
    { to: '/profit-targets', label: 'Kâr Hedefleri', icon: TrendingUp },
    { to: '/reports', label: 'Raporlar & Analizler', icon: BarChart3 },
    { to: '/audit-logs', label: 'İşlem Günlüğü', icon: ShieldCheck },
    { to: '/settings', label: 'Ayarlar', icon: Settings },
  ];

  return (
    <>
      {/* Mobile Slide-Up Drawer for "Daha Fazla" */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm transition-opacity"
            onClick={() => setDrawerOpen(false)}
          />

          {/* Drawer Content */}
          <div className="fixed bottom-0 inset-x-0 bg-slate-900 border-t border-slate-800 rounded-t-2xl p-5 max-h-[85vh] overflow-y-auto shadow-2xl flex flex-col z-50 animate-in slide-in-from-bottom duration-200">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-brand-600 flex items-center justify-center font-bold text-white text-sm">
                  P
                </div>
                <div>
                  <h2 className="font-bold text-white text-sm">Tüm Menü Seçenekleri</h2>
                  <p className="text-xs text-slate-400">{profile?.business_name || 'Petshop Toptan'}</p>
                </div>
              </div>
              <button
                onClick={() => setDrawerOpen(false)}
                className="p-2 text-slate-400 hover:text-white rounded-lg bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2.5 py-4">
              {moreNav.map((item) => {
                const Icon = item.icon;
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    onClick={() => setDrawerOpen(false)}
                    className={({ isActive }) =>
                      `flex items-center justify-between p-3 rounded-xl border text-xs font-semibold transition-all ${
                        item.highlight
                          ? isActive
                            ? 'bg-purple-600/30 border-purple-500 text-purple-300 shadow-md shadow-purple-900/30'
                            : 'bg-purple-950/40 border-purple-800/60 text-purple-200 hover:bg-purple-900/50'
                          : isActive
                          ? 'bg-brand-600/20 border-brand-500/40 text-brand-400'
                          : 'bg-slate-800/60 border-slate-700/50 text-slate-300 hover:bg-slate-800'
                      }`
                    }
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <Icon className={`w-4 h-4 shrink-0 ${item.highlight ? 'text-purple-400' : 'text-brand-400'}`} />
                      <span className="truncate">{item.label}</span>
                    </div>

                    {item.badge && (
                      <span className="ml-1 bg-purple-500/20 text-purple-300 border border-purple-500/30 text-[9px] font-black px-1.5 py-0.5 rounded uppercase tracking-wider shrink-0">
                        {item.badge}
                      </span>
                    )}
                  </NavLink>
                );
              })}
            </div>

            <div className="pt-3 border-t border-slate-800 flex items-center justify-between">
              <div className="text-xs text-slate-400 truncate max-w-[200px]">
                {user?.email}
              </div>
              <button
                onClick={() => {
                  setDrawerOpen(false);
                  logout();
                }}
                className="flex items-center gap-2 text-xs font-semibold text-rose-400 bg-rose-950/40 border border-rose-800/40 px-3 py-2 rounded-xl"
              >
                <LogOut className="w-4 h-4" />
                <span>Çıkış Yap</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Fixed Bottom Navigation Bar (Mobile Only) */}
      <div className="lg:hidden fixed bottom-0 inset-x-0 bg-slate-900/95 backdrop-blur-lg border-t border-slate-800 z-40 px-2 py-1.5 flex items-center justify-around shadow-2xl">
        {mainNav.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                `flex flex-col items-center justify-center py-1.5 px-3 rounded-xl transition-all ${
                  isActive ? 'text-brand-400 font-bold' : 'text-slate-400 hover:text-slate-200'
                }`
              }
            >
              <Icon className="w-5 h-5 mb-0.5" />
              <span className="text-[10px] tracking-tight">{item.label}</span>
            </NavLink>
          );
        })}

        <button
          onClick={() => setDrawerOpen(true)}
          className={`flex flex-col items-center justify-center py-1.5 px-3 rounded-xl transition-all ${
            drawerOpen ? 'text-brand-400 font-bold' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <MoreHorizontal className="w-5 h-5 mb-0.5" />
          <span className="text-[10px] tracking-tight">Daha Fazla</span>
        </button>
      </div>
    </>
  );
};

