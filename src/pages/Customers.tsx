import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/context/ToastContext';
import { parseErrorMessage } from '@/utils/errors';
import { formatCurrency, formatDate } from '@/utils/formatters';
import { Customer } from '@/types/database.types';
import { LayoutContextType } from '@/components/layout/Layout';
import { CustomerModal } from '@/components/modals/CustomerModal';
import {
  Users,
  Search,
  Plus,
  Edit2,
  Trash2,
  BookOpen,
  Receipt,
  Eye,
  Loader2,
  Phone,
  Mail,
  MapPin,
} from 'lucide-react';

interface CustomerWithBalance extends Customer {
  current_balance: number;
}

export const Customers: React.FC = () => {
  const navigate = useNavigate();
  const { openPaymentModal } = useOutletContext<LayoutContextType>();
  const { showSuccess, showError } = useToast();

  const [loading, setLoading] = useState(true);
  const [customers, setCustomers] = useState<CustomerWithBalance[]>([]);
  const [searchQuery, setSearchQuery] = useState('');

  // Modal State
  const [customerModalOpen, setCustomerModalOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);

  const fetchCustomers = useCallback(async () => {
    setLoading(true);
    try {
      // 1. Fetch Customers
      const { data: cData, error: cError } = await supabase
        .from('customers')
        .select('*')
        .is('deleted_at', null)
        .order('business_name');

      if (cError) throw cError;

      // 2. Fetch Customer Ledger to compute net balance per Customer
      const { data: lData } = await supabase
        .from('customer_ledger')
        .select('customer_id, debit, credit, balance, created_at')
        .is('deleted_at', null)
        .order('created_at', { ascending: false });

      const latestBalMap: Record<string, number> = {};
      const netDebtMap: Record<string, number> = {};

      lData?.forEach((l) => {
        if (latestBalMap[l.customer_id] === undefined) {
          latestBalMap[l.customer_id] = Number(l.balance || 0);
        }
        netDebtMap[l.customer_id] = (netDebtMap[l.customer_id] || 0) + Number(l.debit || 0) - Number(l.credit || 0);
      });

      const listWithBal = (cData || []).map((c) => ({
        ...c,
        current_balance: (netDebtMap[c.id] !== undefined && netDebtMap[c.id] > 0) ? netDebtMap[c.id] : (latestBalMap[c.id] || 0),
      }));

      setCustomers(listWithBal);
    } catch (err) {
      showError(parseErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [showError]);

  useEffect(() => {
    fetchCustomers();
  }, [fetchCustomers]);

  const handleDeleteCustomer = async (cust: Customer) => {
    if (!window.confirm(`"${cust.business_name}" adlı müşteriyi silmek istediğinize emin misiniz? (Geçmiş mali kayıtlar saklanacaktır)`)) {
      return;
    }

    try {
      const { error } = await supabase
        .from('customers')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', cust.id);

      if (error) throw error;
      showSuccess(`Müşteri kaydı silindi.`);
      fetchCustomers();
    } catch (err) {
      showError(parseErrorMessage(err));
    }
  };

  const filteredCustomers = customers.filter((c) => {
    const q = searchQuery.toLowerCase().trim();
    return (
      !q ||
      c.business_name.toLowerCase().includes(q) ||
      (c.contact_name && c.contact_name.toLowerCase().includes(q)) ||
      (c.phone && c.phone.includes(q))
    );
  });

  return (
    <div className="space-y-6">
      {/* Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900 border border-slate-800 p-4 sm:p-6 rounded-2xl">
        <div>
          <h2 className="text-xl font-bold text-white tracking-tight">Müşteri Kayıtları & Cari Dengeleri</h2>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Petshop müşterilerinizin iletişim bilgilerini, güncel borç durumunu ve vade şartlarını yönetin.
          </p>
        </div>
        <button
          onClick={() => {
            setEditingCustomer(null);
            setCustomerModalOpen(true);
          }}
          className="self-start sm:self-center bg-gradient-to-r from-purple-600 to-purple-500 hover:from-purple-500 hover:to-purple-400 text-white font-bold px-4 py-2.5 rounded-xl shadow-lg shadow-purple-500/20 text-xs sm:text-sm flex items-center gap-2 transition-all active:scale-95"
        >
          <Plus className="w-4 h-4" />
          <span>Müşteri Ekle</span>
        </button>
      </div>

      {/* Search */}
      <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl">
        <div className="relative w-full">
          <Search className="w-4 h-4 absolute left-3.5 top-3 text-slate-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Firma adı, yetkili ismi veya telefon ile arayın..."
            className="w-full bg-slate-950 border border-slate-700 focus:border-purple-500 rounded-xl py-2 pl-10 pr-4 text-xs sm:text-sm text-slate-100 placeholder-slate-500 outline-none"
          />
        </div>
      </div>

      {/* Customers Cards / Table Grid */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        {loading ? (
          <div className="p-12 text-center text-slate-400 flex flex-col items-center">
            <Loader2 className="w-8 h-8 animate-spin text-purple-500 mb-2" />
            <span>Müşteri Verileri Yükleniyor...</span>
          </div>
        ) : filteredCustomers.length === 0 ? (
          <div className="p-12 text-center text-slate-500 text-sm">
            Kayıtlı müşteri bulunamadı.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950 text-slate-400 uppercase tracking-wider font-semibold border-b border-slate-800">
                <tr>
                  <th className="p-4">Firma & Yetkili</th>
                  <th className="p-4">İletişim</th>
                  <th className="p-4 text-center">Vade Süresi</th>
                  <th className="p-4 text-right">Güncel Borç Bakiyesi</th>
                  <th className="p-4 text-right">İşlemler</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70 text-slate-200">
                {filteredCustomers.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-800/40 transition-colors">
                    <td className="p-4">
                      <button
                        onClick={() => navigate(`/customers/${c.id}`)}
                        className="font-bold text-white text-sm hover:text-brand-400 text-left block"
                      >
                        {c.business_name}
                      </button>
                      <span className="text-[11px] text-slate-400">
                        Yetkili: {c.contact_name || 'Belirtilmedi'}
                      </span>
                    </td>

                    <td className="p-4 space-y-0.5 text-slate-300">
                      <div className="flex items-center gap-1.5 text-xs font-mono">
                        <Phone className="w-3.5 h-3.5 text-slate-500" />
                        <span>{c.phone || '-'}</span>
                      </div>
                      {c.address && (
                        <div className="flex items-center gap-1.5 text-[11px] text-slate-400 truncate max-w-xs">
                          <MapPin className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                          <span className="truncate">{c.address}</span>
                        </div>
                      )}
                    </td>

                    <td className="p-4 text-center font-semibold text-slate-300">
                      {c.payment_term_days || 30} Gün
                    </td>

                    <td className="p-4 text-right">
                      <span
                        className={`font-extrabold text-sm ${
                          c.current_balance > 0 ? 'text-amber-400' : 'text-emerald-400'
                        }`}
                      >
                        {formatCurrency(c.current_balance)}
                      </span>
                    </td>

                    <td className="p-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => navigate(`/customers/${c.id}`)}
                          title="Detaylı Müşteri Profili & Geçmiş"
                          className="p-1.5 text-brand-400 hover:text-brand-200 hover:bg-brand-950/40 rounded-lg flex items-center gap-1 font-semibold text-xs"
                        >
                          <Eye className="w-4 h-4" />
                          <span className="hidden sm:inline">Detay</span>
                        </button>

                        <button
                          onClick={() => openPaymentModal(c.id)}
                          title="Tahsilat Al"
                          className="p-1.5 text-emerald-400 hover:text-emerald-200 hover:bg-emerald-950/40 rounded-lg"
                        >
                          <Receipt className="w-4 h-4" />
                        </button>

                        <button
                          onClick={() => {
                            setEditingCustomer(c);
                            setCustomerModalOpen(true);
                          }}
                          title="Düzenle"
                          className="p-1.5 text-slate-400 hover:text-purple-400 hover:bg-purple-950/40 rounded-lg"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>

                        <button
                          onClick={() => handleDeleteCustomer(c)}
                          title="Sil"
                          className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-rose-950/40 rounded-lg"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Customer Modal */}
      <CustomerModal
        isOpen={customerModalOpen}
        onClose={() => setCustomerModalOpen(false)}
        customerToEdit={editingCustomer}
        onSuccess={fetchCustomers}
      />
    </div>
  );
};
