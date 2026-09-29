import React, { useEffect, useMemo, useState } from 'react';
import type {
  IncomingInvoice, IncomingDespatch, ParsedUblDocument, ParsedUblLine, ParsedUblParty,
} from '../../../types';
import { api } from '../../../services/api';
import { Modal } from '../../common/Modal';
import { AlertTriangle, Ban, CheckCircle2, Copy, FileText, Loader2, Package } from 'lucide-react';

/**
 * GELEN BELGE DETAY EKRANI
 * ═══════════════════════════════════════════════════════════════════════════
 * 2026-09-29 eklendi. Dört sekme: [Belge] [Kalemler] [Görsel] [XML].
 *
 * ⚠️ TEMEL KURAL — UYDURMA YOK: Bu ekranın gösterdiği HER değer belgenin
 * kendisinden gelir. Belgede olmayan bir alan "—" olarak yazılır; `0` veya
 * tahmini bir değer YAZILMAZ. "0,00 ₺" ile "belgede yok" farklı şeylerdir ve
 * muhasebede karıştırılmaları pahalıya mal olur.
 *
 * ⚠️ NEDEN AYRI DETAY UCU: Eşleştirme planı (`/plan`) mevcut cari/stok
 * listesine bağlıdır ve "sen ne yapacaksın" sorusunu sorar. Bu ekran ise nötr
 * bir okumadır: yalnız "belgede ne yazıyor" sorusunu yanıtlar. Ayrıca plan ucu
 * irsaliye/fatura kararlarını karıştırır; detay iki akışta aynıdır.
 *
 * ⚠️ `[Görsel]` SEKMEŞİ ŞABLON DEĞİL: Belge TEDARİKÇİNİN belgesidir. Onu bizim
 * giden-fatura şablonumuzla basmak, karşı firmanın faturasına BİZİM logomuzu
 * ve IBAN'ımızı koymak olurdu. Sunucu görünümü doğrudan belgenin alanlarından
 * üretir (bkz. `incomingDocumentRenderer.ts`).
 *
 * ⚠️ `[XML]` SALT OKUNUR: Hiçbir düzenleme yapılamaz. Girintileme yalnız
 * gösterim içindir; içerik değişmez.
 */

type Sekme = 'BELGE' | 'KALEMLER' | 'GORSEL' | 'XML';

/** Toplamlar bloğunda bir satır — `deger` yoksa satır hiç gösterilmez. */
interface ToplamSatiri {
  etiket: string;
  deger?: number;
  vurgulu?: boolean;
  /** Değerler ayrışıyorsa işaretlenir; kullanıcı hangisine güveneceğini görsün. */
  uyari?: boolean;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  tur: 'INVOICE' | 'DESPATCH';
  kayit: IncomingInvoice | IncomingDespatch | null;
}

/** Eksik alan gösterimi — `0` ile karışmaması için tek yerden yönetilir. */
const YOK = <span style={{ color: 'var(--text-muted)' }}>—</span>;

/** Para biçimi — sunucudaki biçimleyiciyle AYNI kural (sabit, Intl'siz). */
function para(n: number | undefined, currency = 'TRY'): React.ReactNode {
  if (n === undefined || n === null || !Number.isFinite(n)) return YOK;
  const s = (Math.round(n * 100) / 100).toFixed(2);
  const [tam, kurus] = s.split('.');
  const negatif = tam.startsWith('-');
  const gruplu = (negatif ? tam.slice(1) : tam).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${negatif ? '-' : ''}${gruplu},${kurus} ${currency}`;
}

function miktar(n: number | undefined): React.ReactNode {
  if (n === undefined || n === null || !Number.isFinite(n)) return YOK;
  const s = (Math.round(n * 10000) / 10000).toFixed(4).replace(/0+$/, '').replace(/\.$/, '');
  return s.replace('.', ',');
}

function yuzde(n: number | undefined): React.ReactNode {
  if (n === undefined || n === null || !Number.isFinite(n)) return YOK;
  return `%${(Math.round(n * 100) / 100).toString().replace('.', ',')}`;
}

/** Künye alanı — etiket üstte, değer altta. */
const Alan: React.FC<{ etiket: string; children: React.ReactNode; kucuk?: boolean }> = ({
  etiket, children, kucuk,
}) => (
  <div>
    <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
      {etiket}
    </div>
    <div style={{ fontSize: kucuk ? '11px' : '13px', fontWeight: 600, wordBreak: 'break-word' }}>{children}</div>
  </div>
);

/** Taraf kartı — satıcı/alıcı bilgileri belgede ne varsa. */
const TarafKarti: React.FC<{ baslik: string; p: ParsedUblParty }> = ({ baslik, p }) => (
  <div style={{
    border: '1px solid var(--border-color)', borderTop: '3px solid var(--primary)',
    borderRadius: 'var(--radius-md, 8px)', padding: '10px 12px', fontSize: '12px',
  }}>
    <div style={{
      fontSize: '10px', fontWeight: 800, color: 'var(--text-muted)',
      textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '5px',
    }}>
      {baslik}
    </div>
    <div style={{ fontWeight: 700, fontSize: '13px', marginBottom: '3px' }}>{p.title || YOK}</div>
    <div>
      <strong>{p.scheme === 'TCKN' ? 'TCKN' : 'VKN'}:</strong> {p.taxNumber || YOK}
      {p.taxOffice ? <> &middot; <strong>V.D.:</strong> {p.taxOffice}</> : null}
    </div>
    {[p.street, p.postalZone, p.district, p.city].filter(Boolean).length > 0 && (
      <div>{[p.street, p.postalZone, p.district, p.city].filter(Boolean).join(' / ')}</div>
    )}
    {p.phone && <div><strong>Tel:</strong> {p.phone}</div>}
    {p.email && <div><strong>E-posta:</strong> {p.email}</div>}
  </div>
);

export const IncomingDocumentDetail: React.FC<Props> = ({ isOpen, onClose, tur, kayit }) => {
  const [sekme, setSekme] = useState<Sekme>('BELGE');
  const [yukleniyor, setYukleniyor] = useState(false);
  const [hata, setHata] = useState<string | null>(null);
  const [doc, setDoc] = useState<ParsedUblDocument | null>(null);

  const [xml, setXml] = useState<string>('');
  const [xmlNotu, setXmlNotu] = useState<string | null>(null);
  /** XML/görsel YALNIZ sekme açıldığında çekilir — gereksiz ağ turu yapılmaz. */
  const [xmlYukleniyor, setXmlYukleniyor] = useState(false);
  const [gorsel, setGorsel] = useState<string>('');
  const [gorselYukleniyor, setGorselYukleniyor] = useState(false);
  const [kopyalandi, setKopyalandi] = useState(false);

  const irsaliyeMi = tur === 'DESPATCH';

  // Modal her açıldığında baştan yüklenir: kullanıcı belgeyi eşleştirdikten
  // sonra tekrar açtığında BAYAT içerik görmemelidir.
  useEffect(() => {
    if (!isOpen || !kayit) return;
    setSekme('BELGE');
    setDoc(null);
    setXml('');
    setXmlNotu(null);
    setGorsel('');
    setHata(null);
    setYukleniyor(true);
    (async () => {
      try {
        const res = irsaliyeMi
          ? await api.getIncomingDespatchDetail(kayit.id)
          : await api.getIncomingDocumentDetail(kayit.id);
        if (res.success) setDoc(res.document);
      } catch (err: any) {
        // Hata GİZLENMEZ: içeriği gösterememenin nedeni kullanıcıya yazılır.
        setHata(err.message || 'Belge içeriği yüklenemedi.');
      } finally {
        setYukleniyor(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, kayit?.id, tur]);

  // XML sekmesi — yalnız istendiğinde.
  useEffect(() => {
    if (!isOpen || !kayit || sekme !== 'XML' || xml || xmlYukleniyor) return;
    setXmlYukleniyor(true);
    (async () => {
      try {
        const res = irsaliyeMi
          ? await api.getIncomingDespatchXml(kayit.id)
          : await api.getIncomingDocumentXml(kayit.id);
        if (res.success) {
          setXml(res.xml);
          if (!res.formatted && res.reason) setXmlNotu(res.reason);
        }
      } catch (err: any) {
        setXmlNotu(err.message || 'XML içeriği alınamadı.');
      } finally {
        setXmlYukleniyor(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, kayit?.id, sekme]);

  // Görsel sekmesi — yalnız istendiğinde.
  useEffect(() => {
    if (!isOpen || !kayit || sekme !== 'GORSEL' || gorsel) return;
    setGorselYukleniyor(true);
    (async () => {
      try {
        const res = irsaliyeMi
          ? await api.getIncomingDespatchVisual(kayit.id)
          : await api.getIncomingDocumentVisual(kayit.id);
        if (res.success) setGorsel(res.html);
      } catch (err: any) {
        setHata(err.message || 'Belge görseli oluşturulamadı.');
      } finally {
        setGorselYukleniyor(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, kayit?.id, sekme]);

  const currency = doc?.currency || 'TRY';

  const toplamSatirlari = useMemo<ToplamSatiri[]>(() => {
    if (!doc || irsaliyeMi) return [];
    const mt = doc.monetaryTotals || {};
    const liste: ToplamSatiri[] = [
      { etiket: 'Mal / Hizmet Toplamı', deger: mt.lineExtensionAmount },
      { etiket: 'İskonto Toplamı', deger: mt.allowanceTotalAmount },
      { etiket: 'Vergi Hariç Toplam', deger: mt.taxExclusiveAmount },
      { etiket: 'KDV Toplamı', deger: doc.taxBreakdown?.vatTotal },
      ...(doc.taxBreakdown?.otherTaxes || []).map(v => ({
        etiket: v.name || 'Diğer Vergi', deger: v.amount as number | undefined,
      })),
      { etiket: 'Vergi Dahil Toplam', deger: mt.taxInclusiveAmount },
      { etiket: 'ÖDENECEK TUTAR', deger: mt.payableAmount ?? doc.payableTotal, vurgulu: true },
    ];
    // Belgenin kendi bildirdiği ödenecek tutar ayrışıyorsa AYRICA gösterilir:
    // iki değerin farklılaşması bir okuma sorununun işaretidir ve gizlenmemelidir.
    const hesaplanan = mt.payableAmount ?? doc.payableTotal;
    if (doc.declaredPayable !== undefined && doc.declaredPayable !== hesaplanan) {
      liste.push({ etiket: 'Belgenin Bildirdiği Ödenecek', deger: doc.declaredPayable, uyari: true });
    }
    // Değeri OLMAYAN satır hiç yazılmaz: "0,00" ile "belgede yok" farklıdır.
    return liste.filter(s => typeof s.deger === 'number' && Number.isFinite(s.deger));
  }, [doc, irsaliyeMi]);

  const baslik = irsaliyeMi ? 'Gelen e-İrsaliye — Belge Detayı' : 'Gelen e-Fatura — Belge Detayı';

  const sekmeler: Array<{ id: Sekme; etiket: string }> = [
    { id: 'BELGE', etiket: 'Belge' },
    { id: 'KALEMLER', etiket: `Kalemler${doc ? ` (${doc.lines.length})` : ''}` },
    { id: 'GORSEL', etiket: 'Görsel' },
    { id: 'XML', etiket: 'XML' },
  ];

  const footer = (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', gap: '8px' }}>
      <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
        Bu ekran yalnızca OKUR; belge üzerinde hiçbir değişiklik yapmaz.
      </div>
      <button className="btn btn-secondary" onClick={onClose}>Kapat</button>
    </div>
  );

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={baslik} size="full" footer={footer}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {/* ── Sekmeler ─────────────────────────────────────────────────── */}
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', borderBottom: '1px solid var(--border-color)', paddingBottom: '8px' }}>
          {sekmeler.map(s => (
            <button
              key={s.id}
              className={`btn ${sekme === s.id ? 'btn-primary' : 'btn-secondary'} btn-sm`}
              onClick={() => setSekme(s.id)}
            >
              {s.etiket}
            </button>
          ))}
        </div>

        {hata && (
          <div style={{
            display: 'flex', gap: '8px', alignItems: 'flex-start', padding: '10px 12px',
            background: 'var(--danger-bg, rgba(220,38,38,0.08))', border: '1px solid var(--danger)',
            borderRadius: 'var(--radius-md, 8px)', fontSize: '12px', color: 'var(--danger)',
          }}>
            <Ban size={15} style={{ marginTop: '2px', flexShrink: 0 }} />
            <div>{hata}</div>
          </div>
        )}

        {yukleniyor ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
            <Loader2 size={20} className="animate-spin" style={{ marginBottom: '8px' }} />
            <div>Belge içeriği çözümleniyor...</div>
          </div>
        ) : !doc ? (
          <div style={{ padding: '30px', textAlign: 'center', color: 'var(--text-muted)' }}>
            Gösterilecek belge içeriği yok.
          </div>
        ) : (
          <>
            {/* ══ BELGE ═══════════════════════════════════════════════════ */}
            {sekme === 'BELGE' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div style={{
                  display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '10px',
                  padding: '12px', background: 'var(--bg-surface-secondary)',
                  border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md, 8px)',
                }}>
                  <Alan etiket={irsaliyeMi ? 'İrsaliye No' : 'Fatura No'}>{doc.documentNo || YOK}</Alan>
                  <Alan etiket="Belge Tarihi">{doc.issueDate || YOK}</Alan>
                  <Alan etiket="Belge Saati">{doc.issueTime || YOK}</Alan>
                  <Alan etiket="Belge Türü">{doc.typeCode || YOK}</Alan>
                  <Alan etiket="Senaryo / Profil">{doc.profile || YOK}</Alan>
                  <Alan etiket="Para Birimi">{doc.currency || YOK}</Alan>
                  <Alan etiket="ETTN" kucuk>{doc.uuid || YOK}</Alan>
                  {doc.scenarioNote && <Alan etiket="Belge Notu">{doc.scenarioNote}</Alan>}
                </div>

                {/* ETTN kopyalama — kimlik belgenin kendisinden gelir. */}
                {doc.uuid && (
                  <button
                    className="btn btn-secondary btn-sm"
                    style={{ alignSelf: 'flex-start' }}
                    onClick={() => {
                      navigator.clipboard.writeText(doc.uuid);
                      setKopyalandi(true);
                    }}
                  >
                    <Copy size={13} />
                    <span>{kopyalandi ? 'ETTN kopyalandı' : 'ETTN\'yi kopyala'}</span>
                  </button>
                )}

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '10px' }}>
                  <TarafKarti baslik={irsaliyeMi ? 'Sevk Eden (Satıcı)' : 'Satıcı'} p={doc.supplier} />
                  <TarafKarti baslik={irsaliyeMi ? 'Teslim Alan (Alıcı)' : 'Alıcı'} p={doc.customer} />
                </div>

                {/* ── Belgenin kendi uyarıları/kapıları ─────────────────── */}
                {doc.errors.length > 0 && (
                  <div style={{
                    padding: '10px 12px', background: 'var(--danger-bg, rgba(220,38,38,0.08))',
                    border: '1px solid var(--danger)', borderRadius: 'var(--radius-md, 8px)', fontSize: '12px',
                  }}>
                    <b style={{ color: 'var(--danger)' }}>İçeri aktarmayı engelleyen durumlar</b>
                    <ul style={{ margin: '6px 0 0 16px', padding: 0 }}>
                      {doc.errors.map((e, i) => <li key={i}>{e}</li>)}
                    </ul>
                  </div>
                )}
                {doc.warnings.length > 0 && (
                  <div style={{
                    padding: '10px 12px', background: 'rgba(217,119,6,0.08)',
                    border: '1px solid var(--warning)', borderRadius: 'var(--radius-md, 8px)', fontSize: '12px',
                  }}>
                    <b style={{ color: 'var(--warning)' }}>Belge uyarıları</b>
                    <ul style={{ margin: '6px 0 0 16px', padding: 0 }}>
                      {doc.warnings.map((w, i) => <li key={i}>{w}</li>)}
                    </ul>
                  </div>
                )}

                {/* ── Toplamlar ─────────────────────────────────────────── */}
                {irsaliyeMi ? (
                  <div style={{
                    padding: '10px 12px', background: 'var(--bg-surface-secondary)',
                    border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md, 8px)', fontSize: '12px',
                  }}>
                    <b>Bu belgede tutar yoktur.</b>{' '}
                    e-İrsaliye bir sevk belgesidir; birim fiyat ve KDV içermez. Tutar satırları bu yüzden
                    gösterilmez — maliyet, satıcının keseceği faturayla oluşur.
                  </div>
                ) : (
                  <div style={{
                    marginLeft: 'auto', width: '380px', maxWidth: '100%',
                    border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md, 8px)', padding: '10px 12px',
                  }}>
                    <div style={{
                      fontSize: '10px', fontWeight: 800, color: 'var(--text-muted)',
                      textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '6px',
                    }}>
                      Belgenin Bildirdiği Toplamlar
                    </div>
                    {toplamSatirlari.length === 0 ? (
                      <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                        Belgede toplam bloğu bulunamadı.
                      </div>
                    ) : (
                      toplamSatirlari.map(s => (
                        <div
                          key={s.etiket}
                          style={{
                            display: 'flex', justifyContent: 'space-between', gap: '10px',
                            padding: '4px 0', borderBottom: '1px solid var(--border-color)',
                            fontSize: s.vurgulu ? '14px' : '12px',
                            fontWeight: s.vurgulu ? 900 : 500,
                            color: s.uyari ? 'var(--warning)' : undefined,
                          }}
                        >
                          <span>{s.etiket}{s.uyari ? ' ⚠' : ''}</span>
                          <span>{para(s.deger, currency)}</span>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            )}

            {/* ══ KALEMLER ════════════════════════════════════════════════ */}
            {sekme === 'KALEMLER' && (
              <div style={{ overflowX: 'auto', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md, 8px)' }}>
                <table className="data-table" style={{ width: '100%', fontSize: '12px' }}>
                  <thead>
                    <tr>
                      <th style={{ width: '38px' }}>#</th>
                      <th>Tedarikçi Kalemi</th>
                      <th style={{ width: '80px', textAlign: 'right' }}>Miktar</th>
                      <th style={{ width: '62px' }}>Birim</th>
                      {!irsaliyeMi && <th style={{ width: '95px', textAlign: 'right' }}>Birim Fiyat</th>}
                      {!irsaliyeMi && <th style={{ width: '85px', textAlign: 'right' }}>İskonto</th>}
                      {!irsaliyeMi && <th style={{ width: '58px', textAlign: 'center' }}>KDV</th>}
                      {!irsaliyeMi && <th style={{ width: '90px', textAlign: 'right' }}>KDV Tutarı</th>}
                      {!irsaliyeMi && <th style={{ width: '100px', textAlign: 'right' }}>Diğer Vergi</th>}
                      {!irsaliyeMi && <th style={{ width: '105px', textAlign: 'right' }}>Satır Tutarı</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {doc.lines.length === 0 ? (
                      <tr>
                        <td colSpan={irsaliyeMi ? 4 : 9} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '16px' }}>
                          Belgede kalem bulunamadı.
                        </td>
                      </tr>
                    ) : (
                      doc.lines.map((l: ParsedUblLine) => (
                        <tr key={l.lineNo}>
                          <td>{l.lineNo}</td>
                          <td>
                            <div style={{ fontWeight: 600 }}>{l.name || YOK}</div>
                            {/* Kodlar YALNIZ varsa gösterilir; "Kod yok" yazmak
                                yerine satır tamamen atlanır. */}
                            {(l.sellerProductCode || l.buyerProductCode || l.manufacturerProductCode || l.barcode) && (
                              <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                                {[
                                  l.sellerProductCode ? `Satıcı: ${l.sellerProductCode}` : '',
                                  l.buyerProductCode ? `Alıcı: ${l.buyerProductCode}` : '',
                                  l.manufacturerProductCode ? `Üretici: ${l.manufacturerProductCode}` : '',
                                  l.barcode ? `Barkod: ${l.barcode}` : '',
                                ].filter(Boolean).join(' · ')}
                              </div>
                            )}
                          </td>
                          <td style={{ textAlign: 'right' }}>{miktar(l.quantity)}</td>
                          <td>{l.unitName || YOK}</td>
                          {!irsaliyeMi && <td style={{ textAlign: 'right' }}>{para(l.unitPrice, currency)}</td>}
                          {!irsaliyeMi && (
                            <td style={{ textAlign: 'right' }}>
                              {l.discountAmount !== undefined ? para(l.discountAmount, currency) : YOK}
                              {l.discountRate !== undefined && (
                                <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{yuzde(l.discountRate)}</div>
                              )}
                            </td>
                          )}
                          {!irsaliyeMi && <td style={{ textAlign: 'center' }}>{yuzde(l.vatRate)}</td>}
                          {!irsaliyeMi && <td style={{ textAlign: 'right' }}>{para(l.vatAmount, currency)}</td>}
                          {!irsaliyeMi && (
                            <td style={{ textAlign: 'right', fontSize: '11px' }}>
                              {(l.otherTaxes || []).length === 0 ? YOK : (
                                l.otherTaxes!.map((v, i) => (
                                  <div key={i}>
                                    {v.name}: {para(v.amount, currency)}
                                    {v.rate !== undefined ? ` (${yuzde(v.rate)})` : ''}
                                  </div>
                                ))
                              )}
                            </td>
                          )}
                          {!irsaliyeMi && (
                            <td style={{ textAlign: 'right', fontWeight: 700 }}>{para(l.lineTotal, currency)}</td>
                          )}
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {/* ══ GÖRSEL ══════════════════════════════════════════════════ */}
            {sekme === 'GORSEL' && (
              <div style={{
                background: 'var(--bg-surface-secondary)', border: '1px solid var(--border-color)',
                borderRadius: 'var(--radius-md, 8px)', padding: '14px', display: 'flex',
                flexDirection: 'column', alignItems: 'center', gap: '10px',
              }}>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'flex', gap: '6px', alignItems: 'center' }}>
                  <FileText size={13} />
                  <span>
                    Görünüm doğrudan belgenin UBL içeriğinden üretilir. Belgede olmayan alanlar
                    &quot;—&quot; olarak gösterilir; hiçbir değer hesaplanmaz.
                  </span>
                </div>
                {gorselYukleniyor ? (
                  <div style={{ padding: '40px', color: 'var(--text-muted)' }}>
                    <Loader2 size={18} className="animate-spin" /> Görünüm hazırlanıyor...
                  </div>
                ) : gorsel ? (
                  <iframe
                    srcDoc={gorsel}
                    title="Gelen Belge Görünümü"
                    /* ⚠️ SANDBOX: Belge içeriği DIŞ kaynaktan gelir. `allow-scripts`
                       VERİLMEZ — görünüm statik HTML'dir ve komut çalıştırmasına
                       ihtiyaç duymaz. Bu, ele geçirilmiş/bozuk bir belgenin
                       tarayıcıda kod çalıştırmasını yapısal olarak engeller. */
                    sandbox=""
                    style={{
                      width: '100%', maxWidth: '840px', height: '720px',
                      border: '1px solid var(--border-color)', borderRadius: '4px', background: '#fff',
                    }}
                  />
                ) : (
                  <div style={{ padding: '30px', color: 'var(--text-muted)' }}>Görünüm üretilemedi.</div>
                )}
              </div>
            )}

            {/* ══ XML ═════════════════════════════════════════════════════ */}
            {sekme === 'XML' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: 'var(--text-muted)',
                }}>
                  <Package size={13} />
                  <span>
                    Salt okunur. Girintileme yalnız gösterim içindir; belge içeriği değiştirilmez.
                  </span>
                </div>
                {xmlNotu && (
                  <div style={{
                    display: 'flex', gap: '6px', alignItems: 'flex-start', padding: '8px 10px',
                    background: 'rgba(217,119,6,0.08)', border: '1px solid var(--warning)',
                    borderRadius: 'var(--radius-md, 8px)', fontSize: '12px',
                  }}>
                    <AlertTriangle size={14} color="var(--warning)" style={{ marginTop: '2px', flexShrink: 0 }} />
                    <div>{xmlNotu}</div>
                  </div>
                )}
                {xmlYukleniyor ? (
                  <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
                    <Loader2 size={18} className="animate-spin" /> XML yükleniyor...
                  </div>
                ) : (
                  <textarea
                    readOnly
                    value={xml}
                    spellCheck={false}
                    style={{
                      width: '100%', minHeight: '460px', fontFamily: 'monospace', fontSize: '11.5px',
                      lineHeight: 1.5, padding: '10px', background: 'var(--bg-surface-secondary)',
                      color: 'var(--text-main)', border: '1px solid var(--border-color)',
                      borderRadius: 'var(--radius-md, 8px)', resize: 'vertical', whiteSpace: 'pre',
                    }}
                  />
                )}
              </div>
            )}
          </>
        )}

        {/* ── Onay bilgisi: belge içeri alınmışsa açıkça yazılır ─────────── */}
        {kayit && (kayit as IncomingInvoice).status === 'CONVERTED_TO_PURCHASE' && (
          <div style={{
            display: 'flex', gap: '8px', alignItems: 'center', padding: '10px 12px',
            background: 'rgba(16,185,129,0.08)', border: '1px solid var(--success)',
            borderRadius: 'var(--radius-md, 8px)', fontSize: '12px',
          }}>
            <CheckCircle2 size={15} color="var(--success)" />
            <div>
              Bu belge daha önce içeri alınmış
              {(kayit as IncomingInvoice).convertedPurchaseInvoiceId
                ? ` (alış faturası: ${(kayit as IncomingInvoice).convertedPurchaseInvoiceId})`
                : ''}
              . İkinci kez içeri alınamaz.
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
};
