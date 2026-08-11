import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { parseErrorMessage } from '@/utils/errors';
import {
  Settings as SettingsIcon,
  User,
  Lock,
  Building,
  CheckCircle2,
  Loader2,
  KeyRound,
  Trash2,
  AlertTriangle,
  ShieldAlert,
  Eye,
  EyeOff,
  X,
  AlertOctagon,
} from 'lucide-react';

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

  // Reset Data Modal Steps: 0 = closed, 1 = warning, 2 = password verify, 3 = final confirm
  const [resetStep, setResetStep] = useState<0 | 1 | 2 | 3>(0);
  const [verifyPassword, setVerifyPassword] = useState('');
  const [showVerifyPassword, setShowVerifyPassword] = useState(false);
  const [verifyingPassword, setVerifyingPassword] = useState(false);
  const [resettingData, setResettingData] = useState(false);

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

  // Step 2: Password Verification via Supabase Auth
  const handleVerifyPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.email || !verifyPassword) {
      showError('Lütfen şifrenizi girin.');
      return;
    }

    setVerifyingPassword(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: verifyPassword,
      });

      if (error || !data.user) {
        showError('Şifre yanlış. Verileriniz silinmedi.');
        return;
      }

      // Password verified successfully!
      setVerifyPassword('');
      setResetStep(3); // Proceed to Final Confirmation step
    } catch (err) {
      showError('Şifre yanlış. Verileriniz silinmedi.');
    } finally {
      setVerifyingPassword(false);
    }
  };

  // Step 3: Execute Atomic Stored Procedure
  const handleExecuteReset = async () => {
    setResettingData(true);
    try {
      const { data, error } = await supabase.rpc('reset_business_data_transaction');

      if (error) {
        console.error('Reset RPC error:', error);
        showError('Veri sıfırlama işlemi tamamlanamadı. Verileriniz korunmuştur.');
        return;
      }

      showSuccess('✅ İşletme verileri başarıyla sıfırlandı. Kullanıcı hesabınız ve profil bilgileriniz korunuyor.');
      setResetStep(0);
      window.dispatchEvent(new Event('refresh-data'));
    } catch (err) {
      console.error('Reset exception:', err);
      showError('Veri sıfırlama işlemi tamamlanamadı. Verileriniz korunmiştir.');
    } finally {
      setResettingData(false);
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

      {/* 🔴 DANGER ZONE: RESET BUSINESS DATA */}
      <div className="bg-slate-900 border border-rose-900/50 rounded-2xl p-6 shadow-xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-rose-900/40 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-rose-600/20 border border-rose-500/30 flex items-center justify-center text-rose-400">
              <Trash2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-white text-base flex items-center gap-2">
                <span>VERİLERİ SIFIRLA</span>
                <span className="px-2 py-0.5 rounded bg-rose-950 text-rose-400 border border-rose-800 text-[10px] font-extrabold uppercase">
                  Tehlikeli Bölge
                </span>
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Test ve işletme verilerini siler. Kullanıcı hesabınız (auth.users) ve profil bilgileriniz (profiles) tamamen korunur.
              </p>
            </div>
          </div>

          <button
            onClick={() => setResetStep(1)}
            className="bg-rose-600 hover:bg-rose-500 text-white font-bold px-5 py-2.5 rounded-xl text-xs flex items-center justify-center gap-2 transition-all shadow-lg shadow-rose-600/20 active:scale-95 shrink-0"
          >
            <Trash2 className="w-4 h-4" />
            <span>Verileri Sıfırla</span>
          </button>
        </div>
      </div>

      {/* STEP 1: INITIAL WARNING MODAL */}
      {resetStep === 1 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4">
          <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md" onClick={() => setResetStep(0)} />
          <div className="relative bg-slate-900 border border-rose-800/80 rounded-2xl w-full max-w-lg p-6 shadow-2xl z-10 space-y-5">
            <div className="flex items-center gap-3 border-b border-slate-800 pb-4">
              <div className="w-10 h-10 rounded-xl bg-rose-600/20 border border-rose-500/40 flex items-center justify-center text-rose-400 shrink-0">
                <AlertTriangle className="w-6 h-6 animate-pulse" />
              </div>
              <div>
                <h3 className="text-lg font-black text-white">⚠️ DİKKAT: İŞLETME VERİLERİ SİLİNECEK</h3>
                <p className="text-xs text-rose-300 font-semibold">Geri Alınamaz İşlem İkazı</p>
              </div>
            </div>

            <div className="bg-rose-950/40 border border-rose-900/60 p-4 rounded-xl text-xs text-slate-200 leading-relaxed space-y-2">
              <p className="font-bold text-rose-300">
                Bu işlem işletmenizdeki tüm satış, ürün, stok, müşteri, tedarikçi, ödeme, borç ve cari hareketlerini kalıcı olarak silecektir.
              </p>
              <p className="text-slate-300">
                Bu işlem geri alınamaz. Kullanıcı hesabınız ve profil bilgileriniz kesinlikle korunacaktır.
              </p>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() => setResetStep(0)}
                className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs transition-all"
              >
                Vazgeç
              </button>
              <button
                onClick={() => setResetStep(2)}
                className="px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs transition-all shadow-lg shadow-rose-600/20 active:scale-95"
              >
                Devam Et &rarr;
              </button>
            </div>
          </div>
        </div>
      )}

      {/* STEP 2: SUPABASE AUTH PASSWORD VERIFICATION MODAL */}
      {resetStep === 2 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4">
          <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md" onClick={() => setResetStep(0)} />
          <div className="relative bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg p-6 shadow-2xl z-10 space-y-5">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-purple-600/20 border border-purple-500/40 flex items-center justify-center text-purple-400 shrink-0">
                  <Lock className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-bold text-white">🔐 Güvenlik Doğrulaması</h3>
                  <p className="text-xs text-slate-400">Verileri sıfırlamak için Supabase hesabınızın mevcut şifresini girin.</p>
                </div>
              </div>
              <button onClick={() => setResetStep(0)} className="p-2 text-slate-400 hover:text-white rounded-lg bg-slate-800">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleVerifyPasswordSubmit} className="space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                  Mevcut Kullanıcı Parolası *
                </label>
                <div className="relative">
                  <input
                    type={showVerifyPassword ? 'text' : 'password'}
                    required
                    value={verifyPassword}
                    onChange={(e) => setVerifyPassword(e.target.value)}
                    placeholder="Supabase hesap şifreniz"
                    className="w-full bg-slate-950 border border-slate-700 focus:border-purple-500 rounded-xl p-3 pr-10 text-slate-100 outline-none font-medium"
                  />
                  <button
                    type="button"
                    onClick={() => setShowVerifyPassword(!showVerifyPassword)}
                    className="absolute right-3 top-3 text-slate-400 hover:text-white"
                  >
                    {showVerifyPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setResetStep(0)}
                  className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs transition-all"
                >
                  Vazgeç
                </button>
                <button
                  type="submit"
                  disabled={verifyingPassword || !verifyPassword}
                  className="px-5 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs transition-all shadow-lg shadow-purple-600/20 active:scale-95 disabled:opacity-50 flex items-center gap-1.5"
                >
                  {verifyingPassword ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Doğrulanıyor...</span>
                    </>
                  ) : (
                    <>
                      <Lock className="w-4 h-4" />
                      <span>Şifreyi Doğrula</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* STEP 3: FINAL CONFIRMATION MODAL */}
      {resetStep === 3 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4">
          <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md" onClick={() => setResetStep(0)} />
          <div className="relative bg-slate-900 border border-rose-800 rounded-2xl w-full max-w-lg p-6 shadow-2xl z-10 space-y-5">
            <div className="flex items-center gap-3 border-b border-slate-800 pb-4">
              <div className="w-10 h-10 rounded-xl bg-rose-600/20 border border-rose-500/40 flex items-center justify-center text-rose-400 shrink-0">
                <AlertOctagon className="w-6 h-6 animate-bounce" />
              </div>
              <div>
                <h3 className="text-lg font-black text-white">🚨 SON ONAY</h3>
                <p className="text-xs text-rose-300 font-semibold">Şifreniz Başarıyla Doğrulandı</p>
              </div>
            </div>

            <div className="bg-rose-950/60 border border-rose-800/80 p-4 rounded-xl text-xs text-rose-200 leading-relaxed space-y-2">
              <p className="font-bold text-white text-sm">
                Tüm işletme verileri kalıcı olarak silinecektir.
              </p>
              <p>
                Devam etmek istediğinize kesin olarak emin misiniz? (Kullanıcı girişiniz ve profiller korunacaktır).
              </p>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setResetStep(0)}
                disabled={resettingData}
                className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs transition-all"
              >
                VAZGEÇ
              </button>
              <button
                type="button"
                onClick={handleExecuteReset}
                disabled={resettingData}
                className="px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-black text-xs transition-all shadow-lg shadow-rose-600/30 active:scale-95 flex items-center gap-2"
              >
                {resettingData ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Veriler Siliniyor...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4" />
                    <span>EVET, TÜM VERİLERİ SİL</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
