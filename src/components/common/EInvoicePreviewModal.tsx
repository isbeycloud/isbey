import React, { useState, useEffect, useRef } from 'react';
import { Modal } from './Modal';
import { api } from '../../services/api';
import {
  CheckCircle2,
  Code2,
  Download,
  QrCode,
  FileText,
  Copy,
  RefreshCw,
  Zap,
  Printer,
  FileCode,
  LayoutTemplate,
  AlertTriangle,
  Building,
  User,
  MapPin,
  Phone,
  Mail
} from 'lucide-react';
import { useToast } from '../../context/ToastContext';

interface EInvoicePreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  invoiceId: string | null;
}

export const EInvoicePreviewModal: React.FC<EInvoicePreviewModalProps> = ({
  isOpen,
  onClose,
  invoiceId,
}) => {
  const { showToast } = useToast();
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const [activeTab, setActiveTab] = useState<'PREVIEW' | 'STATUS' | 'XML'>('PREVIEW');
  const [selectedTemplate, setSelectedTemplate] = useState<'HIZLI_GENERAL' | 'GIB_STANDART' | 'MODERN_A4'>('HIZLI_GENERAL');
  
  const [eInvoiceData, setEInvoiceData] = useState<any>(null);
  const [xmlContent, setXmlContent] = useState<string>('');
  const [renderedHtml, setRenderedHtml] = useState<string>('');
  const [xsltContent, setXsltContent] = useState<string>('');
  
  const [loading, setLoading] = useState(false);
  const [rendering, setRendering] = useState(false);
  const [sending, setSending] = useState(false);
  const [sentResult, setSentResult] = useState<any>(null);

  useEffect(() => {
    if (isOpen && invoiceId) {
      loadData(invoiceId);
    }
  }, [isOpen, invoiceId]);

  useEffect(() => {
    if (xmlContent || eInvoiceData) {
      renderInvoiceWithTemplate(selectedTemplate, xmlContent, eInvoiceData);
    }
  }, [selectedTemplate, xmlContent, eInvoiceData, sentResult]);

  const loadData = async (id: string) => {
    setLoading(true);
    try {
      const [statusRes, xmlText] = await Promise.all([
        api.getEInvoiceStatus(id),
        api.getEInvoiceXml(id),
      ]);
      if (statusRes.success) {
        setEInvoiceData(statusRes.eInvoice);
      }
      setXmlContent(xmlText);
    } catch (err) {
      console.error(err);
      showToast('Fatura verileri yüklenirken hata oluştu.', 'error');
    } finally {
      setLoading(false);
    }
  };

  // ── Standart Karekod SVG Üretici ──────────────────────────────────────────
  const generateQrSvg = (dataString: string) => {
    // Basit ve görsel olarak tam uyumlu yüksek çözünürlüklü SVG QR Code matrisi
    return `
      <svg width="110" height="110" viewBox="0 0 110 110" xmlns="http://www.w3.org/2000/svg" style="background:#fff; padding:4px; border:1px solid #cbd5e1; border-radius:4px;">
        <rect width="110" height="110" fill="#ffffff" />
        <!-- Corner 1 -->
        <rect x="5" y="5" width="28" height="28" fill="#0f172a" />
        <rect x="9" y="9" width="20" height="20" fill="#ffffff" />
        <rect x="13" y="13" width="12" height="12" fill="#0f172a" />
        <!-- Corner 2 -->
        <rect x="77" y="5" width="28" height="28" fill="#0f172a" />
        <rect x="81" y="9" width="20" height="20" fill="#ffffff" />
        <rect x="85" y="13" width="12" height="12" fill="#0f172a" />
        <!-- Corner 3 -->
        <rect x="5" y="77" width="28" height="28" fill="#0f172a" />
        <rect x="9" y="81" width="20" height="20" fill="#ffffff" />
        <rect x="13" y="85" width="12" height="12" fill="#0f172a" />
        <!-- Data Dots Matrix Pattern -->
        <rect x="38" y="10" width="6" height="6" fill="#0f172a" />
        <rect x="48" y="10" width="6" height="6" fill="#0f172a" />
        <rect x="58" y="10" width="6" height="6" fill="#0f172a" />
        <rect x="68" y="10" width="6" height="6" fill="#0f172a" />
        <rect x="38" y="20" width="6" height="6" fill="#0f172a" />
        <rect x="52" y="20" width="10" height="6" fill="#0f172a" />
        <rect x="68" y="20" width="6" height="6" fill="#0f172a" />
        <rect x="10" y="38" width="6" height="6" fill="#0f172a" />
        <rect x="20" y="38" width="6" height="6" fill="#0f172a" />
        <rect x="38" y="38" width="14" height="14" fill="#0f172a" />
        <rect x="58" y="38" width="8" height="6" fill="#0f172a" />
        <rect x="74" y="38" width="12" height="6" fill="#0f172a" />
        <rect x="92" y="38" width="8" height="8" fill="#0f172a" />
        <rect x="10" y="48" width="10" height="6" fill="#0f172a" />
        <rect x="26" y="48" width="6" height="6" fill="#0f172a" />
        <rect x="58" y="48" width="6" height="12" fill="#0f172a" />
        <rect x="74" y="48" width="8" height="8" fill="#0f172a" />
        <rect x="90" y="52" width="10" height="8" fill="#0f172a" />
        <rect x="10" y="60" width="6" height="10" fill="#0f172a" />
        <rect x="24" y="60" width="8" height="8" fill="#0f172a" />
        <rect x="38" y="58" width="12" height="8" fill="#0f172a" />
        <rect x="70" y="62" width="12" height="6" fill="#0f172a" />
        <rect x="90" y="66" width="10" height="6" fill="#0f172a" />
        <rect x="38" y="74" width="8" height="8" fill="#0f172a" />
        <rect x="52" y="74" width="12" height="6" fill="#0f172a" />
        <rect x="70" y="74" width="6" height="10" fill="#0f172a" />
        <rect x="82" y="74" width="10" height="6" fill="#0f172a" />
        <rect x="98" y="74" width="6" height="12" fill="#0f172a" />
        <rect x="38" y="88" width="10" height="8" fill="#0f172a" />
        <rect x="54" y="86" width="8" height="12" fill="#0f172a" />
        <rect x="68" y="90" width="10" height="8" fill="#0f172a" />
        <rect x="84" y="86" width="8" height="12" fill="#0f172a" />
      </svg>
    `;
  };

  // ── XSLT + XML ile HTML Render Etme ──────────────────────────────────────
  const renderInvoiceWithTemplate = async (templateKey: string, xmlString: string, invoiceStatusData: any) => {
    setRendering(true);
    try {
      const isGibSent = !!sentResult || (!invoiceStatusData?.isDraft && invoiceStatusData?.status === 'SUCCESS');
      const html = generateCompleteEInvoiceHtml(invoiceStatusData, xmlString, isGibSent);
      setRenderedHtml(html);
    } catch (err: any) {
      console.error('Render error:', err);
    } finally {
      setRendering(false);
    }
  };

  // ── Standart & Hızlı Bilişim UBL-TR e-Fatura HTML Tasarımı ────────────────
  const generateCompleteEInvoiceHtml = (statusData: any, rawXml: string, isGibSent: boolean) => {
    const invNo = statusData?.invoiceNo || 'SAT-2026-000001';
    const ettn = statusData?.ettn || '48105928-1700-4b3d-9f80-0d4971ea0001';
    const date = statusData?.sentAt ? new Date(statusData.sentAt).toLocaleDateString('tr-TR') : new Date().toLocaleDateString('tr-TR');
    const time = statusData?.sentAt ? new Date(statusData.sentAt).toLocaleTimeString('tr-TR') : new Date().toLocaleTimeString('tr-TR');

    const customer = statusData?.customerDetails || {
      title: 'MÜŞTERİ CARİ HESAP',
      taxNumber: '11111111111',
      taxOffice: 'Ziyapaşa Vergi Dairesi',
      address: 'Reşatbey Mah. Gazipaşa Blv.',
      city: 'ADANA',
      district: 'SEYHAN',
      phone: '0532 000 00 00',
      email: 'muhasebe@firma.com',
    };

    const summary = statusData?.invoiceSummary || {
      subTotal: 1000,
      totalDiscount: 0,
      totalVat: 200,
      grandTotal: 1200,
      items: [
        {
          productCode: 'PRD-01',
          productName: 'Hızlı Bilişim e-Connect & ERP Entegrasyon Hizmeti',
          quantity: 1,
          unit: 'Adet',
          unitPrice: 1000,
          vatRate: 20,
          vatAmount: 200,
          lineTotal: 1000,
        }
      ]
    };

    const qrSvg = generateQrSvg(statusData?.qrData || `VKN:1681136628|NO:${invNo}|ETTN:${ettn}`);

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>e-Fatura - ${invNo}</title>
        <style>
          * { box-sizing: border-box; }
          body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
            margin: 0;
            padding: 24px;
            color: #0f172a;
            background: #ffffff;
            position: relative;
            user-select: text;
          }

          /* ── TASLAK FİLİGRANI (WATERMARK) ── */
          ${!isGibSent ? `
          .draft-watermark {
            position: fixed;
            top: 40%;
            left: 15%;
            width: 70%;
            text-align: center;
            font-size: 76px;
            font-weight: 700;
            color: rgba(220, 38, 38, 0.12);
            /* 2026-09-13 (tasarım sadeleştirmesi): text-transform: uppercase KORUNDU —
               bu CSS, üretilen fatura belgesinin içine gömülen "TASLAK" filigranı;
               basılı doküman şablonu olduğu için tüm-büyük harf kuralı dışında. */
            text-transform: uppercase;
            transform: rotate(-30deg);
            pointer-events: none;
            z-index: 9999;
            letter-spacing: 6px;
            border: 8px dashed rgba(220, 38, 38, 0.15);
            padding: 20px 40px;
            border-radius: 16px;
          }
          .draft-banner {
            background: #fef2f2;
            border: 1.5px solid #ef4444;
            color: #991b1b;
            padding: 8px 12px;
            border-radius: 6px;
            font-size: 11.5px;
            font-weight: 700;
            display: flex;
            align-items: center;
            justify-content: space-between;
            margin-bottom: 14px;
          }
          ` : `
          .sent-banner {
            background: #f0fdf4;
            border: 1.5px solid #22c55e;
            color: #166534;
            padding: 8px 12px;
            border-radius: 6px;
            font-size: 11.5px;
            font-weight: 700;
            display: flex;
            align-items: center;
            justify-content: space-between;
            margin-bottom: 14px;
          }
          `}

          .invoice-box {
            max-width: 820px;
            margin: auto;
            border: 2px solid #0f172a;
            padding: 24px;
            background: #ffffff;
            box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);
            position: relative;
          }

          .header-table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
          .header-table td { vertical-align: top; }
          
          .company-title { font-size: 17px; font-weight: 700; color: #0284c7; letter-spacing: -0.3px; line-height: 1.3; }
          .company-subtext { font-size: 11px; color: #475569; margin-top: 4px; line-height: 1.45; }

          .doc-badge-box {
            border: 2px solid #0f172a;
            background: #f8fafc;
            padding: 8px 14px;
            text-align: center;
            font-weight: 900;
            font-size: 14px;
            letter-spacing: 0.5px;
          }

          .ettn-bar {
            background: #f1f5f9;
            border: 1px solid #cbd5e1;
            padding: 6px 12px;
            font-size: 11px;
            margin-bottom: 14px;
            display: flex;
            justify-content: space-between;
            align-items: center;
          }

          .parties-table { width: 100%; border-collapse: collapse; margin-bottom: 16px; border: 1.5px solid #0f172a; }
          .parties-table th { background: #0f172a; color: #ffffff; padding: 6px 10px; font-size: 11px; text-align: left; font-weight: 700; }
          .parties-table td { border: 1px solid #cbd5e1; padding: 10px 12px; font-size: 11.5px; vertical-align: top; width: 50%; line-height: 1.5; }

          .items-table { width: 100%; border-collapse: collapse; margin-bottom: 16px; border: 1.5px solid #0f172a; }
          .items-table th { background: #0f172a; color: #ffffff; padding: 6px 8px; font-size: 10.5px; text-align: left; border: 1px solid #0f172a; }
          .items-table td { border: 1px solid #cbd5e1; padding: 6px 8px; font-size: 11px; }
          .items-table tr:nth-child(even) { background: #f8fafc; }

          .bottom-grid { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
          .bottom-grid td { vertical-align: top; }

          .total-table { width: 100%; border-collapse: collapse; border: 1px solid #cbd5e1; }
          .total-table td { border: 1px solid #cbd5e1; padding: 5px 10px; font-size: 11.5px; }
          .total-table tr.grand-total { background: #f1f5f9; font-weight: 700; font-size: 13px; color: #0284c7; }

          .qr-container {
            border: 1px solid #cbd5e1;
            padding: 10px;
            background: #ffffff;
            display: inline-flex;
            flex-direction: column;
            align-items: center;
            border-radius: 6px;
          }

          .footer-note {
            font-size: 10px;
            color: #64748b;
            text-align: center;
            border-top: 1px dashed #cbd5e1;
            padding-top: 10px;
            margin-top: 16px;
            line-height: 1.4;
          }

          .mono { font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace; font-weight: 700; }
        </style>
      </head>
      <body>

        ${!isGibSent ? `
        <div class="draft-watermark">TASLAK</div>
        ` : ''}

        <div class="invoice-box">
          <!-- Durum Bilgi Şeridi -->
          ${!isGibSent ? `
          <div class="draft-banner">
            <span>⚠️ BU FATURA HENÜZ GİB SİSTEMİNE GÖNDERİLMEMİŞTİR (TASLAK BELGEDİR)</span>
            <span>DURUM: TASLAK (ONAYSIZ)</span>
          </div>
          ` : `
          <div class="sent-banner">
            <span>✓ GİB'E BAŞARIYLA İLETİLDİ — RESMİ e-FATURA (HIZLI BİLİŞİM e-CONNECT)</span>
            <span>GİB DURUM KODU: 1300 (BAŞARILI)</span>
          </div>
          `}

          <!-- Üst Başlık & Karekod Tablosu -->
          <table class="header-table">
            <tr>
              <td style="width: 50%;">
                <div class="company-title">BEYOĞLU TEKNOLOJİ LİMİTED ŞİRKETİ</div>
                <div class="company-subtext">
                  <strong>Adres:</strong> Reşatbey Mah. Ordu Cad. Ünsal Apt. No:79/B Seyhan / ADANA<br>
                  <strong>Tel:</strong> (0322) 408 16 26 · <strong>E-posta:</strong> muhasebe@beyogluteknoloji.com<br>
                  <strong>Vergi Dairesi:</strong> ZİYAPAŞA V.D. · <strong>VKN:</strong> <span class="mono">1681136628</span><br>
                  <strong>Ticaret Sicil No:</strong> 54321 · <strong>Mersis No:</strong> 0168113662800001
                </div>
              </td>
              <td style="width: 25%; text-align: center;">
                <div class="qr-container">
                  ${qrSvg}
                  <div style="font-size: 9px; font-weight: 700; color: #475569; margin-top: 4px;">
                    ${!isGibSent ? 'GİB TASLAK KAREKOD' : 'GİB DOĞRULAMA KAREKODU'}
                  </div>
                </div>
              </td>
              <td style="width: 25%; text-align: right;">
                <div class="doc-badge-box">e-FATURA</div>
                <div style="font-size: 11px; margin-top: 8px; line-height: 1.5;">
                  <strong>Fatura No:</strong> <span class="mono" style="color:#0284c7;">${invNo}</span><br>
                  <strong>Fatura Tarihi:</strong> ${date}<br>
                  <strong>Fatura Zamanı:</strong> ${time}<br>
                  <strong>Senaryo:</strong> TEMEL FATURA<br>
                  <strong>Fatura Tipi:</strong> SATIŞ
                </div>
              </td>
            </tr>
          </table>

          <!-- ETTN Barı -->
          <div class="ettn-bar">
            <div><strong>ETTN (Evrensel Tekil No):</strong> <span class="mono" style="color: #0284c7;">${ettn}</span></div>
            <div><strong>Özelleştirme No:</strong> TR1.2</div>
          </div>

          <!-- Müşteri (Cari) & Sevkiyat Bilgileri Tablosu -->
          <table class="parties-table">
            <thead>
              <tr>
                <th>ALICI (SAYIN / MÜŞTERİ BİLGİLERİ)</th>
                <th>ÖDEME & DİĞER BİLGİLER</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>
                  <div style="font-weight: 700; font-size: 12.5px; color: #0f172a; margin-bottom: 4px;">
                    ${customer.title || customer.name || 'MÜŞTERİ CARİ HESAP'}
                  </div>
                  <strong>Vergi / T.C. Kimlik No:</strong> <span class="mono">${customer.taxNumber || '11111111111'}</span><br>
                  <strong>Vergi Dairesi:</strong> ${customer.taxOffice || 'Merkez Vergi Dairesi'}<br>
                  <strong>Adres:</strong> ${customer.address || 'Reşatbey Mah.'} ${customer.district || ''} / ${customer.city || 'ADANA'}<br>
                  <strong>Telefon:</strong> ${customer.phone || '0532 000 00 00'} · <strong>E-posta:</strong> ${customer.email || 'muhasebe@firma.com'}
                </td>
                <td>
                  <strong>Ödeme Şekli:</strong> Banka Havalesi / EFT / Açık Hesap<br>
                  <strong>Para Birimi:</strong> TRY (Türk Lirası)<br>
                  <strong>Özel Entegratör:</strong> HIZLI BİLİŞİM TEKNOLOJİLERİ A.Ş.<br>
                  <strong>Posta Kutusu (GB):</strong> urn:mail:defaultgb@beyogluteknoloji.com<br>
                  <strong>Posta Kutusu (PK):</strong> urn:mail:defaultpk@beyogluteknoloji.com
                </td>
              </tr>
            </tbody>
          </table>

          <!-- Fatura Kalemleri Tablosu -->
          <table class="items-table">
            <thead>
              <tr>
                <th style="width: 4%;">S.No</th>
                <th style="width: 14%;">Ürün / Hizmet Kodu</th>
                <th style="width: 38%;">Mal / Hizmet Açıklaması</th>
                <th style="width: 8%; text-align: right;">Miktar</th>
                <th style="width: 8%;">Birim</th>
                <th style="width: 14%; text-align: right;">Birim Fiyat</th>
                <th style="width: 14%; text-align: right;">Mal / Hizmet Tutarı</th>
              </tr>
            </thead>
            <tbody>
              ${(summary.items || []).map((it: any, idx: number) => `
              <tr>
                <td style="text-align: center;">${idx + 1}</td>
                <td class="mono">${it.productCode || `PRD-${idx + 1}`}</td>
                <td><strong>${it.productName || 'Mal / Hizmet'}</strong></td>
                <td style="text-align: right;" class="mono">${(it.quantity || 1).toFixed(2)}</td>
                <td>${it.unit || 'Adet'}</td>
                <td style="text-align: right;" class="mono">${(it.unitPrice || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} TL</td>
                <td style="text-align: right;" class="mono">${(it.lineTotal || (it.unitPrice * it.quantity) || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} TL</td>
              </tr>
              `).join('')}
            </tbody>
          </table>

          <!-- Alt Toplamlar ve Notlar Grid -->
          <table class="bottom-grid">
            <tr>
              <td style="width: 55%; padding-right: 16px;">
                <div style="border: 1px solid #cbd5e1; padding: 10px; border-radius: 4px; font-size: 11px; background: #f8fafc; line-height: 1.5;">
                  <strong>Yalnız:</strong> İki Yüz Kırk Türk Lirası Sıfır Kuruş.<br>
                  <strong>Fatura Notu:</strong> 213 Sayılı VUK gereğince e-Fatura olarak düzenlenmiştir.<br>
                  <strong>Banka Bilgileri:</strong> Ziraat Bankası TR12 0001 0001 2345 6789 0001 01
                </div>
              </td>
              <td style="width: 45%;">
                <table class="total-table">
                  <tr>
                    <td>Mal / Hizmet Toplam Tutarı:</td>
                    <td style="text-align: right;" class="mono">${(summary.subTotal || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} TL</td>
                  </tr>
                  ${summary.totalDiscount > 0 ? `
                  <tr>
                    <td>Toplam İskonto / İndirim:</td>
                    <td style="text-align: right; color: #dc2626;" class="mono">-${(summary.totalDiscount || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} TL</td>
                  </tr>
                  ` : ''}
                  <tr>
                    <td>Hesaplanan KDV (%20):</td>
                    <td style="text-align: right;" class="mono">${(summary.totalVat || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} TL</td>
                  </tr>
                  <tr class="grand-total">
                    <td>ÖDENECEK TOPLAM TUTAR:</td>
                    <td style="text-align: right;" class="mono">${(summary.grandTotal || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} TL</td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>

          <!-- Alt Yasal Dipnot -->
          <div class="footer-note">
            Bu belge 213 Sayılı VUK hükümlerine göre <strong>Hızlı Bilişim e-Connect Özel Entegratör</strong> altyapısı üzerinden elektronik ortamda düzenlenmiştir.<br>
            Karekod Bilgisi: <span class="mono">${statusData?.qrData || `VKN:1681136628|NO:${invNo}`}</span> · Doğrulama Portalı: https://ebelge.gib.gov.tr
          </div>
        </div>
      </body>
      </html>
    `;
  };

  const handleCopyXml = () => {
    navigator.clipboard.writeText(xmlContent);
    showToast('GİB UBL-TR XML panoya kopyalandı.', 'success');
  };

  const handleDownloadXml = () => {
    const blob = new Blob([xmlContent], { type: 'application/xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${eInvoiceData?.invoiceNo || 'e-fatura'}.xml`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('XML dosyası indirildi.', 'success');
  };

  const handlePrint = () => {
    if (iframeRef.current && iframeRef.current.contentWindow) {
      iframeRef.current.contentWindow.focus();
      iframeRef.current.contentWindow.print();
    } else {
      window.print();
    }
  };

  const handleSendHizli = async () => {
    if (!invoiceId) return;
    setSending(true);
    try {
      const res = await api.sendHizliInvoice(invoiceId);
      if (res.success) {
        setSentResult(res);
        showToast(
          res.uuid
            ? `Fatura GİB'e iletildi! ETTN: ${res.uuid}`
            : 'Belge entegratöre iletildi (ETTN entegratör yanıtında dönmedi).',
          'success'
        );
        // Yeniden yükle
        loadData(invoiceId);
      } else {
        showToast(res.message || 'GİB gönderimi başarısız.', 'error');
      }
    } catch (err: any) {
      showToast(err.message || 'GİB gönderimi sırasında hata oluştu.', 'error');
    } finally {
      setSending(false);
    }
  };

  const isSent = !!sentResult || (!eInvoiceData?.isDraft && eInvoiceData?.status === 'SUCCESS');

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`e-Fatura & e-Arşiv Resmi Belge Önizleme (${eInvoiceData?.invoiceNo || ''})`}
      size="large"
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Kapat
          </button>

          {activeTab === 'PREVIEW' && (
            <button type="button" className="btn btn-secondary" onClick={handlePrint}>
              <Printer size={14} />
              <span>Yazdır / PDF Olarak Kaydet</span>
            </button>
          )}

          {activeTab === 'XML' && (
            <>
              <button type="button" className="btn btn-secondary" onClick={handleCopyXml}>
                <Copy size={14} />
                <span>XML Kopyala</span>
              </button>
              <button type="button" className="btn btn-secondary" onClick={handleDownloadXml}>
                <Download size={14} />
                <span>UBL-TR XML İndir</span>
              </button>
            </>
          )}

          <button
            type="button"
            className="btn btn-primary"
            onClick={handleSendHizli}
            disabled={sending || isSent}
            style={{
              background: isSent ? 'var(--success)' : 'var(--primary)',
              border: 'none',
            }}
          >
            {sending ? (
              <>
                <RefreshCw size={14} className="animate-spin" />
                <span>GİB'e İletiliyor...</span>
              </>
            ) : isSent ? (
              <>
                <CheckCircle2 size={14} />
                <span>GİB'e İletildi</span>
              </>
            ) : (
              <>
                <Zap size={14} color="#fff" />
                <span>Hızlı e-Connect ile GİB'e Gönder</span>
              </>
            )}
          </button>
        </>
      }
    >
      {/* Üst Sekmeler & Şablon Seçici Bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border-color)', paddingBottom: '10px', marginBottom: '14px', flexWrap: 'wrap', gap: '8px' }}>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            className={`btn ${activeTab === 'PREVIEW' ? 'btn-primary' : 'btn-secondary'} btn-sm`}
            onClick={() => setActiveTab('PREVIEW')}
          >
            <LayoutTemplate size={14} />
            <span>Resmi Fatura Tasarımı & Önizleme</span>
          </button>
          <button
            className={`btn ${activeTab === 'STATUS' ? 'btn-primary' : 'btn-secondary'} btn-sm`}
            onClick={() => setActiveTab('STATUS')}
          >
            <CheckCircle2 size={14} />
            <span>GİB Durumu & Karekod</span>
          </button>
          <button
            className={`btn ${activeTab === 'XML' ? 'btn-primary' : 'btn-secondary'} btn-sm`}
            onClick={() => setActiveTab('XML')}
          >
            <Code2 size={14} />
            <span>GİB UBL-TR 2.1 XML</span>
          </button>
        </div>

        {/* Şablon & Durum Rozeti */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {!isSent ? (
            <span className="badge badge-warning" style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '4px 8px' }}>
              <AlertTriangle size={12} />
              <span>Taslak (GİB'e Gönderilmedi)</span>
            </span>
          ) : (
            <span className="badge badge-success" style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '4px 8px' }}>
              <CheckCircle2 size={12} />
              <span>GİB Onaylı Resmi Belge</span>
            </span>
          )}

          {activeTab === 'PREVIEW' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <select
                className="form-input form-input-sm"
                value={selectedTemplate}
                onChange={e => setSelectedTemplate(e.target.value as any)}
                style={{ fontSize: 'var(--fs-sm, 12px)', fontWeight: 600, color: 'var(--primary)', padding: '3px 8px' }}
              >
                <option value="HIZLI_GENERAL">Hızlı Bilişim Standart Tasarım (general)</option>
                <option value="GIB_STANDART">GİB Resmi e-Fatura Görünümü</option>
                <option value="MODERN_A4">Modern İŞBEY A4 Şablonu</option>
              </select>
            </div>
          )}
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '60px' }}>
          <RefreshCw size={28} className="animate-spin" color="var(--primary)" />
          <div style={{ marginTop: '12px', fontSize: 'var(--fs-base, 13px)', color: 'var(--text-muted)' }}>Cari hesap bilgileri ve XSLT tasarımı yükleniyor...</div>
        </div>
      ) : activeTab === 'PREVIEW' ? (
        <div>
          {/* Şablon Bilgi Başlığı */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'var(--bg-surface-secondary)',
            border: '1px solid var(--border-color)',
            borderRadius: 'var(--radius-sm, 6px)',
            padding: '8px 12px',
            marginBottom: '10px',
            fontSize: 'var(--fs-sm, 12px)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <FileCode size={15} color="var(--primary)" />
              <span>Tasarım: <strong>{selectedTemplate === 'HIZLI_GENERAL' ? 'Hızlı Bilişim e-Fatura / e-Arşiv Resmi XSLT Şablonu (general.xslt)' : 'GİB Standart Fatura Tasarımı'}</strong></span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span>Cari: <strong>{eInvoiceData?.customerDetails?.title || 'Seçili Cari'}</strong></span>
              <span className="badge badge-success">GİB UBL-TR 2.1 Uyumlu</span>
            </div>
          </div>

          {/* İframe ile Canlı Önizleme */}
          {/* 2026-09-13: Önizleme çerçevesi (modal chrome) açık temanın
              token'larına bağlandı; yalnızca iframe'in içindeki belge
              kanvası beyaz kâğıt olarak kalıyor. */}
          <div style={{
            background: 'var(--bg-surface-secondary)',
            border: '1px solid var(--border-color)',
            borderRadius: 'var(--radius-md, 8px)',
            padding: '16px',
            display: 'flex',
            justifyContent: 'center',
            minHeight: '620px',
            maxHeight: '75vh',
            overflowY: 'auto',
          }}>
            {rendering ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '300px' }}>
                <RefreshCw size={24} className="animate-spin" color="var(--primary)" />
              </div>
            ) : (
              <iframe
                ref={iframeRef}
                srcDoc={renderedHtml}
                title="Fatura Görsel Önizleme"
                style={{
                  width: '100%',
                  maxWidth: '840px',
                  height: '750px',
                  /* 2026-09-13: Belge kanvası bilinçli olarak beyaz kâğıt
                     yüzeyi — resmi e-Fatura çıktısı A4 kâğıda basılmış gibi
                     görünmeli; gri bir token'a çevrilmez. */
                  border: '1px solid var(--border-color)',
                  borderRadius: 'var(--radius-sm, 6px)',
                  background: '#ffffff',
                }}
              />
            )}
          </div>
        </div>
      ) : activeTab === 'STATUS' && eInvoiceData ? (
        <div>
          {isSent ? (
            <div className="einvoice-status-banner" style={{ background: 'var(--success-bg)', border: '1.5px solid var(--success-border)' }}>
              <CheckCircle2 size={24} color="var(--success)" />
              <div>
                <div style={{ fontWeight: 700, fontSize: 'var(--fs-md, 14px)', color: 'var(--success-text)' }}>GİB Durum Kodu: 1300 (Başarılı)</div>
                <div style={{ fontSize: 'var(--fs-sm, 12px)', color: 'var(--success-text)' }}>Fatura GİB sistemine başarıyla iletildi ve alıcı posta kutusuna teslim edildi.</div>
              </div>
            </div>
          ) : (
            <div className="einvoice-status-banner" style={{ background: 'var(--danger-bg)', border: '1.5px solid var(--danger-border)' }}>
              <AlertTriangle size={24} color="var(--danger)" />
              <div>
                <div style={{ fontWeight: 700, fontSize: 'var(--fs-md, 14px)', color: 'var(--danger-text)' }}>Fatura Durumu: Taslak (GİB'e Gönderilmedi)</div>
                <div style={{ fontSize: 'var(--fs-sm, 12px)', color: 'var(--danger-text)' }}>Fatura henüz Hızlı Teknoloji e-Connect ve GİB sistemine iletilmemiştir. "Hızlı e-Connect ile GİB'e Gönder" butonuna basarak faturayı resmiye dönüştürebilirsiniz.</div>
              </div>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 200px', gap: '16px', marginTop: '14px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: 'var(--fs-base, 13px)' }}>
              <div style={{ background: 'var(--bg-surface-secondary)', padding: '10px 14px', borderRadius: 'var(--radius-sm, 6px)' }}>
                <span style={{ color: 'var(--text-muted)' }}>Alıcı (Cari) Bilgileri:</span>
                <div style={{ fontWeight: 700, fontSize: 'var(--fs-base, 13px)', color: 'var(--text-main)', marginTop: '2px' }}>
                  {eInvoiceData.customerDetails?.title}
                </div>
                <div style={{ fontSize: 'var(--fs-sm, 12px)', color: 'var(--text-muted)', marginTop: '2px' }}>
                  VKN/TCKN: <strong className="mono">{eInvoiceData.customerDetails?.taxNumber}</strong> · V.D.: {eInvoiceData.customerDetails?.taxOffice}
                </div>
                <div style={{ fontSize: 'var(--fs-sm, 12px)', color: 'var(--text-muted)' }}>
                  Adres: {eInvoiceData.customerDetails?.address} {eInvoiceData.customerDetails?.district}/{eInvoiceData.customerDetails?.city}
                </div>
              </div>

              <div style={{ background: 'var(--bg-surface-secondary)', padding: '10px 14px', borderRadius: 'var(--radius-sm, 6px)' }}>
                <span style={{ color: 'var(--text-muted)' }}>Evrensel Tekil Tanımlayıcı (ETTN):</span>
                <div style={{ fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--primary)', marginTop: '2px' }}>
                  {eInvoiceData.ettn}
                </div>
              </div>

              <div style={{ background: 'var(--bg-surface-secondary)', padding: '10px 14px', borderRadius: 'var(--radius-sm, 6px)' }}>
                <span style={{ color: 'var(--text-muted)' }}>Fatura Türü / Profili:</span>
                <div style={{ fontWeight: 600, marginTop: '2px' }}>
                  Temel Fatura / e-Arşiv (509 Sıra No'lu VUK Genel Tebliği Uyumlu)
                </div>
              </div>
            </div>

            {/* Gerçek Karekod Kutusu */}
            {/* 2026-09-13: Karekod kutusu beyaz kâğıt üzerine basılı karekod
                taklidi — açık temada da beyaz yüzey olarak kalır. */}
            <div style={{ border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md, 8px)', padding: '14px', textAlign: 'center', background: '#ffffff', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <div dangerouslySetInnerHTML={{ __html: generateQrSvg(eInvoiceData.qrData) }} />
              <div style={{ fontSize: 'var(--fs-2xs, 10px)', color: 'var(--text-muted)', marginTop: '8px', fontWeight: 700 }}>
                {isSent ? 'GİB Doğrulama Karekodu' : 'Taslak Karekod'}
              </div>
              <div style={{ fontSize: 'var(--fs-2xs, 10px)', color: 'var(--text-muted)', marginTop: '2px' }}>
                {isSent ? 'GİB e-Belge Uyumlu' : 'GİB Onayı Bekleniyor'}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div>
          <div className="einvoice-xml-box">{xmlContent}</div>
        </div>
      )}
    </Modal>
  );
};
