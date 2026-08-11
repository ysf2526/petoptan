import React from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import {
  LayoutDashboard,
  ShoppingCart,
  Package,
  Boxes,
  Users,
  BookOpen,
  Receipt,
  Truck,
  TrendingUp,
  BarChart3,
  Settings,
  LogOut,
  PlusCircle,
  ShieldCheck,
  Bot,
} from 'lucide-react';

interface SidebarProps {
  onOpenNewSaleModal?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ onOpenNewSaleModal }) => {
  const { profile, user, logout } = useAuth();

  const navItems = [
    { to: '/', label: 'Dashboard', icon: LayoutDashboard },
    { to: '/assistant', label: '🤖 İşletme Asistanı', icon: Bot },
    { to: '/sales', label: 'Satışlar', icon: ShoppingCart },
    { to: '/products', label: 'Ürünler', icon: Package },
    { to: '/stock', label: 'Stok', icon: Boxes },
    { to: '/customers', label: 'Müşteriler', icon: Users },
    { to: '/ledger', label: 'Cari', icon: BookOpen },
    { to: '/collections', label: 'Tahsilatlar', icon: Receipt },
    { to: '/suppliers', label: 'Tedarikçiler', icon: Truck },
    { to: '/profit-targets', label: 'Kâr Hedefleri', icon: TrendingUp },
    { to: '/reports', label: 'Raporlar', icon: BarChart3 },
    { to: '/audit-logs', label: 'İşlem Geçmişi', icon: ShieldCheck },
    { to: '/settings', label: 'Ayarlar', icon: Settings },
  ];

  return (
    <aside className="hidden lg:flex flex-col w-64 bg-slate-900 border-r border-slate-800 text-slate-300 h-screen sticky top-0 shrink-0 z-30">
      {/* Brand Header */}
      <div className="p-5 border-b border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-brand-600 to-brand-400 flex items-center justify-center text-white font-black text-xl shadow-lg shadow-brand-500/20">
            P
          </div>
          <div>
            <h1 className="font-bold text-white tracking-tight leading-tight text-sm">
              PETSHOP TOPTAN
            </h1>
            <p className="text-xs text-slate-400 truncate max-w-[130px]">
              {profile?.business_name || 'İşletme Yönetimi'}
            </p>
          </div>
        </div>
      </div>

      {/* Quick Action Button */}
      {onOpenNewSaleModal && (
        <div className="p-4 border-b border-slate-800/60">
          <button
            onClick={onOpenNewSaleModal}
            className="w-full bg-gradient-to-r from-brand-600 to-brand-500 hover:from-brand-500 hover:to-brand-400 text-white font-semibold py-2.5 px-4 rounded-xl shadow-lg shadow-brand-500/20 flex items-center justify-center gap-2 transition-all duration-200 text-sm active:scale-98"
          >
            <PlusCircle className="w-4 h-4" />
            <span>Hızlı Satış Yap</span>
          </button>
        </div>
      )}

      {/* Navigation List */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1 custom-scrollbar">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3.5 py-2.5 rounded-xl font-medium text-sm transition-all duration-150 ${
                  isActive
                    ? 'bg-brand-600/20 text-brand-400 border border-brand-500/30 font-semibold shadow-inner'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                }`
              }
            >
              <Icon className="w-4 h-4 shrink-0" />
              <span>{item.label}</span>
            </NavLink>
          );
        })}
      </nav>

      {/* Footer / User Profile & Logout */}
      <div className="p-4 border-t border-slate-800 bg-slate-900/50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 overflow-hidden">
            <div className="w-8 h-8 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-300 font-bold text-xs shrink-0">
              {user?.email?.[0]?.toUpperCase() || 'U'}
            </div>
            <div className="truncate">
              <p className="text-xs font-semibold text-white truncate">
                {profile?.full_name || 'İşletme Sahibi'}
              </p>
              <p className="text-[11px] text-slate-400 truncate">{user?.email}</p>
            </div>
          </div>

          <button
            onClick={logout}
            title="Güvenli Çıkış Yap"
            className="p-2 text-slate-400 hover:text-rose-400 hover:bg-rose-950/40 rounded-lg transition-colors shrink-0"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </aside>
  );
};
