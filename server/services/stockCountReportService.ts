/**
 * İŞBEY CLOUD — Sayım Fişi Raporu (2026-10-12)
 * ============================================
 * Sayım fişinin (+ / − farklarıyla) yazdırılabilir HTML'i. TASLAK bandı YOKTUR
 * (sayım fişi gerçek bir stok belgesidir); fiş numarası, depo, sayan, tarih ve
 * her satırın sistem/sayılan/fark değerleri yazılır. Artı ve eksi farklar
 * ayrı özetlenir.
 *
 * GÜVENLİK: Tenant izolasyonu zorunlu. Yalnız COMPLETED fişler raporlanır.
 */

import { storage } from '../db/storage';

const esc = (v: unknown) => String(v ?? '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]!));

const fmtQty = (n: unknown) => Number(n || 0).toLocaleString('tr-TR', { maximumFractionDigits: 3 });

export function renderStockCountHtml(countId: string, tenantId: string): { html: string; documentNo: string } {
  const db = storage.getState();
  const sc = (db.stockCounts || []).find(s => s.id === countId && s.tenantId === tenantId);
  if (!sc) throw new Error('Sayım fişi bulunamadı.');
  if (sc.status !== 'COMPLETED') throw new Error('Yalnız tamamlanmış sayım fişleri raporlanır.');

  const tenant = db.tenants.find(t => t.id === tenantId);

  const rows = sc.items.map((it, i) => {
    const color = it.variance === 0 ? '#166534' : it.variance > 0 ? '#1d4ed8' : '#b91c1c';
    const sign = it.variance > 0 ? '+' : '';
    return `
    <tr>
      <td style="padding:6px 8px;border:1px solid #ddd;text-align:center;">${i + 1}</td>
      <td style="padding:6px 8px;border:1px solid #ddd;">${esc(it.productName)}${it.variantName ? ` (${esc(it.variantName)})` : ''}<br><small style="color:#666;">${esc(it.productCode)} • ${esc(it.barcode)}</small></td>
      <td style="padding:6px 8px;border:1px solid #ddd;text-align:right;">${fmtQty(it.systemQuantity)}</td>
      <td style="padding:6px 8px;border:1px solid #ddd;text-align:right;font-weight:700;">${fmtQty(it.countedQuantity)}</td>
      <td style="padding:6px 8px;border:1px solid #ddd;text-align:right;font-weight:700;color:${color};">${sign}${fmtQty(it.variance)} ${esc(it.unit)}</td>
    </tr>`;
  }).join('');

  const plus = sc.items.filter(i => i.variance > 0);
  const minus = sc.items.filter(i => i.variance < 0);
  const exact = sc.items.filter(i => i.variance === 0);
  const plusQty = plus.reduce((s, i) => s + i.variance, 0);
  const minusQty = minus.reduce((s, i) => s + Math.abs(i.variance), 0);

  const html = `
  <div style="font-family:Arial,sans-serif;color:#111;max-width:800px;margin:0 auto;background:#fff;padding:24px;">
    <div style="display:flex;justify-content:space-between;margin-bottom:16px;">
      <div>
        <div style="font-size:20px;font-weight:800;">${esc(tenant?.name || 'Firma')}</div>
        <div style="font-size:12px;color:#555;">VKN: ${esc(tenant?.taxNumber || '')}</div>
      </div>
      <div style="text-align:right;">
        <div style="font-size:16px;font-weight:800;">STOK SAYIM FİŞİ</div>
        <div style="font-size:13px;">Fiş No: <strong>${esc(sc.countNumber)}</strong></div>
        <div style="font-size:12px;color:#555;">Tarih: ${esc((sc.completedAt || sc.createdAt || '').slice(0, 10))}</div>
        <div style="font-size:12px;color:#555;">Depo: ${esc(sc.warehouseName)} • Sayan: ${esc(sc.countedBy)}</div>
      </div>
    </div>
    <table style="width:100%;border-collapse:collapse;font-size:12px;margin-bottom:12px;">
      <thead><tr style="background:#f3f4f6;">
        <th style="padding:6px 8px;border:1px solid #ddd;">#</th>
        <th style="padding:6px 8px;border:1px solid #ddd;text-align:left;">Ürün</th>
        <th style="padding:6px 8px;border:1px solid #ddd;text-align:right;">Sistem</th>
        <th style="padding:6px 8px;border:1px solid #ddd;text-align:right;">Sayılan</th>
        <th style="padding:6px 8px;border:1px solid #ddd;text-align:right;">Fark</th>
      </tr></thead>
      <tbody>${rows || '<tr><td colspan="5" style="padding:8px;border:1px solid #ddd;text-align:center;">Satır yok</td></tr>'}</tbody>
    </table>
    <div style="display:flex;gap:12px;font-size:13px;">
      <div style="flex:1;border:1px solid #bbf7d0;background:#f0fdf4;padding:8px 12px;border-radius:6px;">
        <strong style="color:#166534;">Fazla (+) — ${plus.length} satır</strong><br>Toplam: +${fmtQty(Math.round(plusQty * 1000) / 1000)} (stoğa GİRİŞ yazıldı)
      </div>
      <div style="flex:1;border:1px solid #fecaca;background:#fef2f2;padding:8px 12px;border-radius:6px;">
        <strong style="color:#b91c1c;">Eksik (−) — ${minus.length} satır</strong><br>Toplam: −${fmtQty(Math.round(minusQty * 1000) / 1000)} (stoktan ÇIKIŞ yazıldı)
      </div>
      <div style="flex:1;border:1px solid #ddd;background:#f9fafb;padding:8px 12px;border-radius:6px;">
        <strong>Eşit — ${exact.length} satır</strong><br>Hareket yazılmadı
      </div>
    </div>
    ${sc.notes ? `<div style="margin-top:12px;font-size:12px;color:#555;">Not: ${esc(sc.notes)}</div>` : ''}
    <div style="margin-top:16px;font-size:10px;color:#999;text-align:center;">Oluşturma: ${esc(new Date().toLocaleString('tr-TR'))}</div>
  </div>`;

  return { html, documentNo: sc.countNumber };
}
