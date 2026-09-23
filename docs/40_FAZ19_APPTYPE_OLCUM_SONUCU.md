# FAZ 19 — `AppType` Ölçüm Sonucu: Çelişki ÇÖZÜLDÜ

**Tarih:** 16.09.2026 · **Koşum:** 12:55:17 (Windows, egress erişimli makine)
**Kanıt:** `.verify-tmp/faz19-cancel-sozlesme-2026-09-16T09-55-17-909Z.json`
**Ham kayıt:** `.verify-tmp/faz19-cancel-sozlesme-20260916-125516.txt`
**Yöntem:** kontör yakmayan sözleşme ölçümü · uydurma UUID · belge gönderilmedi · canlıya çıkılmadı

---

## 1. Sonuç: `docs/38` §2'deki çelişki çözüldü

Repoda iki zıt `AppType` sözlüğü vardı. Ölçüm, **hangisinin gerçek olduğunu kesin olarak gösterdi.**

| `AppType` | Gönderilen değer | API yanıtı | Hüküm |
|---|---|---|---|
| C0 (kontrol) | **gönderilmedi** | "AppType alanı iptal işlemlerinde 3(e-Arşiv Fatura), 6(e-Smm Makbuz) veya 7(e-Müsatahsil Makbuz) olabilir!" | kontrol imzası |
| C1 | 1 | *(kontrol ile aynı mesaj)* | ⛔ **TANINMIYOR** |
| C2 | 2 | *(kontrol ile aynı mesaj)* | ⛔ **TANINMIYOR** |
| **C3** | **3** | **"İlgili fatura bulunamadı!"** | ✅ **TANINIYOR — e-Arşiv Fatura** |
| C4 | 4 | *(kontrol ile aynı mesaj)* | ⛔ **TANINMIYOR** |
| C5 | 5 | *(kontrol ile aynı mesaj)* | ⛔ **TANINMIYOR** |
| **C6** | **6** | **"İlgili SMM bulunamadı!"** | ✅ **TANINIYOR — e-SMM Makbuz** |
| **C7** | **7** | **"İlgili müstahsil bulunamadı!"** | ✅ **TANINIYOR — Müstahsil Makbuz** |

**Kritik nokta:** API, geçerli tür listesini **kendi mesajında açıkça yazdı** —
*"3(e-Arşiv Fatura), 6(e-Smm Makbuz) veya 7(e-Müsatahsil Makbuz)"*. Bu, hata
mesajı farkından yapılan bir çıkarım değil, **sözleşmenin doğrudan ifadesidir.**

### Hangi sözlük doğru?

| Kaynak | İddia | Hüküm |
|---|---|---|
| `hizliConnectService.ts:486` (`cancelDocument` yorumu) | `3=e-Arşiv, 6=e-SMM, 7=e-Müstahsil` | ✅ **DOĞRU** |
| `hizliConnectService.ts:631` (`getDocumentList` yorumu) | `1=e-Fatura, 2=e-Arşiv, 3=e-İrsaliye, 4=e-SMM, 5=e-Müstahsil` | ⛔ **YANLIŞ** (bu uç için) |
| Kullanıcının verdiği sözleşme | `3=e-Arşiv Fatura, 6=e-Serbest Makbuz, 7=Müstahsil Makbuz` | ✅ **BİREBİR DOĞRULANDI** |

**Verilen sözleşme ve koddaki `cancelDocument` yorumu doğru çıktı.** İkinci sözlük
(`getDocumentList` yorumu) ya farklı bir uca ait ya da hatalı — `CancelDocument`
için geçerli değil.

### Ek bulgu: `AppType` zorunlu bir alan

`C0` deneyi — `AppType` hiç gönderilmediğinde — API **"zorunlu alan eksik"**
demiyor; **geçerli değerleri listeleyen bir doğrulama hatası** veriyor. Yani
`AppType` isteğe bağlı değil, zorunlu ve **doğrulanan** bir alan.

---

## 2. Kodun durumu: `AppType: 3` sabiti e-Arşiv için DOĞRU

`docs/38` §2'de "davranışsal kusur" olarak işaretlediğim sabit, ölçüm sonrası
**yeniden değerlendirilmelidir**:

| Çağrı yolu | Gönderilen | Doğru mu? |
|---|---|---|
| `documentConversionService.ts:344` → giden **e-Arşiv** iptali | `AppType: 3` | ✅ **DOĞRU** |
| `incomingInvoiceService.ts:227` → gelen belge **RED** | `AppType: 3` | ✅ Gelen belgeler e-Arşiv ise doğru |

`AppType: 3` sabiti, **e-Arşiv akışının kendisi için doğrudur.** `docs/38` §2'de
"sabit kodlanmış, belge türünden türetilmiyor" tespiti geçerliliğini koruyor —
ama **e-Arşiv dışındaki akışlar için** sorun teşkil ediyor (§3).

---

## 3. ⛔ ASIL BULGU: e-Fatura iptali bu uçta YOK

Ölçüm, `docs/38`'de sormadığım bir soruyu yanıtladı:

| Belge türü | `CancelDocument` ile iptal | `AppType` |
|---|---|---|
| e-Arşiv Fatura | ✅ **VAR** | 3 |
| e-Müstahsil Makbuz | ✅ **VAR** | 7 |
| e-SMM Makbuz | ✅ **VAR** | 6 |
| **e-Fatura** | ⛔ **YOK** | — (1 ve 2 tanınmıyor) |
| **e-İrsaliye** | ⛔ **YOK** | — (3 tanınıyor ama e-Arşiv olarak) |

**Sonuç:** `CancelDocument` ucu **e-Fatura iptalini desteklemiyor.** Geçerli tür
listesi `3, 6, 7` — e-Fatura (1) bu listede yok.

Bu, `docs/38` §2'deki "giden e-Fatura iptalinde `AppType: 3` gidiyor, yanlış tür"
endişesini **daha ciddi bir hâle getiriyor**: sorun yanlış `AppType` göndermek
değil, **e-Fatura iptali için bu ucun hiç uygun olmaması.**

### Kodda e-Fatura iptali ne yapıyor?

`documentConversionService.ts:332-347` giden iptalinde `provider.cancelInvoice()`
çağırıyor, o da `cancelDocument`'a `AppType: 3` gönderiyor. Bir **e-Fatura**
belgesi iptal edilmek istendiğinde:

1. Talep `AppType: 3` ile gider → API onu **e-Arşiv** olarak yorumlar
2. e-Arşiv kayıtlarında o UUID bulunamaz → **"İlgili fatura bulunamadı!"**
3. `IsSucceeded: false` → kod `throw` eder, yerel iptal **yapılmaz** (fail-closed)

**Güvenlik açısından doğru davranış:** yanlış belgeyi iptal etmiyor, sessizce
başarılı saymıyor. **İşlevsel olarak eksik:** e-Fatura iptali hiç yapılamıyor.

### e-Fatura iptali için başka uç var mı?

| Uç | Durum |
|---|---|
| `CancelEArsivInvoice` | Yalnız e-Arşiv |
| `RescindCancel` (`:592`) | İptali **geri alma** — iptal değil. **Çağıran yok (ölü kod)** |
| `SendApplicationResponse` | Red/kabul yanıtı — iptal değil |
| **e-Fatura iptal ucu** | ⛔ **REPODA YOK** |

**e-Fatura iptali için uç hâlâ bilinmiyor.** Bu, `docs/37`'deki 10. maddenin
("Belge türü farkları") vendor'dan teyit edilmesi gereken kısmıdır — ve artık
**çok daha güçlü bir gerekçeyle.**

---

## 4. Ölçümün sınırı (dürüstlük notu)

Bu ölçüm **uydurma bir belge kimliğiyle** yapılmıştır. Kanıtladığı:

- ✅ `AppType` hangi değerlerde **doğrulamadan geçiyor** (3, 6, 7)
- ✅ Hangi değerlerde **reddediliyor** (1, 2, 4, 5 ve boş)
- ✅ API'nin geçerli tür listesini kendi mesajında beyan ettiği

Kanıtlamadığı:

- ⛔ Gerçek bir **e-Arşiv** belgesinin iptalinde yanıt şemasının aynı kaldığı
- ⛔ Gerçek bir iptalin `IsSucceeded: true` döndüğü
- ⛔ e-Fatura iptali için **başka bir ucun** var olmadığı (yalnız bu uçta olmadığı kanıtlı)
- ⛔ e-İrsaliye iptalinin hangi uçla yapıldığı

Bunlar için gerçek belge akışı gerekir: `tools/faz19-belge-akisi.ps1` (kontör riski).

---

## 5. Revize edilmiş durum tablosu

| Kalem | `docs/38` | **Şimdi** |
|---|---|---|
| `AppType` **değeri = 3 (e-Arşiv)** | ⛔ ÇELİŞKİLİ | ✅ **KANITLANDI** — API mesajı doğrudan beyan etti |
| `AppType` 6 = e-SMM, 7 = Müstahsil | — | ✅ **KANITLANDI** |
| `getDocumentList` sözlüğü (`1=e-Fatura, 2=e-Arşiv, 3=e-İrsaliye`) | — | ⛔ **YANLIŞ** (bu uç için) |
| `AppType` zorunlu alan | — | ✅ **KANITLANDI** |
| **e-Fatura iptali `CancelDocument` ile** | ⛔ TEYİT GEREKİYOR | ⛔ **BU UÇTA DESTEKLENMİYOR** |
| Kodun `AppType:3` sabiti (e-Arşiv akışı) | ⛔ kusur | ✅ **e-Arşiv için DOĞRU** |
| Kodun `AppType:3` sabiti (e-Fatura akışı) | — | ⛔ **e-Fatura iptalini imkânsız kılıyor** |
| e-İrsaliye iptali | ⛔ TEYİT GEREKİYOR | ⛔ **HÂLÂ TEYİT GEREKİYOR** |
| `SendApplicationResponse` gövdesi | ⛔ UYUŞMUYOR | ⛔ **HÂLÂ UYUŞMUYOR** |
| Giden belge kimliğinin değer kaynağı | ⛔ KANITLANMADI | ⛔ **HÂLÂ KANITLANMADI** |
| Gerçek sandbox belge yaşam döngüsü | ⛔ KOŞULAMADI | ⛔ **HÂLÂ KOŞULAMADI** |
| Production | ✅ KAPALI | ✅ **KAPALI** |

---

## 6. Sıradaki karar noktası

Ölçüm **kod değişikliği gerektiren iki kalem** ortaya çıkardı; ikisi de **ayrı izin
turuna tabidir:**

**a) e-Fatura iptali için doğru ucun temini.** `CancelDocument` e-Fatura
desteklemiyor. Kod şu an e-Fatura iptalinde sessizce başarısız oluyor
(fail-closed olduğu için güvenli, ama işlevsiz). Bu bilgi `docs/37`'deki vendor
talebinin **10. maddesini** doğrudan besliyor ve talep güncellenmeli.

**b) `AppType`'ın belge türünden türetilmesi.** Sabit `3` bırakılırsa e-Fatura
iptali asla çalışmaz. Ama hangi değerin hangi türe gideceği e-Arşiv dışında
**hâlâ bilinmiyor** — bu yüzden **şimdi kod yazmak yanlış olur.**

**Önerilen sıra:** (a) vendor talebi e-Fatura iptal ucu sorusuyla güncellensin →
cevap gelince (b) değerlendirilsin. Bu turda **hiçbir kod değişikliği yapılmadı.**

---

## 7. Yapılmayanlar

Uygulama kodu değiştirilmedi. `AppType: 3` sabiti değiştirilmedi. e-Fatura iptali
için uç uydurulmadı. `getDocumentList` yorumu düzeltilmedi (bu uç için yanlış olsa
da `getDocumentList` çağrısının kendi bağlamında doğru olabilir — ölçülmedi).
`SendApplicationResponse` gövdesi sözleşmeye uydurulmadı. Production'a
dokunulmadı, `ALLOW_PROD=true` yapılmadı, gerçek belge gönderilmedi/iptal
edilmedi, kontör tüketilmedi. Mock kullanılmadı. Credential/token değerleri
bu rapora yazılmadı.
