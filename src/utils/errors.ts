/**
 * User-friendly Turkish Error Translator
 */

export const parseErrorMessage = (error: any): string => {
  if (!error) return 'Bilinmeyen bir hata oluştu.';

  const message = typeof error === 'string' ? error : error.message || error.details || JSON.stringify(error);

  // Network / Connection errors
  if (message.includes('Failed to fetch') || message.includes('NetworkError') || message.includes('network')) {
    return 'İnternet bağlantınızı kontrol edin. İşlem veritabanına iletilemedi.';
  }

  // Postgres Error Codes & Constraints
  if (message.includes('23505') || message.includes('already exists') || message.includes('unique constraint')) {
    if (message.includes('barcode')) {
      return 'Bu barkod numarası ile kayıtlı bir ürün zaten bulunuyor.';
    }
    if (message.includes('unique_owner_month_year')) {
      return 'Bu ay için zaten belirlenmiş bir kâr hedefi mevcut.';
    }
    return 'Bu kayıt bilgilerine sahip başka bir veri zaten veritabanında mevcut.';
  }

  if (message.includes('23503') || message.includes('foreign key constraint')) {
    return 'Bu kayıt başka işlemlerle ilişkilendirildiği için işlem tamamlanamadı.';
  }

  if (message.includes('Yetersiz stok')) {
    return message;
  }

  if (message.includes('Invalid login credentials') || message.includes('invalid_credentials')) {
    return 'E-posta adresi veya şifre hatalı. Lütfen tekrar deneyin.';
  }

  if (message.includes('User not found')) {
    return 'Kullanıcı hesabı bulunamadı.';
  }

  if (message.includes('Password should be at least')) {
    return 'Şifre en az 6 karakter olmalıdır.';
  }

  return message || 'İşlem sırasında beklenmeyen bir hata oluştu.';
};
