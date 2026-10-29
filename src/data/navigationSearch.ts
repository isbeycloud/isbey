import type { AppView, RibbonTab } from '../context/AppContext';

export type NavigationCommand = { id: string; title: string; description: string; view: AppView; tab: RibbonTab; keywords: string;
  action?: 'customer' | 'product' | 'salesInvoice' | 'purchaseInvoice' | 'collection' | 'payment'; permissionModule?: string };

export const navigationCommands: NavigationCommand[] = [
  { id: 'debt-tracking', title: 'Alacak / Borç Takibi', description: 'Cari net bakiyeler, takip tarihleri, ödeme sözleri ve uyarılar', view: 'borc-takibi', tab: 'CARI', keywords: 'alacak borc vade takip hatirlatma uyari geciken odeme sozu tahsilat' },
  { id: 'new-sales', title: 'Yeni Satış Faturası', description: 'Müşteriye satış faturası hazırlayın', view: 'satis', tab: 'SATIS', keywords: 'fatura kes satıs yeni belge', action: 'salesInvoice', permissionModule: 'SALES' },
  { id: 'new-customer', title: 'Yeni Cari', description: 'Müşteri veya tedarikçi kartı açın', view: 'cari', tab: 'CARI', keywords: 'musteri ekle tedarikci kart cari hesap', action: 'customer', permissionModule: 'CUSTOMERS' },
  { id: 'new-product', title: 'Yeni Ürün', description: 'Stok kartı ve barkod tanımlayın', view: 'stok', tab: 'STOK', keywords: 'stok malzeme ekle barkod', action: 'product', permissionModule: 'STOCK' },
  { id: 'collection', title: 'Tahsilat Ekle', description: 'Müşteriden alınan ödemeyi kaydedin', view: 'kasa', tab: 'KASA_BANKA', keywords: 'tahsilat alacak para al nakit', action: 'collection', permissionModule: 'COLLECTIONS' },
  { id: 'payment', title: 'Ödeme Ekle', description: 'Yapılan ödemeyi kaydedin', view: 'kasa', tab: 'KASA_BANKA', keywords: 'odeme borc para ver gider', action: 'payment', permissionModule: 'COLLECTIONS' },
  { id: 'new-purchase', title: 'Yeni Alış Faturası', description: 'Tedarikçi alış faturasını hazırlayın', view: 'alis', tab: 'ALIS', keywords: 'alis fatura tedarikci giris', action: 'purchaseInvoice', permissionModule: 'PURCHASES' },
  { id: 'home', title: 'Ana Sayfa', description: 'Günlük özet ve bekleyen işler', view: 'dashboard', tab: 'ANASAYFA', keywords: 'dashboard ozet yonetim baslangic' },
  { id: 'customers', title: 'Cari Hesaplar', description: 'Müşteri, tedarikçi, bakiye ve ekstre', view: 'cari', tab: 'CARI', keywords: 'musteri tedarikci hesap borc alacak ekstre' },
  { id: 'stock', title: 'Stok ve Ürünler', description: 'Ürünler, barkod ve depo durumu', view: 'stok', tab: 'STOK', keywords: 'stok urun depo malzeme envanter' },
  { id: 'sales', title: 'Satış Faturaları', description: 'Satış faturalarını inceleyin', view: 'satis', tab: 'SATIS', keywords: 'satis fatura belgeler' },
  { id: 'purchases', title: 'Alış Faturaları', description: 'Alış faturalarını inceleyin', view: 'alis', tab: 'ALIS', keywords: 'alis fatura tedarikci' },
  { id: 'pos', title: 'Hızlı Satış (POS)', description: 'Barkodlu satış ve yazar kasa bağlantı ayarları', view: 'pos', tab: 'SATIS', keywords: 'pos perakende beko yazar kasa cihaz baglanti' },
  { id: 'incoming', title: 'Gelen e-Belgeler', description: 'Gelen faturaları ve irsaliyeleri inceleyin', view: 'gelen-belgeler', tab: 'ALIS', keywords: 'gelen belge efatura earsiv e-fatura e-arsiv' },
  { id: 'quotes', title: 'Teklif ve Sipariş', description: 'Teklifleri ve siparişleri takip edin', view: 'teklif', tab: 'TEKLIF', keywords: 'teklif siparis satis fiyat' },
  { id: 'waybills', title: 'İrsaliyeler', description: 'Sevk ve alış irsaliyeleri', view: 'irsaliye', tab: 'IRSALIYE', keywords: 'irsaliye sevkiyat e-irsaliye' },
  { id: 'expenses', title: 'Giderler', description: 'Masrafları ve şirket harcamalarını takip edin', view: 'gider', tab: 'GIDER', keywords: 'gider masraf harcama' },
  { id: 'cash', title: 'Kasa ve Nakit', description: 'Kasa hareketleri ve bakiyeler', view: 'kasa', tab: 'KASA_BANKA', keywords: 'kasa nakit tahsilat odeme' },
  { id: 'banks', title: 'Banka ve Kredi Kartları', description: 'Banka hesapları, şirket kredi kartları ve harcama takibi', view: 'banka', tab: 'KASA_BANKA', keywords: 'banka hesap hareket havale eft kredi kart karttan harcama ekstre' },
  { id: 'reports', title: 'Raporlar', description: 'Mevcut raporları açın', view: 'raporlar', tab: 'RAPORLAR', keywords: 'rapor ozet analiz' },
  { id: 'companies', title: 'Müşteri & Firmalar', description: 'Firma bilgileri, kullanıcılar ve paket yönetimi', view: 'companies', tab: 'AYARLAR', keywords: 'musteri firma sirket paket ucret ucretsiz kullanici' },
  { id: 'portfolio', title: 'Müşteri Havuzu', description: 'Müşteri aktarımı ve hizmet başvuruları', view: 'hizlibilisim', tab: 'AYARLAR', keywords: 'musteri portfoy hizli bilisim aktarim basvuru' },
  { id: 'platform', title: 'Platform Ayarları', description: 'Paket tarifeleri ve sanal POS hazırlığı', view: 'platform-admin', tab: 'AYARLAR', keywords: 'platform garanti sanal pos paket tarife' },
  { id: 'subscription', title: 'Abonelik ve Paketler', description: 'Abonelik durumu ve paket önizlemesi', view: 'customer-billing', tab: 'AYARLAR', keywords: 'abonelik paket faturalama satin alma kontor' },
  { id: 'settings', title: 'Ayarlar', description: 'Firma ayarları ve belge tasarımları', view: 'ayarlar', tab: 'AYARLAR', keywords: 'ayar belge tasarim sablon numarator' },
  { id: 'documents', title: 'Dijital Arşiv', description: 'Belge yükleme ve arşiv', view: 'documents', tab: 'AYARLAR', keywords: 'belge yukle arsiv dosya' },
  { id: 'ai', title: 'AI Asistan', description: 'Muhasebe asistanını açın', view: 'ai-merkezi', tab: 'AI_ASISTAN', keywords: 'yapay zeka asistan muhasebe' },
  { id: 'approvals', title: 'Onay Bekleyen İşlemler', description: 'İşlem onaylarını inceleyin', view: 'approvals', tab: 'AYARLAR', keywords: 'onay finansal islem bekleyen' },
  { id: 'tasks', title: 'Görev Yönetimi', description: 'Görevleri ve ortak çalışmaları açın', view: 'tasks', tab: 'AYARLAR', keywords: 'gorev calisma workspace' },
  { id: 'forecast', title: 'Nakit Akış Tahmini', description: 'Nakit tahmin ekranını açın', view: 'nakit-tahmin', tab: 'AI_ASISTAN', keywords: 'nakit akis tahmin finans' },
  { id: 'portal', title: 'Firma Sahibi Portalı', description: 'Firma sahibi görünümünü açın', view: 'client-portal', tab: 'AYARLAR', keywords: 'firma sahibi musteri portal' },
  { id: 'support', title: 'Yardım ve Destek', description: 'Destek talepleri ve yardım', view: 'support-center', tab: 'AYARLAR', keywords: 'yardim destek nasil kullanirim' },
];

export const normalizeNavigationSearch = (value: string) => value.toLocaleLowerCase('tr-TR').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ı/g, 'i').trim();
export function findNavigationCommands(query: string, canAccess: (view: string) => boolean, canCreate: (module: string) => boolean) {
  const words = normalizeNavigationSearch(query).split(/\s+/).filter(Boolean);
  return navigationCommands.filter(item => canAccess(item.view) && (!item.action || canCreate(item.permissionModule!)))
    .filter(item => { const text = normalizeNavigationSearch(`${item.title} ${item.description} ${item.keywords}`); return words.every(word => text.includes(word)); });
}
