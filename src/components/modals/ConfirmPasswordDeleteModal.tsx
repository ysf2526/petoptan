import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { ShieldAlert, Lock, Loader2, Trash2, X, Eye, EyeOff } from 'lucide-react';

interface ConfirmPasswordDeleteModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  entityName: string;
  entityType: 'Müşteri' | 'Tedarikçi';
  onConfirmSuccess: () => Promise<void>;
}

export const ConfirmPasswordDeleteModal: React.FC<ConfirmPasswordDeleteModalProps> = ({
  isOpen,
  onClose,
  title,
  entityName,
  entityType,
  onConfirmSuccess,
}) => {
  const { user } = useAuth();
  const { showError } = useToast();

  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setPassword('');
      setShowPassword(false);
      setErrorMessage(null);
      setLoading(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!user || !user.email) {
      showError('Oturum bilgisine ulaşılamadı. Lütfen sayfayı yenileyin.');
      return;
    }

    if (!password.trim()) {
      setErrorMessage('Lütfen hesap şifrenizi girin.');
      return;
    }

    setLoading(true);
    setErrorMessage(null);

    try {
      // Re-authenticate user with entered password
      const { error: authError } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: password.trim(),
      });

      if (authError) {
        setErrorMessage('Girdiğiniz şifre hatalı! Hesabınıza ait şifre doğrulanamadı.');
        showError('Hatalı şifre! Silme işlemi gerçekleştirilemedi.');
        setLoading(false);
        return;
      }

      // Password verified successfully! Perform deletion action
      await onConfirmSuccess();
      onClose();
    } catch (err: any) {
      const msg = err.message || 'Silme işlemi gerçekleştirilirken hata oluştu.';
      setErrorMessage(msg);
      showError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4">
      <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-md" onClick={onClose} />

      <div className="relative bg-slate-900 border border-rose-500/40 rounded-2xl w-full max-w-md shadow-2xl z-10 overflow-hidden my-auto">
        {/* Header */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-900">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-rose-600/20 border border-rose-500/40 flex items-center justify-center text-rose-400">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-extrabold text-white">{title}</h2>
              <p className="text-xs text-rose-300 font-medium">{entityType} Silme Güvenlik Doğrulaması</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-white rounded-xl bg-slate-800">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="p-4 sm:p-6 space-y-4">
          <div className="bg-rose-950/40 border border-rose-900/60 p-3.5 rounded-xl text-xs text-rose-200 leading-relaxed">
            <p className="font-bold text-white mb-1">
              "{entityName}" isimli {entityType.toLowerCase()} kaydını silmek üzeresiniz.
            </p>
            <p className="text-[11px] text-rose-300">
              Bu kritik işlemi onaylamak için lütfen sistemi kullandığınız <strong>kullanıcı hesabı şifrenizi</strong> girin.
            </p>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5">
              Hesap Şifreniz *
            </label>
            <div className="relative">
              <div className="absolute left-3 top-3 text-slate-500">
                <Lock className="w-4 h-4" />
              </div>
              <input
                type={showPassword ? 'text' : 'password'}
                required
                autoFocus
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (errorMessage) setErrorMessage(null);
                }}
                placeholder="Hesap şifrenizi girin..."
                className="w-full bg-slate-950 border border-slate-700 focus:border-rose-500 rounded-xl pl-9 pr-10 py-2.5 text-slate-100 text-sm outline-none font-medium"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-3 text-slate-400 hover:text-slate-200"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {errorMessage && (
            <div className="p-3 rounded-xl bg-rose-950/80 border border-rose-800 text-rose-300 text-xs font-semibold leading-relaxed">
              ⚠️ {errorMessage}
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs transition-all"
            >
              Vazgeç
            </button>

            <button
              type="submit"
              disabled={loading || !password.trim()}
              className="px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-extrabold text-xs transition-all shadow-lg shadow-rose-600/20 flex items-center gap-2 disabled:opacity-50"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Şifre Doğrulanıyor...</span>
                </>
              ) : (
                <>
                  <Trash2 className="w-4 h-4" />
                  <span>ŞİFREYİ DOĞRULA VE SİL</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
