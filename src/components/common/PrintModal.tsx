import React, { useRef, useState, useEffect } from 'react';
import { Printer, Download, X, Loader2 } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useToast } from '../../context/ToastContext';
import { DocumentTemplateEngine } from '../templates/DocumentTemplateEngine';
import { resolveDesignToTemplateSettings } from '../templates/invoiceDesignConfig';
import type { InvoiceDesignConfig } from '../templates/invoiceDesignConfig';
import { api } from '../../services/api';
import type { Company, DocumentTemplateSettings } from '../../types';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

export const PrintModal: React.FC = () => {
  const { printData, closePrintModal } = useApp();
  const { showToast } = useToast();
  const printAreaRef = useRef<HTMLDivElement>(null);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [company, setCompany] = useState<Company | undefined>(undefined);
  const [templateSettings, setTemplateSettings] = useState<DocumentTemplateSettings | undefined>(undefined);
  // FAZ 25.3-A3: varsayılan fatura tasarımı (varsa) — yazdırma/önizlemeye uygulanır
  const [invoiceDesign, setInvoiceDesign] = useState<InvoiceDesignConfig | undefined>(undefined);

  useEffect(() => {
    if (printData?.open) {
      api.getCompany().then(res => {
        if (res.success) {
          setCompany(res.company);
          setTemplateSettings(res.company.documentSettings);
        }
      }).catch(err => console.error('Error fetching company for print:', err));
      // FAZ 25.3-A3: varsayılan tasarımı getir (offline/localStorage fallback dahil)
      api.getInvoiceDesigns().then(res => {
        if (res.success && Array.isArray(res.invoiceDesigns)) {
          const designs = res.invoiceDesigns.map((d: any) => d);
          const def = designs.find((d: any) => d.isDefault) || designs[0];
          if (def) setInvoiceDesign(def);
          else setInvoiceDesign(undefined);
        }
      }).catch(() => {
        try {
          const raw = localStorage.getItem('isbey_invoice_designs_v1');
          if (raw) {
            const list = JSON.parse(raw) as InvoiceDesignConfig[];
            setInvoiceDesign(list.find(d => d.isDefault) || list[0]);
          }
        } catch { /* sessiz — varsayılan tema kullanılır */ }
      });
    }
  }, [printData?.open]);

  if (!printData || !printData.open) return null;

  const { type, title, payload } = printData;

  // 1. TARAYICI YAZDIRMA (Browser Print)
  const handleBrowserPrint = () => {
    window.print();
  };

  // 2. PDF OLARAK İNDİRME (Export to PDF File)
  const handleDownloadPdf = async () => {
    if (!printAreaRef.current) return;
    setIsExportingPdf(true);

    try {
      const element = printAreaRef.current;
      
      const canvas = await html2canvas(element, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff',
        windowWidth: element.scrollWidth,
        windowHeight: element.scrollHeight,
      });

      if (!canvas || canvas.width === 0 || canvas.height === 0) {
        throw new Error('Yazdırılacak belge alanı okunamadı.');
      }

      const imgData = canvas.toDataURL('image/jpeg', 0.98);

      if (type === 'THERMAL_80MM') {
        const imgWidth = 80;
        const imgHeight = (canvas.height * imgWidth) / canvas.width;
        const pdf = new jsPDF({
          orientation: 'portrait',
          unit: 'mm',
          format: [80, Math.max(120, imgHeight + 10)],
        });
        pdf.addImage(imgData, 'JPEG', 0, 0, imgWidth, imgHeight);
        const fileName = `Fis_${payload.invoiceNo || 'POS'}.pdf`;
        pdf.save(fileName);
      } else {
        const pdf = new jsPDF({
          orientation: 'portrait',
          unit: 'mm',
          format: 'a4',
        });

        const imgWidth = 210;
        const pageHeight = 297;
        const imgHeight = (canvas.height * imgWidth) / canvas.width;
        let heightLeft = imgHeight;
        let position = 0;

        pdf.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight);
        heightLeft -= pageHeight;

        while (heightLeft > 0) {
          position = heightLeft - imgHeight;
          pdf.addPage();
          pdf.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight);
          heightLeft -= pageHeight;
        }

        let fileName = 'Belge.pdf';
        if (type === 'A4_INVOICE') fileName = `Fatura_${payload.invoiceNo || 'Belge'}.pdf`;
        else if (type === 'QUOTE') fileName = `Teklif_${payload.quoteNo || 'Belge'}.pdf`;
        else if (type === 'WAYBILL') fileName = `Irsaliye_${payload.waybillNo || 'Belge'}.pdf`;
        else if (type === 'STATEMENT') fileName = `Cari_Ekstre_${payload.customer?.code || 'Cari'}.pdf`;
        else if (type === 'REPORT') fileName = `Rapor_${title?.replace(/\s+/g, '_') || 'Finans'}.pdf`;

        pdf.save(fileName);
      }

      showToast('PDF belgesi başarıyla oluşturuldu ve indirildi.', 'success');
    } catch (err: any) {
      console.error('PDF export error:', err);
      showToast('PDF oluşturulurken hata oluştu.', 'error');
    } finally {
      setIsExportingPdf(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={closePrintModal}>
      <div
        className="modal-dialog large"
        style={{ height: '94vh', display: 'flex', flexDirection: 'column' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="modal-header" style={{ padding: '12px 20px', borderBottom: '1px solid var(--border-color)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ padding: '6px', background: 'var(--primary-light)', borderRadius: '6px', display: 'flex' }}>
              <Printer size={18} color="var(--primary)" />
            </div>
            <div>
              <h3 className="modal-title" style={{ margin: 0, fontSize: '15px' }}>{title}</h3>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Baskı Önizleme ve Belge Çıktı Merkezi</div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {/* SEÇENEK 1: TARAYICI İLE YAZDIR */}
            <button
              className="btn btn-secondary btn-sm"
              onClick={handleBrowserPrint}
              style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600 }}
              title="Tarayıcı Yazdırma İletişim Kutusunu Açar (CTRL+P)"
            >
              <Printer size={15} />
              <span>Tarayıcıda Yazdır</span>
            </button>

            {/* SEÇENEK 2: PDF DOSYASI OLARAK İNDİR */}
            <button
              className="btn btn-primary btn-sm"
              onClick={handleDownloadPdf}
              disabled={isExportingPdf}
              // 2026-09-13 (tasarım sadeleştirmesi): dekoratif gradyan yerine düz birincil token.
              style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600, background: 'var(--primary)' }}
              title="Doğrudan PDF Belgesi Olarak Bilgisayara İndirir"
            >
              {isExportingPdf ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
              <span>{isExportingPdf ? 'PDF Hazırlanıyor...' : 'PDF İndir (.pdf)'}</span>
            </button>

            <div style={{ width: '1px', height: '24px', background: 'var(--border-color)', margin: '0 4px' }} />

            <button
              onClick={closePrintModal}
              style={{
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--text-muted)',
                padding: '4px',
                display: 'flex',
                borderRadius: '4px',
              }}
              title="Kapat (ESC)"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        <div className="modal-body" style={{ background: '#525659', padding: '24px', overflowY: 'auto', display: 'flex', justifyContent: 'center' }}>
          <div ref={printAreaRef} className="print-surface" style={{ background: '#ffffff', color: '#000000', boxShadow: '0 8px 24px rgba(0,0,0,0.3)', borderRadius: '4px' }}>
            <DocumentTemplateEngine
              type={type}
              payload={payload}
              company={company}
              settings={resolveDesignToTemplateSettings(
                type === 'A4_INVOICE' ? invoiceDesign : undefined,
                templateSettings
              )}
            />
          </div>
        </div>
      </div>
    </div>
  );
};
