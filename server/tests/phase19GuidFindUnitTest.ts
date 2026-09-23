/**
 * İŞBEY CLOUD — FAZ 19: GUID EŞLEŞTİRME BİRİM TESTİ (`docs/50` S-G4)
 * =====================================================================
 * `docs[0]` deseni yerine istenen UUID'nin arandığı düzeltmenin testi.
 *
 * TAMAMEN ÇEVRİMDIŞI: ağ yok, DB yok, credential yok, kontör yok.
 * Test edilen:
 *   A) Kaynak kodda `find` + UUID eşleştirme deseninin VARLIĞI
 *      (`hizliConnectService.ts` + `hizliTeknolojiProvider.ts`) ve
 *      yürütülebilir `docs[0]` deseninin YOKLUĞU.
 *   B) Eşleştirme mantığının davranışı (üretim kodundakiyle AYNI
 *      predicate, temsilî belge listeleriyle): eşleşen bulunur,
 *      eşleşmeyen BOŞ sonuç verir (ilgisiz belgenin durumu dönülmez).
 *
 * Çalıştır: node --import tsx server/tests/phase19GuidFindUnitTest.ts
 */

import path from 'path';
import fs from 'fs';

const BU_DOSYA = path.resolve(process.argv[1] || path.join('server', 'tests', 'phase19GuidFindUnitTest.ts'));
const KOK = process.env.ISBEY_REPO_ROOT
  ? path.resolve(process.env.ISBEY_REPO_ROOT)
  : path.resolve(path.dirname(BU_DOSYA), '..', '..');

let passCount = 0;
let failCount = 0;

function pass(name: string) { passCount++; console.log(`  ✅ PASS  ${name}`); }
function fail(name: string, detail?: string) { failCount++; console.error(`  ❌ FAIL  ${name}${detail ? ` — ${detail}` : ''}`); }
function assert(c: boolean, name: string, detail?: string) { if (c) pass(name); else fail(name, detail); }
function section(t: string) { console.log(`\n${'─'.repeat(70)}\n📋 ${t}\n${'─'.repeat(70)}`); }

// Üretim kodundaki predicate'in BİREBİR kopyası (davranış testi için).
// Kaynakla birebirliği BÖLÜM A'daki statik denetim garanti eder.
function esleseniBul(liste: any[], uuid: string): any | undefined {
  return liste.find(
    (d: any) => d && (d.UUID === uuid || d.uuid === uuid || d.Id === uuid || d.id === uuid)
  );
}

section('A. STATİK — find deseni kodda mevcut, docs[0] deseni yok');

{
  const svc = fs.readFileSync(path.join(KOK, 'server', 'services', 'hizliConnectService.ts'), 'utf-8');
  const prv = fs.readFileSync(path.join(KOK, 'server', 'services', 'providers', 'hizliTeknolojiProvider.ts'), 'utf-8');

  const findDeseni = /liste\.find\(\s*\(d: any\) => d && \(d\.UUID === uuid \|\| d\.uuid === uuid \|\| d\.Id === uuid \|\| d\.id === uuid\)/;
  assert(findDeseni.test(svc), 'hizliConnectService.getInvoiceStatus: UUID find deseni mevcut');
  assert(findDeseni.test(prv), 'hizliTeknolojiProvider.getInvoiceStatus: UUID find deseni mevcut');

  // Yürütülebilir docs[0] kalmadı (yorum satırları sayılmaz).
  const yurutulebilir = (kaynak: string) => kaynak.split('\n')
    .filter(s => !/^\s*(\/\/|\*|\/\*)/.test(s))
    .some(s => /docs\[0\]/.test(s));
  assert(!yurutulebilir(svc), 'hizliConnectService: yürütülebilir docs[0] yok');
  assert(!yurutulebilir(prv), 'hizliTeknolojiProvider: yürütülebilir docs[0] yok');

  // Bulunamama dalları mevcut (boş/UNKNOWN sonuç).
  assert(svc.includes('Entegratör bu UUID için durum kaydı döndürmedi.'),
    'hizliConnectService: bulunamadı dalı (boş sonuç) mevcut');
  assert(prv.includes('Entegratör bu UUID için durum kaydı döndürmedi.'),
    'hizliTeknolojiProvider: bulunamadı dalı (UNKNOWN) mevcut');
}

section('B. DAVRANIŞ — eşleşen bulunur, eşleşmeyen boş döner');

{
  const istenen = '11111111-2222-4333-8444-555555555555';
  const liste = [
    { UUID: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee', statusCode: 1300, statusDescription: 'İLİŞKİSİZ BELGE' },
    { UUID: istenen, statusCode: 1200, statusDescription: 'DOĞRU BELGE' },
  ];

  // B-1: İstenen kimlik listede → DOĞRU belge bulunur (docs[0] olsaydı yanlış belge dönerdi).
  const bulunan = esleseniBul(liste, istenen);
  assert(bulunan?.statusCode === 1200, 'B-1 eşleşen UUID bulunur (docs[0] tuzağına düşülmez)',
    `dönen statusCode=${bulunan?.statusCode}`);

  // B-2 (S-G4 senaryosu): İstenen kimlik listede YOK → undefined (boş sonuç).
  const yok = esleseniBul(liste, '00000000-0000-4000-8000-000000000000');
  assert(yok === undefined, 'B-2 uydurma kimlik bulunamaz → boş sonuç (ilgisiz durum dönülmez)');

  // B-3: Alan adı varyantları (UUID/uuid/Id/id).
  assert(esleseniBul([{ uuid: istenen }], istenen)?.uuid === istenen, 'B-3 küçük harf uuid eşleşir');
  assert(esleseniBul([{ Id: istenen }], istenen)?.Id === istenen, 'B-4 Id eşleşir');
  assert(esleseniBul([{ id: istenen }], istenen)?.id === istenen, 'B-5 id eşleşir');

  // B-6: Boş liste → undefined (D6/D7 senaryosu).
  assert(esleseniBul([], istenen) === undefined, 'B-6 boş documents → boş sonuç');
}

console.log(`\n${'='.repeat(70)}`);
console.log(`  SONUÇ: ${passCount} PASS / ${failCount} FAIL (çevrimdışı birim test, ağ yok)`);
console.log('='.repeat(70));
process.exit(failCount > 0 ? 1 : 0);
