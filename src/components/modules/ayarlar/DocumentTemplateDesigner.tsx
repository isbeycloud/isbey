import React, { useState, useEffect } from 'react';
import { api } from '../../../services/api';
import { useToast } from '../../../context/ToastContext';
import { useApp } from '../../../context/AppContext';
import { Modal } from '../../common/Modal';
import { transformXmlWithXsltInBrowser } from '../../../utils/xsltTransform';
import { XsltUploadPanel } from './XsltUploadPanel';
import type { DocumentType, DocumentTemplate, DocumentDesignConfig } from '../../../types';
import {
  ArrowLeft,
  Save,
  Eye,
  Download,
  Upload,
  Code,
  CheckCircle2,
  AlertCircle,
  Plus,
  Trash2,
  RefreshCw,
  Building,
  Image,
  CreditCard,
  Sliders,
  FileText,
  Printer,
  Sparkles,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Check,
} from 'lucide-react';

interface DocumentTemplateDesignerProps {
  templateId: string | null;
  initialDocumentType?: DocumentType;
  onBack: () => void;
}

export const DocumentTemplateDesigner: React.FC<DocumentTemplateDesignerProps> = ({
  templateId,
  initialDocumentType = 'EFATURA',
  onBack,
}) => {
  const { showToast } = useToast();
  const { activeTenant, triggerRefresh } = useApp();

  // Basic Template Info
  const [docType, setDocType] = useState<DocumentType>(initialDocumentType);
  const [templateName, setTemplateName] = useState('general');
  const [description, setDescription] = useState('');
  const [theme, setTheme] = useState<'CLASSIC' | 'MODERN' | 'CORPORATE' | 'COMPACT' | 'PROFESSIONAL'>('MODERN');
  const [isDefault, setIsDefault] = useState(false);
  const [version, setVersion] = useState(1);

  // Design Configuration (Left Panel)
  const [primaryColor, setPrimaryColor] = useState('#0284c7');
  // 2026-09-13 — '#0284c7' VERİ'dir (şablonun baskı vurgu rengi), tema değil.
  // 2026-09-13 — primaryColor/secondaryColor VERİ'dir: buildCurrentConfig() ile
  // backend'e kaydedilen ve önizleme/XSLT motoruna beslenen ŞABLON RENKLERİ
  // (baskı çıktısı), uygulama teması değildir. Açık tema token'ına çevrilmez.
  const [secondaryColor, setSecondaryColor] = useState('#1e293b');
  const [fontFamily, setFontFamily] = useState('Arial, sans-serif');
  const [fontSize, setFontSize] = useState(11);

  // Logo & Kaşe / İmza
  const [showLogo, setShowLogo] = useState(true);
  const [logoUrl, setLogoUrl] = useState('');
  const [logoWidth, setLogoWidth] = useState(302);
  const [logoHeight, setLogoHeight] = useState(265);

  const [showSignature, setShowSignature] = useState(true);
  const [signatureUrl, setSignatureUrl] = useState('');
  const [signatureWidth, setSignatureWidth] = useState(200);
  const [signatureHeight, setSignatureHeight] = useState(100);

  const [showQrCode, setShowQrCode] = useState(true);
  const [showBarcode, setShowBarcode] = useState(true);

  // Bank Accounts Table & Multi-IBAN Management
  const POPULAR_BANKS = [
    'Garanti BBVA',
    'Türkiye İş Bankası',
    'Ziraat Bankası',
    'Yapı Kredi',
    'Akbank',
    'VakıfBank',
    'Halkbank',
    'QNB Finansbank',
    'DenizBank',
    'Kuveyt Türk',
    'Türkiye Finans',
    'TEB (Türk Ekonomi Bankası)',
    'Enpara.com',
    'Albaraka Türk',
    'Fibabanka',
    'Diğer (Özel Banka Adı)',
  ];

  const [bankAccounts, setBankAccounts] = useState<Array<{ bankName: string; currency: string; iban: string }>>([
    { bankName: 'Garanti BBVA', currency: 'TRY', iban: 'TR33 0006 2000 0001 2345 6789 01' },
    { bankName: 'İş Bankası', currency: 'USD', iban: 'TR66 0006 4000 0009 8765 4321 02' },
  ]);
  const [selectedPresetBank, setSelectedPresetBank] = useState('Garanti BBVA');
  const [customBankName, setCustomBankName] = useState('');
  const [newBankCurrency, setNewBankCurrency] = useState('TRY');
  const [newBankIban, setNewBankIban] = useState('');
  const [bulkIbanModalOpen, setBulkIbanModalOpen] = useState(false);
  const [bulkIbanText, setBulkIbanText] = useState('');

  // Column Visibility
  const [columns, setColumns] = useState({
    showLineNumber: true,
    showProductCode: true,
    showBarcode: false,
    showDescription: true,
    showQuantity: true,
    showUnit: true,
    showUnitPrice: true,
    showDiscount: true,
    showVatRate: true,
    showVatAmount: true,
    showLineTotal: true,
  });

  // Notes & Payment Terms
  const [notes, setNotes] = useState('Fatura bedeli teslimat tarihinden itibaren 15 gün içinde ödenmelidir.');
  const [paymentTerms, setPaymentTerms] = useState('Banka Havalesi / EFT');
  const [footerNote, setFooterNote] = useState('Bu belge 213 sayılı V.U.K. hükümlerine göre elektronik ortamda düzenlenmiştir.');

  // Right Panel: Live Preview & Zoom
  const [previewHtml, setPreviewHtml] = useState<string>('');
  const [zoomLevel, setZoomLevel] = useState<number>(100);
  const [sampleXml, setSampleXml] = useState<string>('');
  const [customXmlModalOpen, setCustomXmlModalOpen] = useState(false);
  const [customXmlText, setCustomXmlText] = useState('');

  // States
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [validating, setValidating] = useState(false);
  const [isXsltEditorOpen, setIsXsltEditorOpen] = useState(false);
  const [rawXsltCode, setRawXsltCode] = useState('');
  // 2026-09-26: Kod düzenleme ve dosya yükleme ayrı sekmeler.
  const [xsltEditorTab, setXsltEditorTab] = useState<'code' | 'upload'>('code');
  const [validationResult, setValidationResult] = useState<{ valid: boolean; message: string } | null>(null);

  useEffect(() => {
    loadInitialData();
  }, [templateId]);

  useEffect(() => {
    updateLivePreview();
  }, [
    docType,
    templateName,
    theme,
    primaryColor,
    secondaryColor,
    fontFamily,
    fontSize,
    logoUrl,
    logoWidth,
    logoHeight,
    signatureUrl,
    signatureWidth,
    signatureHeight,
    showLogo,
    showSignature,
    showQrCode,
    showBarcode,
    bankAccounts,
    columns,
    notes,
    paymentTerms,
    footerNote,
    sampleXml,
  ]);

  const loadInitialData = async () => {
    setLoading(true);
    try {
      // 2026-09-26: Örnek XML artık kimlik doğrulamalı olarak ve doğrulanarak
      // alınır (bkz. api.getSampleXml). Alınamazsa tasarımcı AÇILMAYA DEVAM
      // eder — kullanıcının yaptığı iş XSLT'dir; örnek veri yüzünden ekranı
      // kilitlemek yanlış olur. Bunun yerine durum açıkça bildirilir ve
      // önizleme, dönüşüm girdisi eksik olduğu için hata mesajı gösterir.
      try {
        const xml = await api.getSampleXml(docType);
        setSampleXml(xml);
        setCustomXmlText(xml);
      } catch (xmlErr: any) {
        setSampleXml('');
        setCustomXmlText('');
        showToast(
          `Örnek fatura verisi alınamadı, önizleme sınırlı olacak: ${xmlErr?.message || xmlErr}`,
          'warning'
        );
      }

      if (templateId) {
        const res = await api.getDocumentTemplate(templateId);
        if (res.success && res.template) {
          const t = res.template;
          setDocType(t.documentType);
          setTemplateName(t.name);
          setDescription(t.description || '');
          setTheme(t.theme || 'MODERN');
          setIsDefault(t.isDefault);
          setVersion(t.version || 1);
          setRawXsltCode(t.xsltContent);

          if (t.config) {
            setPrimaryColor(t.config.primaryColor || '#0284c7');
            setSecondaryColor(t.config.secondaryColor || '#1e293b');
            setFontFamily(t.config.fontFamily || 'Arial, sans-serif');
            setFontSize(t.config.fontSize || 11);
            setLogoUrl(t.config.logoUrl || '');
            setLogoWidth(t.config.logoWidth || 302);
            setLogoHeight(t.config.logoHeight || 265);
            setShowLogo(t.config.showLogo ?? true);
            setSignatureUrl(t.config.signatureUrl || '');
            setSignatureWidth(t.config.signatureWidth || 200);
            setSignatureHeight(t.config.signatureHeight || 100);
            setShowSignature(t.config.showSignature ?? true);
            setShowQrCode(t.config.showQrCode ?? true);
            setShowBarcode(t.config.showBarcode ?? true);
            setBankAccounts(t.config.bankAccounts || []);
            if (t.config.columns) setColumns(t.config.columns);
            if (t.config.notes) setNotes(t.config.notes);
            if (t.config.paymentTerms) setPaymentTerms(t.config.paymentTerms);
            if (t.config.footerNote) setFooterNote(t.config.footerNote);
          }
        }
      }
    } catch (err: any) {
      showToast(err.message || 'Tasarım yüklenirken hata oluştu.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const buildCurrentConfig = (): DocumentDesignConfig => ({
    theme,
    primaryColor,
    secondaryColor,
    fontFamily,
    fontSize,
    logoUrl,
    logoWidth: Number(logoWidth),
    logoHeight: Number(logoHeight),
    showLogo,
    signatureUrl,
    signatureWidth: Number(signatureWidth),
    signatureHeight: Number(signatureHeight),
    showSignature,
    showQrCode,
    showBarcode,
    bankAccounts,
    columns,
    notes,
    paymentTerms,
    footerNote,
  });

  /**
   * 2026-09-26: Önizleme artık GERÇEKTEN XSLT ile üretilir.
   *
   * Önceden sunucu `transformXmlWithXslt` sabit bir HTML iskeleti döndürüyordu;
   * çağrılan XSLT hiç çalıştırılmıyordu. Artık sunucu XSLT'yi hazırlar,
   * dönüşümü tarayıcının XSLTProcessor'ı yapar (`renderedBy === 'client'`).
   * XSLT yoksa ya da tarayıcıda çalıştırılamıyorsa sunucunun yedek görünümü
   * gösterilir ve neden kullanıcıya bildirilir.
   */
  const applyPreviewResponse = (res: any, label: 'designer' | 'custom') => {
    if (!res?.success) return false;

    if (res.renderedBy === 'fallback' || !res.xslt) {
      setPreviewHtml(res.html || '');
      if (res.unsupportedFeatures?.length) {
        showToast(
          `Yüklenen XSLT tarayıcıda çalıştırılamıyor (desteklenmeyen: ${res.unsupportedFeatures.join(', ')}); yedek görünüm gösteriliyor.`,
          'warning'
        );
      }
      return true;
    }

    const out = transformXmlWithXsltInBrowser(res.xml || sampleXml || '', res.xslt);
    if (out.ok) {
      setPreviewHtml(out.html);
      if (res.adjustments?.length) {
        showToast(`XSLT otomatik uyumlulaştırıldı: ${res.adjustments.join(' ')}`, 'info');
      }
      return true;
    }

    // Sessizce boş gösterme — nedeni görünür olsun.
    setPreviewHtml(
      `<div style="font-family:Arial,sans-serif;padding:24px;color:#b91c1c;font-size:13px;">` +
      `<strong>Önizleme oluşturulamadı.</strong><br><br>${out.error || ''}</div>`
    );
    if (label === 'custom') showToast(out.error || 'XSLT dönüşümü başarısız.', 'error');
    return false;
  };

  const updateLivePreview = async () => {
    // Örnek XML yokken sunucuya gitmenin anlamı yok: dönüşüm girdisi eksikse
    // XSLT boş belge üzerinde çalışır ve sonuç yanıltıcı olur.
    if (!sampleXml?.trim()) {
      setPreviewHtml(
        `<div style="font-family:Arial,sans-serif;padding:24px;color:#b91c1c;font-size:13px;">` +
        `<strong>Önizleme oluşturulamadı.</strong><br><br>` +
        `Örnek fatura verisi (UBL XML) yüklenemediği için dönüşüm yapılamıyor. ` +
        `Sayfayı yenileyin; sorun sürerse oturumunuzun süresi dolmuş olabilir.</div>`
      );
      return;
    }

    try {
      const cfg = buildCurrentConfig();
      if (templateId) {
        const res = await api.previewDocumentTemplate(templateId, {
          customXml: sampleXml,
          config: cfg,
        });
        applyPreviewResponse(res, 'designer');
      } else {
        const res = await api.previewCustomDocumentTemplate({
          documentType: docType,
          customXml: sampleXml,
          config: cfg,
          customXslt: rawXsltCode || undefined,
        });
        applyPreviewResponse(res, 'custom');
      }
    } catch (err: any) {
      setPreviewHtml(
        `<div style="font-family:Arial,sans-serif;padding:24px;color:#b91c1c;font-size:13px;">` +
        `<strong>Önizleme oluşturulamadı.</strong><br><br>${err?.message || err}</div>`
      );
      console.error('Preview error:', err);
    }
  };

  const formatIbanInput = (val: string) => {
    let clean = val.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
    if (!clean.startsWith('TR') && clean.length > 0 && /^[0-9]/.test(clean)) {
      clean = 'TR' + clean;
    }
    return clean.replace(/(.{4})/g, '$1 ').trim();
  };

  const handleAddBankRow = () => {
    const effectiveBankName = selectedPresetBank === 'Diğer (Özel Banka Adı)'
      ? customBankName.trim()
      : selectedPresetBank;

    if (!effectiveBankName) {
      showToast('Lütfen bir banka adı seçin veya girin.', 'warning');
      return;
    }

    if (!newBankIban.trim()) {
      showToast('Lütfen geçerli bir IBAN numarası girin.', 'warning');
      return;
    }

    const cleanIban = formatIbanInput(newBankIban);

    setBankAccounts([
      ...bankAccounts,
      {
        bankName: effectiveBankName,
        currency: newBankCurrency,
        iban: cleanIban,
      },
    ]);

    setNewBankIban('');
    if (selectedPresetBank === 'Diğer (Özel Banka Adı)') {
      setCustomBankName('');
    }
    showToast(`✓ ${effectiveBankName} (${newBankCurrency}) IBAN hesabı eklendi.`, 'success');
  };

  const handleBulkIbanAdd = () => {
    if (!bulkIbanText.trim()) {
      showToast('Lütfen eklenecek IBAN satırlarını yapıştırın.', 'warning');
      return;
    }

    const lines = bulkIbanText.split('\n').map(l => l.trim()).filter(Boolean);
    const newItems: Array<{ bankName: string; currency: string; iban: string }> = [];

    for (const line of lines) {
      // Split by delimiter (hyphen, pipe, tab, comma, semicolon)
      const parts = line.split(/[-|,\t;]/).map(p => p.trim()).filter(Boolean);
      if (parts.length >= 3) {
        newItems.push({
          bankName: parts[0] || 'Banka',
          currency: (parts[1] || 'TRY').toUpperCase(),
          iban: formatIbanInput(parts[2]),
        });
      } else if (parts.length === 2) {
        const p0IsIban = parts[0].toUpperCase().startsWith('TR');
        newItems.push({
          bankName: p0IsIban ? 'Banka Hesabı' : parts[0],
          currency: 'TRY',
          iban: formatIbanInput(p0IsIban ? parts[0] : parts[1]),
        });
      } else if (line.length >= 10) {
        newItems.push({
          bankName: 'Banka Hesabı',
          currency: 'TRY',
          iban: formatIbanInput(line),
        });
      }
    }

    if (newItems.length > 0) {
      setBankAccounts(prev => [...prev, ...newItems]);
      setBulkIbanText('');
      setBulkIbanModalOpen(false);
      showToast(`✓ ${newItems.length} adet IBAN başarıyla listeye eklendi.`, 'success');
    } else {
      showToast('Geçerli bir IBAN satırı bulunamadı.', 'warning');
    }
  };

  const handleRemoveBankRow = (index: number) => {
    setBankAccounts(bankAccounts.filter((_, i) => i !== index));
  };

  const handleSave = async () => {
    if (!templateName.trim()) {
      showToast('Lütfen bir XSLT tasarım adı girin.', 'warning');
      return;
    }

    setSaving(true);
    setValidationResult(null);

    const config = buildCurrentConfig();

    try {
      if (templateId) {
        const res = await api.updateDocumentTemplate(templateId, {
          name: templateName.trim(),
          description,
          theme,
          config,
          customXslt: rawXsltCode || undefined,
          isDefault,
          versionNote: `v${version + 1} tasarımı kaydedildi`,
        });

        if (res.success) {
          showToast(`✓ "${templateName}" tasarımı başarıyla kaydedildi! (v${res.template.version})`, 'success');
          setVersion(res.template.version);
          triggerRefresh();
        }
      } else {
        const res = await api.createDocumentTemplate({
          name: templateName.trim(),
          documentType: docType,
          description,
          theme,
          config,
          customXslt: rawXsltCode || undefined,
          isDefault,
        });

        if (res.success) {
          showToast(`✓ "${templateName}" tasarımı başarıyla oluşturuldu!`, 'success');
          triggerRefresh();
          onBack();
        }
      }
    } catch (err: any) {
      showToast(err.message || 'Kayıt sırasında hata oluştu.', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg-surface-secondary)', overflow: 'hidden' }}>
      {/* ─── 1. ÜST HEADER & BREADCRUMB (SCREENSHOT UYUMU) ─── */}
      <div
        style={{
          background: 'var(--bg-surface)',
          borderBottom: '1px solid var(--border-color)',
          padding: '8px 18px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button className="btn btn-secondary btn-sm" onClick={onBack} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <ArrowLeft size={14} /> Geri Dön
          </button>
          <div>
            <div style={{ fontSize: '13.5px', fontWeight: 700, color: 'var(--text-main)' }}>
              Ayarlar &gt; Belge Tasarımları &gt; <span style={{ color: primaryColor }}>{templateName}</span> (v{version})
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
              <strong>{activeTenant?.name || 'BEYOĞLU TEKNOLOJİ LTD. ŞTİ.'}</strong> firması adına işlem yapmaktasınız.
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => setIsXsltEditorOpen(true)}
            style={{ fontSize: '11.5px', display: 'flex', alignItems: 'center', gap: '4px' }}
          >
            <Code size={13} /> XSLT Görüntüle / Düzenle
          </button>

          <button
            className="btn btn-primary btn-sm"
            onClick={updateLivePreview}
            style={{ fontSize: '11.5px', display: 'flex', alignItems: 'center', gap: '4px' }}
          >
            <Eye size={13} /> Önizle
          </button>

          <button
            className="btn btn-success btn-sm"
            onClick={handleSave}
            disabled={saving}
            style={{ fontSize: '11.5px', display: 'flex', alignItems: 'center', gap: '4px' }}
          >
            <Save size={13} /> {saving ? 'Kaydediliyor...' : 'Kaydet'}
          </button>
        </div>
      </div>

      {/* ─── 2. ANA ÇALIŞMA GÖVDESİ (SOL %32 + SAĞ %68) ─── */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* ─── SOL PANEL (%32 AYARLAR & TASARIM SEÇENEKLERİ) ─── */}
        <div
          style={{
            width: '32%',
            minWidth: '340px',
            maxWidth: '420px',
            background: 'var(--bg-surface)',
            borderRight: '1px solid var(--border-color)',
            overflowY: 'auto',
            padding: '14px',
            display: 'flex',
            flexDirection: 'column',
            gap: '14px',
          }}
        >
          {/* XSLT Bilgileri Kartı */}
          <div className="card-panel" style={{ padding: '12px' }}>
            <div style={{ fontWeight: 700, fontSize: '12.5px', color: 'var(--text-main)', marginBottom: '10px', borderBottom: '1px solid var(--border-color)', paddingBottom: '4px' }}>
              XSLT Bilgileri
            </div>

            <div className="form-group" style={{ marginBottom: '8px' }}>
              <label className="form-label" style={{ fontSize: '11px', fontWeight: 700 }}>XSLT Türü</label>
              <select
                className="form-control form-control-sm"
                value={docType}
                onChange={e => setDocType(e.target.value as DocumentType)}
                disabled={!!templateId}
              >
                <option value="EFATURA">e-Fatura (UBL-TR Invoice)</option>
                <option value="EARSIV">e-Arşiv Fatura (UBL-TR)</option>
                <option value="EIRSALIYE">e-İrsaliye (UBL-TR DespatchAdvice)</option>
                <option value="ESMM">e-SMM (Serbest Meslek Makbuzu)</option>
              </select>
            </div>

            <div className="form-group" style={{ marginBottom: '8px' }}>
              <label className="form-label" style={{ fontSize: '11px', fontWeight: 700 }}>XSLT Adı</label>
              <input
                type="text"
                className="form-control form-control-sm"
                value={templateName}
                onChange={e => setTemplateName(e.target.value)}
                placeholder="Örn: general, modern_fatura"
              />
            </div>

            <div className="form-group" style={{ marginBottom: '0' }}>
              <label className="form-label" style={{ fontSize: '11px', fontWeight: 700 }}>Şablon Teması</label>
              <select
                className="form-control form-control-sm"
                value={theme}
                onChange={e => setTheme(e.target.value as any)}
              >
                <option value="MODERN">Modern (Mavi Başlık &amp; Çizgili Satırlar)</option>
                <option value="CORPORATE">Kurumsal (Koyu Lacivert &amp; Çerçeveli)</option>
                <option value="CLASSIC">Klasik (Resmi GİB Standart A4)</option>
                <option value="COMPACT">Kompakt (Az Yer Kaplayan Sıkı Tasarım)</option>
                <option value="PROFESSIONAL">Profesyonel (Zarif &amp; Şık)</option>
              </select>
            </div>
          </div>

          {/* Firma Bilgileri (Logo, Kaşe, Renk) Kartı (SCREENSHOT BİREBİR UYUM) */}
          <div className="card-panel" style={{ padding: '12px' }}>
            <div style={{ fontWeight: 700, fontSize: '12.5px', color: 'var(--text-main)', marginBottom: '10px', borderBottom: '1px solid var(--border-color)', paddingBottom: '4px' }}>
              Firma Bilgileri
            </div>

            {/* Logo */}
            <div style={{ marginBottom: '10px' }}>
              <label className="form-label" style={{ fontSize: '11px', fontWeight: 700 }}>Logo</label>
              <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                <input
                  type="file"
                  accept="image/*"
                  onChange={e => {
                    const file = e.target.files?.[0];
                    if (file) {
                      const reader = new FileReader();
                      reader.onload = () => setLogoUrl(reader.result as string);
                      reader.readAsDataURL(file);
                    }
                  }}
                  style={{ fontSize: '11px' }}
                />
              </div>
              <div style={{ fontSize: '10px', color: 'var(--danger)', marginTop: '2px', fontWeight: 600 }}>
                Logo sistemde mevcut değiştirmek için dosya seçiniz
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginTop: '6px' }}>
                <div>
                  <label style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Genişlik (1-255):</label>
                  <input
                    type="number"
                    className="form-control form-control-sm"
                    value={logoWidth}
                    onChange={e => setLogoWidth(Number(e.target.value))}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Yükseklik (1-255):</label>
                  <input
                    type="number"
                    className="form-control form-control-sm"
                    value={logoHeight}
                    onChange={e => setLogoHeight(Number(e.target.value))}
                  />
                </div>
              </div>
            </div>

            {/* Kaşe / İmza */}
            <div style={{ marginBottom: '10px', borderTop: '1px dashed var(--border-color)', paddingTop: '8px' }}>
              <label className="form-label" style={{ fontSize: '11px', fontWeight: 700 }}>Kaşe / İmza</label>
              <input
                type="file"
                accept="image/*"
                onChange={e => {
                  const file = e.target.files?.[0];
                  if (file) {
                    const reader = new FileReader();
                    reader.onload = () => setSignatureUrl(reader.result as string);
                    reader.readAsDataURL(file);
                  }
                }}
                style={{ fontSize: '11px' }}
              />

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginTop: '6px' }}>
                <div>
                  <label style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Genişlik (1-255):</label>
                  <input
                    type="number"
                    className="form-control form-control-sm"
                    value={signatureWidth}
                    onChange={e => setSignatureWidth(Number(e.target.value))}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Yükseklik (1-255):</label>
                  <input
                    type="number"
                    className="form-control form-control-sm"
                    value={signatureHeight}
                    onChange={e => setSignatureHeight(Number(e.target.value))}
                  />
                </div>
              </div>
            </div>

            {/* Tasarım Rengi */}
            <div style={{ borderTop: '1px dashed var(--border-color)', paddingTop: '8px' }}>
              <label className="form-label" style={{ fontSize: '11px', fontWeight: 700 }}>Tasarım Renk</label>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <input
                  type="color"
                  value={primaryColor}
                  onChange={e => setPrimaryColor(e.target.value)}
                  style={{ width: '40px', height: '30px', padding: 0, border: 'none', cursor: 'pointer' }}
                />
                <input
                  type="text"
                  className="form-control form-control-sm"
                  value={primaryColor}
                  onChange={e => setPrimaryColor(e.target.value)}
                  style={{ fontFamily: 'var(--font-mono)', fontSize: '11px' }}
                />
              </div>
            </div>
          </div>

          {/* Banka Bilgileri Kartı (KAYDIRMA ÇUBUĞU & ÇOKLU IBAN YÖNETİMİ) */}
          <div className="card-panel" style={{ padding: '12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontWeight: 700, fontSize: '12.5px', color: 'var(--text-main)' }}>Banka Bilgileri</span>
                <span
                  className="badge badge-info"
                  style={{ fontSize: '10px', padding: '1px 6px', fontWeight: 700 }}
                >
                  {bankAccounts.length} Hesap
                </span>
              </div>

              <div style={{ display: 'flex', gap: '4px' }}>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => setBulkIbanModalOpen(true)}
                  style={{ fontSize: '10px', padding: '2px 7px', display: 'flex', alignItems: 'center', gap: '3px' }}
                  title="Birden fazla IBAN'ı toplu yapıştırarak ekleyin"
                >
                  <Plus size={11} /> Toplu IBAN
                </button>
                {bankAccounts.length > 0 && (
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => {
                      if (confirm('Tüm kayıtlı banka hesaplarını silmek istediğinize emin misiniz?')) {
                        setBankAccounts([]);
                        showToast('Banka hesap listesi temizlendi.', 'info');
                      }
                    }}
                    style={{ fontSize: '10px', padding: '2px 6px', color: 'var(--danger)' }}
                    title="Tümünü Temizle"
                  >
                    Temizle
                  </button>
                )}
              </div>
            </div>

            {/* Kaydırma Çubuklu IBAN Tablosu Container (Scrollable Area) */}
            <div
              style={{
                maxHeight: '140px',
                overflowY: 'auto',
                overflowX: 'hidden',
                border: '1px solid var(--border-color)',
                borderRadius: 'var(--radius-sm)',
                marginBottom: '10px',
                background: 'var(--bg-surface)',
                scrollbarWidth: 'thin',
              }}
            >
              {bankAccounts.length === 0 ? (
                <div style={{ padding: '14px', textAlign: 'center', fontSize: '11px', color: 'var(--text-muted)' }}>
                  Kayıtlı banka hesabı yok. Aşağıdaki alandan ekleyebilirsiniz.
                </div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
                  <thead style={{ position: 'sticky', top: 0, zIndex: 2, background: 'var(--bg-surface-secondary)' }}>
                    <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                      <th style={{ textAlign: 'left', padding: '5px 8px', fontSize: '10.5px' }}>Banka</th>
                      <th style={{ textAlign: 'center', padding: '5px 4px', width: '45px', fontSize: '10.5px' }}>Döviz</th>
                      <th style={{ textAlign: 'left', padding: '5px 8px', fontSize: '10.5px' }}>IBAN</th>
                      <th style={{ textAlign: 'center', padding: '5px 4px', width: '35px', fontSize: '10.5px' }}>Sil</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bankAccounts.map((b, idx) => (
                      <tr
                        key={idx}
                        style={{
                          borderBottom: '1px solid var(--border-color)',
                          background: idx % 2 === 0 ? 'var(--bg-surface)' : 'var(--bg-surface-secondary)',
                        }}
                      >
                        <td style={{ padding: '5px 8px', fontWeight: 600, fontSize: '11px', whiteSpace: 'nowrap' }}>
                          {b.bankName}
                        </td>
                        <td style={{ padding: '5px 4px', textAlign: 'center', fontSize: '10px' }}>
                          <span
                            className="badge"
                            style={{
                              background: b.currency === 'TRY' ? '#e0f2fe' : b.currency === 'USD' ? '#dcfce7' : '#fef3c7',
                              color: b.currency === 'TRY' ? '#0369a1' : b.currency === 'USD' ? '#15803d' : '#b45309',
                              fontSize: '9.5px',
                              padding: '1px 4px',
                            }}
                          >
                            {b.currency}
                          </span>
                        </td>
                        <td style={{ padding: '5px 8px', fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--text-main)' }}>
                          {b.iban}
                        </td>
                        <td style={{ padding: '5px 4px', textAlign: 'center' }}>
                          <button
                            type="button"
                            onClick={() => handleRemoveBankRow(idx)}
                            style={{ border: 'none', background: 'transparent', color: 'var(--danger)', cursor: 'pointer', padding: '2px' }}
                            title="Hesabı Sil"
                          >
                            <Trash2 size={12} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* Yeni IBAN Ekleme Formu */}
            <div style={{ background: 'var(--bg-surface-secondary)', padding: '10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)' }}>
              <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--primary)', marginBottom: '6px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>+ Yeni IBAN Ekle</span>
                <span style={{ fontSize: '9.5px', color: 'var(--text-muted)', fontWeight: 500 }}>TR IBAN Standardı</span>
              </div>

              {/* Banka & Döviz Seçimi */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 75px', gap: '6px', marginBottom: '6px' }}>
                <select
                  className="form-control form-control-sm"
                  value={selectedPresetBank}
                  onChange={e => setSelectedPresetBank(e.target.value)}
                  style={{ fontSize: '11px', fontWeight: 600 }}
                >
                  {POPULAR_BANKS.map(bank => (
                    <option key={bank} value={bank}>{bank}</option>
                  ))}
                </select>

                <select
                  className="form-control form-control-sm"
                  value={newBankCurrency}
                  onChange={e => setNewBankCurrency(e.target.value)}
                  style={{ fontSize: '11px', fontWeight: 700 }}
                >
                  <option value="TRY">TRY (₺)</option>
                  <option value="USD">USD ($)</option>
                  <option value="EUR">EUR (€)</option>
                  <option value="GBP">GBP (£)</option>
                  <option value="CHF">CHF</option>
                </select>
              </div>

              {/* Özel Banka Adı (Eğer Diğer Seçilmişse) */}
              {selectedPresetBank === 'Diğer (Özel Banka Adı)' && (
                <div style={{ marginBottom: '6px' }}>
                  <input
                    type="text"
                    className="form-control form-control-sm"
                    placeholder="Banka Adını Yazın (Örn: QNB, Odeabank...)"
                    value={customBankName}
                    onChange={e => setCustomBankName(e.target.value)}
                    style={{ fontSize: '11px' }}
                  />
                </div>
              )}

              {/* IBAN Numarası ve Ekle Butonu */}
              <div style={{ display: 'flex', gap: '6px' }}>
                <input
                  type="text"
                  className="form-control form-control-sm"
                  placeholder="TR__ ____ ____ ____ ____ ____ __"
                  value={newBankIban}
                  onChange={e => setNewBankIban(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddBankRow();
                    }
                  }}
                  style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', letterSpacing: '0.5px' }}
                />
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={handleAddBankRow}
                  style={{ fontSize: '11px', padding: '3px 12px', fontWeight: 700, whiteSpace: 'nowrap' }}
                >
                  Ekle
                </button>
              </div>
            </div>
          </div>

          {/* Sütun & Alan Görünürlüğü */}
          <div className="card-panel" style={{ padding: '12px' }}>
            <div style={{ fontWeight: 700, fontSize: '12.5px', color: 'var(--text-main)', marginBottom: '8px' }}>
              Fatura Kalem Sütunları
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', fontSize: '11px' }}>
              {[
                { k: 'showLineNumber', l: 'Sıra No' },
                { k: 'showProductCode', l: 'Ürün Kodu' },
                { k: 'showBarcode', l: 'Barkod' },
                { k: 'showDescription', l: 'Açıklama' },
                { k: 'showQuantity', l: 'Miktar' },
                { k: 'showUnit', l: 'Birim' },
                { k: 'showUnitPrice', l: 'Birim Fiyat' },
                { k: 'showDiscount', l: 'İskonto' },
                { k: 'showVatRate', l: 'KDV Oranı' },
                { k: 'showVatAmount', l: 'KDV Tutarı' },
                { k: 'showLineTotal', l: 'Satır Tutarı' },
              ].map(({ k, l }) => (
                <label key={k} style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={(columns as any)[k]}
                    onChange={e => setColumns(prev => ({ ...prev, [k]: e.target.checked }))}
                  />
                  <span>{l}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Notlar & Alt Bilgi */}
          <div className="card-panel" style={{ padding: '12px' }}>
            <div style={{ fontWeight: 700, fontSize: '12.5px', color: 'var(--text-main)', marginBottom: '8px' }}>
              Notlar &amp; Koşullar
            </div>
            <div className="form-group" style={{ marginBottom: '8px' }}>
              <label style={{ fontSize: '10.5px', fontWeight: 600 }}>Belge Notu</label>
              <textarea
                className="form-control form-control-sm"
                rows={2}
                value={notes}
                onChange={e => setNotes(e.target.value)}
                style={{ fontSize: '11px' }}
              />
            </div>
            <div className="form-group" style={{ marginBottom: '0' }}>
              <label style={{ fontSize: '10.5px', fontWeight: 600 }}>Ödeme Koşulları</label>
              <input
                type="text"
                className="form-control form-control-sm"
                value={paymentTerms}
                onChange={e => setPaymentTerms(e.target.value)}
                style={{ fontSize: '11px' }}
              />
            </div>
          </div>
        </div>

        {/* ─── SAĞ PANEL (%68 CANLI A4 BELGE ÖNİZLEME) ─── */}
        {/* 2026-09-13 — Bu panel DESIGNER-CANVAS'tır: masaüstü zemini + beyaz kağıt
            basılan A4'ü simüle eder. Kağıdın kendisi (#ffffff) DOCUMENT'tır ve
            korunur; zemin ise uygulama temasına bağlanır. */}
        <div
          style={{
            flex: 1,
            background: 'var(--bg-surface-secondary)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          {/* Zoom & Araç Çubuğu */}
          <div
            style={{
              background: 'var(--bg-surface)',
              borderBottom: '1px solid var(--border-color)',
              padding: '6px 14px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600 }}>Önizleme Ölçeği:</span>
              {[50, 75, 100, 125, 150].map(z => (
                <button
                  key={z}
                  className={`btn btn-sm ${zoomLevel === z ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => setZoomLevel(z)}
                  style={{ fontSize: '10.5px', padding: '2px 7px', height: '22px' }}
                >
                  %{z}
                </button>
              ))}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => setCustomXmlModalOpen(true)}
                style={{ fontSize: '11px', padding: '2px 8px', height: '24px' }}
              >
                XML Verisini İncele / Değiştir
              </button>
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => {
                  const iframe = document.getElementById('designer-preview-frame') as HTMLIFrameElement;
                  iframe?.contentWindow?.print();
                }}
                style={{ fontSize: '11px', padding: '2px 8px', height: '24px' }}
              >
                <Printer size={12} /> Yazdır
              </button>
            </div>
          </div>

          {/* A4 Canvas Gösterim Alanı */}
          <div
            style={{
              flex: 1,
              overflow: 'auto',
              padding: '24px',
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'flex-start',
            }}
          >
            <div
              style={{
                width: '820px',
                minHeight: '1140px',
                // 2026-09-13 — '#ffffff' DOCUMENT: bu beyaz yüzey basılan A4 kağıdıdır.
                background: '#ffffff',
                boxShadow: '0 8px 30px rgba(0,0,0,0.12)',
                borderRadius: 'var(--radius-xs)',
                transform: `scale(${zoomLevel / 100})`,
                transformOrigin: 'top center',
                transition: 'transform 0.15s ease',
                overflow: 'hidden',
              }}
            >
              <iframe
                id="designer-preview-frame"
                srcDoc={previewHtml}
                style={{
                  width: '100%',
                  height: '1140px',
                  border: 'none',
                  display: 'block',
                }}
                title="A4 Live Canvas"
              />
            </div>
          </div>
        </div>
      </div>

      {/* ─── 3. SABİT ALT BUTON ÇUBUĞU (SCREENSHOT BİREBİR UYUM) ─── */}
      <div
        style={{
          background: 'var(--bg-surface)',
          borderTop: '1px solid var(--border-color)',
          padding: '8px 18px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            className="btn btn-primary"
            onClick={updateLivePreview}
            style={{
              // 2026-09-13: '#0284c7' (mavi) kaldırıldı — buton artık marka token'ı.
              fontWeight: 700,
              fontSize: '12.5px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '7px 18px',
            }}
          >
            <Eye size={15} /> Önizle
          </button>

          <button
            className="btn btn-success"
            onClick={handleSave}
            disabled={saving}
            style={{
              // 2026-09-13: '#16a34a' kaldırıldı — .btn-success token'ı kullanılır.
              fontWeight: 700,
              fontSize: '12.5px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '7px 18px',
            }}
          >
            <Save size={15} /> {saving ? 'Kaydediliyor...' : 'Kaydet'}
          </button>
        </div>

        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => setIsXsltEditorOpen(true)}
            style={{ fontSize: '11.5px', display: 'flex', alignItems: 'center', gap: '4px' }}
          >
            <Code size={13} /> XSLT Görüntüle
          </button>
          <a
            href={templateId ? `/api/document-templates/${templateId}/xslt?download=true` : '#'}
            className="btn btn-secondary btn-sm"
            style={{ fontSize: '11.5px', display: 'flex', alignItems: 'center', gap: '4px', textDecoration: 'none' }}
          >
            <Download size={13} /> XSLT İndir
          </a>
          <button className="btn btn-secondary btn-sm" onClick={onBack} style={{ fontSize: '11.5px' }}>
            Geri Dön
          </button>
        </div>
      </div>

      {/* ─── XSLT KAYNAK KOD DÜZENLEME MODALI ─── */}
      {isXsltEditorOpen && (
        <Modal
          isOpen={isXsltEditorOpen}
          onClose={() => setIsXsltEditorOpen(false)}
          title={`XSLT 1.0 Kaynak Kod Editörü: ${templateName}`}
          size="large"
          footer={
            <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
              <button
                className="btn btn-secondary btn-sm"
                onClick={async () => {
                  const val = await api.validateXslt(rawXsltCode);
                  if (val.valid) showToast('✓ XSLT XML sözdizimi geçerli!', 'success');
                  else showToast(`XSLT Hatası: ${val.error}`, 'error');
                }}
              >
                <CheckCircle2 size={13} /> XSLT Doğrula
              </button>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button className="btn btn-secondary btn-sm" onClick={() => setIsXsltEditorOpen(false)}>
                  Kapat
                </button>
                <button
                  className="btn btn-primary btn-sm"
                  onClick={() => {
                    setIsXsltEditorOpen(false);
                    updateLivePreview();
                    showToast('XSLT kod değişiklikleri uygulandı.', 'success');
                  }}
                >
                  Uygula
                </button>
              </div>
            </div>
          }
        >
          {/* 2026-09-26: Dosyadan yükleme sekmesi. Uzun şablonları (3500 satır)
              kopyala-yapıştır ile taşımak kullanılamazdı. */}
          <div style={{ display: 'flex', gap: '4px', borderBottom: '1px solid var(--border-color)', marginBottom: '10px' }}>
            {([
              { id: 'code' as const, label: 'Kodu Düzenle', icon: <Code size={13} /> },
              { id: 'upload' as const, label: 'Dosya Yükle', icon: <Upload size={13} /> },
            ]).map(t => (
              <button
                key={t.id}
                className="btn btn-sm"
                onClick={() => setXsltEditorTab(t.id)}
                style={{
                  fontSize: '11.5px', display: 'flex', alignItems: 'center', gap: '5px',
                  padding: '6px 13px', borderRadius: 'var(--radius-sm) var(--radius-sm) 0 0',
                  background: xsltEditorTab === t.id ? 'var(--primary-light)' : 'transparent',
                  color: xsltEditorTab === t.id ? 'var(--primary)' : 'var(--text-muted)',
                  fontWeight: xsltEditorTab === t.id ? 700 : 500,
                  borderBottom: xsltEditorTab === t.id ? '2px solid var(--primary)' : '2px solid transparent',
                }}
              >
                {t.icon} {t.label}
              </button>
            ))}
          </div>

          {xsltEditorTab === 'upload' ? (
            <XsltUploadPanel
              mode="editor"
              currentContent={rawXsltCode}
              onValidate={async (content: string) => {
                const res = await api.validateXslt(content);
                return { valid: res.valid, message: res.message, error: res.error };
              }}
              onSave={async (content: string) => {
                // Tasarımcıda yükleme = kodu yükleyip önizlemeyi tazelemek.
                // Kalıcı sürüm kaydı, "Kaydet" ile tasarım kaydedilince oluşur.
                setRawXsltCode(content);
                setXsltEditorTab('code');
                setIsXsltEditorOpen(false);
                updateLivePreview();
                showToast('XSLT dosyası yüklendi ve önizlemeye uygulandı.', 'success');
              }}
            />
          ) : (
            <textarea
              className="form-control"
              value={rawXsltCode}
              onChange={e => setRawXsltCode(e.target.value)}
              rows={22}
              style={{
                fontFamily: 'Consolas, Monaco, "Courier New", monospace',
                fontSize: 'var(--fs-xs)',
                background: 'var(--bg-surface-secondary)',
                color: 'var(--text-main)',
                border: '1px solid var(--border-color)',
                padding: '12px',
                borderRadius: 'var(--radius-sm)',
              }}
            />
          )}
        </Modal>
      )}

      {/* ─── ÖRNEK XML VERİSİ DEĞİŞTİRME MODALI ─── */}
      {customXmlModalOpen && (
        <Modal
          isOpen={customXmlModalOpen}
          onClose={() => setCustomXmlModalOpen(false)}
          title="UBL-TR Test XML Verisi"
          size="large"
          footer={
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', width: '100%' }}>
              <button className="btn btn-secondary btn-sm" onClick={() => setCustomXmlModalOpen(false)}>
                İptal
              </button>
              <button
                className="btn btn-primary btn-sm"
                onClick={() => {
                  setSampleXml(customXmlText);
                  setCustomXmlModalOpen(false);
                  showToast('Test XML verisi güncellendi.', 'success');
                }}
              >
                XML Verisini Uygula
              </button>
            </div>
          }
        >
          <textarea
            className="form-control"
            value={customXmlText}
            onChange={e => setCustomXmlText(e.target.value)}
            rows={20}
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 'var(--fs-xs)',
              background: 'var(--bg-surface-secondary)',
              color: 'var(--text-main)',
              border: '1px solid var(--border-color)',
              borderRadius: 'var(--radius-sm)',
              padding: '10px',
            }}
          />
        </Modal>
      )}

      {/* ─── TOPLU IBAN EKLEME MODALI ─── */}
      {bulkIbanModalOpen && (
        <Modal
          isOpen={bulkIbanModalOpen}
          onClose={() => setBulkIbanModalOpen(false)}
          title="Toplu IBAN Ekle"
          size="medium"
          footer={
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                Her satıra bir IBAN veya <code>Banka - Döviz - IBAN</code> formatında yazın
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button className="btn btn-secondary btn-sm" onClick={() => setBulkIbanModalOpen(false)}>
                  İptal
                </button>
                <button className="btn btn-primary btn-sm" onClick={handleBulkIbanAdd}>
                  + IBAN'ları Listeye Aktar
                </button>
              </div>
            </div>
          }
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div style={{ fontSize: '12px', color: 'var(--text-main)', lineHeight: 1.5 }}>
              Aşağıdaki alana birden fazla banka IBAN bilgisini her satıra bir adet gelecek şekilde yapıştırabilirsiniz.
            </div>

            <div style={{ background: 'var(--bg-surface-secondary)', padding: '10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)', fontSize: 'var(--fs-xs)' }}>
              <div style={{ fontWeight: 700, color: 'var(--primary)', marginBottom: '4px' }}>Desteklenen Format Örnekleri:</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '10.5px', color: 'var(--text-muted)' }}>
                Garanti BBVA - TRY - TR33 0006 2000 0001 2345 6789 01<br />
                İş Bankası - USD - TR66 0006 4000 0009 8765 4321 02<br />
                Yapı Kredi - EUR - TR12 0006 7000 0000 1234 5678 99<br />
                TR44 0001 0000 0012 3456 7890 03
              </div>
            </div>

            <textarea
              className="form-control"
              rows={8}
              placeholder={`Garanti BBVA - TRY - TR33 0006 2000 0001 2345 6789 01\nZiraat Bankası - TRY - TR12 0001 0000 0012 3456 7890 02\nAkbank - USD - TR55 0004 6000 0001 2345 6789 03`}
              value={bulkIbanText}
              onChange={e => setBulkIbanText(e.target.value)}
              style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', lineHeight: 1.5 }}
            />
          </div>
        </Modal>
      )}
    </div>
  );
};

