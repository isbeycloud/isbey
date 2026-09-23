# İŞBEY — `phase19DocumentLifecycleTest.ts` Koruma Notu

**Tarih:** 2026-09-15 · **Kapsam:** FAZ 19 belge yaşam döngüsü süitinin değişmez tasarım sözleşmesi

> Bu dosya, süitin **neden** bu şekilde yazıldığını kayda geçirir. Amaç, ileride
> "süit PASS vermiyor, düzeltelim" diyen bir değişikliğin süitin dürüstlük
> tasarımını bozmasını engellemektir.

---

## 1. Süitin değişmez kuralları (DEĞİŞTİRİLEMEZ)

| # | Kural | Neden |
|---|-------|-------|
| K-1 | Gerçek sandbox'a erişilmeden hiçbir dış kalem **PASS** yazılamaz | Kanıtsız iddia, doğrulanmış gibi görünür |
| K-2 | Mock server sonucu **asla** PASS sayılmaz | Mock yalnız "sandbox'a erişilemediğini" göstermek için ayrı bir teknik testtir |
| K-3 | Proxy/allowlist 403'ü **API FAIL değildir** | Ortam engeli ≠ ürün hatası; ayrım yapılmazsa yanlış kök neden |
| K-4 | `KOŞULAMADI` mantığı **kaldırılamaz** | Süitin PASS üretmemesi bir kusur değil, tasarım gereğidir |
| K-5 | Gönderim ve iptal adımları **SKIP** kalır | Kontör tüketir; satıcı sözleşmesi test ortamının kontör davranışını belgelemiyor |
| K-6 | Credential/token değerleri **yazdırılmaz** | Yalnız "dolu, N karakter" biçiminde raporlanır |

## 2. Egress ön ölçümü — süitin kalbi

Süit, dış iddialardan **ÖNCE** erişimi ölçer (kimlik göndermeyen `/RestApi/Test` ucuna).
Sonuç `egressEngelli` bayrağına yazılır ve tüm dış kalemlerin sınıflandırmasını belirler:

```
yanıtSiniflandir() üç durum döndürür:
  'ok'            → gerçek hedef yanıtı      → PASS
  'kanitlanamadi' → egress/DNS/timeout       → SKIP
  'hata'          → gerçek başarısızlık      → FAIL
```

`egressEngelli === true` iken hiçbir yanıt `'hata'` sınıfına düşmez. Bu, süitin
"ortam engelini ürün hatası sanma" kusuruna karşı tek savunmasıdır.

**Ölçülen kanıt (2026-09-15, bu VM):**
```
$ curl -i https://econnecttest.hizliteknoloji.com.tr/HizliApi/RestApi/Test
HTTP/1.1 403 Forbidden
X-Proxy-Error: blocked-by-allowlist
```
Aynı yanıt `example.com` için de döner — yani engel hedefe özgü değil, ortamsaldır.

## 3. SKIP neden PASS değildir (karar zinciri)

`tools/dogrulama.ps1` `HIZLI` karar dalı:

```
FAIL > 0        → FAIL
PASS = 0        → BLOCKED
WARN > 0        → WARN
SKIP > 0        → BLOCKED      ← bu dal süiti korur
aksi hâlde      → PASS
```

SKIP'i PASS saymayan bu dal sayesinde süit, egress engelli bir makinede
koşulduğunda **asla** yanlış PASS üretmez. Ölçülen sonuç: `BLOCKED (KOŞULAMADI)`.

## 4. Süitin ölçtüğü kanıtlanmış kalemler (egress'ten bağımsız)

`PASS=28` kaleminin tamamı ağ gerektirmeyen veya engelden bağımsız sınıflandırılan
kalemlerdir: güvenlik ön koşulları, yerel XML üretimi + şema doğrulaması, statik
sözleşme denetimi, ölçülmüş izolasyon sayaçları.

## 5. Gönderim/iptal neden hâlâ kanıtlanmadı

Satıcı sözleşmesi (`docs/21` §8) test ortamının **yalnızca base URL ile**
ayrıldığını söyler — test ortamında kontörün tüketilip tüketilmediğini
**belgelemez**. Belgelenmemiş varsayımla gönderim yapmak, "kontör yakılmayacak"
iddiasını kanıtsız bırakırdı.

Bu sınırı aşmak için **ayrı** bir koşu betiği yazıldı:
`server/tests/phase19DocumentSendFlowRun.ts` + `tools/faz19-belge-akisi.ps1`.
O betik kontör riskini açık onayla kabul eder, gönderim öncesi/sonrası bakiyeyi
**ölçer** ve farkı raporlar. **Bu süit o betiğe bağlanmaz** — paket koşusunda
gönderim yapılmaz.

## 6. Süite dokunmadan önce okunacaklar

- `docs/31_FAZ18_FAZ19_TEST_BORCLARI.md` §3 — hangi test neye dayanıyor
- `docs/30_FAZ19_IPTAL_ENTEGRASYON_KANITI.md` — iptal entegrasyon bulgusu
- `docs/23_DOGRULAMA_PAKETI_KULLANIM_KILAVUZU.md` — paket kullanımı

---

## 7. Değişiklik kapısı

Süitte yapılabilecek değişiklikler: hata mesajı netleştirme, yeni **okuma**
uçları ekleme, statik denetim kapsamını genişletme.

Yapılamayacaklar: SKIP'i PASS'a çevirme, egress ön ölçümünü kaldırma,
`KOŞULAMADI` dalını silme, gönderim/iptal adımlarını onaysız çalıştırma.
