# Hızlı Bilişim / Bey360 Satıcı Sorusu — Sorgu Uçları Kontör Davranışı (docs/48)

**Tarih:** 17.09.2026
**Durum:** 🗃️ **KAPANDI (17.09)** — kullanıcı kararıyla gereksiz kaldı ("evet kapat").
Koşum izni verildi ve 13:03 koşusu yapıldı; kontör hükmü öncesi/sonrası bakiye
karşılaştırmasıyla kapatılacak (`docs/48` §10.3). Satıcıya gönderilmedi.
**Bağlam:** İŞBEY CLOUD ERP, test ortamı (`econnecttest` hostu) üzerinden entegrasyon doğrulaması yapıyor. Canlıya geçilmedi.

## Sorular

1. `GetDocumentListGUID` ucu (UUID listesiyle belge durum sorgusu), **test/sandbox ortamında kontör tüketiyor mu?**
2. `CancelDocument` ucu, **test/sandbox ortamında kontör tüketiyor mu?**
3. `GetDocumentReceiverAllList` ucu (tarih aralıklı gelen belge sorgusu), **test/sandbox ortamında kontör tüketiyor mu?**
4. Varsa: sorgu uçları için kontör tüketimini belgeleyen bir doküman sayfası var mı? (Varsa bağlantısını paylaşmanızı rica ederiz.)

## Neden soruyoruz

Ölçüm planımız, **var olmayan (uydurma) bir belge kimliğiyle** yalnızca doğrulama yanıtını okumaktır — belge gönderilmez, iptal edilmez. Ancak yukarıdaki uçların sandbox'ta kontör tüketip tüketmediği sözleşmede belgelenmediği için, yazılı cevabınız gelene kadar koşumu **durdurduk**.

## Beklenen cevap biçimi

Her uç için: "tüketir / tüketmez", varsa koşulu (örn. yalnızca bulunan belgede, yalnızca canlıda).
