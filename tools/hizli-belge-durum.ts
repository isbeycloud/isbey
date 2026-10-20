#!/usr/bin/env tsx
/**
 * İŞBEY — HIZLI BİLİŞİM BELGE DURUM SORGUSU (SALT OKUNUR)
 * ========================================================
 * NEDEN VAR
 * ---------
 * `SAT-2026-000001` kaydında `eInvoiceStatus = 'SENT'` yazıyor, ama audit
 * kayıtları çelişiyor: aynı gün "SENDING kilidi NOT_FOUND ile serbest
 * bırakıldı — belge GÖNDERİLMEDİ" satırları var, sonra "kabul edildi" satırı
 * geliyor. Yerel alan TEK BAŞINA kanıt değildir; sağlayıcıya sorulur.
 *
 * Bu betik yalnızca SORAR. Göndermez, iptal etmez, yeniden denemez, DB'ye
 * yazmaz. Kontör tüketmez (sorgu uçları).
 *
 * ⚠️ 2026-10-20'DE ÖLÇÜLEN TUZAK (bu betiğin ilk sürümü bu tuzağa düştü)
 * ----------------------------------------------------------------------
 * `GetDocumentListGUID` ucu, `guids` filtresini UYGULAMIYOR ve yalnız ÇOK
 * YAKIN tarihli bir alt küme döndürüyor:
 *
 *   · İstenen ETTN ile sorgu  → 3 belge (appType 1) / 2 belge (appType 2),
 *     hiçbiri istenen belge DEĞİL
 *   · Boş `guids` ile sorgu   → yine 3 / 2 belge (bugünün belgeleri)
 *   · `GetDocumentList` + tarih aralığı → appType 1: 858, appType 2: 413 belge
 *     ve ARANAN BELGE BULUNDU (AppType = 2)
 *
 * Yani "GUID ucunda yok" ≠ "sağlayıcıda yok". İlk sürüm bu ikisini eşitleyip
 * yanlış "BULUNAMADI" hükmü verdi. Doğru kural: bir uç "yok" derse İKİNCİ
 * uçla doğrula; hiçbiri bulamazsa ve her iki sorgu da BAŞARILIYSA "yok"
 * denebilir. Aksi hâlde sonuç "belirsiz"dir.
 *
 * Kullanım:
 *   npx tsx tools/hizli-belge-durum.ts <ETTN/UUID> [--tarih YYYY-MM-DD] [--json <kanit.json>]
 *
 * `--json` verilirse sorgu sonucu MAKİNE OKUNUR kanıt dosyası olarak yazılır.
 * NEDEN: mali düzeltme aracı (`tools/mali-duzeltme.py`) "fatura gerçekten GİB'e
 * ulaştı mı" sorusunu ELE YAZILMIŞ bir beyana değil, bu sorgunun ÇIKTISINA
 * dayandırmalıdır. Kanıt dosyası ETTN, zarf kodu, tutar ve alıcı VKN'sini taşır;
 * düzeltme aracı bunları faturayla karşılaştırır ve tutmayan hiçbir alanla
 * ilerlemez.
 *
 * Çıkış kodu: 0 = sorgu yapıldı (belge var veya yok), 2 = sorgu YAPILAMADI.
 */
import 'dotenv/config';
import fs from 'node:fs';
import { HizliConnectService } from '../server/services/hizliConnectService';

/** Sağlayıcının "zarf GİB'e iletildi" başarı kodu. */
const ENVELOPE_SUCCESS = 1300;

/**
 * `--json` ile verilen kanıt dosyası yolu. Modül düzeyinde tutulur ki
 * beklenmedik bir hata (`catch`) durumunda da "sorgu yapılamadı" kanıtı
 * yazılabilsin — aksi hâlde çağıran taraf dosyayı hiç bulamaz ve "kanıt yok"
 * ile "sorgu yapılamadı" birbirine karışır.
 */
let KANIT_YOLU = '';

/** Token/hash değerlerinin ekrana sızmasını engeller. */
function gizle(deger: unknown): string {
  const s = typeof deger === 'string' ? deger : deger === undefined ? '' : String(deger);
  if (!s) return '';
  if (s.length <= 8) return '***';
  return `${s.slice(0, 4)}…${s.slice(-2)} (${s.length} kr)`;
}

function zorunluEnv(ad: string): string {
  const v = (process.env[ad] || '').trim();
  if (!v) throw new Error(`${ad} tanımsız — sorgu yapılamaz (uydurma sonuç üretilmez).`);
  return v;
}

/** İki tarih arası ±gun gün genişletilmiş ISO aralığı. */
function aralik(tarih: string, gun: number): { startDate: string; endDate: string } {
  const t = new Date(`${tarih}T00:00:00.000Z`);
  if (Number.isNaN(t.getTime())) throw new Error(`Geçersiz tarih: ${tarih}`);
  const bas = new Date(t.getTime() - gun * 86400000).toISOString();
  const bit = new Date(t.getTime() + gun * 86400000).toISOString();
  return { startDate: bas, endDate: bit };
}

/**
 * Sorgu sonucunu makine okunur kanıt dosyasına yazar.
 * `bulundu=false` ise belge sağlayıcıda görülmemiştir; bu "gönderilmedi"
 * demek DEĞİLDİR (bkz. yukarıdaki tuzak notu) ve dosyada `sonuc` alanı bunu
 * açıkça taşır.
 */
function kanitYaz(yol: string | null, kanit: Record<string, unknown>): void {
  if (!yol) return;
  try {
    fs.writeFileSync(yol, JSON.stringify({ ...kanit, yazildi: new Date().toISOString() }, null, 2), 'utf8');
    console.log(`kanıt     : ${yol}`);
  } catch (e: any) {
    // Kanıt yazılamadıysa bu SESSİZ geçmemeli: kararın dayanağı kaybolur.
    console.error(`UYARI: kanıt dosyası yazılamadı (${e?.message || e}) — sonuç yalnız ekranda.`);
    process.exitCode = 2;
  }
}

/**
 * Sağlayıcı belge kaydını kanıt nesnesine çevirir.
 *
 * Yalnız SAĞLAYICININ SÖYLEDİĞİ alanlar taşınır; yorum/çıkarım eklenmez.
 * `zarfGibIletildi` tek türetilmiş alandır ve kuralı burada yazılıdır:
 * zarf kodu 1300 = entegratör belgeyi GİB'e iletti. İş durumu (Status) AYRI
 * eksendir; "kabul edildi" hükmü için tek başına kullanılmaz.
 */
function kanitNesnesi(doc: any, appType: number, yol: 'GUID' | 'LIST', isTest: boolean, apiUrl: string) {
  const zarf = Number(doc.EnvelopeStatus ?? doc.envelopeStatus);
  return {
    ettn: String(doc.UUID ?? doc.uuid ?? ''),
    sonuc: 'BULUNDU',
    yol,
    appType,
    ortam: isTest ? 'TEST' : 'PRODUCTION',
    uc: apiUrl || '(servis sabiti)',
    zarfKodu: Number.isFinite(zarf) ? zarf : null,
    zarfAciklama: String(doc.EnvelopeExp ?? ''),
    zarfGibIletildi: Number.isFinite(zarf) && zarf === ENVELOPE_SUCCESS,
    isDurumu: doc.Status ?? null,
    isDurumuAciklama: String(doc.StatusExp ?? ''),
    belgeNo: doc.DocumentId ?? null,
    profil: doc.ProfileId ?? null,
    tipKodu: doc.DocumentTypeCode ?? null,
    aliciUnvan: doc.TargetTitle ?? null,
    aliciVkn: doc.TargetIdentifier ?? null,
    tutar: doc.PayableAmount ?? null,
    vergi: doc.TaxTotal ?? null,
    paraBirimi: doc.DocumentCurrencyCode ?? null,
    duzenlemeTarihi: doc.IssueDate ?? null,
    olusturmaZamani: doc.CreatedDate ?? null,
    iptalEdilebilir: doc.CancelOption === true ? true : doc.CancelOption === false ? false : null,
    yerelReferans: doc.LocalReferenceId ?? null,
    hamAlanlar: Object.keys(doc).sort(),
  };
}

function belgeYazdir(doc: any, appType: number): void {
  const envelope = Number(doc.EnvelopeStatus ?? doc.envelopeStatus);
  console.log(`  appType=${appType} : BELGE BULUNDU`);
  console.log('  ┌ sağlayıcı kaydı (ham alan adlarıyla)');
  console.log(`  │ ETTN/UUID          : ${doc.UUID ?? doc.uuid ?? '?'}`);
  console.log(`  │ zarf durumu        : ${Number.isFinite(envelope) ? envelope : '(alan yok)'}`
    + `${envelope === ENVELOPE_SUCCESS ? ' → GİB\'e iletim kodu' : ''} · ${doc.EnvelopeExp ?? ''}`);
  console.log(`  │ GİB/iş durumu      : ${doc.Status ?? '(alan yok)'} · ${doc.StatusExp ?? ''}`);
  console.log(`  │ belge numarası     : ${doc.DocumentId ?? '(alan yok)'}`);
  console.log(`  │ profil             : ${doc.ProfileId ?? '?'} · tip=${doc.DocumentTypeCode ?? '?'}`);
  console.log(`  │ alıcı              : ${doc.TargetTitle ?? '?'} / ${doc.TargetIdentifier ?? '?'}`);
  console.log(`  │ tutar              : ${doc.PayableAmount ?? '?'} ${doc.DocumentCurrencyCode ?? ''}`
    + ` (vergi ${doc.TaxTotal ?? '?'} · ${doc.KdvStr ?? ''})`);
  console.log(`  │ düzenleme tarihi   : ${doc.IssueDate ?? '(alan yok)'}`);
  console.log(`  │ oluşturma zamanı   : ${doc.CreatedDate ?? '(alan yok)'}`);
  console.log(`  │ iptal edilebilir mi: ${doc.CancelOption === true ? 'EVET' : doc.CancelOption === false ? 'HAYIR' : '?'}`
    + `${doc.CancelDate ? ` · iptal tarihi ${doc.CancelDate}` : ''}`);
  console.log(`  │ yerel referans     : ${doc.LocalReferenceId ?? '(yok)'}`);
  console.log(`  └ dönen alanlar      : ${Object.keys(doc).join(', ')}`);
}

async function main(): Promise<number> {
  const argv = process.argv.slice(2);
  // Seçenek DEĞERLERİ konumsal sanılmamalı (`--tarih 2026-09-25` → tarih,
  // `--json dosya` → dosya yolu). Aksi hâlde ETTN yerine o değer sorgulanır.
  const degerler = new Set<string>();
  for (const bayrak of ['--tarih', '--json']) {
    const i = argv.indexOf(bayrak);
    if (i >= 0 && argv[i + 1]) degerler.add(argv[i + 1]);
  }
  const uuidArg = argv.find((a) => !a.startsWith('--') && !degerler.has(a));
  const uuid = (uuidArg || '').trim();
  const tIdx = argv.indexOf('--tarih');
  const tarihArg = tIdx >= 0 ? (argv[tIdx + 1] || '').trim() : '';
  const jIdx = argv.indexOf('--json');
  const kanitYolu = jIdx >= 0 ? (argv[jIdx + 1] || '').trim() : '';
  KANIT_YOLU = kanitYolu;

  if (!uuid) {
    console.error('Kullanım: npx tsx tools/hizli-belge-durum.ts <ETTN/UUID> [--tarih YYYY-MM-DD] [--json <kanit.json>]');
    return 2;
  }

  const isTest = (process.env.HIZLI_BILISIM_IS_TEST_MODE || 'true') !== 'false';
  const apiUrl = (process.env.HIZLI_BILISIM_API_URL || '').trim();

  console.log('='.repeat(74));
  console.log('HIZLI BİLİŞİM BELGE DURUM SORGUSU — SALT OKUNUR (gönderim YOK)');
  console.log('='.repeat(74));
  console.log(`ETTN      : ${uuid}`);
  console.log(`ortam     : ${isTest ? 'TEST' : 'PRODUCTION'}`);
  console.log(`uç        : ${apiUrl || '(env boş — servis sabitini kullanır)'}`);
  console.log(`firma VKN : ${(process.env.HIZLI_BILISIM_VKN || '').trim() || '(yok)'}`);
  console.log('-'.repeat(74));

  // ── 1) Kimlik: env (kendi firmamız) ──
  const apiKey = zorunluEnv('HIZLI_BILISIM_API_KEY');
  const secretKey = zorunluEnv('HIZLI_BILISIM_SECRET_KEY');
  const wsUser = zorunluEnv('HIZLI_BILISIM_WS_USERNAME');
  const wsPass = zorunluEnv('HIZLI_BILISIM_WS_PASSWORD');

  const enc = await HizliConnectService.utilEncrypt(secretKey, wsUser, wsPass, isTest);
  if (!enc.success || !enc.hashedUsername || !enc.hashedPassword) {
    console.error(`SONUÇ: SORGU YAPILAMADI — UtilEncrypt başarısız: ${enc.message || 'bilinmeyen'}`);
    console.error('Bu "belge yok" DEMEK DEĞİLDİR.');
    kanitYaz(kanitYolu, { ettn: uuid, sonuc: 'SORGU_YAPILAMADI', hata: `UtilEncrypt: ${enc.message || 'bilinmeyen'}` });
    return 2;
  }
  const login = await HizliConnectService.login(apiKey, enc.hashedUsername, enc.hashedPassword, isTest);
  if (!login.success || !login.token) {
    console.error(`SONUÇ: SORGU YAPILAMADI — Login başarısız: ${login.message || 'bilinmeyen'}`);
    console.error('Bu "belge yok" DEMEK DEĞİLDİR.');
    kanitYaz(kanitYolu, { ettn: uuid, sonuc: 'SORGU_YAPILAMADI', hata: `Login: ${login.message || 'bilinmeyen'}` });
    return 2;
  }
  console.log(`kimlik    : UtilEncrypt + Login OK · token ${gizle(login.token)} · bitiş ${login.expireDate || '?'}`);
  console.log('-'.repeat(74));

  let basariliSorgu = false;
  const hatalar: string[] = [];

  // ── 2) Hızlı yol: GetDocumentListGUID, iki appType ──
  for (const appType of [1, 2]) {
    const res = await HizliConnectService.getDocumentListByGUID([uuid], appType, login.token, isTest);
    if (!res.success) {
      hatalar.push(`GUID/appType=${appType}: ${res.message || 'istek başarısız'}`);
      console.log(`GUID appType=${appType} : SORGU HATASI — ${res.message || 'bilinmeyen'}`);
      continue;
    }
    if (res.data?.IsSucceeded !== true) {
      hatalar.push(`GUID/appType=${appType}: ${res.data?.Message || 'sağlayıcı doğrulamadı'}`);
      console.log(`GUID appType=${appType} : İŞ HATASI — ${res.data?.Message || 'sağlayıcı doğrulamadı'}`);
      continue;
    }
    basariliSorgu = true;
    const documents = Array.isArray(res.data.documents) ? res.data.documents : [];
    const doc = documents.find(
      (d: any) => d && Object.values(d).some(
        (v) => typeof v === 'string' && v.toLowerCase() === uuid.toLowerCase()
      )
    );
    console.log(`GUID appType=${appType} : sorgu OK · ${documents.length} belge döndü`
      + (doc ? ' · ARANAN BELGE VAR' : ' · aranan belge bu alt kümede YOK'));
    if (doc) {
      belgeYazdir(doc, appType);
      console.log('-'.repeat(74));
      console.log('SONUÇ: BELGE SAĞLAYICIDA VAR (GUID ucu).');
      kanitYaz(kanitYolu, kanitNesnesi(doc, appType, 'GUID', isTest, apiUrl));
      return 0;
    }
  }

  // ── 3) Kesin yol: GetDocumentList + tarih aralığı ──
  // GUID ucu yalnız yakın tarihli bir alt küme döndürüyor; yokluğu kanıt değil.
  const tarih = tarihArg || new Date().toISOString().slice(0, 10);
  const { startDate, endDate } = aralik(tarih, 45);
  console.log('-'.repeat(74));
  console.log(`GUID ucu bulamadı → GetDocumentList ile tarih aralığı taranıyor`);
  console.log(`  aralık: ${startDate} … ${endDate} (${tarih} ± 45 gün)`);
  for (const appType of [1, 2]) {
    const r: any = await HizliConnectService.getDocumentList(
      { appType, dateType: 'CreateDate', startDate, endDate }, login.token, isTest
    );
    if (!r.success) {
      hatalar.push(`LIST/appType=${appType}: ${r.message || 'istek başarısız'}`);
      console.log(`LIST appType=${appType} : SORGU HATASI — ${r.message || 'bilinmeyen'}`);
      continue;
    }
    basariliSorgu = true;
    const docs: any[] = Array.isArray(r.documents) ? r.documents : [];
    const doc = docs.find((d) => String(d?.UUID || d?.uuid || '').toLowerCase() === uuid.toLowerCase());
    console.log(`LIST appType=${appType} : ${docs.length} belge tarandı`
      + (doc ? ' · ARANAN BELGE BULUNDU' : ' · aranan belge yok'));
    if (doc) {
      belgeYazdir(doc, appType);
      console.log('-'.repeat(74));
      console.log('SONUÇ: BELGE SAĞLAYICIDA VAR.');
      console.log('NOT   : Zarf 1300 = entegratör belgeyi GİB\'e iletti. İş durumu');
      console.log('        (Status/StatusExp) ayrı alandır; ikisi birlikte raporlanır.');
      kanitYaz(kanitYolu, kanitNesnesi(doc, appType, 'LIST', isTest, apiUrl));
      return 0;
    }
  }

  console.log('-'.repeat(74));
  if (basariliSorgu) {
    console.log('SONUÇ: SORGU YAPILDI (iki uç, iki appType) — bu ETTN BULUNAMADI.');
    console.log('NOT   : "Bulunamadı" tek başına "gönderilmedi" demek değildir;');
    console.log('        sağlayıcı indeksi gecikebilir. Yerel `SENT` alanı da tek');
    console.log('        başına kabul kanıtı DEĞİLDİR. İki kaynak da kesin değilse');
    console.log('        belge "durumu belirsiz" sayılır ve yeniden GÖNDERİLMEZ.');
    if (hatalar.length) console.log(`UYARI : ek olarak ${hatalar.length} sorgu hatası: ${hatalar.join(' | ')}`);
    kanitYaz(kanitYolu, {
      ettn: uuid, sonuc: 'BULUNAMADI', yol: 'GUID+LIST',
      ortam: isTest ? 'TEST' : 'PRODUCTION', uc: apiUrl || '(servis sabiti)',
      sorguHatalari: hatalar,
      not: 'Bulunamadı = gönderilmedi DEĞİLDİR; sağlayıcı indeksi gecikebilir.',
    });
    return 0;
  }

  console.log('SONUÇ: SORGU YAPILAMADI — "belge yok" DENEMEZ.');
  for (const h of hatalar) console.log(`  · ${h}`);
  kanitYaz(kanitYolu, {
    ettn: uuid, sonuc: 'SORGU_YAPILAMADI', yol: 'GUID+LIST',
    ortam: isTest ? 'TEST' : 'PRODUCTION', uc: apiUrl || '(servis sabiti)',
    sorguHatalari: hatalar,
  });
  return 2;
}

main()
  .then((kod) => process.exit(kod))
  .catch((err) => {
    console.error(`SONUÇ: SORGU YAPILAMADI — ${err?.message || err}`);
    kanitYaz(KANIT_YOLU, { sonuc: 'SORGU_YAPILAMADI', hata: String(err?.message || err) });
    process.exit(2);
  });
