# @bey360/fiscal-device-kit 0.1.0

BEY360 için markadan bağımsız cihaz tanımı, bağdaştırıcı kataloğu ve bağlantı sözleşmesi. Bu sürüm **hazırlık kütüphanesidir**; gerçek cihaz sürücüsü, Windows kurulum programı veya tahsilat desteği içermez. Collect/query/cancel her zaman `FISCAL_DEVICE_NOT_READY` ile reddedilir. Inspect donanıma erişmez ve yalnız UNVERIFIED döner.

Katalog: Beko TokenX kablolu ve bulut; Ingenico, Hugin, Verifone, Pavo ve diğer markalar için üretici bekleyen kayıtlar. Katalogda bir marka/model bulunması BEY360 uyumluluk sertifikası değildir. Beko kablolu referans modelleri resmi dokümandaki300TR veX30TR'dir. Diğer bağlantı seçenekleri kurulum talebidir; cihaz yeteneği olarak doğrulanmamıştır.

```ts
import { createFiscalAdapterRegistry } from '@bey360/fiscal-device-kit';
const registry = createFiscalAdapterRegistry();
const adapter = registry.get('beko-tokenx-wire');
// adapter.collect(...) gerçek işlem yapmaz; hazır-değil hatası verir.
```

Paketleme (depo kökünde): `npm run devices:kit:build`, ardından `npm run devices:kit:pack`. Dış bağımlılık yoktur. Gerçek üretici sürücüleri bu pakete kopyalanmaz/yeniden dağıtılmaz.

Sonraki aşama: üretici yazılım anlaşması/SDK, müşteri cihazı ve lisans teyidi, kablolu cihaz için imzalı yerel Windows bağlantı bileşeni, firma-kasa-cihaz eşleme, tekil sipariş/cihaz sorgusu ve yetkili sonuç doğrulaması. Ham kart/PIN/CVV alınmaz. Muhasebe kaydı yalnız doğrulanmış tek ödeme için tasarlanacaktır; bu paket mali kayıt üretmez.

Kaynaklar: [TokenX kablolu](https://developer.tokeninc.com/token-developer-portal-1/x-platform/token-x-connect-wire), [TokenX bulut](https://developer.tokeninc.com/token-developer-portal-1/x-platform/token-x-connect-cloud/tokenx-api-integration-en). 28 Ekim2026 tarihinde incelendi.
