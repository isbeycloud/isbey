# Faturada ürün seçimi

30 Ekim 2026: Satış/alış faturasındaki Ürünler Penceresi için hata düzeltmeleri.

- Ürün grupları isteğinin başarısız olması, başarıyla alınan ürün listesini artık boş bırakmaz. Grup hatası açıkça bildirilir; arama ve seçim kullanılabilir.
- Ürün listesi alınamazsa boş stok izlenimi verilmez; gerçek hata ve Tekrar Dene gösterilir.
- Varyant eklendiğinde varyant ve ürün seçim pencereleri kapanır. Çift tıklama doğrudan tıklanan varyant kimliğini kullanır; önceki seçimin zamanlayıcı üzerinden okunması kaldırıldı.
- Eksik fiyatlı ürün listeyi çökertmez; fiyat tanımlı olmadığı belirtilir. Fiyat hesaplama kuralları değiştirilmedi.
- Paket/rol kısıtları değiştirilmedi; bu değişiklik stok erişimi vermiyor.

Doğrulama: Derleme başarılı. `22-invoice-product-selection.spec.ts` satış/alışta tıklama ve aktarma, grup hatası, liste hatasında tekrar deneme, varyant onayı/çift tıklama ve eksik fiyat olmak üzere 7 senaryoyu sınar. Paket menüsüyle ilgili 6 senaryo da yeniden geçti (toplam 13). Gerçek fatura kaydı veya gönderimi yapılmadı.
