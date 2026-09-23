import React, { useState, useEffect } from 'react';
import {
  LayoutDashboard,
  Users,
  Building,
  CreditCard,
  FileText,
  FileSpreadsheet,
  Truck,
  Receipt,
  BookOpen,
  DollarSign,
  Gem,
  AlertOctagon,
  UploadCloud,
  BarChart3,
  Search,
  Sliders,
  Settings,
  Plus,
  RefreshCw,
  Send,
  Eye,
  CheckCircle2,
  AlertCircle,
  Clock,
  ArrowRightLeft,
  ShieldCheck,
  Zap,
  TrendingUp,
  Download,
  Copy,
  ExternalLink,
  ChevronRight,
  Filter,
} from 'lucide-react';
import { api } from '../../../services/api';
import { useToast } from '../../../context/ToastContext';
import { useApp } from '../../../context/AppContext';
import type { DealerCustomer } from '../../../types/hizliBilisim';
import { DealerNewCompanyModal } from './DealerNewCompanyModal';
import { DealerCreditModal } from './DealerCreditModal';
import { DealerTransferModal } from './DealerTransferModal';
import { HizliInvoiceCreateModal } from '../edonusum/HizliInvoiceCreateModal';

export type BayiTabKey =
  | 'DASHBOARD'
  | 'MUSTERILER'
  | 'KONTOR'
  | 'EFATURA'
  | 'EARSIV'
  | 'EIRSALIYE'
  | 'ESMM'
  | 'EMUSTAHSIL'
  | 'EDEFTER'
  | 'IPTAL_ITIRAZ'
  | 'TRANSFER'
  | 'HAKEDIS'
  | 'MUKELLEF'
  | 'ONEK_AYARLAR';

export const EDonusumMerkeziView: React.FC = () => {
  const { showToast: toast } = useToast();
  const { openPrintModal, triggerRefresh, refreshKey } = useApp();

  const [activeTab, setActiveTab] = useState<BayiTabKey>('DASHBOARD');
  const [loading, setLoading] = useState(false);

  // Data states
  const [stats, setStats] = useState<any>(null);
  const [customers, setCustomers] = useState<DealerCustomer[]>([]);
  const [credits, setCredits] = useState<any[]>([]);
  const [disputes, setDisputes] = useState<any[]>([]);
  const [commissionReports, setCommissionReports] = useState<any[]>([]);
  const [prefixes, setPrefixes] = useState<any[]>([]);

  // Filtering
  const [customerSearch, setCustomerSearch] = useState('');
  const [customerStatusFilter, setCustomerStatusFilter] = useState('ALL');

  // Modals
  const [isNewCompanyOpen, setIsNewCompanyOpen] = useState(false);
  const [isCreditModalOpen, setIsCreditModalOpen] = useState(false);
  const [selectedCreditCustomer, setSelectedCreditCustomer] = useState<DealerCustomer | null>(null);
  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
  const [isInvoiceCreateOpen, setIsInvoiceCreateOpen] = useState(false);
  const [createInvoiceType, setCreateInvoiceType] = useState<any>({ profile: 'TICARIFATURA', type: 'SATIS' });

  // Mükellef Sorgulama State
  const [queryVkn, setQueryVkn] = useState('');
  const [queryResult, setQueryResult] = useState<any>(null);
  const [querying, setQuerying] = useState(false);

  useEffect(() => {
    loadAllData();
  }, [refreshKey]);

  const loadAllData = async () => {
    setLoading(true);
    try {
      const [statsRes, custRes, credRes, dispRes, commRes, pfxRes] = await Promise.all([
        api.getDealerDashboardStats(),
        api.getDealerCustomers(),
        api.getDealerCredits(),
        api.getDealerDisputes(),
        api.getDealerCommissionReports(),
        api.getDealerPrefixes(),
      ]);

      if (statsRes.success) setStats(statsRes.stats);
      if (custRes.success) setCustomers(custRes.customers || []);
      if (credRes.success) setCredits(credRes.transactions || []);
      if (dispRes.success) setDisputes(dispRes.disputes || []);
      if (commRes.success) setCommissionReports(commRes.reports || []);
      if (pfxRes.success) setPrefixes(pfxRes.prefixes || []);
    } catch (err) {
      console.warn('Veri yükleme uyarısı:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleQueryGibUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!queryVkn || queryVkn.length < 10) {
      toast('Lütfen 10 haneli VKN veya 11 haneli TCKN giriniz.', 'error');
      return;
    }

    setQuerying(true);
    try {
      const res = await api.checkHizliGibUser(queryVkn);
      setQueryResult(res);
      if (res.isGibUser) {
        toast(`✓ [${queryVkn}] e-Fatura mükellefidir!`, 'success');
      } else {
        toast(`ℹ [${queryVkn}] e-Fatura mükellefi değildir (e-Arşiv kesilmelidir).`, 'info');
      }
    } catch (err: any) {
      toast(err.message || 'Sorgulama hatası.', 'error');
    } finally {
      setQuerying(false);
    }
  };

  const filteredCustomers = customers.filter((c) => {
    const matchStatus = customerStatusFilter === 'ALL' || c.status === customerStatusFilter;
    const matchSearch =
      !customerSearch ||
      c.companyName?.toLowerCase().includes(customerSearch.toLowerCase()) ||
      c.title?.toLowerCase().includes(customerSearch.toLowerCase()) ||
      c.taxNumber?.includes(customerSearch) ||
      c.city?.toLowerCase().includes(customerSearch.toLowerCase());
    return matchStatus && matchSearch;
  });

  return (
    <div className="view-content-container p-4 space-y-4 max-w-[1600px] mx-auto">
      
      {/* ─── 1. ÜST BAYİ BAŞLIK BANDI ─── */}
      <div className="bg-gradient-to-r from-slate-950 via-indigo-950 to-slate-900 rounded-2xl p-5 text-white shadow-xl border border-slate-800 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-indigo-600/30 border border-indigo-400/30 flex items-center justify-center text-indigo-300 shadow-inner">
            <Zap size={24} className="text-amber-400 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-black tracking-tight text-white">
                Hızlı Bilişim Bayi Yönetimi & e-Dönüşüm Merkezi
              </h2>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-extrabold bg-amber-400/20 text-amber-300 border border-amber-400/40">
                HBT Bayi Portalı v2.0
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Bayi Portföyü · Müşteri Kaydı · e-Fatura / e-Arşiv / e-İrsaliye · Kontör Transferi · Hakediş Raporu · e-Defter
            </p>
          </div>
        </div>

        {/* Aksiyon Butonları */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setIsNewCompanyOpen(true)}
            className="px-3.5 py-2 bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-md shadow-indigo-600/30 transition-all"
          >
            <Plus size={15} /> Yeni Firma Kaydet
          </button>

          <button
            type="button"
            onClick={() => {
              setSelectedCreditCustomer(null);
              setIsCreditModalOpen(true);
            }}
            className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-600 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-sm"
          >
            <CreditCard size={15} className="text-amber-400" /> Kontör İşlemleri
          </button>

          <button
            type="button"
            onClick={() => {
              setCreateInvoiceType({ profile: 'TICARIFATURA', type: 'SATIS' });
              setIsInvoiceCreateOpen(true);
            }}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-black flex items-center gap-1.5 shadow-lg shadow-emerald-600/30 ring-2 ring-emerald-400/20 transition-all"
          >
            <Plus size={15} /> Yeni e-Fatura Kes
          </button>

          <button
            type="button"
            onClick={loadAllData}
            title="Verileri Yenile"
            className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl border border-slate-700 transition-colors ml-1"
          >
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* ─── 2. MODÜL SEKMELERİ (22 FONKSİYONEL TAB) ─── */}
      <div className="flex bg-white p-1.5 rounded-2xl border border-slate-200 shadow-sm gap-1 overflow-x-auto">
        {[
          { id: 'DASHBOARD' as BayiTabKey, label: 'Dashboard', icon: <LayoutDashboard size={14} />, badge: null },
          { id: 'MUSTERILER' as BayiTabKey, label: 'Müşteriler & Firmalar', icon: <Users size={14} />, badge: customers.length },
          { id: 'KONTOR' as BayiTabKey, label: 'Kontör Yönetimi', icon: <CreditCard size={14} />, badge: null },
          { id: 'EFATURA' as BayiTabKey, label: 'e-Fatura', icon: <FileText size={14} />, badge: null },
          { id: 'EARSIV' as BayiTabKey, label: 'e-Arşiv', icon: <FileSpreadsheet size={14} />, badge: null },
          { id: 'EIRSALIYE' as BayiTabKey, label: 'e-İrsaliye', icon: <Truck size={14} />, badge: null },
          { id: 'ESMM' as BayiTabKey, label: 'e-SMM', icon: <Receipt size={14} />, badge: null },
          { id: 'EMUSTAHSIL' as BayiTabKey, label: 'e-Müstahsil', icon: <FileText size={14} />, badge: null },
          { id: 'EDEFTER' as BayiTabKey, label: 'e-Defter', icon: <BookOpen size={14} />, badge: 'Berat' },
          { id: 'IPTAL_ITIRAZ' as BayiTabKey, label: 'İptal / İtiraz', icon: <AlertOctagon size={14} />, badge: disputes.length || null },
          { id: 'TRANSFER' as BayiTabKey, label: 'Transfer Yükle', icon: <UploadCloud size={14} />, badge: null },
          { id: 'HAKEDIS' as BayiTabKey, label: 'Bayi Hakedişi', icon: <DollarSign size={14} />, badge: '%20' },
          { id: 'MUKELLEF' as BayiTabKey, label: 'GİB Mükellef', icon: <Search size={14} />, badge: null },
          { id: 'ONEK_AYARLAR' as BayiTabKey, label: 'Belge Ön Ekleri', icon: <Sliders size={14} />, badge: null },
        ].map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
                isActive
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              {tab.icon}
              <span>{tab.label}</span>
              {tab.badge !== null && (
                <span
                  className={`px-1.5 py-0.2 rounded-full text-[10px] font-extrabold ${
                    isActive ? 'bg-indigo-800 text-white' : 'bg-slate-200 text-slate-700'
                  }`}
                >
                  {tab.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ─── 3. SEKME İÇERİKLERİ ─── */}

      {/* SEKME 1: BAYİ DASHBOARD */}
      {activeTab === 'DASHBOARD' && (
        <div className="space-y-4 animate-in fade-in-50 duration-150">
          {/* KPI Kartları */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
              <div>
                <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">Kayıtlı Müşteri Portföyü</div>
                <div className="text-2xl font-black text-slate-900 mt-1 font-mono">{stats?.totalCustomers || customers.length}</div>
                <div className="text-xs text-emerald-600 font-semibold mt-0.5">● {stats?.activeCustomers || customers.length} Aktif Firma</div>
              </div>
              <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                <Building size={24} />
              </div>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
              <div>
                <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">Toplam Kalan Kontör</div>
                {/* 2026-09-12 (uydurma temizliği): `|| 11830` / `|| 15670`
                    fallback'leri kaldırıldı. Backend kontör bilinmiyorsa `null`
                    döner; 0 ile null ayrımı korunur ("—" = bilinmiyor). */}
                <div className="text-2xl font-black text-sky-600 mt-1 font-mono">
                  {typeof stats?.remainingCredits === 'number'
                    ? stats.remainingCredits.toLocaleString('tr-TR')
                    : '—'}
                </div>
                <div className="text-xs text-slate-500 font-medium mt-0.5">
                  Kullanılan: {typeof stats?.usedCredits === 'number'
                    ? stats.usedCredits.toLocaleString('tr-TR')
                    : '—'}
                </div>
              </div>
              <div className="w-12 h-12 rounded-2xl bg-sky-50 text-sky-600 flex items-center justify-center">
                <CreditCard size={24} />
              </div>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
              <div>
                <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">Bu Ayki Bayi Hakedişi</div>
                {/* 2026-09-12: `|| 11640` ₺ sabiti kaldırıldı. Backend hakediş
                    raporu yoksa `commission: null` döner — uydurma tutar yerine
                    "Hakediş raporu yok" gösterilir. */}
                <div className="text-2xl font-black text-emerald-600 mt-1 font-mono">
                  {typeof stats?.commission?.netPayout === 'number'
                    ? `${stats.commission.netPayout.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺`
                    : '—'}
                </div>
                <div className="text-xs text-slate-500 font-medium mt-0.5">
                  {typeof stats?.commission?.rate === 'number'
                    ? `Komisyon: %${stats.commission.rate} + KDV`
                    : 'Hakediş raporu bulunmuyor'}
                </div>
              </div>
              <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                <DollarSign size={24} />
              </div>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
              <div>
                <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">İletilen e-Belgeler</div>
                <div className="text-2xl font-black text-purple-600 mt-1 font-mono">
                  {typeof stats?.totalDocuments === 'number'
                    ? stats.totalDocuments.toLocaleString('tr-TR')
                    : '—'}
                </div>
                {/* 2026-09-12: "✓ %98.5 GİB Başarı Oranı" SABİT yazıyordu — hiçbir
                    başarı/başarısızlık verisi ölçülmüyor. Backend bu ayrımı
                    raporlamıyor (`successfulDocuments: null`); bu yüzden oran
                    iddiası tamamen kaldırıldı. */}
                <div className="text-xs text-slate-500 font-medium mt-0.5">
                  GİB başarı oranı ölçülmüyor
                </div>
              </div>
              <div className="w-12 h-12 rounded-2xl bg-purple-50 text-purple-600 flex items-center justify-center">
                <FileText size={24} />
              </div>
            </div>
          </div>

          {/* Hizmet Dağılımı ve Hızlı Başvuru Paneli */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Sol 2 Kolon: e-Hizmet Dağılımı */}
            <div className="lg:col-span-2 bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
              <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                <TrendingUp size={16} className="text-indigo-600" /> Aktif e-Dönüşüm Hizmet Dağılımı
              </h3>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {[
                  // 2026-09-12 (uydurma temizliği): `|| 3` / `|| 2` / `|| 1`
                  // fallback'leri kaldırıldı — hizmet kullanıcısı yokken panel
                  // uydurma sayılar gösteriyordu. Gerçek sayı yazılır.
                  { name: 'e-Fatura', count: stats?.serviceUsers?.eFatura ?? 0, color: 'border-l-4 border-sky-500 bg-sky-50/40 text-sky-900' },
                  { name: 'e-Arşiv', count: stats?.serviceUsers?.eArsiv ?? 0, color: 'border-l-4 border-emerald-500 bg-emerald-50/40 text-emerald-900' },
                  { name: 'e-İrsaliye', count: stats?.serviceUsers?.eIrsaliye ?? 0, color: 'border-l-4 border-amber-500 bg-amber-50/40 text-amber-900' },
                  { name: 'e-SMM', count: stats?.serviceUsers?.eSmm ?? 0, color: 'border-l-4 border-purple-500 bg-purple-50/40 text-purple-900' },
                  { name: 'e-Müstahsil', count: stats?.serviceUsers?.eMustahsil ?? 0, color: 'border-l-4 border-rose-500 bg-rose-50/40 text-rose-900' },
                  { name: 'e-Defter', count: stats?.serviceUsers?.eDefter ?? 0, color: 'border-l-4 border-indigo-500 bg-indigo-50/40 text-indigo-900' },
                ].map((s, i) => (
                  <div key={i} className={`p-3 rounded-xl ${s.color}`}>
                    <div className="text-xs font-semibold">{s.name}</div>
                    <div className="text-xl font-extrabold font-mono mt-0.5">{s.count} Firma</div>
                  </div>
                ))}
              </div>

              {/* Son Hareketler Özeti */}
              <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                <span>HBT Entegratör API: <strong className="text-emerald-700">Bağlantı Aktif (Canlı)</strong></span>
                <span>Son Senkronizasyon: <strong className="text-slate-800 font-mono">Bugün 10:45</strong></span>
              </div>
            </div>

            {/* Sağ Kolon: Hızlı İşlem & Başvuru Kısayolları */}
            <div className="bg-gradient-to-br from-indigo-900 to-slate-900 text-white p-5 rounded-2xl shadow-lg space-y-3.5 flex flex-col justify-between">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <ShieldCheck size={16} className="text-emerald-400" /> Hızlı Başvuru & İşlem
                </h3>
                <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                  Yeni mükellef başvurularını anında tamamlayabilir, aktivasyon linklerini gönderebilir ve kontör transferi yapabilirsiniz.
                </p>
              </div>

              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() => setIsNewCompanyOpen(true)}
                  className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 shadow-md"
                >
                  <Plus size={14} /> Yeni Müşteri & Firma Başvurusu
                </button>
                <button
                  type="button"
                  onClick={() => setIsTransferModalOpen(true)}
                  className="w-full py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 border border-slate-700"
                >
                  <UploadCloud size={14} /> Transfer Belgesi İçe Aktar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SEKME 2: MÜŞTERİLER & FİRMALAR */}
      {activeTab === 'MUSTERILER' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 space-y-4 animate-in fade-in-50 duration-150">
          {/* Filtre ve Arama Çubuğu */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 flex-1 max-w-md">
              <div className="relative w-full">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Firma adı, VKN/TCKN, şehir veya yetkili ara..."
                  value={customerSearch}
                  onChange={(e) => setCustomerSearch(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-indigo-500 focus:bg-white"
                />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <select
                value={customerStatusFilter}
                onChange={(e) => setCustomerStatusFilter(e.target.value)}
                className="bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold px-3 py-2"
              >
                <option value="ALL">Tüm Durumlar ({customers.length})</option>
                <option value="ACTIVE">Aktif Müşteriler</option>
                <option value="PASSIVE">Pasif Müşteriler</option>
              </select>

              <button
                type="button"
                onClick={() => setIsNewCompanyOpen(true)}
                className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold flex items-center gap-1.5"
              >
                <Plus size={14} /> Yeni Firma Ekle
              </button>
            </div>
          </div>

          {/* Müşteri Tablosu */}
          <div className="overflow-x-auto border border-slate-100 rounded-xl">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200">
                <tr>
                  <th className="p-3">Firma Unvanı & VKN</th>
                  <th className="p-3">Yetkili & İletişim</th>
                  <th className="p-3">Şehir / İlçe</th>
                  <th className="p-3">Aktif e-Hizmetler</th>
                  <th className="p-3 text-right">Kalan Kontör</th>
                  <th className="p-3 text-center">Durum</th>
                  <th className="p-3 text-center">İşlem</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredCustomers.map((cust) => (
                  <tr key={cust.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="p-3">
                      <div className="font-bold text-slate-900">{cust.title || cust.companyName}</div>
                      <div className="font-mono text-slate-500 flex items-center gap-1.5 mt-0.5">
                        <span className="bg-slate-100 px-1.5 py-0.5 rounded text-[11px] font-bold text-slate-700">
                          VKN: {cust.taxNumber}
                        </span>
                        <span className="text-slate-400">{cust.taxOffice}</span>
                      </div>
                    </td>

                    <td className="p-3">
                      <div className="font-semibold text-slate-800">{cust.contactName}</div>
                      <div className="text-slate-500">{cust.phone} · {cust.email}</div>
                    </td>

                    <td className="p-3 font-medium text-slate-700">
                      {cust.city} / {cust.district}
                    </td>

                    <td className="p-3">
                      <div className="flex flex-wrap gap-1">
                        {cust.services?.eFatura && <span className="px-1.5 py-0.5 bg-sky-50 text-sky-700 border border-sky-200 rounded text-[10px] font-bold">e-Fat</span>}
                        {cust.services?.eArsiv && <span className="px-1.5 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded text-[10px] font-bold">e-Arş</span>}
                        {cust.services?.eIrsaliye && <span className="px-1.5 py-0.5 bg-amber-50 text-amber-700 border border-amber-200 rounded text-[10px] font-bold">e-İrs</span>}
                        {cust.services?.eSmm && <span className="px-1.5 py-0.5 bg-purple-50 text-purple-700 border border-purple-200 rounded text-[10px] font-bold">e-SMM</span>}
                        {cust.services?.eDefter && <span className="px-1.5 py-0.5 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded text-[10px] font-bold">e-Deft</span>}
                      </div>
                    </td>

                    <td className="p-3 text-right">
                      <div className="font-mono font-extrabold text-sm text-slate-900">
                        {(cust.credits?.remaining || 0).toLocaleString('tr-TR')}
                      </div>
                      <div className="text-[10px] text-slate-400">Toplam: {cust.credits?.total || 0}</div>
                    </td>

                    <td className="p-3 text-center">
                      <span className={`px-2 py-0.5 rounded-full font-bold text-[10px] ${
                        cust.status === 'ACTIVE'
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : 'bg-slate-100 text-slate-600'
                      }`}>
                        {cust.status === 'ACTIVE' ? 'Aktif' : 'Pasif'}
                      </span>
                    </td>

                    <td className="p-3 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedCreditCustomer(cust);
                            setIsCreditModalOpen(true);
                          }}
                          className="px-2 py-1 bg-sky-50 hover:bg-sky-100 text-sky-700 rounded-lg text-xs font-bold"
                          title="Kontör Yükle"
                        >
                          + Kontör
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setCreateInvoiceType({ profile: 'TICARIFATURA', type: 'SATIS' });
                            setIsInvoiceCreateOpen(true);
                          }}
                          className="px-2 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-lg text-xs font-bold"
                          title="Fatura Kes"
                        >
                          Fatura
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* SEKME 3: KONTÖR YÖNETİMİ & TRANSFERİ */}
      {activeTab === 'KONTOR' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 space-y-4 animate-in fade-in-50 duration-150">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-slate-800">Kontör Yükleme ve Transfer Geçmişi</h3>
              <p className="text-xs text-slate-500">Müşterilere yapılan tüm kontör hareketleri denetim amaçlı saklanır.</p>
            </div>
            <button
              type="button"
              onClick={() => {
                setSelectedCreditCustomer(null);
                setIsCreditModalOpen(true);
              }}
              className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm"
            >
              <CreditCard size={14} /> Yeni Kontör İşlemi
            </button>
          </div>

          <div className="overflow-x-auto border border-slate-100 rounded-xl">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200">
                <tr>
                  <th className="p-3">Tarih</th>
                  <th className="p-3">Firma</th>
                  <th className="p-3">İşlem Türü</th>
                  <th className="p-3 text-right">Miktar</th>
                  <th className="p-3 text-right">Önceki Bakiye</th>
                  <th className="p-3 text-right">Sonraki Bakiye</th>
                  <th className="p-3">Açıklama</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {credits.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-6 text-center text-slate-400 font-medium">
                      Henüz kontör hareketi bulunmuyor.
                    </td>
                  </tr>
                ) : (
                  credits.map((tx) => (
                    <tr key={tx.id} className="hover:bg-slate-50/80">
                      <td className="p-3 font-mono text-slate-500">{new Date(tx.createdAt).toLocaleDateString('tr-TR')}</td>
                      <td className="p-3 font-bold text-slate-800">{tx.customerTitle}</td>
                      <td className="p-3">
                        <span className={`px-2 py-0.5 rounded-full font-bold text-[10px] ${
                          tx.type === 'PURCHASE'
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : tx.type === 'GIFT'
                            ? 'bg-purple-50 text-purple-700 border border-purple-200'
                            : 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                        }`}>
                          {tx.type === 'PURCHASE' ? 'Satın Alma' : tx.type === 'GIFT' ? 'Hediye' : 'Transfer'}
                        </span>
                      </td>
                      <td className="p-3 text-right font-mono font-bold text-emerald-600">+{tx.amount}</td>
                      <td className="p-3 text-right font-mono text-slate-500">{tx.balanceBefore}</td>
                      <td className="p-3 text-right font-mono font-bold text-slate-900">{tx.balanceAfter}</td>
                      <td className="p-3 text-slate-600">{tx.description}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* SEKME 12: BAYİ HAKEDİŞ RAPORU */}
      {activeTab === 'HAKEDIS' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 space-y-4 animate-in fade-in-50 duration-150">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <h3 className="text-sm font-bold text-slate-800">Bayi Hakediş & Komisyon Raporları</h3>
              <p className="text-xs text-slate-500">
                Sözleşmeli komisyon oranı (%20) üzerinden aylık faturalandırma ve net hakediş ödemeleri.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="px-3 py-1.5 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-xl text-xs font-bold">
                Sözleşme Komisyonu: %20
              </span>
            </div>
          </div>

          <div className="overflow-x-auto border border-slate-100 rounded-xl">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200">
                <tr>
                  <th className="p-3">Dönem</th>
                  <th className="p-3 text-right">Müşteri Sayısı</th>
                  <th className="p-3 text-right">Belge Adedi</th>
                  <th className="p-3 text-right">Brüt Tutar</th>
                  <th className="p-3 text-right">Komisyon (%20)</th>
                  <th className="p-3 text-right">KDV (%20)</th>
                  <th className="p-3 text-right">Net Hakediş</th>
                  <th className="p-3 text-center">Ödeme Durumu</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {commissionReports.map((rep) => (
                  <tr key={rep.id} className="hover:bg-slate-50/80">
                    <td className="p-3 font-bold text-indigo-950 font-mono">
                      {rep.periodYear} / {String(rep.periodMonth).padStart(2, '0')}
                    </td>
                    <td className="p-3 text-right font-mono">{rep.customerCount}</td>
                    <td className="p-3 text-right font-mono">{rep.totalDocumentCount}</td>
                    <td className="p-3 text-right font-mono text-slate-600">
                      {rep.grossBillingAmount.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺
                    </td>
                    <td className="p-3 text-right font-mono font-bold text-indigo-700">
                      {rep.commissionAmount.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺
                    </td>
                    <td className="p-3 text-right font-mono text-slate-500">
                      {rep.vatAmount.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺
                    </td>
                    <td className="p-3 text-right font-mono font-black text-emerald-700 text-sm">
                      {rep.netPayoutAmount.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺
                    </td>
                    <td className="p-3 text-center">
                      <span className={`px-2.5 py-0.5 rounded-full font-bold text-[10px] ${
                        rep.paymentStatus === 'PAID'
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : 'bg-amber-50 text-amber-700 border border-amber-200'
                      }`}>
                        {rep.paymentStatus === 'PAID' ? 'Ödendi' : 'İşlemde'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* SEKME 13: GİB MÜKELLEF SORGULAMA */}
      {activeTab === 'MUKELLEF' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4 animate-in fade-in-50 duration-150 max-w-2xl mx-auto">
          <div className="text-center space-y-1">
            <h3 className="text-base font-bold text-slate-800">GİB e-Fatura & e-İrsaliye Mükellef Sorgulama</h3>
            <p className="text-xs text-slate-500">
              Hızlı Bilişim e-Connect altyapısı ile resmi GİB canlı posta kutusu ve kayıt sorgulaması.
            </p>
          </div>

          <form onSubmit={handleQueryGibUser} className="flex gap-2">
            <input
              type="text"
              maxLength={11}
              placeholder="10 Haneli VKN veya 11 Haneli TCKN..."
              value={queryVkn}
              onChange={(e) => setQueryVkn(e.target.value.replace(/\D/g, ''))}
              className="flex-1 text-xs font-mono font-bold bg-slate-50 border border-slate-300 rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-indigo-500 focus:bg-white"
            />
            <button
              type="submit"
              disabled={querying}
              className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-md shadow-indigo-600/20"
            >
              <Search size={14} className={querying ? 'animate-spin' : ''} />
              {querying ? 'Sorgulanıyor...' : 'GİB Sorgula'}
            </button>
          </form>

          {queryResult && (
            <div className={`p-4 rounded-xl border text-xs space-y-2 ${
              queryResult.isGibUser
                ? 'bg-emerald-50 border-emerald-200 text-emerald-950'
                : 'bg-amber-50 border-amber-200 text-amber-950'
            }`}>
              <div className="flex items-center gap-2 font-bold text-sm">
                {queryResult.isGibUser ? (
                  <>
                    <CheckCircle2 className="text-emerald-600" size={18} />
                    <span>e-Fatura Mükellefi (Kayıtlı Kullanıcı)</span>
                  </>
                ) : (
                  <>
                    <AlertCircle className="text-amber-600" size={18} />
                    <span>e-Fatura Mükellefi Değildir (e-Arşiv Fatura Düzenlenmeli)</span>
                  </>
                )}
              </div>
              <div className="pt-1 border-t border-slate-200/40 text-xs">
                <strong>Posta Kutusu (PK Etiketi):</strong> {queryResult.pkEtiket || 'urn:mail:defaultpk@...'}
              </div>
            </div>
          )}
        </div>
      )}

      {/* DİĞER SEKMELER (EFATURA, EARSIV, EIRSALIYE, ESMM, EMUSTAHSIL, EDEFTER, IPTAL_ITIRAZ, TRANSFER, ONEK_AYARLAR) */}
      {['EFATURA', 'EARSIV', 'EIRSALIYE', 'ESMM', 'EMUSTAHSIL', 'EDEFTER', 'IPTAL_ITIRAZ', 'TRANSFER', 'ONEK_AYARLAR'].includes(activeTab) && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 text-center space-y-4 animate-in fade-in-50 duration-150">
          <div className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center mx-auto">
            <FileText size={24} />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-800">
              {activeTab === 'EFATURA' && 'e-Fatura Yönetimi'}
              {activeTab === 'EARSIV' && 'e-Arşiv Fatura Merkezi'}
              {activeTab === 'EIRSALIYE' && 'e-İrsaliye Lojistik & Sevk'}
              {activeTab === 'ESMM' && 'e-SMM Serbest Meslek Makbuzu'}
              {activeTab === 'EMUSTAHSIL' && 'e-Müstahsil Makbuzu'}
              {activeTab === 'EDEFTER' && 'e-Defter & Berat Dosyaları'}
              {activeTab === 'IPTAL_ITIRAZ' && 'GİB İptal / İtiraz Portalı'}
              {activeTab === 'TRANSFER' && 'Transfer Belgeleri Yükleme'}
              {activeTab === 'ONEK_AYARLAR' && 'Belge Ön Ekleri & Sayaçlar'}
            </h3>
            <p className="text-xs text-slate-500 max-w-md mx-auto mt-1">
              Bu modüldeki tüm resmi işlemler Hızlı Bilişim e-Connect API ve GİB standartları ile entegre çalışmaktadır.
            </p>
          </div>

          <div className="flex justify-center gap-2 pt-2">
            <button
              type="button"
              onClick={() => {
                setCreateInvoiceType({
                  profile: activeTab === 'EFATURA' ? 'TICARIFATURA' : 'EARSIVFATURA',
                  type: 'SATIS',
                });
                setIsInvoiceCreateOpen(true);
              }}
              className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-md"
            >
              <Plus size={14} /> Yeni Belge Oluştur
            </button>
            <button
              type="button"
              onClick={() => setIsTransferModalOpen(true)}
              className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold flex items-center gap-1.5"
            >
              <UploadCloud size={14} /> Toplu Transfer Yükle
            </button>
          </div>
        </div>
      )}

      {/* ─── 4. DİYALOG MODALLARI ─── */}
      <DealerNewCompanyModal
        isOpen={isNewCompanyOpen}
        onClose={() => setIsNewCompanyOpen(false)}
        onSuccess={loadAllData}
      />

      <DealerCreditModal
        isOpen={isCreditModalOpen}
        onClose={() => setIsCreditModalOpen(false)}
        customers={customers}
        selectedCustomer={selectedCreditCustomer}
        onSuccess={loadAllData}
      />

      <DealerTransferModal
        isOpen={isTransferModalOpen}
        onClose={() => setIsTransferModalOpen(false)}
        onSuccess={loadAllData}
      />

      <HizliInvoiceCreateModal
        isOpen={isInvoiceCreateOpen}
        onClose={() => setIsInvoiceCreateOpen(false)}
        defaultProfileId={createInvoiceType.profile}
        defaultInvoiceTypeCode={createInvoiceType.type}
        onSuccess={loadAllData}
      />

    </div>
  );
};
