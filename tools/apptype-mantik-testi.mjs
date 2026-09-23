/**
 * ARAÇ MANTIK TESTİ (SÖZLEŞME KANITI DEĞİLDİR)
 * ============================================
 * `phase19CancelContractProbe.ts` §2B'deki AppType sınıflandırma mantığını,
 * GERÇEK API'ye hiç dokunmadan sentetik yanıtlarla sınar.
 *
 * NEDEN: VM'de egress yok → §2B gerçek koşuda çalışmıyor. Mantığın doğru
 * sınıflandırdığı, Windows koşusundan önce burada kanıtlanır.
 *
 * ⛔ Bu çıktı HİÇBİR ŞEKİLDE sözleşme kanıtı veya PASS değildir.
 */

// ─── §2B'den birebir kopyalanan mantık ───────────────────────────────────────
function mesajOzeti(veri) {
  if (!veri || typeof veri !== 'object') return '(mesaj yok)';
  const d = Array.isArray(veri) ? veri[0] : veri;
  const m = d?.Message ?? d?.message ?? d?.ErrorMessage ?? d?.error;
  return typeof m === 'string' && m.trim() ? m.trim() : '(mesaj yok)';
}

function siniflandir(appOlculen) {
  const cikti = { imzalar: [], ayrisan: [], taninmayan: [], kontrolVar: false, hukum: '' };

  const imzalar = new Map();
  for (const o of appOlculen) {
    const imza = `${o.httpDurum}|${mesajOzeti(o.yanitVerisi)}`;
    if (!imzalar.has(imza)) imzalar.set(imza, []);
    imzalar.get(imza).push(o.deney.replace(/^Deney /, ''));
  }
  cikti.imzalar = [...imzalar.entries()].map(([k, g]) => ({ imza: k, gruplar: g }));

  const kontrol = appOlculen.find(o => o.deney.startsWith('Deney C0'));
  if (!kontrol) { cikti.hukum = 'KONTROL YOK'; return cikti; }
  cikti.kontrolVar = true;

  const ki = `${kontrol.httpDurum}|${mesajOzeti(kontrol.yanitVerisi)}`;
  const digerleri = appOlculen.filter(o => !o.deney.startsWith('Deney C0'));
  cikti.ayrisan = digerleri.filter(o => `${o.httpDurum}|${mesajOzeti(o.yanitVerisi)}` !== ki)
    .map(o => o.deney.replace(/^Deney /, ''));
  cikti.taninmayan = digerleri.filter(o => `${o.httpDurum}|${mesajOzeti(o.yanitVerisi)}` === ki)
    .map(o => o.deney.replace(/^Deney /, ''));

  cikti.hukum = cikti.ayrisan.length > 0
    ? `AYRİŞAN türler tanınıyor: ${cikti.ayrisan.join(', ')}`
    : 'HİÇBİRİ ayrışmadı — AppType doğrulanmıyor olabilir';
  return cikti;
}

// ─── Sentetik senaryolar ─────────────────────────────────────────────────────
const SENARYOLAR = [
  {
    ad: 'S1 — AppType doğrulanıyor, geçerli türler farklı mesaj veriyor',
    veri: [
      { deney: 'Deney C0 — kontrol', httpDurum: 200, yanitVerisi: { IsSucceeded: false, Message: 'Tüm alanlar dolu olmalıdır!' } },
      { deney: 'Deney C1', httpDurum: 200, yanitVerisi: { IsSucceeded: false, Message: 'Geçersiz belge türü!' } },
      { deney: 'Deney C2', httpDurum: 200, yanitVerisi: { IsSucceeded: false, Message: 'Belge bulunamadı.' } },
      { deney: 'Deney C3', httpDurum: 200, yanitVerisi: { IsSucceeded: false, Message: 'Belge bulunamadı.' } },
      { deney: 'Deney C4', httpDurum: 200, yanitVerisi: { IsSucceeded: false, Message: 'Geçersiz belge türü!' } },
      { deney: 'Deney C5', httpDurum: 200, yanitVerisi: { IsSucceeded: false, Message: 'Geçersiz belge türü!' } },
      { deney: 'Deney C6', httpDurum: 200, yanitVerisi: { IsSucceeded: false, Message: 'Belge bulunamadı.' } },
      { deney: 'Deney C7', httpDurum: 200, yanitVerisi: { IsSucceeded: false, Message: 'Geçersiz belge türü!' } },
    ],
  },
  {
    ad: 'S2 — Tüm AppType değerleri AYNI mesajı veriyor (doğrulanmıyor)',
    veri: [
      { deney: 'Deney C0 — kontrol', httpDurum: 200, yanitVerisi: { IsSucceeded: false, Message: 'Tüm alanlar dolu olmalıdır!' } },
      ...[1, 2, 3, 4, 5, 6, 7].map(t => ({ deney: `Deney C${t}`, httpDurum: 200, yanitVerisi: { IsSucceeded: false, Message: 'Tüm alanlar dolu olmalıdır!' } })),
    ],
  },
  {
    ad: 'S3 — Yalnız AppType=3 kontrolle aynı (tek geçerli tür)',
    veri: [
      { deney: 'Deney C0 — kontrol', httpDurum: 200, yanitVerisi: { IsSucceeded: false, Message: 'Tüm alanlar dolu olmalıdır!' } },
      ...[1, 2, 4, 5, 6, 7].map(t => ({ deney: `Deney C${t}`, httpDurum: 200, yanitVerisi: { IsSucceeded: false, Message: 'Geçersiz belge türü!' } })),
      { deney: 'Deney C3', httpDurum: 200, yanitVerisi: { IsSucceeded: false, Message: 'Tüm alanlar dolu olmalıdır!' } },
    ],
  },
  {
    ad: 'S4 — Kontrol deneyi yok (bozuk koşum)',
    veri: [
      { deney: 'Deney C1', httpDurum: 200, yanitVerisi: { IsSucceeded: false, Message: 'x' } },
    ],
  },
];

// ─── Koşum ───────────────────────────────────────────────────────────────────
console.log('ARAÇ MANTIK TESTİ — §2B AppType sınıflandırması');
console.log('⛔ SÖZLEŞME KANITI DEĞİLDİR. Gerçek API çağrılmadı.\n');

let gecen = 0, kalan = 0;
const BEKLENEN = {
  'S1': 'AYRİŞAN',
  'S2': 'HİÇBİRİ ayrışmadı',
  'S3': 'AYRİŞAN',
  'S4': 'KONTROL YOK',
};

for (const s of SENARYOLAR) {
  const r = siniflandir(s.veri);
  const anahtar = s.ad.slice(0, 2);
  const beklenti = BEKLENEN[anahtar];
  const tuttu = r.hukum.startsWith(beklenti) || r.hukum === beklenti;

  console.log(`${tuttu ? '✅' : '❌'} ${s.ad}`);
  console.log(`   Hüküm  : ${r.hukum}`);
  if (r.ayrisan.length) console.log(`   Ayrışan: ${r.ayrisan.join(', ')}`);
  if (r.taninmayan?.length) console.log(`   Aynı   : ${r.taninmayan.join(', ')}`);
  console.log(`   İmza sayısı: ${r.imzalar.length}`);
  for (const i of r.imzalar) console.log(`     [${i.gruplar.join(', ')}] → ${i.imza}`);
  console.log(`   Beklenen: "${beklenti}"  →  ${tuttu ? 'TUTTU' : 'TUTMADI'}`);
  console.log('');
  tuttu ? gecen++ : kalan++;
}

console.log(`SONUÇ: ${gecen} geçti, ${kalan} kaldı`);
process.exit(kalan === 0 ? 0 : 1);
