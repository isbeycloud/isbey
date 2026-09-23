import React from 'react';
import type { Company, DocumentTemplateSettings, InvoiceTemplateType } from '../../types';
import {
  ClassicInvoiceTemplate,
  ModernInvoiceTemplate,
  CorporateInvoiceTemplate,
  CompactInvoiceTemplate,
  ProfessionalInvoiceTemplate,
} from './InvoiceTemplates';

/**
 * 2026-09-13 — RENK NOTU (DOCUMENT / BASKI PALETİ)
 * ===========================================================================
 * Bu motordaki renkler (tek/teklif/irsaliye/ekstre/rapor gövdesi) BASILAN
 * BELGEYE ait print paletidir: beyaz kağıt (#fff), koyu metin (#111827,
 * #0f172a, #1e293b), gri tablo çizgileri (#cbd5e1, #e2e8f0, #f1f5f9).
 * Uygulama arayüzü teması DEĞİLDİR; açık tema token'larına çevrilmez.
 * Bkz. InvoiceTemplates.tsx başındaki aynı not.
 * ===========================================================================
 */

interface DocumentTemplateEngineProps {
  type: 'A4_INVOICE' | 'QUOTE' | 'WAYBILL' | 'STATEMENT' | 'REPORT' | 'THERMAL_80MM';
  payload: any;
  company?: Company;
  settings?: DocumentTemplateSettings;
  overrideTemplate?: InvoiceTemplateType;
}

export const DocumentTemplateEngine: React.FC<DocumentTemplateEngineProps> = ({
  type,
  payload,
  company,
  settings,
  overrideTemplate,
}) => {
  const activeTemplate = overrideTemplate || settings?.invoiceTemplate || 'professional';

  // 1. FATURALAR İÇİN 5 FARKLI ŞABLON
  if (type === 'A4_INVOICE') {
    switch (activeTemplate) {
      case 'classic':
        return <ClassicInvoiceTemplate payload={payload} company={company} settings={settings} type={type} />;
      case 'modern':
        return <ModernInvoiceTemplate payload={payload} company={company} settings={settings} type={type} />;
      case 'corporate':
        return <CorporateInvoiceTemplate payload={payload} company={company} settings={settings} type={type} />;
      case 'compact':
        return <CompactInvoiceTemplate payload={payload} company={company} settings={settings} type={type} />;
      case 'professional':
      default:
        return <ProfessionalInvoiceTemplate payload={payload} company={company} settings={settings} type={type} />;
    }
  }

  // 2. 80MM TERMAL POS FİŞİ
  if (type === 'THERMAL_80MM') {
    return (
      <div className="thermal-receipt" style={{ width: '80mm', minHeight: '120mm', padding: '12px', fontSize: '11px', fontFamily: 'Courier New, monospace', color: '#000000', background: '#fff' }}>
        <div style={{ textAlign: 'center', marginBottom: '8px' }}>
          <div style={{ fontWeight: 'bold', fontSize: '13px' }}>{company?.title || 'İŞBEY TEKNOLOJİ VE TİC. A.Ş.'}</div>
          <div>Kadıköy / İstanbul - Tel: {company?.phone || '(216) 555 01 23'}</div>
          <div>VKN: {company?.taxNumber || '4810592817'} - {company?.taxOffice || 'Kadıköy'} V.D.</div>
          <div style={{ borderBottom: '1px dashed #000', margin: '6px 0' }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px' }}>
            <span>Fiş No: {payload.invoiceNo || 'POS-0001'}</span>
            <span>{payload.date || new Date().toLocaleDateString('tr-TR')}</span>
          </div>
          <div style={{ textAlign: 'left', fontSize: '10px' }}>Müşteri: {payload.customerTitle || 'Perakende Müşteri'}</div>
          <div style={{ borderBottom: '1px dashed #000', margin: '6px 0' }} />
        </div>

        <table style={{ width: '100%', fontSize: '10px', borderCollapse: 'collapse', marginBottom: '8px' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #000' }}>
              <th style={{ textAlign: 'left' }}>Ürün</th>
              <th style={{ textAlign: 'center' }}>Ad</th>
              <th style={{ textAlign: 'right' }}>Fiyat</th>
              <th style={{ textAlign: 'right' }}>Tutar</th>
            </tr>
          </thead>
          <tbody>
            {(payload.items || []).map((it: any, i: number) => (
              <tr key={i}>
                <td style={{ maxWidth: '30mm', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.productName}</td>
                <td style={{ textAlign: 'center' }}>{it.quantity}</td>
                <td style={{ textAlign: 'right' }}>{it.unitPrice?.toFixed(2)}</td>
                <td style={{ textAlign: 'right' }}>{it.lineGrandTotal?.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div style={{ borderTop: '1px dashed #000', paddingTop: '6px', fontSize: '11px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>Ara Toplam:</span>
            <span>{(payload.subTotal || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>KDV Toplamı:</span>
            <span>{(payload.totalVat || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺</span>
          </div>
          {payload.totalDiscount > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', color: '#c00' }}>
              <span>Toplam İskonto:</span>
              <span>-{(payload.totalDiscount || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺</span>
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', fontSize: '13px', borderTop: '1px solid #000', paddingTop: '4px', marginTop: '4px' }}>
            <span>GENEL TOPLAM:</span>
            <span>{(payload.grandTotal || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px', fontSize: '10px' }}>
            <span>Ödeme Türü:</span>
            <span>{payload.paymentType === 'CASH' ? 'NAKİT' : payload.paymentType === 'CREDIT_CARD' ? 'KREDİ KARTI' : 'AÇIK HESAP'}</span>
          </div>
        </div>

        <div style={{ textAlign: 'center', marginTop: '16px', borderTop: '1px dashed #000', paddingTop: '8px', fontSize: '9px' }}>
          <div>Mali Değeri Yoktur - Bilgi Fişidir</div>
          <div>Bizi tercih ettiğiniz için teşekkür ederiz!</div>
          <div style={{ fontFamily: 'monospace', letterSpacing: '4px', marginTop: '6px' }}>||| | |||| ||| |||||||</div>
          <div>{payload.invoiceNo || 'SAT-2026-000001'}</div>
        </div>
      </div>
    );
  }

  // 3. A4 TEKLİF FORMU
  if (type === 'QUOTE') {
    return (
      <div style={{ width: '210mm', minHeight: '297mm', padding: '20mm', fontSize: '12px', fontFamily: 'Inter, sans-serif', color: '#111827', boxSizing: 'border-box', background: '#fff' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '2px solid #0066cc', paddingBottom: '16px', marginBottom: '20px' }}>
          <div>
            <h1 style={{ fontSize: '22px', fontWeight: 800, color: '#0066cc', margin: 0 }}>{company?.title || 'İŞBEY TEKNOLOJİ VE TİC. A.Ş.'}</h1>
            <div style={{ fontSize: '12px', color: '#4b5563', marginTop: '4px' }}>Atatürk Caddesi No: 45 Kat: 4 Kadıköy / İSTANBUL</div>
            <div style={{ fontSize: '12px', color: '#4b5563' }}>Tel: +90 (216) 555 01 23 | E-Posta: teklif@isbey.com.tr</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ background: '#0066cc', color: '#fff', padding: '6px 14px', fontWeight: 700, fontSize: '13px', borderRadius: '4px' }}>
              FİYAT TEKLİFİ
            </div>
            <div style={{ marginTop: '8px', fontSize: '13px' }}><strong>Teklif No:</strong> {payload.quoteNo}</div>
            <div style={{ fontSize: '12px' }}><strong>Tarih:</strong> {payload.date}</div>
            <div style={{ fontSize: '12px' }}><strong>Geçerlilik:</strong> {payload.validUntil}</div>
          </div>
        </div>

        <div style={{ border: '1px solid #e5e7eb', borderRadius: '6px', padding: '12px 16px', marginBottom: '20px', background: '#f9fafb' }}>
          {/* 2026-09-13 (tasarım sadeleştirmesi): textTransform: uppercase KORUNDU —
              burası yazdırılan teklif belgesinin şablon gövdesi (basılı doküman),
              ekran arayüzü değil; belge tipografisi kural dışı bırakıldı. */}
          <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: '#6b7280', marginBottom: '4px' }}>TEKLİF VERİLEN KURUM / KİŞİ:</div>
          <div style={{ fontSize: '14px', fontWeight: 700 }}>{payload.customerTitle}</div>
          <div style={{ fontSize: '12px', color: '#374151', marginTop: '2px' }}>Proje / Not: {payload.notes || 'Genel Ticari Teklif'}</div>
        </div>

        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '20px' }}>
          <thead>
            <tr style={{ background: '#f3f4f6', borderBottom: '2px solid #d1d5db', textAlign: 'left', fontSize: '11px', /* 2026-09-13: yazdırılan belge tablo başlığı — uppercase KORUNDU (basılı doküman şablonu). */ textTransform: 'uppercase' }}>
              <th style={{ padding: '8px 10px' }}>Sıra</th>
              <th style={{ padding: '8px 10px' }}>Ürün / Hizmet</th>
              <th style={{ padding: '8px 10px', textAlign: 'center' }}>Miktar</th>
              <th style={{ padding: '8px 10px', textAlign: 'right' }}>Birim Fiyat</th>
              <th style={{ padding: '8px 10px', textAlign: 'center' }}>İsk %</th>
              <th style={{ padding: '8px 10px', textAlign: 'center' }}>KDV %</th>
              <th style={{ padding: '8px 10px', textAlign: 'right' }}>Tutar</th>
            </tr>
          </thead>
          <tbody>
            {(payload.items || []).map((it: any, idx: number) => (
              <tr key={idx} style={{ borderBottom: '1px solid #e5e7eb', fontSize: '12px' }}>
                <td style={{ padding: '8px 10px' }}>{idx + 1}</td>
                <td style={{ padding: '8px 10px', fontWeight: 600 }}>{it.productName} ({it.productCode})</td>
                <td style={{ padding: '8px 10px', textAlign: 'center' }}>{it.quantity} {it.unit}</td>
                <td style={{ padding: '8px 10px', textAlign: 'right' }}>{it.unitPrice?.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺</td>
                <td style={{ padding: '8px 10px', textAlign: 'center' }}>%{it.discount1 || 0}</td>
                <td style={{ padding: '8px 10px', textAlign: 'center' }}>%{it.vatRate}</td>
                <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 600 }}>{it.lineGrandTotal?.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: '20px', marginBottom: '30px' }}>
          <div style={{ border: '1px dashed #cbd5e1', borderRadius: '6px', padding: '12px', background: '#f8fafc', fontSize: '11px', color: '#475569' }}>
            <div style={{ fontWeight: 700, marginBottom: '4px', color: '#0f172a' }}>Teklif Şartnamesi & Genel Koşullar:</div>
            <div style={{ whiteSpace: 'pre-wrap' }}>{payload.termsAndConditions || '1. Fiyatlarımıza KDV dahildir.\n2. Teklif 15 gün geçerlidir.'}</div>
          </div>

          <div style={{ border: '1px solid #e5e7eb', borderRadius: '6px', overflow: 'hidden' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 12px', borderBottom: '1px solid #f3f4f6' }}>
              <span style={{ color: '#4b5563' }}>Ara Toplam:</span>
              <strong>{(payload.subTotal || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺</strong>
            </div>
            {payload.totalDiscount > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 12px', borderBottom: '1px solid #f3f4f6', color: '#dc2626' }}>
                <span>Toplam İskonto:</span>
                <strong>-{(payload.totalDiscount || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺</strong>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 12px', borderBottom: '1px solid #f3f4f6' }}>
              <span style={{ color: '#4b5563' }}>Toplam KDV:</span>
              <strong>{(payload.totalVat || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', background: '#0066cc', color: '#ffffff', fontSize: '14px', fontWeight: 800 }}>
              <span>GENEL TOPLAM:</span>
              <span>{(payload.grandTotal || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺</span>
            </div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '40px', marginTop: '40px', paddingTop: '20px', borderTop: '1px solid #e5e7eb' }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '11px', fontWeight: 600, color: '#6b7280' }}>TEKLİF VEREN</div>
            <div style={{ marginTop: '40px', fontSize: '12px', fontWeight: 700 }}>İŞBEY TEKNOLOJİ VE TİC. A.Ş.</div>
            <div style={{ fontSize: '11px', color: '#9ca3af' }}>(Yetkili İmza)</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '11px', fontWeight: 600, color: '#6b7280' }}>ONAYLAYAN MÜŞTERİ</div>
            <div style={{ marginTop: '40px', fontSize: '12px', fontWeight: 700 }}>{payload.customerTitle}</div>
            <div style={{ fontSize: '11px', color: '#9ca3af' }}>(Kaşe / İmza)</div>
          </div>
        </div>
      </div>
    );
  }

  // 4. A4 İRSALİYE FORMU
  if (type === 'WAYBILL') {
    return (
      <div style={{ width: '210mm', minHeight: '297mm', padding: '20mm', fontSize: '12px', fontFamily: 'Inter, sans-serif', color: '#111827', boxSizing: 'border-box', background: '#fff' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '2px solid #16a34a', paddingBottom: '16px', marginBottom: '20px' }}>
          <div>
            <h1 style={{ fontSize: '22px', fontWeight: 800, color: '#16a34a', margin: 0 }}>İŞBEY TEKNOLOJİ VE TİC. A.Ş.</h1>
            <div style={{ fontSize: '12px', color: '#4b5563', marginTop: '4px' }}>Kadıköy / İSTANBUL | Tel: (216) 555 01 23</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ background: '#16a34a', color: '#fff', padding: '6px 14px', fontWeight: 700, fontSize: '13px', borderRadius: '4px' }}>
              SEVK İRSALİYESİ
            </div>
            <div style={{ marginTop: '8px', fontSize: '13px' }}><strong>İrsaliye No:</strong> {payload.waybillNo}</div>
            <div style={{ fontSize: '12px' }}><strong>Düzenleme Tarihi:</strong> {payload.date}</div>
            <div style={{ fontSize: '12px' }}><strong>Fiili Sevk Tarihi:</strong> {payload.shipmentDate}</div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '20px' }}>
          <div style={{ border: '1px solid #e5e7eb', borderRadius: '6px', padding: '12px', background: '#f9fafb' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, color: '#6b7280', marginBottom: '4px' }}>SEVK EDİLEN ALICI:</div>
            <div style={{ fontSize: '13px', fontWeight: 700 }}>{payload.customerTitle}</div>
            <div style={{ fontSize: '11px', color: '#4b5563', marginTop: '2px' }}>Açıklama: {payload.notes || 'Standart Sevkiyat'}</div>
          </div>
          <div style={{ border: '1px solid #e5e7eb', borderRadius: '6px', padding: '12px', background: '#f9fafb' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, color: '#6b7280', marginBottom: '4px' }}>TAŞIYICI & LOJİSTİK BİLGİLERİ:</div>
            <div style={{ fontSize: '12px' }}><strong>Taşıyıcı:</strong> {payload.carrierTitle || 'Öz Mal Araç'}</div>
            <div style={{ fontSize: '12px' }}><strong>Plaka / Şoför:</strong> {payload.plateNumber || '-'} {payload.driverName ? `(${payload.driverName})` : ''}</div>
          </div>
        </div>

        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '20px' }}>
          <thead>
            <tr style={{ background: '#f3f4f6', borderBottom: '2px solid #d1d5db', textAlign: 'left', fontSize: '11px', /* 2026-09-13: yazdırılan belge tablo başlığı — uppercase KORUNDU (basılı doküman şablonu). */ textTransform: 'uppercase' }}>
              <th style={{ padding: '8px 10px' }}>Sıra</th>
              <th style={{ padding: '8px 10px' }}>Mal / Malzeme Cinsi</th>
              <th style={{ padding: '8px 10px', textAlign: 'center' }}>Miktar</th>
              <th style={{ padding: '8px 10px', textAlign: 'center' }}>Birim</th>
              <th style={{ padding: '8px 10px', textAlign: 'right' }}>Birim Fiyat</th>
              <th style={{ padding: '8px 10px', textAlign: 'right' }}>Tutar</th>
            </tr>
          </thead>
          <tbody>
            {(payload.items || []).map((it: any, idx: number) => (
              <tr key={idx} style={{ borderBottom: '1px solid #e5e7eb', fontSize: '12px' }}>
                <td style={{ padding: '8px 10px' }}>{idx + 1}</td>
                <td style={{ padding: '8px 10px', fontWeight: 600 }}>{it.productName} ({it.productCode})</td>
                <td style={{ padding: '8px 10px', textAlign: 'center', fontWeight: 700 }}>{it.quantity}</td>
                <td style={{ padding: '8px 10px', textAlign: 'center' }}>{it.unit}</td>
                <td style={{ padding: '8px 10px', textAlign: 'right' }}>{it.unitPrice?.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺</td>
                <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 600 }}>{it.lineTotal?.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '40px', marginTop: '50px', paddingTop: '20px', borderTop: '1px solid #e5e7eb' }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '11px', fontWeight: 600, color: '#6b7280' }}>SEVK EDEN / TESLİM EDEN</div>
            <div style={{ marginTop: '40px', fontSize: '12px', fontWeight: 700 }}>İŞBEY LOJİSTİK</div>
            <div style={{ fontSize: '11px', color: '#9ca3af' }}>(İmza)</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '11px', fontWeight: 600, color: '#6b7280' }}>EKSİKSİZ TESLİM ALAN</div>
            <div style={{ marginTop: '40px', fontSize: '12px', fontWeight: 700 }}>{payload.customerTitle}</div>
            <div style={{ fontSize: '11px', color: '#9ca3af' }}>(İmza / Kaşe)</div>
          </div>
        </div>
      </div>
    );
  }

  // 5. CARİ EKSTRE
  if (type === 'STATEMENT') {
    return (
      <div style={{ width: '210mm', minHeight: '297mm', padding: '20mm', fontSize: '12px', fontFamily: 'Inter, sans-serif', boxSizing: 'border-box', background: '#fff' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '2px solid #0066cc', paddingBottom: '12px', marginBottom: '16px' }}>
          <div>
            <h2 style={{ fontSize: '20px', fontWeight: 800, color: '#0066cc', margin: 0 }}>CARİ HESAP EKSTRESİ</h2>
            <div style={{ fontSize: '13px', fontWeight: 700, marginTop: '4px' }}>{payload.customer?.title} ({payload.customer?.code})</div>
            <div style={{ fontSize: '11px', color: '#6b7280' }}>Tel: {payload.customer?.phone} | VKN: {payload.customer?.taxNumber || '-'}</div>
          </div>
          <div style={{ textAlign: 'right', fontSize: '12px' }}>
            <div><strong>Rapor Tarihi:</strong> {new Date().toLocaleDateString('tr-TR')}</div>
            <div style={{ marginTop: '4px' }}>
              <strong>Güncel Bakiye: </strong>
              <span style={{ fontWeight: 800, color: (payload.customer?.balance || 0) > 0 ? '#dc2626' : '#16a34a' }}>
                {(payload.customer?.balance || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺
              </span>
            </div>
          </div>
        </div>

        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
          <thead>
            <tr style={{ background: '#f3f4f6', borderBottom: '2px solid #d1d5db', textAlign: 'left' }}>
              <th style={{ padding: '6px 8px' }}>Tarih</th>
              <th style={{ padding: '6px 8px' }}>Belge No</th>
              <th style={{ padding: '6px 8px' }}>İşlem Türü</th>
              <th style={{ padding: '6px 8px' }}>Açıklama</th>
              <th style={{ padding: '6px 8px', textAlign: 'right' }}>Borç (TL)</th>
              <th style={{ padding: '6px 8px', textAlign: 'right' }}>Alacak (TL)</th>
              <th style={{ padding: '6px 8px', textAlign: 'right' }}>Bakiye (TL)</th>
            </tr>
          </thead>
          <tbody>
            {(payload.statement || []).map((st: any, idx: number) => (
              <tr key={idx} style={{ borderBottom: '1px solid #e5e7eb' }}>
                <td style={{ padding: '6px 8px' }}>{st.date}</td>
                <td style={{ padding: '6px 8px', fontWeight: 600 }}>{st.documentNo}</td>
                <td style={{ padding: '6px 8px' }}>{st.documentType}</td>
                <td style={{ padding: '6px 8px' }}>{st.description}</td>
                <td style={{ padding: '6px 8px', textAlign: 'right' }}>{st.debit > 0 ? st.debit.toLocaleString('tr-TR', { minimumFractionDigits: 2 }) : '-'}</td>
                <td style={{ padding: '6px 8px', textAlign: 'right' }}>{st.credit > 0 ? st.credit.toLocaleString('tr-TR', { minimumFractionDigits: 2 }) : '-'}</td>
                <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 700 }}>{(st.balance ?? st.runningBalance ?? 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  // 6. RAPOR
  return (
    <div style={{ width: '210mm', minHeight: '297mm', padding: '20mm', fontSize: '12px', fontFamily: 'Inter, sans-serif', color: '#111827', boxSizing: 'border-box', background: '#fff' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '2px solid #0066cc', paddingBottom: '14px', marginBottom: '20px' }}>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: 800, color: '#0066cc', margin: 0 }}>{company?.title || 'İŞBEY TEKNOLOJİ VE TİC. A.Ş.'}</h1>
          <div style={{ fontSize: '14px', fontWeight: 700, color: '#1e293b', marginTop: '4px' }}>Yönetim ve Finans Raporu</div>
        </div>
        <div style={{ textAlign: 'right', fontSize: '12px', color: '#64748b' }}>
          <div><strong>Tarih:</strong> {new Date().toLocaleDateString('tr-TR')}</div>
          <div><strong>Saat:</strong> {new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}</div>
        </div>
      </div>

      {payload.rows && Array.isArray(payload.rows) && payload.rows.length > 0 ? (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px', marginBottom: '24px' }}>
          <thead>
            <tr style={{ background: '#f1f5f9', borderBottom: '2px solid #cbd5e1' }}>
              {Object.keys(payload.rows[0]).map((col, idx) => (
                <th key={idx} style={{ padding: '8px 10px', textAlign: typeof payload.rows[0][col] === 'number' ? 'right' : 'left', color: '#334155', fontWeight: 700 }}>
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {payload.rows.map((row: any, rIdx: number) => (
              <tr key={rIdx} style={{ borderBottom: '1px solid #e2e8f0' }}>
                {Object.keys(row).map((col, cIdx) => (
                  <td key={cIdx} style={{ padding: '8px 10px', textAlign: typeof row[col] === 'number' ? 'right' : 'left' }}>
                    {typeof row[col] === 'number' ? `${row[col].toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺` : String(row[col])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div style={{ padding: '30px', textAlign: 'center', color: '#64748b' }}>Rapor içeriği hazır.</div>
      )}
    </div>
  );
};

