import React, { useEffect, useRef, useState } from 'react';
import { X, Printer, Download, Send, Copy, FileText, AlertCircle, RefreshCw } from 'lucide-react';
import type { Invoice } from '../../../types';
import { useToast } from '../../../context/ToastContext';
import { api } from '../../../services/api';
import { downloadDocumentXml, renderDocumentVisual } from '../../../utils/documentVisual';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  invoice: Invoice | null;
  onInvoiceSent?: () => void;
}

export const OfficialEInvoiceViewerModal: React.FC<Props> = ({
  isOpen,
  onClose,
  invoice,
  onInvoiceSent,
}) => {
  const { showToast } = useToast();
  const [sending, setSending] = useState(false);
  const [html, setHtml] = useState('');
  const [xml, setXml] = useState('');
  const [previewNote, setPreviewNote] = useState('');
  const [documentProfile, setDocumentProfile] = useState('');
  const [documentNumber, setDocumentNumber] = useState('');
  const [previewError, setPreviewError] = useState('');
  const [loading, setLoading] = useState(false);
  const [retry, setRetry] = useState(0);
  const frame = useRef<HTMLIFrameElement>(null);
  const invoiceId = invoice?.id;

  useEffect(() => {
    setHtml('');
    setXml('');
    setPreviewNote('');
    setDocumentProfile('');
    setDocumentNumber('');
    setPreviewError('');
    if (!isOpen || !invoiceId) return;
    let cancelled = false;
    setLoading(true);
    api.getErpInvoiceVisual(invoiceId).then(response => {
      if (cancelled) return;
      const rendered = renderDocumentVisual(response);
      setXml(response.xml);
      setDocumentProfile(response.documentProfile || '');
      setDocumentNumber(response.documentNumber || '');
      setPreviewNote(response.xmlSource === 'erp' ? 'ERP kaydından önizleme' : '');
      setHtml(rendered);
    }).catch(err => {
      if (!cancelled) setPreviewError(err.message || 'Fatura görünümü yüklenemedi.');
    }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [isOpen, invoiceId, retry]);

  if (!isOpen || !invoice) return null;

  const isSent = invoice.eInvoiceStatus === 'SENT' || invoice.eInvoiceStatus === 'DELIVERED' || invoice.eInvoiceStatus === 'ACCEPTED';
  // 2026-09-16 (`docs/46` §3): 'MOCK_SENT' GİB'e iletildi ANLAMINA GELMEZ. Belge
  // yalnız test sağlayıcısından geçti; hiçbir entegratöre gönderilmedi. Önceden
  // kuyruk MOCK için de 'SENT' yazdığından bu belgeler "GİB İletildi" görünüyordu.
  // (Not: `isSent` eşitlik karşılaştırması olduğu için 'MOCK_SENT' zaten dışarıda
  // kalır; bu bayrak yalnız AYRI bir etiket gösterebilmek için tutulur.)
  const isMockSent = invoice.eInvoiceStatus === 'MOCK_SENT';
  // 2026-09-16 (`docs/45`): ETTN yoksa UYDURULMAZ. Önceden burada
  // `urn:uuid:${invoice.id}-2026` diye tahmin edilebilir bir değer üretiliyor,
  // ekranda gösteriliyor ve panoya kopyalatılıyordu. Kullanıcı onu gerçek belge
  // kimliği sanıp karşı tarafa verebilirdi. Gösterilmeyen ETTN'nin yerine açık bir
  // metin yazılır (aşağıdaki `ettnYoklukMetni`).
  //
  // 2026-09-16 (`docs/47` §6/A): `docs/45` yalnız UYDURMA BİÇİMİ kaldırdı. Geriye
  // daha sinsi bir hâl kaldı: belgenin gerçek görünen bir `eInvoiceUUID`'si varsa
  // (ör. yalnız MOCK sağlayıcıdan geçmiş kayıtlarda), bu alan KOŞULSUZ okunuyor ve
  // rozet "GİB'e Gönderilmedi" derken hemen altında belge kimliği gösterilip
  // kopyalatılıyordu. Ölçüm: 5 kayıt (`SAT-2026-000016`…`000020`) tam da bu hâlde
  // ve hepsinin gönderim izi YOK.
  //
  // Artık ETTN görünürlüğü ROZETLE AYNI ölçüte bağlıdır: belge gerçekten
  // gönderilmişse (`isSent`) gösterilir, aksi hâlde gösterilmez. Gerekçe: GİB
  // onayı gelmemiş bir kimliği karşı tarafa "resmî belge kimliği" diye vermek,
  // kimliği hiç göstermemekten daha zararlıdır. `MOCK_SENT` bu ölçütün DIŞINDA
  // kalır (bkz. :32) — test sağlayıcısı entegratör değildir.
  const ettn = isSent && invoice.eInvoiceUUID ? invoice.eInvoiceUUID : null;

  // ETTN gösterilemediğinde NEDEN gösterilemediği de dürüstçe söylenir. Tek bir
  // "atanmadı" metni yanlış olurdu: kuyruğa alınmış bir belgenin kimliği teknik
  // olarak ATANMIŞTIR (`electronicDocumentService.queueInvoice:106` ETTN'yi
  // gönderimden ÖNCE üretir) ama henüz GİB'e İLETİLMEMİŞTİR. İkisi farklı şeydir.
  const ettnYoklukMetni = (() => {
    const s = String(invoice.eInvoiceStatus || '');
    if (isMockSent) return 'Test sağlayıcısı — GİB\'e gönderilmedi';
    if (s === 'QUEUED' || s === 'SENDING' || s === 'WAITING') return 'Henüz GİB\'e iletilmedi';
    if (s === 'REJECTED' || s === 'ERROR') return 'GİB\'e iletilemedi — doğrulanmış kimlik yok';
    if (s === 'CANCELLED') return 'Belge iptal edildi';
    return 'Belge gönderilmediği için atanmadı';
  })();

  const handleCopyEttn = () => {
    if (!ettn) return; // 2026-09-16 (`docs/45`/`docs/47`): doğrulanmamış kimlik kopyalanmaz.
    navigator.clipboard.writeText(ettn);
    showToast('ETTN panoya kopyalandı.', 'info');
  };

  const handleSendToGib = async () => {
    setSending(true);
    try {
      showToast(`${invoice.invoiceNo} nolu fatura GİB sistemine iletiliyor...`, 'info');
      const res = await api.sendHizliInvoice(invoice.id);
      if (res.success) {
        showToast(
          res.uuid
            ? `Fatura GİB'e iletildi! ETTN: ${res.uuid}`
            : 'Belge entegratöre iletildi (ETTN entegratör yanıtında dönmedi).',
          'success'
        );
        if (onInvoiceSent) onInvoiceSent();
      } else {
        showToast(res.message || 'Gönderim başarısız.', 'error');
      }
    } catch (err: any) {
      showToast(err.message || 'Gönderim sırasında hata oluştu.', 'error');
    } finally {
      setSending(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(10, 15, 30, 0.55)',
        // 2026-09-13 (tasarım sadeleştirmesi): backdropFilter: blur(4px) kaldırıldı
        // (glassmorphism yasak). Düz karartma perde olarak korunuyor.
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        padding: '16px',
      }}
    >
      <div
        style={{
          backgroundColor: 'var(--bg-surface)',
          borderRadius: 'var(--radius-lg, 10px)',
          width: '100%',
          maxWidth: '960px',
          height: '92vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: 'var(--shadow-xl)',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '14px 20px',
            borderBottom: '1px solid var(--border-color)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            /* 2026-09-13 (tasarım düzeltmesi): Başlık şeridi koyu lacivert
               gradyandı; açık temada "başka bir program" izlenimi veriyordu.
               Açık yüzeye çevrildi. */
            background: 'var(--bg-surface-secondary)',
            color: 'var(--text-main)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div
              style={{
                width: '36px',
                height: '36px',
                borderRadius: 'var(--radius-sm, 6px)',
                background: 'var(--primary-light)',
                color: 'var(--primary)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <FileText size={20} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontWeight: 700, fontSize: '15px' }}>
                  {documentNumber || invoice.invoiceNo}
                </span>
                <span
                  style={{
                    padding: '2px 8px',
                    borderRadius: '4px',
                    fontSize: '11px',
                    fontWeight: 700,
                    backgroundColor: isSent ? 'var(--success)' : 'var(--warning)',
                    color: '#ffffff',
                  }}
                >
                  {isSent ? 'GİB İletildi' : isMockSent ? 'Test — GİB\'e Gönderilmedi' : 'Taslak'}
                </span>
                <span
                  style={{
                    padding: '2px 8px',
                    borderRadius: '4px',
                    fontSize: '11px',
                    fontWeight: 600,
                    backgroundColor: 'var(--bg-surface)',
                    border: '1px solid var(--border-color)',
                  }}
                >
                  {documentProfile || invoice.invoiceProfile || 'Profil belirtilmemiş'}
                </span>
              </div>
              <div style={{ fontSize: 'var(--fs-xs, 11px)', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '8px', marginTop: '2px' }}>
                {/* 2026-09-16 (`docs/45`): ETTN atanmadıysa bu AÇIKÇA yazılır;
                    uydurma bir kimlik gösterilmez.
                    2026-09-16 (`docs/47` §6/A): Gönderilmemiş belgede ETTN alanı
                    dolu olsa bile GÖSTERİLMEZ; metin iki hâli ayırt eder ki
                    kullanıcı "sistemde bir kimlik var ama doğrulanmadı" bilsin. */}
                <span style={!ettn ? { fontStyle: 'italic' } : undefined}>
                  ETTN: {ettn || ettnYoklukMetni}
                </span>
                {previewNote && <span>{previewNote}</span>}
                <button
                  onClick={handleCopyEttn}
                  disabled={!ettn}
                  title={ettn ? 'ETTN Kopyala' : 'Doğrulanmış ETTN yok — kopyalanacak kimlik yok'}
                  style={{
                    background: 'none', border: 'none', padding: 0,
                    color: ettn ? 'var(--info)' : 'var(--text-muted)',
                    cursor: ettn ? 'pointer' : 'not-allowed',
                    opacity: ettn ? 1 : 0.5,
                  }}
                >
                  <Copy size={12} />
                </button>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {!isSent && invoice.type !== 'PURCHASE' && (
              <button
                onClick={handleSendToGib}
                disabled={sending}
                style={{
                  padding: '7px 14px',
                  borderRadius: 'var(--radius-sm, 6px)',
                  border: 'none',
                  backgroundColor: 'var(--primary)',
                  color: '#ffffff',
                  fontWeight: 600,
                  fontSize: '12px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                {sending ? <RefreshCw size={14} className="animate-spin" /> : <Send size={14} />}
                GİB'e Gönder
              </button>
            )}

            <button
              onClick={() => downloadDocumentXml(xml, documentNumber || invoice.invoiceNo)}
              disabled={!xml || loading}
              style={{
                padding: '7px 14px',
                borderRadius: 'var(--radius-sm, 6px)',
                border: '1px solid var(--border-color)',
                backgroundColor: 'var(--bg-surface)',
                color: 'var(--text-main)',
                fontWeight: 600,
                fontSize: 'var(--fs-sm, 12px)',
                textDecoration: 'none',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <Download size={14} /> UBL XML
            </button>

            <button
              onClick={() => {
                frame.current?.contentWindow?.print();
              }}
              disabled={!html || loading}
              style={{
                padding: '7px 14px',
                borderRadius: 'var(--radius-sm, 6px)',
                border: '1px solid var(--border-color)',
                backgroundColor: 'var(--bg-surface)',
                color: 'var(--text-main)',
                fontWeight: 600,
                fontSize: 'var(--fs-sm, 12px)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <Printer size={14} /> Yazdır
            </button>

            <button
              onClick={onClose}
              style={{
                width: '32px',
                height: '32px',
                borderRadius: 'var(--radius-sm, 6px)',
                border: 'none',
                backgroundColor: 'var(--bg-surface-secondary)',
                color: 'var(--text-main)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginLeft: '8px',
              }}
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Content iframe */}
        <div style={{ flex: 1, backgroundColor: 'var(--bg-surface-secondary)', position: 'relative' }}>
          {loading ? <div role="status" style={{ padding: '40px', textAlign: 'center' }}>Fatura XSLT ile hazırlanıyor...</div>
            : previewError ? <div role="alert" style={{ padding: '40px', textAlign: 'center' }}>
              <AlertCircle size={24} /><p>{previewError}</p>
              <button className="btn btn-secondary" onClick={() => setRetry(value => value + 1)}>Yeniden dene</button>
            </div> : html ? <iframe
            ref={frame}
            id="einvoice-preview-iframe"
            srcDoc={html}
            sandbox="allow-same-origin allow-modals"
            style={{
              width: '100%',
              height: '100%',
              border: 'none',
              backgroundColor: 'var(--bg-surface)',
            }}
            title="Resmi GİB e-Fatura Önizleme"
          /> : null}
        </div>
      </div>
    </div>
  );
};
