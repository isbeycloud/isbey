import React from 'react';
import type { Company, DocumentTemplateSettings } from '../../types';

/**
 * 2026-09-13 — RENK NOTU (DOCUMENT / BASKI PALETİ)
 * ===========================================================================
 * Bu dosyadaki tüm renk sabitleri (#111827, #0f172a, #1e293b, #f8fafc,
 * #f1f5f9, #e2e8f0, #cbd5e1, #94a3b8, #64748b, #334155, #ffffff ...) BASILAN
 * BELGENİN renkleridir; uygulama arayüzünün (app chrome) tema renkleri DEĞİLDİR.
 *
 * Bu şablonlar 210mm x 297mm A4 kağıdını taklit eder ve doğrudan yazdırılır /
 * PDF'e aktarılır. Beyaz kağıt zemini, siyah/koyu gri metin ve gri tablo
 * çizgileri burada kasıtlıdır ve açık tema token'larına (var(--text-main),
 * var(--bg-surface) ...) ÇEVRİLMEMELİDİR — aksi halde kullanıcıya giden
 * fatura/irsaliye/teklif çıktısı bozulur.
 *
 * Aynı gerekçe: DocumentTemplateEngine.tsx, ekran önizlemesi (PrintModal) ve
 * e-Fatura/e-Arşiv önizlemeleri. Uygulama kabuğu (araç çubuğu, panel, modal)
 * renkleri ise bu dosyanın DIŞINDA, açık tema token'larıyla yönetilir.
 * ===========================================================================
 */

export interface TemplateProps {
  payload: any;
  company?: Company;
  settings?: DocumentTemplateSettings;
  type?: 'A4_INVOICE' | 'QUOTE' | 'WAYBILL' | 'STATEMENT' | 'REPORT' | 'THERMAL_80MM';
}

// =========================================================================
// 1. KLASİK TASARIM (Classic Template) - Resmi, kurumsal, geleneksel çizgiler
// =========================================================================
export const ClassicInvoiceTemplate: React.FC<TemplateProps> = ({ payload, company, settings }) => {
  const showStamp = settings?.showStampAndSignature ?? true;

  return (
    <div style={{ width: '210mm', minHeight: '297mm', padding: '18mm', fontSize: '11px', fontFamily: 'Times New Roman, serif', color: '#111827', boxSizing: 'border-box', background: '#fff' }}>
      {/* Top Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '2px solid #000', paddingBottom: '12px', marginBottom: '16px' }}>
        <div>
          <h1 style={{ fontSize: '20px', fontWeight: 'bold', margin: 0, letterSpacing: '0.5px' }}>
            {company?.title || 'İŞBEY TEKNOLOJİ VE TİC. A.Ş.'}
          </h1>
          <div style={{ fontSize: '11px', marginTop: '4px' }}>{company?.address || 'Atatürk Caddesi No: 45 Kat: 4 Kadıköy / İSTANBUL'}</div>
          <div style={{ fontSize: '11px' }}>Tel: {company?.phone || '+90 (216) 555 01 23'} | E-Posta: {company?.email || 'muhasebe@isbey.com.tr'}</div>
          <div style={{ fontSize: '11px' }}>Vergi Dairesi: {company?.taxOffice || 'Kadıköy'} - VKN: {company?.taxNumber || '4810592817'}</div>
        </div>
        <div style={{ textAlign: 'right', borderLeft: '1px solid #ccc', paddingLeft: '16px' }}>
          <div style={{ fontSize: '14px', fontWeight: 'bold', textTransform: 'uppercase', marginBottom: '4px' }}>
            {payload.type === 'PURCHASE' ? 'ALIŞ FATURASI' : 'SATIŞ FATURASI'}
          </div>
          <div><strong>Fatura No:</strong> {payload.invoiceNo || 'SAT-2026-000001'}</div>
          <div><strong>Tarih:</strong> {payload.date}</div>
          <div><strong>Vade:</strong> {payload.maturityDate}</div>
        </div>
      </div>

      {/* Customer Box */}
      <div style={{ border: '1px solid #000', padding: '10px', marginBottom: '16px', background: '#fafafa' }}>
        <div style={{ fontSize: '10px', fontWeight: 'bold', textTransform: 'uppercase', marginBottom: '2px' }}>SAYIN:</div>
        <div style={{ fontSize: '13px', fontWeight: 'bold' }}>{payload.customerTitle}</div>
        <div style={{ fontSize: '11px' }}>{payload.customerAddress || 'Adres Kayıtlı'}</div>
        <div style={{ fontSize: '11px' }}>Vergi Dairesi / No: {payload.taxOffice || '-'} / {payload.taxNumber || '-'}</div>
      </div>

      {/* Items Table */}
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '16px', fontSize: '11px' }}>
        <thead>
          <tr style={{ borderTop: '1px solid #000', borderBottom: '1px solid #000', background: '#f0f0f0' }}>
            <th style={{ padding: '6px', textAlign: 'center', width: '30px' }}>No</th>
            <th style={{ padding: '6px', textAlign: 'left' }}>Mal / Hizmet Cinsi</th>
            <th style={{ padding: '6px', textAlign: 'center', width: '50px' }}>Miktar</th>
            <th style={{ padding: '6px', textAlign: 'center', width: '50px' }}>Birim</th>
            <th style={{ padding: '6px', textAlign: 'right', width: '90px' }}>Birim Fiyat</th>
            <th style={{ padding: '6px', textAlign: 'center', width: '50px' }}>KDV %</th>
            <th style={{ padding: '6px', textAlign: 'right', width: '100px' }}>Tutar (TL)</th>
          </tr>
        </thead>
        <tbody>
          {(payload.items || []).map((it: any, idx: number) => (
            <tr key={idx} style={{ borderBottom: '1px solid #e0e0e0' }}>
              <td style={{ padding: '6px', textAlign: 'center' }}>{idx + 1}</td>
              <td style={{ padding: '6px' }}>{it.productName} ({it.productCode})</td>
              <td style={{ padding: '6px', textAlign: 'center' }}>{it.quantity}</td>
              <td style={{ padding: '6px', textAlign: 'center' }}>{it.unit}</td>
              <td style={{ padding: '6px', textAlign: 'right' }}>{it.unitPrice?.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺</td>
              <td style={{ padding: '6px', textAlign: 'center' }}>%{it.vatRate}</td>
              <td style={{ padding: '6px', textAlign: 'right', fontWeight: 'bold' }}>{it.lineGrandTotal?.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Totals */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '24px' }}>
        <table style={{ width: '260px', borderCollapse: 'collapse', border: '1px solid #000' }}>
          <tbody>
            <tr>
              <td style={{ padding: '4px 8px', borderBottom: '1px solid #ccc' }}>Ara Toplam:</td>
              <td style={{ padding: '4px 8px', textAlign: 'right', borderBottom: '1px solid #ccc' }}>{(payload.subTotal || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺</td>
            </tr>
            {payload.totalDiscount > 0 && (
              <tr>
                <td style={{ padding: '4px 8px', borderBottom: '1px solid #ccc', color: '#c00' }}>İskonto:</td>
                <td style={{ padding: '4px 8px', textAlign: 'right', borderBottom: '1px solid #ccc', color: '#c00' }}>-{(payload.totalDiscount || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺</td>
              </tr>
            )}
            <tr>
              <td style={{ padding: '4px 8px', borderBottom: '1px solid #ccc' }}>Toplam KDV:</td>
              <td style={{ padding: '4px 8px', textAlign: 'right', borderBottom: '1px solid #ccc' }}>{(payload.totalVat || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺</td>
            </tr>
            <tr style={{ background: '#f0f0f0', fontWeight: 'bold', fontSize: '12px' }}>
              <td style={{ padding: '6px 8px' }}>GENEL TOPLAM:</td>
              <td style={{ padding: '6px 8px', textAlign: 'right' }}>{(payload.grandTotal || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺</td>
            </tr>
          </tbody>
        </table>
      </div>

      {showStamp && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '40px', marginTop: '40px', paddingTop: '16px', borderTop: '1px solid #000' }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '11px', fontWeight: 'bold' }}>DÜZENLEYEN (İMZA / KAŞE)</div>
            <div style={{ marginTop: '40px', fontSize: '11px' }}>{company?.name || 'İŞBEY TEKNOLOJİ'}</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '11px', fontWeight: 'bold' }}>TESLİM ALAN (İMZA / KAŞE)</div>
            <div style={{ marginTop: '40px', fontSize: '11px' }}>{payload.customerTitle}</div>
          </div>
        </div>
      )}
    </div>
  );
};

// =========================================================================
// 2. MODERN TASARIM (Modern Template) - Minimalist, çağdaş tipografi
// =========================================================================
export const ModernInvoiceTemplate: React.FC<TemplateProps> = ({ payload, company, settings }) => {
  const primaryColor = settings?.primaryColor || '#0ea5e9';

  return (
    <div style={{ width: '210mm', minHeight: '297mm', padding: '20mm', fontSize: '11px', fontFamily: 'Inter, sans-serif', color: '#1e293b', boxSizing: 'border-box', background: '#fff' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' }}>
        <div>
          <div style={{ display: 'inline-block', width: '36px', height: '4px', background: primaryColor, borderRadius: '2px', marginBottom: '8px' }} />
          <h1 style={{ fontSize: '20px', fontWeight: 800, margin: 0, color: '#0f172a' }}>
            {company?.name || 'İŞBEY TEKNOLOJİ'}
          </h1>
          <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>{company?.address || 'Kadıköy / İstanbul'}</div>
          <div style={{ fontSize: '11px', color: '#64748b' }}>Tel: {company?.phone} | {company?.email}</div>
        </div>

        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '24px', fontWeight: 800, color: primaryColor, letterSpacing: '-0.5px' }}>
            FATURA
          </div>
          <div style={{ fontSize: '12px', fontWeight: 600, color: '#475569', marginTop: '2px' }}>#{payload.invoiceNo || 'SAT-2026-000001'}</div>
          <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '4px' }}>Tarih: {payload.date}</div>
          <div style={{ fontSize: '11px', color: '#94a3b8' }}>Vade: {payload.maturityDate}</div>
        </div>
      </div>

      <div style={{ background: '#f8fafc', borderRadius: '8px', padding: '14px 18px', marginBottom: '24px', border: '1px solid #e2e8f0' }}>
        <div style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', color: primaryColor, letterSpacing: '0.5px', marginBottom: '4px' }}>
          FATURA EDİLEN:
        </div>
        <div style={{ fontSize: '14px', fontWeight: 700, color: '#0f172a' }}>{payload.customerTitle}</div>
        <div style={{ fontSize: '11px', color: '#475569', marginTop: '2px' }}>{payload.customerAddress || 'Adres Kayıtlı'}</div>
        <div style={{ fontSize: '11px', color: '#64748b' }}>VKN/TCKN: {payload.taxNumber || '-'} | V.D.: {payload.taxOffice || '-'}</div>
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '24px', fontSize: '11px' }}>
        <thead>
          <tr style={{ borderBottom: '2px solid #e2e8f0', textAlign: 'left', color: '#64748b', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            <th style={{ padding: '10px 8px' }}>Açıklama</th>
            <th style={{ padding: '10px 8px', textAlign: 'center' }}>Miktar</th>
            <th style={{ padding: '10px 8px', textAlign: 'right' }}>Birim Fiyat</th>
            <th style={{ padding: '10px 8px', textAlign: 'center' }}>KDV</th>
            <th style={{ padding: '10px 8px', textAlign: 'right' }}>Toplam</th>
          </tr>
        </thead>
        <tbody>
          {(payload.items || []).map((it: any, idx: number) => (
            <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
              <td style={{ padding: '10px 8px' }}>
                <div style={{ fontWeight: 600, color: '#0f172a' }}>{it.productName}</div>
                <div style={{ fontSize: '10px', color: '#94a3b8' }}>{it.productCode}</div>
              </td>
              <td style={{ padding: '10px 8px', textAlign: 'center' }}>{it.quantity} {it.unit}</td>
              <td style={{ padding: '10px 8px', textAlign: 'right' }}>{it.unitPrice?.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺</td>
              <td style={{ padding: '10px 8px', textAlign: 'center' }}>%{it.vatRate}</td>
              <td style={{ padding: '10px 8px', textAlign: 'right', fontWeight: 700, color: '#0f172a' }}>
                {it.lineGrandTotal?.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '24px', alignItems: 'flex-start' }}>
        <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '10px', color: '#64748b' }}>
          <div style={{ fontWeight: 700, color: '#0f172a', marginBottom: '4px' }}>Notlar & Koşullar:</div>
          <div>{payload.notes || settings?.footerNotes || 'Bizi tercih ettiğiniz için teşekkür ederiz. Ödemenizi vadesinde yapmanızı rica ederiz.'}</div>
        </div>

        <div style={{ background: '#f8fafc', borderRadius: '8px', padding: '14px', border: '1px solid #e2e8f0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', color: '#64748b' }}>
            <span>Ara Toplam:</span>
            <span>{(payload.subTotal || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', color: '#64748b' }}>
            <span>KDV Tutarı:</span>
            <span>{(payload.totalVat || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: '8px', borderTop: '2px solid #e2e8f0', fontSize: '14px', fontWeight: 800, color: primaryColor }}>
            <span>Ödenecek Tutar:</span>
            <span>{(payload.grandTotal || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺</span>
          </div>
        </div>
      </div>
    </div>
  );
};

// =========================================================================
// 3. KURUMSAL TASARIM (Corporate Template) - Logo, banka hesapları, imza blokları
// =========================================================================
export const CorporateInvoiceTemplate: React.FC<TemplateProps> = ({ payload, company, settings }) => {
  const primaryColor = settings?.primaryColor || '#0066cc';

  return (
    <div style={{ width: '210mm', minHeight: '297mm', padding: '18mm', fontSize: '11px', fontFamily: 'Inter, sans-serif', color: '#0f172a', boxSizing: 'border-box', background: '#fff' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '3px solid ' + primaryColor, paddingBottom: '14px', marginBottom: '18px' }}>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: 800, color: primaryColor, margin: 0 }}>
            {company?.title || 'İŞBEY TEKNOLOJİ VE TİC. A.Ş.'}
          </h1>
          <div style={{ fontSize: '11px', color: '#475569', marginTop: '4px' }}>{company?.address}</div>
          <div style={{ fontSize: '11px', color: '#475569' }}>Tel: {company?.phone} | E-Posta: {company?.email}</div>
          <div style={{ fontSize: '11px', color: '#475569' }}>{company?.taxOffice} V.D. - VKN: {company?.taxNumber}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ background: primaryColor, color: '#fff', padding: '6px 14px', fontWeight: 800, fontSize: '13px', borderRadius: '4px', display: 'inline-block' }}>
            RESMİ FATURA
          </div>
          <div style={{ marginTop: '8px', fontSize: '12px' }}><strong>Fatura No:</strong> {payload.invoiceNo || 'SAT-2026-000001'}</div>
          <div style={{ fontSize: '11px', color: '#64748b' }}>Düzenleme: {payload.date}</div>
          <div style={{ fontSize: '11px', color: '#64748b' }}>Vade Tarihi: {payload.maturityDate}</div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: '14px', marginBottom: '18px' }}>
        <div style={{ border: '1px solid #cbd5e1', borderRadius: '6px', padding: '10px 14px', background: '#f8fafc' }}>
          <div style={{ fontSize: '10px', fontWeight: 700, color: primaryColor, textTransform: 'uppercase', marginBottom: '2px' }}>ALICI BİLGİLERİ:</div>
          <div style={{ fontSize: '13px', fontWeight: 700 }}>{payload.customerTitle}</div>
          <div style={{ fontSize: '11px', color: '#475569' }}>{payload.customerAddress || 'Adres Kayıtlı'}</div>
          <div style={{ fontSize: '11px', color: '#64748b' }}>VKN: {payload.taxNumber || '-'} | V.D.: {payload.taxOffice || '-'}</div>
        </div>

        <div style={{ border: '1px solid #cbd5e1', borderRadius: '6px', padding: '10px 14px', background: '#f8fafc', fontSize: '11px' }}>
          <div style={{ fontSize: '10px', fontWeight: 700, color: primaryColor, textTransform: 'uppercase', marginBottom: '2px' }}>ÖDEME & SEVK BİLGİLERİ:</div>
          <div><strong>Ödeme Türü:</strong> {payload.paymentType === 'CASH' ? 'Nakit' : payload.paymentType === 'CREDIT_CARD' ? 'Kredi Kartı' : 'Açık Hesap'}</div>
          <div><strong>Depo / Şube:</strong> Merkez Depo</div>
          <div><strong>Kaynak Belge:</strong> {payload.sourceQuoteNo || payload.sourceOrderNo || payload.sourceWaybillNo || 'Doğrudan Fatura'}</div>
        </div>
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '18px', fontSize: '11px' }}>
        <thead>
          <tr style={{ background: '#f1f5f9', borderBottom: '2px solid #cbd5e1', textAlign: 'left', fontSize: '10px', textTransform: 'uppercase' }}>
            <th style={{ padding: '8px', width: '30px' }}>Sıra</th>
            <th style={{ padding: '8px' }}>Malzeme / Hizmet</th>
            <th style={{ padding: '8px', textAlign: 'center', width: '50px' }}>Miktar</th>
            <th style={{ padding: '8px', textAlign: 'center', width: '50px' }}>Birim</th>
            <th style={{ padding: '8px', textAlign: 'right', width: '80px' }}>Birim Fiyat</th>
            <th style={{ padding: '8px', textAlign: 'center', width: '50px' }}>KDV %</th>
            <th style={{ padding: '8px', textAlign: 'right', width: '90px' }}>Tutar</th>
          </tr>
        </thead>
        <tbody>
          {(payload.items || []).map((it: any, idx: number) => (
            <tr key={idx} style={{ borderBottom: '1px solid #e2e8f0' }}>
              <td style={{ padding: '8px', textAlign: 'center' }}>{idx + 1}</td>
              <td style={{ padding: '8px', fontWeight: 600 }}>{it.productName} ({it.productCode})</td>
              <td style={{ padding: '8px', textAlign: 'center' }}>{it.quantity}</td>
              <td style={{ padding: '8px', textAlign: 'center' }}>{it.unit}</td>
              <td style={{ padding: '8px', textAlign: 'right' }}>{it.unitPrice?.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺</td>
              <td style={{ padding: '8px', textAlign: 'center' }}>%{it.vatRate}</td>
              <td style={{ padding: '8px', textAlign: 'right', fontWeight: 700 }}>{it.lineGrandTotal?.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: '18px', marginBottom: '24px' }}>
        <div style={{ border: '1px solid #e2e8f0', borderRadius: '6px', padding: '10px 12px', background: '#f8fafc', fontSize: '10px' }}>
          <div style={{ fontWeight: 700, color: primaryColor, marginBottom: '4px' }}>BANKA HESAP BİLGİLERİ:</div>
          <div><strong>Garanti BBVA:</strong> TR12 0006 2000 0001 2345 6789 01</div>
          <div><strong>İş Bankası:</strong> TR98 0006 4000 0002 9876 5432 01</div>
          <div style={{ marginTop: '4px', color: '#64748b' }}>Hesap Sahibi: {company?.title || 'İŞBEY TEKNOLOJİ A.Ş.'}</div>
        </div>

        <div style={{ border: '1px solid #cbd5e1', borderRadius: '6px', overflow: 'hidden' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 10px', borderBottom: '1px solid #f1f5f9' }}>
            <span>Ara Toplam:</span>
            <strong>{(payload.subTotal || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺</strong>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 10px', borderBottom: '1px solid #f1f5f9' }}>
            <span>Toplam KDV:</span>
            <strong>{(payload.totalVat || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺</strong>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 10px', background: primaryColor, color: '#fff', fontSize: '13px', fontWeight: 800 }}>
            <span>GENEL TOPLAM:</span>
            <span>{(payload.grandTotal || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺</span>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '40px', marginTop: '30px', paddingTop: '14px', borderTop: '1px solid #cbd5e1' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '10px', fontWeight: 700, color: '#64748b' }}>TESLİM EDEN</div>
          <div style={{ marginTop: '35px', fontSize: '11px', fontWeight: 700 }}>{company?.name}</div>
          <div style={{ fontSize: '10px', color: '#94a3b8' }}>(İmza / Kaşe)</div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '10px', fontWeight: 700, color: '#64748b' }}>TESLİM ALAN</div>
          <div style={{ marginTop: '35px', fontSize: '11px', fontWeight: 700 }}>{payload.customerTitle}</div>
          <div style={{ fontSize: '10px', color: '#94a3b8' }}>(İmza / Kaşe)</div>
        </div>
      </div>
    </div>
  );
};

// =========================================================================
// 4. KOMPAKT TASARIM (Compact Template) - Çok satırlı faturalar için optimize
// =========================================================================
export const CompactInvoiceTemplate: React.FC<TemplateProps> = ({ payload, company }) => {
  return (
    <div style={{ width: '210mm', minHeight: '297mm', padding: '12mm', fontSize: '10px', fontFamily: 'Inter, sans-serif', color: '#0f172a', boxSizing: 'border-box', background: '#fff' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid #334155', paddingBottom: '8px', marginBottom: '10px' }}>
        <div>
          <span style={{ fontSize: '16px', fontWeight: 800, color: '#0f172a' }}>{company?.name || 'İŞBEY'}</span>
          <span style={{ fontSize: '10px', color: '#64748b', marginLeft: '10px' }}>Tel: {company?.phone} | VKN: {company?.taxNumber}</span>
        </div>
        <div style={{ fontSize: '11px', fontWeight: 700 }}>
          <span>FATURA: #{payload.invoiceNo || 'SAT-2026-000001'}</span>
          <span style={{ marginLeft: '12px', fontWeight: 400, color: '#64748b' }}>Tarih: {payload.date}</span>
        </div>
      </div>

      <div style={{ background: '#f1f5f9', padding: '6px 10px', borderRadius: '4px', marginBottom: '10px', display: 'flex', justifyContent: 'space-between' }}>
        <div><strong>Müşteri:</strong> {payload.customerTitle} ({payload.customerCode || '-'})</div>
        <div><strong>Vade:</strong> {payload.maturityDate}</div>
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '12px', fontSize: '10px' }}>
        <thead>
          <tr style={{ background: '#e2e8f0', borderBottom: '1px solid #cbd5e1', textAlign: 'left' }}>
            <th style={{ padding: '4px 6px', width: '25px' }}>#</th>
            <th style={{ padding: '4px 6px' }}>Ürün / Hizmet Açıklaması</th>
            <th style={{ padding: '4px 6px', textAlign: 'center', width: '40px' }}>Mkt</th>
            <th style={{ padding: '4px 6px', textAlign: 'center', width: '35px' }}>Brm</th>
            <th style={{ padding: '4px 6px', textAlign: 'right', width: '70px' }}>Fiyat</th>
            <th style={{ padding: '4px 6px', textAlign: 'center', width: '35px' }}>KDV</th>
            <th style={{ padding: '4px 6px', textAlign: 'right', width: '80px' }}>Tutar</th>
          </tr>
        </thead>
        <tbody>
          {(payload.items || []).map((it: any, idx: number) => (
            <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
              <td style={{ padding: '4px 6px' }}>{idx + 1}</td>
              <td style={{ padding: '4px 6px' }}>{it.productName} ({it.productCode})</td>
              <td style={{ padding: '4px 6px', textAlign: 'center' }}>{it.quantity}</td>
              <td style={{ padding: '4px 6px', textAlign: 'center' }}>{it.unit}</td>
              <td style={{ padding: '4px 6px', textAlign: 'right' }}>{it.unitPrice?.toFixed(2)} ₺</td>
              <td style={{ padding: '4px 6px', textAlign: 'center' }}>%{it.vatRate}</td>
              <td style={{ padding: '4px 6px', textAlign: 'right', fontWeight: 700 }}>{it.lineGrandTotal?.toFixed(2)} ₺</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <div style={{ width: '200px', fontSize: '10px', border: '1px solid #cbd5e1', borderRadius: '4px', overflow: 'hidden' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 8px', borderBottom: '1px solid #f1f5f9' }}>
            <span>Ara Toplam:</span>
            <span>{(payload.subTotal || 0).toFixed(2)} ₺</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 8px', borderBottom: '1px solid #f1f5f9' }}>
            <span>KDV Toplamı:</span>
            <span>{(payload.totalVat || 0).toFixed(2)} ₺</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 8px', background: '#0f172a', color: '#fff', fontWeight: 800, fontSize: '11px' }}>
            <span>TOPLAM:</span>
            <span>{(payload.grandTotal || 0).toFixed(2)} ₺</span>
          </div>
        </div>
      </div>
    </div>
  );
};

// =========================================================================
// 5. PROFESYONEL TASARIM (Professional Template) - Renkli başlık, QR kod, detaylı KDV matrahı
// =========================================================================
export const ProfessionalInvoiceTemplate: React.FC<TemplateProps> = ({ payload, company, settings }) => {
  const primaryColor = settings?.primaryColor || '#0066cc';
  const showQr = settings?.showQrCode ?? true;

  return (
    <div style={{ width: '210mm', minHeight: '297mm', padding: '18mm', fontSize: '11px', fontFamily: 'Inter, sans-serif', color: '#111827', boxSizing: 'border-box', background: '#fff' }}>
      {/* 2026-09-13 (tasarım sadeleştirmesi): bu gradyan KORUNDU — burası yazdırılan
          fatura belgesi şablonu (basılı doküman); belge estetiği uygulama arayüzü
          kuralının dışında tutulur. */}
      <div style={{ background: 'linear-gradient(135deg, ' + primaryColor + ', #0284c7)', color: '#fff', padding: '14px 18px', borderRadius: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
        <div>
          <h1 style={{ fontSize: '20px', fontWeight: 800, margin: 0 }}>{company?.title || 'İŞBEY TEKNOLOJİ VE TİC. A.Ş.'}</h1>
          <div style={{ fontSize: '11px', opacity: 0.9, marginTop: '2px' }}>{company?.address} | Tel: {company?.phone}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '16px', fontWeight: 900, letterSpacing: '1px' }}>E-ARŞİV FATURA</div>
          <div style={{ fontSize: '11px', opacity: 0.9 }}>No: {payload.invoiceNo || 'SAT-2026-000001'}</div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr auto', gap: '14px', marginBottom: '18px', alignItems: 'stretch' }}>
        <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '10px 14px', background: '#f8fafc' }}>
          <div style={{ fontSize: '10px', fontWeight: 700, color: primaryColor, textTransform: 'uppercase', marginBottom: '3px' }}>SAYIN / MÜŞTERİ BİLGİLERİ:</div>
          <div style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a' }}>{payload.customerTitle}</div>
          <div style={{ fontSize: '11px', color: '#475569', marginTop: '2px' }}>{payload.customerAddress || 'Adres Kayıtlı'}</div>
          <div style={{ fontSize: '11px', color: '#64748b' }}>VKN/TCKN: {payload.taxNumber || '-'} | V.D.: {payload.taxOffice || '-'}</div>
        </div>

        <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '10px 14px', background: '#f8fafc', fontSize: '11px' }}>
          <div><strong>Fatura Tarihi:</strong> {payload.date}</div>
          <div><strong>Ödeme Vadesi:</strong> {payload.maturityDate}</div>
          <div><strong>Ödeme Şekli:</strong> {payload.paymentType === 'CASH' ? 'Nakit' : payload.paymentType === 'CREDIT_CARD' ? 'Kredi Kartı' : 'Açık Hesap'}</div>
          <div><strong>Düzenleyen:</strong> İŞBEY ERP</div>
        </div>

        {showQr && (
          <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '8px', background: '#ffffff', textAlign: 'center', width: '85px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ width: '60px', height: '60px', background: '#000', margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', padding: '4px', gap: '2px' }}>
              <div style={{ background: '#fff' }} /><div style={{ background: '#000' }} /><div style={{ background: '#fff' }} /><div style={{ background: '#000' }} /><div style={{ background: '#fff' }} />
              <div style={{ background: '#000' }} /><div style={{ background: '#fff' }} /><div style={{ background: '#000' }} /><div style={{ background: '#fff' }} /><div style={{ background: '#000' }} />
              <div style={{ background: '#fff' }} /><div style={{ background: '#000' }} /><div style={{ background: '#fff' }} /><div style={{ background: '#000' }} /><div style={{ background: '#fff' }} />
              <div style={{ background: '#000' }} /><div style={{ background: '#fff' }} /><div style={{ background: '#000' }} /><div style={{ background: '#fff' }} /><div style={{ background: '#000' }} />
              <div style={{ background: '#fff' }} /><div style={{ background: '#000' }} /><div style={{ background: '#fff' }} /><div style={{ background: '#000' }} /><div style={{ background: '#fff' }} />
            </div>
            <div style={{ fontSize: '8px', color: '#64748b', marginTop: '4px' }}>Doğrulama QR</div>
          </div>
        )}
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '18px', fontSize: '11px' }}>
        <thead>
          <tr style={{ background: '#f1f5f9', borderBottom: '2px solid ' + primaryColor, textAlign: 'left', fontSize: '10px', textTransform: 'uppercase' }}>
            <th style={{ padding: '8px', width: '30px' }}>#</th>
            <th style={{ padding: '8px' }}>Ürün / Hizmet Açıklaması</th>
            <th style={{ padding: '8px', textAlign: 'center', width: '50px' }}>Miktar</th>
            <th style={{ padding: '8px', textAlign: 'center', width: '45px' }}>Birim</th>
            <th style={{ padding: '8px', textAlign: 'right', width: '85px' }}>Birim Fiyat</th>
            <th style={{ padding: '8px', textAlign: 'center', width: '45px' }}>KDV</th>
            <th style={{ padding: '8px', textAlign: 'right', width: '95px' }}>Toplam Tutar</th>
          </tr>
        </thead>
        <tbody>
          {(payload.items || []).map((it: any, idx: number) => (
            <tr key={idx} style={{ borderBottom: '1px solid #e2e8f0' }}>
              <td style={{ padding: '8px', textAlign: 'center' }}>{idx + 1}</td>
              <td style={{ padding: '8px' }}>
                <span style={{ fontWeight: 600 }}>{it.productName}</span>
                <span style={{ fontSize: '10px', color: '#64748b', marginLeft: '6px' }}>({it.productCode})</span>
              </td>
              <td style={{ padding: '8px', textAlign: 'center' }}>{it.quantity}</td>
              <td style={{ padding: '8px', textAlign: 'center' }}>{it.unit}</td>
              <td style={{ padding: '8px', textAlign: 'right' }}>{it.unitPrice?.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺</td>
              <td style={{ padding: '8px', textAlign: 'center' }}>%{it.vatRate}</td>
              <td style={{ padding: '8px', textAlign: 'right', fontWeight: 700, color: '#0f172a' }}>
                {it.lineGrandTotal?.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: '18px', marginBottom: '24px' }}>
        <div style={{ border: '1px solid #e2e8f0', borderRadius: '6px', padding: '10px', background: '#f8fafc', fontSize: '10px' }}>
          <div style={{ fontWeight: 700, color: primaryColor, marginBottom: '4px' }}>KDV HESAP TABLOSU:</div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '10px' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #cbd5e1', textAlign: 'left', color: '#64748b' }}>
                <th style={{ padding: '2px 4px' }}>KDV Oranı</th>
                <th style={{ padding: '2px 4px', textAlign: 'right' }}>Matrah</th>
                <th style={{ padding: '2px 4px', textAlign: 'right' }}>KDV Tutarı</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={{ padding: '3px 4px' }}>%20</td>
                <td style={{ padding: '3px 4px', textAlign: 'right' }}>{(payload.subTotal || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺</td>
                <td style={{ padding: '3px 4px', textAlign: 'right' }}>{(payload.totalVat || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺</td>
              </tr>
            </tbody>
          </table>
          <div style={{ marginTop: '8px', color: '#64748b' }}>
            {payload.notes || settings?.footerNotes || 'İşbu fatura 213 sayılı V.U.K. hükümlerine göre tanzim edilmiştir.'}
          </div>
        </div>

        <div style={{ border: '1px solid #cbd5e1', borderRadius: '8px', overflow: 'hidden' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 12px', borderBottom: '1px solid #f1f5f9' }}>
            <span style={{ color: '#64748b' }}>Mal / Hizmet Toplamı:</span>
            <strong>{(payload.subTotal || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺</strong>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 12px', borderBottom: '1px solid #f1f5f9' }}>
            <span style={{ color: '#64748b' }}>Hesaplanan KDV:</span>
            <strong>{(payload.totalVat || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺</strong>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 12px', background: primaryColor, color: '#ffffff', fontSize: '14px', fontWeight: 900 }}>
            <span>ÖDENECEK TUTAR:</span>
            <span>{(payload.grandTotal || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺</span>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '40px', marginTop: '30px', paddingTop: '14px', borderTop: '1px solid #e2e8f0' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '10px', fontWeight: 700, color: '#64748b' }}>DÜZENLEYEN YETKİLİ</div>
          <div style={{ marginTop: '35px', fontSize: '11px', fontWeight: 700 }}>{company?.title}</div>
          <div style={{ fontSize: '10px', color: '#94a3b8' }}>(İmza / Kaşe)</div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '10px', fontWeight: 700, color: '#64748b' }}>TESLİM ALAN CARİ</div>
          <div style={{ marginTop: '35px', fontSize: '11px', fontWeight: 700 }}>{payload.customerTitle}</div>
          <div style={{ fontSize: '10px', color: '#94a3b8' }}>(İmza / Kaşe)</div>
        </div>
      </div>
    </div>
  );
};

