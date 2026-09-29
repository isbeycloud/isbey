import React, { useState, useEffect, useMemo, useCallback } from 'react';
import type {
  IncomingInvoice, IncomingDespatch, IngestionPlan, Product, StatusCounts, OperationalStatus,
} from '../../../types';
import { api } from '../../../services/api';
import { useToast } from '../../../context/ToastContext';
import { useApp } from '../../../context/AppContext';
import { IncomingMatchModal } from './IncomingMatchModal';
import { IncomingDocumentDetail } from './IncomingDocumentDetail';
import { DataGrid } from '../../common/DataGrid';
import type { Column } from '../../common/DataGrid';
import {
  RefreshCw, DownloadCloud, AlertTriangle, CheckCircle2, XCircle, Ban, Truck, FileText, Eye, Filter,
} from 'lucide-react';

/**
 * GELEN ELEKTRONİK BELGELER — e-Fatura (alış) ve e-İrsaliye
 * ═══════════════════════════════════════════════════════════════════════════
 * 2026-09-28 eklendi. 2026-09-29: operasyon durumu, süzgeçler ve detay ekranı.
 *
 * ⚠️ EN ÖNEMLİ KURAL — SENKRON STOK/CARİ DEĞİŞTİRMEZ:
 *   "Entegratörden Çek" düğmesi belgeleri yalnızca İNDİRİR ve çözümler. Stok ve
 *   cari kayıtları SADECE kullanıcı eşleştirme ekranını onayladığında hareket
 *   eder. Bu ekran bunu kullanıcıya açıkça yazar; aksi hâlde "senkron ettim,
 *   stok işlendi" gibi yanlış bir zihinsel model oluşur.
 *
 * ⚠️ İRSALİYE ≠ FATURA: İki sekme ayrı tutulur çünkü sonuçları farklıdır.
 *   Fatura onayı → stok girişi + tedarikçi BORCU.
 *   İrsaliye onayı → yalnız stok girişi; BORÇ OLUŞMAZ (borç faturayla doğar).
 *
 * ⚠️ DURUM KAYITTAN DEĞİL SUNUCUDAN: Sekme rozetleri ve satır durumu sunucunun
 *   TÜRETTİĞİ `operationalStatus` / `statusCounts` alanlarından gelir. Yerel
 *   sayım (`faturalar.filter(...)`) yalnız O SAYFANIN kayıtlarını gördüğü için
 *   40 belge varken "3 bekliyor" gibi yanlış bir iş yükü gösterirdi.
 *
 * NOT: İçeriği okunamayan belgeler listede görünür ama onaylanamaz. Sessizce
 * gizlenmezler — kullanıcı belgenin alındığını ama okunamadığını bilmelidir.
 */

type Sekme = 'INVOICE' | 'DESPATCH';

/**
 * Sunucudan gelen sayfalama bilgisi — iki sekme de aynı sözleşmeyi kullanır
 * (`page / limit / total / totalPages`). 2026-09-28: e-İrsaliye ucu da
 * sayfalanır hâle geldi; önceden tüm liste tek yanıtta dönüyordu.
 */
interface Sayfalama {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

const BOS_SAYFALAMA: Sayfalama = { total: 0, page: 1, limit: 25, totalPages: 1 };

/** Sıfır sayaç — sunucudan henüz yanıt gelmediğinde rozetler "—" göstermez. */
const BOS_SAYAC: StatusCounts = {
  NEW: 0, PENDING_MATCH: 0, READY: 0, INGESTED: 0, ERROR: 0, pendingOperation: 0,
};

/** Sayfa boyutu — sunucudaki üst sınır (100) ile uyumlu. */
const SAYFA_BOYUTU = 25;

/**
 * OPERASYON DURUMU ROZETİ — kullanıcıya "bu belgeyle ne yapacağım" sorusunun
 * yanıtı. Ham durum etiketlerinden (`Onay Bekliyor` vb.) farklıdır: ham durum
 * "sistem ne yaptı"yı, operasyon durumu "ben ne yapacağım"ı anlatır.
 */
function operasyonRozeti(durum: OperationalStatus | undefined) {
  const harita: Record<OperationalStatus, { sinif: string; etiket: string }> = {
    NEW: { sinif: 'badge badge-info', etiket: 'Yeni' },
    PENDING_MATCH: { sinif: 'badge badge-warning', etiket: 'Eşleştirme Bekliyor' },
    READY: { sinif: 'badge badge-primary', etiket: 'Hazır' },
    INGESTED: { sinif: 'badge badge-success', etiket: 'İçeri Alındı' },
    ERROR: { sinif: 'badge badge-danger', etiket: 'Hata' },
  };
  if (!durum) return <span className="badge badge-secondary">—</span>;
  const h = harita[durum] || { sinif: 'badge', etiket: durum };
  return <span className={h.sinif}>{h.etiket}</span>;
}

/** Onaylanabilir mi — sunucu tarafındaki koşulların aynısı. */
function onaylanabilir(durum: string): boolean {
  return durum === 'RECEIVED' || durum === 'ACCEPTED';
}

/** Süzgeç çubuğundaki operasyon durumu seçenekleri. */
const DURUM_SECENEKLERI: Array<{ id: OperationalStatus | 'ALL'; etiket: string }> = [
  { id: 'ALL', etiket: 'Tümü' },
  { id: 'NEW', etiket: 'Yeni' },
  { id: 'PENDING_MATCH', etiket: 'Eşleştirme Bekliyor' },
  { id: 'READY', etiket: 'Hazır' },
  { id: 'INGESTED', etiket: 'İçeri Alındı' },
  { id: 'ERROR', etiket: 'Hata' },
];

export const IncomingDocumentsView: React.FC = () => {
  const { showToast } = useToast();
  const { incomingPreset } = useApp();

  const [sekme, setSekme] = useState<Sekme>('INVOICE');
  const [faturalar, setFaturalar] = useState<IncomingInvoice[]>([]);
  const [irsaliyeler, setIrsaliyeler] = useState<IncomingDespatch[]>([]);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [senkronEdiliyor, setSenkronEdiliyor] = useState(false);

  const [sayfa, setSayfa] = useState(1);
  const [sayfalama, setSayfalama] = useState<Sayfalama>(BOS_SAYFALAMA);
  const [sayaclar, setSayaclar] = useState<StatusCounts>(BOS_SAYAC);

  /**
   * SÜZGEÇLER — sunucudan süzülür, tarayıcıda değil.
   *
   * ⚠️ NEDEN: Liste sayfalanmıştır; yerel süzme yalnız o anki 25 kaydı görür ve
   * "aradığım belge yok" yanılgısı doğar. Kullanıcı 3. sayfadaki belgeyi ararken
   * 1. sayfada süzme yapmak ona belgeyi bulamayacağını söyler.
   */
  const [durumSuzgeci, setDurumSuzgeci] = useState<OperationalStatus | 'ALL'>('ALL');
  const [baslangic, setBaslangic] = useState('');
  const [bitis, setBitis] = useState('');
  const [vkn, setVkn] = useState('');
  const [belgeNo, setBelgeNo] = useState('');
  const [ettn, setEttn] = useState('');
  const [suzgecAcik, setSuzgecAcik] = useState(false);

  /** Eşleştirme ekranı için: hangi belge, hangi plan. */
  const [plan, setPlan] = useState<IngestionPlan | null>(null);
  const [planHedefi, setPlanHedefi] = useState<
    { tur: 'INVOICE'; kayit: IncomingInvoice } | { tur: 'DESPATCH'; kayit: IncomingDespatch } | null
  >(null);
  const [planYukleniyor, setPlanYukleniyor] = useState(false);

  /** Detay ekranı — hangi belge. `null` ise modal kapalıdır. */
  const [detayHedefi, setDetayHedefi] = useState<
    { tur: 'INVOICE'; kayit: IncomingInvoice } | { tur: 'DESPATCH'; kayit: IncomingDespatch } | null
  >(null);

  /** Yeni kart açılacak ürünler + ürün seçimi — satır numarasına göre. */
  const [urunSecimi, setUrunSecimi] = useState<Record<string, string>>({});
  const [saticiSecimi, setSaticiSecimi] = useState<string>('');
  const [yeniSatici, setYeniSatici] = useState(false);

  const [islemde, setIslemde] = useState(false);

  /** Eşleştirme ekranı için seçilebilecek kartlar. Yalnız modal açılınca çekilir. */
  const [urunler, setUrunler] = useState<Product[]>([]);
  const [cariler, setCariler] = useState<{ id: string; title: string; code: string }[]>([]);

  const suzgecGovdesi = useCallback(() => {
    const p: Record<string, string> = { page: String(sayfa), limit: String(SAYFA_BOYUTU) };
    if (durumSuzgeci !== 'ALL') p.status = durumSuzgeci;
    if (baslangic) p.startDate = baslangic;
    if (bitis) p.endDate = bitis;
    if (vkn.trim()) p.supplierTaxNumber = vkn.trim();
    if (belgeNo.trim()) p.documentNo = belgeNo.trim();
    if (ettn.trim()) p.ettn = ettn.trim();
    return p;
  }, [sayfa, durumSuzgeci, baslangic, bitis, vkn, belgeNo, ettn]);

  const yukle = useCallback(async () => {
    setYukleniyor(true);
    try {
      const parametreler = suzgecGovdesi();
      if (sekme === 'INVOICE') {
        const res = await api.getIncomingDocuments(parametreler as any);
        if (res.success) {
          setFaturalar(res.data || []);
          if (res.pagination) setSayfalama(res.pagination);
          // Sayaçlar SÜZGEÇSİZ gelir (sunucu belgeler). Böylece kullanıcı
          // "Hazır" süzgecindeyken de diğer kovalarda ne kadar iş olduğunu görür.
          if (res.statusCounts) setSayaclar(res.statusCounts);
        }
      } else {
        const res = await api.getIncomingDespatches(parametreler as any);
        if (res.success) {
          setIrsaliyeler(res.data || []);
          if (res.pagination) setSayfalama(res.pagination);
          if (res.statusCounts) setSayaclar(res.statusCounts);
        }
      }
    } catch (err: any) {
      showToast(err.message || 'Gelen belgeler yüklenemedi.', 'error');
    } finally {
      setYukleniyor(false);
    }
  }, [sekme, suzgecGovdesi, showToast]);

  useEffect(() => {
    yukle();
  }, [yukle]);

  /**
   * PANODAN GELEN ÖN SÜZGEÇ.
   *
   * Pano kartı "3 fatura eşleştirme bekliyor" der; tıklandığında liste TAM O
   * kovada açılmalıdır. `nonce` bağımlılığı önemlidir: kullanıcı süzgeci elle
   * değiştirip aynı karta tekrar basarsa süzgeç yeniden uygulanır.
   *
   * ⚠️ Tüketildikten sonra TEMİZLENMEZ: temizlemek için context'e yazma
   * yetkisi gerekirdi ve pano kartına iki kez basmak arasında yarış durumu
   * doğardı. Bunun yerine `nonce` tekilliği kullanılır.
   */
  useEffect(() => {
    if (!incomingPreset) return;
    setSekme(incomingPreset.tur);
    setDurumSuzgeci(incomingPreset.durum);
    setSayfa(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [incomingPreset?.nonce]);

  /** Sekme değişimi: sayfa 1'e dönülür ki devralınan sayfa numarası boşa düşmesin. */
  const sekmeDegistir = (yeni: Sekme) => {
    if (yeni === sekme) return;
    setSekme(yeni);
    setSayfa(1);
    setSayfalama(BOS_SAYFALAMA);
    setSayaclar(BOS_SAYAC);
  };

  /** Süzgeç değişince ilk sayfaya dönülür — yoksa boş sayfa görünürdü. */
  const suzgecDegistir = <T,>(ayarla: (v: T) => void) => (v: T) => {
    ayarla(v);
    setSayfa(1);
  };

  const suzgecleriTemizle = () => {
    setDurumSuzgeci('ALL');
    setBaslangic(''); setBitis(''); setVkn(''); setBelgeNo(''); setEttn('');
    setSayfa(1);
  };

  const suzgecVarMi = durumSuzgeci !== 'ALL' || !!baslangic || !!bitis || !!vkn.trim() || !!belgeNo.trim() || !!ettn.trim();

  /**
   * Entegratörden çeker. ⚠️ Stok/cari DEĞİŞMEZ — yalnız belgeler saklanır.
   * Sonuç mesajı bunu açıkça söyler ki kullanıcı "işlendi" sanmasın.
   */
  const senkronizeEt = async () => {
    setSenkronEdiliyor(true);
    try {
      const res = sekme === 'INVOICE'
        ? await api.syncIncomingDocuments()
        : await api.syncIncomingDespatches();
      if (res.success) {
        showToast(`${res.message} Stok ve cari DEĞİŞMEDİ; içeri aktarma onayınızı bekliyor.`, 'success');
        // Yeni belgeler listenin BAŞINA eklenir (tarihe göre azalan). Kullanıcı
        // 2. sayfadaysa tazeleme onu eski sayfada bırakır ve "hiçbir şey gelmedi"
        // sanır; bu yüzden 1. sayfaya dönülür.
        if (sayfa !== 1) setSayfa(1);
        else await yukle();
      }
    } catch (err: any) {
      showToast(err.message || 'Senkronizasyon başarısız.', 'error');
    } finally {
      setSenkronEdiliyor(false);
    }
  };

  /** Onay ekranını açar. Plan sunucudan gelir; bu ekran YAZMAZ. */
  const planAc = async (
    hedef: { tur: 'INVOICE'; kayit: IncomingInvoice } | { tur: 'DESPATCH'; kayit: IncomingDespatch }
  ) => {
    setPlanYukleniyor(true);
    setPlanHedefi(hedef);
    setUrunSecimi({});
    setYeniSatici(false);
    setSaticiSecimi('');
    try {
      const res = hedef.tur === 'INVOICE'
        ? await api.getIncomingDocumentPlan(hedef.kayit.id)
        : await api.getIncomingDespatchPlan(hedef.kayit.id);

      if (!res.success || !res.plan) {
        showToast('Eşleştirme planı alınamadı.', 'error');
        setPlanHedefi(null);
        return;
      }
      setPlan(res.plan);

      // "Yeni" → "Eşleştirme Bekliyor" geçişinin TEK kanıtı budur. Malî etkisi
      // yoktur; işaret yazılamazsa kullanıcıyı hata ile boğmayız (plan zaten
      // açıldı) ama liste bir sonraki tazelemede eski durumu gösterir.
      try {
        if (hedef.tur === 'INVOICE') await api.markIncomingDocumentReviewed(hedef.kayit.id);
        else await api.markIncomingDespatchReviewed(hedef.kayit.id);
      } catch {
        /* işaret yazılamadı — akışı ENGELLEMEZ */
      }

      // Öneri varsa varsayılan seçim o olur; kullanıcı yalnız istisnayı düzeltir.
      setSaticiSecimi(res.plan.party.customer?.id || '');
      const varsayilan: Record<string, string> = {};
      for (const l of res.plan.lines) {
        if (l.product) varsayilan[l.line.lineNo] = l.product.id;
      }
      setUrunSecimi(varsayilan);

      // Seçim kutuları için kart listeleri (yalnız gerektiğinde çekilir).
      if (urunler.length === 0) {
        const p = await api.getProducts();
        if (p.success) setUrunler(p.products || []);
      }
      if (cariler.length === 0) {
        const c = await api.getCustomers({ type: 'SUPPLIER' });
        if (c.success) setCariler((c.customers || []).map(x => ({ id: x.id, title: x.title, code: x.code })));
      }
    } catch (err: any) {
      showToast(err.message || 'Eşleştirme planı alınamadı.', 'error');
      setPlanHedefi(null);
    } finally {
      setPlanYukleniyor(false);
    }
  };

  const planKapat = () => {
    setPlan(null);
    setPlanHedefi(null);
    // Plan ekranı açılırken belge "incelendi" olarak işaretlendi; liste
    // tazelenmezse kullanıcı az önce açtığı belgeyi hâlâ "Yeni" görür ve
    // işaretin tutmadığını sanır.
    void yukle();
  };

  /** Onay ekranındaki kararları sunucunun beklediği gövdeye çevirir. */
  const kararlariTopla = () => {
    if (!plan) return {};
    const lines = plan.lines.map(l => {
      const secilen = urunSecimi[l.line.lineNo];
      return secilen
        ? { lineNo: l.line.lineNo, productId: secilen }
        : { lineNo: l.line.lineNo, createProduct: true };
    });
    const govde: any = { lines };
    if (yeniSatici) govde.createSupplier = true;
    else if (saticiSecimi) govde.supplierId = saticiSecimi;
    return govde;
  };

  /**
   * ONAY — stok/cari YALNIZ burada hareket eder.
   *
   * İki akışın etkisi FARKLIDIR ve mesaj bunu yansıtır:
   *   fatura   → alış faturası + stok girişi + tedarikçi borcu
   *   irsaliye → yalnız stok girişi (cari borç OLUŞMAZ)
   */
  const onayla = async () => {
    if (!planHedefi || !plan) return;
    if (plan.blockedReason) {
      showToast(`Belge içeri aktarılamaz: ${plan.blockedReason}`, 'error');
      return;
    }
    setIslemde(true);
    try {
      const govde = kararlariTopla();
      if (planHedefi.tur === 'INVOICE') {
        const res = await api.convertIncomingDocument(planHedefi.kayit.id, govde);
        if (res.success) {
          showToast(`Alış faturası oluşturuldu: ${res.invoice?.invoiceNo || ''}. Stok girişi ve tedarikçi borcu işlendi.`, 'success');
        }
      } else {
        const res = await api.approveIncomingDespatch(planHedefi.kayit.id, govde);
        if (res.success) {
          showToast(res.message || 'İrsaliye onaylandı; stok girişi yapıldı, cari borç oluşmadı.', 'success');
        }
      }
      planKapat();
    } catch (err: any) {
      showToast(err.message || 'Belge içeri aktarılamadı.', 'error');
    } finally {
      setIslemde(false);
    }
  };

  const irsaliyeReddet = async (kayit: IncomingDespatch) => {
    const sebep = window.prompt('Red sebebi:', '');
    if (sebep === null) return;
    try {
      const res = await api.rejectIncomingDespatch(kayit.id, sebep || 'Belirtilmedi');
      if (res.success) {
        showToast(res.message, 'success');
        await yukle();
      }
    } catch (err: any) {
      showToast(err.message || 'İrsaliye reddedilemedi.', 'error');
    }
  };

  const tutar = (n: number | undefined) =>
    n === undefined || n === null ? '—' : n.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ₺';

  // ── Fatura sütunları ──────────────────────────────────────────────────────
  const faturaKolonlari: Column<IncomingInvoice>[] = [
    {
      key: 'invoiceNo', title: 'Fatura No', width: '140px',
      render: f => <span style={{ fontWeight: 700, color: 'var(--primary)' }}>{f.invoiceNo || '—'}</span>,
    },
    {
      key: 'supplierTitle', title: 'Tedarikçi',
      render: f => (
        <div>
          <div style={{ fontWeight: 600 }}>{f.supplierTitle || '—'}</div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>VKN: {f.supplierTaxNumber || '—'}</div>
        </div>
      ),
    },
    { key: 'issueDate', title: 'Belge Tarihi', width: '110px' },
    {
      key: 'items', title: 'Kalem', width: '75px', align: 'right',
      render: f => <span>{(f.items || []).length}</span>,
    },
    {
      key: 'grandTotal', title: 'Tutar', width: '120px', numeric: true,
      render: f => <span style={{ fontWeight: 600 }}>{tutar(f.grandTotal)}</span>,
    },
    {
      key: 'status', title: 'Operasyon Durumu', width: '160px',
      render: f => (
        <div>
          {operasyonRozeti(f.operationalStatus)}
          {/* Okunamama nedeni kullanıcıdan GİZLENMEZ. */}
          {f.status === 'UNREADABLE' && f.parseErrors?.[0] && (
            <div style={{ fontSize: '10px', color: 'var(--danger)', marginTop: '3px', whiteSpace: 'normal', maxWidth: '180px' }}>
              {f.parseErrors[0]}
            </div>
          )}
          {f.status === 'CONVERTED_TO_PURCHASE' && f.convertedPurchaseInvoiceId && (
            <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '3px' }}>
              {f.convertedPurchaseInvoiceId}
            </div>
          )}
        </div>
      ),
    },
    {
      key: 'actions', title: 'İşlemler', sortable: false, width: '210px',
      render: f => (
        <div style={{ display: 'flex', gap: '4px' }}>
          <button
            className="btn btn-secondary btn-sm"
            title="Belgeyi incele (Belge / Kalemler / Görsel / XML)"
            onClick={e => { e.stopPropagation(); setDetayHedefi({ tur: 'INVOICE', kayit: f }); }}
          >
            <Eye size={13} />
          </button>
          {onaylanabilir(f.status) ? (
            <button className="btn btn-primary btn-sm" onClick={() => planAc({ tur: 'INVOICE', kayit: f })}>
              <DownloadCloud size={13} />
              <span>İçeri Al</span>
            </button>
          ) : f.status === 'CONVERTED_TO_PURCHASE' ? (
            <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '3px' }}>
              <CheckCircle2 size={12} color="#10b981" /> Alış faturası oluştu
            </span>
          ) : f.status === 'UNREADABLE' ? (
            <span style={{ fontSize: '11px', color: 'var(--danger)', display: 'flex', alignItems: 'center', gap: '3px' }}>
              <Ban size={12} /> İçeri alınamaz
            </span>
          ) : null}
        </div>
      ),
    },
  ];

  // ── İrsaliye sütunları ────────────────────────────────────────────────────
  const irsaliyeKolonlari: Column<IncomingDespatch>[] = [
    {
      key: 'despatchNo', title: 'İrsaliye No', width: '140px',
      render: d => <span style={{ fontWeight: 700, color: 'var(--primary)' }}>{d.despatchNo || '—'}</span>,
    },
    {
      key: 'supplierTitle', title: 'Tedarikçi',
      render: d => (
        <div>
          <div style={{ fontWeight: 600 }}>{d.supplierTitle || '—'}</div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>VKN: {d.supplierTaxNumber || '—'}</div>
        </div>
      ),
    },
    { key: 'issueDate', title: 'Belge Tarihi', width: '110px' },
    {
      key: 'items', title: 'Kalem', width: '75px', align: 'right',
      render: d => <span>{(d.items || []).length}</span>,
    },
    {
      key: 'miktar', title: 'Toplam Miktar', width: '120px', numeric: true,
      // ⚠️ Tutar GÖSTERİLMEZ: irsaliyede fiyat yoktur. Tutar kolonu koysaydık
      // ya boş kalırdı ya da yanlışlıkla 0,00 ₺ yazılırdı — ikisi de yanıltıcı.
      render: d => <span>{(d.items || []).reduce((s, i) => s + (i.quantity || 0), 0)}</span>,
    },
    {
      key: 'status', title: 'Operasyon Durumu', width: '160px',
      render: d => (
        <div>
          {operasyonRozeti(d.operationalStatus)}
          {d.status === 'APPROVED' && d.convertedMovementRef && (
            <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '3px' }}>{d.convertedMovementRef}</div>
          )}
          {d.status === 'UNREADABLE' && d.parseErrors?.[0] && (
            <div style={{ fontSize: '10px', color: 'var(--danger)', marginTop: '3px', whiteSpace: 'normal', maxWidth: '180px' }}>
              {d.parseErrors[0]}
            </div>
          )}
        </div>
      ),
    },
    {
      key: 'actions', title: 'İşlemler', sortable: false, width: '230px',
      render: d => (
        <div style={{ display: 'flex', gap: '4px' }}>
          <button
            className="btn btn-secondary btn-sm"
            title="Belgeyi incele (Belge / Kalemler / Görsel / XML)"
            onClick={e => { e.stopPropagation(); setDetayHedefi({ tur: 'DESPATCH', kayit: d }); }}
          >
            <Eye size={13} />
          </button>
          {onaylanabilir(d.status) ? (
            <>
              <button className="btn btn-primary btn-sm" onClick={() => planAc({ tur: 'DESPATCH', kayit: d })}>
                <Truck size={13} />
                <span>Mal Girişi</span>
              </button>
              <button className="btn btn-secondary btn-sm" title="Reddet" onClick={() => irsaliyeReddet(d)}>
                <XCircle size={13} />
              </button>
            </>
          ) : d.status === 'APPROVED' ? (
            <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '3px' }}>
              <CheckCircle2 size={12} color="#10b981" /> Stok girildi
            </span>
          ) : d.status === 'UNREADABLE' ? (
            <span style={{ fontSize: '11px', color: 'var(--danger)', display: 'flex', alignItems: 'center', gap: '3px' }}>
              <Ban size={12} /> Okunamadı
            </span>
          ) : null}
        </div>
      ),
    },
  ];

  /**
   * ⚠️ Sayfa yerel diziler (`faturalar`/`irsaliyeler`) yalnız O SAYFANIN
   * kayıtlarını tutar. "kayıt" rozeti ve sekme sayacı `sayfalama.total`
   * kullanır; aksi hâlde 40 belge varken "25 kayıt" yazardı.
   */
  const toplamKayit = sayfalama.total;
  const sonSayfa = Math.max(1, sayfalama.totalPages || 1);

  /**
   * Sekme sayaçları — sunucudan gelen `statusCounts`.
   * ⚠️ Sekmenin kendi toplamı `statusCounts` toplamıdır: iki sekme tek uçtan
   * beslendiği için sayaçlar da sekme başına ayrı gelir.
   */
  const bekleyen = sayaclar.pendingOperation;
  const okunamayan = sayaclar.ERROR;
  const iceriAlinan = sayaclar.INGESTED;

  return (
    <div className="view-content-container">
      {/* ── Başlık ve eylemler ─────────────────────────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button
            className={`btn ${sekme === 'INVOICE' ? 'btn-primary' : 'btn-secondary'} btn-sm`}
            onClick={() => sekmeDegistir('INVOICE')}
          >
            <FileText size={14} />
            <span>Gelen e-Faturalar ({sekme === 'INVOICE' ? sayaclar.NEW + sayaclar.PENDING_MATCH + sayaclar.READY + sayaclar.INGESTED + sayaclar.ERROR : faturalar.length})</span>
          </button>
          <button
            className={`btn ${sekme === 'DESPATCH' ? 'btn-primary' : 'btn-secondary'} btn-sm`}
            onClick={() => sekmeDegistir('DESPATCH')}
          >
            <Truck size={14} />
            <span>Gelen e-İrsaliyeler ({sekme === 'DESPATCH' ? sayaclar.NEW + sayaclar.PENDING_MATCH + sayaclar.READY + sayaclar.INGESTED + sayaclar.ERROR : irsaliyeler.length})</span>
          </button>
        </div>

        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            className={`btn ${suzgecVarMi ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setSuzgecAcik(a => !a)}
          >
            <Filter size={15} />
            <span>Süzgeç{suzgecVarMi ? ' •' : ''}</span>
          </button>
          <button className="btn btn-secondary" onClick={yukle} disabled={yukleniyor}>
            <RefreshCw size={15} />
            <span>Yenile</span>
          </button>
          <button className="btn btn-primary" onClick={senkronizeEt} disabled={senkronEdiliyor}>
            <DownloadCloud size={15} />
            <span>{senkronEdiliyor ? 'Entegratörden çekiliyor...' : 'Entegratörden Çek'}</span>
          </button>
        </div>
      </div>

      {/* ── Akış açıklaması — "senkron stok işlemez" bilgisi ───────────── */}
      <div
        style={{
          display: 'flex', alignItems: 'flex-start', gap: '8px', padding: '10px 12px',
          background: 'var(--bg-surface-secondary)', border: '1px solid var(--border-color)',
          borderRadius: 'var(--radius-md, 8px)', fontSize: '12px', color: 'var(--text-muted)',
        }}
      >
        <AlertTriangle size={14} color="var(--warning)" style={{ marginTop: '2px', flexShrink: 0 }} />
        <div>
          <b style={{ color: 'var(--text-main)' }}>Entegratörden çekmek stok ve cariyi değiştirmez.</b>{' '}
          Belgeler yalnızca indirilir ve okunur. {sekme === 'INVOICE'
            ? 'Alış faturası, stok girişi ve tedarikçi borcu SADECE "İçeri Al" ile onayladığınızda oluşur.'
            : 'Stok girişi SADECE "Mal Girişi" ile onayladığınızda oluşur. İrsaliye CARİ BORÇ DOĞURMAZ; borç, satıcının fatura kesmesiyle doğar.'}
        </div>
      </div>

      {/* ── Operasyon durumu süzgeci (renkli sekmeler) ─────────────────── */}
      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
        {DURUM_SECENEKLERI.map(s => {
          const adet = s.id === 'ALL'
            ? sayaclar.NEW + sayaclar.PENDING_MATCH + sayaclar.READY + sayaclar.INGESTED + sayaclar.ERROR
            : sayaclar[s.id];
          return (
            <button
              key={s.id}
              className={`btn ${durumSuzgeci === s.id ? 'btn-primary' : 'btn-secondary'} btn-sm`}
              onClick={() => suzgecDegistir(setDurumSuzgeci)(s.id)}
            >
              <span>{s.etiket} ({adet})</span>
            </button>
          );
        })}
        {suzgecVarMi && (
          <button className="btn btn-secondary btn-sm" onClick={suzgecleriTemizle}>Süzgeci Temizle</button>
        )}
      </div>

      {/* ── Ayrıntılı süzgeçler ────────────────────────────────────────── */}
      {suzgecAcik && (
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '8px',
          padding: '12px', background: 'var(--bg-surface-secondary)',
          border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md, 8px)',
        }}>
          <label style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
            Başlangıç Tarihi
            <input type="date" className="form-control" value={baslangic}
              onChange={e => suzgecDegistir(setBaslangic)(e.target.value)} />
          </label>
          <label style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
            Bitiş Tarihi
            <input type="date" className="form-control" value={bitis}
              onChange={e => suzgecDegistir(setBitis)(e.target.value)} />
          </label>
          <label style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
            Tedarikçi VKN / TCKN
            <input type="text" className="form-control" value={vkn} placeholder="1234567890"
              onChange={e => suzgecDegistir(setVkn)(e.target.value)} />
          </label>
          <label style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
            {sekme === 'INVOICE' ? 'Fatura No' : 'İrsaliye No'}
            <input type="text" className="form-control" value={belgeNo} placeholder="GIB2026000000001"
              onChange={e => suzgecDegistir(setBelgeNo)(e.target.value)} />
          </label>
          <label style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
            ETTN
            <input type="text" className="form-control" value={ettn} placeholder="UUID..."
              onChange={e => suzgecDegistir(setEttn)(e.target.value)} />
          </label>
          <div style={{ display: 'flex', alignItems: 'flex-end' }}>
            <button className="btn btn-secondary btn-sm" onClick={suzgecleriTemizle}>Temizle</button>
          </div>
        </div>
      )}

      {/* ── Sayaçlar ───────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        <span className="badge badge-warning">{bekleyen} operasyon bekliyor</span>
        <span className="badge badge-secondary">{toplamKayit} kayıt</span>
        {iceriAlinan > 0 && <span className="badge badge-success">{iceriAlinan} içeri alındı</span>}
        {okunamayan > 0 && <span className="badge badge-danger">{okunamayan} hatalı</span>}
      </div>

      {/* ── Tablo ──────────────────────────────────────────────────────── */}
      {sekme === 'INVOICE' ? (
        <DataGrid
          columns={faturaKolonlari}
          data={faturalar}
          loading={yukleniyor}
          pageSize={SAYFA_BOYUTU}
          searchPlaceholder="Fatura no, tedarikçi, VKN veya ETTN ile ara..."
          emptyMessage={suzgecVarMi
            ? 'Bu süzgeçlerle eşleşen belge yok.'
            : "Gelen e-Fatura yok. 'Entegratörden Çek' ile gelen kutunuzu kontrol edin."}
          onRowClick={f => setDetayHedefi({ tur: 'INVOICE', kayit: f })}
        />
      ) : (
        <DataGrid
          columns={irsaliyeKolonlari}
          data={irsaliyeler}
          loading={yukleniyor}
          pageSize={SAYFA_BOYUTU}
          searchPlaceholder="İrsaliye no, tedarikçi, VKN veya ETTN ile ara..."
          emptyMessage={suzgecVarMi
            ? 'Bu süzgeçlerle eşleşen belge yok.'
            : "Gelen e-İrsaliye yok. 'Entegratörden Çek' ile gelen kutunuzu kontrol edin."}
          onRowClick={d => setDetayHedefi({ tur: 'DESPATCH', kayit: d })}
        />
      )}

      {/* ── Sunucu sayfalaması ─────────────────────────────────────────────
          DataGrid kendi içinde sayfalar; sunucudan yalnız BİR sayfa geldiği
          için dıştaki bu denetim gerçek sayfayı seçer. pageSize yukarıda
          SAYFA_BOYUTU'na eşitlendi; aksi hâlde 25 kayıt gelir ama 15'i
          görünür ve "kayıtlar kayboldu" izlenimi doğardı. */}
      {!yukleniyor && toplamKayit > 0 && (
        <div
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            gap: '10px', flexWrap: 'wrap', fontSize: '12px', color: 'var(--text-muted)',
          }}
        >
          <span>
            Sayfa {sayfalama.page} / {sonSayfa} — toplam {toplamKayit} kayıt
          </span>
          <div style={{ display: 'flex', gap: '6px' }}>
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => setSayfa(s => Math.max(1, s - 1))}
              disabled={sayfa <= 1}
            >
              Önceki
            </button>
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => setSayfa(s => Math.min(sonSayfa, s + 1))}
              disabled={sayfa >= sonSayfa}
            >
              Sonraki
            </button>
          </div>
        </div>
      )}

      {/* ── Detay ekranı (Belge / Kalemler / Görsel / XML) ─────────────── */}
      <IncomingDocumentDetail
        isOpen={detayHedefi !== null}
        tur={detayHedefi?.tur || 'INVOICE'}
        kayit={detayHedefi?.kayit || null}
        onClose={() => setDetayHedefi(null)}
      />

      {/* ── Eşleştirme / onay ekranı ───────────────────────────────────── */}
      <IncomingMatchModal
        isOpen={plan !== null || planYukleniyor}
        loading={planYukleniyor}
        tur={planHedefi?.tur || 'INVOICE'}
        plan={plan}
        urunler={urunler}
        cariler={cariler}
        urunSecimi={urunSecimi}
        setUrunSecimi={setUrunSecimi}
        saticiSecimi={saticiSecimi}
        setSaticiSecimi={setSaticiSecimi}
        yeniSatici={yeniSatici}
        setYeniSatici={setYeniSatici}
        islemde={islemde}
        onClose={planKapat}
        onConfirm={onayla}
      />
    </div>
  );
};
