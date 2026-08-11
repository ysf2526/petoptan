import React, { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/context/ToastContext';
import { parseErrorMessage } from '@/utils/errors';
import { formatCurrency, formatDateTime } from '@/utils/formatters';
import { Supplier, SupplierLedger } from '@/types/database.types';
import { SupplierModal } from '@/components/modals/SupplierModal';
import { SupplierPaymentModal } from '@/components/modals/SupplierPaymentModal';
import { SmartSupplierPaymentPlan } from '@/components/dashboard/SmartSupplierPaymentPlan';
import {
  Truck,
  Search,
  Plus,
  Edit2,
  Trash2,
  Phone,
  Mail,
  MapPin,
  Loader2,
  DollarSign,
  History,
  ArrowRightLeft,
  X,
  CreditCard,
  Ban,
  Building2,
  CheckCircle2,
} from 'lucide-react';

interface SupplierWithBalance extends Supplier {
  balance: number;
  totalPurchases: number;
  creditPurchases: number;
  cashPurchases: number;
  totalPayments: number;
  totalOffsets: number;
}

export const Suppliers: React.FC = () => {
  const { showSuccess, showError } = useToast();

  const [loading, setLoading] = useState(true);
  const [suppliers, setSuppliers] = useState<SupplierWithBalance[]>([]);
  const [searchQuery, setSearchQuery] = useState('');

  // Modals
  const [supplierModalOpen, setSupplierModalOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);

  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [paymentTargetSupplierId, setPaymentTargetSupplierId] = useState<string | null>(null);

  // Selected supplier ID for Ledger Timeline Drawer (primitive ID string to prevent infinite re-render loops)
  const [selectedLedgerSupplierId, setSelectedLedgerSupplierId] = useState<string | null>(null);
  const [ledgerLogs, setLedgerLogs] = useState<SupplierLedger[]>([]);
  const [fetchingLedger, setFetchingLedger] = useState(false);
  const [ledgerFilter, setLedgerFilter] = useState<'ALL' | 'PAYMENT' | 'OFFSET' | 'PURCHASE'>('ALL');

  const fetchSuppliers = useCallback(async () => {
    setLoading(true);
    try {
      const { data: supData, error } = await supabase
        .from('suppliers')
        .select('*')
        .is('deleted_at', null)
        .order('company_name');

      if (error) throw error;

      if (supData && supData.length > 0) {
        const enriched = await Promise.all(
          supData.map(async (sup) => {
            // 1. Fetch supplier ledger entries ordered latest first to get exact current balance
            const { data: lData } = await supabase
              .from('supplier_ledger')
              .select('*')
              .eq('supplier_id', sup.id)
              .is('deleted_at', null)
              .order('created_at', { ascending: false });

            // Latest balance is the balance field of the first row (ordered DESC)
            const latestBalance = lData?.[0]?.balance ? Number(lData[0].balance) : 0;

            let credPurch = 0;
            let totPay = 0;
            let totOff = 0;

            lData?.forEach((row) => {
              if (row.movement_type === 'PURCHASE' || row.movement_type === 'ADJUSTMENT') {
                credPurch += Number(row.credit || 0);
              } else if (row.movement_type === 'OFFSET') {
                totOff += Number(row.debit || 0);
              } else if (row.movement_type === 'PAYMENT') {
                totPay += Number(row.debit || 0);
              }
            });

            // 2. Fetch stock movements linked directly to this supplier
            const { data: smData } = await supabase
              .from('stock_movements')
              .select('quantity, unit_cost')
              .eq('supplier_id', sup.id)
              .eq('movement_type', 'PURCHASE')
              .is('deleted_at', null);

            let allPurchTotal = 0;
            smData?.forEach((sm) => {
              allPurchTotal += Number(sm.quantity || 0) * Number(sm.unit_cost || 0);
            });

            // Total purchases is max of stock movements total or credit purchases
            const totPurch = Math.max(allPurchTotal, credPurch);
            const cashPurch = Math.max(0, totPurch - credPurch);

            return {
              ...sup,
              balance: latestBalance,
              totalPurchases: totPurch,
              creditPurchases: credPurch,
              cashPurchases: cashPurch,
              totalPayments: totPay,
              totalOffsets: totOff,
            };
          })
        );

        setSuppliers(enriched);
      } else {
        setSuppliers([]);
      }
    } catch (err) {
      showError(parseErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [showError]);

  useEffect(() => {
    fetchSuppliers();
    const handleRefresh = () => fetchSuppliers();
    window.addEventListener('refresh-data', handleRefresh);
    return () => window.removeEventListener('refresh-data', handleRefresh);
  }, [fetchSuppliers]);

  // Derive active drawer supplier from suppliers array by ID
  const activeLedgerSupplier = suppliers.find((s) => s.id === selectedLedgerSupplierId) || null;

  // Fetch supplier ledger timeline when selectedLedgerSupplierId changes
  const loadLedger = useCallback(async () => {
    if (!selectedLedgerSupplierId) return;
    setFetchingLedger(true);
    try {
      const { data } = await supabase
        .from('supplier_ledger')
        .select('*')
        .eq('supplier_id', selectedLedgerSupplierId)
        .is('deleted_at', null)
        .order('created_at', { ascending: false });

      setLedgerLogs(data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setFetchingLedger(false);
    }
  }, [selectedLedgerSupplierId]);

  useEffect(() => {
    if (selectedLedgerSupplierId) {
      loadLedger();
    }
  }, [selectedLedgerSupplierId, loadLedger]);

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

  const handleCancelPayment = async (log: SupplierLedger) => {
    const reason = window.prompt(
      `"${formatCurrency(log.debit)}" tutarındaki tedarikçi ödemesini iptal etmek istediğinize emin misiniz?\nLütfen bir iptal nedeni belirtin:`
    );

    if (reason === null) return; // User pressed Cancel

    try {
      const { data, error } = await supabase.rpc('cancel_supplier_payment_transaction', {
        p_ledger_id: log.id,
        p_reason: reason.trim() || 'Kullanıcı İptali',
      });

      if (error) throw error;

      if (data && data.success) {
        showSuccess(`Ödeme iptal edildi. Tedarikçi borcu tekrar +${formatCurrency(data.restored_amount)} artırıldı.`);
        fetchSuppliers();
        loadLedger();
      }
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

  const totals = suppliers.reduce(
    (acc, s) => {
      acc.totalDebt += s.balance;
      acc.totalPurchases += s.totalPurchases;
      acc.totalPayments += s.totalPayments;
      acc.totalOffsets += s.totalOffsets;
      return acc;
    },
    { totalDebt: 0, totalPurchases: 0, totalPayments: 0, totalOffsets: 0 }
  );

  const filteredLedgerLogs = ledgerLogs.filter((l) => {
    if (ledgerFilter === 'ALL') return true;
    return l.movement_type === ledgerFilter;
  });

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900 border border-slate-800 p-4 sm:p-6 rounded-2xl">
        <div>
          <h2 className="text-xl font-bold text-white tracking-tight">Tedarikçiler & Cari Hesap Yönetimi</h2>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Vadeli alım borçları, doğrudan ödemeler ve Sanal POS mahsuplarını tek ekrandan yönetin.
          </p>
        </div>

        <div className="flex items-center gap-3 self-start sm:self-center">
          <button
            onClick={() => {
              setPaymentTargetSupplierId(null);
              setPaymentModalOpen(true);
            }}
            className="bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-white font-bold px-4 py-2.5 rounded-xl shadow-lg shadow-emerald-500/20 text-xs sm:text-sm flex items-center gap-2 transition-all active:scale-95"
          >
            <DollarSign className="w-4 h-4" />
            <span>💸 Tedarikçiye Ödeme Yap</span>
          </button>

          <button
            onClick={() => {
              setEditingSupplier(null);
              setSupplierModalOpen(true);
            }}
            className="bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-bold px-4 py-2.5 rounded-xl text-xs sm:text-sm flex items-center gap-2 transition-all active:scale-95"
          >
            <Plus className="w-4 h-4" />
            <span>Tedarikçi Ekle</span>
          </button>
        </div>
      </div>

      {/* Financial Metrics Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="bg-slate-900 border border-slate-800 p-4 sm:p-5 rounded-2xl flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">Toplam Tedarikçi Borcu</span>
            <span className="text-xl sm:text-2xl font-black text-amber-400 mt-1 block">{formatCurrency(totals.totalDebt)}</span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
            <DollarSign className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 p-4 sm:p-5 rounded-2xl flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">Toplam Mal Alımı</span>
            <span className="text-xl sm:text-2xl font-black text-white mt-1 block">{formatCurrency(totals.totalPurchases)}</span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
            <Truck className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 p-4 sm:p-5 rounded-2xl flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">Doğrudan Ödemeler</span>
            <span className="text-xl sm:text-2xl font-black text-emerald-400 mt-1 block">{formatCurrency(totals.totalPayments)}</span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
            <CheckCircle2 className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 p-4 sm:p-5 rounded-2xl flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">Sanal POS Mahsupları</span>
            <span className="text-xl sm:text-2xl font-black text-purple-400 mt-1 block">{formatCurrency(totals.totalOffsets)}</span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400">
            <ArrowRightLeft className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* AKILLI TEDARİKÇİ ÖDEME PLANI VE NAKİT AKIŞI MOTORU */}
      <SmartSupplierPaymentPlan onRefreshParent={fetchSuppliers} />

      {/* Search Bar */}
      <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl">
        <div className="relative w-full">
          <Search className="w-4 h-4 absolute left-3.5 top-3 text-slate-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Tedarikçi firma veya yetkili adı ile arayın..."
            className="w-full bg-slate-950 border border-slate-700 focus:border-purple-500 rounded-xl py-2 pl-10 pr-4 text-xs sm:text-sm text-slate-100 placeholder-slate-500 outline-none"
          />
        </div>
      </div>

      {/* Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        {loading ? (
          <div className="p-12 text-center text-slate-400 flex flex-col items-center">
            <Loader2 className="w-8 h-8 animate-spin text-purple-500 mb-2" />
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
                  <th className="p-4">Yetkili / İletişim</th>
                  <th className="p-4 text-right">Toplam Alım</th>
                  <th className="p-4 text-right">Vadeli Alım</th>
                  <th className="p-4 text-right">Ödenen</th>
                  <th className="p-4 text-right">Mahsup Edilen</th>
                  <th className="p-4 text-right">Güncel Borç (TL)</th>
                  <th className="p-4 text-center">Aksiyon</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70 text-slate-200">
                {filteredSuppliers.map((s) => (
                  <tr key={s.id} className="hover:bg-slate-800/40 transition-colors">
                    <td className="p-4">
                      <div className="font-bold text-white text-sm">{s.company_name}</div>
                      {s.address && <div className="text-[11px] text-slate-500 truncate max-w-xs">{s.address}</div>}
                    </td>
                    <td className="p-4 space-y-0.5">
                      <div className="font-semibold text-slate-300">{s.contact_person || '-'}</div>
                      <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
                        <Phone className="w-3 h-3 text-slate-500" />
                        <span>{s.phone || '-'}</span>
                      </div>
                    </td>
                    <td className="p-4 text-right font-medium text-slate-300">
                      {formatCurrency(s.totalPurchases)}
                    </td>
                    <td className="p-4 text-right font-semibold text-amber-300">
                      {formatCurrency(s.creditPurchases)}
                    </td>
                    <td className="p-4 text-right font-semibold text-emerald-400">
                      {formatCurrency(s.totalPayments)}
                    </td>
                    <td className="p-4 text-right font-semibold text-purple-400">
                      {formatCurrency(s.totalOffsets)}
                    </td>
                    <td className="p-4 text-right">
                      <span
                        className={`inline-block px-2.5 py-1 rounded-lg font-extrabold text-xs ${
                          s.balance > 0 ? 'bg-amber-950/60 text-amber-400 border border-amber-800/50' : 'bg-slate-950 text-slate-400'
                        }`}
                      >
                        {formatCurrency(s.balance)}
                      </span>
                    </td>
                    <td className="p-4 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => {
                            setPaymentTargetSupplierId(s.id);
                            setPaymentModalOpen(true);
                          }}
                          disabled={s.balance <= 0}
                          className="px-2.5 py-1.5 rounded-lg bg-emerald-950/80 text-emerald-400 border border-emerald-800/60 font-bold text-xs hover:bg-emerald-900 transition-all disabled:opacity-40 disabled:pointer-events-none flex items-center gap-1"
                        >
                          <DollarSign className="w-3.5 h-3.5" />
                          <span>Ödeme Yap</span>
                        </button>

                        <button
                          onClick={() => setSelectedLedgerSupplierId(s.id)}
                          className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-purple-600/20 hover:text-purple-300 border border-slate-700 text-slate-300 font-semibold text-xs transition-all flex items-center gap-1"
                        >
                          <History className="w-3.5 h-3.5" />
                          <span>Cari</span>
                        </button>

                        <button
                          onClick={() => {
                            setEditingSupplier(s);
                            setSupplierModalOpen(true);
                          }}
                          className="p-1.5 text-slate-400 hover:text-blue-400 hover:bg-blue-950/40 rounded-lg"
                          title="Düzenle"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>

                        <button
                          onClick={() => handleDeleteSupplier(s)}
                          className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-rose-950/40 rounded-lg"
                          title="Sil"
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

      {/* Supplier Ledger Timeline Drawer Modal */}
      {activeLedgerSupplier && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4">
          <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md" onClick={() => setSelectedLedgerSupplierId(null)} />
          <div className="relative bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl z-10 overflow-hidden">
            {/* Header */}
            <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between bg-slate-900">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-purple-600/20 border border-purple-500/30 flex items-center justify-center text-purple-400">
                  <Truck className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base sm:text-lg font-bold text-white">{activeLedgerSupplier.company_name}</h2>
                  <p className="text-xs text-slate-400">Tedarikçi Cari Hesabı & Detaylı Finansal Döküm</p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    setPaymentTargetSupplierId(activeLedgerSupplier.id);
                    setPaymentModalOpen(true);
                  }}
                  disabled={activeLedgerSupplier.balance <= 0}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-3.5 py-2 rounded-xl text-xs flex items-center gap-1.5 transition-all disabled:opacity-40"
                >
                  <DollarSign className="w-4 h-4" />
                  <span>Ödeme Yap</span>
                </button>

                <button
                  onClick={() => setSelectedLedgerSupplierId(null)}
                  className="p-2 text-slate-400 hover:text-white rounded-lg bg-slate-800"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="p-4 sm:p-6 overflow-y-auto space-y-5 custom-scrollbar">
              {/* Detailed Summary Strip */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 bg-slate-950 p-4 rounded-xl border border-slate-800 text-xs text-center">
                <div>
                  <span className="text-slate-400 block font-medium">Toplam Alım</span>
                  <span className="font-bold text-white text-sm mt-0.5 block">{formatCurrency(activeLedgerSupplier.totalPurchases)}</span>
                </div>
                <div>
                  <span className="text-slate-400 block font-medium">Vadeli Alımlar</span>
                  <span className="font-bold text-amber-300 text-sm mt-0.5 block">{formatCurrency(activeLedgerSupplier.creditPurchases)}</span>
                </div>
                <div>
                  <span className="text-slate-400 block font-medium">Doğrudan Ödemeler</span>
                  <span className="font-bold text-emerald-400 text-sm mt-0.5 block">{formatCurrency(activeLedgerSupplier.totalPayments)}</span>
                </div>
                <div>
                  <span className="text-slate-400 block font-medium">POS Mahsupları</span>
                  <span className="font-bold text-purple-400 text-sm mt-0.5 block">{formatCurrency(activeLedgerSupplier.totalOffsets)}</span>
                </div>
                <div className="col-span-2 sm:col-span-1">
                  <span className="text-slate-400 block font-medium">Güncel Kalan Borç</span>
                  <span className="font-extrabold text-amber-400 text-sm mt-0.5 block">{formatCurrency(activeLedgerSupplier.balance)}</span>
                </div>
              </div>

              {/* Filter tabs */}
              <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
                {[
                  { id: 'ALL', label: 'Tüm Cari Hareketler' },
                  { id: 'PURCHASE', label: 'Vadeli Mal Alımları' },
                  { id: 'PAYMENT', label: 'Tedarikçi Ödemeleri' },
                  { id: 'OFFSET', label: 'Sanal POS Mahsupları' },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setLedgerFilter(tab.id as any)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all border ${
                      ledgerFilter === tab.id
                        ? 'bg-purple-600/20 border-purple-500 text-purple-300'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* Timeline Table */}
              <div className="border border-slate-800 rounded-xl overflow-hidden bg-slate-950">
                {fetchingLedger ? (
                  <div className="p-8 text-center text-slate-400 flex flex-col items-center">
                    <Loader2 className="w-6 h-6 animate-spin text-purple-500 mb-2" />
                    <span>Cari Hareketler Yükleniyor...</span>
                  </div>
                ) : filteredLedgerLogs.length === 0 ? (
                  <div className="p-8 text-center text-slate-500 text-xs">
                    Seçilen filtrede kayıtlı cari hareket bulunamadı.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-900 text-slate-400 font-semibold border-b border-slate-800 uppercase tracking-wider">
                        <tr>
                          <th className="p-3">Tarih</th>
                          <th className="p-3">İşlem Türü</th>
                          <th className="p-3">Açıklama</th>
                          <th className="p-3 text-right">Borç Artışı (+TL)</th>
                          <th className="p-3 text-right">Borç Düşüşü (-TL)</th>
                          <th className="p-3 text-right">Tedarikçi Bakiyesi</th>
                          <th className="p-3 text-center">İptal</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60 text-slate-200">
                        {filteredLedgerLogs.map((log) => (
                          <tr key={log.id} className="hover:bg-slate-900/60 transition-colors">
                            <td className="p-3 text-slate-400 font-mono text-[11px]">
                              {formatDateTime(log.created_at)}
                            </td>
                            <td className="p-3">
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] font-extrabold uppercase ${
                                  log.movement_type === 'PURCHASE'
                                    ? 'bg-amber-950/60 text-amber-400 border border-amber-800/40'
                                    : log.movement_type === 'OFFSET'
                                    ? 'bg-purple-950/60 text-purple-300 border border-purple-800/40'
                                    : log.movement_type === 'PAYMENT'
                                    ? 'bg-emerald-950/60 text-emerald-400 border border-emerald-800/40'
                                    : 'bg-slate-800 text-slate-300'
                                }`}
                              >
                                {log.movement_type === 'PURCHASE'
                                  ? 'VADELİ MAL ALIMI'
                                  : log.movement_type === 'OFFSET'
                                  ? 'POS MAHSUP'
                                  : log.movement_type === 'PAYMENT'
                                  ? 'ELDEN / BANKA ÖDEMESİ'
                                  : log.movement_type}
                              </span>
                            </td>
                            <td className="p-3 font-medium text-slate-100">{log.description}</td>
                            <td className="p-3 text-right font-bold text-amber-400">
                              {log.credit > 0 ? `+${formatCurrency(log.credit)}` : '-'}
                            </td>
                            <td className="p-3 text-right font-bold text-emerald-400">
                              {log.debit > 0 ? `-${formatCurrency(log.debit)}` : '-'}
                            </td>
                            <td className="p-3 text-right font-extrabold text-white">
                              {formatCurrency(log.balance)}
                            </td>
                            <td className="p-3 text-center">
                              {log.movement_type === 'PAYMENT' && (
                                <button
                                  onClick={() => handleCancelPayment(log)}
                                  className="p-1 text-slate-400 hover:text-rose-400 hover:bg-rose-950/40 rounded transition-colors"
                                  title="Ödemeyi İptal Et"
                                >
                                  <Ban className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Supplier Modal */}
      <SupplierModal
        isOpen={supplierModalOpen}
        onClose={() => setSupplierModalOpen(false)}
        supplierToEdit={editingSupplier}
        onSuccess={fetchSuppliers}
      />

      {/* Supplier Direct Payment Modal */}
      <SupplierPaymentModal
        isOpen={paymentModalOpen}
        onClose={() => setPaymentModalOpen(false)}
        defaultSupplierId={paymentTargetSupplierId}
        onSuccess={fetchSuppliers}
      />
    </div>
  );
};
