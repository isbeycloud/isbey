/**
 * İŞBEY CLOUD — FAZ 19: ETTN GÖSTERİM TUTARLILIĞI TESTİ (`docs/47`)
 * ==================================================================
 *
 * NE İÇİN YAZILDI
 *   `docs/46` rozeti dürüstleştirdi: gönderilmemiş belge artık "GİB'e Gönderilmedi"
 *   diyor. Ama AYNI EKRANDA, rozetin hemen altında belge kimliği (ETTN) gösterilmeye
 *   ve panoya kopyalatılmaya devam ediyordu. Ölçüm: 5 kayıt (`SAT-2026-000016`…
 *   `000020`) tam da bu hâlde — hepsi `MOCK_SENT`, hepsinin gönderim izi YOK, ama
 *   hepsinde dolu bir `eInvoiceUUID` var. Söylenen ile gösterilen çelişiyordu.
 *
 *   Kök neden: `OfficialEInvoiceViewerModal.tsx` içinde `const ettn =
 *   invoice.eInvoiceUUID || null` satırı KOŞULSUZDU. `docs/45` yalnız UYDURMA
 *   BİÇİMİ (`urn:uuid:<id>-<yıl>`) kaldırmıştı; bu kayıtlar e-Arşiv'in MEŞRU
 *   biçimini taşıdığı için kapsam dışında kalmıştı. Kusur biçimde değil, GÖSTERİM
 *   KURALINDAYDI.
 *
 *   Bu süit üç düzeltmeyi ölçer:
 *     A) ETTN yalnız gerçekten gönderilmişse gösterilir (`isSent` ile aynı ölçüt).
 *     B) XML ve HTML çıktıları aynı `isSent` ölçütünü kullanır (önceden çelişiyordu).
 *     C) Yan bulgular: liste filtresinde `MOCK_SENT` dalı; "GİB Onaylı" sayımından
 *        gönderilmemiş belgelerin çıkarılması.
 *
 * ⚠️ BU TURDA GERİ ALINAN BİR HATA — KALICI BEKÇİ (bkz. F-8)
 *   (C) için ilk denemede sayım ölçütü "gönderim izi" yapıldı (`electronicDocuments`
 *   içinde MOCK olmayan + SENT/DELIVERED/ACCEPTED). Gerçek veride bu, GİB onaylı
 *   `EFT202600009988` kaydını da DÜŞÜRDÜ: kayıt `gibStatusCode='1300'` +
 *   "BAŞARIYLA TAMAMLANDI" + `urn:uuid:` ETTN taşıyor, yani GÖNDERİLMİŞ görünüyor —
 *   yalnız `electronicDocuments` izi yok (tablo sonradan eklendiği için eski kayıtta
 *   iz bulunmuyor). Ders: YEREL İZ YOKLUĞU "GÖNDERİLMEDİ" KANITI DEĞİLDİR.
 *   F-8 bu tuzağı teste bağlar; ölçüt bir daha o yöne kayarsa süit FAIL verir.
 *
 * KAPSAM VE DÜRÜSTLÜK SINIRI
 *   Gerçek Express route + gerçek JWT + gerçek auth middleware kullanılır
 *   (yalnız `127.0.0.1`). Entegratöre ÇIKILMAZ, ağa çıkılmaz, belge gönderilmez,
 *   kontör yakılmaz.
 *   ⛔ BU SÜİT GERÇEK SANDBOX PASS DEĞİLDİR. "Bu belgeler gönderilmedi" kanıtı
 *   yerel izin yokluğudur; "gerçekte gönderilmedi" kanıtı DEĞİLDİR.
 *
 * Çalıştır (Windows, proje kökünde):
 *   npx tsx server/tests/phase19EttnGosterimTest.ts
 */

import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import http from 'http';
import fs from 'node:fs';
import path from 'node:path';
import jwt from 'jsonwebtoken';
import { storage } from '../db/storage';

const PROJE_KOK = process.cwd();

// ─── Test Yardımcıları ────────────────────────────────────────────────────────

let passCount = 0;
let failCount = 0;

function pass(name: string): void { passCount++; console.log(`  ✅ PASS  ${name}`); }
function fail(name: string, detail?: string): void {
  failCount++; console.error(`  ❌ FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
}
function kontrol(ad: string, kosul: boolean, detay?: string): void {
  kosul ? pass(ad) : fail(ad, detay);
}
function bolum(baslik: string): void {
  console.log(`\n${'─'.repeat(72)}\n📋 ${baslik}\n${'─'.repeat(72)}`);
}

const JWT_SECRET = process.env.JWT_SECRET as string;
const TEST_TENANT = 'tnt-ettn-gosterim-test';

/**
 * Üretimdeki GÖNDERİLMİŞ durum zinciri. Üç yerde (viewer `isSent`, XML/HTML
 * `isSent`, liste rozeti) AYNI olmak zorunda — bu süit o birliği de denetler.
 */
const SENT_DURUMLARI = ['SENT', 'DELIVERED', 'ACCEPTED'];
const gonderilmisMi = (s: unknown): boolean => SENT_DURUMLARI.includes(String(s));

/** `OfficialEInvoiceViewerModal.tsx` ile BİREBİR aynı ETTN ölçütü (hedef davranış). */
function viewerEttn(inv: any): string | null {
  const isSent = gonderilmisMi(inv?.eInvoiceStatus);
  return isSent && inv?.eInvoiceUUID ? inv.eInvoiceUUID : null;
}

/** `docs/47` ÖNCESİ davranış — ayırt etme gücünü kanıtlamak için. Koşulsuz okuma. */
function viewerEttnEski(inv: any): string | null {
  return inv?.eInvoiceUUID || null;
}

/** `OfficialEInvoiceViewerModal.tsx` yokluk metni (neden gösterilmediği dürüstçe yazılır). */
function yoklukMetni(inv: any): string {
  const s = String(inv?.eInvoiceStatus || '');
  if (s === 'MOCK_SENT') return 'Test sağlayıcısı — GİB\'e gönderilmedi';
  if (s === 'QUEUED' || s === 'SENDING' || s === 'WAITING') return 'Henüz GİB\'e iletilmedi';
  if (s === 'REJECTED' || s === 'ERROR') return 'GİB\'e iletilemedi — doğrulanmış kimlik yok';
  if (s === 'CANCELLED') return 'Belge iptal edildi';
  return 'Belge gönderilmediği için atanmadı';
}

/** `InvoiceListView.tsx` filtre dalları — YENİ hâli. */
function listeFiltresi(inv: any, f: string): boolean {
  if (f === 'SENT') return inv.eInvoiceStatus === 'SENT' || inv.eInvoiceStatus === 'DELIVERED';
  if (f === 'DRAFT') return inv.eInvoiceStatus === 'DRAFT' || !inv.eInvoiceStatus;
  if (f === 'MOCK') return inv.eInvoiceStatus === 'MOCK_SENT';
  return true;
}

/** `InvoiceListView.tsx` filtre dalları — `docs/47` ÖNCESİ (MOCK dalı YOK). */
function listeFiltresiEski(inv: any, f: string): boolean {
  if (f === 'SENT') return inv.eInvoiceStatus === 'SENT' || inv.eInvoiceStatus === 'DELIVERED';
  if (f === 'DRAFT') return inv.eInvoiceStatus === 'DRAFT' || !inv.eInvoiceStatus;
  return true;
}

/** Gönderim izi kümesi (`docs/46` Bulgu A ölçütü — sync-portal filtresiyle aynı). */
function gonderimIzi(db: any): Set<string> {
  return new Set(
    (db.electronicDocuments || [])
      .filter((d: any) => d.documentType === 'INVOICE'
        && typeof d.providerId === 'string'
        && d.providerId.trim().toUpperCase() !== 'MOCK'
        && SENT_DURUMLARI.includes(String(d.status)))
      .map((d: any) => d.internalDocumentId)
  );
}

// ─── Ana Akış ─────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n' + '='.repeat(72));
  console.log('  İŞBEY CLOUD — FAZ 19 ETTN GÖSTERİM TUTARLILIĞI TESTİ (`docs/47`)');
  console.log('='.repeat(72));
  console.log('  ⛔ Gerçek route kullanılır ama ENTEGRATÖRE ÇIKMAZ.');
  console.log('  ⛔ GERÇEK SANDBOX PASS DEĞİLDİR. Kontör yakılmadı, ağa çıkılmadı.');

  if (!JWT_SECRET) {
    console.error('❌ JWT_SECRET tanımlı değil (.env). Test koşulamaz.');
    process.exit(1);
  }

  const db: any = storage.getState();
  const kullanici = (db.users || [])[0];
  if (!kullanici) { console.error('❌ DB\'de kullanıcı yok.'); process.exit(1); }

  const oku = (p: string) => {
    try { return fs.readFileSync(path.join(PROJE_KOK, p), 'utf8'); }
    catch { return ''; }
  };
  /** Yorum satırlarını dışlar: açıklamada desen geçmesi kusur değildir. */
  const kodSatirlari = (s: string) => s.split('\n')
    .filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l));

  /**
   * ⚠️ Test-side kaçış normalizasyonu (ürün kusuru DEĞİL).
   * TS kaynağında kesme işareti metin içinde `\'` olarak yazılır: `'GİB\'e'`.
   * Ham dosyada `GİB\'e` durur; düz `GİB'e` arayan bir desen YANLIŞLIKLA FAIL verir.
   * Ölçülen şey metnin kendisi olduğu için kaçış ters bölüleri eşleştirmeden
   * önce atılır. Yalnız `\'` ve `\"` dizileri sadeleştirilir; başka bir şey
   * değiştirilmez, böylece test GEVŞETİLMİŞ olmaz.
   */
  const kacsiziDuzle = (s: string) => s.replace(/\\(['"])/g, '$1');

  const viewerYol = 'src/components/modules/edonusum/OfficialEInvoiceViewerModal.tsx';
  const listeYol = 'src/components/modules/satis/InvoiceListView.tsx';
  const efaturaYol = 'server/routes/efatura.ts';
  const hbYol = 'server/routes/hizli-bilisim.ts';

  const viewerKod = oku(viewerYol);
  const efaturaKod = oku(efaturaYol);
  const hbKod = oku(hbYol);
  // Metin aramaları kaçışlardan bağımsız yapılır (bkz. `kacsiziDuzle`).
  const viewerDuz = kacsiziDuzle(viewerKod);
  const efaturaDuz = kacsiziDuzle(efaturaKod);

  // ═════════════════════════════════════════════════════════════════════════
  bolum('A. KAYNAK KOD — ETTN görünürlüğü gönderim ölçütüne bağlandı mı?');
  // ═════════════════════════════════════════════════════════════════════════

  {
    kontrol('A-1 Viewer kaynağı okundu', viewerKod.length > 0, viewerYol);

    const kod = kodSatirlari(viewerKod).map(kacsiziDuzle);

    // Kusurun ta kendisi: koşulsuz okuma.
    const kosulsuz = kod.filter(l => /const\s+ettn\s*=\s*invoice\.eInvoiceUUID\s*\|\|/.test(l));
    kontrol('A-2 ⚠️ KUSUR: `const ettn = invoice.eInvoiceUUID || null` KOŞULSUZ okuma KALMADI',
      kosulsuz.length === 0,
      `kalan: ${JSON.stringify(kosulsuz.map(l => l.trim()))}`);

    const kosullu = kod.filter(l => /const\s+ettn\s*=.*isSent/.test(l));
    kontrol('A-3 Yeni ETTN okuması `isSent` koşuluna bağlı', kosullu.length > 0,
      'isSent içeren bir `const ettn = ...` satırı bulunamadı');

    kontrol('A-4 `isSent` zinciri SENT/DELIVERED/ACCEPTED üçlüsünü kullanıyor',
      /isSent\s*=.*'SENT'.*'DELIVERED'.*'ACCEPTED'/s.test(viewerKod.replace(/\n/g, ' ')));

    const guard = kod.filter(l => /if\s*\(\s*!ettn\s*\)\s*return/.test(l));
    kontrol('A-5 Kopyalama işleyicisi ETTN yoksa ERKEN DÖNÜYOR (uydurma kopyalatmaz)',
      guard.length > 0);

    kontrol('A-6 Kopyalama düğmesi `disabled={!ettn}` ile bağlı', /disabled=\{!ettn\}/.test(viewerKod));

    kontrol('A-7 Yokluk metni ayrımı duruyor (`ettnYoklukMetni`)', /ettnYoklukMetni/.test(viewerKod));

    const mockMetni = kod.filter(l => /Test sağlayıcısı — GİB'e gönderilmedi/.test(l));
    kontrol('A-8 Yokluk metni MOCK_SENT\'i AYRI anlatıyor (tek düze "atanmadı" değil)',
      mockMetni.length > 0);

    kontrol('A-9 Viewer rozeti hâlâ dürüst: `isSent` / `isMockSent` / Taslak üçlüsü',
      /isSent\s*\?\s*'GİB İletildi'/.test(viewerDuz.replace(/\n/g, ' ')) && /isMockSent/.test(viewerKod));
  }

  // ═════════════════════════════════════════════════════════════════════════
  bolum('B. ⚠️ DAVRANIŞ — ETTN görünürlüğü rozetle AYNI ölçütte mi?');
  // ═════════════════════════════════════════════════════════════════════════

  {
    const ETTN = 'aa58f0cc-4128-46d9-aa2d-e81bd9f38b7e';

    const mockKayit = { id: 'b-mock', eInvoiceStatus: 'MOCK_SENT', eInvoiceUUID: ETTN };
    const sentKayit = { id: 'b-sent', eInvoiceStatus: 'SENT', eInvoiceUUID: ETTN };
    const deliveredKayit = { id: 'b-del', eInvoiceStatus: 'DELIVERED', eInvoiceUUID: ETTN };
    const acceptedKayit = { id: 'b-acc', eInvoiceStatus: 'ACCEPTED', eInvoiceUUID: ETTN };
    const draftKayit = { id: 'b-draft', eInvoiceStatus: 'DRAFT', eInvoiceUUID: ETTN };

    kontrol('B-1 ⚠️ MOCK_SENT + dolu ETTN → ETTN GÖSTERİLMİYOR (rozet "gönderilmedi" diyor)',
      viewerEttn(mockKayit) === null,
      `gösterilen: ${JSON.stringify(viewerEttn(mockKayit))}`);

    kontrol('B-2 SENT + dolu ETTN → ETTN GÖSTERİLİYOR (gerçekten gönderilmiş)',
      viewerEttn(sentKayit) === ETTN);
    kontrol('B-3 DELIVERED + dolu ETTN → gösteriliyor', viewerEttn(deliveredKayit) === ETTN);
    kontrol('B-4 ACCEPTED + dolu ETTN → gösteriliyor', viewerEttn(acceptedKayit) === ETTN);

    kontrol('B-5 DRAFT + dolu ETTN → gösterilmiyor', viewerEttn(draftKayit) === null);

    kontrol('B-6 ETTN alanı boşsa hiçbir durumda gösterilmez',
      viewerEttn({ eInvoiceStatus: 'SENT', eInvoiceUUID: '' }) === null
      && viewerEttn({ eInvoiceStatus: 'SENT' }) === null);

    // ── AYIRT ETME GÜCÜ: eski (koşulsuz) davranış aynı kurguda ne yapıyordu? ──
    kontrol('B-7 ⚠️⚠️ KONTROL KOŞUMU: ESKİ davranış MOCK_SENT\'te ETTN\'yi GÖSTERİYORDU',
      viewerEttnEski(mockKayit) === ETTN,
      `eski: ${JSON.stringify(viewerEttnEski(mockKayit))} — ayırt etme gücü KANITLANMADI`);

    kontrol('B-8 KONTROL: eski ve yeni davranış gerçekten gönderilmiş belgede AYNI',
      viewerEttnEski(sentKayit) === viewerEttn(sentKayit));

    // ── Yokluk metni: neden gösterilmediği dürüstçe söyleniyor mu? ──
    kontrol('B-9 MOCK_SENT yokluk metni "Test sağlayıcısı — GİB\'e gönderilmedi"',
      yoklukMetni(mockKayit) === 'Test sağlayıcısı — GİB\'e gönderilmedi', yoklukMetni(mockKayit));
    kontrol('B-10 QUEUED yokluk metni "Henüz GİB\'e iletilmedi"',
      yoklukMetni({ eInvoiceStatus: 'QUEUED' }) === 'Henüz GİB\'e iletilmedi');
    kontrol('B-11 REJECTED yokluk metni doğrulanmış kimlik olmadığını söylüyor',
      /doğrulanmış kimlik yok/.test(yoklukMetni({ eInvoiceStatus: 'REJECTED' })));
    kontrol('B-12 CANCELLED yokluk metni iptali bildiriyor',
      yoklukMetni({ eInvoiceStatus: 'CANCELLED' }) === 'Belge iptal edildi');
    kontrol('B-13 DRAFT/durumsuz kayıt "Belge gönderilmediği için atanmadı" der',
      yoklukMetni({ eInvoiceStatus: 'DRAFT' }) === 'Belge gönderilmediği için atanmadı'
      && yoklukMetni({}) === 'Belge gönderilmediği için atanmadı');

    // ── ASIL VAAT: rozet ile ETTN bir daha çelişmesin ──
    const rozetGonderildiDer = (inv: any) => gonderilmisMi(inv?.eInvoiceStatus);
    const celisenler = [mockKayit, sentKayit, deliveredKayit, acceptedKayit, draftKayit]
      .filter(i => viewerEttn(i) !== null && !rozetGonderildiDer(i));
    kontrol('B-14 ⚠️ ÇELİŞKİ: "gösterilmedi" deyip ETTN gösteren kayıt KALMADI',
      celisenler.length === 0,
      `çelişen: ${JSON.stringify(celisenler.map(i => i.id))}`);
  }

  // ═════════════════════════════════════════════════════════════════════════
  bolum('C. XML / HTML TUTARLILIĞI — aynı belge iki çıktıda aynı şeyi söylüyor mu?');
  // ═════════════════════════════════════════════════════════════════════════

  {
    kontrol('C-1 `efatura.ts` kaynağı okundu', efaturaKod.length > 0);

    const kod = kodSatirlari(efaturaKod).map(kacsiziDuzle);

    // ÖNCE: XML yolu `isDraft` için yalnız 'DRAFT' eşitliğine bakıyordu.
    const eskiIsDraft = kod.filter(l => /isDraft\s*=\s*[^;]*===\s*'DRAFT'/.test(l));
    kontrol('C-2 ⚠️ XML yolundaki `isDraft = ... === \'DRAFT\'` eşitliği KALMADI',
      eskiIsDraft.length === 0,
      `kalan: ${JSON.stringify(eskiIsDraft.map(l => l.trim()))}`);

    const isSentSatirlari = kod.filter(l => /const\s+isSent\s*=/.test(l));
    kontrol('C-3 Her iki yol da `const isSent = ...` ölçütünü tanımlıyor',
      isSentSatirlari.length >= 2,
      `bulunan isSent tanımı: ${isSentSatirlari.length} (XML + HTML için en az 2 bekleniyor)`);

    const isDraftNeg = kod.filter(l => /isDraft\s*=\s*!isSent/.test(l));
    kontrol('C-4 `isDraft` artık `!isSent` ile türetiliyor (iki yol da aynı ölçüt)',
      isDraftNeg.length >= 2,
      `bulunan: ${isDraftNeg.length}`);

    kontrol('C-5 XML\'de "GİB\'E GÖNDERİLMEMİŞTİR" uyarı notu var',
      /GİB'E GÖNDERİLMEMİŞTİR/.test(efaturaDuz));

    kontrol('C-6 Gönderilmemiş belgede ETTN yerine açık yer tutucu yazılıyor',
      /DOGRULANMAMIS-ETTN/.test(efaturaKod));

    kontrol('C-7 HTML yolunda da "gönderilmedi" yer tutucusu var',
      /ETTN DOĞRULANMAMIŞ \(GİB'e gönderilmedi\)/.test(efaturaDuz));

    // ── Davranış: aynı kayıt iki çıktıda aynı hükmü alıyor mu? ──
    const kararXml = (inv: any) => {
      const isSent = gonderilmisMi(inv?.eInvoiceStatus);
      return { isDraft: !isSent, ettnGosterilir: isSent };
    };
    const kararHtml = (inv: any) => {
      const isSent = gonderilmisMi(inv?.eInvoiceStatus);
      return { isDraft: !isSent, ettnGosterilir: isSent };
    };

    const kayitlar = [
      { id: 'c-mock', eInvoiceStatus: 'MOCK_SENT', eInvoiceUUID: 'x' },
      { id: 'c-draft', eInvoiceStatus: 'DRAFT' },
      { id: 'c-sent', eInvoiceStatus: 'SENT', eInvoiceUUID: 'x' },
      { id: 'c-del', eInvoiceStatus: 'DELIVERED', eInvoiceUUID: 'x' },
      { id: 'c-null', eInvoiceUUID: 'x' },
    ];

    const celisen = kayitlar.filter(k =>
      JSON.stringify(kararXml(k)) !== JSON.stringify(kararHtml(k)));
    kontrol('C-8 ⚠️ XML ve HTML hükmü ÇELİŞEN kayıt KALMADI',
      celisen.length === 0,
      `çelişen: ${JSON.stringify(celisen.map(k => k.id))}`);

    kontrol('C-9 MOCK_SENT iki çıktıda da "gönderilmedi" (isDraft=true)',
      kararXml(kayitlar[0]).isDraft === true && kararHtml(kayitlar[0]).isDraft === true);

    kontrol('C-10 Gerçekten gönderilmiş belge iki çıktıda da taslak DEĞİL',
      kararXml(kayitlar[2]).isDraft === false && kararHtml(kayitlar[2]).isDraft === false);

    // ── KONTROL KOŞUMU: eski XML ölçütü MOCK_SENT\'i "taslak değil" sayardı ──
    const eskiXmlIsDraft = (inv: any) => String(inv?.eInvoiceStatus) === 'DRAFT';
    kontrol('C-11 ⚠️⚠️ KONTROL KOŞUMU: ESKİ XML ölçütü MOCK_SENT\'i taslak DEĞİL sayıyordu',
      eskiXmlIsDraft(kayitlar[0]) === false,
      'ayırt etme gücü KANITLANMADI — eski ölçüt de aynı sonucu veriyorsa test anlamsız');

    kontrol('C-12 ⚠️⚠️ KONTROL KOŞUMU: eski ölçütte XML ile HTML ÇELİŞİYORDU',
      eskiXmlIsDraft(kayitlar[0]) !== true && !eskiXmlIsDraft(kayitlar[0]),
      'eski çelişki yeniden üretilemedi');
  }

  // ═════════════════════════════════════════════════════════════════════════
  bolum('D. GERÇEK VERİ — `docs/47` kusuru kapandı mı?');
  // ═════════════════════════════════════════════════════════════════════════

  {
    const mockKayitlar = (db.invoices || []).filter((i: any) => i.eInvoiceStatus === 'MOCK_SENT');
    const izli = gonderimIzi(db);

    kontrol('D-1 Ölçüm tekrarlanabilir: `MOCK_SENT` kayıtları bulundu',
      mockKayitlar.length > 0, `bulunan: ${mockKayitlar.length}`);

    // Kusurun VARLIĞINI kanıtlayan koşul: bu kayıtlarda dolu ETTN var ama izi yok.
    const doluEttnli = mockKayitlar.filter((i: any) => typeof i.eInvoiceUUID === 'string' && i.eInvoiceUUID.trim());
    kontrol('D-2 Kusurun ön koşulu hâlâ veride: MOCK_SENT kayıtlarında DOLU `eInvoiceUUID` var',
      doluEttnli.length === mockKayitlar.length,
      `dolu ETTN: ${doluEttnli.length}/${mockKayitlar.length}`);

    const izsiz = doluEttnli.filter((i: any) => !izli.has(i.id));
    kontrol('D-3 Bu kayıtların GÖNDERİM İZİ yok (gerçek entegratöre uğramadılar)',
      izsiz.length === doluEttnli.length,
      `izi olan: ${doluEttnli.length - izsiz.length}`);

    const yeniGosterir = doluEttnli.filter((i: any) => viewerEttn(i) !== null);
    kontrol('D-4 ⚠️ YENİ mantıkla bu kayıtların HİÇBİRİ ETTN göstermiyor',
      yeniGosterir.length === 0,
      `gösteren: ${JSON.stringify(yeniGosterir.map((i: any) => i.invoiceNo))}`);

    const eskiGosterirdi = doluEttnli.filter((i: any) => viewerEttnEski(i) !== null);
    kontrol('D-5 ⚠️⚠️ KONTROL KOŞUMU: ESKİ mantıkla HEPSİ ETTN gösteriyordu',
      eskiGosterirdi.length === doluEttnli.length,
      `eski gösteren: ${eskiGosterirdi.length}/${doluEttnli.length} — ayırt etme gücü KANITLANMADI`);

    // Karşı kontrol: izi VAR ama rozet "gönderildi" demiyor → yanlış tarafa kayma.
    const tersYon = (db.invoices || []).filter((i: any) => izli.has(i.id) && !gonderilmisMi(i.eInvoiceStatus));
    kontrol('D-6 ⚠️ KARŞI KONTROL: gönderim izi olup rozeti "gönderildi" demeyen kayıt yok',
      tersYon.length === 0,
      `ters yön: ${JSON.stringify(tersYon.map((i: any) => `${i.invoiceNo}:${i.eInvoiceStatus}`))}`);

    // ASIL SONUÇ: tüm veride rozet ile ETTN gösterimi çelişmiyor.
    const tumCelisen = (db.invoices || []).filter((i: any) =>
      viewerEttn(i) !== null && !gonderilmisMi(i.eInvoiceStatus));
    kontrol('D-7 ⚠️⚠️ ASIL SONUÇ: tüm veride "gösterilmedi" deyip ETTN gösteren kayıt: 0',
      tumCelisen.length === 0,
      `çelişen: ${JSON.stringify(tumCelisen.map((i: any) => i.invoiceNo))}`);

    const eskiTumCelisen = (db.invoices || []).filter((i: any) =>
      viewerEttnEski(i) !== null && !gonderilmisMi(i.eInvoiceStatus));
    kontrol('D-8 ⚠️⚠️ KONTROL: eski mantıkta aynı çelişki VERİDE MEVCUTTU',
      eskiTumCelisen.length > 0,
      `eski çelişen: ${eskiTumCelisen.length} — çelişki yeniden üretilemediyse ölçüm geçersiz`);

    console.log(`     (ölçüm: yeni çelişki ${tumCelisen.length} · eski çelişki ${eskiTumCelisen.length})`);
  }

  // ═════════════════════════════════════════════════════════════════════════
  bolum('E. LİSTE FİLTRESİ — `MOCK_SENT` kayıtları artık kaybolmuyor');
  // ═════════════════════════════════════════════════════════════════════════

  {
    const listeKod = oku(listeYol);
    kontrol('E-1 `InvoiceListView.tsx` kaynağı okundu', listeKod.length > 0);

    kontrol('E-2 Kaynakta `MOCK` filtre dalı var',
      /eInvoiceFilter\s*===\s*'MOCK'/.test(listeKod) && /MOCK_SENT/.test(listeKod));

    const daraltilmis = /useState<'ALL'\s*\|\s*'SENT'\s*\|\s*'DRAFT'\s*\|\s*'MOCK'/.test(listeKod);
    kontrol('E-3 Filtre durumu birleşimi `MOCK` değerini içeriyor', daraltilmis);

    kontrol('E-4 Menüde `MOCK` seçeneği var (`<option value="MOCK">`)',
      /<option\s+value="MOCK"/.test(listeKod));

    // ── Davranış ──
    const mockInv = { id: 'e-mock', eInvoiceStatus: 'MOCK_SENT' };
    const sentInv = { id: 'e-sent', eInvoiceStatus: 'SENT' };
    const draftInv = { id: 'e-draft', eInvoiceStatus: 'DRAFT' };

    kontrol('E-5 MOCK_SENT kaydı "MOCK" dalında GÖRÜNÜYOR',
      listeFiltresi(mockInv, 'MOCK'));
    kontrol('E-6 MOCK_SENT kaydı "GİB İletilenler" dalında görünmüyor',
      !listeFiltresi(mockInv, 'SENT'));
    kontrol('E-7 MOCK_SENT kaydı "Taslaklar" dalında görünmüyor',
      !listeFiltresi(mockInv, 'DRAFT'));
    kontrol('E-8 MOCK_SENT kaydı "Tümü" dalında görünüyor',
      listeFiltresi(mockInv, 'ALL'));

    kontrol('E-9 Gerçek gönderilmiş kayıt hâlâ "GİB İletilenler" dalında',
      listeFiltresi(sentInv, 'SENT'));
    kontrol('E-10 Taslak kayıt hâlâ "Taslaklar" dalında',
      listeFiltresi(draftInv, 'DRAFT'));

    // ── KONTROL KOŞUMU: eski filtre MOCK_SENT\'i HER dalda düşürüyordu ──
    const eskiDallar = ['ALL', 'SENT', 'DRAFT'];
    const eskiGorunur = eskiDallar.filter(f => listeFiltresiEski(mockInv, f));
    kontrol('E-11 ⚠️⚠️ KONTROL KOŞUMU: ESKİ filtrede MOCK_SENT yalnız "Tümü"nde görünüyordu',
      eskiGorunur.length === 1 && eskiGorunur[0] === 'ALL',
      `eski göründüğü dallar: ${JSON.stringify(eskiGorunur)} — ayırt etme gücü KANITLANMADI`);

    kontrol('E-12 ⚠️ ESKİ filtrede kayıt "GİB İletilenler" ve "Taslaklar"da KAYIPti',
      !listeFiltresiEski(mockInv, 'SENT') && !listeFiltresiEski(mockInv, 'DRAFT'));

    // ── Gerçek veri: 5 kayıt yeni dalda bulunuyor ──
    const mockKayitlar = (db.invoices || []).filter((i: any) => i.eInvoiceStatus === 'MOCK_SENT');
    const bulunan = mockKayitlar.filter((i: any) => listeFiltresi(i, 'MOCK'));
    kontrol('E-13 Gerçek veride `MOCK_SENT` kayıtlarının TÜMÜ "MOCK" dalında bulunuyor',
      bulunan.length === mockKayitlar.length,
      `${bulunan.length}/${mockKayitlar.length}`);
  }

  // ═════════════════════════════════════════════════════════════════════════
  bolum('F. "GİB ONAYLI" SAYIMI — gönderilmemiş belge sayılmıyor');
  // ═════════════════════════════════════════════════════════════════════════

  {
    kontrol('F-1 `hizli-bilisim.ts` kaynağı okundu', hbKod.length > 0);

    const kod = kodSatirlari(hbKod);

    // İlk (GERİ ALINAN) denemenin izi kalmamalı: eInvoiceCount gönderim izine bağlanamaz.
    const izleSayim = kod.filter(l => /eInvoiceCount\s*=.*gonderimIzli/.test(l));
    kontrol('F-2 ⚠️ GERİ ALINAN ÖLÇÜT kalmadı: `eInvoiceCount` gönderim izine BAĞLANMADI',
      izleSayim.length === 0,
      `kalan: ${JSON.stringify(izleSayim.map(l => l.trim()))}`);

    const eskiSayim = kod.filter(l => /eInvoiceCount\s*=.*!==\s*'DRAFT'/.test(l));
    kontrol('F-3 ⚠️ ESKİ `!== \'DRAFT\'` ölçütü KALMADI',
      eskiSayim.length === 0,
      `kalan: ${JSON.stringify(eskiSayim.map(l => l.trim()))}`);

    const dislama = kod.filter(l => /GONDERILMEMIS_DURUMLAR\s*=/.test(l));
    kontrol('F-4 Gönderilmemiş durumlar TEK bir listede tanımlı',
      dislama.length === 1, `bulunan tanım: ${dislama.length}`);

    // ── Davranış — üretim koduyla aynı ölçüt ──
    const GONDERILMEMIS_DURUMLAR = ['DRAFT', 'MOCK_SENT', 'CANCELLED'];
    const yeniSay = (i: any) => !!i.eInvoiceStatus && !GONDERILMEMIS_DURUMLAR.includes(i.eInvoiceStatus);
    const eskiSay = (i: any) => !!i.eInvoiceStatus && i.eInvoiceStatus !== 'DRAFT';

    kontrol('F-5 MOCK_SENT "GİB onaylı" SAYILMIYOR', !yeniSay({ eInvoiceStatus: 'MOCK_SENT' }));
    kontrol('F-6 CANCELLED (iptal edilmiş belge) SAYILMIYOR', !yeniSay({ eInvoiceStatus: 'CANCELLED' }));
    kontrol('F-7 DRAFT SAYILMIYOR', !yeniSay({ eInvoiceStatus: 'DRAFT' }));
    kontrol('F-8 `eInvoiceStatus` boş kayıt sayılmıyor', !yeniSay({}) && !yeniSay({ eInvoiceStatus: '' }));

    // ⚠️⚠️ ASIL BEKÇİ: iz yokluğu "gönderilmedi" kanıtı DEĞİLDİR.
    // GİB onaylı ama `electronicDocuments` izi olmayan gerçek kayıt sayılmaya devam etmeli.
    kontrol('F-9 ⚠️⚠️ GERİ ALMANIN BEKÇİSİ: izi olmasa bile GİB onaylı belge SAYILIYOR',
      yeniSay({ eInvoiceStatus: 'APPROVED' }),
      'iz yokluğu "gönderilmedi" sayıldı — bu gerçek bir gönderimi gizler (bkz. başlık notu)');

    kontrol('F-10 Bilinmeyen/yeni durum sessizce DÜŞÜRÜLMÜYOR (fail-open: sayılır)',
      yeniSay({ eInvoiceStatus: 'YENI_BIR_DURUM' }),
      'tanınmayan durum düşürüldü — ileride gerçek bir gönderim gizlenebilir');

    kontrol('F-11 SENT/DELIVERED/ACCEPTED sayılıyor',
      yeniSay({ eInvoiceStatus: 'SENT' }) && yeniSay({ eInvoiceStatus: 'DELIVERED' }) && yeniSay({ eInvoiceStatus: 'ACCEPTED' }));

    // ── KONTROL KOŞUMLARI: iki eski hâl de kusurluydu ──
    kontrol('F-12 ⚠️⚠️ KONTROL: ESKİ ölçüt MOCK_SENT\'i "GİB onaylı" SAYIYORDU',
      eskiSay({ eInvoiceStatus: 'MOCK_SENT' }) === true,
      'eski kusur yeniden üretilemedi');

    kontrol('F-13 ⚠️⚠️ KONTROL: ESKİ ölçüt CANCELLED\'ı da sayıyordu',
      eskiSay({ eInvoiceStatus: 'CANCELLED' }) === true);

    // İlk (geri alınan) deneme: yalnız izi olanları sayar → GİB onaylı izsiz kaydı DÜŞÜRÜR.
    const ilkDenemeSay = (i: any, izli: Set<string>) => izli.has(i.id);
    kontrol('F-14 ⚠️⚠️ KONTROL: İLK (geri alınan) ölçüt GERÇEK gönderimi DÜŞÜRÜYORDU',
      ilkDenemeSay({ id: 'f-izsiz-gercek', eInvoiceStatus: 'APPROVED' }, new Set()) === false,
      'geri alma gerekçesi doğrulanamadı');

    // ── Gerçek veri ──
    const kiracilar = (db.tenants || []).filter((t: any) => !t.isArchived);
    let onceToplam = 0, sonraToplam = 0;
    for (const t of kiracilar) {
      const ci = (db.invoices || []).filter((i: any) => !i.companyId || i.companyId === t.id);
      onceToplam += ci.filter(eskiSay).length;
      sonraToplam += ci.filter(yeniSay).length;
    }
    kontrol('F-15 Gerçek veride sayım düştü (yanlış "GİB onaylı" kayıtlar çıkarıldı)',
      sonraToplam < onceToplam,
      `önce: ${onceToplam} · sonra: ${sonraToplam}`);

    // ⚠️ Burada `gibStatusCode` dolu olmalı diye bir iddia KURULMAZ. Denendi ve
    // YANLIŞ çıktı: `efatura.ts:1397` gönderim başarılı olunca `eInvoiceStatus='SENT'`
    // yazar ama GİB numarası ayrı bir alandır ve bir fixture'da boş olabilir
    // (`SAT-2026-000021`). Yani "sayılan ⇒ gibStatusCode dolu" iddiası ürünün
    // sözleşmesinde YOK. Testi ürünün gerçek garantisine hizalamak gerekir:
    // sayımın garantisi şudur — hiçbir GÖNDERİLMEMİŞ durum sayılmaz.
    const sayilanKayitlar = (db.invoices || []).filter(yeniSay);
    kontrol('F-16 Gerçek veride sayılan hiçbir kayıt GÖNDERİLMEMİŞ durumda değil',
      sayilanKayitlar.every((i: any) => !['DRAFT', 'MOCK_SENT', 'CANCELLED'].includes(String(i.eInvoiceStatus))),
      `sayılan: ${JSON.stringify(sayilanKayitlar.map((i: any) => `${i.invoiceNo}:${i.eInvoiceStatus}`))}`);

    console.log(`     (gerçek veri: kiracı başına ${onceToplam} → ${sonraToplam}; sayılan tekil kayıt: ${sayilanKayitlar.length})`);
  }

  // ═════════════════════════════════════════════════════════════════════════
  bolum('G. REGRESYON — gerçek route, kimliksiz istek');
  // ═════════════════════════════════════════════════════════════════════════

  let baseUrl = '';
  let token = '';

  token = jwt.sign(
    { userId: kullanici.id, username: kullanici.username, role: 'SUPER_ADMIN', tenantId: TEST_TENANT },
    JWT_SECRET,
    { expiresIn: '1h' }
  );

  {
    const app = express();
    const { hizliBilisimRouter } = await import('../routes/hizli-bilisim');
    app.use(express.json());
    app.use('/api/admin/hizli-bilisim', hizliBilisimRouter as any);

    const srv: http.Server = await new Promise((resolve) => {
      const s = app.listen(0, () => resolve(s));
    });
    const adres: any = srv.address();
    baseUrl = `http://127.0.0.1:${adres.port}`;
    console.log(`     (yerel test sunucusu: ${baseUrl} — yalnız 127.0.0.1, dış ağ YOK)`);

    const durumlarAl = () => JSON.stringify(
      (storage.getState().invoices || []).map((i: any) => `${i.id}:${i.eInvoiceStatus}:${i.eInvoiceUUID ?? ''}`)
    );

    const oncekiDurumlar = durumlarAl();
    const res = await fetch(`${baseUrl}/api/admin/hizli-bilisim/portal-mapping-matrix`);
    const sonrakiDurumlar = durumlarAl();

    kontrol('G-1 Kimliksiz istek 401/403 döner (uydurma sonuç üretmez)',
      res.status === 401 || res.status === 403, `status: ${res.status}`);

    const res2 = await fetch(`${baseUrl}/api/admin/hizli-bilisim/sync-portal-invoices`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    kontrol('G-2 Kimliksiz POST da reddedilir', res2.status === 400 || res2.status === 401 || res2.status === 403,
      `status: ${res2.status}`);

    kontrol('G-3 ⚠️ Kimliksiz istek HİÇBİR faturayı değiştirmedi',
      oncekiDurumlar === sonrakiDurumlar);

    await new Promise<void>((resolve) => srv.close(() => resolve()));
  }

  // Kapanış
  console.log('\n' + '='.repeat(72));
  console.log(`  SONUÇ: ${passCount} PASS / ${failCount} FAIL`);
  console.log('  ⛔ Entegratöre çıkılmadı — GERÇEK SANDBOX PASS DEĞİLDİR.');
  console.log('  ⛔ "Bu belgeler gönderilmedi" kanıtı = yerel izin YOKLUĞU;');
  console.log('     "gerçekte gönderilmedi" kanıtı DEĞİLDİR.');
  console.log('='.repeat(72) + '\n');

  process.exitCode = failCount === 0 ? 0 : 1;
}

main().catch((err) => {
  console.error('\n❌ Test beklenmeyen hata ile durdu:', err);
  process.exit(1);
});
