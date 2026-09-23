# FAZ 19 — `GetDocumentListGUID` `guids` Filtresi Uygulanmıyor Görünüyor (S-G4)

**Tarih:** 17.09.2026
**Durum:** 🔴 **ÖLÇÜM / BULGU** — hiçbir kod değiştirilmedi, ikinci bir ölçüm koşulmadı.
Bu belge bir **tespit** ve bir **düzeltme talebidir**.
**Canlı API'ye ek istek gönderilmedi. Belge gönderilmedi/iptal edilmedi.**
**Öncesi bakiye 12:16'da kalan 206; sonrası bakiye henüz alınmadı.**

---

## 1. Sorun — tek cümle

`docs/48` §10'un 13:03 koşusu (`[SOZLESME_OLCUMU:OLCULDU]`) gösterdi ki
`GetDocumentListGUID` ucu, gövdede gönderilen `guids` listesindeki kimliği
**yanıtta döndürmüyor** — 8 deneyin 8'inde de "istenen kimlik döndü mü: HAYIR".
Uç, kimliğe göre durum söylemek yerine istenen `AppType`'ın genel listesinden
belge döndürüyor görünüyor.

---

## 2. Ölçüm — S-G4 (13:03 kaydı)

Ham kayıt: `.verify-tmp\faz19-guid-sozlesme-20260917-130318.txt`
Kanıt JSON: `.verify-tmp\faz19-guid-sozlesme-2026-09-17T10-03-20-805Z.json`

| Deney | Belge sayısı | İstenen kimlik döndü mü | Dönen `AppType` |
|---|---|---|---|
| D0 (kontrol, appType yok) | 10 | HAYIR | 2 |
| D1 (appType=1) | 5 | HAYIR | 1 |
| D2 (appType=2) | 10 | HAYIR | 2 |
| D3 (appType=3) | 31 | HAYIR | 3 |
| D4 (appType=4) | 1 | HAYIR | 4 |
| D5 (appType=5) | 12 | HAYIR | 5 |
| D6 (appType=6) | 0 | HAYIR | — |
| D7 (appType=7) | 0 | HAYIR | — |

Hüküm, göz kararıyla değil araç çıktısıyla verildi (rev 2'de `istenenKimlikDonduMu`
alanı ölçüm anında kaydediliyor).

---

## 3. Dört çağrı yolunun etkilenme analizi

Uca giden dört üretim yolu var. Her birinin bu bulgudan nasıl etkilendiği,
**kod okumasıyla** çıkarıldı (davranış koşulmadı):

| # | Yol | Eşleştirme yapıyor mu? | Hüküm |
|---|---|---|---|
| 1 | `hizli-bilisim.ts:981-988` (`sync-portal-invoices`) | ✅ EVET — dönen `uuid/UUID/ettn`'yi `draft.invoices[].eInvoiceUUID` ile eşleştiriyor; eşleşmeyen belge atlanıyor (`if (!inv) continue`) | **GÜVENLİ** — yanlış belgeye durum yazılmaz. En kötü sonuç: hiçbir kayıt güncellenmez (`updatedCount=0`), sessizce boş senkronizasyon. |
| 2 | `hizliConnectService.ts:1564-1582` (`getInvoiceStatus`) | ⛔ HAYIR — `docs[0]`'ı (ilk belgeyi) sorgulanan UUID'nin durumu sanıyor | **GÜVENLİSİZ** — sorgulanan belgeyle ilgisiz bir belgenin durumu, çağırana "bu belgenin durumu" diye dönüyor. |
| 3 | `hizliTeknolojiProvider.ts:232-271` (`getInvoiceStatus`) | ⛔ HAYIR — aynı `docs[0]` deseni (`:260`); boş gövdede `UNKNOWN` dönmesi doğru ama dolu gövdede eşleştirme yok | **GÜVENLİSİZ** — 2. maddedeki yanlış cevap buradan `syncDocumentStatus`'a akıyor. |
| 4 | `efatura.ts:839-887` (`batch-status-sync` → `getInvoiceStatus`) | ⛔ HAYIR — 2. maddenin cevabını doğrudan kayda yazıyor (`:867-876`); `gibStatus` boşsa atlıyor ama doluysa UUID eşleşmesi aramıyor | **GÜVENLİSİZ** — ilgisiz belgenin `gibStatusCode`'u faturaya yazılabilir. Hafifletici: yalnız `SENT/WAITING/QUEUED` adayları işleniyor, `updated[]` listesi dönüyor (izlenebilir). |

Zincir: `batch-status-sync` → `getInvoiceStatus` (`docs[0]`) → provider `getInvoiceStatus`
(`docs[0]`) → `syncDocumentStatus` (`electronicDocumentService.ts:291-321`, eşleştirme
yok, `providerStatus`/`errorCode` yazılıyor). Yani 2+3+4 aynı `docs[0]` varsayımını
paylaşıyor; düzeltilmesi gereken yer burasıdır.

---

## 4. ⛔ Dürüstlük sınırı

Bu belge **şunları kanıtlamaz:**

- ⛔ Uçun `guids`'i **hiçbir koşulda** uygulamadığı — uydurma (var olmayan) bir
  kimlikle ölçüldü. Gerçek bir kimlik gönderildiğinde uç farklı davranabilir
  (örn. bulunan kaydı döndürür). Kesin kanıt için gerçek belge akışı gerekir:
  `tools/faz19-belge-akisi.ps1`.
- ⛔ Üretimde fiilen yanlış durum yazıldığı — gönderilmiş gerçek belge yok.
- ⛔ `sync-portal-invoices`'ın boş döndüğü — o yol eşleştirme yapıyor, yanlış
  yazmaz; ama boş senkronizasyon olasılığı da koşulmadı.

Kanıtladığı tek şey: **uydurma kimlikle yapılan 8/8 sorguda istenen kimlik
dönmedi** ve **üç yolun `docs[0]`'ı sorgulanan belgenin durumu sandığı**
(kaynak okuması).

---

## 5. Önerilen düzeltme (kod değişikliği — izin gerekir)

`docs[0]`'ı körü körüne almak yerine, dönen belgede **istenen UUID aranır**;
bulunamazsa "durum yok" dönülür:

- `hizliConnectService.ts:1569-1570` (`getInvoiceStatus`): `docs[0]` yerine
  `docs.find(d => (d.UUID || d.uuid) === uuid)`; bulunamazsa boş sonuç
  (`status: '', gibStatus: ''`) — çağıranlar zaten boş sonucu "atla" diye
  işliyor (`efatura.ts:862-865`, provider `:249-258`).
- `hizliTeknolojiProvider.ts:259-260`: aynı `find` deseni; bulunamazsa mevcut
  `UNKNOWN` dalına düşer (yeni dal gerekmez).
- `sync-portal-invoices` (`hizli-bilisim.ts:981-988`): zaten eşleştiriyor —
  dokunulmaz.
- Test: mevcut `phase19DocumentLifecycleTest.ts` içine `docs[0]` yerine `find`
  davranışını doğrulayan birim test (ağ yok, saf fonksiyon).

## 6. Uygulama (17.09.2026 — kullanıcı izni: "bu konuyu sana bırakıyorum")

Öneri uygulandı, **üçüncü bir ölçüm koşulmadı** (yalnız çevrimdışı birim test):

- `hizliConnectService.ts:1569-1590` (`getInvoiceStatus`): `docs[0]` yerine
  `liste.find(d => d.UUID === uuid || d.uuid === uuid || d.Id === uuid || d.id === uuid)`;
  bulunamazsa boş sonuç (çağıranlar boş sonucu zaten "atla" diye işliyor).
- `hizliTeknolojiProvider.ts:259-276`: aynı `find` deseni; bulunamazsa mevcut
  `UNKNOWN` dalı (yeni dal gerekmedi).
- `sync-portal-invoices` (`hizli-bilisim.ts:981-988`): zaten eşleştiriyor — dokunulmadı.
- **Yeni birim test `server/tests/phase19GuidFindUnitTest.ts`: 12 PASS / 0 FAIL**
  (çevrimdışı; ağ/DB/credential/kontör yok). Bölüm A: `find` deseni iki dosyada
  mevcut, yürütülebilir `docs[0]` yok, bulunamadı dalları mevcut. Bölüm B:
  eşleşen bulunur (B-1 — `docs[0]` olsaydı yanlış belge dönerdi), uydurma kimlik
  boş döner (B-2 — S-G4 senaryosu), alan varyantları + boş liste (B-3…B-6).
- `tsc --noEmit -p tsconfig.server.json` **EXIT 0**.
- Muhasebe/stok/KDV/cari/nakit/banka mantığına ve DB şemasına dokunulmadı.

**Yapılmayanlar:** endpoint/body/UUID formatı uydurulmadı. Production'a
dokunulmadı, `ALLOW_PROD=true` yapılmadı, gerçek belge gönderilmedi/iptal
edilmedi. Mock kullanılmadı. Credential/token değerleri bu rapora yazılmadı.

**İlgili:** `docs/48` §10 · `docs/46` §2 (gönderim izi filtresi) · `docs/40` §1.
