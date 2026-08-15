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
  ClipboardList,
  PackageSearch,
  FileText,
} from 'lucide-react';

interface SidebarProps {
  onOpenNewSaleModal?: () => void;
}

interface NavItem {
  to: string;
  label: string;
  icon: any;
  badge?: string;
}

interface NavSection {
  title: string;
  items: NavItem[];
}

export const Sidebar: React.FC<SidebarProps> = ({ onOpenNewSaleModal }) => {
  const { profile, user, logout } = useAuth();

  const navSections: NavSection[] = [
    {
      title: 'ANA SAYFA',
      items: [
        { to: '/', label: 'Dashboard', icon: LayoutDashboard },
        { to: '/assistant', label: '🤖 İşletme Asistanı', icon: Bot },
      ],
    },
    {
      title: 'SATIŞ & SİPARİŞ',
      items: [
        { to: '/sales', label: 'Satışlar', icon: ShoppingCart },
        { to: '/pre-orders', label: 'Ön Siparişler', icon: ClipboardList },
      ],
    },
    {
      title: 'ÜRÜN & STOK',
      items: [
        { to: '/products', label: 'Ürünler', icon: Package },
        { to: '/stock', label: 'Stok', icon: Boxes },
        { to: '/supply-plan', label: 'Tedarik Planı', icon: PackageSearch },
      ],
    },
    {
      title: 'KATALOG',
      items: [
        { to: '/catalog', label: 'PDF Ürün Kataloğu', icon: FileText, badge: 'YENİ' },
      ],
    },
    {
      title: 'MÜŞTERİ & CARİ',
      items: [
        { to: '/customers', label: 'Müşteriler', icon: Users },
        { to: '/ledger', label: 'Cari', icon: BookOpen },
      ],
    },
    {
      title: 'TEDARİKÇİ & ALIŞ',
      items: [
        { to: '/suppliers', label: 'Tedarikçiler', icon: Truck },
      ],
    },
    {
      title: 'FİNANS & RAPORLAR',
      items: [
        { to: '/collections', label: 'Tahsilatlar', icon: Receipt },
        { to: '/profit-targets', label: 'Kâr Hedefleri', icon: TrendingUp },
        { to: '/reports', label: 'Raporlar', icon: BarChart3 },
      ],
    },
    {
      title: 'SİSTEM',
      items: [
        { to: '/audit-logs', label: 'İşlem Geçmişi', icon: ShieldCheck },
        { to: '/settings', label: 'Ayarlar', icon: Settings },
      ],
    },
  ];

  return (
    <aside className="hidden lg:flex flex-col w-64 bg-slate-900 border-r border-slate-800 text-slate-300 h-screen sticky top-0 shrink-0 z-30">
      {/* Brand Header */}
      <div className="p-4 border-b border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <img
            src="/petivox-logo.png"
            alt="Petivox Logo"
            className="w-10 h-10 rounded-xl object-cover border border-emerald-800/80 shadow-md shrink-0"
          />
          <div className="min-w-0">
            <h1 className="font-black text-white tracking-tight leading-tight text-sm">
              PETSHOP TOPTAN
            </h1>
            <p className="text-[11px] text-slate-400 truncate max-w-[130px]">
              Petivox Toptan Satış
            </p>
          </div>
        </div>
      </div>

      {/* Prominent Main Action Button */}
      {onOpenNewSaleModal && (
        <div className="p-3 border-b border-slate-800/80">
          <button
            onClick={onOpenNewSaleModal}
            className="w-full bg-gradient-to-r from-brand-600 to-brand-500 hover:from-brand-500 hover:to-brand-400 text-white font-black py-2.5 px-3 rounded-xl shadow-lg shadow-brand-500/25 flex items-center justify-center gap-2 transition-all duration-200 text-xs sm:text-sm active:scale-95"
          >
            <PlusCircle className="w-4.5 h-4.5" />
            <span>+ HIZLI SATIŞ YAP</span>
          </button>
        </div>
      )}

      {/* Sectioned Navigation List */}
      <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-3 custom-scrollbar">
        {navSections.map((section, idx) => (
          <div key={section.title} className="space-y-1">
            <div className="px-2 pt-1 pb-1 text-[10px] font-black uppercase tracking-wider text-slate-500">
              {section.title}
            </div>

            {section.items.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === '/'}
                  className={({ isActive }) =>
                    `flex items-center justify-between px-3 py-2 rounded-xl text-xs sm:text-sm transition-all duration-150 ${
                      isActive
                        ? 'bg-brand-600 text-white font-extrabold shadow-md shadow-brand-600/20'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 font-medium'
                    }`
                  }
                >
                  <div className="flex items-center gap-2.5">
                    <Icon className="w-4 h-4 shrink-0" />
                    <span>{item.label}</span>
                  </div>

                  {item.badge && (
                    <span className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[9px] font-black px-1.5 py-0.5 rounded uppercase tracking-wider">
                      {item.badge}
                    </span>
                  )}
                </NavLink>
              );
            })}

            {idx < navSections.length - 1 && <div className="border-b border-slate-800/50 pt-1" />}
          </div>
        ))}
      </nav>

      {/* Footer / User Profile & Logout */}
      <div className="p-3 border-t border-slate-800 bg-slate-950/60">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5 overflow-hidden">
            <div className="w-8 h-8 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-300 font-bold text-xs shrink-0">
              {user?.email?.[0]?.toUpperCase() || 'U'}
            </div>
            <div className="truncate">
              <p className="text-xs font-bold text-white truncate">
                {profile?.full_name || 'Petivox Yöneticisi'}
              </p>
              <p className="text-[10px] text-slate-400 truncate">{user?.email}</p>
            </div>
          </div>

          <button
            onClick={logout}
            title="Güvenli Çıkış Yap"
            className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-rose-950/40 rounded-lg transition-colors shrink-0"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </aside>
  );
};
