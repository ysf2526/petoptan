import React, { useRef, useState } from 'react';
import { Camera, Image as ImageIcon, Trash2, RefreshCw, Loader2, Upload } from 'lucide-react';
import { compressAndProcessImage } from '@/utils/imageUtils';

interface ImageUploadFieldProps {
  currentImageUrl?: string | null;
  onImageSelected: (file: File | null, previewUrl: string | null) => void;
  onImageRemoved: () => void;
}

export const ImageUploadField: React.FC<ImageUploadFieldProps> = ({
  currentImageUrl,
  onImageSelected,
  onImageRemoved,
}) => {
  const [previewUrl, setPreviewUrl] = useState<string | null>(currentImageUrl || null);
  const [processing, setProcessing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const galleryInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setProcessing(true);
      setErrorMsg(null);
      const result = await compressAndProcessImage(file);
      setPreviewUrl(result.previewUrl);
      onImageSelected(result.file, result.previewUrl);
    } catch (err: any) {
      console.error('Image upload processing error:', err);
      setErrorMsg(err.message || 'Görsel işlenirken bir hata oluştu.');
    } finally {
      setProcessing(false);
      // Reset input value so re-selecting same file triggers change
      if (e.target) e.target.value = '';
    }
  };

  const handleRemove = () => {
    setPreviewUrl(null);
    setErrorMsg(null);
    onImageRemoved();
    onImageSelected(null, null);
  };

  return (
    <div className="space-y-3">
      <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider">
        Ürün Fotoğrafı (Opsiyonel)
      </label>

      {/* Hidden Inputs */}
      <input
        type="file"
        ref={galleryInputRef}
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={handleFileChange}
      />
      <input
        type="file"
        ref={cameraInputRef}
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleFileChange}
      />

      {processing ? (
        <div className="w-full h-44 rounded-2xl border-2 border-dashed border-brand-500/40 bg-slate-900/60 flex flex-col items-center justify-center gap-2 text-brand-400">
          <Loader2 className="w-8 h-8 animate-spin" />
          <span className="text-xs font-semibold">Fotoğraf işleniyor ve optimize ediliyor...</span>
        </div>
      ) : previewUrl ? (
        /* Preview State */
        <div className="relative group rounded-2xl overflow-hidden border border-slate-700 bg-slate-950 p-2 shadow-lg">
          <div className="relative h-48 w-full rounded-xl overflow-hidden bg-slate-900 flex items-center justify-center">
            <img
              src={previewUrl}
              alt="Ürün Önizleme"
              className="w-full h-full object-contain"
            />
          </div>

          <div className="flex items-center gap-2 mt-2">
            <button
              type="button"
              onClick={() => galleryInputRef.current?.click()}
              className="flex-1 py-2 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold flex items-center justify-center gap-1.5 transition-colors border border-slate-700"
            >
              <RefreshCw className="w-3.5 h-3.5 text-brand-400" />
              <span>Fotoğrafı Değiştir</span>
            </button>

            <button
              type="button"
              onClick={handleRemove}
              className="py-2 px-3 rounded-xl bg-rose-950/60 hover:bg-rose-900/80 text-rose-300 border border-rose-800/60 text-xs font-bold flex items-center justify-center gap-1.5 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5 text-rose-400" />
              <span>Kaldır</span>
            </button>
          </div>
        </div>
      ) : (
        /* Upload Action State */
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2.5">
            <button
              type="button"
              onClick={() => cameraInputRef.current?.click()}
              className="flex flex-col items-center justify-center gap-2 p-4 rounded-2xl bg-slate-900 border border-slate-800 hover:border-brand-500/50 hover:bg-slate-800/80 text-slate-300 hover:text-white transition-all group active:scale-98"
            >
              <div className="w-10 h-10 rounded-xl bg-brand-600/20 border border-brand-500/30 flex items-center justify-center text-brand-400 group-hover:scale-110 transition-transform">
                <Camera className="w-5 h-5" />
              </div>
              <span className="text-xs font-bold">Kamerayla Çek</span>
            </button>

            <button
              type="button"
              onClick={() => galleryInputRef.current?.click()}
              className="flex flex-col items-center justify-center gap-2 p-4 rounded-2xl bg-slate-900 border border-slate-800 hover:border-brand-500/50 hover:bg-slate-800/80 text-slate-300 hover:text-white transition-all group active:scale-98"
            >
              <div className="w-10 h-10 rounded-xl bg-purple-600/20 border border-purple-500/30 flex items-center justify-center text-purple-400 group-hover:scale-110 transition-transform">
                <ImageIcon className="w-5 h-5" />
              </div>
              <span className="text-xs font-bold">Galeriden Seç</span>
            </button>
          </div>

          <p className="text-[11px] text-slate-500 text-center">
            Desteklenen formatlar: JPG, PNG, WebP (Otomatik sıkıştırılır)
          </p>
        </div>
      )}

      {errorMsg && (
        <p className="text-xs font-semibold text-rose-400 bg-rose-950/40 border border-rose-800/40 p-2.5 rounded-xl">
          ⚠️ {errorMsg}
        </p>
      )}
    </div>
  );
};
