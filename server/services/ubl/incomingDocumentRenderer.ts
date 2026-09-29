/**
 * GELEN BELGE GÖRSELİ (A4) — VERİYE SADIK RENDER
 * ═══════════════════════════════════════════════════════════════════════════
 * 2026-09-29 eklendi. Detay ekranının "Görsel" sekmesini üretir.
 *
 * ⚠️ NEDEN KENDİ ŞABLONUMUZ KULLANILMIYOR: Gelen belge TEDARİKÇİNİN belgesidir.
 * Onu bizim giden-fatura şablonumuzla (logo, IBAN, alt not) basmak, karşı
 * firmanın faturasına BİZİM banka hesabımızı ve logomuzu koymak demektir —
 * hem yanıltıcı hem de muhasebe açısından tehlikelidir. Sağlayıcı (entegratör)
 * sözleşmesi XSLT DÖNDÜRMÜYOR (bkz. `electronicDocumentProvider.ts`), bu yüzden
 * "sağlayıcı XSLT'si varsa onu kullan" kolu bugün için BOŞTUR ve uydurma bir
 * şablonla doldurulmaz.
 *
 * ⚠️ NEDEN `renderFallbackHtml` YENİDEN KULLANILMADI: O fonksiyon şablon
 * TASARIMCISI önizlemesi için yazılmıştır ve gövdesinde SABİT bir örnek kalem
 * satırı taşır ("Yüksek Dayanımlı Hazır Beton C35/45", miktar 10, 2.500,00).
 * Gerçek bir gelen belgenin görselinde sabit bir kalem göstermek VERİ UYDURMAK
 * olurdu.
 *
 * KURAL: Burada HİÇBİR değer hesaplanmaz veya varsayılmaz. Belgede olmayan
 * alan "—" yazar. Tutarlar `ParsedUblDocument` içinden okunur.
 *
 * ⚠️ GÜVENLİK: Belge içeriği SON KULLANICININ DENETLEYEMEDİĞİ bir kaynaktan
 * (tedarikçi/entegratör) gelir. Bu yüzden aşağıdaki TÜM metin `esc()` ile
 * kaçışlanır; HTML bu çıktıdan ÜRETİLMEZ, yalnız değer olarak gömülür. Çıktı
 * istemcide `sandbox`lı bir iframe içinde gösterilir.
 */
import type { ParsedUblDocument, ParsedUblLine } from './ublParser';

/** HTML kaçışı — belge metni ASLA işaretleme olarak yorumlanmaz. */
function esc(value: unknown): string {
  if (value === undefined || value === null) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Eksik alan gösterimi. `0` ile "yok" karıştırılmaz, ikisi de farklı yazılır. */
const YOK = '<span class="yok">—</span>';

/**
 * Para biçimi — `Intl` KULLANILMAZ.
 *
 * NEDEN: Dağıtım ortamındaki Node derlemesinin tam ICU verisiyle gelmemesi
 * hâlinde `toLocaleString('tr-TR')` sessizce farklı ayraç üretebilir ve
 * kullanıcı 1.234,50 yerine 1,234.50 görür. Muhasebede bu ciddi bir hatadır;
 * biçim burada sabit kuralla üretilir.
 */
function para(n: number | undefined, currency: string): string {
  if (n === undefined || n === null || !Number.isFinite(n)) return YOK;
  const s = (Math.round(n * 100) / 100).toFixed(2);
  const [tam, kurus] = s.split('.');
  const negatif = tam.startsWith('-');
  const rakamlar = negatif ? tam.slice(1) : tam;
  const gruplu = rakamlar.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${negatif ? '-' : ''}${gruplu},${kurus} ${esc(currency)}`;
}

/**
 * Miktar biçimi — gereksiz sondaki sıfırlar atılır.
 * `3.000` → "3", `2.5000` → "2,5". Miktar tam sayıysa ondalık gösterilmez.
 */
function miktar(n: number | undefined): string {
  if (n === undefined || n === null || !Number.isFinite(n)) return YOK;
  const s = (Math.round(n * 10000) / 10000).toFixed(4).replace(/0+$/, '').replace(/\.$/, '');
  return esc(s.replace('.', ','));
}

/** Yüzde biçimi. */
function yuzde(n: number | undefined): string {
  if (n === undefined || n === null || !Number.isFinite(n)) return YOK;
  return `%${esc((Math.round(n * 100) / 100).toString().replace('.', ','))}`;
}

/** Belge türü etiketi — ham kod değil, okunabilir ad. */
function belgeTuru(doc: ParsedUblDocument): string {
  if (doc.kind === 'DESPATCH') return 'e-İRSALİYE';
  const kod = (doc.typeCode || '').toUpperCase();
  const harita: Record<string, string> = {
    SATIS: 'SATIŞ', IADE: 'İADE', TEVKIFAT: 'TEVKİFAT', ISTISNA: 'İSTİSNA',
    KONAKLAMAVERGISI: 'KONAKLAMA VERGİSİ', SGK: 'SGK',
  };
  return harita[kod] ? `e-FATURA (${harita[kod]})` : 'e-FATURA';
}

/** Taraf (satıcı/alıcı) bloğu. */
function tarafBlogu(baslik: string, p: ParsedUblDocument['supplier']): string {
  const adres = [p.street, p.postalZone, p.district, p.city].filter(Boolean).join(' / ');
  return `
    <div class="kart">
      <div class="kart-baslik">${esc(baslik)}</div>
      <div class="taraf-ad">${p.title ? esc(p.title) : YOK}</div>
      <div><strong>${esc(p.scheme === 'TCKN' ? 'TCKN' : 'VKN')}:</strong> ${p.taxNumber ? esc(p.taxNumber) : YOK}${
        p.taxOffice ? ` &middot; <strong>V.D.:</strong> ${esc(p.taxOffice)}` : ''
      }</div>
      ${adres ? `<div>${esc(adres)}</div>` : ''}
      ${p.phone ? `<div><strong>Tel:</strong> ${esc(p.phone)}</div>` : ''}
      ${p.email ? `<div><strong>E-posta:</strong> ${esc(p.email)}</div>` : ''}
    </div>`;
}

/** Tek bir kalem satırı — fatura (fiyatlı) ve irsaliye (fiyatsız) ayrımıyla. */
function kalemSatiri(l: ParsedUblLine, irsaliyeMi: boolean, currency: string): string {
  const kodlar = [
    l.sellerProductCode ? `Satıcı: ${esc(l.sellerProductCode)}` : '',
    l.buyerProductCode ? `Alıcı: ${esc(l.buyerProductCode)}` : '',
    l.manufacturerProductCode ? `Üretici: ${esc(l.manufacturerProductCode)}` : '',
    l.barcode ? `Barkod: ${esc(l.barcode)}` : '',
  ].filter(Boolean).join(' &middot; ');

  const digerVergiler = (l.otherTaxes || [])
    .map(v => `${esc(v.name)}: ${para(v.amount, currency)}`)
    .join('<br>');

  return `
    <tr>
      <td class="orta">${esc(l.lineNo)}</td>
      <td>
        <div class="kalem-ad">${l.name ? esc(l.name) : YOK}</div>
        ${kodlar ? `<div class="kalem-kod">${kodlar}</div>` : ''}
      </td>
      <td class="sag">${miktar(l.quantity)}</td>
      <td class="orta">${l.unitName ? esc(l.unitName) : YOK}</td>
      ${
        irsaliyeMi
          ? ''
          : `<td class="sag">${para(l.unitPrice, currency)}</td>
             <td class="sag">${l.discountAmount !== undefined ? para(l.discountAmount, currency) : YOK}</td>
             <td class="orta">${yuzde(l.vatRate)}</td>
             <td class="sag">${digerVergiler || YOK}</td>
             <td class="sag kalin">${para(l.lineTotal, currency)}</td>`
      }
    </tr>`;
}

/**
 * Toplam satırı. Değer yoksa satır HİÇ yazılmaz — "0,00" yazmak, belgede
 * olmayan bir tutarı varmış gibi gösterirdi.
 */
function toplamSatiri(etiket: string, deger: string, vurgulu = false): string {
  if (deger === YOK) return '';
  return `<div class="toplam ${vurgulu ? 'vurgulu' : ''}"><span>${esc(etiket)}</span><span>${deger}</span></div>`;
}

/**
 * Gelen UBL belgesini A4 görünümlü, veriye sadık bir HTML'e çevirir.
 *
 * Saf fonksiyondur: dosya okumaz, ağa çıkmaz, DB'ye dokunmaz. Aynı belge her
 * zaman aynı çıktıyı verir.
 */
export function renderIncomingDocumentHtml(doc: ParsedUblDocument): string {
  const irsaliyeMi = doc.kind === 'DESPATCH';
  const currency = doc.currency || 'TRY';

  const satirlar = doc.lines.length
    ? doc.lines.map(l => kalemSatiri(l, irsaliyeMi, currency)).join('')
    : `<tr><td colspan="${irsaliyeMi ? 4 : 8}" class="bos">Belgede kalem bulunamadı.</td></tr>`;

  // ── Toplamlar ────────────────────────────────────────────────────────────
  // ⚠️ Her satır YALNIZ gerçekten varsa yazılır. Belgede olmayan bir toplamı
  // göstermek, kullanıcıya belgede olmayan bir tutarı onaylatmak olurdu.
  const mt = doc.monetaryTotals || {};
  const toplamlar = irsaliyeMi
    ? ''
    : [
        toplamSatiri('Mal / Hizmet Toplamı', para(mt.lineExtensionAmount, currency)),
        toplamSatiri('İskonto Toplamı', para(mt.allowanceTotalAmount, currency)),
        toplamSatiri('Vergi Hariç Toplam', para(mt.taxExclusiveAmount, currency)),
        toplamSatiri('KDV Toplamı', para(doc.taxBreakdown?.vatTotal, currency)),
        ...(doc.taxBreakdown?.otherTaxes || []).map(v =>
          toplamSatiri(v.name || 'Diğer Vergi', para(v.amount, currency))
        ),
        toplamSatiri('Vergi Dahil Toplam', para(mt.taxInclusiveAmount, currency)),
        toplamSatiri('ÖDENECEK TUTAR', para(mt.payableAmount ?? doc.payableTotal, currency), true),
      ]
        .filter(Boolean)
        .join('');

  const uyarilar = [
    ...doc.errors.map(e => ({ tur: 'hata', metin: e })),
    ...doc.warnings.map(w => ({ tur: 'uyari', metin: w })),
  ];
  const uyariBloku = uyarilar.length
    ? `<div class="uyarilar">${uyarilar
        .map(u => `<div class="${u.tur}">${esc(u.metin)}</div>`)
        .join('')}</div>`
    : '';

  // Senaryo: belgede hangi alan varsa o yazılır. Hiçbiri yoksa alan gösterilmez.
  const senaryo = [doc.profile, doc.typeCode, doc.scenarioNote].filter(Boolean).join(' · ');
  const tarih = [doc.issueDate, doc.issueTime].filter(Boolean).join(' ');

  return `<!DOCTYPE html>
<html lang="tr">
<head>
<meta charset="UTF-8">
<style>
  /* Belge kanvası BİLİNÇLİ olarak beyaz kâğıttır: resmî fatura A4'e basılmış
     gibi görünmelidir. Tema token'ı kullanılmaz. */
  body { font-family: Arial, Helvetica, sans-serif; color: #0f172a; background: #fff;
         margin: 0; padding: 18px; font-size: 12px; line-height: 1.4; }
  .yok { color: #94a3b8; }
  .ust { display: flex; justify-content: space-between; align-items: flex-start;
         border-bottom: 2px solid #334155; padding-bottom: 10px; gap: 12px; }
  .belge-tur { font-size: 19px; font-weight: 900; letter-spacing: .5px; }
  .kunye { text-align: right; font-size: 11px; }
  .kunye div { margin-top: 2px; }
  .ettn { font-family: monospace; font-size: 10px; color: #475569; word-break: break-all; }
  .kutular { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin: 12px 0; }
  .kart { border: 1px solid #cbd5e1; border-top: 3px solid #334155; border-radius: 4px;
          padding: 8px 10px; }
  .kart-baslik { font-size: 10px; font-weight: 800; letter-spacing: .4px; color: #475569;
                 text-transform: uppercase; margin-bottom: 4px; }
  .taraf-ad { font-weight: 700; font-size: 12.5px; margin-bottom: 2px; }
  table { width: 100%; border-collapse: collapse; margin-top: 8px; }
  th { background: #334155; color: #fff; padding: 6px 6px; text-align: left; font-size: 10.5px; }
  td { border: 1px solid #e2e8f0; padding: 5px 6px; vertical-align: top; }
  tr:nth-child(even) td { background: #f8fafc; }
  .sag { text-align: right; }
  .orta { text-align: center; }
  .kalin { font-weight: 700; }
  .kalem-ad { font-weight: 600; }
  .kalem-kod { font-size: 9.5px; color: #64748b; }
  .bos { text-align: center; color: #94a3b8; padding: 14px; }
  .toplamlar { margin-left: auto; width: 320px; margin-top: 12px; }
  .toplam { display: flex; justify-content: space-between; padding: 4px 0;
            border-bottom: 1px solid #e2e8f0; }
  .toplam.vurgulu { border-top: 2px solid #334155; border-bottom: 2px solid #334155;
                    font-size: 14px; font-weight: 900; padding: 7px 0; }
  .uyarilar { margin-top: 12px; font-size: 11px; }
  .uyarilar .hata { background: #fef2f2; border: 1px solid #fecaca; color: #991b1b;
                    padding: 6px 8px; border-radius: 4px; margin-bottom: 4px; }
  .uyarilar .uyari { background: #fffbeb; border: 1px solid #fde68a; color: #92400e;
                     padding: 6px 8px; border-radius: 4px; margin-bottom: 4px; }
  .dipnot { margin-top: 18px; border-top: 1px solid #e2e8f0; padding-top: 6px;
            font-size: 9.5px; color: #64748b; }
</style>
</head>
<body>
  <div class="ust">
    <div>
      <div class="belge-tur">${esc(belgeTuru(doc))}</div>
      <div class="kunye" style="text-align:left; margin-top:4px;">
        <div><strong>No:</strong> ${doc.documentNo ? esc(doc.documentNo) : YOK}</div>
        <div class="ettn">ETTN: ${doc.uuid ? esc(doc.uuid) : '—'}</div>
      </div>
    </div>
    <div class="kunye">
      <div><strong>Tarih:</strong> ${tarih ? esc(tarih) : YOK}</div>
      <div><strong>Para Birimi:</strong> ${esc(currency)}</div>
      ${senaryo ? `<div><strong>Senaryo:</strong> ${esc(senaryo)}</div>` : ''}
    </div>
  </div>

  <div class="kutular">
    ${tarafBlogu(doc.kind === 'DESPATCH' ? 'SEVK EDEN (SATICI)' : 'SATICI', doc.supplier)}
    ${tarafBlogu(doc.kind === 'DESPATCH' ? 'TESLİM ALAN (ALICI)' : 'ALICI', doc.customer)}
  </div>

  <table>
    <thead>
      <tr>
        <th style="width:34px">#</th>
        <th>Mal / Hizmet</th>
        <th style="width:70px" class="sag">Miktar</th>
        <th style="width:60px" class="orta">Birim</th>
        ${
          irsaliyeMi
            ? ''
            : `<th style="width:88px" class="sag">Birim Fiyat</th>
               <th style="width:80px" class="sag">İskonto</th>
               <th style="width:52px" class="orta">KDV</th>
               <th style="width:92px" class="sag">Diğer Vergi</th>
               <th style="width:100px" class="sag">Tutar</th>`
        }
      </tr>
    </thead>
    <tbody>${satirlar}</tbody>
  </table>

  ${irsaliyeMi
      ? `<div class="dipnot">Bu belge bir <strong>sevk irsaliyesidir</strong>; birim fiyat ve
         KDV içermez. Tutar sütunları bu yüzden gösterilmez — maliyet, satıcının
         keseceği faturayla oluşur.</div>`
      : `<div class="toplamlar">${toplamlar}</div>`}

  ${uyariBloku}

  <div class="dipnot">
    Bu görünüm belgenin KENDİ içeriğinden üretilmiştir (UBL-TR). Belgede
    bulunmayan alanlar "—" olarak gösterilir; hiçbir değer hesaplanmaz veya
    varsayılmaz.
  </div>
</body>
</html>`;
}
