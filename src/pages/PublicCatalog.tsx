import React, { useState, useEffect, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { catalogService } from '@/services/catalogService';
import { PublicCatalogProduct } from '@/types/database.types';
import { formatCurrency } from '@/utils/formatters';
import {
  Search,
  Package,
  ShoppingCart,
  Send,
  CheckCircle2,
  Phone,
  MapPin,
  Loader2,
  Plus,
  Minus,
  X,
  Store,
  MessageCircle,
} from 'lucide-react';

export const PublicCatalog: React.FC = () => {
  const { slug } = useParams<{ slug: string }>();

  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [businessName, setBusinessName] = useState('Petshop Toptan Kataloğu');
  const [businessPhone, setBusinessPhone] = useState<string | null>(null);
  const [businessAddress, setBusinessAddress] = useState<string | null>(null);
  const [products, setProducts] = useState<PublicCatalogProduct[]>([]);

  // Search & Filter
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');

  // Pre-order Modal State
  const [selectedProduct, setSelectedProduct] = useState<PublicCatalogProduct | null>(null);
  const [quantity, setQuantity] = useState<number>(1);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [successOrderNumber, setSuccessOrderNumber] = useState<string | null>(null);

  useEffect(() => {
    if (slug) {
      loadCatalog();
    }
  }, [slug]);

  const loadCatalog = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await catalogService.getPublicCatalog(slug || '');
      setBusinessName(res.businessName);
      setBusinessPhone(res.businessPhone);
      setBusinessAddress(res.businessAddress);
      setProducts(res.products);
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || 'Katalog yüklenemedi.');
    } finally {
      setLoading(false);
    }
  };

  // Categories list
  const categories = useMemo(() => {
    const set = new Set<string>();
    products.forEach((p) => {
      if (p.category) set.add(p.category);
    });
    return Array.from(set);
  }, [products]);

  // Filtered Products
  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      const matchesSearch =
        p.product_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (p.brand && p.brand.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (p.description && p.description.toLowerCase().includes(searchQuery.toLowerCase()));

      const matchesCat = selectedCategory === 'ALL' || p.category === selectedCategory;

      return matchesSearch && matchesCat;
    });
  }, [products, searchQuery, selectedCategory]);

  const handleOpenPreOrderModal = (product: PublicCatalogProduct) => {
    setSelectedProduct(product);
    setQuantity(1);
    setNotes('');
    setSuccessOrderNumber(null);
  };

  const handleSubmitPreOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProduct || !slug) return;

    if (!customerName.trim() || !customerPhone.trim()) {
      alert('Lütfen adınızı / işletme adınızı ve telefon numaranızı giriniz.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await catalogService.submitPublicPreOrder(
        slug,
        customerName.trim(),
        customerPhone.trim(),
        [{ product_id: selectedProduct.id, quantity }],
        notes.trim() || undefined
      );

      setSuccessOrderNumber(res.order_number);
    } catch (err: any) {
      console.error(err);
      alert(err.message || 'Ön sipariş verilirken bir hata oluştu.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6 text-slate-100">
        <Loader2 className="w-10 h-10 animate-spin text-purple-500 mb-3" />
        <span className="text-sm font-bold tracking-wide">Ürün Kataloğu Yükleniyor...</span>
      </div>
    );
  }

  if (errorMsg) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6 text-slate-100 text-center">
        <div className="w-16 h-16 rounded-full bg-rose-950 text-rose-400 flex items-center justify-center mb-4 text-2xl font-bold border border-rose-800">
          ⚠️
        </div>
        <h1 className="text-xl font-bold text-white mb-2">Katalog Açılamadı</h1>
        <p className="text-xs text-slate-400 max-w-sm mb-6">{errorMsg}</p>
        <button
          onClick={loadCatalog}
          className="px-6 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs"
        >
          Tekrar Deneyin
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans pb-24">
      {/* Mobile Priority Header */}
      <header className="sticky top-0 z-40 bg-slate-900/90 backdrop-blur-md border-b border-slate-800 p-4 shadow-xl">
        <div className="max-w-4xl mx-auto flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-purple-600 to-indigo-500 flex items-center justify-center text-white text-xl font-black shrink-0 shadow-md">
              🐾
            </div>
            <div>
              <h1 className="text-sm sm:text-base font-black text-white leading-tight">{businessName}</h1>
              <p className="text-[11px] text-purple-400 font-bold">Resmi Toptan Ürün Kataloğu</p>
            </div>
          </div>

          {businessPhone && (
            <a
              href={`https://wa.me/${businessPhone.replace(/\D/g, '')}`}
              target="_blank"
              rel="noreferrer"
              className="bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold px-3 py-1.5 rounded-xl text-xs flex items-center gap-1.5 shadow-md shrink-0 active:scale-95 transition-all"
            >
              <MessageCircle className="w-4 h-4" />
              <span className="hidden sm:inline">İletişime Geç</span>
            </a>
          )}
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-4xl mx-auto p-4 space-y-4">
        {/* Search Bar */}
        <div className="relative">
          <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Ürün adı, marka veya gramaj ara..."
            className="w-full bg-slate-900 border border-slate-800 rounded-2xl pl-10 pr-4 py-3 text-xs sm:text-sm text-white placeholder-slate-500 outline-none focus:border-purple-500 shadow-md"
          />
        </div>

        {/* Category Pills Slider */}
        {categories.length > 0 && (
          <div className="flex items-center gap-2 overflow-x-auto custom-scrollbar pb-1 text-xs">
            <button
              onClick={() => setSelectedCategory('ALL')}
              className={`px-3.5 py-1.5 rounded-xl font-extrabold whitespace-nowrap transition-all ${
                selectedCategory === 'ALL'
                  ? 'bg-purple-600 text-white shadow-md shadow-purple-600/20'
                  : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
              }`}
            >
              Tüm Ürünler ({products.length})
            </button>

            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-3.5 py-1.5 rounded-xl font-bold whitespace-nowrap transition-all ${
                  selectedCategory === cat
                    ? 'bg-purple-600 text-white shadow-md shadow-purple-600/20'
                    : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        )}

        {/* Products Grid */}
        {filteredProducts.length === 0 ? (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center text-xs text-slate-500 space-y-2">
            <Package className="w-8 h-8 mx-auto text-slate-600 mb-1" />
            <p className="font-bold text-slate-400">Aradığınız kriterlere uygun ürün bulunamadı.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredProducts.map((product) => (
              <div
                key={product.id}
                className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden flex flex-col justify-between hover:border-purple-500/50 transition-all shadow-lg group"
              >
                {/* Product Image */}
                <div className="relative aspect-square bg-slate-950 overflow-hidden flex items-center justify-center p-3">
                  {product.image_url ? (
                    <img
                      src={product.image_url}
                      alt={product.product_name}
                      className="w-full h-full object-contain group-hover:scale-105 transition-transform duration-300"
                    />
                  ) : (
                    <div className="flex flex-col items-center justify-center text-slate-700">
                      <Package className="w-12 h-12 mb-1" />
                      <span className="text-[10px] uppercase font-bold tracking-wider">Fotoğraf Yok</span>
                    </div>
                  )}

                  {/* Status Badge */}
                  <div className="absolute top-2.5 right-2.5">
                    {product.in_stock ? (
                      <span className="bg-emerald-950/90 text-emerald-300 border border-emerald-800 text-[10px] font-black px-2.5 py-1 rounded-lg backdrop-blur-sm shadow-md">
                        🟢 STOKTA
                      </span>
                    ) : (
                      <span className="bg-purple-950/90 text-purple-300 border border-purple-800 text-[10px] font-black px-2.5 py-1 rounded-lg backdrop-blur-sm shadow-md">
                        📦 ÖN SİPARİŞE AÇIK
                      </span>
                    )}
                  </div>
                </div>

                {/* Card Content */}
                <div className="p-4 flex-1 flex flex-col justify-between space-y-3">
                  <div>
                    {product.brand && (
                      <span className="text-[10px] font-extrabold uppercase text-purple-400 tracking-wider block">
                        {product.brand}
                      </span>
                    )}
                    <h3 className="font-bold text-white text-sm leading-snug line-clamp-2 mt-0.5">
                      {product.product_name}
                    </h3>
                    {product.description && (
                      <p className="text-[11px] text-slate-400 line-clamp-2 mt-1 leading-relaxed">
                        {product.description}
                      </p>
                    )}
                  </div>

                  {/* Price & Action Button */}
                  <div className="pt-2 border-t border-slate-800 flex items-center justify-between gap-2">
                    <div>
                      <span className="text-[10px] text-slate-500 block uppercase font-bold">FİYAT</span>
                      {product.show_price_in_catalog ? (
                        <span className="text-base font-black text-emerald-400">
                          {formatCurrency(product.sale_price)}
                        </span>
                      ) : (
                        <span className="text-[11px] font-bold text-amber-400">
                          İletişime Geçiniz
                        </span>
                      )}
                    </div>

                    {!product.in_stock ? (
                      <button
                        onClick={() => handleOpenPreOrderModal(product)}
                        className="bg-purple-600 hover:bg-purple-500 text-white font-extrabold px-3.5 py-2 rounded-xl text-xs shadow-md shadow-purple-600/20 active:scale-95 transition-all flex items-center gap-1.5"
                      >
                        <ShoppingCart className="w-3.5 h-3.5" />
                        <span>ÖN SİPARİŞ VER</span>
                      </button>
                    ) : (
                      <button
                        onClick={() => handleOpenPreOrderModal(product)}
                        className="bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold px-3.5 py-2 rounded-xl text-xs shadow-md shadow-emerald-600/20 active:scale-95 transition-all flex items-center gap-1.5"
                      >
                        <ShoppingCart className="w-3.5 h-3.5" />
                        <span>SİPARİŞ VER</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* PRE-ORDER SUBMISSION MODAL / BOTTOM SHEET */}
      {selectedProduct && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 animate-fadeIn">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-slate-950/80 backdrop-blur-md"
            onClick={() => setSelectedProduct(null)}
          />

          {/* Card */}
          <div className="relative bg-slate-900 border border-slate-800 rounded-t-3xl sm:rounded-2xl w-full max-w-lg max-h-[90vh] flex flex-col shadow-2xl z-10 overflow-hidden text-slate-100">
            {/* Header */}
            <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-900">
              <div className="flex items-center gap-2.5">
                <span className="text-xl">📦</span>
                <div>
                  <h3 className="font-bold text-white text-sm">
                    {selectedProduct.in_stock ? 'Sipariş Talebi Oluştur' : 'Ön Sipariş Talebi Oluştur'}
                  </h3>
                  <span className="text-[11px] text-purple-400 font-semibold">{selectedProduct.product_name}</span>
                </div>
              </div>
              <button
                onClick={() => setSelectedProduct(null)}
                className="p-1.5 text-slate-400 hover:text-white rounded-xl bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Body */}
            {successOrderNumber ? (
              <div className="p-6 text-center space-y-4">
                <div className="w-16 h-16 rounded-full bg-emerald-950 text-emerald-400 flex items-center justify-center mx-auto text-3xl border border-emerald-800 shadow-xl">
                  ✓
                </div>
                <div>
                  <h4 className="text-lg font-black text-white">Talebiniz Alındı!</h4>
                  <p className="text-xs text-slate-300 mt-1">
                    Ön sipariş numaranız: <strong className="text-emerald-400 font-mono">{successOrderNumber}</strong>
                  </p>
                  <p className="text-[11px] text-slate-400 mt-2">
                    Talebiniz toptancı sistemimize iletilmiştir. Ürünler hazırlandığında veya tedarik edildiğinde sizinle iletişime geçilecektir.
                  </p>
                </div>

                <div className="pt-2 flex flex-col gap-2">
                  {businessPhone && (
                    <a
                      href={`https://wa.me/${businessPhone.replace(/\D/g, '')}?text=${encodeURIComponent(
                        `Merhaba, ${successOrderNumber} numaralı ön sipariş talebimi oluşturdum.`
                      )}`}
                      target="_blank"
                      rel="noreferrer"
                      className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold py-3 rounded-xl text-xs flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/20"
                    >
                      <MessageCircle className="w-4 h-4" />
                      <span>Siparişi WhatsApp'tan Toptancıya İlet</span>
                    </a>
                  )}

                  <button
                    onClick={() => setSelectedProduct(null)}
                    className="w-full bg-slate-800 text-slate-300 font-bold py-2.5 rounded-xl text-xs hover:bg-slate-700"
                  >
                    Kataloğa Dön
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleSubmitPreOrder} className="p-4 sm:p-5 space-y-4 text-xs overflow-y-auto">
                {/* Quantity Selector */}
                <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 flex items-center justify-between">
                  <div>
                    <span className="text-slate-400 block text-[11px]">Talep Edilen Miktar</span>
                    <span className="font-bold text-white text-sm">
                      {quantity} {selectedProduct.unit}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 bg-slate-900 p-1 rounded-xl border border-slate-800">
                    <button
                      type="button"
                      onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                      className="w-8 h-8 rounded-lg bg-slate-800 text-white font-bold flex items-center justify-center hover:bg-slate-700 active:scale-95"
                    >
                      <Minus className="w-4 h-4" />
                    </button>
                    <span className="w-8 text-center font-black text-white text-base">{quantity}</span>
                    <button
                      type="button"
                      onClick={() => setQuantity((q) => q + 1)}
                      className="w-8 h-8 rounded-lg bg-purple-600 text-white font-bold flex items-center justify-center hover:bg-purple-500 active:scale-95"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Form Fields */}
                <div>
                  <label className="block text-slate-300 font-bold mb-1">
                    Adınız / İşletme Adı <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    placeholder="Örn: Agave Petshop / Ahmet Yılmaz"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-white font-bold outline-none focus:border-purple-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-bold mb-1">
                    Telefon Numarası <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="tel"
                    required
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                    placeholder="Örn: 0555 123 4567"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-white font-bold outline-none focus:border-purple-500 font-mono"
                  />
                  <span className="text-[10px] text-slate-500 block mt-0.5">Sipariş takibi için kullanılacaktır.</span>
                </div>

                <div>
                  <label className="block text-slate-400 font-semibold mb-1">Not / Açıklama (Opsiyonel)</label>
                  <textarea
                    rows={2}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Örn: Önümüzdeki pazartesi teslim alabilirim..."
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-white outline-none focus:border-purple-500"
                  />
                </div>

                {/* Submit Action */}
                <div className="pt-2">
                  <button
                    type="submit"
                    disabled={submitting}
                    className="w-full bg-purple-600 hover:bg-purple-500 text-white font-black py-3 rounded-xl text-xs sm:text-sm shadow-lg shadow-purple-600/20 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    <span>{submitting ? 'Gönderiliyor...' : 'ÖN SİPARİŞİ GÖNDER'}</span>
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
