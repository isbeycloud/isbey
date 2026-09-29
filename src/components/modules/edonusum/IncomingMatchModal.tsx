import React, { useMemo, useRef, useState, useEffect } from 'react';
import type { IngestionPlan, Product } from '../../../types';
import { Modal } from '../../common/Modal';
import {
  AlertTriangle, CheckCircle2, HelpCircle, ArrowRight, PackagePlus, UserPlus,
  Search, ListChecks, Filter, Keyboard,
} from 'lucide-react';

/**
 * EŞLEŞTİRME / ONAY EKRANI (yarı otomatik)
 * ═══════════════════════════════════════════════════════════════════════════
 * 2026-09-28 eklendi. 2026-09-29: toplu eşleştirme + onay özeti.
 *
 * ⚠️ BU EKRAN HİÇBİR ŞEY YAZMAZ. Plan sunucudan salt-okunur gelir; stok/cari
 * hareketi yalnız `onConfirm` çağrısıyla, sunucuda, transaction içinde oluşur.
 *
 * ⚠️ KESİN OLMAYAN ÖNERİ GİZLENMEZ: VKN eşleşmediyse veya satır "yeni kart
 * gerekli" ise bu AÇIKÇA gösterilir. Sessizce varsayılan bir karta bağlamak,
 * yanlış cariye borç yazmanın en kolay yoludur.
 *
 * ⚠️ "TÜMÜNÜ SEÇ" YALNIZ YÜKSEK GÜVENLİ SATIRLARI KAPSAR: ada göre benzerlik
 * (`SUGGESTION`) toplu seçime DAHİL EDİLMEZ. 100 satırlık bir faturada ada
 * göre eşleşen 3 satırı otomatik bağlamak, yanlış stoğa mal girişi yapmanın
 * en sessiz yoludur; kullanıcı her birini kendi görmelidir.
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
  SAVED_MAPPING: 'Daha önce eşleştirdiğiniz kalem (tedarikçiye özel)',
  SELLER_CODE: 'Satıcı ürün kodu eşleşti',
  BARCODE: 'Barkod eşleşti',
  BUYER_CODE: 'Alıcı ürün kodu eşleşti',
  MANUFACTURER_CODE: 'Üretici ürün kodu eşleşti',
  NAME: 'Ürün adı benzerliği (doğrulayın)',
};

/** Kısa rozet metni — asıl açıklama `title` içindedir. */
const ESLEME_ROZETI: Record<string, string> = {
  SAVED_MAPPING: 'Öğrenildi',
  SELLER_CODE: 'Satıcı kodu',
  BARCODE: 'Barkod',
  BUYER_CODE: 'Alıcı kodu',
  MANUFACTURER_CODE: 'Üretici kodu',
  NAME: 'Ada göre (zayıf)',
};

const tutar = (n: number | undefined) =>
  n === undefined || n === null ? '—' : n.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ₺';

const miktar = (n: number) =>
  (Math.round(n * 10000) / 10000).toLocaleString('tr-TR', { maximumFractionDigits: 4 });

export const IncomingMatchModal: React.FC<Props> = ({
  isOpen, loading, tur, plan, urunler, cariler,
  urunSecimi, setUrunSecimi, saticiSecimi, setSaticiSecimi,
  yeniSatici, setYeniSatici, islemde, onClose, onConfirm,
}) => {
  const irsaliyeMi = tur === 'DESPATCH';

  /** Toplu eşleştirme yardımcıları (100 satırlık fatura için). */
  const [yalnizEksik, setYalnizEksik] = useState(false);
  const [urunArama, setUrunArama] = useState('');
  const aramaRef = useRef<HTMLInputElement>(null);

  // Modal her açıldığında yerel görünüm durumu sıfırlanır: önceki belgede
  // açtığınız "yalnız eşleşmeyenler" süzgeci yeni belgeye taşınırsa kullanıcı
  // satırların kaybolduğunu sanır.
  useEffect(() => {
    if (isOpen) { setYalnizEksik(false); setUrunArama(''); }
  }, [isOpen]);

  /**
   * Klavye kısayolu: `/` ürün aramaya odaklanır, `Escape` aramayı temizler.
   * 100 satırlık bir faturada fareyle gezinmek yerine arama ile kart bulmak
   * belirgin biçimde hızlıdır.
   */
  useEffect(() => {
    if (!isOpen) return;
    const h = (e: KeyboardEvent) => {
      const hedef = e.target as HTMLElement | null;
      const yaziliyor = hedef && ['INPUT', 'SELECT', 'TEXTAREA'].includes(hedef.tagName);
      if (e.key === '/' && !yaziliyor) { e.preventDefault(); aramaRef.current?.focus(); }
      if (e.key === 'Escape' && hedef === aramaRef.current) { setUrunArama(''); }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [isOpen]);

  const baslik = irsaliyeMi ? 'Gelen e-İrsaliye — Mal Girişi Onayı' : 'Gelen e-Fatura — Alış Faturası Onayı';

  /** Arama terimine göre kart listesi. Boş terimde tümü döner. */
  const suzulmusUrunler = useMemo(() => {
    const q = urunArama.trim().toLocaleLowerCase('tr-TR');
    if (!q) return urunler;
    return urunler.filter(
      p =>
        (p.code || '').toLocaleLowerCase('tr-TR').includes(q) ||
        (p.name || '').toLocaleLowerCase('tr-TR').includes(q)
    );
  }, [urunler, urunArama]);

  /** Seçili kart, arama süzgecinde olmasa bile açılır listede KALMALIDIR. */
  const kartIdleri = useMemo(() => new Set(suzulmusUrunler.map(p => p.id)), [suzulmusUrunler]);
  const kartHaritasi = useMemo(() => {
    const m = new Map<string, Product>();
    for (const p of urunler) m.set(p.id, p);
    return m;
  }, [urunler]);

  /**
   * Sunucunun sayaçları. Arayüz kendi sayımını YAPMAZ — iki yerin ayrışması
   * "42/47 eşleşti" derken 3 satırın "kart yok" demesine yol açardı.
   */
  const ozet = plan?.matchSummary;
  const toplamSatir = ozet?.total ?? plan?.lines.length ?? 0;
  const eslesen = ozet?.matched ?? 0;
  const yuksek = ozet?.highConfidence ?? 0;
  const bekleyenEslesme = ozet?.pending ?? Math.max(0, toplamSatir - eslesen);

  /** Toplu seçim: yalnız YÜKSEK güvenli ve HENÜZ seçilmemiş satırlar. */
  const yuksekGuvenliSec = () => {
    if (!plan) return;
    setUrunSecimi(prev => {
      const yeni = { ...prev };
      for (const l of plan.lines) {
        if (l.confidence === 'HIGH' && l.product && !yeni[l.line.lineNo]) {
          yeni[l.line.lineNo] = l.product.id;
        }
      }
      return yeni;
    });
  };

  /** Seçimi tamamen temizler — her satır "yeni kart aç" durumuna döner. */
  const secimiTemizle = () => setUrunSecimi({});

  /** Görünür satırlar: "yalnız eşleşmeyenler" süzgeci. */
  const gorunurSatirlar = useMemo(() => {
    if (!plan) return [];
    if (!yalnizEksik) return plan.lines;
    return plan.lines.filter(l => !urunSecimi[l.line.lineNo]);
  }, [plan, yalnizEksik, urunSecimi]);

  /** Girilen karara göre stok girişi yapılacak toplam miktar (özet için). */
  const stokMiktari = useMemo(() => {
    if (!plan) return 0;
    return plan.lines.reduce((s, l) => s + (l.line.quantity || 0), 0);
  }, [plan]);

  /**
   * Kaç satır için YENİ kart açılacak? (Kullanıcı bir kart seçmediyse satır
   * belgedeki bilgilerle yeni kart olarak açılır — bu bilinçli bir sonuçtur ama
   * kaç satırı kapsadığı SESSİZ kalmamalıdır.)
   */
  const yeniKartSayisi = plan
    ? plan.lines.filter(l => !urunSecimi[l.line.lineNo]).length
    : 0;

  const iceriAlinacakTutar = plan?.totals.computedPayableTotal ?? plan?.totals.computedGrandTotal;

  const footer = plan ? (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', alignItems: 'center', width: '100%' }}>
      <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
        {eslesen} / {toplamSatir} eşleşti
        {bekleyenEslesme > 0 ? ` — ${bekleyenEslesme} eşleşme bekliyor` : ''}
      </div>
      <div style={{ display: 'flex', gap: '8px' }}>
        <button className="btn btn-secondary" onClick={onClose} disabled={islemde}>
          Vazgeç
        </button>
        <button
          className="btn btn-primary"
          onClick={onConfirm}
          disabled={islemde || !!plan.blockedReason}
          title={plan.blockedReason ? `İçeri aktarılamaz: ${plan.blockedReason}` : undefined}
        >
          {islemde
            ? 'İşleniyor...'
            : irsaliyeMi ? 'STOK GİRİŞİNİ ONAYLA' : 'ALIŞ FATURASI OLARAK İÇERİ AL'}
        </button>
      </div>
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
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px', marginBottom: '6px' }}>
              <h4 style={{ margin: 0, fontSize: '13px' }}>
                Kalem Eşleştirmesi ({toplamSatir} satır)
              </h4>

              {/* ── Toplu eşleştirme araçları ────────────────────────────── */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                <span className="badge badge-secondary">
                  {eslesen} / {toplamSatir} eşleşti
                </span>
                {bekleyenEslesme > 0 && (
                  <span className="badge badge-warning">{bekleyenEslesme} eşleşme bekliyor</span>
                )}
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={yuksekGuvenliSec}
                  disabled={yuksek === 0}
                  title="Yalnız barkod/kod ile KESİN eşleşen satırlar seçilir; ada göre öneriler hariçtir."
                >
                  <ListChecks size={13} />
                  <span>Yüksek Güvenli {yuksek} Satırı Seç</span>
                </button>
                <button className="btn btn-secondary btn-sm" onClick={secimiTemizle}>
                  Seçimi Temizle
                </button>
                <button
                  className={`btn ${yalnizEksik ? 'btn-primary' : 'btn-secondary'} btn-sm`}
                  onClick={() => setYalnizEksik(v => !v)}
                >
                  <Filter size={13} />
                  <span>Yalnız Eşleşmeyenler</span>
                </button>
              </div>
            </div>

            {/* Hızlı ürün arama — 100 satırlık faturada kart bulmanın en hızlı yolu. */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', flexWrap: 'wrap' }}>
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center', flex: 1, maxWidth: '380px' }}>
                <Search size={14} style={{ position: 'absolute', left: '9px', color: 'var(--text-muted)' }} />
                <input
                  ref={aramaRef}
                  type="text"
                  className="form-input"
                  style={{ paddingLeft: '30px' }}
                  placeholder="Kart ara (kod veya ad) — tüm satır listelerini süzer"
                  value={urunArama}
                  onChange={e => setUrunArama(e.target.value)}
                />
              </div>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Keyboard size={12} /> <b>/</b> ile aramaya atla
              </span>
            </div>

            {gorunurSatirlar.length === 0 ? (
              <div style={{
                padding: '18px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '12px',
                border: '1px dashed var(--border-color)', borderRadius: 'var(--radius-md, 8px)',
              }}>
                Eşleşmeyen satır kalmadı — tüm kalemler bir karta bağlı.
              </div>
            ) : (
              <div style={{ overflowX: 'auto', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md, 8px)', maxHeight: '460px', overflowY: 'auto' }}>
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
                      <th style={{ width: '120px' }}>Eşleşme</th>
                      <th style={{ minWidth: '240px' }}>Stok Kartı</th>
                    </tr>
                  </thead>
                  <tbody>
                    {gorunurSatirlar.map(l => {
                      const secilen = urunSecimi[l.line.lineNo] || '';
                      // Arama süzgeci seçili kartı GİZLEMEMELİ: kullanıcı aradığı
                      // kartı bulup seçtikten sonra arama kutusunu temizlemeyi
                      // unutursa seçiminin kaybolduğunu sanır.
                      const secilenKart = secilen ? kartHaritasi.get(secilen) : undefined;
                      const ekle = secilen && !kartIdleri.has(secilen) && secilenKart;
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
                            {secilen ? (
                              <span
                                className={`badge ${l.matchedBy === 'NAME' ? 'badge-warning' : 'badge-success'}`}
                                style={{ fontSize: '10px' }}
                                title={ESLEME_ETIKETI[l.matchedBy || ''] || 'Kullanıcı seçimi'}
                              >
                                {l.matchedBy ? (ESLEME_ROZETI[l.matchedBy] || 'Eşleşti') : 'Seçildi'}
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
                              {ekle && secilenKart && (
                                <option value={secilenKart.id}>{secilenKart.code} · {secilenKart.name}</option>
                              )}
                              {suzulmusUrunler.map(p => (
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
                            {l.matchedBy === 'NAME' && secilen && (
                              <div style={{ fontSize: '10px', color: 'var(--warning)', marginTop: '3px' }}>
                                Ada göre önerildi — farklı ürünse değiştirin.
                              </div>
                            )}
                            {l.matchedBy === 'SAVED_MAPPING' && secilen && (
                              <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '3px' }}>
                                Bu tedarikçinin bu kalemini daha önce bağlamıştınız.
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {yalnizEksik && (
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '6px' }}>
                {gorunurSatirlar.length} eşleşmeyen satır gösteriliyor; {toplamSatir - gorunurSatirlar.length} satır
                zaten bağlı. Süzgeci kapatmak için "Yalnız Eşleşmeyenler" düğmesine basın.
              </div>
            )}
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

          {/* ── ONAY ÖZETİ — düğmeye basmadan ÖNCE ne olacağı ──────────────
              ⚠️ Bu blok SÖZLEŞMEDİR: kullanıcı düğmeye basmadan önce hangi
              cariye, hangi tutarın, kaç satır için yazılacağını görmelidir.
              100 satırlık bir faturada "içeri al"a basıp sonucu görmek, geri
              alınamayan bir stok/cari hareketi demektir. */}
          <div style={{
            display: 'flex', gap: '8px', alignItems: 'flex-start', padding: '10px 12px',
            background: 'rgba(16,185,129,0.08)', border: '1px solid var(--success)',
            borderRadius: 'var(--radius-md, 8px)', fontSize: '12px',
          }}>
            <ArrowRight size={15} color="var(--success)" style={{ marginTop: '2px', flexShrink: 0 }} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', width: '100%' }}>
              <b>Onayladığınızda ne olacak:</b>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '8px' }}>
                <div>
                  <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>TEDARİKÇİ</div>
                  <div style={{ fontWeight: 600 }}>
                    {yeniSatici
                      ? `YENİ KART: ${plan.document.supplier.title || '—'}`
                      : (saticiSecimi
                          ? (cariler.find(c => c.id === saticiSecimi)?.title || '—')
                          : 'SEÇİLMEDİ')}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>BELGE</div>
                  <div style={{ fontWeight: 600 }}>
                    {plan.document.documentNo || '—'} · {plan.document.issueDate || '—'}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>KALEM / EŞLEŞEN</div>
                  <div style={{ fontWeight: 600 }}>{toplamSatir} satır · {eslesen} eşleşmiş</div>
                </div>
                <div>
                  <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>STOK GİRİŞİ</div>
                  <div style={{ fontWeight: 600 }}>{toplamSatir} kalem · toplam {miktar(stokMiktari)} adet</div>
                </div>
                {!irsaliyeMi && (
                  <>
                    <div>
                      <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>BELGE TUTARI</div>
                      <div style={{ fontWeight: 600 }}>{tutar(iceriAlinacakTutar)}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>CARİ BORÇ</div>
                      <div style={{ fontWeight: 700, color: 'var(--primary)' }}>{tutar(iceriAlinacakTutar)}</div>
                    </div>
                  </>
                )}
                {irsaliyeMi && (
                  <div>
                    <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>CARİ BORÇ</div>
                    <div style={{ fontWeight: 700 }}>OLUŞMAZ</div>
                  </div>
                )}
              </div>

              <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                {irsaliyeMi
                  ? 'İrsaliye onayı yalnız stok girişi yapar; borç, satıcının keseceği faturayla doğar.'
                  : 'Bu işlem tek bir veritabanı işlemi içinde yapılır: herhangi bir adım başarısız olursa HİÇBİR kayıt oluşmaz.'}
              </div>

              {/* Kararsız satır varsa uyarı — "yeni kart aç" bilinçli bir karardır
                  ama kaç satırın yeni kart açacağı sessiz kalmamalıdır. */}
              {yeniKartSayisi > 0 && (
                <div style={{ fontSize: '11px', color: 'var(--warning)' }}>
                  ⚠ {yeniKartSayisi} satır bir karta bağlı değil; kaydedilirken bu satırlar için belgedeki
                  bilgilerle YENİ stok kartı açılacak. Kart açmak istemiyorsanız satırlara mevcut kart seçin.
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
};
