import React, { useState, useEffect } from 'react';
import {
  Folder,
  FileText,
  UploadCloud,
  Share2,
  Eye,
  History,
  Lock,
  Calendar,
  CheckCircle2,
  Copy,
  Download,
  Plus,
  X,
  FileCheck,
  ShieldCheck,
} from 'lucide-react';
import { api } from '../../../services/api';
import { useToast } from '../../../context/ToastContext';
import type { DocumentItem, PublicShareToken } from '../../../types';

export const DocumentCenterView: React.FC = () => {
  const { showToast } = useToast();
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [selectedFolder, setSelectedFolder] = useState<string>('Tümü');
  const [isLoading, setIsLoading] = useState(true);

  // Upload Modal
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [targetExistingDocId, setTargetExistingDocId] = useState<string | null>(null);
  const [uploadForm, setUploadForm] = useState({
    title: '',
    category: 'CONTRACT',
    folderName: 'Sözleşmeler',
    documentNo: '',
    description: '',
    fileName: '',
    fileSize: 1048576,
    mimeType: 'application/pdf',
    fileUrl: 'https://isbey.cloud/sample-document.pdf',
    changeSummary: '',
  });

  // Preview Modal
  const [previewDoc, setPreviewDoc] = useState<DocumentItem | null>(null);

  // Share Modal
  const [shareDoc, setShareDoc] = useState<DocumentItem | null>(null);
  const [sharePassword, setSharePassword] = useState('');
  const [generatedShareToken, setGeneratedShareToken] = useState<PublicShareToken | null>(null);

  const folders = [
    'Tümü',
    'Faturalar',
    'Gider Belgeleri',
    'Banka',
    'Dekont',
    'Sözleşmeler',
    'Personel',
    'Vergi',
    'Genel',
  ];

  useEffect(() => {
    loadDocs();
  }, [selectedFolder]);

  const loadDocs = async () => {
    setIsLoading(true);
    try {
      const res = await api.getDocuments(selectedFolder !== 'Tümü' ? { folder: selectedFolder } : undefined);
      if (res.success) setDocuments(res.documents || []);
    } catch (err: any) {
      showToast(err.message || 'Belgeler yüklenemedi.', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await api.uploadDocumentItem({
        ...uploadForm,
        existingDocumentId: targetExistingDocId || undefined,
      });

      if (res.success) {
        showToast(res.message, 'success');
        setIsUploadModalOpen(false);
        setTargetExistingDocId(null);
        setUploadForm({
          title: '',
          category: 'CONTRACT',
          folderName: 'Sözleşmeler',
          documentNo: '',
          description: '',
          fileName: '',
          fileSize: 1048576,
          mimeType: 'application/pdf',
          fileUrl: 'https://isbey.cloud/sample-document.pdf',
          changeSummary: '',
        });
        loadDocs();
      }
    } catch (err: any) {
      showToast(err.message || 'Belge yüklenemedi.', 'error');
    }
  };

  const handleCreateShareToken = async () => {
    if (!shareDoc) return;
    try {
      const res = await api.createDocumentShareToken({
        entityType: 'DOCUMENT',
        entityId: shareDoc.id,
        title: shareDoc.title,
        password: sharePassword.trim() || undefined,
        expiresInHours: 72,
        downloadLimit: 10,
      });

      if (res.success) {
        setGeneratedShareToken(res.shareToken);
        showToast('Güvenli bağlantı oluşturuldu.', 'success');
      }
    } catch (err: any) {
      showToast(err.message || 'Paylaşım bağlantısı oluşturulamadı.', 'error');
    }
  };

  const copyShareLink = () => {
    if (!generatedShareToken) return;
    const link = `${window.location.origin}/share/${generatedShareToken.token}`;
    navigator.clipboard.writeText(link);
    showToast('Bağlantı panoya kopyalandı.', 'success');
  };

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
      <div style={{ maxWidth: '1280px', margin: '0 auto' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ width: '46px', height: '46px', borderRadius: 'var(--radius-sm, 6px)', background: 'var(--primary-light)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <FileCheck size={26} color="var(--primary)" />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <h1 style={{ fontSize: 'var(--fs-xl, 20px)', fontWeight: 700, margin: 0 }}>
                  Dijital Arşiv & Belge Merkezi
                </h1>
                {/* 2026-09-13: Koyu tema rozeti açık tema "badge-info" sınıfına çevrildi. */}
                <span className="badge badge-info" style={{ fontSize: 'var(--fs-xs, 11px)', fontWeight: 700 }}>
                  Versiyon Kontrollü
                </span>
              </div>
              <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: 'var(--fs-base, 13px)' }}>
                Sözleşmeler, dekontlar, fatura ekleri ve resmi evrakların versiyon geçmişli dijital arşivi
              </p>
            </div>
          </div>

          <button
            onClick={() => {
              setTargetExistingDocId(null);
              setIsUploadModalOpen(true);
            }}
            style={{ padding: '10px 18px', background: 'var(--primary)', border: 'none', borderRadius: 'var(--radius-sm, 6px)', color: '#fff', fontWeight: 700, fontSize: 'var(--fs-sm, 12px)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}
          >
            <UploadCloud size={18} />
            <span>Yeni Belge Yükle</span>
          </button>
        </div>

        {/* Klasörler Yatay Çubuğu */}
        <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '12px', marginBottom: '20px' }}>
          {folders.map(f => (
            <button
              key={f}
              onClick={() => setSelectedFolder(f)}
              style={{
                padding: '8px 16px',
                borderRadius: 'var(--radius-sm, 6px)',
                border: 'none',
                background: selectedFolder === f ? 'var(--primary)' : 'var(--bg-surface-secondary)',
                color: selectedFolder === f ? '#fff' : 'var(--text-muted)',
                fontWeight: 700,
                fontSize: 'var(--fs-sm, 12px)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                whiteSpace: 'nowrap',
              }}
            >
              <Folder size={16} />
              <span>{f}</span>
            </button>
          ))}
        </div>

        {/* Belgeler Tablosu */}
        <div style={{ background: 'var(--bg-surface)', borderRadius: 'var(--radius-md, 8px)', border: '1px solid var(--border-color)', overflow: 'hidden' }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ margin: 0, fontSize: 'var(--fs-lg, 16px)', fontWeight: 700 }}>Arşivdeki Belgeler ({documents.length})</h3>
            <span style={{ fontSize: 'var(--fs-sm, 12px)', color: 'var(--text-muted)' }}>Klasör: {selectedFolder}</span>
          </div>

          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--fs-sm, 12px)', textAlign: 'left' }}>
            <thead>
              <tr style={{ background: 'var(--bg-surface-secondary)', color: 'var(--text-muted)', borderBottom: '1px solid var(--border-color)' }}>
                <th style={{ padding: '14px 18px' }}>Belge Adı / Başlık</th>
                <th style={{ padding: '14px 18px' }}>Klasör / Kategori</th>
                <th style={{ padding: '14px 18px' }}>Belge No</th>
                <th style={{ padding: '14px 18px' }}>Versiyon</th>
                <th style={{ padding: '14px 18px' }}>Tarih</th>
                <th style={{ padding: '14px 18px' }}>Müşavir Erişimi</th>
                <th style={{ padding: '14px 18px' }}>İşlemler</th>
              </tr>
            </thead>
            <tbody>
              {documents.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
                    Bu klasörde henüz yüklenmiş bir belge bulunmuyor.
                  </td>
                </tr>
              ) : (
                documents.map(d => (
                  <tr key={d.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                    <td style={{ padding: '14px 18px', fontWeight: 700, color: 'var(--text-main)' }}>
                      {d.title}
                      <div style={{ fontSize: 'var(--fs-xs, 11px)', color: 'var(--text-muted)', fontWeight: 400 }}>{d.fileName} ({(d.fileSize / 1024).toFixed(0)} KB)</div>
                    </td>
                    <td style={{ padding: '14px 18px' }}>
                      <span className="badge badge-info" style={{ fontSize: 'var(--fs-xs, 11px)', fontWeight: 700 }}>
                        {d.folderName}
                      </span>
                    </td>
                    <td style={{ padding: '14px 18px', color: 'var(--text-main)' }}>
                      {d.documentNo || '-'}
                    </td>
                    <td style={{ padding: '14px 18px' }}>
                      <span className="badge badge-success" style={{ fontSize: 'var(--fs-xs, 11px)', fontWeight: 700 }}>
                        v{d.currentVersion}
                      </span>
                    </td>
                    <td style={{ padding: '14px 18px', color: 'var(--text-muted)' }}>
                      {new Date(d.createdAt).toLocaleDateString('tr-TR')}
                    </td>
                    <td style={{ padding: '14px 18px' }}>
                      <span style={{ color: d.sharedWithMaliMusavir ? 'var(--success-text)' : 'var(--text-muted)', fontWeight: 700, fontSize: 'var(--fs-xs, 11px)' }}>
                        {d.sharedWithMaliMusavir ? 'Paylaşıldı' : 'Gizli'}
                      </span>
                    </td>
                    <td style={{ padding: '14px 18px' }}>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <button
                          onClick={() => setPreviewDoc(d)}
                          style={{ padding: '6px 10px', background: 'var(--primary)', border: 'none', borderRadius: 'var(--radius-sm, 6px)', color: '#fff', fontSize: 'var(--fs-xs, 11px)', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
                        >
                          <Eye size={12} />
                          <span>Gör</span>
                        </button>
                        <button
                          onClick={() => {
                            setShareDoc(d);
                            setGeneratedShareToken(null);
                            setSharePassword('');
                          }}
                          style={{ padding: '6px 10px', background: 'var(--primary)', border: 'none', borderRadius: 'var(--radius-sm, 6px)', color: '#fff', fontSize: 'var(--fs-xs, 11px)', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
                        >
                          <Share2 size={12} />
                          <span>Paylaş</span>
                        </button>
                        <button
                          onClick={() => {
                            setTargetExistingDocId(d.id);
                            setUploadForm({
                              ...uploadForm,
                              title: d.title,
                              folderName: d.folderName,
                              category: d.category,
                              fileName: `v${d.currentVersion + 1}_${d.fileName}`,
                              changeSummary: `v${d.currentVersion + 1} revizyonu`,
                            });
                            setIsUploadModalOpen(true);
                          }}
                          style={{ padding: '6px 10px', background: 'var(--bg-surface-secondary)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm, 6px)', color: 'var(--info)', fontSize: 'var(--fs-xs, 11px)', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
                        >
                          <History size={12} />
                          <span>+v{d.currentVersion + 1}</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Upload Modal */}
      {isUploadModalOpen && (
        <div className="modal-overlay" style={{ zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(10, 15, 30, 0.55)' }}>
          <div style={{ width: '90vw', maxWidth: '520px', background: 'var(--bg-surface)', borderRadius: 'var(--radius-lg, 10px)', border: '1px solid var(--border-color)', padding: '24px', color: 'var(--text-main)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ margin: 0, fontSize: 'var(--fs-lg, 16px)', fontWeight: 700 }}>
                {targetExistingDocId ? 'Mevcut Belgeye Yeni Versiyon Yükle' : 'Yeni Arşiv Belgesi Yükle'}
              </h3>
              <button onClick={() => setIsUploadModalOpen(false)} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleUploadSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: 'var(--fs-xs, 11px)', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '4px' }}>Belge Başlığı</label>
                <input
                  type="text"
                  required
                  placeholder="Örn: 2026 Ofis Kira Sözleşmesi"
                  value={uploadForm.title}
                  onChange={e => setUploadForm({ ...uploadForm, title: e.target.value })}
                  style={{ width: '100%', padding: '8px 12px', background: 'var(--bg-surface-secondary)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm, 6px)', color: 'var(--text-main)', fontSize: 'var(--fs-sm, 12px)' }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: 'var(--fs-xs, 11px)', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '4px' }}>Klasör</label>
                  <select
                    value={uploadForm.folderName}
                    onChange={e => setUploadForm({ ...uploadForm, folderName: e.target.value })}
                    style={{ width: '100%', padding: '8px 12px', background: 'var(--bg-surface-secondary)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm, 6px)', color: 'var(--text-main)', fontSize: 'var(--fs-sm, 12px)' }}
                  >
                    <option value="Faturalar">Faturalar</option>
                    <option value="Gider Belgeleri">Gider Belgeleri</option>
                    <option value="Banka">Banka</option>
                    <option value="Dekont">Dekont</option>
                    <option value="Sözleşmeler">Sözleşmeler</option>
                    <option value="Personel">Personel</option>
                    <option value="Vergi">Vergi</option>
                    <option value="Genel">Genel</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 'var(--fs-xs, 11px)', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '4px' }}>Belge / Evrak No</label>
                  <input
                    type="text"
                    placeholder="Örn: SZL-001"
                    value={uploadForm.documentNo}
                    onChange={e => setUploadForm({ ...uploadForm, documentNo: e.target.value })}
                    style={{ width: '100%', padding: '8px 12px', background: 'var(--bg-surface-secondary)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm, 6px)', color: 'var(--text-main)', fontSize: 'var(--fs-sm, 12px)' }}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 'var(--fs-xs, 11px)', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '4px' }}>Dosya Adı (Simülasyon)</label>
                <input
                  type="text"
                  required
                  placeholder="Kira_Sozlesmesi_2026.pdf"
                  value={uploadForm.fileName}
                  onChange={e => setUploadForm({ ...uploadForm, fileName: e.target.value })}
                  style={{ width: '100%', padding: '8px 12px', background: 'var(--bg-surface-secondary)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm, 6px)', color: 'var(--text-main)', fontSize: 'var(--fs-sm, 12px)' }}
                />
              </div>

              {targetExistingDocId && (
                <div>
                  <label style={{ display: 'block', fontSize: 'var(--fs-xs, 11px)', fontWeight: 700, color: 'var(--info)', marginBottom: '4px' }}>Versiyon Değişiklik Notu</label>
                  <input
                    type="text"
                    placeholder="Örn: Ek protokol maddesi eklendi."
                    value={uploadForm.changeSummary}
                    onChange={e => setUploadForm({ ...uploadForm, changeSummary: e.target.value })}
                    style={{ width: '100%', padding: '8px 12px', background: 'var(--bg-surface-secondary)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm, 6px)', color: 'var(--text-main)', fontSize: 'var(--fs-sm, 12px)' }}
                  />
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
                <button
                  type="button"
                  onClick={() => setIsUploadModalOpen(false)}
                  style={{ padding: '8px 16px', background: 'var(--bg-surface-secondary)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm, 6px)', color: 'var(--text-main)', cursor: 'pointer' }}
                >
                  İptal
                </button>
                <button
                  type="submit"
                  style={{ padding: '8px 20px', background: 'var(--primary)', border: 'none', borderRadius: 'var(--radius-sm, 6px)', color: '#fff', fontWeight: 700, cursor: 'pointer' }}
                >
                  Kaydet ve Arşivle
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Preview Modal */}
      {previewDoc && (
        <div className="modal-overlay" style={{ zIndex: 1200, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(10, 15, 30, 0.55)' }}>
          <div style={{ width: '90vw', maxWidth: '720px', maxHeight: '90vh', background: 'var(--bg-surface)', borderRadius: 'var(--radius-lg, 10px)', border: '1px solid var(--border-color)', padding: '24px', color: 'var(--text-main)', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 'var(--fs-lg, 16px)', fontWeight: 700 }}>{previewDoc.title}</h3>
                <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: 'var(--fs-sm, 12px)' }}>Aktif Versiyon: v{previewDoc.currentVersion} ({previewDoc.fileName})</p>
              </div>
              <button onClick={() => setPreviewDoc(null)} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
                <X size={20} />
              </button>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '16px' }}>
              {/* Belge Önizleme Kutusu */}
              <div style={{ height: '240px', background: 'var(--bg-surface-secondary)', borderRadius: 'var(--radius-md, 8px)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', border: '1px solid var(--border-color)' }}>
                <FileText size={48} color="var(--info)" />
                <div style={{ marginTop: '12px', fontWeight: 700, color: 'var(--text-main)' }}>{previewDoc.fileName}</div>
                <div style={{ fontSize: 'var(--fs-xs, 11px)', color: 'var(--text-muted)' }}>PDF Dokümanı Güvenli Görüntüleyici</div>
              </div>

              {/* Versiyon Geçmişi */}
              <h4 style={{ margin: '8px 0 4px', fontSize: 'var(--fs-base, 13px)', fontWeight: 700, color: 'var(--info)' }}>Versiyon Geçmişi</h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {previewDoc.versions.map((ver, idx) => (
                  <div key={idx} style={{ padding: '10px 14px', background: 'var(--bg-surface-secondary)', borderRadius: 'var(--radius-sm, 6px)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 'var(--fs-sm, 12px)' }}>
                    <div>
                      <span style={{ fontWeight: 700, color: 'var(--success-text)', marginRight: '8px' }}>v{ver.versionNumber}</span>
                      <span>{ver.changeSummary || ver.fileName}</span>
                      <div style={{ fontSize: 'var(--fs-xs, 11px)', color: 'var(--text-muted)' }}>Yükleyen: {ver.uploadedByName} ({new Date(ver.uploadedAt).toLocaleString('tr-TR')})</div>
                    </div>
                    <span style={{ color: 'var(--text-muted)', fontSize: 'var(--fs-xs, 11px)' }}>{(ver.fileSize / 1024).toFixed(0)} KB</span>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button onClick={() => setPreviewDoc(null)} style={{ padding: '8px 20px', background: 'var(--primary)', border: 'none', borderRadius: 'var(--radius-sm, 6px)', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>
                Kapat
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Share Modal */}
      {shareDoc && (
        <div className="modal-overlay" style={{ zIndex: 1200, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(10, 15, 30, 0.55)' }}>
          <div style={{ width: '90vw', maxWidth: '500px', background: 'var(--bg-surface)', borderRadius: 'var(--radius-lg, 10px)', border: '1px solid var(--border-color)', padding: '24px', color: 'var(--text-main)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ margin: 0, fontSize: 'var(--fs-lg, 16px)', fontWeight: 700 }}>Güvenli Belge Paylaşımı</h3>
              <button onClick={() => setShareDoc(null)} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
                <X size={20} />
              </button>
            </div>

            <p style={{ fontSize: 'var(--fs-base, 13px)', color: 'var(--text-main)', margin: '0 0 16px' }}>
              <b>{shareDoc.title}</b> belgesi için harici müşterilere veya yetkililere iletilecek güvenli, süreli ve şifreli bağlantı oluşturun.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: 'var(--fs-xs, 11px)', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '4px' }}>İsteğe Bağlı Parola Koruması</label>
                <input
                  type="text"
                  placeholder="Şifre belirleyin (Boş bırakılabilir)"
                  value={sharePassword}
                  onChange={e => setSharePassword(e.target.value)}
                  style={{ width: '100%', padding: '8px 12px', background: 'var(--bg-surface-secondary)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm, 6px)', color: 'var(--text-main)', fontSize: 'var(--fs-sm, 12px)' }}
                />
              </div>

              {!generatedShareToken ? (
                <button
                  onClick={handleCreateShareToken}
                  style={{ padding: '10px', background: 'var(--primary)', border: 'none', borderRadius: 'var(--radius-sm, 6px)', color: '#fff', fontWeight: 700, cursor: 'pointer' }}
                >
                  Paylaşım Bağlantısı Üret
                </button>
              ) : (
                <div style={{ background: 'var(--bg-surface-secondary)', padding: '14px', borderRadius: 'var(--radius-sm, 6px)', border: '1px solid var(--border-color)' }}>
                  <div style={{ fontSize: 'var(--fs-xs, 11px)', color: 'var(--success-text)', fontWeight: 700, marginBottom: '6px' }}>Güvenli Bağlantı Hazır (72 Saat Geçerli)</div>
                  <div style={{ fontSize: 'var(--fs-sm, 12px)', color: 'var(--info)', wordBreak: 'break-all', fontFamily: 'monospace', marginBottom: '10px' }}>
                    {window.location.origin}/share/{generatedShareToken.token}
                  </div>
                  <button
                    onClick={copyShareLink}
                    style={{ width: '100%', padding: '8px', background: 'var(--primary)', border: 'none', borderRadius: 'var(--radius-sm, 6px)', color: '#fff', fontWeight: 700, fontSize: 'var(--fs-sm, 12px)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                  >
                    <Copy size={14} />
                    <span>Bağlantıyı Kopyala</span>
                  </button>
                </div>
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button onClick={() => setShareDoc(null)} style={{ padding: '8px 18px', background: 'var(--bg-surface-secondary)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm, 6px)', color: 'var(--text-main)', cursor: 'pointer' }}>
                Kapat
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
