import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { parseErrorMessage } from '@/utils/errors';
import { Supplier } from '@/types/database.types';
import { X, Truck, Loader2, CheckCircle2 } from 'lucide-react';

interface SupplierModalProps {
  isOpen: boolean;
  onClose: () => void;
  supplierToEdit?: Supplier | null;
  onSuccess?: () => void;
}

export const SupplierModal: React.FC<SupplierModalProps> = ({
  isOpen,
  onClose,
  supplierToEdit,
  onSuccess,
}) => {
  const { user } = useAuth();
  const { showSuccess, showError } = useToast();

  const [loading, setLoading] = useState(false);

  const [companyName, setCompanyName] = useState('');
  const [contactPerson, setContactPerson] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (isOpen) {
      if (supplierToEdit) {
        setCompanyName(supplierToEdit.company_name || '');
        setContactPerson(supplierToEdit.contact_person || '');
        setPhone(supplierToEdit.phone || '');
        setEmail(supplierToEdit.email || '');
        setAddress(supplierToEdit.address || '');
        setNotes(supplierToEdit.notes || '');
      } else {
        setCompanyName('');
        setContactPerson('');
        setPhone('');
        setEmail('');
        setAddress('');
        setNotes('');
      }
    }
  }, [isOpen, supplierToEdit]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!user) return;
    if (!companyName.trim()) {
      showError('Lütfen firma adını girin.');
      return;
    }

    setLoading(true);

    try {
      const payload = {
        owner_id: user.id,
        company_name: companyName.trim(),
        contact_person: contactPerson.trim() || null,
        phone: phone.trim() || null,
        email: email.trim() || null,
        address: address.trim() || null,
        notes: notes.trim() || null,
        updated_at: new Date().toISOString(),
      };

      if (supplierToEdit) {
        const { error } = await supabase.from('suppliers').update(payload).eq('id', supplierToEdit.id);
        if (error) throw error;

        await supabase.from('audit_logs').insert({
          owner_id: user.id,
          action: 'UPDATE_SUPPLIER',
          entity_type: 'suppliers',
          entity_id: supplierToEdit.id,
          details: { company_name: companyName },
        });

        showSuccess('Tedarikçi bilgileri güncellendi.');
      } else {
        const { data: newSup, error } = await supabase.from('suppliers').insert([payload]).select().single();
        if (error) throw error;

        await supabase.from('audit_logs').insert({
          owner_id: user.id,
          action: 'CREATE_SUPPLIER',
          entity_type: 'suppliers',
          entity_id: newSup.id,
          details: { company_name: companyName },
        });

        showSuccess('Yeni tedarikçi eklendi.');
      }

      onClose();
      if (onSuccess) onSuccess();
    } catch (err) {
      showError(parseErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4">
      <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md" onClick={onClose} />

      <div className="relative bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg shadow-2xl z-10 overflow-hidden flex flex-col max-h-[90vh]">
        <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between bg-slate-900">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400">
              <Truck className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-white">
                {supplierToEdit ? 'Tedarikçiyi Düzenle' : 'Yeni Tedarikçi Ekle'}
              </h2>
              <p className="text-xs text-slate-400">Ürün alımı yaptığınız firma kartı oluşturun.</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-white rounded-lg bg-slate-800">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 sm:p-6 overflow-y-auto space-y-4 custom-scrollbar">
          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
              Tedarikçi Firma Adı *
            </label>
            <input
              type="text"
              required
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              placeholder="Örn: Lider Pet Food A.Ş."
              className="w-full bg-slate-950 border border-slate-700 focus:border-blue-500 rounded-xl p-3 text-slate-100 font-bold text-sm outline-none"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                Yetkili Kişi
              </label>
              <input
                type="text"
                value={contactPerson}
                onChange={(e) => setContactPerson(e.target.value)}
                placeholder="Örn: Ahmet Yılmaz"
                className="w-full bg-slate-950 border border-slate-700 focus:border-blue-500 rounded-xl p-2.5 text-slate-100 text-xs outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                Telefon Numarası
              </label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="0212 555 1020"
                className="w-full bg-slate-950 border border-slate-700 focus:border-blue-500 rounded-xl p-2.5 text-slate-100 text-xs outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
              E-posta Adresi
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="siparis@liderpet.com"
              className="w-full bg-slate-950 border border-slate-700 focus:border-blue-500 rounded-xl p-2.5 text-slate-100 text-xs outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
              Firma Adresi
            </label>
            <textarea
              rows={2}
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Örn: İkitelli OSB No:45 İstanbul"
              className="w-full bg-slate-950 border border-slate-700 focus:border-blue-500 rounded-xl p-2.5 text-slate-100 text-xs outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
              Notlar
            </label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Tedarik şartları, iskonto oranları vb..."
              className="w-full bg-slate-950 border border-slate-700 focus:border-blue-500 rounded-xl p-2.5 text-slate-100 text-xs outline-none"
            />
          </div>

          <div className="pt-3 border-t border-slate-800 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="py-2.5 px-4 rounded-xl border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs transition-colors"
            >
              Vazgeç
            </button>

            <button
              type="submit"
              disabled={loading}
              className="py-2.5 px-6 rounded-xl bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 text-white font-bold text-xs shadow-lg shadow-blue-500/25 flex items-center gap-2 transition-all disabled:opacity-50 active:scale-98"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Kaydediliyor...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>{supplierToEdit ? 'Güncellemeyi Kaydet' : 'Tedarikçiyi Kaydet'}</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
