import React, { useState, useEffect, useMemo } from 'react';
import type {
  IncomingInvoice, IncomingDespatch, IngestionPlan, Product,
} from '../../../types';
import { api } from '../../../services/api';
import { useToast } from '../../../context/ToastContext';
import { IncomingMatchModal } from './IncomingMatchModal';
import { DataGrid } from '../../common/DataGrid';
import type { Column } from '../../common/DataGrid';
import {
  RefreshCw, DownloadCloud, AlertTriangle, CheckCircle2, XCircle, Ban, Truck, FileText,
} from 'lucide-react';

/**
 * GELEN ELEKTRONİK BELGELER — e-Fatura (alış) ve e-İrsaliye
 * ═══════════════════════════════════════════════════════════════════════════
 * 2026-09-28 eklendi.
 *
 * ⚠️ EN ÖNEMLİ KURAL — SENKRON STOK/CARİ DEĞİŞTİRMEZ:
 *   "Senkronize Et" düğmesi belgeleri yalnızca İNDİRİR ve çözümler. Stok ve
 *   cari kayıtları SADECE kullanıcı eşleştirme ekranını onayladığında hareket
 *   eder. Bu ekran bunu kullanıcıya açıkça yazar; aksi hâlde "senkron ettim,
 *   stok işlendi" gibi yanlış bir zihinsel model oluşur.
 *
 * ⚠️ İRSALİYE ≠ FATURA: İki sekme ayrı tutulur çünkü sonuçları farklıdır.
 *   Fatura onayı → stok girişi + tedarikçi BORCU.
 *   İrsaliye onayı → yalnız stok girişi; BORÇ OLUŞMAZ (borç faturayla doğar).
 *
 * NOT: İçeriği okunamayan belgeler (`UNREADABLE`) listede görünür ama
 * onaylanamaz. Sessizce gizlenmezler — kullanıcı belgenin alındığını ama
 * okunamadığını bilmelidir.
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

/** Sayfa boyutu — sunucudaki üst sınır (100) ile uyumlu. */
const SAYFA_BOYUTU = 25;

/** Durum rozetinin rengi ve etiketi — iki akış için ortak. */
function durumRozeti(durum: string) {
  const harita: Record<string, { sinif: string; etiket: string }> = {
    RECEIVED: { sinif: 'badge badge-warning', etiket: 'Onay Bekliyor' },
    ACCEPTED: { sinif: 'badge badge-info', etiket: 'Kabul Edildi' },
    APPROVED: { sinif: 'badge badge-success', etiket: 'Onaylandı' },
    CONVERTED_TO_PURCHASE: { sinif: 'badge badge-success', etiket: 'Alış Faturası Oldu' },
    REJECTED: { sinif: 'badge badge-danger', etiket: 'Reddedildi' },
    UNREADABLE: { sinif: 'badge badge-danger', etiket: 'Okunamadı' },
  };
  const h = harita[durum] || { sinif: 'badge', etiket: durum };
  return <span className={h.sinif}>{h.etiket}</span>;
}

/** Onaylanabilir mi — sunucu tarafındaki koşulların aynısı. */
function onaylanabilir(durum: string): boolean {
  return durum === 'RECEIVED' || durum === 'ACCEPTED';
}

export const IncomingDocumentsView: React.FC = () => {
  const { showToast } = useToast();

  const [sekme, setSekme] = useState<Sekme>('INVOICE');
  const [faturalar, setFaturalar] = useState<IncomingInvoice[]>([]);
  const [irsaliyeler, setIrsaliyeler] = useState<IncomingDespatch[]>([]);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [senkronEdiliyor, setSenkronEdiliyor] = useState(false);

  /**
   * Sayfalama — her iki sekme de sunucu taraflı sayfalanır.
   * `sayfa` 1 tabanlıdır; sekme değişince yukle() `sekme` bağımlılığıyla
   * yeniden çalıştığı için ilk sayfaya dönülür.
   */
  const [sayfa, setSayfa] = useState(1);
  const [sayfalama, setSayfalama] = useState<Sayfalama>(BOS_SAYFALAMA);

  /**
   * Eşleştirme ekranı için: hangi belge, hangi plan.
   * `plan` null ise modal kapalıdır.
   */
  const [plan, setPlan] = useState<IngestionPlan | null>(null);
  const [planHedefi, setPlanHedefi] = useState<
    { tur: 'INVOICE'; kayit: IncomingInvoice } | { tur: 'DESPATCH'; kayit: IncomingDespatch } | null
  >(null);
  const [planYukleniyor, setPlanYukleniyor] = useState(false);

  /** Yeni kart açılacak ürünler + ürün seçimi — satır numarasına göre. */
  const [urunSecimi, setUrunSecimi] = useState<Record<string, string>>({});
  const [saticiSecimi, setSaticiSecimi] = useState<string>('');
  const [yeniSatici, setYeniSatici] = useState(false);

  const [islemde, setIslemde] = useState(false);

  /** Eşleştirme ekranı için seçilebilecek kartlar. Yalnız modal açılınca çekilir. */
  const [urunler, setUrunler] = useState<Product[]>([]);
  const [cariler, setCariler] = useState<{ id: string; title: string; code: string }[]>([]);

  useEffect(() => {
    yukle();
  }, [sekme, sayfa]);

  const yukle = async () => {
    setYukleniyor(true);
    try {
      const parametreler = { page: sayfa, limit: SAYFA_BOYUTU };
      if (sekme === 'INVOICE') {
        const res = await api.getIncomingDocuments(parametreler);
        if (res.success) {
          setFaturalar(res.data || []);
          if (res.pagination) setSayfalama(res.pagination);
        }
      } else {
        const res = await api.getIncomingDespatches(parametreler);
        if (res.success) {
          setIrsaliyeler(res.data || []);
          if (res.pagination) setSayfalama(res.pagination);
        }
      }
    } catch (err: any) {
      showToast(err.message || 'Gelen belgeler yüklenemedi.', 'error');
    } finally {
      setYukleniyor(false);
    }
  };

  /** Sekme değişimi: sayfa 1'e dönülür ki devralınan sayfa numarası boşa düşmesin. */
  const sekmeDegistir = (yeni: Sekme) => {
    if (yeni === sekme) return;
    setSekme(yeni);
    setSayfa(1);
    setSayfalama(BOS_SAYFALAMA);
  };

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
      await yukle();
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

  // ── Sayaçlar — kullanıcı ne kadar iş beklediğini görsün ───────────────────
  const bekleyenFatura = useMemo(() => faturalar.filter(f => onaylanabilir(f.status)).length, [faturalar]);
  const okunamayanFatura = useMemo(() => faturalar.filter(f => f.status === 'UNREADABLE').length, [faturalar]);
  const bekleyenIrsaliye = useMemo(() => irsaliyeler.filter(d => onaylanabilir(d.status)).length, [irsaliyeler]);
  const okunamayanIrsaliye = useMemo(() => irsaliyeler.filter(d => d.status === 'UNREADABLE').length, [irsaliyeler]);

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
      key: 'status', title: 'Durum', width: '150px',
      render: f => (
        <div>
          {durumRozeti(f.status)}
          {/* Okunamama nedeni kullanıcıdan GİZLENMEZ. */}
          {f.status === 'UNREADABLE' && f.parseErrors?.[0] && (
            <div style={{ fontSize: '10px', color: 'var(--danger)', marginTop: '3px', whiteSpace: 'normal', maxWidth: '180px' }}>
              {f.parseErrors[0]}
            </div>
          )}
          {f.status === 'REJECTED' && f.rejectionReason && (
            <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '3px' }}>{f.rejectionReason}</div>
          )}
        </div>
      ),
    },
    {
      key: 'actions', title: 'İşlemler', sortable: false, width: '150px',
      render: f => (
        <div style={{ display: 'flex', gap: '4px' }}>
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
      key: 'status', title: 'Durum', width: '150px',
      render: d => (
        <div>
          {durumRozeti(d.status)}
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
      key: 'actions', title: 'İşlemler', sortable: false, width: '180px',
      render: d => (
        <div style={{ display: 'flex', gap: '4px' }}>
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

  const bekleyen = sekme === 'INVOICE' ? bekleyenFatura : bekleyenIrsaliye;
  const okunamayan = sekme === 'INVOICE' ? okunamayanFatura : okunamayanIrsaliye;
  /**
   * ⚠️ Sayfa yerel diziler (`faturalar`/`irsaliyeler`) yalnız O SAYFANIN
   * kayıtlarını tutar. "kayıt" rozeti ve sekme sayacı `sayfalama.total`
   * kullanır; aksi hâlde 40 belge varken "25 kayıt" yazardı.
   */
  const toplamKayit = sayfalama.total;
  const sonSayfa = Math.max(1, sayfalama.totalPages || 1);

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
            <span>Gelen e-Faturalar ({sekme === 'INVOICE' ? toplamKayit : faturalar.length})</span>
          </button>
          <button
            className={`btn ${sekme === 'DESPATCH' ? 'btn-primary' : 'btn-secondary'} btn-sm`}
            onClick={() => sekmeDegistir('DESPATCH')}
          >
            <Truck size={14} />
            <span>Gelen e-İrsaliyeler ({sekme === 'DESPATCH' ? toplamKayit : irsaliyeler.length})</span>
          </button>
        </div>

        <div style={{ display: 'flex', gap: '8px' }}>
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

      {/* ── Sayaçlar ───────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        <span className="badge badge-warning">{bekleyen} onay bekliyor</span>
        <span className="badge badge-secondary">{toplamKayit} kayıt</span>
        {okunamayan > 0 && <span className="badge badge-danger">{okunamayan} okunamadı</span>}
      </div>

      {/* ── Tablo ──────────────────────────────────────────────────────── */}
      {sekme === 'INVOICE' ? (
        <DataGrid
          columns={faturaKolonlari}
          data={faturalar}
          loading={yukleniyor}
          pageSize={SAYFA_BOYUTU}
          searchPlaceholder="Fatura no, tedarikçi, VKN veya ETTN ile ara..."
          emptyMessage="Gelen e-Fatura yok. 'Entegratörden Çek' ile gelen kutunuzu kontrol edin."
        />
      ) : (
        <DataGrid
          columns={irsaliyeKolonlari}
          data={irsaliyeler}
          loading={yukleniyor}
          pageSize={SAYFA_BOYUTU}
          searchPlaceholder="İrsaliye no, tedarikçi, VKN veya ETTN ile ara..."
          emptyMessage="Gelen e-İrsaliye yok. 'Entegratörden Çek' ile gelen kutunuzu kontrol edin."
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
