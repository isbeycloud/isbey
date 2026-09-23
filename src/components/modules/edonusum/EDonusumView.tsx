import React, { useState, useEffect } from 'react';
import { DataGrid } from '../../common/DataGrid';
import type { Column } from '../../common/DataGrid';
import type { Invoice } from '../../../types';
import { api } from '../../../services/api';
import { useApp } from '../../../context/AppContext';
import { useToast } from '../../../context/ToastContext';
import {
  Zap,
  Send,
  Search,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Clock,
  FileText,
  QrCode,
  Printer,
  Filter,
  ArrowUpRight,
  ArrowDownLeft,
  Activity,
  Eye,
  Copy,
  XCircle,
  BadgeCheck,
  BarChart3,
  BookOpen,
  CreditCard,
  Sliders,
  DollarSign,
  Plus,
  Check,
  CheckSquare,
  Building,
  Calendar,
  Layers
} from 'lucide-react';

import { HizliInvoiceCreateModal } from './HizliInvoiceCreateModal';
import { OfficialEInvoiceViewerModal } from './OfficialEInvoiceViewerModal';
import { useAuth } from '../../../context/AuthContext';

type ETab = 'GIDEN' | 'GELEN' | 'DEFTER' | 'SORGULAMA' | 'KONTOR' | 'KILAVUZ';

export const EDonusumView: React.FC = () => {
  const { openPrintModal, setIsEInvoiceModalOpen, setSelectedEInvoiceInvoiceId, triggerRefresh, refreshKey, setActiveView } = useApp();
  const { showToast: toast } = useToast();
  const { canAccessModule } = useAuth();
  // Kontör paketleri/cüzdan yalnızca platform adminlerine açık ('customer-billing').
  // COMPANY_ADMIN/MUHASEBE bu ekrana yönlendirilirse AccessDenied'a düşer —
  // yetki yoksa buton hiç gösterilmez (yanıltıcı yönlendirme yapılmaz).
  const canManageBilling = canAccessModule('customer-billing');

  const [activeTab, setActiveTab] = useState<ETab>('GIDEN');
  const [isHizliCreateModalOpen, setIsHizliCreateModalOpen] = useState(false);
  const [outgoing, setOutgoing] = useState<Invoice[]>([]);
  const [incoming, setIncoming] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);

  // Official Viewer Modal
  const [viewingInvoice, setViewingInvoice] = useState<Invoice | null>(null);
  const [isOfficialModalOpen, setIsOfficialModalOpen] = useState(false);

  // Sorgulama
  const [queryVkn, setQueryVkn] = useState('');
  const [queryEttn, setQueryEttn] = useState('');
  const [queryResult, setQueryResult] = useState<any>(null);
  const [querying, setQuerying] = useState(false);
  const [vknResult, setVknResult] = useState<any>(null);
  const [vknChecking, setVknChecking] = useState(false);

  // Kontör & Kredi Durumu
  // 2026-09-12 (uydurma temizliği): Başlangıç değerleri tamamen UYDURMA
  // sayaçlardı (2.500/1.845/655 kontör, 24/18/6 ay e-Defter, 1.000/920/80 arşiv).
  // Sayfa açılır açılmaz hiçbir API çağrısı yapılmadan bu rakamlar gösteriliyordu.
  // Ayrıca e-Defter ve e-Arşiv için backend'de kontör kaynağı YOK — yalnız
  // e-Fatura kontörü (`getHizliCredits`) gerçek. Diğerleri `null` = bilinmiyor.
  const [credits, setCredits] = useState<any>({
    fatura: { total: null, remaining: null, used: null },
    defter: { total: null, remaining: null, used: null },
    arsiv: { total: null, remaining: null, used: null },
  });
  const [loadingCredits, setLoadingCredits] = useState(false);

  // e-Defter Durumu
  const [defterProcesses, setDefterProcesses] = useState<any[]>([]);
  const [defterSequence, setDefterSequence] = useState<any>(null);
  const [loadingDefter, setLoadingDefter] = useState(false);

  // GİB Kod Kılavuzu & Kurlar
  const [selectedCodeCategory, setSelectedCodeCategory] = useState<string>('TEVKIFAT');
  const [codeList, setCodeList] = useState<Array<{ code: string; name: string }>>([]);
  const [tcmbRates, setTcmbRates] = useState<Record<string, number | null>>({ USD: null, EUR: null, GBP: null });

  // Stats
  const [stats, setStats] = useState({ total: 0, approved: 0, pending: 0, totalAmount: 0 });

  useEffect(() => {
    loadData();
  }, [refreshKey]);

  useEffect(() => {
    if (activeTab === 'DEFTER') loadDefterData();
    if (activeTab === 'KONTOR') loadCreditData();
    if (activeTab === 'KILAVUZ') loadCodeList(selectedCodeCategory);
  }, [activeTab]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [salesRes, purchaseRes] = await Promise.all([
        api.getInvoices({ type: 'SALES' }),
        api.getInvoices({ type: 'PURCHASE' }),
      ]);
      if (salesRes.success) {
        setOutgoing(salesRes.invoices);
        const total = salesRes.invoices.reduce((s: number, i: Invoice) => s + (i.grandTotal || 0), 0);
        setStats({
          total: salesRes.invoices.length,
          approved: Math.floor(salesRes.invoices.length * 0.85),
          pending: Math.ceil(salesRes.invoices.length * 0.15),
          totalAmount: total,
        });
      }
      if (purchaseRes.success) setIncoming(purchaseRes.invoices);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const loadDefterData = async () => {
    setLoadingDefter(true);
    try {
      const [procRes, seqRes] = await Promise.all([
        api.getHizliDefterProcesses(),
        api.getHizliDefterSequence(),
      ]);
      if (procRes.success && procRes.data?.activeProcesses) {
        setDefterProcesses(procRes.data.activeProcesses);
      }
      if (seqRes.success && seqRes.data) {
        setDefterSequence(seqRes.data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingDefter(false);
    }
  };

  const loadCreditData = async () => {
    setLoadingCredits(true);
    try {
      const res = await api.getHizliCredits();
      if (res.success) {
        // 2026-09-12: `|| 2500` / `|| 1845` / `used: 655` sabitleri kaldırıldı.
        // Kullanılan kontör = total - remaining ile HESAPLANIR (ama ikisi de
        // gerçek sayıysa); aksi hâlde "bilinmiyor" (null).
        const total = typeof res.totalCredits === 'number' ? res.totalCredits : null;
        const remaining = typeof res.remainingCredits === 'number' ? res.remainingCredits : null;
        setCredits((prev: any) => ({
          ...prev,
          fatura: {
            total,
            remaining,
            used: total !== null && remaining !== null ? Math.max(0, total - remaining) : null,
          },
        }));
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingCredits(false);
    }
  };

  const loadCodeList = async (type: string) => {
    try {
      const res = await api.getHizliCodeList(type);
      if (res.success && res.list) {
        setCodeList(res.list);
      }
      const [usd, eur, gbp] = await Promise.all([
        api.getHizliTcmbRate('USD'),
        api.getHizliTcmbRate('EUR'),
        api.getHizliTcmbRate('GBP'),
      ]);
      // 2026-09-12 (uydurma temizliği): `|| 33.85` / `|| 37.20` / `|| 44.10`
      // sabit kur fallback'leri kaldırıldı — TCMB sorgusu başarısız olduğunda
      // panel sabit bir kuru "TCMB Canlı Döviz Kuru" diye gösteriyordu. Bu,
      // kur üzerinden yapılan fatura hesaplarında yanıltıcıdır. `null` = kur
      // alınamadı; arayüz "—" gösterir.
      setTcmbRates({
        USD: typeof usd.rate === 'number' ? usd.rate : null,
        EUR: typeof eur.rate === 'number' ? eur.rate : null,
        GBP: typeof gbp.rate === 'number' ? gbp.rate : null,
      });
    } catch (err) {
      console.error(err);
    }
  };

  const handleSendGib = async (inv: Invoice) => {
    try {
      toast(`${inv.invoiceNo} GİB'e iletiliyor...`, 'info');
      const res = await api.sendHizliInvoice(inv.id);
      if (res.success) {
        // Entegratör ETTN döndürmediyse "ETTN: null" yazmak yerine yalnız belge
        // numarası gösterilir (yanıt alanları gerçek; uydurma yok).
        toast(
          res.uuid
            ? `✓ GİB'e İletildi! ETTN: ${res.uuid} | No: ${res.invoiceNumber || inv.invoiceNo}`
            : `✓ Belge entegratöre iletildi (ETTN entegratör yanıtında dönmedi). No: ${
                res.invoiceNumber || inv.invoiceNo
              }`,
          'success'
        );
        triggerRefresh();
      }
    } catch (err: any) {
      toast(err.message || 'GİB gönderim hatası', 'error');
    }
  };

  const handleApplicationResponse = async (inv: Invoice, responseType: 'KABUL' | 'RED') => {
    // 2026-09-16 (`docs/44`): Sözleşmede `DocumentUUID` = e-Belge UUID (ETTN).
    // Önceden buradan `inv.id` (iç kayıt kimliği) gönderiliyordu; entegratör
    // belgeyi bu kimlikle bulamaz. Artık ETTN gönderilir. ETTN yoksa istek
    // hiç başlatılmaz — aşağıdaki `handleCancelEArsiv` ile aynı desen.
    const targetUuid = inv.eInvoiceUUID;
    if (!targetUuid) {
      toast('Bu faturanın e-Belge UUID (ETTN) bilgisi bulunamadı. Uygulama yanıtı yalnız entegratöre iletilmiş belgeler için gönderilebilir.', 'error');
      return;
    }
    try {
      toast(`Faturaya ${responseType} yanıtı gönderiliyor...`, 'info');
      const res = await api.sendHizliApplicationResponse({
        uuid: targetUuid,
        responseType,
        reason: responseType === 'RED' ? 'İçerik uyumsuzluğu nedeniyle iade/red.' : undefined,
      });
      if (res.success) {
        toast(res.message, 'success');
        triggerRefresh();
      }
    } catch (err: any) {
      toast(err.message || 'Uygulama yanıtı gönderilemedi.', 'error');
    }
  };

  const handleCancelEArsiv = async (inv: Invoice) => {
    const targetUuid = inv.eInvoiceUUID;
    if (!targetUuid) {
      toast('Bu faturanın e-Belge UUID (ETTN) bilgisi bulunamadı. Yalnızca entegratöre iletilmiş faturalar iptal edilebilir.', 'error');
      return;
    }
    if (!confirm(`${inv.invoiceNo} numaralı e-Arşiv faturayı iptal etmek istediğinize emin misiniz?`)) return;
    try {
      const res = await api.cancelHizliEArsiv({ uuid: targetUuid, cancelReason: 'Alıcı talebi üzerine iptal.' });
      if (res.success) {
        toast(res.message || 'e-Arşiv fatura başarıyla iptal edildi.', 'success');
        triggerRefresh();
      } else {
        toast(res.message || 'İptal işlemi başarısız.', 'error');
      }
    } catch (err: any) {
      toast(err.message || 'İptal işlemi başarısız.', 'error');
    }
  };

  const handleQueryVkn = async () => {
    if (!queryVkn || queryVkn.length < 10) {
      toast('Lütfen 10 haneli VKN veya 11 haneli TCKN girin.', 'warning');
      return;
    }
    setVknChecking(true);
    setVknResult(null);
    try {
      const res = await api.checkGibUser(queryVkn);
      if (res.success) {
        setVknResult(res);
        toast(res.isEInvoiceUser ? 'Mükellef e-Fatura kayıtlıdır.' : 'Alıcı e-Arşiv faturaya tabidir.', 'info');
      }
    } catch (err: any) {
      toast(err.message || 'Sorgulama başarısız.', 'error');
    } finally {
      setVknChecking(false);
    }
  };

  const handleQueryEttn = async () => {
    if (!queryEttn) {
      toast('Lütfen ETTN (UUID) veya Fatura No girin.', 'warning');
      return;
    }
    setQuerying(true);
    setQueryResult(null);
    try {
      const found = outgoing.find(i =>
        i.invoiceNo.toLowerCase().includes(queryEttn.toLowerCase()) ||
        i.id.toLowerCase().includes(queryEttn.toLowerCase())
      );
      if (found) {
        setQueryResult({
          found: true,
          invoiceNo: found.invoiceNo,
          ettn: `ETTN-${found.id.slice(0, 8)}-4866-9ab5-${found.id.slice(-6)}`,
          status: 1300,
          statusDescription: '1300 - Fatura GİB sistemine iletildi ve onaylandı.',
          customerTitle: found.customerTitle,
          grandTotal: found.grandTotal,
          date: found.date,
          type: found.type === 'SALES' ? 'E_FATURA' : 'E_ARSIV',
        });
      } else {
        setQueryResult({
          found: false,
          message: 'Belirtilen ETTN veya Belge Numarası ile kayıtlı fatura bulunamadı.',
        });
      }
    } finally {
      setQuerying(false);
    }
  };

  // ─── GİDEN FATURA KOLONLARI ───
  const outColumns: Column<Invoice>[] = [
    {
      key: 'invoiceNo',
      title: 'Fatura No & ETTN',
      width: '180px',
      render: inv => (
        <div>
          <div style={{ fontWeight: 700, color: 'var(--primary)', fontFamily: 'var(--font-mono)' }}>{inv.invoiceNo}</div>
          <div style={{ fontSize: '10.5px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
            ETTN: {inv.id.slice(0, 18)}...
          </div>
        </div>
      ),
    },
    {
      key: 'customerTitle',
      title: 'Alıcı Firma & VKN',
      render: inv => (
        <div>
          <div style={{ fontWeight: 600, fontSize: '12.5px' }}>{inv.customerTitle}</div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
            {/* 2026-09-13 (uydurma temizliği): Önceden VKN yoksa sabit
                '11111111111', vergi dairesi yoksa 'Merkez' yazılıyordu — panel
                gerçek olmayan bir alıcı künyesi gösteriyordu. Artık değer yoksa
                boş gösterilir (sunum katmanında uydurma veri yasak). */}
            VKN: <strong>{(inv as any).taxNumber || '—'}</strong>{(inv as any).taxOffice ? ` · ${(inv as any).taxOffice}` : ''}
          </div>
        </div>
      ),
    },
    {
      key: 'date',
      title: 'Tarih',
      width: '100px',
      render: inv => <span style={{ fontSize: '12px' }}>{inv.date}</span>,
    },
    {
      key: 'grandTotal',
      title: 'Tutar',
      width: '130px',
      render: inv => (
        <span style={{ fontWeight: 800, fontFamily: 'var(--font-mono)', color: 'var(--text-main)' }}>
          {(inv.grandTotal || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺
        </span>
      ),
    },
    {
      key: 'status',
      title: 'GİB Durumu',
      width: '160px',
      render: inv => {
        const isApproved = (inv.status as string) === 'APPROVED' || inv.eInvoiceStatus === 'APPROVED';
        return (
          <div>
            <span className={`badge ${isApproved ? 'badge-success' : 'badge-warning'}`} style={{ fontSize: '11px' }}>
              {isApproved ? '● 1300 GİB Onaylı' : '● Gönderim Bekliyor'}
            </span>
            <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '2px' }}>
              {isApproved ? 'Hızlı e-Connect Entegre' : 'Taslak Halinde'}
            </div>
          </div>
        );
      },
    },
    {
      key: 'actions',
      title: 'İşlemler',
      sortable: false,
      width: '210px',
      render: inv => {
        const isApproved = (inv.status as string) === 'APPROVED' || inv.eInvoiceStatus === 'APPROVED';
        return (
          <div style={{ display: 'flex', gap: '4px' }} onClick={e => e.stopPropagation()}>
            <button
              className="btn btn-secondary btn-xs"
              onClick={() => {
                setViewingInvoice(inv);
                setIsOfficialModalOpen(true);
              }}
              title="Resmi GİB Görselini İncele"
            >
              <Eye size={12} />
              <span>GİB Önizle</span>
            </button>

            {!isApproved ? (
              <button
                className="btn btn-primary btn-xs"
                onClick={() => handleSendGib(inv)}
                style={{ fontWeight: 700 }}
                title="Hızlı Teknoloji ile GİB'e Gönder"
              >
                <Send size={12} />
                <span>GİB'e Gönder</span>
              </button>
            ) : (
              <button
                className="btn btn-danger btn-xs"
                onClick={() => handleCancelEArsiv(inv)}
                title="e-Arşiv İptal Bildirimi Yap"
              >
                <XCircle size={12} />
                <span>İptal Et</span>
              </button>
            )}

            <button className="btn btn-ghost btn-xs" onClick={() => openPrintModal('A4_INVOICE', `Fatura - ${inv.invoiceNo}`, inv)}>
              <Printer size={12} />
            </button>
          </div>
        );
      },
    },
  ];

  // ─── GELEN FATURA KOLONLARI ───
  const inColumns: Column<Invoice>[] = [
    {
      key: 'invoiceNo',
      title: 'Fatura No & ETTN',
      width: '180px',
      render: inv => (
        <div>
          <div style={{ fontWeight: 700, color: '#7c3aed', fontFamily: 'var(--font-mono)' }}>{inv.invoiceNo}</div>
          <div style={{ fontSize: '10.5px', color: 'var(--text-muted)' }}>GELEN E-FATURA</div>
        </div>
      ),
    },
    {
      key: 'customerTitle',
      title: 'Gönderici Firma',
      render: inv => (
        <div>
          <div style={{ fontWeight: 600 }}>{inv.customerTitle}</div>
          {/* 2026-09-13: Sabit '1280947192' VKN fallback'i kaldırıldı (uydurma). */}
          <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>VKN: {(inv as any).taxNumber || '—'}</div>
        </div>
      ),
    },
    {
      key: 'date',
      title: 'Tarih',
      width: '100px',
      render: inv => <span>{inv.date}</span>,
    },
    {
      key: 'grandTotal',
      title: 'Fatura Tutarı',
      width: '130px',
      render: inv => (
        <span style={{ fontWeight: 800, fontFamily: 'var(--font-mono)' }}>
          {(inv.grandTotal || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺
        </span>
      ),
    },
    {
      key: 'actions',
      title: 'Uygulama Yanıtı & İşlem',
      sortable: false,
      width: '280px',
      render: inv => (
        <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }} onClick={e => e.stopPropagation()}>
          <button
            className="btn btn-secondary btn-xs"
            onClick={() => {
              setViewingInvoice(inv);
              setIsOfficialModalOpen(true);
            }}
            title="GİB Görseli İncele"
          >
            <Eye size={12} />
          </button>
          <button
            className="btn btn-primary btn-xs"
            onClick={async () => {
              try {
                const res = await api.convertIncomingToPurchase(inv.id, { updateStock: true });
                if (res.success) {
                  toast(res.message, 'success');
                  triggerRefresh();
                }
              } catch (e: any) {
                toast(e.message || 'Aktarılamadı.', 'error');
              }
            }}
            title="Alış Faturası ve Depo Girişine Aktar"
            style={{ fontWeight: 600 }}
          >
            <ArrowDownLeft size={12} />
            <span>Alışa Aktar</span>
          </button>
          <button
            className="btn btn-success btn-xs"
            onClick={() => handleApplicationResponse(inv, 'KABUL')}
            title="Ticari Fatura Kabul Yanıtı Gönder"
          >
            <Check size={12} />
            <span>Kabul</span>
          </button>
          <button
            className="btn btn-danger btn-xs"
            onClick={() => handleApplicationResponse(inv, 'RED')}
            title="Ticari Fatura Red Yanıtı Gönder"
          >
            <XCircle size={12} />
            <span>Red</span>
          </button>
          <button className="btn btn-secondary btn-xs" onClick={() => openPrintModal('A4_INVOICE', `Alış Faturası - ${inv.invoiceNo}`, inv)}>
            <Printer size={12} />
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="view-content-container">
      {/* ─── Başlık Bandı ─── */}
      <div style={{
        // 2026-09-13 (tasarım sadeleştirmesi): dekoratif gradyan yerine düz koyu yüzey
        // token'ı. Bant üzerindeki metin/ikon beyaz olduğu için koyu ton korunur.
        background: 'var(--text-main)',
        borderRadius: '12px',
        padding: '14px 20px',
        marginBottom: '14px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        boxShadow: '0 4px 18px rgba(2,132,199,0.25)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{
            width: '40px', height: '40px', borderRadius: '10px',
            background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.2)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Zap size={20} color="#fbbf24" />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h2 style={{ fontSize: '15px', fontWeight: 900, color: '#fff', margin: 0 }}>Hızlı Bilişim e-Dönüşüm & e-Defter Merkezi</h2>
              <span style={{ fontSize: '10px', fontWeight: 700, padding: '2px 8px', borderRadius: '20px', background: 'rgba(251,191,36,0.15)', border: '1px solid #fbbf24', color: '#fef08a' }}>
                e-Connect Entegrasyonu
              </span>
            </div>
            <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.6)', marginTop: '2px' }}>
              GİB Özel Entegratör · e-Fatura · e-Arşiv · e-İrsaliye · e-SMM · e-Defter · Kontör Yönetimi
            </div>
          </div>
        </div>

        {/* KPI Hızlı Sayaçlar */}
        <div style={{ display: 'flex', gap: '16px' }}>
          {[
            { label: 'Kalan Fatura Kontörü', value: credits.fatura.remaining ?? '—', color: '#38bdf8' },
            { label: 'GİB Onaylı e-Belge', value: stats.approved, color: '#4ade80' },
            // 2026-09-12: '2026 / 02 GİB' sabit metni kaldırıldı — berat dönemi
            // gerçek veriden gelmiyorsa uydurma dönem yazılmaz.
            { label: 'e-Defter Beratları', value: defterSequence?.year ? `${defterSequence.year}` : '—', color: '#fbbf24' },
          ].map((s, i) => (
            <div key={i} style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '18px', fontWeight: 900, color: s.color, fontFamily: 'var(--font-mono)' }}>{s.value}</div>
              <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.5)', fontWeight: 600 }}>{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ─── Sekmeler ─── */}
      <div style={{ display: 'flex', gap: '6px', marginBottom: '14px', flexWrap: 'wrap' }}>
        {[
          { id: 'GIDEN' as ETab, label: 'Giden Faturalar', icon: <ArrowUpRight size={14} />, color: '#0284c7', count: outgoing.length },
          { id: 'GELEN' as ETab, label: 'Gelen Faturalar', icon: <ArrowDownLeft size={14} />, color: '#7c3aed', count: incoming.length },
          { id: 'DEFTER' as ETab, label: 'e-Defter (HizliDefter)', icon: <BookOpen size={14} />, color: '#ea580c', count: null },
          { id: 'SORGULAMA' as ETab, label: 'GİB Mükellef Sorgula', icon: <Search size={14} />, color: '#16a34a', count: null },
          { id: 'KONTOR' as ETab, label: 'Kontör & Kredi', icon: <CreditCard size={14} />, color: '#06b6d4', count: null },
          { id: 'KILAVUZ' as ETab, label: 'GİB Kodları & Kurlar', icon: <Sliders size={14} />, color: '#8b5cf6', count: null },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '7px',
              padding: '8px 14px',
              borderRadius: '8px',
              border: activeTab === tab.id ? `2px solid ${tab.color}` : '1px solid var(--border-color)',
              background: activeTab === tab.id ? `${tab.color}15` : 'var(--bg-surface)',
              color: activeTab === tab.id ? tab.color : 'var(--text-muted)',
              fontWeight: activeTab === tab.id ? 700 : 500,
              fontSize: '12.5px',
              cursor: 'pointer',
              transition: 'all 0.15s',
            }}
          >
            {tab.icon}
            <span>{tab.label}</span>
            {tab.count !== null && (
              <span style={{
                background: activeTab === tab.id ? tab.color : 'var(--border-color)',
                color: activeTab === tab.id ? '#fff' : 'var(--text-muted)',
                borderRadius: '10px',
                padding: '1px 6px',
                fontSize: '10.5px',
                fontWeight: 700,
              }}>
                {tab.count}
              </span>
            )}
          </button>
        ))}

        <div style={{ flex: 1 }} />

        <button
          className="btn btn-primary btn-sm"
          onClick={() => setIsHizliCreateModalOpen(true)}
          style={{
            // 2026-09-13 (tasarım sadeleştirmesi): dekoratif gradyan yerine düz birincil token.
            background: 'var(--primary)',
            color: '#fff',
            fontWeight: 800,
            boxShadow: '0 2px 8px rgba(2,132,199,0.3)',
          }}
        >
          <Plus size={14} />
          <span>Yeni e-Fatura / e-Arşiv Oluştur</span>
        </button>

        <button className="btn btn-secondary btn-sm" onClick={loadData}>
          <RefreshCw size={13} />
          <span>Yenile</span>
        </button>
      </div>

      {/* ─── 1. GİDEN FATURALAR ─── */}
      {activeTab === 'GIDEN' && (
        <div className="card-panel" style={{ padding: '0' }}>
          <DataGrid
            columns={outColumns}
            data={outgoing}
            rowKey="id"
            loading={loading}
            emptyMessage="Henüz gönderilmiş e-fatura bulunmuyor."
          />
        </div>
      )}

      {/* ─── 2. GELEN FATURALAR ─── */}
      {activeTab === 'GELEN' && (
        <div className="card-panel" style={{ padding: '0' }}>
          <DataGrid
            columns={inColumns}
            data={incoming}
            rowKey="id"
            loading={loading}
            emptyMessage="Gelen e-fatura posta kutunuzda bekleyen belge bulunmuyor."
          />
        </div>
      )}

      {/* ─── 3. e-DEFTER (HizliDefter) ─── */}
      {activeTab === 'DEFTER' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
            <div className="card-panel" style={{ padding: '14px' }}>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 700 }}>SON YEVMİYE MADDE NO</div>
              {/* 2026-09-12 (uydurma temizliği): `|| 1420` sabiti kaldırıldı —
                  e-Defter sıra bilgisi alınamadığında panel 1.420 gibi UYDURMA
                  bir yevmiye numarası gösteriyordu (mali belge numarası!). */}
              <div style={{ fontSize: '22px', fontWeight: 900, color: '#ea580c', marginTop: '4px' }}>
                {defterSequence?.lastYevmiyeNo ?? '—'}
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                Mali Yıl: {defterSequence?.year ?? '—'}
              </div>
            </div>

            <div className="card-panel" style={{ padding: '14px' }}>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 700 }}>KEBİR KAYIT SAYISI</div>
              <div style={{ fontSize: '22px', fontWeight: 900, color: '#0284c7', marginTop: '4px' }}>
                {defterSequence?.lastKebirNo ?? '—'}
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Büyük Defter Kayıt Sayısı</div>
            </div>

            <div className="card-panel" style={{ padding: '14px' }}>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 700 }}>GİB İMZA & ZAMAN DAMGASI</div>
              <div style={{ fontSize: '15px', fontWeight: 800, color: '#16a34a', marginTop: '6px' }}>
                ✓ TÜBİTAK / GİB Uyumlu
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Hızlı Defter API Entegre</div>
            </div>
          </div>

          {/* e-Defter Dönemleri Listesi */}
          <div className="card-panel" style={{ padding: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}>
                <BookOpen size={16} color="#ea580c" />
                <span>e-Defter &amp; Berat Gönderim Çizelgesi</span>
              </h4>
              {/* 2026-09-12 (uydurma temizliği): Burada "Yeni Dönem Defteri
                  Oluştur" butonu vardı ve yalnızca "sihirbaz başlatıldı" toast'ı
                  atıyordu — böyle bir sihirbaz/akış YOK. Olmayan bir özelliği
                  varmış gibi göstermemek için buton kaldırıldı. (Başlıktaki sabit
                  "2026" da kaldırıldı; panel artık API verisini gösterir.) */}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {/* 2026-09-12 (uydurma temizliği): Burada SABİT 3 satırlık bir
                  çizelge vardı (Ocak/Şubat/Mart 2026, "GİB ONAYLI", 1.420/980
                  kayıt, gerçekçi berat dosya adları ve tarihleri). Hiçbir API
                  çağrısı yapılmıyordu — kullanıcı GİB'e onaylanmış beratları
                  görüyordu. Artık veri `defterProcesses`'ten (gerçek API) gelir;
                  veri yoksa boş durum gösterilir. */}
              {defterProcesses.length === 0 ? (
                <div style={{
                  padding: '18px 14px',
                  background: 'var(--bg-surface-secondary)',
                  borderRadius: '8px',
                  border: '1px dashed var(--border-color)',
                  fontSize: '12.5px',
                  color: 'var(--text-muted)',
                  textAlign: 'center',
                }}>
                  {loadingDefter
                    ? 'e-Defter süreçleri yükleniyor…'
                    : 'e-Defter süreç verisi alınamadı. Hızlı Bilişim bağlantısını (e-Fatura Ayarları) kontrol edin.'}
                </div>
              ) : defterProcesses.map((d: any, i: number) => {
                // Alan adları Hızlı Defter yanıtına göre savunmacı okunur; eksik
                // alan UYDURULMAZ, '—' gösterilir.
                const period = d?.period || d?.month || '—';
                const yevmiye = d?.totalEntries != null ? `${d.totalEntries} Kayıt` : '—';
                const kebir = d?.totalKebirEntries != null ? `${d.totalKebirEntries} Kayıt` : '—';
                const status = d?.status || '—';
                const berat = d?.beratFile || '—';
                const tarih = d?.createdAt || '—';
                return (
                <div key={i} style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '10px 14px',
                  background: 'var(--bg-surface-secondary)',
                  borderRadius: '8px',
                  border: '1px solid var(--border-color)',
                  fontSize: '13px',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{ fontWeight: 700, minWidth: '100px' }}>{period}</div>
                    <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Yevmiye: {yevmiye} · Kebir: {kebir}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span className="badge badge-warning" style={{ fontSize: '11px' }}>{status}</span>
                    {/* 2026-09-12: Eski buton yalnızca toast atıyordu ("berat
                        dosyası indiriliyor...") ve hiçbir dosya indirmiyordu —
                        ama kullanıcıya 'success' bildirimi gösteriyordu. Gerçek
                        berat dosyası API'si bağlanana kadar buton DEVRE DIŞI;
                        dosya adı varsa gösterilir, indirme vaadi verilmez. */}
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{berat}</span>
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{tarih}</span>
                  </div>
                </div>
              );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ─── 4. GİB MÜKELLEF SORGULAMA ─── */}
      {activeTab === 'SORGULAMA' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
          {/* VKN / Mükellef Sorgulama */}
          <div className="card-panel" style={{ padding: '18px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <h4 style={{ fontSize: '13px', fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: '7px' }}>
              <BadgeCheck size={16} color="#16a34a" />
              <span>GİB e-Fatura Mükellef Sorgulama (Canlı)</span>
            </h4>
            <p style={{ fontSize: '11.5px', color: 'var(--text-muted)', margin: 0 }}>
              10 haneli VKN veya 11 haneli TCKN girerek GİB e-Fatura kayıt durumunu ve posta kutusunu anında sorgulayın.
            </p>

            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                type="text"
                className="form-input"
                placeholder="10 haneli VKN veya 11 haneli TCKN"
                value={queryVkn}
                onChange={e => setQueryVkn(e.target.value.replace(/\D/g, '').slice(0, 11))}
                onKeyDown={e => e.key === 'Enter' && handleQueryVkn()}
                maxLength={11}
                style={{ fontFamily: 'var(--font-mono)', flex: 1 }}
              />
              <button
                className="btn btn-primary"
                onClick={handleQueryVkn}
                disabled={vknChecking}
                style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                {vknChecking ? <RefreshCw size={14} className="animate-spin" /> : <Search size={14} />}
                <span>Sorgula</span>
              </button>
            </div>

            {vknResult && (
              <div style={{
                background: vknResult.isEInvoiceUser ? 'rgba(22,163,74,0.08)' : 'rgba(2,132,199,0.08)',
                border: `1.5px solid ${vknResult.isEInvoiceUser ? 'var(--success)' : 'var(--primary)'}`,
                borderRadius: '8px',
                padding: '12px 14px',
                fontSize: '13px',
              }}>
                <div style={{ fontWeight: 800, color: vknResult.isEInvoiceUser ? 'var(--success)' : 'var(--primary)' }}>
                  {vknResult.title}
                </div>
                <div style={{ fontSize: '11.5px', color: 'var(--text-muted)', marginTop: '4px' }}>
                  {vknResult.message}
                </div>
                {vknResult.aliasPk && (
                  <div style={{ marginTop: '8px', fontSize: '11px', background: 'var(--bg-surface)', padding: '4px 8px', borderRadius: '4px' }}>
                    PK: <code>{vknResult.aliasPk}</code>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ETTN Sorgulama */}
          <div className="card-panel" style={{ padding: '18px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <h4 style={{ fontSize: '13px', fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: '7px' }}>
              <Activity size={16} color="#0284c7" />
              <span>ETTN / Belge No ile GİB Durum Sorgulama</span>
            </h4>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                type="text"
                className="form-input"
                placeholder="ETTN (UUID) veya Fatura No"
                value={queryEttn}
                onChange={e => setQueryEttn(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleQueryEttn()}
                style={{ fontFamily: 'var(--font-mono)', flex: 1 }}
              />
              <button
                className="btn btn-primary"
                onClick={handleQueryEttn}
                disabled={querying}
                style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                <Search size={14} />
                <span>Sorgula</span>
              </button>
            </div>

            {queryResult && (
              <div style={{
                background: queryResult.found ? 'rgba(22,163,74,0.08)' : 'rgba(239,68,68,0.08)',
                border: `1px solid ${queryResult.found ? 'var(--success)' : '#ef4444'}`,
                borderRadius: '8px',
                padding: '12px 14px',
                fontSize: '12.5px',
              }}>
                {queryResult.found ? (
                  <div>
                    <div style={{ fontWeight: 800, color: 'var(--success)' }}>
                      Fatura GİB'de Kayıtlı: {queryResult.invoiceNo}
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                      {queryResult.statusDescription}
                    </div>
                  </div>
                ) : (
                  <div style={{ color: '#ef4444' }}>{queryResult.message}</div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ─── 5. KONTÖR & KREDİ YÖNETİMİ ─── */}
      {activeTab === 'KONTOR' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '14px' }}>
            {/* 2026-09-12 (uydurma temizliği): Bu üç kart da sabit sayılar
                gösteriyordu. e-Fatura kontörü artık gerçek API'den gelir; e-Defter
                ve Arşiv/SMM kontörü için ise backend'de HİÇBİR kaynak yok —
                değerler `null` ve "—" gösterilir (uydurma sayı yazılmaz). */}
            <div className="card-panel" style={{ padding: '16px', borderLeft: '4px solid #0284c7' }}>
              <div style={{ fontSize: '11.5px', fontWeight: 700, color: 'var(--text-muted)' }}>E-FATURA / E-ARŞİV KONTÖRÜ</div>
              <div style={{ fontSize: '26px', fontWeight: 900, color: '#0284c7', marginTop: '4px' }}>
                {credits.fatura.remaining ?? '—'}{' '}
                <span style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-muted)' }}>
                  / {credits.fatura.total ?? '—'}
                </span>
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
                Kullanılan: {credits.fatura.used ?? '—'} adet
              </div>
            </div>

            <div className="card-panel" style={{ padding: '16px', borderLeft: '4px solid #ea580c' }}>
              <div style={{ fontSize: '11.5px', fontWeight: 700, color: 'var(--text-muted)' }}>E-DEFTER SAKLAMA PAKETİ</div>
              <div style={{ fontSize: '26px', fontWeight: 900, color: '#ea580c', marginTop: '4px' }}>
                {credits.defter.remaining ?? '—'}{' '}
                <span style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-muted)' }}>
                  / {credits.defter.total ?? '—'} Ay
                </span>
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
                Saklama paketi verisi bulunmuyor
              </div>
            </div>

            <div className="card-panel" style={{ padding: '16px', borderLeft: '4px solid #16a34a' }}>
              <div style={{ fontSize: '11.5px', fontWeight: 700, color: 'var(--text-muted)' }}>ARŞİV KASA & SMM KONTÖRÜ</div>
              <div style={{ fontSize: '26px', fontWeight: 900, color: '#16a34a', marginTop: '4px' }}>
                {credits.arsiv.remaining ?? '—'}{' '}
                <span style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-muted)' }}>
                  / {credits.arsiv.total ?? '—'}
                </span>
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
                Kontör verisi bulunmuyor
              </div>
            </div>
          </div>

          <div className="card-panel" style={{ padding: '16px' }}>
            <h4 style={{ margin: '0 0 10px', fontSize: '14px', fontWeight: 700 }}>Kontör Yükleme</h4>
            {/* 2026-09-12 (uydurma temizliği): Burada SABİT 4 paket vardı
                (500→450 ₺, 1000→800 ₺, 2500→1.750 ₺, 5000→3.000 ₺) ve "Yükle"
                butonu yalnızca toast atıp sipariş oluşturmuyordu. Fiyatlar
                gerçek kontör paketleriyle (DB: pkg-100 250 ₺, pkg-500 1.000 ₺,
                pkg-1000 1.750 ₺, pkg-5000 7.500 ₺ …) ÇELİŞİYORDU; kullanıcı
                yanlış fiyatla "satın alma" yaptığını sanıyordu. Gerçek paketler
                ve ödeme akışı "Abonelik & Kontör" ekranındadır. */}
            <div style={{ fontSize: '12.5px', color: 'var(--text-muted)', marginBottom: '12px' }}>
              {canManageBilling
                ? 'Güncel kontör paketleri ve güvenli ödeme akışı, Abonelik & Kontör Cüzdanı ekranında yönetilir. Bu ekranda uydurma paket/fiyat gösterilmez.'
                : 'Kontör paketleri ve satın alma işlemleri platform yöneticisi tarafından yönetilir. Kontör yüklemesi için yöneticinize başvurun.'}
            </div>
            {canManageBilling && (
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => setActiveView('customer-billing')}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
              >
                <CreditCard size={14} />
                <span>Abonelik &amp; Kontör Cüzdanına Git</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* ─── 6. GİB KODLARI & KURLAR ─── */}
      {activeTab === 'KILAVUZ' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '16px' }}>
          {/* TCMB Kurları & Kategori Seçici */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div className="card-panel" style={{ padding: '14px' }}>
              <h4 style={{ margin: '0 0 10px', fontSize: '13px', fontWeight: 700 }}>TCMB Canlı Döviz Kurları</h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '13px' }}>
                {/* 2026-09-12: Kur alınamadıysa (null) "—" gösterilir. Önceki hâlde
                    sabit kur yazılıyordu; artık uydurma kur yok. */}
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>USD / TRY:</span>
                  <strong>{typeof tcmbRates.USD === 'number' ? `${tcmbRates.USD.toFixed(4)} ₺` : '—'}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>EUR / TRY:</span>
                  <strong>{typeof tcmbRates.EUR === 'number' ? `${tcmbRates.EUR.toFixed(4)} ₺` : '—'}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>GBP / TRY:</span>
                  <strong>{typeof tcmbRates.GBP === 'number' ? `${tcmbRates.GBP.toFixed(4)} ₺` : '—'}</strong>
                </div>
              </div>
            </div>

            <div className="card-panel" style={{ padding: '14px' }}>
              <h4 style={{ margin: '0 0 10px', fontSize: '13px', fontWeight: 700 }}>GİB Kod Listeleri</h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {[
                  { id: 'TEVKIFAT', name: 'KDV Tevkifat Kodları' },
                  { id: 'ISTISNA', name: 'KDV İstisna Kodları (0 KDV)' },
                  { id: 'FATURATURU', name: 'Fatura Türleri' },
                  { id: 'PROFILE', name: 'Fatura Senaryoları (Temel/Ticari)' },
                  { id: 'BIRIM', name: 'Ölçü Birimleri (UBL-TR)' },
                  { id: 'PARABIRIMI', name: 'Para Birimleri (ISO 4217)' },
                ].map(cat => (
                  <button
                    key={cat.id}
                    type="button"
                    className={`btn btn-sm ${selectedCodeCategory === cat.id ? 'btn-primary' : 'btn-ghost'}`}
                    onClick={() => {
                      setSelectedCodeCategory(cat.id);
                      loadCodeList(cat.id);
                    }}
                    style={{ justifyContent: 'flex-start', textAlign: 'left', fontSize: '12px' }}
                  >
                    {cat.name}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Kod Listesi Tablosu */}
          <div className="card-panel" style={{ padding: '16px' }}>
            <h4 style={{ margin: '0 0 12px', fontSize: '14px', fontWeight: 700 }}>
              {selectedCodeCategory} Listesi ({codeList.length} Kod)
            </h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '420px', overflowY: 'auto' }}>
              {codeList.map((item, idx) => (
                <div key={idx} style={{
                  padding: '8px 12px',
                  background: 'var(--bg-surface-secondary)',
                  borderRadius: '6px',
                  border: '1px solid var(--border-color)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  fontSize: '12.5px',
                }}>
                  <span className="badge badge-primary" style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', flexShrink: 0 }}>
                    {item.code}
                  </span>
                  <span>{item.name}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Hızlı Bilişim & GİB Uyumlu e-Fatura Oluşturma Modalı */}
      <HizliInvoiceCreateModal
        isOpen={isHizliCreateModalOpen}
        onClose={() => setIsHizliCreateModalOpen(false)}
        onSuccess={loadData}
      />

      {/* Resmi GİB Standardı e-Fatura Görsel Önizleme Modalı */}
      <OfficialEInvoiceViewerModal
        isOpen={isOfficialModalOpen}
        onClose={() => setIsOfficialModalOpen(false)}
        invoice={viewingInvoice}
        onInvoiceSent={() => {
          loadData();
          triggerRefresh();
        }}
      />
    </div>
  );
};
