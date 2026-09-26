import React, { useState, useEffect } from 'react';
import { api } from '../../../services/api';
import { useToast } from '../../../context/ToastContext';
import { useApp } from '../../../context/AppContext';
import { DataGrid } from '../../common/DataGrid';
import type { Column } from '../../common/DataGrid';
import { Modal } from '../../common/Modal';
import { XsltUploadPanel } from './XsltUploadPanel';
import { transformXmlWithXsltInBrowser } from '../../../utils/xsltTransform';
import type { DocumentType, DocumentTemplate, DocumentTemplateVersion } from '../../../types';
import {
  FileText,
  Plus,
  Edit2,
  Trash2,
  Copy,
  Eye,
  Download,
  Upload,
  Star,
  History,
  Code,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Search,
  Sparkles,
  Layers,
  ArrowLeft,
  Building,
  Printer,
  Check,
} from 'lucide-react';

interface DocumentTemplateListViewProps {
  onOpenDesigner: (templateId: string | null, documentType?: DocumentType) => void;
}

export const DocumentTemplateListView: React.FC<DocumentTemplateListViewProps> = ({ onOpenDesigner }) => {
  const { showToast } = useToast();
  const { activeTenant, triggerRefresh, refreshKey } = useApp();

  const [activeTab, setActiveTab] = useState<DocumentType>('EFATURA');
  const [templates, setTemplates] = useState<DocumentTemplate[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  // Modals
  const [previewTemplate, setPreviewTemplate] = useState<DocumentTemplate | null>(null);
  const [previewHtml, setPreviewHtml] = useState<string>('');
  const [loadingPreview, setLoadingPreview] = useState(false);

  const [xsltViewTemplate, setXsltViewTemplate] = useState<DocumentTemplate | null>(null);
  const [customXsltText, setCustomXsltText] = useState('');
  const [xsltValidating, setXsltValidating] = useState(false);
  const [xsltValidationMessage, setXsltValidationMessage] = useState<{ valid: boolean; text: string } | null>(null);
  // 2026-09-26: Dosya yükleme için ayrı sekme. Kod yapıştırma (mevcut textarea)
  // korunur; yükleme onun yerine geçmez, yanında durur.
  const [xsltModalTab, setXsltModalTab] = useState<'code' | 'upload'>('code');
  const [xsltSaving, setXsltSaving] = useState(false);

  const [versionHistoryTemplate, setVersionHistoryTemplate] = useState<DocumentTemplate | null>(null);
  const [versionsList, setVersionsList] = useState<DocumentTemplateVersion[]>([]);
  const [loadingVersions, setLoadingVersions] = useState(false);

  useEffect(() => {
    loadTemplates();
  }, [activeTab, refreshKey]);

  const loadTemplates = async () => {
    setLoading(true);
    try {
      const res = await api.getDocumentTemplates({ documentType: activeTab, search: searchQuery });
      if (res.success) {
        setTemplates(res.templates);
        setStats(res.stats);
      }
    } catch (err: any) {
      showToast(err.message || 'Şablonlar yüklenemedi.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleSetDefault = async (template: DocumentTemplate) => {
    try {
      const res = await api.setDefaultDocumentTemplate(template.id);
      if (res.success) {
        showToast(res.message, 'success');
        loadTemplates();
        triggerRefresh();
      }
    } catch (err: any) {
      showToast(err.message || 'Varsayılan yapılamadı.', 'error');
    }
  };

  const handleDuplicate = async (template: DocumentTemplate) => {
    try {
      const res = await api.duplicateDocumentTemplate(template.id);
      if (res.success) {
        showToast(res.message, 'success');
        loadTemplates();
      }
    } catch (err: any) {
      showToast(err.message || 'Kopyalama başarısız.', 'error');
    }
  };

  const handleDelete = async (template: DocumentTemplate) => {
    if (!confirm(`"${template.name}" tasarımını silmek istediğinize emin misiniz?`)) return;
    try {
      const res = await api.deleteDocumentTemplate(template.id);
      if (res.success) {
        showToast(res.message, 'success');
        loadTemplates();
        triggerRefresh();
      }
    } catch (err: any) {
      showToast(err.message || 'Silinemedi.', 'error');
    }
  };

  // 2026-09-26: Önizleme artık GERÇEKTEN yüklenen XSLT ile üretilir.
  // Sunucu XSLT'yi hazırlar (`renderedBy: 'client'`), dönüşümü tarayıcının
  // XSLTProcessor'ı yapar. XSLT hiç yoksa sunucu yedek HTML döner.
  const handleOpenPreview = async (template: DocumentTemplate) => {
    setPreviewTemplate(template);
    setLoadingPreview(true);
    setPreviewHtml('');
    try {
      const res: any = await api.previewDocumentTemplate(template.id);
      if (!res.success) {
        showToast('Önizleme oluşturulamadı.', 'error');
        return;
      }

      if (res.renderedBy === 'fallback' || !res.xslt) {
        setPreviewHtml(res.html || '');
        if (res.unsupportedFeatures?.length) {
          showToast(
            `Tasarım yüklenen XSLT ile gösterilemiyor (desteklenmeyen: ${res.unsupportedFeatures.join(', ')}); yedek görünüm gösteriliyor.`,
            'warning'
          );
        }
        return;
      }

      const out = transformXmlWithXsltInBrowser(res.xml || '', res.xslt);
      if (out.ok) {
        setPreviewHtml(out.html);
        if (res.adjustments?.length) {
          showToast(`XSLT otomatik uyumlulaştırıldı: ${res.adjustments.join(' ')}`, 'info');
        }
      } else {
        // Sessizce boş gösterme: nedenini kullanıcıya söyle.
        setPreviewHtml(
          `<div style="font-family:Arial,sans-serif;padding:24px;color:#b91c1c;">` +
          `<strong>Önizleme oluşturulamadı.</strong><br><br>${out.error || ''}</div>`
        );
        showToast(out.error || 'XSLT dönüşümü başarısız.', 'error');
      }
    } catch (err: any) {
      showToast(err.message || 'Önizleme oluşturulamadı.', 'error');
    } finally {
      setLoadingPreview(false);
    }
  };

  const handleOpenXsltViewer = (template: DocumentTemplate) => {
    setXsltViewTemplate(template);
    setCustomXsltText(template.xsltContent);
    setXsltValidationMessage(null);
    setXsltModalTab('code');
  };

  // 2026-09-26: Dosya yükleyici için doğrulama sarmalayıcısı. Panel `onValidate`
  // ile içeriği doğrular ve sonucu gösterir; burada doğrulama mesajı durumu da
  // güncellenir ki kod sekmesindekiyle tutarlı kalsın.
  const handleUploadValidate = async (content: string) => {
    const res = await api.validateXslt(content);
    setXsltValidationMessage({ valid: res.valid, text: res.message });
    return { valid: res.valid, message: res.message, error: res.error };
  };

  const handleUploadSave = async (content: string, versionNote: string) => {
    if (!xsltViewTemplate) return;
    setXsltSaving(true);
    try {
      const res = await api.uploadDocumentTemplateXslt(xsltViewTemplate.id, {
        xsltContent: content,
        versionNote,
      });
      if (res.success) {
        showToast(res.message, 'success');
        setXsltViewTemplate(null);
        loadTemplates();
        triggerRefresh();
      }
    } catch (err: any) {
      showToast(err.message || 'XSLT yüklenemedi.', 'error');
    } finally {
      setXsltSaving(false);
    }
  };

  const handleValidateXslt = async () => {
    setXsltValidating(true);
    try {
      const res = await api.validateXslt(customXsltText);
      setXsltValidationMessage({
        valid: res.valid,
        text: res.message,
      });
      if (res.valid) {
        showToast('✓ XSLT başarıyla doğrulandı.', 'success');
      } else {
        showToast(res.message, 'warning');
      }
    } catch (err: any) {
      setXsltValidationMessage({ valid: false, text: err.message });
      showToast(err.message || 'Doğrulama hatası.', 'error');
    } finally {
      setXsltValidating(false);
    }
  };

  const handleSaveCustomXslt = async () => {
    if (!xsltViewTemplate) return;
    try {
      const res = await api.uploadDocumentTemplateXslt(xsltViewTemplate.id, {
        xsltContent: customXsltText,
        versionNote: 'XSLT Kod Editörü üzerinden güncellendi',
      });
      if (res.success) {
        showToast(res.message, 'success');
        setXsltViewTemplate(null);
        loadTemplates();
        triggerRefresh();
      }
    } catch (err: any) {
      showToast(err.message || 'XSLT kaydedilemedi.', 'error');
    }
  };

  const handleOpenVersionHistory = async (template: DocumentTemplate) => {
    setVersionHistoryTemplate(template);
    setLoadingVersions(true);
    try {
      const res = await api.getDocumentTemplateVersions(template.id);
      if (res.success) {
        setVersionsList(res.versions);
      }
    } catch (err: any) {
      showToast(err.message || 'Sürüm geçmişi alınamadı.', 'error');
    } finally {
      setLoadingVersions(false);
    }
  };

  const handleRestoreVersion = async (versionNumber: number) => {
    if (!versionHistoryTemplate) return;
    if (!confirm(`Tasarımı v${versionNumber} sürümüne geri yüklemek istediğinize emin misiniz?`)) return;
    try {
      const res = await api.restoreDocumentTemplateVersion(versionHistoryTemplate.id, versionNumber);
      if (res.success) {
        showToast(res.message, 'success');
        setVersionHistoryTemplate(null);
        loadTemplates();
        triggerRefresh();
      }
    } catch (err: any) {
      showToast(err.message || 'Geri yükleme başarısız.', 'error');
    }
  };

  // 2026-09-13: Belge türü sekme renkleri uygulama chrome'u idi; sabit hex yerine
  // açık tema token'larına bağlandı (her sekme için metin + yumuşak zemin çifti).
  const tabs: Array<{ id: DocumentType; label: string; count: number; color: string; bg: string }> = [
    { id: 'EFATURA', label: 'e-Fatura', count: stats?.efatura || 0, color: 'var(--info)', bg: 'var(--info-bg)' },
    { id: 'EARSIV', label: 'e-Arşiv', count: stats?.earsiv || 0, color: 'var(--success)', bg: 'var(--success-bg)' },
    { id: 'EIRSALIYE', label: 'e-İrsaliye', count: stats?.eirsaliye || 0, color: 'var(--warning)', bg: 'var(--warning-bg)' },
    { id: 'ESMM', label: 'e-SMM', count: stats?.esmm || 0, color: 'var(--primary)', bg: 'var(--primary-light)' },
  ];

  const columns: Column<DocumentTemplate>[] = [
    {
      key: 'name',
      title: 'Tasarım Adı & Şablon',
      width: '260px',
      render: t => (
        <div>
          <div style={{ fontWeight: 700, color: 'var(--text-main)', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <FileText size={15} color="var(--primary)" />
            <span>{t.name}</span>
            {t.isDefault && (
              <span className="badge badge-success" style={{ fontSize: '9px', padding: '1px 6px', display: 'flex', alignItems: 'center', gap: '3px' }}>
                <Star size={10} fill="currentColor" /> Varsayılan
              </span>
            )}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
            Tema: <strong>{t.theme}</strong> · {t.description || 'Standart XSLT Şablonu'}
          </div>
        </div>
      ),
    },
    {
      key: 'documentType',
      title: 'Belge Türü',
      width: '120px',
      render: t => {
        // 2026-09-13: Belge türü rozeti açık tema token'larına bağlandı.
        const badge: Record<string, { color: string; bg: string }> = {
          EFATURA: { color: 'var(--info)', bg: 'var(--info-bg)' },
          EARSIV: { color: 'var(--success)', bg: 'var(--success-bg)' },
          EIRSALIYE: { color: 'var(--warning)', bg: 'var(--warning-bg)' },
          ESMM: { color: 'var(--primary)', bg: 'var(--primary-light)' },
        };
        const c = badge[t.documentType] ?? { color: 'var(--text-muted)', bg: 'var(--bg-surface-secondary)' };
        return (
          <span className="badge" style={{ background: c.bg, color: c.color, border: 'none', fontWeight: 700 }}>
            {t.documentType}
          </span>
        );
      },
    },
    {
      key: 'version',
      title: 'Sürüm',
      width: '90px',
      render: t => (
        <button
          className="btn btn-secondary btn-sm"
          onClick={() => handleOpenVersionHistory(t)}
          style={{ fontSize: '11px', padding: '2px 8px', fontWeight: 700, fontFamily: 'var(--font-mono)' }}
          title="Sürüm Geçmişini Gör"
        >
          <History size={12} style={{ marginRight: '3px' }} /> v{t.version}
        </button>
      ),
    },
    {
      key: 'isActive',
      title: 'Durum',
      width: '90px',
      render: t => (
        <span className={`badge ${t.isActive ? 'badge-success' : 'badge-danger'}`} style={{ fontSize: '10.5px' }}>
          {t.isActive ? '✓ Aktif' : 'Pasif'}
        </span>
      ),
    },
    {
      key: 'updatedAt',
      title: 'Son Güncelleme',
      width: '140px',
      render: t => (
        <div style={{ fontSize: '11px' }}>
          <div>{new Date(t.updatedAt).toLocaleDateString('tr-TR')}</div>
          <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>@{t.createdBy}</div>
        </div>
      ),
    },
    {
      key: 'actions',
      title: 'İşlemler',
      width: '240px',
      render: t => (
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <button
            className="btn btn-primary btn-sm"
            onClick={() => onOpenDesigner(t.id, t.documentType)}
            style={{ fontSize: '11px', padding: '3px 8px' }}
            title="Tasarım Editöründe Düzenle"
          >
            <Edit2 size={12} /> Düzenle
          </button>
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => handleOpenPreview(t)}
            style={{ fontSize: '11px', padding: '3px 8px' }}
            title="A4 Canlı Önizleme"
          >
            <Eye size={12} />
          </button>
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => handleOpenXsltViewer(t)}
            style={{ fontSize: '11px', padding: '3px 8px' }}
            title="XSLT Kaynak Kodu & İndir"
          >
            <Code size={12} />
          </button>
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => handleDuplicate(t)}
            style={{ fontSize: '11px', padding: '3px 8px' }}
            title="Kopyala / Çoğalt"
          >
            <Copy size={12} />
          </button>
          {!t.isDefault && (
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => handleSetDefault(t)}
              style={{ fontSize: '11px', padding: '3px 8px', color: 'var(--warning)' }}
              title="Varsayılan Yap"
            >
              <Star size={12} />
            </button>
          )}
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => handleDelete(t)}
            style={{ fontSize: '11px', padding: '3px 8px', color: 'var(--danger)' }}
            title="Sil"
          >
            <Trash2 size={12} />
          </button>
        </div>
      ),
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', height: '100%' }}>
      {/* ─── ŞİRKET BİLGİ BANDI (SCREENSHOT UYUMU) ─── */}
      <div
        style={{
          background: 'var(--bg-surface-secondary)',
          border: '1px solid var(--border-color)',
          borderRadius: '8px',
          padding: '10px 16px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          fontSize: '12px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Building size={15} color="var(--primary)" />
          <span>
            <strong>{activeTenant?.name || 'BEYOĞLU TEKNOLOJİ LTD. ŞTİ.'}</strong> firması adına işlem yapmaktasınız.
          </span>
        </div>
        <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
          VKN: <code>{activeTenant?.taxNumber || '1681136628'}</code> · UBL-TR 2.1 XSLT Standardı
        </div>
      </div>

      {/* ─── 4 BELGE TÜRÜ ÜST SEKME MENÜSÜ ─── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid var(--border-color)' }}>
        <div style={{ display: 'flex', gap: '4px' }}>
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '10px 18px',
                fontSize: '13px',
                fontWeight: activeTab === tab.id ? 700 : 500,
                border: 'none',
                borderBottom: activeTab === tab.id ? `3px solid ${tab.color}` : '3px solid transparent',
                background: activeTab === tab.id ? 'var(--bg-surface)' : 'transparent',
                color: activeTab === tab.id ? tab.color : 'var(--text-muted)',
                cursor: 'pointer',
                borderRadius: 'var(--radius-md) var(--radius-md) 0 0',
                transition: 'all 0.15s',
                marginBottom: '-2px',
              }}
            >
              <span>{tab.label} Tasarımları</span>
              <span
                className="badge"
                style={{
                  background: activeTab === tab.id ? tab.bg : 'var(--border-color)',
                  color: activeTab === tab.id ? tab.color : 'var(--text-muted)',
                  fontSize: '10.5px',
                  fontWeight: 700,
                  padding: '2px 7px',
                }}
              >
                {tab.count}
              </span>
            </button>
          ))}
        </div>

        <button
          className="btn btn-primary"
          onClick={() => onOpenDesigner(null, activeTab)}
          style={{ fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}
        >
          <Plus size={15} /> + Yeni {tabs.find(t => t.id === activeTab)?.label} Tasarımı
        </button>
      </div>

      {/* ─── TABLO & LİSTE ALANI ─── */}
      <div style={{ flex: 1, minHeight: '400px' }}>
        <DataGrid<DocumentTemplate>
          data={templates}
          columns={columns}
          loading={loading}
          rowKey="id"
          emptyMessage={`Henüz ${activeTab} için özel şablon oluşturulmamış. Yeni Tasarım butonuna basarak oluşturabilirsiniz.`}
        />
      </div>

      {/* ─── 1. CANLI ÖNİZLEME MODALI (A4) ─── */}
      {previewTemplate && (
        <Modal
          isOpen={!!previewTemplate}
          onClose={() => setPreviewTemplate(null)}
          title={`A4 Belge Önizleme: ${previewTemplate.name} (${previewTemplate.documentType})`}
          size="large"
          footer={
            <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                UBL-TR 2.1 XML + {previewTemplate.name} (v{previewTemplate.version}) XSLT Motoru
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => {
                    const iframe = document.getElementById('preview-iframe') as HTMLIFrameElement;
                    iframe?.contentWindow?.print();
                  }}
                >
                  <Printer size={13} /> Yazdır / PDF
                </button>
                <button className="btn btn-secondary btn-sm" onClick={() => setPreviewTemplate(null)}>
                  Kapat
                </button>
              </div>
            </div>
          }
        >
          {loadingPreview ? (
            <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
              <RefreshCw size={24} className="animate-spin" style={{ margin: '0 auto 10px' }} />
              <div>XSLT 1.0 motoru ile UBL-TR XML işleniyor...</div>
            </div>
          ) : (
            <div style={{ background: 'var(--bg-surface-secondary)', padding: '15px', borderRadius: 'var(--radius-md)', overflowY: 'auto', maxHeight: '70vh' }}>
              <iframe
                id="preview-iframe"
                srcDoc={previewHtml}
                style={{
                  width: '100%',
                  minHeight: '750px',
                  border: '1px solid var(--border-color)',
                  borderRadius: 'var(--radius-xs)',
                  // 2026-09-13 — '#fff' BURADA KASITLIDIR: iframe içeriği basılacak
                  // A4 kağıdıdır (DOCUMENT); uygulama teması değildir.
                  background: '#fff',
                  boxShadow: '0 4px 15px rgba(0,0,0,0.06)',
                }}
                title="A4 Preview"
              />
            </div>
          )}
        </Modal>
      )}

      {/* ─── 2. XSLT KAYNAK KODU & İNDİR / YÜKLE MODALI ─── */}
      {xsltViewTemplate && (
        <Modal
          isOpen={!!xsltViewTemplate}
          onClose={() => setXsltViewTemplate(null)}
          title={`XSLT Kaynak Kodu: ${xsltViewTemplate.name} (v${xsltViewTemplate.version})`}
          size="large"
          footer={
            <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={handleValidateXslt}
                  disabled={xsltValidating}
                >
                  <CheckCircle2 size={13} /> {xsltValidating ? 'Doğrulanıyor...' : 'XSLT Doğrula'}
                </button>
                <a
                  href={`/api/document-templates/${xsltViewTemplate.id}/xslt?download=true`}
                  className="btn btn-secondary btn-sm"
                  download={`${xsltViewTemplate.name}.xslt`}
                  style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '4px' }}
                >
                  <Download size={13} /> .XSLT İndir
                </a>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button className="btn btn-secondary btn-sm" onClick={() => setXsltViewTemplate(null)}>
                  İptal
                </button>
                <button className="btn btn-primary btn-sm" onClick={handleSaveCustomXslt}>
                  Değişiklikleri Kaydet (Yeni Sürüm Oluştur)
                </button>
              </div>
            </div>
          }
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {/* Sekme seçimi: kodu doğrudan düzenle ya da dosya yükle */}
            <div style={{ display: 'flex', gap: '4px', borderBottom: '1px solid var(--border-color)' }}>
              {([
                { id: 'code' as const, label: 'Kodu Düzenle', icon: <Code size={13} /> },
                { id: 'upload' as const, label: 'Dosya Yükle', icon: <Upload size={13} /> },
              ]).map(t => (
                <button
                  key={t.id}
                  className="btn btn-sm"
                  onClick={() => setXsltModalTab(t.id)}
                  style={{
                    fontSize: '11.5px', display: 'flex', alignItems: 'center', gap: '5px',
                    padding: '6px 13px', borderRadius: 'var(--radius-sm) var(--radius-sm) 0 0',
                    background: xsltModalTab === t.id ? 'var(--primary-light)' : 'transparent',
                    color: xsltModalTab === t.id ? 'var(--primary)' : 'var(--text-muted)',
                    fontWeight: xsltModalTab === t.id ? 700 : 500,
                    borderBottom: xsltModalTab === t.id ? '2px solid var(--primary)' : '2px solid transparent',
                  }}
                >
                  {t.icon} {t.label}
                </button>
              ))}
            </div>

            {xsltModalTab === 'upload' && xsltViewTemplate && (
              <XsltUploadPanel
                currentContent={xsltViewTemplate.xsltContent}
                onValidate={handleUploadValidate}
                onSave={handleUploadSave}
                saving={xsltSaving}
              />
            )}

            {xsltModalTab === 'code' && (
            <div style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>
              Bu alandan standart XSLT 1.0 kodunu doğrudan inceleyebilir, düzenleyebilir veya harici bir XSLT dosyasını yapıştırabilirsiniz.
            </div>
            )}

            {xsltModalTab === 'code' && xsltValidationMessage && (
              <div
                style={{
                  padding: '8px 12px',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: '11.5px',
                  background: xsltValidationMessage.valid ? 'var(--success-bg)' : 'var(--danger-bg)',
                  border: `1px solid ${xsltValidationMessage.valid ? 'var(--success-border)' : 'var(--danger-border)'}`,
                  color: xsltValidationMessage.valid ? 'var(--success-text)' : 'var(--danger-text)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                {xsltValidationMessage.valid ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
                <span>{xsltValidationMessage.text}</span>
              </div>
            )}

            {xsltModalTab === 'code' && (
            <textarea
              className="form-control"
              value={customXsltText}
              onChange={e => setCustomXsltText(e.target.value)}
              rows={22}
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '11.5px',
                lineHeight: 1.45,
                background: 'var(--bg-surface-secondary)',
                color: 'var(--text-main)',
                border: '1px solid var(--border-color)',
                borderRadius: 'var(--radius-sm)',
                padding: '12px',
                whiteSpace: 'pre',
                overflowWrap: 'normal',
                overflowX: 'auto',
              }}
            />
            )}
          </div>
        </Modal>
      )}

      {/* ─── 3. SÜRÜM GEÇMİŞİ & GERİ YÜKLEME MODALI ─── */}
      {versionHistoryTemplate && (
        <Modal
          isOpen={!!versionHistoryTemplate}
          onClose={() => setVersionHistoryTemplate(null)}
          title={`Sürüm Geçmişi: ${versionHistoryTemplate.name}`}
          size="medium"
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>
              Her tasarım değişikliğinde otomatik yeni bir sürüm kaydedilir. İstediğiniz sürüme geri dönebilirsiniz.
            </div>

            {loadingVersions ? (
              <div style={{ padding: '30px', textAlign: 'center', color: 'var(--text-muted)' }}>
                Sürümler yükleniyor...
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '400px', overflowY: 'auto' }}>
                {versionsList.map(v => (
                  <div
                    key={v.id}
                    style={{
                      padding: '10px 14px',
                      background: 'var(--bg-surface-secondary)',
                      borderRadius: '6px',
                      border: v.version === versionHistoryTemplate.version ? '1.5px solid var(--primary)' : '1px solid var(--border-color)',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '12.5px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span className="badge badge-secondary" style={{ fontFamily: 'var(--font-mono)' }}>v{v.version}</span>
                        <span>{v.notes || `Sürüm v${v.version}`}</span>
                        {v.version === versionHistoryTemplate.version && (
                          <span className="badge badge-success" style={{ fontSize: '9px' }}>Mevcut Aktif</span>
                        )}
                      </div>
                      <div style={{ fontSize: '10.5px', color: 'var(--text-muted)', marginTop: '2px' }}>
                        {new Date(v.createdAt).toLocaleString('tr-TR')} · @{v.createdBy}
                      </div>
                    </div>

                    {v.version !== versionHistoryTemplate.version && (
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => handleRestoreVersion(v.version)}
                        style={{ fontSize: '11px' }}
                      >
                        Bu Sürüme Dön
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
};
