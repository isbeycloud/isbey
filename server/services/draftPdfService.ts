/**
 * İŞBEY CLOUD — Taslak Fatura PDF Servisi (2026-10-12)
 * ====================================================
 * Gelen (PURCHASE taslak) ve giden (SALES taslak) faturalar için sunucuda
 * YAZDIRILABİLİR HTML üretir. İstemci bu HTML'i mevcut PrintModal akışıyla
 * (tarayıcı yazdırma / jsPDF) PDF'e çevirir — sunucuda PDF KÜTÜPHANESİ YOKTUR.
 *
 * NEDEN SUNUCUDA PDF YOK:
 *  - Native PDF motoru (puppeteer/wkhtmltopdf) sunucu imajına ağır bağımlılık
 *    ve güvenlik yüzeyi eklerdi. Mevcut istemci PDF akışı (jsPDF +
 *    html2canvas) zaten kurulu ve testli — tek PDF yolu korunur.
 *  - Sunucu yalnız İÇERİĞİ üretir (HTML + veri); biçimlendirme mevcut
 *    fatura tasarım sistemiyle (invoiceDesigns / DocumentTemplateEngine
 *    girdisi) uyumlu tutulur.
 *
 * TASLAK DAMGASI: Çıktının en üstünde "TASLAK — Mali değeri yoktur" bandı
 * ZORUNLUDUR. Taslak çıktının gerçek fatura sanılması engellenir.
 *
 * GÜVENLİK: Tenant izolasyonu her okumada zorunlu. Yalnız `DRAFT`/gönderilmemiş
 * faturalar listelenir (SENT/DELIVERED/ACCEPTED hariç). Gelen e-Fatura havuzu
 * (`incomingInvoices`, RECEIVED/REVIEW) de dahildir — bunlar henüz alış
 * faturasına dönüşmemiş taslaklardır.
 */

import { storage } from '../db/storage';
import type { IncomingInvoice, Invoice } from '../db/schema';

export type DraftKind = 'OUTGOING' | 'INCOMING';

export interface DraftSummary {
  id: string;
  kind: DraftKind;
  /** Belge numarası (gelen havuzda tedarikçi numarası). */
  documentNo: string;
  date: string;
  counterparty: string;
  subTotal: number;
  vatAmount: number;
  grandTotal: number;
  currency: string;
  /** Giden: eInvoiceStatus; gelen: havuz durumu. */
  status: string;
  itemCount: number;
}

export interface DraftReport {
  tenantId: string;
  generatedAt: string;
  outgoing: DraftSummary[];
  incoming: DraftSummary[];
  totals: {
    outgoingCount: number;
    outgoingTotal: number;
    incomingCount: number;
    incomingTotal: number;
  };
}

const esc = (v: unknown) => String(v ?? '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]!));

const fmt = (n: unknown) => Number(n || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Gönderilmiş sayılan durumlar — taslak raporuna GİRMEZ. */
const SENT_STATES = new Set(['SENT', 'DELIVERED', 'ACCEPTED', 'SENDING', 'QUEUED']);

function isDraftInvoice(inv: Invoice): boolean {
  if (inv.isDeleted || inv.status === 'CANCELLED') return false;
  if (inv.status === 'DRAFT') return true;
  // Gönderilmemiş satış/alış faturası = taslak (eInvoiceStatus boş veya DRAFT/ERROR).
  if (!inv.eInvoiceStatus || inv.eInvoiceStatus === 'DRAFT' || inv.eInvoiceStatus === 'ERROR') return true;
  return !SENT_STATES.has(String(inv.eInvoiceStatus));
}

function owned<T extends { tenantId?: string }>(r: T, tenantId: string): boolean {
  return r.tenantId === tenantId || (!r.tenantId && tenantId === 'tnt-isbey');
}

function outgoingSummary(inv: Invoice): DraftSummary {
  return {
    id: inv.id,
    kind: 'OUTGOING',
    documentNo: inv.invoiceNo,
    date: inv.date,
    counterparty: inv.customerTitle,
    subTotal: inv.subTotal,
    vatAmount: inv.totalVat,
    grandTotal: inv.grandTotal,
    currency: inv.currency || 'TRY',
    status: inv.eInvoiceStatus || inv.status || 'DRAFT',
    itemCount: inv.items?.length || 0,
  };
}

function incomingSummary(src: IncomingInvoice): DraftSummary {
  return {
    id: src.id,
    kind: 'INCOMING',
    documentNo: src.invoiceNo,
    date: src.issueDate,
    counterparty: src.supplierTitle,
    subTotal: src.subTotal,
    vatAmount: src.vatAmount,
    grandTotal: src.grandTotal,
    currency: src.currency || 'TRY',
    status: src.status,
    itemCount: src.items?.length || 0,
  };
}

/**
 * Taslak raporu: giden taslak faturalar + gelen havuzundaki işlenmemiş belgeler.
 * `kind` ile yön süzülür (OUTGOING/INCOMING/ALL).
 */
export function buildDraftReport(tenantId: string, kind: DraftKind | 'ALL' = 'ALL'): DraftReport {
  const db = storage.getState();

  const outgoing = (kind === 'ALL' || kind === 'OUTGOING'
    ? db.invoices.filter(i => owned(i, tenantId) && (i.type === 'SALES' || i.type === 'PURCHASE') && isDraftInvoice(i))
    : []
  ).map(outgoingSummary);

  const incoming = (kind === 'ALL' || kind === 'INCOMING'
    ? (db.incomingInvoices || []).filter(s => s.tenantId === tenantId && (s.status === 'RECEIVED' || s.status === 'UNREADABLE'))
    : []
  ).map(incomingSummary);

  const sum = (rows: DraftSummary[]) => Math.round(rows.reduce((t, r) => t + (Number(r.grandTotal) || 0), 0) * 100) / 100;

  return {
    tenantId,
    generatedAt: new Date().toISOString(),
    outgoing,
    incoming,
    totals: {
      outgoingCount: outgoing.length,
      outgoingTotal: sum(outgoing),
      incomingCount: incoming.length,
      incomingTotal: sum(incoming),
    },
  };
}

/**
 * Tek taslak faturanın YAZDIRILABİLİR HTML'i (giden ERP faturası).
 * Mevcut `invoiceDesigns` renk/başlık ayarları uygulanır; XSLT çalıştırılmaz
 * (taslak = ERP kaydı, arşiv UBL değil). Çıktı `print-surface` içine basılmaya
 * hazırdır ve TASLAK bandı taşır.
 */
export function renderOutgoingDraftHtml(
  invoiceId: string,
  tenantId: string
): { html: string; documentNo: string } {
  const db = storage.getState();
  const inv = db.invoices.find(i => i.id === invoiceId && owned(i, tenantId) && !i.isDeleted);
  if (!inv) throw new Error('Taslak fatura bulunamadı.');
  if (!isDraftInvoice(inv)) throw new Error('Bu fatura taslak değil (gönderilmiş belgelerin çıktısı e-belge portalından alınır).');

  const tenant = db.tenants.find(t => t.id === tenantId);
  const customer = db.customers.find(c => c.id === inv.customerId);
  const design = (db.invoiceDesigns || []).find(d => (d as any).tenantId === tenantId && (d as any).isDefault)
    || (db.invoiceDesigns || []).find(d => (d as any).tenantId === tenantId);
  const accent = (design as any)?.accentColor || '#d12131';

  const rows = (inv.items || []).map((it, i) => `
    <tr>
      <td style="padding:6px 8px;border:1px solid #ddd;text-align:center;">${i + 1}</td>
      <td style="padding:6px 8px;border:1px solid #ddd;">${esc(it.productName)}${it.variantName ? ` (${esc(it.variantName)})` : ''}<br><small style="color:#666;">${esc(it.productCode)}</small></td>
      <td style="padding:6px 8px;border:1px solid #ddd;text-align:right;">${Number(it.quantity || 0).toLocaleString('tr-TR')}</td>
      <td style="padding:6px 8px;border:1px solid #ddd;">${esc(it.unit)}</td>
      <td style="padding:6px 8px;border:1px solid #ddd;text-align:right;">${fmt(it.unitPrice)}</td>
      <td style="padding:6px 8px;border:1px solid #ddd;text-align:right;">%${Number(it.discount1 || 0) + Number(it.discount2 || 0)}</td>
      <td style="padding:6px 8px;border:1px solid #ddd;text-align:right;">%${it.vatRate}</td>
      <td style="padding:6px 8px;border:1px solid #ddd;text-align:right;font-weight:700;">${fmt(it.lineGrandTotal)}</td>
    </tr>`).join('');

  const html = `
  <div style="font-family:Arial,sans-serif;color:#111;max-width:800px;margin:0 auto;background:#fff;padding:24px;">
    <div style="background:#fef3c7;border:2px dashed #d97706;color:#92400e;text-align:center;font-weight:800;letter-spacing:2px;padding:8px;margin-bottom:16px;">
      TASLAK — MALİ DEĞERİ YOKTUR
    </div>
    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:16px;">
      <div>
        <div style="font-size:20px;font-weight:800;color:${esc(accent)};">${esc(tenant?.name || 'Firma')}</div>
        <div style="font-size:12px;color:#555;">${esc(tenant?.address || '')} ${esc(tenant?.city || '')}</div>
        <div style="font-size:12px;color:#555;">VKN: ${esc(tenant?.taxNumber || '')} • ${esc(tenant?.phone || '')}</div>
      </div>
      <div style="text-align:right;">
        <div style="font-size:16px;font-weight:800;">${inv.type === 'PURCHASE' ? 'ALIŞ' : 'SATIŞ'} FATURASI (TASLAK)</div>
        <div style="font-size:13px;">Belge No: <strong>${esc(inv.invoiceNo)}</strong></div>
        <div style="font-size:12px;color:#555;">Tarih: ${esc(inv.date)} • Vade: ${esc(inv.maturityDate)}</div>
        <div style="font-size:12px;color:#555;">Senaryo: ${esc(inv.invoiceProfile || '')} • Tür: ${esc(inv.invoiceCategory || '')}</div>
      </div>
    </div>
    <div style="display:flex;gap:16px;margin-bottom:16px;">
      <div style="flex:1;border:1px solid #ddd;padding:10px;">
        <div style="font-size:11px;color:#666;font-weight:700;">SAYIN</div>
        <div style="font-weight:700;">${esc(customer?.title || inv.customerTitle)}</div>
        <div style="font-size:12px;color:#555;">${esc(customer?.address || '')} ${esc(customer?.city || '')}</div>
        <div style="font-size:12px;color:#555;">VKN/TCKN: ${esc(customer?.taxNumber || '')}</div>
      </div>
    </div>
    <table style="width:100%;border-collapse:collapse;font-size:12px;margin-bottom:12px;">
      <thead><tr style="background:#f3f4f6;">
        <th style="padding:6px 8px;border:1px solid #ddd;">#</th>
        <th style="padding:6px 8px;border:1px solid #ddd;text-align:left;">Mal / Hizmet</th>
        <th style="padding:6px 8px;border:1px solid #ddd;text-align:right;">Miktar</th>
        <th style="padding:6px 8px;border:1px solid #ddd;">Birim</th>
        <th style="padding:6px 8px;border:1px solid #ddd;text-align:right;">Birim Fiyat</th>
        <th style="padding:6px 8px;border:1px solid #ddd;text-align:right;">İsk.</th>
        <th style="padding:6px 8px;border:1px solid #ddd;text-align:right;">KDV</th>
        <th style="padding:6px 8px;border:1px solid #ddd;text-align:right;">Toplam</th>
      </tr></thead>
      <tbody>${rows || '<tr><td colspan="8" style="padding:8px;border:1px solid #ddd;text-align:center;color:#888;">Kalem yok</td></tr>'}</tbody>
    </table>
    <div style="display:flex;justify-content:flex-end;">
      <table style="font-size:13px;border-collapse:collapse;min-width:260px;">
        <tr><td style="padding:4px 8px;color:#555;">Matrah</td><td style="padding:4px 8px;text-align:right;">${fmt(inv.subTotal)} ${esc(inv.currency || 'TRY')}</td></tr>
        <tr><td style="padding:4px 8px;color:#555;">İskonto</td><td style="padding:4px 8px;text-align:right;">${fmt(inv.totalDiscount)} ${esc(inv.currency || 'TRY')}</td></tr>
        <tr><td style="padding:4px 8px;color:#555;">KDV</td><td style="padding:4px 8px;text-align:right;">${fmt(inv.totalVat)} ${esc(inv.currency || 'TRY')}</td></tr>
        <tr style="font-weight:800;font-size:15px;border-top:2px solid ${esc(accent)};"><td style="padding:6px 8px;">GENEL TOPLAM</td><td style="padding:6px 8px;text-align:right;">${fmt(inv.grandTotal)} ${esc(inv.currency || 'TRY')}</td></tr>
      </table>
    </div>
    ${inv.notes ? `<div style="margin-top:12px;font-size:12px;color:#555;">Not: ${esc(inv.notes)}</div>` : ''}
    <div style="margin-top:16px;font-size:10px;color:#999;text-align:center;">Bu belge taslaktır; e-Fatura/e-Arşiv yerine geçmez. Oluşturma: ${esc(new Date().toLocaleString('tr-TR'))}</div>
  </div>`;

  return { html, documentNo: inv.invoiceNo };
}

/**
 * Gelen havuz belgesinin YAZDIRILABİLİR HTML'i (henüz alış faturasına
 * dönüşmemiş taslak). Kaynak havuz kaydıdır; tutarlar havuzdan okunur.
 */
export function renderIncomingDraftHtml(
  incomingId: string,
  tenantId: string
): { html: string; documentNo: string } {
  const db = storage.getState();
  const src = (db.incomingInvoices || []).find(i => i.id === incomingId && i.tenantId === tenantId);
  if (!src) throw new Error('Gelen belge bulunamadı.');
  if (src.status !== 'RECEIVED' && src.status !== 'UNREADABLE') {
    throw new Error('Bu gelen belge taslak değil (zaten işlenmiş).');
  }

  const rows = (src.items || []).map((it: any, i: number) => `
    <tr>
      <td style="padding:6px 8px;border:1px solid #ddd;text-align:center;">${i + 1}</td>
      <td style="padding:6px 8px;border:1px solid #ddd;">${esc(it.productName || it.name)}</td>
      <td style="padding:6px 8px;border:1px solid #ddd;text-align:right;">${Number(it.quantity || 0).toLocaleString('tr-TR')}</td>
      <td style="padding:6px 8px;border:1px solid #ddd;text-align:right;">${fmt(it.unitPrice)}</td>
      <td style="padding:6px 8px;border:1px solid #ddd;text-align:right;">%${it.vatRate ?? ''}</td>
      <td style="padding:6px 8px;border:1px solid #ddd;text-align:right;font-weight:700;">${fmt(it.lineTotal ?? (Number(it.quantity || 0) * Number(it.unitPrice || 0)))}</td>
    </tr>`).join('');

  const html = `
  <div style="font-family:Arial,sans-serif;color:#111;max-width:800px;margin:0 auto;background:#fff;padding:24px;">
    <div style="background:#fef3c7;border:2px dashed #d97706;color:#92400e;text-align:center;font-weight:800;letter-spacing:2px;padding:8px;margin-bottom:16px;">
      TASLAK — GELEN BELGE ÖNİZLEMESİ, MALİ DEĞERİ YOKTUR
    </div>
    <div style="display:flex;justify-content:space-between;margin-bottom:16px;">
      <div>
        <div style="font-size:16px;font-weight:800;">GELEN FATURA (TASLAK)</div>
        <div style="font-size:13px;">Tedarikçi Belge No: <strong>${esc(src.invoiceNo)}</strong></div>
        <div style="font-size:12px;color:#555;">Tarih: ${esc(src.issueDate)} • Durum: ${esc(src.status)}</div>
      </div>
      <div style="text-align:right;">
        <div style="font-weight:700;">${esc(src.supplierTitle)}</div>
        <div style="font-size:12px;color:#555;">VKN: ${esc(src.supplierTaxNumber)}</div>
      </div>
    </div>
    <table style="width:100%;border-collapse:collapse;font-size:12px;margin-bottom:12px;">
      <thead><tr style="background:#f3f4f6;">
        <th style="padding:6px 8px;border:1px solid #ddd;">#</th>
        <th style="padding:6px 8px;border:1px solid #ddd;text-align:left;">Mal / Hizmet</th>
        <th style="padding:6px 8px;border:1px solid #ddd;text-align:right;">Miktar</th>
        <th style="padding:6px 8px;border:1px solid #ddd;text-align:right;">Birim Fiyat</th>
        <th style="padding:6px 8px;border:1px solid #ddd;text-align:right;">KDV</th>
        <th style="padding:6px 8px;border:1px solid #ddd;text-align:right;">Toplam</th>
      </tr></thead>
      <tbody>${rows || '<tr><td colspan="6" style="padding:8px;border:1px solid #ddd;text-align:center;color:#888;">Kalem yok</td></tr>'}</tbody>
    </table>
    <div style="display:flex;justify-content:flex-end;">
      <table style="font-size:13px;border-collapse:collapse;min-width:260px;">
        <tr><td style="padding:4px 8px;color:#555;">Matrah</td><td style="padding:4px 8px;text-align:right;">${fmt(src.subTotal)} ${esc(src.currency || 'TRY')}</td></tr>
        <tr><td style="padding:4px 8px;color:#555;">KDV</td><td style="padding:4px 8px;text-align:right;">${fmt(src.vatAmount)} ${esc(src.currency || 'TRY')}</td></tr>
        <tr style="font-weight:800;font-size:15px;border-top:2px solid #d97706;"><td style="padding:6px 8px;">GENEL TOPLAM</td><td style="padding:6px 8px;text-align:right;">${fmt(src.grandTotal)} ${esc(src.currency || 'TRY')}</td></tr>
      </table>
    </div>
    <div style="margin-top:16px;font-size:10px;color:#999;text-align:center;">Bu belge gelen kutusu önizlemesidir; alış faturası yerine geçmez. Oluşturma: ${esc(new Date().toLocaleString('tr-TR'))}</div>
  </div>`;

  return { html, documentNo: src.invoiceNo };
}
