import React from 'react';
import type { IngestionPlan, Product } from '../../../types';
import { Modal } from '../../common/Modal';
import {
  AlertTriangle, CheckCircle2, HelpCircle, ArrowRight, PackagePlus, UserPlus,
} from 'lucide-react';

/**
 * EŞLEŞTİRME / ONAY EKRANI (yarı otomatik)
 * ═══════════════════════════════════════════════════════════════════════════
 * 2026-09-28 eklendi. Kullanıcı kararı: "Onay ekranı (yarı otomatik)" —
 * sistem eşleştirmeyi ÖNERİR, kullanıcı doğrular veya düzeltir.
 *
 * ⚠️ BU EKRAN HİÇBİR ŞEY YAZMAZ. Plan sunucudan salt-okunur gelir; stok/cari
 * hareketi yalnız `onConfirm` çağrısıyla, sunucuda, transaction içinde oluşur.
 *
 * ⚠️ KESİN OLMAYAN ÖNERİ GİZLENMEZ: VKN eşleşmediyse veya satır "yeni kart
 * gerekli" ise bu AÇIKÇA gösterilir. Sessizce varsayılan bir karta bağlamak,
 * yanlış cariye borç yazmanın en kolay yoludur.
 */

interface Props {
  isOpen: boolean;
  loading: boolean;
  tur: 'INVOICE' | 'DESPATCH';
  plan: IngestionPlan | null;
  urunler: Product[];
  cariler: { id: string; title: string; code: string }[];
  urunSecimi: Record<string, string>;
  setUrunSecimi: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  saticiSecimi: string;
  setSaticiSecimi: (id: string) => void;
  yeniSatici: boolean;
  setYeniSatici: (v: boolean) => void;
  islemde: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

/** Eşleşme yöntemini kullanıcı diline çevirir. */
const ESLEME_ETIKETI: Record<string, string> = {
  SELLER_CODE: 'Satıcı ürün kodu eşleşti',
  BARCODE: 'Barkod eşleşti',
  BUYER_CODE: 'Alıcı ürün kodu eşleşti',
  NAME: 'Ürün adı benzerliği (doğrulayın)',
};

const tutar = (n: number | undefined) =>
  n === undefined || n === null ? '—' : n.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ₺';

export const IncomingMatchModal: React.FC<Props> = ({
  isOpen, loading, tur, plan, urunler, cariler,
  urunSecimi, setUrunSecimi, saticiSecimi, setSaticiSecimi,
  yeniSatici, setYeniSatici, islemde, onClose, onConfirm,
}) => {
  const irsaliyeMi = tur === 'DESPATCH';

  const baslik = irsaliyeMi ? 'Gelen e-İrsaliye — Mal Girişi Onayı' : 'Gelen e-Fatura — Alış Faturası Onayı';

  const footer = plan ? (
    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
      <button className="btn btn-secondary" onClick={onClose} disabled={islemde}>
        Vazgeç
      </button>
      <button
        className="btn btn-primary"
        onClick={onConfirm}
        disabled={islemde || !!plan.blockedReason}
        title={plan.blockedReason ? `İçeri aktarılamaz: ${plan.blockedReason}` : undefined}
      >
        {islemde ? 'İşleniyor...' : irsaliyeMi ? 'Stok Girişini Onayla' : 'İçeri Al ve Alış Faturası Oluştur'}
      </button>
    </div>
  ) : undefined;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={baslik} size="full" footer={footer}>
      {loading || !plan ? (
        <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
          Belge içeriği çözümleniyor...
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {/* ── Engelliyse: neden içeri alınamıyor ─────────────────────── */}
          {plan.blockedReason && (
            <div style={{
              display: 'flex', gap: '8px', alignItems: 'flex-start', padding: '10px 12px',
              background: 'var(--danger-bg, rgba(220,38,38,0.08))',
              border: '1px solid var(--danger)', borderRadius: 'var(--radius-md, 8px)',
              fontSize: '13px', color: 'var(--danger)',
            }}>
              <AlertTriangle size={16} style={{ marginTop: '1px', flexShrink: 0 }} />
              <div>
                <b>Bu belge içeri aktarılamaz.</b>
                <div style={{ marginTop: '2px' }}>{plan.blockedReason}</div>
              </div>
            </div>
          )}

          {/* ── Belge künyesi ──────────────────────────────────────────── */}
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '10px',
            padding: '12px', background: 'var(--bg-surface-secondary)',
            border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md, 8px)',
          }}>
            {[
              { etiket: irsaliyeMi ? 'İrsaliye No' : 'Fatura No', deger: plan.document.documentNo || '—' },
              { etiket: 'Belge Tarihi', deger: plan.document.issueDate || '—' },
              { etiket: 'ETTN', deger: plan.document.uuid || '—', kucuk: true },
              { etiket: 'Tedarikçi', deger: plan.document.supplier.title || '—' },
              { etiket: 'VKN', deger: plan.document.supplier.taxNumber || '—' },
              { etiket: 'Para Birimi', deger: plan.document.currency || 'TRY' },
            ].map(k => (
              <div key={k.etiket}>
                <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                  {k.etiket}
                </div>
                <div style={{ fontSize: k.kucuk ? '11px' : '13px', fontWeight: 600, wordBreak: 'break-all' }}>
                  {k.deger}
                </div>
              </div>
            ))}
          </div>

          {/* ── Belgenin kendi uyarıları — SESSİZ KALMAZ ───────────────── */}
          {plan.document.warnings.length > 0 && (
            <div style={{
              padding: '10px 12px', background: 'rgba(217,119,6,0.08)',
              border: '1px solid var(--warning)', borderRadius: 'var(--radius-md, 8px)', fontSize: '12px',
            }}>
              <b style={{ color: 'var(--warning)' }}>Belge uyarıları</b>
              <ul style={{ margin: '6px 0 0 16px', padding: 0, color: 'var(--text-main)' }}>
                {plan.document.warnings.map((w, i) => <li key={i}>{w}</li>)}
              </ul>
            </div>
          )}

          {/* ── Tedarikçi eşleştirmesi ─────────────────────────────────── */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
              <h4 style={{ margin: 0, fontSize: '13px' }}>Tedarikçi Eşleştirmesi</h4>
              {plan.party.exact ? (
                <span className="badge badge-success" style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                  <CheckCircle2 size={11} /> VKN ile kesin eşleşti
                </span>
              ) : (
                <span className="badge badge-warning" style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                  <HelpCircle size={11} /> Doğrulanmalı
                </span>
              )}
            </div>

            {/* Önerinin NEDENİ — kullanıcı belirsizliği görebilsin. */}
            {plan.party.reason && (
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '8px' }}>
                {plan.party.reason}
              </div>
            )}

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <select
                className="form-input"
                style={{ maxWidth: '380px' }}
                value={yeniSatici ? '' : saticiSecimi}
                disabled={yeniSatici}
                onChange={e => setSaticiSecimi(e.target.value)}
              >
                <option value="">— Mevcut cari seçin —</option>
                {cariler.map(c => (
                  <option key={c.id} value={c.id}>{c.code} · {c.title}</option>
                ))}
              </select>

              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={yeniSatici}
                  onChange={e => setYeniSatici(e.target.checked)}
                />
                <UserPlus size={13} />
                <span>Belgedeki bilgilerle yeni tedarikçi kartı aç</span>
              </label>
            </div>

            {/* İrsaliyede cari seçimi yalnız KAYIT amaçlıdır — borç yazılmaz. */}
            {irsaliyeMi && (
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '6px' }}>
                İrsaliyede tedarikçi seçimi yalnız stok hareketinin kaynağını belgeler; <b>cari borç yazılmaz</b>.
              </div>
            )}
          </div>

          {/* ── Kalem eşleştirmesi ─────────────────────────────────────── */}
          <div>
            <h4 style={{ margin: '0 0 6px', fontSize: '13px' }}>
              Kalem Eşleştirmesi ({plan.lines.length} satır)
            </h4>

            <div style={{ overflowX: 'auto', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md, 8px)' }}>
              <table className="data-table" style={{ width: '100%', fontSize: '12px' }}>
                <thead>
                  <tr>
                    <th style={{ width: '40px' }}>#</th>
                    <th>Belgedeki Kalem</th>
                    <th style={{ width: '90px' }}>Miktar</th>
                    <th style={{ width: '70px' }}>Birim</th>
                    {/* Fiyat/KDV kolonları irsaliyede gösterilmez: belgede YOKTUR. */}
                    {!irsaliyeMi && <th style={{ width: '100px' }}>Birim Fiyat</th>}
                    {!irsaliyeMi && <th style={{ width: '70px' }}>KDV</th>}
                    <th style={{ width: '110px' }}>Eşleşme</th>
                    <th style={{ minWidth: '220px' }}>Stok Kartı</th>
                  </tr>
                </thead>
                <tbody>
                  {plan.lines.map(l => {
                    const secilen = urunSecimi[l.line.lineNo] || '';
                    return (
                      <tr key={l.line.lineNo}>
                        <td>{l.line.lineNo}</td>
                        <td>
                          <div style={{ fontWeight: 600 }}>{l.line.name || '—'}</div>
                          <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                            {l.line.sellerProductCode ? `Kod: ${l.line.sellerProductCode}` : 'Kod yok'}
                            {l.line.barcode ? ` · Barkod: ${l.line.barcode}` : ''}
                          </div>
                        </td>
                        <td style={{ textAlign: 'right' }}>{l.line.quantity}</td>
                        <td>{l.line.unitName}</td>
                        {!irsaliyeMi && <td style={{ textAlign: 'right' }}>{tutar(l.line.unitPrice)}</td>}
                        {!irsaliyeMi && <td style={{ textAlign: 'right' }}>%{l.line.vatRate}</td>}
                        <td>
                          {l.product ? (
                            <span
                              className={`badge ${l.matchedBy === 'NAME' ? 'badge-warning' : 'badge-success'}`}
                              style={{ fontSize: '10px' }}
                              title={ESLEME_ETIKETI[l.matchedBy || ''] || ''}
                            >
                              {l.matchedBy === 'NAME' ? 'Ada göre (zayıf)' : 'Eşleşti'}
                            </span>
                          ) : (
                            <span className="badge badge-danger" style={{ fontSize: '10px' }}>Kart yok</span>
                          )}
                        </td>
                        <td>
                          <select
                            className="form-input"
                            value={secilen}
                            onChange={e => setUrunSecimi(prev => ({ ...prev, [l.line.lineNo]: e.target.value }))}
                          >
                            <option value="">— Yeni stok kartı aç —</option>
                            {urunler.map(p => (
                              <option key={p.id} value={p.id}>{p.code} · {p.name}</option>
                            ))}
                          </select>
                          {!secilen && (
                            <div style={{ fontSize: '10px', color: 'var(--warning)', marginTop: '3px', display: 'flex', alignItems: 'center', gap: '3px' }}>
                              <PackagePlus size={11} />
                              <span>
                                Bu satır için yeni kart açılacak
                                {l.line.sellerProductCode ? `: ${l.line.sellerProductCode}` : ''}
                              </span>
                            </div>
                          )}
                          {l.product && l.matchedBy === 'NAME' && (
                            <div style={{ fontSize: '10px', color: 'var(--warning)', marginTop: '3px' }}>
                              Ada göre önerildi — farklı ürünse değiştirin.
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* ── Toplamlar ──────────────────────────────────────────────── */}
          {irsaliyeMi ? (
            <div style={{
              padding: '10px 12px', background: 'var(--bg-surface-secondary)',
              border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md, 8px)', fontSize: '12px',
            }}>
              <b>Bu belgede tutar yoktur.</b>{' '}
              e-İrsaliye bir sevk belgesidir; birim fiyat ve KDV içermez. Stok girişi
              fiyatsız yapılır, maliyet satıcının faturasıyla oluşur.
            </div>
          ) : (
            <div style={{
              display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '10px',
              padding: '12px', background: 'var(--bg-surface-secondary)',
              border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md, 8px)', fontSize: '12px',
            }}>
              <div>
                <div style={{ color: 'var(--text-muted)', fontSize: '10px' }}>KDV HARİÇ (hesaplanan)</div>
                <div style={{ fontWeight: 700 }}>{tutar(plan.totals.computedSubTotal)}</div>
              </div>
              <div>
                <div style={{ color: 'var(--text-muted)', fontSize: '10px' }}>KDV (hesaplanan)</div>
                <div style={{ fontWeight: 700 }}>{tutar(plan.totals.computedVatTotal)}</div>
              </div>
              <div>
                <div style={{ color: 'var(--text-muted)', fontSize: '10px' }}>GENEL TOPLAM (hesaplanan)</div>
                <div style={{ fontWeight: 700, color: 'var(--primary)' }}>{tutar(plan.totals.computedGrandTotal)}</div>
              </div>
              {plan.totals.declaredPayable !== undefined && (
                <div>
                  <div style={{ color: 'var(--text-muted)', fontSize: '10px' }}>BELGENİN BİLDİRDİĞİ</div>
                  <div style={{ fontWeight: 700 }}>{tutar(plan.totals.declaredPayable)}</div>
                </div>
              )}
            </div>
          )}

          {/* ── Onay sonucunun ne olacağı — açıkça yazılır ─────────────── */}
          <div style={{
            display: 'flex', gap: '8px', alignItems: 'flex-start', padding: '10px 12px',
            background: 'rgba(16,185,129,0.08)', border: '1px solid var(--success)',
            borderRadius: 'var(--radius-md, 8px)', fontSize: '12px',
          }}>
            <ArrowRight size={15} color="var(--success)" style={{ marginTop: '2px', flexShrink: 0 }} />
            <div>
              <b>Onayladığınızda ne olacak:</b>{' '}
              {irsaliyeMi ? (
                <>
                  {plan.lines.length} kalem için <b>stok girişi</b> oluşturulacak.{' '}
                  <b>Cari borç OLUŞMAYACAK</b> — borç, satıcının keseceği faturayla doğar.
                </>
              ) : (
                <>
                  <b>Alış faturası</b> oluşturulacak, {plan.lines.length} kalem için <b>stok girişi</b> yapılacak
                  ve tedarikçiye <b>{tutar(plan.totals.computedGrandTotal)} borç</b> yazılacak.
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
};
