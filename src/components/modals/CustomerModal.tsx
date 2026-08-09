import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { parseErrorMessage } from '@/utils/errors';
import { Customer } from '@/types/database.types';
import { X, Users, Loader2, CheckCircle2 } from 'lucide-react';

interface CustomerModalProps {
  isOpen: boolean;
  onClose: () => void;
  customerToEdit?: Customer | null;
  onSuccess?: () => void;
}

export const CustomerModal: React.FC<CustomerModalProps> = ({
  isOpen,
  onClose,
  customerToEdit,
  onSuccess,
}) => {
  const { user } = useAuth();
  const { showSuccess, showError } = useToast();

  const [loading, setLoading] = useState(false);

  const [businessName, setBusinessName] = useState('');
  const [contactName, setContactName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [taxNumber, setTaxNumber] = useState('');
  const [taxOffice, setTaxOffice] = useState('');
  const [paymentTermDays, setPaymentTermDays] = useState<number>(30);
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (isOpen) {
      if (customerToEdit) {
        setBusinessName(customerToEdit.business_name || '');
        setContactName(customerToEdit.contact_name || '');
        setPhone(customerToEdit.phone || '');
        setEmail(customerToEdit.email || '');
        setAddress(customerToEdit.address || '');
        setTaxNumber(customerToEdit.tax_number || '');
        setTaxOffice(customerToEdit.tax_office || '');
        setPaymentTermDays(customerToEdit.payment_term_days || 30);
        setNotes(customerToEdit.notes || '');
      } else {
        setBusinessName('');
        setContactName('');
        setPhone('');
        setEmail('');
        setAddress('');
        setTaxNumber('');
        setTaxOffice('');
        setPaymentTermDays(30);
        setNotes('');
      }
    }
  }, [isOpen, customerToEdit]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!user) return;
    if (!businessName.trim()) {
      showError('Lütfen firma adını girin.');
      return;
    }

    setLoading(true);

    try {
      const payload = {
        owner_id: user.id,
        business_name: businessName.trim(),
        contact_name: contactName.trim() || null,
        phone: phone.trim() || null,
        email: email.trim() || null,
        address: address.trim() || null,
        tax_number: taxNumber.trim() || null,
        tax_office: taxOffice.trim() || null,
        payment_term_days: Number(paymentTermDays || 30),
        notes: notes.trim() || null,
        updated_at: new Date().toISOString(),
      };

      if (customerToEdit) {
        const { error } = await supabase.from('customers').update(payload).eq('id', customerToEdit.id);
        if (error) throw error;

        await supabase.from('audit_logs').insert({
          owner_id: user.id,
          action: 'UPDATE_CUSTOMER',
          entity_type: 'customers',
          entity_id: customerToEdit.id,
          details: { business_name: businessName },
        });

        showSuccess('Müşteri bilgileri güncellendi.');
      } else {
        const { data: newCust, error } = await supabase.from('customers').insert([payload]).select().single();
        if (error) throw error;

        await supabase.from('audit_logs').insert({
          owner_id: user.id,
          action: 'CREATE_CUSTOMER',
          entity_type: 'customers',
          entity_id: newCust.id,
          details: { business_name: businessName },
        });

        showSuccess('Yeni müşteri kaydedildi.');
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

      <div className="relative bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-xl shadow-2xl z-10 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between bg-slate-900">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-600/20 border border-purple-500/30 flex items-center justify-center text-purple-400">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-white">
                {customerToEdit ? 'Müşteri Bilgilerini Düzenle' : 'Yeni Müşteri Ekle'}
              </h2>
              <p className="text-xs text-slate-400">Petshop / Veteriner işletme kaydı oluşturun.</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-white rounded-lg bg-slate-800">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-4 sm:p-6 overflow-y-auto space-y-4 custom-scrollbar">
          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
              İşletme / Petshop Firma Adı *
            </label>
            <input
              type="text"
              required
              value={businessName}
              onChange={(e) => setBusinessName(e.target.value)}
              placeholder="Örn: Kadıköy Pet Dünyası"
              className="w-full bg-slate-950 border border-slate-700 focus:border-purple-500 rounded-xl p-3 text-slate-100 font-bold text-sm outline-none"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                Yetkili Kişi
              </label>
              <input
                type="text"
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
                placeholder="Örn: Mehmet Demir"
                className="w-full bg-slate-950 border border-slate-700 focus:border-purple-500 rounded-xl p-2.5 text-slate-100 text-xs outline-none"
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
                placeholder="0532 100 2030"
                className="w-full bg-slate-950 border border-slate-700 focus:border-purple-500 rounded-xl p-2.5 text-slate-100 text-xs outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                E-posta Adresi
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="ornek@gmail.com"
                className="w-full bg-slate-950 border border-slate-700 focus:border-purple-500 rounded-xl p-2.5 text-slate-100 text-xs outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                Varsayılan Vade (Gün)
              </label>
              <input
                type="number"
                min={1}
                value={paymentTermDays}
                onChange={(e) => setPaymentTermDays(Number(e.target.value))}
                className="w-full bg-slate-950 border border-slate-700 focus:border-purple-500 rounded-xl p-2.5 text-slate-100 font-bold text-xs outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                Vergi Numarası
              </label>
              <input
                type="text"
                value={taxNumber}
                onChange={(e) => setTaxNumber(e.target.value)}
                placeholder="1234567890"
                className="w-full bg-slate-950 border border-slate-700 focus:border-purple-500 rounded-xl p-2.5 text-slate-100 text-xs font-mono outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                Vergi Dairesi
              </label>
              <input
                type="text"
                value={taxOffice}
                onChange={(e) => setTaxOffice(e.target.value)}
                placeholder="Kadıköy VD"
                className="w-full bg-slate-950 border border-slate-700 focus:border-purple-500 rounded-xl p-2.5 text-slate-100 text-xs outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
              Teslimat Adresi
            </label>
            <textarea
              rows={2}
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Örn: Moda Cad. No:12 Kadıköy / İstanbul"
              className="w-full bg-slate-950 border border-slate-700 focus:border-purple-500 rounded-xl p-2.5 text-slate-100 text-xs outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
              Özel Notlar
            </label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Müşteri hakkında özel ödeme tercihleri..."
              className="w-full bg-slate-950 border border-slate-700 focus:border-purple-500 rounded-xl p-2.5 text-slate-100 text-xs outline-none"
            />
          </div>

          {/* Footer Actions */}
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
              className="py-2.5 px-6 rounded-xl bg-gradient-to-r from-purple-600 to-purple-500 hover:from-purple-500 hover:to-purple-400 text-white font-bold text-xs shadow-lg shadow-purple-500/25 flex items-center gap-2 transition-all disabled:opacity-50 active:scale-98"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Kaydediliyor...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>{customerToEdit ? 'Güncellemeyi Kaydet' : 'Müşteriyi Kaydet'}</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
