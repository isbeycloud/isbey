import React, { useState, useEffect, useRef } from 'react';
import { api } from '../../../services/api';
import { useToast } from '../../../context/ToastContext';
import { useApp } from '../../../context/AppContext';
import { DataGrid } from '../../common/DataGrid';
import type { Column } from '../../common/DataGrid';
import type { ExternalCustomer } from '../../../types';
import { ConvertToCompanyModal } from './ConvertToCompanyModal';
import { MatchCompanyModal } from './MatchCompanyModal';
import { HizliCustomerDetailModal } from './HizliCustomerDetailModal';
import { PortfolioImportModal } from './PortfolioImportModal';
import { HizliMukellefEkleModal } from './HizliMukellefEkleModal';
import {
  Users,
  Building,
  RefreshCw,
  Search,
  Plus,
  Link2,
  CheckCircle2,
  AlertCircle,
  Clock,
  ExternalLink,
  Sparkles,
  Zap,
  ChevronDown,
  ChevronUp,
  FileText,
  Download,
  X,
  Package,
  Filter,
  Eye,
  Inbox,
} from 'lucide-react';

interface SearchForm {
  musteriAdi: string;
  ad: string;
  unvan: string;
  soyad: string;
  vknTckn: string;
  aktifPasif: string;
  musteriTipi: string;
  hizmet: string;
  sehir: string;
  musteriTemsilcisi: string;
  sorumluAdi: string;
  musteriNo: string;
  hizmetDurumu: string;
  tarifeTipi: string;
}

const SEHIRLER = ['Adana','Adıyaman','Afyonkarahisar','Ağrı','Aksaray','Amasya','Ankara','Antalya','Ardahan','Artvin','Aydın','Balıkesir','Bartın','Batman','Bayburt','Bilecik','Bingöl','Bitlis','Bolu','Burdur','Bursa','Çanakkale','Çankırı','Çorum','Denizli','Diyarbakır','Düzce','Edirne','Elazığ','Erzincan','Erzurum','Eskişehir','Gaziantep','Giresun','Gümüşhane','Hakkari','Hatay','Iğdır','Isparta','İstanbul','İzmir','Kahramanmaraş','Karabük','Karaman','Kars','Kastamonu','Kayseri','Kırıkkale','Kırklareli','Kırşehir','Kilis','Kocaeli','Konya','Kütahya','Malatya','Manisa','Mardin','Mersin','Muğla','Muş','Nevşehir','Niğde','Ordu','Osmaniye','Rize','Sakarya','Samsun','Siirt','Sinop','Sivas','Şanlıurfa','Şırnak','Tekirdağ','Tokat','Trabzon','Tunceli','Uşak','Van','Yalova','Yozgat','Zonguldak'];

const emptyForm = (): SearchForm => ({
  musteriAdi: '', ad: '', unvan: '', soyad: '', vknTckn: '', aktifPasif: '',
  musteriTipi: '', hizmet: '', sehir: '', musteriTemsilcisi: '',
  sorumluAdi: '', musteriNo: '', hizmetDurumu: '', tarifeTipi: '',
});

export const HizliBilisimCustomerListView: React.FC = () => {
  const { showToast } = useToast();
  const { triggerRefresh, switchTenant, setActiveView } = useApp();

  const [customers, setCustomers] = useState<ExternalCustomer[]>([]);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showBulkMenu, setShowBulkMenu] = useState(false);
  const [showEnvelopeModal, setShowEnvelopeModal] = useState(false);
  const [envelopeForm, setEnvelopeForm] = useState({ hizmetTuru: '', envelopeNo: '', yil: '2026' });
  const [showEkleModal, setShowEkleModal] = useState(false);
  const [showPortfolio, setShowPortfolio] = useState(false);
  const bulkMenuRef = useRef<HTMLDivElement>(null);

  const [form, setForm] = useState<SearchForm>(emptyForm());
  const [kpis, setKpis] = useState({ total: 0, new: 0, imported: 0, userCreated: 0, matched: 0, error: 0 });
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const bulkConverting = false;

  const [detailCustomerId, setDetailCustomerId] = useState<string | null>(null);
  const [convertCustomer, setConvertCustomer] = useState<ExternalCustomer | null>(null);
  const [matchCustomer, setMatchCustomer] = useState<ExternalCustomer | null>(null);

  useEffect(() => { loadData(); }, [statusFilter]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (bulkMenuRef.current && !bulkMenuRef.current.contains(e.target as Node)) {
        setShowBulkMenu(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const res = await api.getHizliCustomers({
        status: statusFilter,
        // 2026-10-02: `|| undefined` KALDIRILDI. `buildQuery` undefined'i zaten
        // duser; burada undefined uretmek eski hatanin (search=undefined) kaynagiydi.
        search: form.vknTckn || form.musteriAdi || form.unvan || '',
      });
      if (res.success) {
        setCustomers(res.customers || []);
        if (res.kpis) setKpis(res.kpis);
      }
    } catch (err: any) {
      showToast(err.message || 'Müşteri listesi yüklenemedi.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      const res = await api.syncHizliCustomers();
      // 2026-10-01: Sonuç artık AYRIŞTIRILMIŞ (checked/updated/unchanged/failed).
      // Portföy boşsa teknik sağlayıcı metni yerine aksiyon odaklı mesaj gelir
      // ve kullanıcı doğrudan "Mükellef Ekle" akışına yönlendirilir.
      if (res.bos) {
        showToast(res.message, 'info');
        setShowEkleModal(true);
      } else if (res.success) {
        showToast(res.message, 'success');
        loadData();
        triggerRefresh();
      } else {
        showToast(res.message, res.failed > 0 ? 'warning' : 'info');
        loadData();
      }
    } catch (err: any) {
      showToast(err.message || 'Güncelleme başarısız.', 'error');
    } finally {
      setSyncing(false);
    }
  };

  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSelectedIds(e.target.checked ? customers.map(c => c.id) : []);
  };

  const handleToggleSelect = (id: string) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const [conversionQueue, setConversionQueue] = useState<ExternalCustomer[]>([]);
  const handleBulkConvert = () => {
    const queue = customers.filter(c => selectedIds.includes(c.id) && !c.isbeyCompanyId);
    if (!queue.length) { showToast('Seçilen müşteriler zaten üye.', 'info'); return; }
    setConversionQueue(queue); setConvertCustomer(queue[0]);
  };
  const closeConversion = () => {
    const remaining = conversionQueue.filter(c => c.id !== convertCustomer?.id);
    setConversionQueue(remaining); setConvertCustomer(remaining[0] || null);
  };

  const clearForm = () => { setForm(emptyForm()); loadData(); };

  const statusBadge = (st: string) => {
    /* 2026-09-13 (tasarım düzeltmesi): Rozet renkleri ham hex yerine tema
       token'larına bağlandı. Kenarlık rengi önce `${s.color}40` şeklinde
       string birleştirmeyle türetiliyordu — token kullanınca bu ifade
       geçersiz CSS üretir, bu yüzden kenarlık ayrı alan oldu. */
    const map: Record<string, { label: string; color: string; bg: string; border: string }> = {
      NEW:          { label: 'Yeni',            color: 'var(--warning)',  bg: 'rgba(232,162,61,0.12)',  border: 'rgba(232,162,61,0.25)' },
      IMPORTED:     { label: 'Aktarıldı',       color: 'var(--info)',     bg: 'rgba(59,130,246,0.12)',  border: 'rgba(59,130,246,0.25)' },
      USER_CREATED: { label: 'Kullanıcı Aktif', color: 'var(--success)',  bg: 'rgba(30,169,124,0.12)',  border: 'rgba(30,169,124,0.25)' },
      MATCHED:      { label: 'Eşleştirildi',    color: 'var(--primary)',  bg: 'rgba(209,33,49,0.12)',   border: 'rgba(209,33,49,0.25)' },
      ERROR:        { label: 'Hata',            color: 'var(--danger)',   bg: 'rgba(239,83,80,0.12)',   border: 'rgba(239,83,80,0.25)' },
    };
    const s = map[st];
    if (!s) return <span style={{ fontSize: 'var(--fs-xs, 11px)', color: 'var(--text-muted)' }}>{st}</span>;
    return (
      <span style={{
        display: 'inline-flex', alignItems: 'center', gap: '4px',
        padding: '3px 8px', borderRadius: '999px', fontSize: '11px', fontWeight: 700,
        color: s.color, background: s.bg, border: `1px solid ${s.border}`,
      }}>
        <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: s.color, display: 'inline-block' }} />
        {s.label}
      </span>
    );
  };

  const columns: Column<ExternalCustomer>[] = [
    {
      key: 'id', title: '', width: '40px',
      render: c => (
        <input type="checkbox" checked={selectedIds.includes(c.id)}
          onChange={() => handleToggleSelect(c.id)} style={{ cursor: 'pointer', accentColor: 'var(--primary)' }} />
      ),
    },
    { key: 'status', title: 'Durum', width: '130px', render: c => statusBadge(c.status) },
    {
      key: 'companyName', title: 'Firma / Ticari Unvan',
      render: c => (
        <div style={{ cursor: 'pointer' }} onClick={() => setDetailCustomerId(c.id)}>
          <div style={{ fontWeight: 700, color: 'var(--info)', display: 'flex', alignItems: 'center', gap: '5px' }}>
            <Building size={13} /><span>{c.companyName}</span>
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
            {c.externalId} · {c.title || c.companyName}
          </div>
        </div>
      ),
    },
    {
      key: 'contactName', title: 'Yetkili / Şehir', width: '155px',
      render: c => (
        <div>
          <div style={{ fontWeight: 600, fontSize: '12.5px' }}>{c.contactName || '-'}</div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{c.city || '—'}</div>
        </div>
      ),
    },
    {
      key: 'taxNumber', title: 'VKN / Vergi Dairesi', width: '155px',
      render: c => (
        <div>
          <div style={{ fontWeight: 700, letterSpacing: '0.5px', fontFamily: 'var(--font-mono)', fontSize: '12px' }}>{c.taxNumber}</div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{c.taxOffice || '—'}</div>
        </div>
      ),
    },
    {
      key: 'phone', title: 'İletişim', width: '175px',
      render: c => (
        <div style={{ fontSize: '12px' }}>
          <div>{c.phone || '-'}</div>
          <div style={{ color: 'var(--text-muted)', fontSize: '11px', marginTop: '2px' }}>{c.email || '-'}</div>
        </div>
      ),
    },
    {
      key: 'registeredAt', title: 'Kayıt Tarihi', width: '110px',
      render: c => (
        <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
          {c.registeredAt ? new Date(c.registeredAt).toLocaleDateString('tr-TR') : '—'}
        </span>
      ),
    },
    {
      key: 'isbeyCompanyId', title: 'İŞBEY', width: '130px',
      render: c => {
        if (c.isbeyCompanyCode) {
          return (
            <div>
              <strong style={{ color: 'var(--success)', fontSize: 'var(--fs-sm, 12px)' }}>{c.isbeyCompanyCode}</strong>
              {c.isbeyUsername && (
                <div style={{ fontSize: '10.5px', color: 'var(--text-muted)' }}>@{c.isbeyUsername}</div>
              )}
            </div>
          );
        }
        return <span style={{ fontSize: '11px', color: 'var(--text-light)' }}>Aktarılmadı</span>;
      },
    },
    {
      key: 'actions', title: 'İşlemler', width: '260px',
      render: c => (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px', alignItems: 'center' }}>
          {c.isbeyCompanyId && <select aria-label={`${c.companyName} işlemleri`} className="form-select" value="" onChange={async e => {
            const action = e.target.value;
            if (!action) return;
            if (await switchTenant(c.isbeyCompanyId!)) setActiveView(action === 'invoices' ? 'edonusum' : 'dashboard');
            else showToast('Firmaya geçiş yapılamadı. Firma durumu ve üyelikleri kontrol edin.', 'error');
          }}><option value="">İşlem seçin</option><option value="company">Firmaya geç</option><option value="invoices">Geçmiş e-Faturalar / Başvuru</option></select>}
          {!c.isbeyCompanyId ? (
            <button type="button" className="btn btn-primary btn-xs"
              onClick={() => setConvertCustomer(c)}
              style={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11.5px' }}
            >
              <Plus size={12} /><span>Firma Oluştur</span>
            </button>
          ) : (
            <button type="button" className="btn btn-secondary btn-xs"
              onClick={() => setDetailCustomerId(c.id)}
              style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11.5px' }}
            >
              <ExternalLink size={12} /><span>Yönet</span>
            </button>
          )}
          <button type="button" className="btn btn-ghost btn-xs"
            onClick={() => setDetailCustomerId(c.id)} title="Detay"
            style={{ display: 'flex', alignItems: 'center', padding: '4px 7px' }}
          >
            <Eye size={12} />
          </button>
        </div>
      ),
    },
  ];

  const fieldStyle: React.CSSProperties = {
    background: 'var(--bg-app)', border: '1px solid var(--border-strong)',
    borderRadius: '8px', padding: '7px 10px', fontSize: '12.5px',
    color: 'var(--text-main)', outline: 'none', width: '100%',
  };
  const labelStyle: React.CSSProperties = {
    display: 'block', fontSize: '11.5px', fontWeight: 600,
    color: 'var(--text-muted)', marginBottom: '4px',
  };

  const kpiCards = [
    { label: 'Toplam Müşteri',      count: kpis.total,       icon: <Users size={18} />,        color: 'var(--info)',    bg: 'rgba(59,130,246,0.1)',  shadow: 'rgba(59,130,246,0.19)',  filter: 'ALL' },
    { label: 'Yeni (Bekleyen)',      count: kpis.new,          icon: <Clock size={18} />,        color: 'var(--warning)', bg: 'rgba(232,162,61,0.1)', shadow: 'rgba(232,162,61,0.19)', filter: 'NEW' },
    { label: "İŞBEY'e Aktarıldı",   count: kpis.imported,    icon: <Building size={18} />,     color: 'var(--info)',    bg: 'rgba(59,130,246,0.1)',  shadow: 'rgba(59,130,246,0.19)', filter: 'IMPORTED' },
    { label: 'Kullanıcı Aktif',     count: kpis.userCreated, icon: <CheckCircle2 size={18} />, color: 'var(--success)', bg: 'rgba(30,169,124,0.1)', shadow: 'rgba(30,169,124,0.19)',  filter: 'USER_CREATED' },
    { label: 'Eşleştirildi',        count: kpis.matched,     icon: <Link2 size={18} />,        color: 'var(--primary)', bg: 'rgba(209,33,49,0.1)',  shadow: 'rgba(209,33,49,0.19)',  filter: 'MATCHED' },
    { label: 'Hatalı Kayıt',        count: kpis.error,       icon: <AlertCircle size={18} />,  color: 'var(--danger)',  bg: 'rgba(239,83,80,0.1)',  shadow: 'rgba(239,83,80,0.19)',  filter: 'ERROR' },
  ];

  return (
    <div className="view-content-container">

      {/* ── Başlık ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 'var(--fs-xl, 20px)', fontWeight: 700, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Zap size={22} style={{ color: 'var(--info)' }} />
            Hızlı Bilişim — Müşteri İşlemleri
          </h2>
          <p style={{ margin: '3px 0 0', fontSize: 'var(--fs-sm, 12px)', color: 'var(--text-muted)' }}>
            Hızlı Bilişim'deki mükellefleri VKN/TCKN ile sorgulayın, İŞBEY portföyünüze ekleyin ve mevcut kayıtları güncelleyin.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
          <button className="btn btn-primary" onClick={() => setShowPortfolio(true)}>Portföyden müşteri seç</button>
          {selectedIds.length > 0 && (
            <button type="button" className="btn btn-success"
              onClick={handleBulkConvert} disabled={bulkConverting}
              style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 700 }}
            >
              <Sparkles size={16} />
              {bulkConverting ? 'Aktarılıyor...' : `Seçilenleri İŞBEY'e Aktar (${selectedIds.length})`}
            </button>
          )}
          <button type="button" className="btn btn-success"
            onClick={() => setShowEkleModal(true)}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 700 }}
          >
            <Plus size={14} /> Hızlı Bilişim'den Mükellef Ekle
          </button>
          <button type="button" className="btn btn-primary"
            onClick={handleSync} disabled={syncing}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 700 }}
          >
            <RefreshCw size={15} className={syncing ? 'spin' : ''} />
            {syncing ? 'Güncelleniyor...' : "HB'den Güncelle"}
          </button>
        </div>
      </div>

      {/* ── AYRIM NOTU (2026-10-01) ──────────────────────────────────────
          Bu ekran GELEN BELGE çekme ekranı DEĞİLDİR. Karışıklığı önlemek
          için kullanıcı doğru ekrana yönlendirilir. */}
      <div style={{
        display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap',
        padding: '10px 14px', background: 'var(--bg-surface-secondary)',
        border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md, 8px)', fontSize: '12px',
      }}>
        <Inbox size={15} style={{ color: 'var(--info)', flexShrink: 0 }} />
        <span style={{ color: 'var(--text-muted)' }}>
          Bu ekran <b>mükellef sorgulama ve portföy yönetimi</b> içindir; gelen e-Fatura/e-İrsaliye belgeleri burada çekilmez.
        </span>
        <button type="button" className="btn btn-ghost btn-xs"
          onClick={() => setActiveView('gelen-belgeler')}
          style={{ display: 'flex', alignItems: 'center', gap: '5px', fontWeight: 700, color: 'var(--info)' }}
        >
          <ExternalLink size={12} /> Gelen Belgeler ekranına git
        </button>
      </div>

      {/* ── KPI Kartları ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px' }}>
        {kpiCards.map((card, idx) => {
          const isActive = statusFilter === card.filter;
          return (
            <div key={idx} onClick={() => setStatusFilter(card.filter)} style={{
              background: 'var(--bg-surface)', borderRadius: 'var(--radius-xl, 12px)', padding: '14px 16px',
              border: isActive ? `2px solid ${card.color}` : '1px solid var(--border-color)',
              cursor: 'pointer', transition: 'all 0.15s ease',
              boxShadow: isActive ? `0 2px 12px ${card.shadow}` : 'none',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                {/* 2026-09-13 (tasarım sadeleştirmesi): Etiket ALL-CAPS + geniş
                    harf aralıklıydı ("AI-üretimi etiket" izlenimi). Sakin
                    duruma çevrildi. */}
                <span style={{ fontSize: 'var(--fs-xs, 11px)', fontWeight: 600, color: 'var(--text-muted)' }}>{card.label}</span>
                <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: card.bg, color: card.color, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {card.icon}
                </div>
              </div>
              <div style={{ fontSize: 'var(--fs-2xl, 26px)', fontWeight: 700, color: card.color, lineHeight: 1.1 }}>{card.count}</div>
            </div>
          );
        })}
      </div>

      {/* ── Firma Arama Formu ── */}
      <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-xl, 12px)', overflow: 'hidden' }}>
        <div style={{ padding: '12px 18px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '7px' }}>
            <Filter size={15} style={{ color: 'var(--primary)' }} />
            Firma Arama Seçenekleri
          </h3>
          <button type="button" onClick={() => setShowAdvanced(v => !v)}
            style={{ display: 'flex', alignItems: 'center', gap: '5px', background: 'transparent', border: '1px solid var(--border-strong)', borderRadius: '7px', padding: '5px 12px', cursor: 'pointer', fontSize: '12px', color: 'var(--text-muted)' }}
          >
            Detaylı Arama {showAdvanced ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          </button>
        </div>

        <div style={{ padding: '16px 18px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px 20px' }}>
            <div>
              <label style={labelStyle}>Müşteri Adı</label>
              <input style={fieldStyle} value={form.musteriAdi} onChange={e => setForm(f => ({ ...f, musteriAdi: e.target.value }))} placeholder="Müşteri adı..." />
            </div>
            <div>
              <label style={labelStyle}>Unvan</label>
              <input style={fieldStyle} value={form.unvan} onChange={e => setForm(f => ({ ...f, unvan: e.target.value }))} placeholder="Ticari ünvan..." />
            </div>
            <div>
              <label style={labelStyle}>VKN / TCKN</label>
              <input style={fieldStyle} value={form.vknTckn} onChange={e => setForm(f => ({ ...f, vknTckn: e.target.value }))} placeholder="10 veya 11 hane..." />
            </div>
            <div>
              <label style={labelStyle}>Ad</label>
              <input style={fieldStyle} value={form.ad} onChange={e => setForm(f => ({ ...f, ad: e.target.value }))} placeholder="Ad..." />
            </div>
            <div>
              <label style={labelStyle}>Soyad</label>
              <input style={fieldStyle} value={form.soyad} onChange={e => setForm(f => ({ ...f, soyad: e.target.value }))} placeholder="Soyad..." />
            </div>
            <div>
              <label style={labelStyle}>Aktif / Pasif</label>
              <select style={fieldStyle} value={form.aktifPasif} onChange={e => setForm(f => ({ ...f, aktifPasif: e.target.value }))}>
                <option value="">Seçiniz</option>
                <option value="1">Aktif</option>
                <option value="0">Pasif</option>
              </select>
            </div>
          </div>

          {showAdvanced && (
            <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px dashed var(--border-color)' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px 20px' }}>
                <div>
                  <label style={labelStyle}>Müşteri Tipi</label>
                  <select style={fieldStyle} value={form.musteriTipi} onChange={e => setForm(f => ({ ...f, musteriTipi: e.target.value }))}>
                    <option value="">Seçiniz</option>
                    <option value="Müşteri">Müşteri</option>
                    <option value="Bayi">Bayi</option>
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Hizmet Adı</label>
                  <select style={fieldStyle} value={form.hizmet} onChange={e => setForm(f => ({ ...f, hizmet: e.target.value }))}>
                    <option value="">Seçiniz</option>
                    <option value="0">e-Arşiv Fatura</option>
                    <option value="1">e-Fatura</option>
                    <option value="2">e-Defter</option>
                    <option value="5">e-İrsaliye</option>
                    <option value="6">e-Serbest Meslek Makbuzu</option>
                    <option value="7">e-Müstahsil Makbuzu</option>
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Şehir</label>
                  <select style={fieldStyle} value={form.sehir} onChange={e => setForm(f => ({ ...f, sehir: e.target.value }))}>
                    <option value="">Seçiniz</option>
                    {SEHIRLER.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Tarife Tipi</label>
                  <select style={fieldStyle} value={form.tarifeTipi} onChange={e => setForm(f => ({ ...f, tarifeTipi: e.target.value }))}>
                    <option value="">Seçiniz</option>
                    <option value="1">Kontörlü</option>
                    <option value="0">Faturalı</option>
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Sözleşme Durumu</label>
                  <select style={fieldStyle} value={form.hizmetDurumu} onChange={e => setForm(f => ({ ...f, hizmetDurumu: e.target.value }))}>
                    <option value="">Seçiniz</option>
                    <option value="0">İmzalandı</option>
                    <option value="1">İmzalanmadı</option>
                    <option value="fesih">Sözleşmesi Feshedilenler</option>
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Müşteri Temsilcisi</label>
                  <input style={fieldStyle} value={form.musteriTemsilcisi} onChange={e => setForm(f => ({ ...f, musteriTemsilcisi: e.target.value }))} placeholder="Temsilci adı..." />
                </div>
                <div>
                  <label style={labelStyle}>Sorumlu Adı</label>
                  <input style={fieldStyle} value={form.sorumluAdi} onChange={e => setForm(f => ({ ...f, sorumluAdi: e.target.value }))} placeholder="Sorumlu adı..." />
                </div>
                <div>
                  <label style={labelStyle}>Müşteri No</label>
                  <input style={fieldStyle} value={form.musteriNo} onChange={e => setForm(f => ({ ...f, musteriNo: e.target.value }))} placeholder="Müşteri no..." />
                </div>
              </div>
            </div>
          )}
        </div>

        <div style={{ padding: '12px 18px', borderTop: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', flexWrap: 'wrap', background: 'var(--bg-surface-secondary)' }}>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
            <div ref={bulkMenuRef} style={{ position: 'relative' }}>
              <button type="button" onClick={() => setShowBulkMenu(v => !v)}
                style={{ ...fieldStyle, width: 'auto', display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '7px 14px', cursor: 'pointer' }}
              >
                Toplu İşlem Seçiniz <ChevronDown size={13} />
              </button>
              {showBulkMenu && (
                <div style={{ position: 'absolute', top: '110%', left: 0, zIndex: 200, background: 'var(--bg-surface)', border: '1px solid var(--border-strong)', borderRadius: 'var(--radius-lg, 10px)', boxShadow: 'var(--shadow-lg)', minWidth: '220px', overflow: 'hidden' }}>
                  {[
                    { icon: <FileText size={14} style={{ color: 'var(--info)' }} />, label: 'Kontör Firma Raporları' },
                    { icon: <Package size={14} style={{ color: 'var(--primary)' }} />, label: 'Firma Mesaj Aktif/Pasif' },
                    { icon: <Download size={14} style={{ color: 'var(--success)' }} />, label: "Detaylı Aramayı Excel'e Aktar" },
                  ].map((item, i) => (
                    <button key={i} type="button" className="dropdown-item-btn"
                      onClick={() => setShowBulkMenu(false)}
                      style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%', padding: '10px 16px', background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-main)', fontSize: '12.5px' }}
                    >
                      {item.icon} {item.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button type="button"
              onClick={() => setShowEkleModal(true)}
              style={{ ...fieldStyle, width: 'auto', display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '7px 14px', cursor: 'pointer' }}
            >
              <Plus size={13} /> Hızlı Bilişim'den Mükellef Ekle
            </button>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button type="button" className="btn btn-danger btn-sm" onClick={clearForm}
              style={{ display: 'flex', alignItems: 'center', gap: '5px' }}
            >
              <X size={13} /> Temizle
            </button>
            <button type="button" className="btn btn-success" onClick={loadData}
              style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 700 }}
            >
              <Search size={14} /> Arama Yap
            </button>
          </div>
        </div>
      </div>

      {/* ── Durum Sekmeleri + Tümünü Seç ── */}
      <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontSize: '12px', color: 'var(--text-muted)', marginRight: '4px' }}>Durum:</span>
        {[
          { id: 'ALL', label: 'Tümü' },
          { id: 'NEW', label: 'Yeni' },
          { id: 'IMPORTED', label: 'Aktarıldı' },
          { id: 'USER_CREATED', label: 'Kullanıcı Aktif' },
          { id: 'MATCHED', label: 'Eşleşen' },
          { id: 'ERROR', label: 'Hatalı' },
        ].map(tab => (
          <button key={tab.id} type="button"
            className={`btn btn-sm ${statusFilter === tab.id ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setStatusFilter(tab.id)}
            style={{ fontSize: '11.5px' }}
          >
            {tab.label}
          </button>
        ))}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <input type="checkbox" id="selectAllChk"
            checked={selectedIds.length > 0 && selectedIds.length === customers.length}
            onChange={handleSelectAll}
            style={{ accentColor: '#3b82f6', cursor: 'pointer' }}
          />
          <label htmlFor="selectAllChk" style={{ fontSize: '12px', color: 'var(--text-muted)', cursor: 'pointer', margin: 0 }}>
            Tümünü Seç ({customers.length})
          </label>
        </div>
      </div>

      {/* ── DataGrid ── */}
      <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-xl, 12px)', overflow: 'hidden' }}>
        <DataGrid
          columns={columns}
          data={customers}
          loading={loading}
          emptyMessage={
            kpis.total === 0
              ? 'Güncellenecek Hızlı Bilişim mükellefi bulunamadı. VKN/TCKN ile ilk mükellefinizi sorgulayıp portföye ekleyebilirsiniz.'
              : 'Kriterlere uygun Hızlı Bilişim müşteri kaydı bulunamadı.'
          }
        />
        {/* 0 KAYIT — ÇIKMAZ DEĞİL (2026-10-01): portföy tamamen boşsa
            kullanıcıya atacağı ADIM gösterilir. */}
        {!loading && kpis.total === 0 && (
          <div style={{
            padding: '22px 20px', borderTop: '1px solid var(--border-color)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px', textAlign: 'center',
          }}>
            <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-main)' }}>
              Güncellenecek Hızlı Bilişim mükellefi bulunamadı.
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', maxWidth: '520px' }}>
              Hızlı Bilişim'de "tüm mükellefleri listele" özelliği yoktur; mükellefler VKN/TCKN ile tek tek
              sorgulanır. İlk mükellefinizi sorgulayıp portföye ekleyerek başlayın.
            </div>
            <button type="button" className="btn btn-success"
              onClick={() => setShowEkleModal(true)}
              style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 700 }}
            >
              <Plus size={15} /> Hızlı Bilişim'den Mükellef Ekle
            </button>
          </div>
        )}
      </div>

      {/* ── Zarf Sorgulama KALDIRILDI (2026-10-01) ─────────────────────────
          Önceki buton sahte bir "Zarf Sorgulama" modalı açıp yalnızca
          "Zarf sorgulanıyor... (HB API bağlantısı gerekli)" toast'ı
          gösteriyordu — hiçbir sorgu YAPMIYORDU. Hızlı Bilişim eConnect REST
          sözleşmesinde "zarf numarası ile sorgula" uç noktası YOKTUR
          (bkz. kullanılan tüm uçlar; envelope durumu yalnız gönderim/iptal
          yanıtlarının içinde döner). Gerçek karşılığı olmadığı için sahte
          işlev bırakılmadı. */}

      {/* ── Bağımlı Modals ── */}
      {showPortfolio && <PortfolioImportModal onClose={() => setShowPortfolio(false)} onSuccess={loadData} />}
      {showEkleModal && (
        <HizliMukellefEkleModal isOpen onClose={() => setShowEkleModal(false)} onSuccess={loadData} />
      )}
      {convertCustomer && (
        <ConvertToCompanyModal isOpen={Boolean(convertCustomer)} onClose={closeConversion} customer={convertCustomer} onSuccess={loadData} />
      )}
      {matchCustomer && (
        <MatchCompanyModal isOpen={Boolean(matchCustomer)} onClose={() => setMatchCustomer(null)} customer={matchCustomer} onSuccess={loadData} />
      )}
      {detailCustomerId && (
        <HizliCustomerDetailModal isOpen={Boolean(detailCustomerId)} onClose={() => setDetailCustomerId(null)}
          customerId={detailCustomerId} onOpenConvertModal={c => setConvertCustomer(c)}
          onOpenMatchModal={c => setMatchCustomer(c)} onSuccess={loadData}
        />
      )}
    </div>
  );
};
