import React, { useState, useEffect } from 'react';
import {
  FileText,
  UploadCloud,
  CheckCircle2,
  AlertCircle,
  Clock,
  Eye,
  ArrowRight,
  ShieldCheck,
  Building,
  DollarSign,
  Layers,
  Sparkles,
  X,
  FileCheck,
} from 'lucide-react';
import { api } from '../../../services/api';
import { useToast } from '../../../context/ToastContext';
import type { DocumentAIJob } from '../../../types';

export const DocumentAIView: React.FC = () => {
  const { showToast } = useToast();
  const [jobs, setJobs] = useState<DocumentAIJob[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);

  // Selected Job for Verification
  const [selectedJob, setSelectedJob] = useState<DocumentAIJob | null>(null);
  const [isCreatingInvoice, setIsCreatingInvoice] = useState(false);

  useEffect(() => {
    loadJobs();
  }, []);

  const loadJobs = async () => {
    setIsLoading(true);
    try {
      const res = await api.getDocumentAIJobs();
      if (res.success) setJobs(res.jobs || []);
    } catch (err: any) {
      showToast(err.message || 'OCR belgeleri yüklenemedi.', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    try {
      const res = await api.uploadDocumentAI({
        fileName: file.name,
        fileSize: file.size,
        mimeType: file.type || 'image/jpeg',
        documentType: file.name.toLowerCase().includes('fis') ? 'RECEIPT' : 'INVOICE',
      });

      if (res.success) {
        showToast(res.message, 'success');
        setSelectedJob(res.job);
        loadJobs();
      }
    } catch (err: any) {
      showToast(err.message || 'Belge yüklenemedi.', 'error');
    } finally {
      setIsUploading(false);
    }
  };

  const handleConfirmAndCreateInvoice = async () => {
    if (!selectedJob || !selectedJob.extractedDraftInvoice) return;

    setIsCreatingInvoice(true);
    try {
      const res = await api.createInvoiceFromDocumentJob(
        selectedJob.id,
        selectedJob.extractedDraftInvoice
      );

      if (res.success) {
        showToast(res.message, 'success');
        setSelectedJob(null);
        loadJobs();
      }
    } catch (err: any) {
      showToast(err.message || 'Fatura oluşturulamadı.', 'error');
    } finally {
      setIsCreatingInvoice(false);
    }
  };

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
      <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ width: '44px', height: '44px', borderRadius: 'var(--radius-sm, 6px)', background: 'var(--primary-light)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <FileCheck size={24} color="var(--primary)" />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <h1 style={{ fontSize: 'var(--fs-xl, 20px)', fontWeight: 700, margin: 0 }}>
                  Document AI & Fatura / Fiş OCR Masası
                </h1>
                <span className="badge badge-primary">
                  OCR %98 Güven
                </span>
              </div>
              <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: 'var(--fs-sm, 12px)' }}>
                PDF, JPG ve PNG fatura / fiş belgelerini tarayın, alanları otomatik çıkarın ve tek tıkla ERP faturasına dönüştürün
              </p>
            </div>
          </div>
        </div>

        {/* Belge Yükleme Kutusu */}
        <div style={{ background: 'var(--bg-surface)', border: '2px dashed var(--border-color)', borderRadius: 'var(--radius-lg, 10px)', padding: '36px 20px', textAlign: 'center', marginBottom: '28px', position: 'relative', overflow: 'hidden' }}>
          <input
            type="file"
            accept=".pdf,image/png,image/jpeg,image/webp"
            onChange={handleFileUpload}
            style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', opacity: 0, cursor: 'pointer' }}
          />
          <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: 'var(--info-bg)', color: 'var(--info)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
            <UploadCloud size={32} />
          </div>
          <h3 style={{ margin: '0 0 6px', fontSize: 'var(--fs-lg, 16px)', fontWeight: 700 }}>
            {isUploading ? 'Belge Taranıyor ve OCR İşleniyor...' : 'Fatura, Fiş veya Taranmış PDF Yükleyin'}
          </h3>
          <p style={{ margin: '0 0 16px', color: 'var(--text-muted)', fontSize: 'var(--fs-sm, 12px)' }}>
            Dosyayı buraya sürükleyip bırakın veya bilgisayarınızdan seçin (Maks: 20 MB)
          </p>
          <button
            type="button"
            style={{ padding: '10px 24px', background: 'var(--primary)', border: 'none', borderRadius: 'var(--radius-sm, 6px)', color: '#fff', fontWeight: 700, fontSize: 'var(--fs-sm, 12px)', pointerEvents: 'none' }}
          >
            {isUploading ? 'İşleniyor...' : 'Belge Seç'}
          </button>
        </div>

        {/* OCR İş Listesi Tablosu */}
        <div style={{ background: 'var(--bg-surface)', borderRadius: 'var(--radius-md, 8px)', border: '1px solid var(--border-color)', overflow: 'hidden' }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ margin: 0, fontSize: 'var(--fs-lg, 16px)', fontWeight: 700 }}>İşlenen Belgeler & OCR Geçmişi</h3>
            <span style={{ fontSize: 'var(--fs-sm, 12px)', color: 'var(--text-muted)' }}>{jobs.length} Belge</span>
          </div>

          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--fs-base, 13px)', textAlign: 'left' }}>
            <thead>
              <tr style={{ background: 'var(--bg-surface-secondary)', color: 'var(--text-muted)', borderBottom: '1px solid var(--border-color)' }}>
                <th style={{ padding: '14px 18px' }}>Tarih</th>
                <th style={{ padding: '14px 18px' }}>Dosya Adı</th>
                <th style={{ padding: '14px 18px' }}>Belge Türü</th>
                <th style={{ padding: '14px 18px' }}>Tespit Edilen Tedarikçi</th>
                <th style={{ padding: '14px 18px' }}>Tutar</th>
                <th style={{ padding: '14px 18px' }}>Güven Skoru</th>
                <th style={{ padding: '14px 18px' }}>Durum</th>
                <th style={{ padding: '14px 18px' }}>İşlem</th>
              </tr>
            </thead>
            <tbody>
              {jobs.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
                    Henüz OCR ile işlenmiş bir belge bulunmuyor.
                  </td>
                </tr>
              ) : (
                jobs.map(j => (
                  <tr key={j.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                    <td style={{ padding: '14px 18px', color: 'var(--text-muted)' }}>
                      {new Date(j.createdAt).toLocaleDateString('tr-TR')}
                    </td>
                    <td style={{ padding: '14px 18px', fontWeight: 700, color: 'var(--text-main)' }}>
                      {j.fileName}
                    </td>
                    <td style={{ padding: '14px 18px' }}>
                      <span className="badge badge-secondary">
                        {j.documentType}
                      </span>
                    </td>
                    <td style={{ padding: '14px 18px', color: 'var(--info)', fontWeight: 700 }}>
                      {j.extractedDraftInvoice?.supplierTitle || '-'}
                    </td>
                    <td style={{ padding: '14px 18px', fontWeight: 700, color: 'var(--success-text)' }}>
                      {j.extractedDraftInvoice?.grandTotal ? `${j.extractedDraftInvoice.grandTotal.toLocaleString('tr-TR')} TL` : '-'}
                    </td>
                    <td style={{ padding: '14px 18px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <div style={{ width: '40px', height: '6px', background: 'var(--bg-surface-secondary)', borderRadius: 'var(--radius-xs, 4px)', overflow: 'hidden' }}>
                          <div style={{ width: `${j.overallConfidence}%`, height: '100%', background: j.overallConfidence >= 80 ? 'var(--success)' : 'var(--warning)' }} />
                        </div>
                        <span style={{ fontWeight: 700, color: 'var(--success-text)', fontSize: 'var(--fs-sm, 12px)' }}>%{j.overallConfidence}</span>
                      </div>
                    </td>
                    <td style={{ padding: '14px 18px' }}>
                      <span className={j.status === 'REVIEWED' ? 'badge badge-success' : 'badge badge-info'}>
                        {j.status === 'REVIEWED' ? 'Faturalaştı' : 'Onay Bekliyor'}
                      </span>
                    </td>
                    <td style={{ padding: '14px 18px' }}>
                      <button
                        onClick={() => setSelectedJob(j)}
                        style={{ padding: '6px 12px', background: 'var(--primary)', border: 'none', borderRadius: 'var(--radius-sm, 6px)', color: '#fff', fontSize: 'var(--fs-sm, 12px)', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
                      >
                        <Eye size={12} />
                        <span>İncele</span>
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* OCR Önizleme & Fatura Onay Modalı */}
      {selectedJob && (
        <div className="modal-overlay" style={{ zIndex: 1200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ width: '95vw', maxWidth: '780px', maxHeight: '90vh', background: 'var(--bg-surface)', borderRadius: 'var(--radius-lg, 10px)', border: '1px solid var(--border-color)', padding: '24px', color: 'var(--text-main)', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 'var(--fs-lg, 16px)', fontWeight: 700 }}>Document AI Fatura Doğrulama</h3>
                <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: 'var(--fs-sm, 12px)' }}>{selectedJob.fileName} üzerinden çıkarılan alanlar</p>
              </div>
              <button onClick={() => setSelectedJob(null)} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
                <X size={20} />
              </button>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '16px' }}>
              {/* Çıkarılan Alanlar & Güven Skorları */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px' }}>
                {selectedJob.extractedFields.map((f, i) => (
                  <div key={i} style={{ background: 'var(--bg-surface-secondary)', padding: '10px 12px', borderRadius: 'var(--radius-sm, 6px)', border: '1px solid var(--border-color)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--fs-xs, 11px)', color: 'var(--text-muted)' }}>
                      <span>{f.fieldLabel}</span>
                      <span style={{ color: 'var(--success-text)', fontWeight: 700 }}>%{f.confidence}</span>
                    </div>
                    <div style={{ fontSize: 'var(--fs-base, 13px)', fontWeight: 700, color: 'var(--text-main)', marginTop: '2px' }}>
                      {f.fieldValue}
                    </div>
                  </div>
                ))}
              </div>

              {/* Fatura Taslağı Detayları */}
              {selectedJob.extractedDraftInvoice && (
                <div style={{ background: 'var(--bg-surface-secondary)', borderRadius: 'var(--radius-md, 8px)', padding: '16px', border: '1px solid var(--border-color)' }}>
                  <h4 style={{ margin: '0 0 12px', fontSize: 'var(--fs-base, 13px)', fontWeight: 700, color: 'var(--info)' }}>Fatura Taslak Kalemleri</h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {(selectedJob.extractedDraftInvoice.lineItems || []).map((item, idx) => (
                      <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px', background: 'var(--bg-surface)', borderRadius: 'var(--radius-sm, 6px)', fontSize: 'var(--fs-base, 13px)' }}>
                        <span>{item.name} ({item.quantity} Adet x {item.unitPrice} TL)</span>
                        <span style={{ fontWeight: 700, color: 'var(--success-text)' }}>{item.total.toLocaleString('tr-TR')} TL (+%{item.vatRate} KDV)</span>
                      </div>
                    ))}
                  </div>

                  <div style={{ borderTop: '1px solid var(--border-color)', marginTop: '12px', paddingTop: '10px', display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: 'var(--fs-lg, 16px)' }}>
                    <span>Ödenecek Genel Toplam:</span>
                    <span style={{ color: 'var(--success-text)' }}>{selectedJob.extractedDraftInvoice.grandTotal?.toLocaleString('tr-TR')} TL</span>
                  </div>
                </div>
              )}
            </div>

            {/* Modal Butonları */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                onClick={() => setSelectedJob(null)}
                style={{ padding: '10px 18px', background: 'var(--bg-surface-secondary)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm, 6px)', color: 'var(--text-main)', cursor: 'pointer' }}
              >
                Vazgeç
              </button>
              <button
                onClick={handleConfirmAndCreateInvoice}
                disabled={isCreatingInvoice || selectedJob.status === 'REVIEWED'}
                style={{
                  padding: '10px 24px',
                  background: selectedJob.status === 'REVIEWED' ? 'var(--bg-surface-secondary)' : 'var(--primary)',
                  border: selectedJob.status === 'REVIEWED' ? '1px solid var(--border-color)' : 'none',
                  borderRadius: 'var(--radius-sm, 6px)',
                  color: selectedJob.status === 'REVIEWED' ? 'var(--text-muted)' : '#fff',
                  fontWeight: 700,
                  cursor: selectedJob.status === 'REVIEWED' ? 'default' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                {isCreatingInvoice ? 'Fatura Oluşturuluyor...' : selectedJob.status === 'REVIEWED' ? 'Zaten Faturalaştı' : 'Onayla ve Alış Faturası Oluştur'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
