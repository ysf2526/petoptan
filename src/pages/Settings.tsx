import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { parseErrorMessage } from '@/utils/errors';
import { Settings as SettingsIcon, User, Lock, Building, CheckCircle2, Loader2, KeyRound } from 'lucide-react';

export const Settings: React.FC = () => {
  const { user, profile, updatePassword, refreshProfile } = useAuth();
  const { showSuccess, showError } = useToast();

  // Profile fields
  const [fullName, setFullName] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [defaultTermDays, setDefaultTermDays] = useState(30);
  const [defaultMinStock, setDefaultMinStock] = useState(10);

  const [savingProfile, setSavingProfile] = useState(false);

  // Password fields
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);

  useEffect(() => {
    if (profile) {
      setFullName(profile.full_name || '');
      setBusinessName(profile.business_name || 'Petshop Toptan Satış');
      setPhone(profile.phone || '');
      setAddress(profile.address || '');
      setDefaultTermDays(profile.default_payment_term_days || 30);
      setDefaultMinStock(profile.default_min_stock || 10);
    }
  }, [profile]);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setSavingProfile(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          full_name: fullName.trim(),
          business_name: businessName.trim(),
          phone: phone.trim(),
          address: address.trim(),
          default_payment_term_days: Number(defaultTermDays || 30),
          default_min_stock: Number(defaultMinStock || 10),
          updated_at: new Date().toISOString(),
        })
        .eq('id', user.id);

      if (error) throw error;
      showSuccess('Profil ve işletme ayarlarınız kaydedildi.');
      refreshProfile();
    } catch (err) {
      showError(parseErrorMessage(err));
    } finally {
      setSavingProfile(false);
    }
  };

  const handleSavePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPassword || newPassword.length < 6) {
      showError('Şifre en az 6 karakter olmalıdır.');
      return;
    }

    if (newPassword !== confirmPassword) {
      showError('Şifreler birbiriyle eşleşmiyor.');
      return;
    }

    setSavingPassword(true);
    const result = await updatePassword(newPassword);
    setSavingPassword(false);

    if (result.success) {
      showSuccess('Şifreniz Supabase Auth üzerinden güvenle güncellendi.');
      setNewPassword('');
      setConfirmPassword('');
    } else {
      showError(result.error || 'Şifre güncellenemedi.');
    }
  };

  return (
    <div className="space-y-6 pb-8 max-w-4xl mx-auto">
      {/* Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900 border border-slate-800 p-4 sm:p-6 rounded-2xl">
        <div>
          <h2 className="text-xl font-bold text-white tracking-tight">Sistem & İşletme Ayarları</h2>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            İşletme parametrelerini düzenleyin ve Supabase kullanıcı hesabınızın güvenliğini yönetin.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Business & Profile Settings Form */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-5">
          <div className="flex items-center gap-3 border-b border-slate-800 pb-4">
            <div className="w-10 h-10 rounded-xl bg-brand-600/20 border border-brand-500/30 flex items-center justify-center text-brand-400">
              <Building className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-white text-base">İşletme & Profil Ayarları</h3>
              <p className="text-xs text-slate-400">Varsayılan ticari parametreler</p>
            </div>
          </div>

          <form onSubmit={handleSaveProfile} className="space-y-4 text-xs">
            <div>
              <label className="block font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                Kullanıcı E-posta Adresi
              </label>
              <input
                type="email"
                disabled
                value={user?.email || ''}
                className="w-full bg-slate-950/60 border border-slate-800 rounded-xl p-3 text-slate-400 cursor-not-allowed outline-none font-semibold"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                Ad Soyad
              </label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Örn: Ahmet Yılmaz"
                className="w-full bg-slate-950 border border-slate-700 focus:border-brand-500 rounded-xl p-3 text-slate-100 font-semibold outline-none"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                İşletme Adı
              </label>
              <input
                type="text"
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
                placeholder="Örn: Petshop Toptan Satış"
                className="w-full bg-slate-950 border border-slate-700 focus:border-brand-500 rounded-xl p-3 text-slate-100 font-bold outline-none"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                Telefon Numarası
              </label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="0532 000 0000"
                className="w-full bg-slate-950 border border-slate-700 focus:border-brand-500 rounded-xl p-3 text-slate-100 outline-none"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                İşletme Adresi
              </label>
              <textarea
                rows={2}
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Adres bilgisi..."
                className="w-full bg-slate-950 border border-slate-700 focus:border-brand-500 rounded-xl p-3 text-slate-100 outline-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-3 pt-2">
              <div>
                <label className="block font-semibold text-slate-300 uppercase tracking-wider mb-1">
                  Varsayılan Vade (Gün)
                </label>
                <input
                  type="number"
                  value={defaultTermDays}
                  onChange={(e) => setDefaultTermDays(Number(e.target.value))}
                  className="w-full bg-slate-950 border border-slate-700 focus:border-brand-500 rounded-xl p-2.5 text-slate-100 font-bold outline-none"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-300 uppercase tracking-wider mb-1">
                  Varsayılan Min Stok
                </label>
                <input
                  type="number"
                  value={defaultMinStock}
                  onChange={(e) => setDefaultMinStock(Number(e.target.value))}
                  className="w-full bg-slate-950 border border-slate-700 focus:border-brand-500 rounded-xl p-2.5 text-amber-400 font-bold outline-none"
                />
              </div>
            </div>

            <div className="pt-3 border-t border-slate-800 flex justify-end">
              <button
                type="submit"
                disabled={savingProfile}
                className="w-full bg-gradient-to-r from-brand-600 to-brand-500 hover:from-brand-500 hover:to-brand-400 text-white font-bold py-3 px-4 rounded-xl shadow-lg shadow-brand-500/25 flex items-center justify-center gap-2 transition-all active:scale-98"
              >
                {savingProfile ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Kaydediliyor...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Profil Ayarlarını Kaydet</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </div>

        {/* Security & Password Form */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-5 flex flex-col justify-between">
          <div className="space-y-5">
            <div className="flex items-center gap-3 border-b border-slate-800 pb-4">
              <div className="w-10 h-10 rounded-xl bg-purple-600/20 border border-purple-500/30 flex items-center justify-center text-purple-400">
                <KeyRound className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-white text-base">Güvenlik & Şifre Değiştirme</h3>
                <p className="text-xs text-slate-400">Supabase Auth parolası</p>
              </div>
            </div>

            <form onSubmit={handleSavePassword} className="space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                  Yeni Şifre *
                </label>
                <input
                  type="password"
                  required
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="En az 6 karakter"
                  className="w-full bg-slate-950 border border-slate-700 focus:border-purple-500 rounded-xl p-3 text-slate-100 outline-none"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                  Yeni Şifre (Tekrar) *
                </label>
                <input
                  type="password"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Şifreyi tekrar girin"
                  className="w-full bg-slate-950 border border-slate-700 focus:border-purple-500 rounded-xl p-3 text-slate-100 outline-none"
                />
              </div>

              <button
                type="submit"
                disabled={savingPassword || !newPassword}
                className="w-full bg-gradient-to-r from-purple-600 to-purple-500 hover:from-purple-500 hover:to-purple-400 text-white font-bold py-3 px-4 rounded-xl shadow-lg shadow-purple-500/25 flex items-center justify-center gap-2 transition-all disabled:opacity-50 active:scale-98 mt-4"
              >
                {savingPassword ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Şifre Güncelleniyor...</span>
                  </>
                ) : (
                  <>
                    <Lock className="w-4 h-4" />
                    <span>Şifreyi Değiştir</span>
                  </>
                )}
              </button>
            </form>
          </div>

          <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 text-[11px] text-slate-400 space-y-1 mt-6">
            <span className="font-bold text-slate-200 block uppercase">Güvenlik Notu:</span>
            <p>Şifreler veritabanına düz metin olarak kaydedilmez. Supabase Auth hashing altyapısıyla korunmaktadır.</p>
          </div>
        </div>
      </div>
    </div>
  );
};
