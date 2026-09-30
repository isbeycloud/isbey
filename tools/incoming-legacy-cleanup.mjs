/**
 * İŞBEY CLOUD — Bozuk legacy gelen belge kaydı temizliği (tek seferlik)
 * =====================================================================
 * NEDEN VAR:
 *   2026-09-29'da, sağlayıcı yanıt şözleşmesi yanlış okunduğu için (PascalCase
 *   liste + `{DocumentFile}` sarmalayıcısı) üretim havuzuna içeriği okunamayan
 *   TEK bir kayıt yazıldı. Düzeltme `77da29a` ile canlıda; ancak bu kaydın
 *   `uuid` alanı boş olduğu için yeni kod onu hiçbir zaman eşleştirmez ve
 *   mükerrer de saymaz. Havuzda kalıcı bir çöp satır olarak durur.
 *
 *   Uygulamada gelen belge SİLME ucu yoktur; bu yüzden temizlik bilinçli olarak
 *   API dışında, tek seferlik ve dar kapsamlı bir betikle yapılır.
 *
 * NE SİLER (yalnız açıkça doğrulanan tek kayıt):
 *   incomingInvoices içinde id'si KOMUT SATIRINDAN verilen kayıt — ve yalnız
 *   aşağıdaki DÖRT kapının TAMAMI geçerse:
 *     1) uuid boş
 *     2) invoiceNo boş
 *     3) status === 'UNREADABLE'
 *     4) hiçbir fatura/irsaliye/cari/stok kaydı bu id'ye referans vermiyor
 *
 *   Kapılardan biri geçmezse betik HİÇBİR ŞEY YAZMAZ ve sıfırdan farklı kodla
 *   çıkar. "Yakın" kayıt silmez; yalnız kanıtlanmış bozuk kaydı siler.
 *
 * GÜVENLİK SINIRLARI:
 *   - NODE_ENV=production ise ÇALIŞMAZ (yanlışlıkla canlıya karşı koşulmasın).
 *   - Yazmadan önce ~/isbey-backups/ altına zaman damgalı TAM yedek bırakır.
 *   - Yazma atomiktir: temp dosya + renameSync.
 *   - İdempotenttir: kayıt yoksa hiçbir şey yazmaz (exit 0).
 *   - Silinen kaydın ÖZETİ (id + tarih + sebep) ekrana yazılır; sır yazılmaz.
 *
 * KULLANIM (sunucuda, repo kökünden):
 *   node tools/incoming-legacy-cleanup.mjs --id=inc-XXXX --confirm
 *   (--confirm olmadan KURU ÇALIŞMA yapar, hiçbir şey yazmaz)
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

// ─── Argümanlar ─────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const idArg = (args.find(a => a.startsWith('--id=')) || '').split('=')[1];
const onay = args.includes('--confirm');

if (!idArg) {
  console.error('Kullanım: node tools/incoming-legacy-cleanup.mjs --id=<kayıt-id> [--confirm]');
  process.exit(2);
}

// ─── Kapı 0: canlı ortamda çalışmayı reddet ────────────────────────────────
// Bu betik bilinçli olarak veri SİLER. Üretim sürecinin içinden çağrılırsa
// kazara çalışabilir; bu yüzden yalnız elle, açık onayla koşar.
if (process.env.NODE_ENV === 'production') {
  console.error('DURDURULDU: NODE_ENV=production. Bu betik yalnız elle çalıştırılır.');
  process.exit(3);
}

// ─── Veri dizini ───────────────────────────────────────────────────────────
const dataDir =
  process.env.ISBEY_DATA_DIR || path.join(os.homedir(), 'isbey-private');
const dbPath = path.join(dataDir, 'database.prod.json');
const yedekDir = path.join(os.homedir(), 'isbey-backups');

if (!fs.existsSync(dbPath)) {
  console.error(`DURDURULDU: veritabanı bulunamadı: ${dbPath}`);
  process.exit(3);
}

const db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
const havuz = Array.isArray(db.incomingInvoices) ? db.incomingInvoices : [];

// ─── Kapı 1: kayıt var mı ──────────────────────────────────────────────────
const hedef = havuz.find(k => k.id === idArg);
if (!hedef) {
  console.log(`Kayıt bulunamadı (${idArg}) — temizlik gerekmiyor (idempotent).`);
  process.exit(0);
}

// ─── Kapı 2: kayıt gerçekten "bozuk" mu (dört koşul birlikte) ──────────────
// Bu koşullar bozuk legacy kaydın ölçülmüş imzasıdır. Biri tutmuyorsa kayıt
// sağlamdır ve SİLİNMEZ — gerçek bir belgeyi silmek geri alınamaz.
const sorunlar = [];
if (hedef.uuid) sorunlar.push(`uuid dolu ("${String(hedef.uuid).slice(0, 8)}…")`);
if (hedef.invoiceNo) sorunlar.push('invoiceNo dolu');
if (hedef.status !== 'UNREADABLE') sorunlar.push(`status "${hedef.status}" (UNREADABLE bekleniyor)`);

// ─── Kapı 3: başka bir tablo bu kayda referans veriyor mu ─────────────────
const referanslar = [];
const tara = (ad, liste, alanlar) => {
  if (!Array.isArray(liste)) return;
  for (const k of liste) {
    for (const alan of alanlar) {
      if (k && k[alan] === idArg) {
        referanslar.push(`${ad}.${alan} → ${k.id || '?'}`);
      }
    }
  }
};
tara('invoices', db.invoices, ['incomingInvoiceId', 'sourceIncomingInvoiceId']);
tara('waybills', db.waybills, ['incomingInvoiceId', 'sourceIncomingInvoiceId']);
tara('currentTransactions', db.currentTransactions, ['incomingInvoiceId', 'sourceId']);
tara('stockMovements', db.stockMovements, ['incomingInvoiceId', 'sourceId']);

if (referanslar.length) {
  sorunlar.push(`referans var: ${referanslar.join(', ')}`);
}

// Aynı kalem kaydı havuzda kalmış mı? (kalemler belgeyle birlikte gider)
const kalemler = Array.isArray(db.incomingInvoiceItems)
  ? db.incomingInvoiceItems.filter(k => k.incomingInvoiceId === idArg)
  : [];

// ─── Karar ─────────────────────────────────────────────────────────────────
console.log('═══ BOZUK LEGACY KAYIT TEMİZLİĞİ ═══');
console.log(`Veritabanı : ${dbPath}`);
console.log(`Hedef kayıt: ${hedef.id}`);
console.log(`  uuid       : ${hedef.uuid || '(boş)'}`);
console.log(`  invoiceNo  : ${hedef.invoiceNo || '(boş)'}`);
console.log(`  status     : ${hedef.status}`);
console.log(`  receivedAt : ${hedef.receivedAt || '?'}`);
console.log(`Havuz boyutu (önce): ${havuz.length}`);
console.log(`İlişkili kalem     : ${kalemler.length}`);

if (sorunlar.length) {
  console.error('\nDURDURULDU — kayıt beklenen "bozuk" imzayla eşleşmiyor:');
  for (const s of sorunlar) console.error(`  ✗ ${s}`);
  console.error('\nHiçbir şey yazılmadı. Gerçek belge silinmedi.');
  process.exit(4);
}

if (!onay) {
  console.log('\nKURU ÇALIŞMA — hiçbir şey yazılmadı.');
  console.log('Gerçekten silmek için --confirm ekleyin.');
  process.exit(0);
}

// ─── Yedek ─────────────────────────────────────────────────────────────────
fs.mkdirSync(yedekDir, { recursive: true });
const damga = new Date().toISOString().replace(/[:.]/g, '-');
const yedekYolu = path.join(yedekDir, `before-incoming-cleanup-${damga}.json`);
fs.copyFileSync(dbPath, yedekYolu);
console.log(`\nYedek alındı: ${yedekYolu}`);

// ─── Sil (yalnız bu id) ────────────────────────────────────────────────────
db.incomingInvoices = havuz.filter(k => k.id !== idArg);
if (Array.isArray(db.incomingInvoiceItems)) {
  db.incomingInvoiceItems = db.incomingInvoiceItems.filter(
    k => k.incomingInvoiceId !== idArg
  );
}

// ─── Atomik yazma ──────────────────────────────────────────────────────────
const gecici = `${dbPath}.tmp-${process.pid}`;
fs.writeFileSync(gecici, JSON.stringify(db, null, 2), 'utf8');
fs.renameSync(gecici, dbPath);

console.log(`Havuz boyutu (sonra): ${db.incomingInvoices.length}`);
console.log(`\n✔ Silindi: ${hedef.id} (bozuk legacy kayıt)`);
console.log('  Muhasebe, stok ve cari kayıtlarına DOKUNULMADI.');
