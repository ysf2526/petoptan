import React, { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/context/ToastContext';
import { parseErrorMessage } from '@/utils/errors';
import { Supplier } from '@/types/database.types';
import { SupplierModal } from '@/components/modals/SupplierModal';
import { Truck, Search, Plus, Edit2, Trash2, Phone, Mail, MapPin, Loader2 } from 'lucide-react';

export const Suppliers: React.FC = () => {
  const { showSuccess, showError } = useToast();

  const [loading, setLoading] = useState(true);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [searchQuery, setSearchQuery] = useState('');

  const [supplierModalOpen, setSupplierModalOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);

  const fetchSuppliers = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('suppliers')
        .select('*')
        .is('deleted_at', null)
        .order('company_name');

      if (error) throw error;
      setSuppliers(data || []);
    } catch (err) {
      showError(parseErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [showError]);

  useEffect(() => {
    fetchSuppliers();
  }, [fetchSuppliers]);

  const handleDeleteSupplier = async (sup: Supplier) => {
    if (!window.confirm(`"${sup.company_name}" firmasını silmek istediğinize emin misiniz?`)) return;

    try {
      const { error } = await supabase
        .from('suppliers')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', sup.id);

      if (error) throw error;
      showSuccess('Tedarikçi silindi.');
      fetchSuppliers();
    } catch (err) {
      showError(parseErrorMessage(err));
    }
  };

  const filteredSuppliers = suppliers.filter((s) => {
    const q = searchQuery.toLowerCase().trim();
    return (
      !q ||
      s.company_name.toLowerCase().includes(q) ||
      (s.contact_person && s.contact_person.toLowerCase().includes(q))
    );
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900 border border-slate-800 p-4 sm:p-6 rounded-2xl">
        <div>
          <h2 className="text-xl font-bold text-white tracking-tight">Tedarikçi Firmalar</h2>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Ürün temin ettiğiniz toptancı üretici firmalar ve iletişim bilgileri.
          </p>
        </div>
        <button
          onClick={() => {
            setEditingSupplier(null);
            setSupplierModalOpen(true);
          }}
          className="self-start sm:self-center bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 text-white font-bold px-4 py-2.5 rounded-xl shadow-lg shadow-blue-500/20 text-xs sm:text-sm flex items-center gap-2 transition-all active:scale-95"
        >
          <Plus className="w-4 h-4" />
          <span>Tedarikçi Ekle</span>
        </button>
      </div>

      <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl">
        <div className="relative w-full">
          <Search className="w-4 h-4 absolute left-3.5 top-3 text-slate-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Tedarikçi firma veya yetkili adı ile arayın..."
            className="w-full bg-slate-950 border border-slate-700 focus:border-blue-500 rounded-xl py-2 pl-10 pr-4 text-xs sm:text-sm text-slate-100 placeholder-slate-500 outline-none"
          />
        </div>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        {loading ? (
          <div className="p-12 text-center text-slate-400 flex flex-col items-center">
            <Loader2 className="w-8 h-8 animate-spin text-blue-500 mb-2" />
            <span>Tedarikçiler Yükleniyor...</span>
          </div>
        ) : filteredSuppliers.length === 0 ? (
          <div className="p-12 text-center text-slate-500 text-sm">
            Kayıtlı tedarikçi bulunamadı.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950 text-slate-400 uppercase tracking-wider font-semibold border-b border-slate-800">
                <tr>
                  <th className="p-4">Firma Adı</th>
                  <th className="p-4">Yetkili</th>
                  <th className="p-4">İletişim</th>
                  <th className="p-4">Adres</th>
                  <th className="p-4 text-right">İşlem</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70 text-slate-200">
                {filteredSuppliers.map((s) => (
                  <tr key={s.id} className="hover:bg-slate-800/40 transition-colors">
                    <td className="p-4 font-bold text-white text-sm">{s.company_name}</td>
                    <td className="p-4 font-semibold text-slate-300">{s.contact_person || '-'}</td>
                    <td className="p-4 space-y-0.5">
                      <div className="flex items-center gap-1.5 text-xs font-mono text-slate-300">
                        <Phone className="w-3.5 h-3.5 text-slate-500" />
                        <span>{s.phone || '-'}</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-xs text-slate-400">
                        <Mail className="w-3.5 h-3.5 text-slate-500" />
                        <span>{s.email || '-'}</span>
                      </div>
                    </td>
                    <td className="p-4 text-slate-400 max-w-xs truncate">{s.address || '-'}</td>
                    <td className="p-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => {
                            setEditingSupplier(s);
                            setSupplierModalOpen(true);
                          }}
                          className="p-1.5 text-slate-400 hover:text-blue-400 hover:bg-blue-950/40 rounded-lg"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteSupplier(s)}
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

      <SupplierModal
        isOpen={supplierModalOpen}
        onClose={() => setSupplierModalOpen(false)}
        supplierToEdit={editingSupplier}
        onSuccess={fetchSuppliers}
      />
    </div>
  );
};
