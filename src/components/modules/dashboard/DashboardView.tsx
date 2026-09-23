import React, { useState, useEffect } from 'react';
import {
  TrendingUp,
  TrendingDown,
  Calendar,
  ChevronLeft,
  ChevronRight,
  ShieldCheck,
} from 'lucide-react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import { useApp } from '../../../context/AppContext';
import { api } from '../../../services/api';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

/**
 * Tek bir KPI hücresi — kendi kartı DEĞİL, KPI şeridinin bir hücresi.
 *
 * 2026-09-15 (kompozisyon sadeleştirmesi): Önceden her KPI ayrı bir yüzen
 * karttı (kendi kenarlığı, kendi yuvarlaması, kendi ikonu). Dört ayrı kart
 * göz tarafından dört ayrı nesne olarak işlenir ve hiçbiri öne çıkmaz.
 * Artık dördü tek bir yüzeyin (`.dash-kpis`) içinde bölme çizgileriyle
 * ayrılmış hücreler — tek nesne olarak okunur.
 *
 * İkon TAMAMEN kaldırıldı: etiketin yanındaki ikon, etiketin zaten söylediği
 * şeyi tekrar ediyordu (nötr renkte olsa bile görsel gürültü). Hiyerarşi
 * yalnız iki basamak: küçük/soluk etiket → büyük/koyu değer. Sayı
 * `tabular-nums` ile hizalanır ki alt alta gelen dört değer kaymasın.
 */
const KpiCell: React.FC<{
  label: string;
  value: string;
  footer: React.ReactNode;
}> = ({ label, value, footer }) => (
  <div className="dash-kpi">
    <div className="dash-kpi__label">{label}</div>
    <div className="dash-kpi__value">{value}</div>
    <div className="dash-kpi__foot">{footer}</div>
  </div>
);

export const DashboardView: React.FC = () => {
  const {
    setActiveView,
    setActiveRibbonTab,
    setIsNewInvoiceModalOpen,
    setNewInvoiceType,
    setIsFastCollectionOpen,
    setIsFastPaymentOpen,
    refreshKey,
    activeTenant,
  } = useApp();

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [loadError, setLoadError] = useState(false);
  const [calCursor, setCalCursor] = useState(() => {
    const t = new Date();
    return { year: t.getFullYear(), month: t.getMonth() };
  });

  useEffect(() => {
    const fetchDashboard = async () => {
      setLoading(true);
      setLoadError(false);
      try {
        const res = await api.getDashboardSummary();
        if (res && res.success && res.data) {
          setData(res.data);
        } else {
          setLoadError(true);
        }
      } catch (err) {
        // KURAL: API hatasında sahte veri ÜRETİLMEZ — hata durumu gösterilir.
        console.error('Dashboard data fetch error:', err);
        setLoadError(true);
      } finally {
        setLoading(false);
      }
    };

    // Gerçek belgeler: mevcut fatura ucu okunur (yeni uç açılmadı, sayfalama yok,
    // liste tarihe göre azalan sırada gelir — "en son belgeler" doğrudan baştan alınır).
    const fetchInvoices = async () => {
      try {
        const res = await api.getInvoices();
        setInvoices(res && res.success && Array.isArray(res.invoices) ? res.invoices : []);
      } catch (err) {
        console.error('Invoices fetch error:', err);
        setInvoices([]);
      }
    };

    fetchDashboard();
    fetchInvoices();
  }, [refreshKey]);

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('tr-TR', {
      style: 'currency',
      currency: 'TRY',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(Number.isFinite(val) ? val : 0);
  };

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '-';
    return d.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  };

  // ─── Finansal KPI Değerleri (YALNIZ gerçek veri; veri yoksa 0) ───
  // DİKKAT: '||' KULLANILMAZ. `0 || 689450` ifadesi 0'ı sahte rakama çevirirdi.
  // `??` ile yalnızca alan gerçekten yoksa 0'a düşülür; gerçek sıfır sıfır kalır.
  const totalRevenue = data?.kpis?.thisMonthSales ?? 0;
  const totalExpense = data?.kpis?.totalPayables ?? 0;
  const netProfit = data?.kpis?.thisMonthProfit ?? 0;
  // Düzenlenen belge sayısı: faturalar ucundan gelen GERÇEK kayıt sayısı.
  const totalDocs = invoices.length;

  const trends: any[] = Array.isArray(data?.monthlyTrends) ? data.monthlyTrends : [];
  const hasTrendData = trends.some(t => (t?.satis ?? 0) > 0 || (t?.gider ?? 0) > 0);

  // ─── Gerçek aya-göre değişim (uydurma yüzde YOK) ───
  // Son iki ayın GERÇEK değerlerinden hesaplanır. Yeterli veri yoksa null döner
  // ve arayüzde yüzde yerine nötr bilgi gösterilir.
  const aylikDegisim = (alan: 'satis' | 'gider' | 'kar'): number | null => {
    if (trends.length < 2) return null;
    const son = Number(trends[trends.length - 1]?.[alan] ?? 0);
    const onceki = Number(trends[trends.length - 2]?.[alan] ?? 0);
    if (onceki === 0) return null;
    return ((son - onceki) / Math.abs(onceki)) * 100;
  };
  const gelirDegisim = aylikDegisim('satis');
  const giderDegisim = aylikDegisim('gider');
  const karDegisim = aylikDegisim('kar');

  const TrendRozet = ({ deger, iyiYon }: { deger: number | null; iyiYon: 'artis' | 'azalis' }) => {
    if (deger === null) {
      return <span style={{ color: 'var(--text-light)' }}>Karşılaştırma için yeterli veri yok</span>;
    }
    const yuzde = Math.abs(deger).toLocaleString('tr-TR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
    const artis = deger >= 0;
    const olumlu = iyiYon === 'artis' ? artis : !artis;
    return (
      <>
        <span style={{ color: olumlu ? 'var(--success-text)' : 'var(--danger-text)', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '2px' }}>
          {artis ? <TrendingUp size={13} /> : <TrendingDown size={13} />} %{yuzde}
        </span>
        <span style={{ color: 'var(--text-light)' }}>geçen aya göre</span>
      </>
    );
  };

  // ─── Aylık Finansal Özet — GERÇEK monthlyTrends verisi ───
  const chartData = {
    labels: trends.map(t => t?.month ?? ''),
    datasets: [
      {
        label: 'Gelir',
        data: trends.map(t => t?.satis ?? 0),
        borderColor: '#d12131',
        backgroundColor: 'rgba(209, 33, 49, 0.07)',
        fill: true,
        tension: 0.38,
        pointBackgroundColor: '#d12131',
        pointBorderColor: '#ffffff',
        pointBorderWidth: 2,
        pointRadius: 4,
        pointHoverRadius: 6,
      },
      {
        label: 'Gider',
        data: trends.map(t => t?.gider ?? 0),
        borderColor: '#f97316',
        backgroundColor: 'transparent',
        fill: false,
        tension: 0.38,
        pointBackgroundColor: '#f97316',
        pointBorderColor: '#ffffff',
        pointBorderWidth: 2,
        pointRadius: 4,
        pointHoverRadius: 6,
      },
    ],
  };


  const chartOptions: any = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
      mode: 'index' as const,
      intersect: false,
    },
    plugins: {
      legend: {
        display: false, // Üstte custom Material 3 legend var
      },
      tooltip: {
        /* 2026-09-13 (tasarım düzeltmesi): Grafik ipucu kutusu koyu lacivertti.
           Açık tema yüzeyine çevrildi; Chart.js varsayılan metin rengi beyaz
           olduğu için başlık/gövde renkleri açıkça token'a bağlandı — aksi
           halde beyaz-üstü-beyaz okunamaz hale gelirdi. */
        backgroundColor: 'var(--bg-surface)',
        titleColor: 'var(--text-main)',
        bodyColor: 'var(--text-main)',
        borderColor: 'var(--border-color)',
        borderWidth: 1,
        titleFont: { size: 12, family: 'Inter', weight: 'bold' },
        bodyFont: { size: 12, family: 'Inter' },
        padding: 10,
        cornerRadius: 8,
        callbacks: {
          label: (context: any) => `${context.dataset.label}: ₺ ${Number(context.parsed.y).toLocaleString('tr-TR')}`,
        },
      },
    },
    scales: {
      y: {
        min: 0,
        // Sabit tavan YOK: eksen gerçek veriye göre ölçeklenir. (Önceden 1.000.000'a
        // sabitlenmişti; büyük ciroda grafik taşar, küçükte düz çizgi görünürdü.)
        beginAtZero: true,
        ticks: {
          callback: (value: any) => (value === 0 ? '0' : Number(value).toLocaleString('tr-TR')),
          color: 'var(--text-muted)',
          font: { size: 11, family: 'Inter' },
        },
        grid: {
          color: 'var(--border-light)',
        },
        border: {
          display: false,
        },
      },
      x: {
        grid: {
          display: false,
        },
        ticks: {
          color: 'var(--text-muted)',
          font: { size: 11, family: 'Inter' },
        },
        border: {
          display: false,
        },
      },
    },
  };

  // ─── Son Belgeler — GERÇEK fatura kayıtlarından türetilir ───
  // ÖNEMLİ: Burada sabit/uydurma belge gösterilmez. Kayıt yoksa boş durum basılır.
  // 2026-09-15: `icon` ve `bgColor` alanları kaldırıldı (dolu renkli daire
  // kaldırıldığı için kullanılmıyordu). Yalnız ayırt edici `accent` rengi
  // kaldı; o da artık DOLGU değil, ince bir çizgi olarak çizilir.
  const docTypeMeta = (type: string) => {
    switch (type) {
      case 'PURCHASE': return { label: 'Alış Faturası', accent: '#f97316' };
      case 'RETAIL_POS': return { label: 'Perakende Satış', accent: '#0284c7' };
      default: return { label: 'Satış Faturası', accent: '#d12131' };
    }
  };
  const docStatusMeta = (status: string, paymentStatus: string) => {
    if (status === 'CANCELLED') return { label: 'İptal', pillClass: 'm3-pill-danger' };
    if (paymentStatus === 'PAID') return { label: 'Ödendi', pillClass: 'm3-pill-success' };
    if (paymentStatus === 'PARTIAL') return { label: 'Kısmi', pillClass: 'm3-pill-warning' };
    return { label: 'Bekliyor', pillClass: 'm3-pill-info' };
  };
  const recentDocuments = invoices.slice(0, 5).map((inv: any) => {
    const t = docTypeMeta(inv.type);
    const s = docStatusMeta(inv.status, inv.paymentStatus);
    return {
      key: inv.id,
      type: t.label,
      accent: t.accent,
      docNo: inv.invoiceNo || '-',
      company: inv.customerTitle || '-',
      date: formatDate(inv.date),
      amount: formatCurrency(inv.grandTotal ?? 0),
      status: s.label,
      pillClass: s.pillClass,
    };
  });

  // ─── Son Aktiviteler — GERÇEK sistem bildirimlerinden türetilir ───
  // 2026-09-15: `icon` / `bgColor` kaldırıldı; yalnız türe göre ayırt edici
  // `accent` rengi kaldı (sol kenar rayı olarak çizilir).
  const activityMeta = (type: string) => {
    switch (type) {
      case 'CRITICAL_STOCK': return { accent: '#f97316' };
      case 'OVERDUE_MATURITY': return { accent: '#ef4444' };
      case 'UPCOMING_CHECK': return { accent: '#8b5cf6' };
      case 'LOW_CASH': return { accent: '#ef4444' };
      default: return { accent: '#0284c7' };
    }
  };
  const recentActivities = (Array.isArray(data?.notifications) ? data.notifications : []).map((n: any, i: number) => {
    const meta = activityMeta(n?.type);
    const created = n?.createdAt ? new Date(n.createdAt) : null;
    const when = created && !Number.isNaN(created.getTime())
      ? created.toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
      : '';
    return {
      // NOT: Math.random() anahtar olarak KULLANILMAZ — her render'da değişip
      // bileşenin yeniden mount olmasına yol açardı. Kararlı anahtar kullanılır.
      id: n?.id ?? `bildirim-${i}`,
      title: n?.title ?? 'Bildirim',
      meta: when ? `${when}${n?.message ? ' • ' + n.message : ''}` : (n?.message ?? ''),
      accent: meta.accent,
      onClick: () => { setActiveView('activity-logs'); setActiveRibbonTab('AYARLAR'); },
    };
  });

  // ─── Mini Takvim — GERÇEK geçerli ay (sabit "Nisan 2025" değil) ───
  const ayAdlari = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
  const calMonthLabel = `${ayAdlari[calCursor.month]} ${calCursor.year}`;
  const bugun = new Date();
  const calendarDays = (() => {
    const ilkGun = new Date(calCursor.year, calCursor.month, 1);
    const ayGunSayisi = new Date(calCursor.year, calCursor.month + 1, 0).getDate();
    // Pazartesi = 0 olacak şekilde kaydırma
    const baslangicKaymasi = (ilkGun.getDay() + 6) % 7;
    const oncekiAyGunSayisi = new Date(calCursor.year, calCursor.month, 0).getDate();
    const gunler: Array<{ day: number; isCurrentMonth: boolean; isToday?: boolean }> = [];
    for (let i = baslangicKaymasi - 1; i >= 0; i--) {
      gunler.push({ day: oncekiAyGunSayisi - i, isCurrentMonth: false });
    }
    for (let g = 1; g <= ayGunSayisi; g++) {
      const isToday =
        bugun.getFullYear() === calCursor.year &&
        bugun.getMonth() === calCursor.month &&
        bugun.getDate() === g;
      gunler.push({ day: g, isCurrentMonth: true, isToday });
    }
    while (gunler.length % 7 !== 0) {
      gunler.push({ day: gunler.length - (baslangicKaymasi + ayGunSayisi) + 1, isCurrentMonth: false });
    }
    return gunler;
  })();
  const ayDegistir = (delta: number) => {
    setCalCursor(prev => {
      const d = new Date(prev.year, prev.month + delta, 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    });
  };

  // 2026-09-15: userName kaldırıldı — büyük karşılama başlığı ile birlikte
  // kullanımı da bitti. Kullanıcı adı yalnız üst çubuktaki profil çipinde.
  const bugunEtiketi = bugun.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' });

  return (
    <div className="m3-dashboard-canvas">
      {/* ─── 1. SAYFA BAŞLIĞI + TARİH/KAPSAM (tek satır) ───
          2026-09-15 (kompozisyon kararı): Önceki sürümde "Merhaba Ahmet,"
          başlığı 20px ile ekranın en büyük tipografik anıydı. Her gün açılan
          bir ERP ekranında kullanıcının kendi adı ona HİÇBİR şey söylemez;
          o dikey alan ve dikkat, veriye gitmelidir. Karşılama kaldırıldı —
          kullanıcı adı zaten sağ üstteki profil çipinde duruyor.
          Yerine nötr işlevsel başlık + aynı satırda tarih ve kapsam.
          (Erişilebilirlik: sayfada hâlâ bir <h1> var.) */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '12px',
          marginBottom: '20px',
        }}
      >
        <h1
          style={{
            fontSize: 'var(--fs-lg, 16px)',
            fontWeight: 600,
            color: 'var(--text-main)',
            letterSpacing: '-0.01em',
            margin: 0,
            lineHeight: 1.3,
          }}
        >
          Genel Bakış
        </h1>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {/* Tarih — salt bilgi etiketi */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              fontSize: 'var(--fs-sm, 12px)',
              fontWeight: 500,
              color: 'var(--text-muted)',
            }}
          >
            <Calendar size={14} />
            <span>{bugunEtiketi}</span>
          </div>

          {/* Aktif işletme — SALT BİLGİ.
              2026-09-13 (dürüstlük düzeltmesi): Önceden bu öğe açılır menü gibi
              görünüyordu (ChevronDown + cursor:pointer) ama HİÇBİR tıklama
              davranışı yoktu; ayrıca kiracı yokken "Tüm işletmeler" yazıyordu —
              oysa böyle bir toplu görünüm mevcut değil. Artık sade bir etiket:
              yalnız gerçek kiracı adı, yoksa hiç gösterilmez.
              2026-09-15: Kutulu/gölgeli kart görünümü kaldırıldı — tarihle
              aynı satırda sade bir ayraç + metin. */}
          {activeTenant?.name && (
            <>
              <span
                aria-hidden="true"
                style={{ width: '1px', height: '14px', background: 'var(--border-strong)', display: 'inline-block' }}
              />
              <span
                style={{
                  fontSize: 'var(--fs-sm, 12px)',
                  fontWeight: 500,
                  color: 'var(--text-muted)',
                }}
              >
                {activeTenant.name}
              </span>
            </>
          )}
        </div>
      </div>

      {/* ─── VERİ ALINAMADI UYARISI ─── */}
      {/* KURAL: API hatasında sahte veri gösterilmez; hata açıkça bildirilir. */}
      {loadError && !loading && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            padding: '12px 16px',
            marginBottom: '20px',
            background: 'var(--danger-bg)',
            border: '1px solid var(--danger-border)',
            borderRadius: 'var(--radius-sm, 6px)',
            color: 'var(--danger-text)',
            fontSize: 'var(--fs-sm, 12px)',
            fontWeight: 500,
          }}
          role="alert"
        >
          <ShieldCheck size={16} />
          <span>Özet verileri alınamadı. Gösterilen değerler eksik olabilir — lütfen sayfayı yenileyin.</span>
        </div>
      )}

      {/* ─── 2. FİNANSAL KPI ŞERİDİ (tek yüzey, 4 hücre) ───
          2026-09-15: Dört ayrı yüzen kart → tek kompakt şerit. Değerlerin
          HESAPLANDIĞI veri akışı DEĞİŞMEDİ (aşağıdaki totalRevenue /
          totalExpense / netProfit / totalDocs aynen korunuyor). */}
      <div className="dash-kpis">
        <KpiCell
          label="Toplam Gelir"
          value={formatCurrency(totalRevenue)}
          footer={<TrendRozet deger={gelirDegisim} iyiYon="artis" />}
        />

        <KpiCell
          label="Toplam Gider"
          value={formatCurrency(totalExpense)}
          footer={<TrendRozet deger={giderDegisim} iyiYon="azalis" />}
        />

        <KpiCell
          label="Net Kâr"
          value={formatCurrency(netProfit)}
          footer={<TrendRozet deger={karDegisim} iyiYon="artis" />}
        />

        <KpiCell
          label="Düzenlenen Belge"
          value={String(totalDocs)}
          footer={<span>Kayıtlı fatura sayısı</span>}
        />
      </div>

      {/* ─── 3. İKİ KOLONLU ANA GRID (SOL: GRAFİK & TABLO, SAĞ: AKTİVİTE & TAKVİM) ─── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 2fr) minmax(320px, 1fr)',
          gap: '24px',
        }}
      >
        {/* SOL KOLON */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {/* AYLIK FİNANSAL ÖZET GRAFİK KARTI */}
          <div className="m3-card" style={{ padding: '24px' }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '20px',
              }}
            >
              <h3 style={{ fontSize: 'var(--fs-lg, 16px)', fontWeight: 600, color: 'var(--text-main)', margin: 0 }}>
                Aylık Finansal Özet
              </h3>
              {/* Özel Legend */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px', fontSize: 'var(--fs-sm, 12px)', fontWeight: 600 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ width: '8px', height: '8px', borderRadius: '2px', background: '#d12131' }} />
                  <span style={{ color: 'var(--text-secondary)' }}>Gelir</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ width: '8px', height: '8px', borderRadius: '2px', background: '#f97316' }} />
                  <span style={{ color: 'var(--text-secondary)' }}>Gider</span>
                </div>
              </div>
            </div>

            <div style={{ height: '280px', width: '100%' }}>
              {/* KURAL: Veri yokken sahte eğri ÇİZİLMEZ — dürüst boş durum gösterilir. */}
              {loading ? (
                <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-light)', fontSize: 'var(--fs-base, 13px)', fontWeight: 600 }}>
                  Yükleniyor…
                </div>
              ) : hasTrendData ? (
                <Line data={chartData} options={chartOptions} />
              ) : (
                <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '6px', border: '1px dashed var(--border-color)', borderRadius: 'var(--radius-sm, 6px)' }}>
                  <TrendingUp size={24} color="var(--text-light)" />
                  <div style={{ color: 'var(--text-muted)', fontSize: 'var(--fs-base, 13px)', fontWeight: 500 }}>Bu dönem için finansal hareket bulunmuyor</div>
                  <div style={{ color: 'var(--text-light)', fontSize: 'var(--fs-xs, 11px)' }}>Fatura veya gider kaydı girildiğinde grafik burada oluşur.</div>
                </div>
              )}
            </div>
          </div>

          {/* SON BELGELER TABLOSU KARTI */}
          <div className="m3-card" style={{ padding: '24px' }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '18px',
              }}
            >
              <h3 style={{ fontSize: 'var(--fs-lg, 16px)', fontWeight: 600, color: 'var(--text-main)', margin: 0 }}>
                Son Belgeler
              </h3>
              <button
                onClick={() => { setActiveView('faturalar'); setActiveRibbonTab('SATIS'); }}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--primary)',
                  fontSize: 'var(--fs-sm, 12px)',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                }}
              >
                Tümünü gör
              </button>
            </div>

            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                    {['Belge Türü', 'Belge No', 'Cari / Firma', 'Tarih', 'Tutar'].map((h) => (
                      <th key={h} style={{ padding: '8px 12px', fontSize: 'var(--fs-xs, 11px)', fontWeight: 500, color: 'var(--text-muted)' }}>{h}</th>
                    ))}
                    <th style={{ padding: '8px 12px', fontSize: 'var(--fs-xs, 11px)', fontWeight: 500, color: 'var(--text-muted)', textAlign: 'right' }}>Durum</th>
                  </tr>
                </thead>
                <tbody>
                  {recentDocuments.length === 0 ? (
                    <tr>
                      <td colSpan={6} style={{ padding: '24px 12px', textAlign: 'center', color: 'var(--text-light)', fontSize: 'var(--fs-base, 13px)' }}>
                        Henüz kayıtlı belge yok. Oluşturduğunuz faturalar burada listelenir.
                      </td>
                    </tr>
                  ) : recentDocuments.map((doc, idx) => {
                    return (
                      <tr
                        key={idx}
                        style={{
                          borderBottom: idx < recentDocuments.length - 1 ? '1px solid var(--border-light)' : 'none',
                          transition: 'background 120ms ease',
                        }}
                        onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-surface-hover)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                      >
                        {/* 2026-09-15: Tip sütunundaki 28px DOLU RENKLİ daire
                            kaldırıldı. Beş satırda beş farklı doygun arka plan
                            (turuncu/mavi/kırmızı) gözü veriden çalıyordu; renk
                            burada hiçbir bilgi taşımıyordu (tip zaten yazıyla
                            yazılı). Ayırt edicilik ince renkli bir çizgiyle
                            korunuyor — dolgu yok. */}
                        <td style={{ padding: '12px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <span
                              aria-hidden="true"
                              style={{
                                width: '3px',
                                height: '18px',
                                borderRadius: '2px',
                                background: doc.accent,
                                flexShrink: 0,
                              }}
                            />
                            <span style={{ fontSize: 'var(--fs-base, 13px)', fontWeight: 600, color: 'var(--text-main)' }}>{doc.type}</span>
                          </div>
                        </td>
                        <td style={{ padding: '12px', fontSize: 'var(--fs-base, 13px)', color: 'var(--text-secondary)', fontWeight: 500 }}>
                          {doc.docNo}
                        </td>
                        <td style={{ padding: '12px', fontSize: 'var(--fs-base, 13px)', color: 'var(--text-main)', fontWeight: 600 }}>
                          {doc.company}
                        </td>
                        <td style={{ padding: '12px', fontSize: 'var(--fs-sm, 12px)', color: 'var(--text-muted)' }}>
                          {doc.date}
                        </td>
                        <td style={{ padding: '12px', fontSize: 'var(--fs-base, 13px)', fontWeight: 600, color: 'var(--text-main)' }}>
                          {doc.amount}
                        </td>
                        <td style={{ padding: '12px', textAlign: 'right' }}>
                          <span className={`m3-pill ${doc.pillClass}`}>
                            {doc.status}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* SAĞ KOLON */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {/* SON AKTİVİTELER KARTI */}
          <div className="m3-card" style={{ padding: '24px' }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '18px',
              }}
            >
              <h3 style={{ fontSize: 'var(--fs-lg, 16px)', fontWeight: 600, color: 'var(--text-main)', margin: 0 }}>
                Son Aktiviteler
              </h3>
              <button
                onClick={() => { setActiveView('activity-logs'); setActiveRibbonTab('AYARLAR'); }}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--primary)',
                  fontSize: 'var(--fs-sm, 12px)',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                }}
              >
                Tümünü gör
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {recentActivities.length === 0 ? (
                <div style={{ padding: '24px 8px', textAlign: 'center', color: 'var(--text-light)', fontSize: 'var(--fs-sm, 12px)' }}>
                  Şu anda bildirim yok.
                </div>
              ) : recentActivities.map((act: any) => {
                return (
                  <div
                    key={act.id}
                    onClick={act.onClick}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      padding: '10px 8px',
                      borderRadius: 'var(--radius-sm, 6px)',
                      cursor: 'pointer',
                      transition: 'background 120ms ease',
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-surface-hover)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    {/* 2026-09-15: 36px dolu renkli ikon dairesi + her satırda
                        tekrar eden ChevronRight kaldırıldı. Ok işareti beş
                        satırda beş kez tekrarlanıyordu ve satırın tıklanabilir
                        olduğunu zaten hover arka planı anlatıyor. Ayırt edici
                        renk, sol kenardaki ince ray olarak korundu. */}
                    <span
                      aria-hidden="true"
                      style={{
                        width: '3px',
                        alignSelf: 'stretch',
                        minHeight: '30px',
                        borderRadius: '2px',
                        background: act.accent,
                        flexShrink: 0,
                      }}
                    />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 'var(--fs-base, 13px)', fontWeight: 600, color: 'var(--text-main)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {act.title}
                      </div>
                      <div style={{ fontSize: 'var(--fs-xs, 11px)', color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {act.meta}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* MİNİ TAKVİM KARTI */}
          <div className="m3-card" style={{ padding: '24px' }}>
            {/* Takvim Başlığı ve Navigasyon */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '18px',
              }}
            >
              {/* NOT: Önceki sürümde burada İKİ adet gezinme çifti vardı ve
                  hiçbiri bağlı değildi (tıklanınca hiçbir şey olmuyordu).
                  Tek çift bırakıldı ve gerçek ay gezinmesine bağlandı. */}
              <button
                onClick={() => ayDegistir(-1)}
                aria-label="Önceki ay"
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '4px', display: 'flex', alignItems: 'center' }}
              >
                <ChevronLeft size={16} />
              </button>

              <span style={{ fontSize: 'var(--fs-md, 14px)', fontWeight: 600, color: 'var(--text-main)' }}>
                {calMonthLabel}
              </span>

              <button
                onClick={() => ayDegistir(1)}
                aria-label="Sonraki ay"
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '4px', display: 'flex', alignItems: 'center' }}
              >
                <ChevronRight size={16} />
              </button>
            </div>

            {/* Haftanın Günleri Başlığı */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(7, 1fr)',
                textAlign: 'center',
                fontSize: 'var(--fs-xs, 11px)',
                fontWeight: 600,
                color: 'var(--text-muted)',
                marginBottom: '10px',
              }}
            >
              <span>Pzt</span>
              <span>Sal</span>
              <span>Çar</span>
              <span>Per</span>
              <span>Cum</span>
              <span>Cmt</span>
              <span>Paz</span>
            </div>

            {/* Günler Grid'i */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(7, 1fr)',
                rowGap: '8px',
                textAlign: 'center',
                fontSize: 'var(--fs-sm, 12px)',
              }}
            >
              {calendarDays.map((item, i) => (
                <div
                  key={i}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    height: '32px',
                  }}
                >
                  <span
                    style={{
                      width: '28px',
                      height: '28px',
                      borderRadius: '50%',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: item.isToday
                        ? '#ffffff'
                        : item.isCurrentMonth
                        ? 'var(--text-main)'
                        : 'var(--border-strong)',
                      background: item.isToday ? 'var(--primary)' : 'transparent',
                      fontWeight: item.isToday ? 600 : 400,
                    }}
                  >
                    {item.day}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
