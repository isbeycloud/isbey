import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Search, Download, ChevronLeft, ChevronRight } from 'lucide-react';
import { api } from '../../../services/api';
import { useAuth } from '../../../context/AuthContext';
import { useToast } from '../../../context/ToastContext';
import { DataGrid } from '../../common/DataGrid';
import {
  BelgeSorguCubugu,
  BOS_SORGU,
  tarihAraligi,
  type BelgeSorguDegeri,
} from '../../common/BelgeSorguCubugu';

/**
 * Gelen/Giden fatura ve irsaliye için birleşik sorgulama ekranı (docs/85).
 *
 * Kurallar:
 *  - SALT OKUNUR: hiçbir belge oluşturulmaz/değiştirilmez.
 *  - Filtreleme SUNUCUDA: tüm listeyi çekip tarayıcıda süzmez.
 *  - Sekmeler ayrı KAYNAKLARDIR: işlenmiş ERP belgesi ile entegratör havuzu
 *    aynı belgeyi gösterebilir; hiçbir yerde birleşik toplam verilmez.
 *  - VKN yön-farkındadır ve bu iş SUNUCUDA çözülür (bkz. server/utils/documentQuery).
 *  - Farklı para birimleri TEK tutara toplanmaz.
 */

type Sekme = 'SALES' | 'PURCHASE' | 'SALES_DESPATCH' | 'PURCHASE_DESPATCH' | 'POOL';

const SAYFA_BOYUTU = 50;

/**
 * Sekme tanımı.
 *
 * ⚠️ `izin` bir **AppView modül kimliğidir** (`canAccessModule` ile kontrol edilir),
 * `can('view', ...)` kaynak kodu DEĞİLDİR. İkisi karıştırılırsa: `hasPermission`
 * BÜYÜK harfli kaynak adları bekler ('SALES', 'CUSTOMERS'…); küçük harfli bir
 * modül adı hiçbir dalla eşleşmez ve SATIS/MUHASEBE gibi roller ekranı BOŞ görür
 * (sessiz hata — hata mesajı çıkmaz, sekme çizilmez).
 */
const SEKMELER: Array<{
  id: Sekme;
  etiket: string;
  yon: 'GİDEN' | 'GELEN';
  kaynak: 'ERP' | 'HAVUZ';
  belgeNoEtiketi: string;
  izin: 'satis' | 'alis' | 'irsaliye' | 'edonusum';
}> = [
  { id: 'SALES', etiket: 'Giden Faturalar', yon: 'GİDEN', kaynak: 'ERP', belgeNoEtiketi: 'Fatura No', izin: 'satis' },
  { id: 'PURCHASE', etiket: 'Gelen Faturalar', yon: 'GELEN', kaynak: 'ERP', belgeNoEtiketi: 'Fatura No', izin: 'alis' },
  { id: 'SALES_DESPATCH', etiket: 'Giden İrsaliyeler', yon: 'GİDEN', kaynak: 'ERP', belgeNoEtiketi: 'İrsaliye No', izin: 'irsaliye' },
  { id: 'PURCHASE_DESPATCH', etiket: 'Gelen İrsaliyeler', yon: 'GELEN', kaynak: 'ERP', belgeNoEtiketi: 'İrsaliye No', izin: 'irsaliye' },
  { id: 'POOL', etiket: 'Entegratör Havuzu', yon: 'GELEN', kaynak: 'HAVUZ', belgeNoEtiketi: 'Belge No', izin: 'edonusum' },
];

const DURUM_SECENEKLERI: Record<Sekme, Array<{ id: string; etiket: string }>> = {
  SALES: [{ id: 'ALL', etiket: 'Tümü' }, { id: 'ACTIVE', etiket: 'Aktif' }, { id: 'CANCELLED', etiket: 'İptal' }],
  PURCHASE: [{ id: 'ALL', etiket: 'Tümü' }, { id: 'ACTIVE', etiket: 'Aktif' }, { id: 'CANCELLED', etiket: 'İptal' }],
  // İrsaliye durumu `type` ile birlikte anlam kazanır: SALES_DESPATCH'te PENDING
  // "henüz faturalanmadı" demektir; PURCHASE_DESPATCH'te ise "tedarikçi irsaliyesi
  // içeri alınmadı". Etiketler bu yüzden sekme başına ayrı yazılır (karışmasın).
  SALES_DESPATCH: [
    { id: 'ALL', etiket: 'Tümü' },
    { id: 'PENDING', etiket: 'Bekliyor (faturalanmadı)' },
    { id: 'INVOICED', etiket: 'Faturalandı' },
  ],
  PURCHASE_DESPATCH: [
    { id: 'ALL', etiket: 'Tümü' },
    { id: 'PENDING', etiket: 'Bekliyor (içeri alınmadı)' },
    { id: 'INVOICED', etiket: 'İçeri Alındı' },
  ],
  POOL: [
    { id: 'ALL', etiket: 'Tümü' },
    { id: 'NEW', etiket: 'Yeni' },
    { id: 'PENDING_MATCH', etiket: 'Eşleştirme Bekliyor' },
    { id: 'READY', etiket: 'Hazır' },
    { id: 'INGESTED', etiket: 'İçeri Alındı' },
    { id: 'ERROR', etiket: 'Hatalı' },
  ],
};

/** Sorguyu sorgu dizesine çevirir. Boş alanlar GÖNDERİLMEZ (`search=undefined` tuzağı). */
function suzgecGovdesi(sekme: Sekme, f: BelgeSorguDegeri, page: number) {
  const ortak: Record<string, unknown> = {
    page,
    limit: SAYFA_BOYUTU,
    startDate: f.startDate || undefined,
    endDate: f.endDate || undefined,
    search: f.search.trim() || undefined,
    titleOnly: f.titleOnly ? '1' : undefined,
    taxNumber: f.taxNumber.trim() || undefined,
    status: f.status && f.status !== 'ALL' ? f.status : undefined,
  };
  if (sekme === 'POOL') {
    return {
      ...ortak,
      supplierTaxNumber: f.taxNumber.trim() || undefined,
      documentNo: f.documentNo.trim() || undefined,
      taxNumber: undefined,
    };
  }
  return sekme.endsWith('DESPATCH')
    ? { ...ortak, type: sekme, waybillNo: f.documentNo.trim() || undefined }
    : { ...ortak, type: sekme, invoiceNo: f.documentNo.trim() || undefined };
}

export const BelgeSorgulamaView: React.FC = () => {
  const { canAccessModule } = useAuth();
  const { showToast } = useToast();

  // Sekmeler Module_ACCESS_MATRIX üzerinden süzülür (yetkisiz sekme ÇİZİLMEZ,
  // tıklanınca hata vermez). Yeni yetki kodu üretilmez.
  const gorunurSekmeler = useMemo(
    () => SEKMELER.filter(s => canAccessModule(s.izin)),
    [canAccessModule]
  );

  const [sekme, setSekme] = useState<Sekme>('SALES');
  const [filtre, setFiltre] = useState<BelgeSorguDegeri>({ ...BOS_SORGU, ...tarihAraligi('SON30') });
  const [havuzTuru, setHavuzTuru] = useState<'INVOICE' | 'DESPATCH'>('INVOICE');
  const [kayitlar, setKayitlar] = useState<any[]>([]);
  const [sayfa, setSayfa] = useState(1);
  const [toplamSayfa, setToplamSayfa] = useState(1);
  const [toplamKayit, setToplamKayit] = useState(0);
  const [yukleniyor, setYukleniyor] = useState(false);
  const [hata, setHata] = useState<string | null>(null);
  const [ozet, setOzet] = useState<any>(null);

  const iptalRef = useRef<AbortController | null>(null);
  const zamanRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const tersAralik = Boolean(filtre.startDate && filtre.endDate && filtre.startDate > filtre.endDate);

  const aktifSekme = SEKMELER.find(s => s.id === sekme)!;

  const yukle = useCallback(async (hedefSayfa: number) => {
    // Ters/geçersiz aralıkta SUNUCUYA HİÇ GİTME (sunucu da 400 verir).
    if (tersAralik) return;

    iptalRef.current?.abort();
    const ctrl = new AbortController();
    iptalRef.current = ctrl;

    setYukleniyor(true);
    setHata(null);
    try {
      if (sekme === 'POOL') {
        const p = suzgecGovdesi(sekme, filtre, hedefSayfa);
        const r = havuzTuru === 'INVOICE'
          ? await api.getIncomingDocuments(p as any, ctrl.signal)
          : await api.getIncomingDespatches(p as any, ctrl.signal);
        setKayitlar(r.data || []);
        setToplamKayit(r.pagination?.total ?? 0);
        setToplamSayfa(Math.max(1, r.pagination?.totalPages ?? 1));
        setOzet(r.statusCounts || null);
      } else if (sekme.endsWith('DESPATCH')) {
        const r = await api.queryWaybills(suzgecGovdesi(sekme, filtre, hedefSayfa), ctrl.signal);
        setKayitlar(r.data || []);
        setToplamKayit(r.pagination?.total || 0);
        setToplamSayfa(Math.max(1, r.pagination?.totalPages || 1));
        setOzet(null);
      } else {
        const r = await api.queryInvoices(suzgecGovdesi(sekme, filtre, hedefSayfa), ctrl.signal);
        setKayitlar(r.data || []);
        setToplamKayit(r.pagination?.total || 0);
        setToplamSayfa(Math.max(1, r.pagination?.totalPages || 1));
        setOzet(r.summary || null);
      }
      setSayfa(hedefSayfa);
    } catch (e: any) {
      // ⚠️ İptal edilen istek HATA DEĞİLDİR. `request()` (api.ts) AbortError'ı
      // yakalayıp `ApiError`'a sarar; bu yüzden `e.name === 'AbortError'` HİÇ
      // doğru olmaz. Güvenilir ölçüt KENDİ denetleyicimizin aborted bayrağıdır —
      // aksi halde hızlı yazımda her tuş vuruşu sahte bir hata balonu açardı.
      if (ctrl.signal.aborted) return;
      setKayitlar([]);
      setToplamKayit(0);
      setHata(e?.message || 'Sorgu başarısız.');
    } finally {
      if (!ctrl.signal.aborted) setYukleniyor(false);
    }
  }, [sekme, filtre, havuzTuru, tersAralik]);

  // Filtre/sekme değişince 1. sayfaya dön ve debounce'lu sorgula.
  useEffect(() => {
    if (zamanRef.current) clearTimeout(zamanRef.current);
    zamanRef.current = setTimeout(() => { void yukle(1); }, 300);
    return () => { if (zamanRef.current) clearTimeout(zamanRef.current); };
  }, [yukle]);

  useEffect(() => () => iptalRef.current?.abort(), []);

  // Savunma: kullanıcı yetkisi olmayan bir sekmede kalırsa (örn. yalnız "alis"
  // yetkisi olup varsayılan "SALES" ise) ilk GÖRÜNÜR sekmeye geç. Aksi halde
  // görünmeyen bir sekme için sunucuya istek gider ve 403 hata balonu çıkardı.
  useEffect(() => {
    if (gorunurSekmeler.length > 0 && !gorunurSekmeler.some(s => s.id === sekme)) {
      setSekme(gorunurSekmeler[0].id);
    }
  }, [gorunurSekmeler, sekme]);

  // Sekme değişince durum sıfırlanır (anlamı sekmeye göre değişir).
  const sekmeDegistir = (yeni: Sekme) => {
    setSekme(yeni);
    setFiltre(f => ({ ...f, status: '' }));
    setSayfa(1);
  };

  const sutunlar = useMemo(() => {
    const belgeNoKolonu = aktifSekme.kaynak === 'HAVUZ' ? 'Belge No' : aktifSekme.belgeNoEtiketi;
    return [
      {
        key: 'belgeNo', title: belgeNoKolonu,
        render: (r: any) => <span style={{ fontWeight: 600 }}>{r.invoiceNo || r.despatchNo || r.waybillNo || '-'}</span>,
      },
      {
        key: 'date', title: 'Tarih',
        render: (r: any) => String(r.date || r.issueDate || '').slice(0, 10) || '-',
      },
      {
        key: 'unvan', title: 'Unvan',
        render: (r: any) => r.customerTitle || r.supplierTitle || '-',
      },
      {
        key: 'vkn', title: 'VKN / TCKN',
        // ERP belgesinde sunucu karşı-taraf VKN'sini türetir (`_counterpartyTaxNumber`).
        // Havuz kaydında alan `supplierTaxNumber`'dır. Cari bulunamayan eski kayıtta
        // BOŞ gösterilir — TAHMİN EDİLMEZ.
        render: (r: any) => r._counterpartyTaxNumber || r.supplierTaxNumber || '-',
      },
      {
        key: 'tutar', title: 'Tutar',
        render: (r: any) => (
          <span style={{ fontVariantNumeric: 'tabular-nums' }}>
            {(r.grandTotal ?? 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} {r.currency && r.currency !== 'TRY' ? r.currency : '₺'}
          </span>
        ),
      },
      {
        key: 'durum', title: 'Durum',
        render: (r: any) => r.operationalStatus || r.paymentStatus || r.status || '-',
      },
    ];
  }, [aktifSekme]);

  // Toplam: HAVUZDA farklı para birimleri TEK tutara toplanmaz → birim bazında.
  const toplamlar = useMemo(() => {
    if (aktifSekme.kaynak !== 'HAVUZ') {
      return ozet
        ? `Tüm sonuç: ${Number(ozet.totalGrandTotal || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺ (${ozet.totalInvoices} belge)`
        : '';
    }
    const m = new Map<string, number>();
    for (const r of kayitlar) {
      const c = r.currency || 'TRY';
      m.set(c, (m.get(c) || 0) + Number(r.grandTotal || 0));
    }
    if (m.size === 0) return '';
    const parcalar = [...m.entries()].map(([c, t]) => `${t.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ${c}`);
    return `Görünen sayfa toplamı (birim bazında): ${parcalar.join(' · ')}`;
  }, [kayitlar, ozet, aktifSekme]);

  const csvIndir = () => {
    if (kayitlar.length === 0) return;
    const basliklar = sutunlar.map(s => s.title);
    // Formül enjeksiyonuna karşı: = + - @ ile başlayan hücre güvenli metne kaçırılır.
    const guvenli = (v: unknown) => {
      const s = v === null || v === undefined ? '' : String(v);
      return /^[=+\-@]/.test(s) ? `'${s}` : s;
    };
    const satirlar = kayitlar.map(r => sutunlar.map(s => {
      const ham = s.key === 'belgeNo' ? (r.invoiceNo || r.despatchNo || r.waybillNo || '')
        : s.key === 'date' ? String(r.date || r.issueDate || '').slice(0, 10)
        : s.key === 'unvan' ? (r.customerTitle || r.supplierTitle || '')
        : s.key === 'vkn' ? (r._counterpartyTaxNumber || r.supplierTaxNumber || '')
        : s.key === 'tutar' ? String(r.grandTotal ?? '')
        : (r.operationalStatus || r.paymentStatus || r.status || '');
      return `"${guvenli(ham).replace(/"/g, '""')}"`;
    }).join(';'));
    const csv = [basliklar.map(b => `"${b}"`).join(';'), ...satirlar].join('\r\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `belge-sorgu-${aktifSekme.id}-sayfa${sayfa}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast?.('Görünen sayfa CSV olarak indirildi.', 'success');
  };

  if (gorunurSekmeler.length === 0) {
    return (
      <div style={{ padding: '24px', color: 'var(--text-muted)' }}>
        Belge sorgulama için yetkiniz yok.
      </div>
    );
  }

  const gorunurHavuzTuru = aktifSekme.kaynak === 'HAVUZ';

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '10px', padding: '12px', overflowY: 'auto' }}>
      {/* ── Kaynak sekmeleri (AYRI kaynaklar; birleşik toplam verilmez) ── */}
      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
        {gorunurSekmeler.map(s => (
          <button
            key={s.id}
            className={`btn ${sekme === s.id ? 'btn-primary' : 'btn-secondary'} btn-sm`}
            onClick={() => sekmeDegistir(s.id)}
          >
            {s.etiket} <span style={{ opacity: 0.7, fontSize: '10px' }}>({s.yon})</span>
          </button>
        ))}
      </div>

      {/* ── Havuz belge türü (fatura / irsaliye aynı havuzda) ─────────────── */}
      {gorunurHavuzTuru && (
        <div style={{ display: 'flex', gap: '6px' }}>
          {(['INVOICE', 'DESPATCH'] as const).map(t => (
            <button
              key={t}
              className={`btn ${havuzTuru === t ? 'btn-primary' : 'btn-secondary'} btn-sm`}
              onClick={() => { setHavuzTuru(t); setFiltre(f => ({ ...f, status: '' })); setSayfa(1); }}
            >
              {t === 'INVOICE' ? 'e-Fatura Havuzu' : 'e-İrsaliye Havuzu'}
            </button>
          ))}
        </div>
      )}

      <BelgeSorguCubugu
        value={filtre}
        onChange={setFiltre}
        belgeNoEtiketi={gorunurHavuzTuru ? 'Belge No' : aktifSekme.belgeNoEtiketi}
        durumSecenekleri={DURUM_SECENEKLERI[sekme]}
        // Havuz ucu "yalnız unvan" ayrımını desteklemiyor (search tek alanı tarar);
        // işlevsiz bir onay kutusu göstermek yerine gizlenir.
        titleOnlyGoster={!gorunurHavuzTuru}
        onTemizle={() => setFiltre({ ...BOS_SORGU, ...tarihAraligi('SON30') })}
      />

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', fontSize: '12px', color: 'var(--text-muted)' }}>
          <span className="badge badge-secondary">{toplamKayit} kayıt</span>
          {toplamlar && <span>{toplamlar}</span>}
          {yukleniyor && <span>Sorgulanıyor…</span>}
        </div>
        <button className="btn btn-secondary btn-sm" onClick={csvIndir} disabled={kayitlar.length === 0}>
          <Download size={14} /> CSV (görünen sayfa)
        </button>
      </div>

      {hata && (
        <div style={{ padding: '10px 12px', background: 'var(--bg-surface-secondary)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md, 8px)', color: 'var(--danger, #c0392b)', fontSize: '12px' }}>
          {hata}
        </div>
      )}

      <DataGrid
        columns={sutunlar as any}
        data={kayitlar}
        loading={yukleniyor}
        pageSize={SAYFA_BOYUTU}
        searchPlaceholder=""
        emptyMessage={tersAralik ? 'Tarih aralığı geçersiz.' : 'Bu süzgeçlerle eşleşen belge yok.'}
        emptyIcon={<Search size={28} />}
      />

      {!yukleniyor && toplamKayit > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap', fontSize: '12px', color: 'var(--text-muted)' }}>
          <span>Sayfa {sayfa} / {toplamSayfa} — toplam {toplamKayit} kayıt</span>
          <div style={{ display: 'flex', gap: '6px' }}>
            <button className="btn btn-secondary btn-sm" onClick={() => void yukle(Math.max(1, sayfa - 1))} disabled={sayfa <= 1}>
              <ChevronLeft size={14} /> Önceki
            </button>
            <button className="btn btn-secondary btn-sm" onClick={() => void yukle(Math.min(toplamSayfa, sayfa + 1))} disabled={sayfa >= toplamSayfa}>
              Sonraki <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default BelgeSorgulamaView;
