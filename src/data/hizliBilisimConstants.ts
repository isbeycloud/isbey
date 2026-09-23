// Hızlı Bilişim & GİB Resmi Kod Tabloları ve Sabit Listeleri

export interface BirimItem {
  BirimId: number;
  BirimKodu: string;
  Aciklama: string;
}

export interface IstisnaItem {
  IstisnaId: number;
  Kodu: string;
  Adi: string;
}

export interface VergiItem {
  VergiKodu: string;
  VergiKisaAdi: string;
}

export interface TevkifatItem {
  TevkifatId: number;
  Kodu: string;
  Adi: string;
  Orani: number; // 20, 30, 40, 50, 70, 90, 100 (% cinsinden)
}

export interface ParaBirimItem {
  ParaBirimId: number;
  Kodu: string;
  Aciklama: string;
}

export interface TeslimSartiItem {
  Id: number;
  Aciklama: string;
  Detay: string;
}

export interface OdemeTipiItem {
  OdemeKodu: string;
  Aciklama: string;
}

export interface OdemeKanalItem {
  OdemeKanalKodu: string;
  Aciklama: string;
}

export interface IlItem {
  IlId: number;
  IlAdi: string;
}

export interface UlkeItem {
  UlkeId: number;
  UlkeAdi: string;
  UlkeKodu: string;
}

export const HIZLI_BIRIM_LISTESI: BirimItem[] = [
  { BirimId: 35, BirimKodu: 'C62', Aciklama: 'ADET' },
  { BirimId: 142, BirimKodu: 'NIU', Aciklama: 'ADET' },
  { BirimId: 37, BirimKodu: 'PR', Aciklama: 'ADET-ÇİFT' },
  { BirimId: 49, BirimKodu: 'KGM', Aciklama: 'KİLOGRAM' },
  { BirimId: 42, BirimKodu: 'GRM', Aciklama: 'GRAM' },
  { BirimId: 79, BirimKodu: '26', Aciklama: 'TON' },
  { BirimId: 140, BirimKodu: 'TNE', Aciklama: 'TON' },
  { BirimId: 63, BirimKodu: 'LTR', Aciklama: 'LİTRE' },
  { BirimId: 145, BirimKodu: 'MLT', Aciklama: 'MİLİLİTRE' },
  { BirimId: 66, BirimKodu: 'MTR', Aciklama: 'METRE' },
  { BirimId: 149, BirimKodu: 'CMT', Aciklama: 'SANTİMETRE' },
  { BirimId: 134, BirimKodu: 'MMT', Aciklama: 'MM' },
  { BirimId: 64, BirimKodu: 'MTK', Aciklama: 'METRE KARE' },
  { BirimId: 65, BirimKodu: 'MTQ', Aciklama: 'METRE KÜP' },
  { BirimId: 109, BirimKodu: 'PK', Aciklama: 'KOLİ(PK) / PAKET(PA)' },
  { BirimId: 93, BirimKodu: 'PA', Aciklama: 'PAKET' },
  { BirimId: 89, BirimKodu: 'BX', Aciklama: 'KUTU' },
  { BirimId: 95, BirimKodu: 'CT', Aciklama: 'KARTON' },
  { BirimId: 91, BirimKodu: 'SL', Aciklama: 'PALET' },
  { BirimId: 92, BirimKodu: 'SET', Aciklama: 'SET (TAKIM)' },
  { BirimId: 150, BirimKodu: 'DZN', Aciklama: 'DÜZİNE' },
  { BirimId: 99, BirimKodu: 'HUR', Aciklama: 'SAAT' },
  { BirimId: 103, BirimKodu: 'DAY', Aciklama: 'GÜN' },
  { BirimId: 98, BirimKodu: 'MON', Aciklama: 'AY' },
  { BirimId: 101, BirimKodu: 'ANN', Aciklama: 'YIL' },
  { BirimId: 60, BirimKodu: 'KWH', Aciklama: 'KİLOWATT SAAT' },
  { BirimId: 129, BirimKodu: 'MWH', Aciklama: 'MEGAWATT SAAT' },
  { BirimId: 80, BirimKodu: 'SA', Aciklama: 'ÇUVAL' },
  { BirimId: 90, BirimKodu: 'BO', Aciklama: 'ŞİŞE' },
  { BirimId: 143, BirimKodu: 'TN', Aciklama: 'TENEKE' },
  { BirimId: 96, BirimKodu: 'J57', Aciklama: 'VARİL' },
  { BirimId: 77, BirimKodu: 'DRL', Aciklama: 'RULO' },
  { BirimId: 130, BirimKodu: 'TL', Aciklama: 'TL' },
];

export const HIZLI_ISTISNA_LISTESI: IstisnaItem[] = [
  { IstisnaId: 116, Kodu: '301', Adi: '11/1-a Mal İhracatı' },
  { IstisnaId: 117, Kodu: '302', Adi: '11/1-a Hizmet İhracatı' },
  { IstisnaId: 118, Kodu: '303', Adi: '11/1-a Roaming Hizmetleri' },
  { IstisnaId: 119, Kodu: '304', Adi: '13/a Deniz, Hava ve Demiryolu Taşıma Araçlarının Teslimi ve Bakımı' },
  { IstisnaId: 123, Kodu: '308', Adi: '13/d Teşvikli Yatırım Mallarının Teslimi' },
  { IstisnaId: 125, Kodu: '310', Adi: '13/f Ulusal Güvenlik Amaçlı Teslim ve Hizmetler' },
  { IstisnaId: 126, Kodu: '311', Adi: '14/1 Uluslararası Taşımacılık' },
  { IstisnaId: 127, Kodu: '312', Adi: '15/a Diplomatik Misyonlara Yapılan Teslimler' },
  { IstisnaId: 131, Kodu: '316', Adi: '11/1-a Serbest Bölgelerdeki Müşteriler İçin Fason Hizmetler' },
  { IstisnaId: 139, Kodu: '350', Adi: 'KDV Kanunu - Diğerleri' },
  { IstisnaId: 140, Kodu: '351', Adi: 'KDV - İstisna Olmayan Diğer' },
  { IstisnaId: 80, Kodu: '201', Adi: '17/1 Kültür ve Eğitim Amacı Taşıyan İşlemler' },
  { IstisnaId: 81, Kodu: '202', Adi: '17/2-a Sağlık, Çevre ve Sosyal Yardım Amaçlı İşlemler' },
  { IstisnaId: 86, Kodu: '208', Adi: '17/4-c Birleşme, Devir ve Bölünme İşlemleri' },
  { IstisnaId: 87, Kodu: '209', Adi: '17/4-e Banka ve Sigorta Muameleleri Vergisi Kapsamına Giren İşlemler' },
  { IstisnaId: 89, Kodu: '212', Adi: '17/4-ı Serbest Bölgelerde Verilen Hizmetler' },
  { IstisnaId: 99, Kodu: '223', Adi: 'Geçici 20/1 Teknoloji Geliştirme Bölgelerinde Yapılan İşlemler' },
  { IstisnaId: 105, Kodu: '230', Adi: '17/4-g Külçe Altın, Külçe Gümüş ve Kıymetli Taşların Teslimi' },
  { IstisnaId: 106, Kodu: '231', Adi: '17/4-g Metal, Plastik, Lastik, Kağıt, Cam Hurda ve Atıkların Teslimi' },
  { IstisnaId: 107, Kodu: '232', Adi: '17/4-g Döviz, Para, Damga Pulu ve Değerli Kağıtlar' },
  { IstisnaId: 115, Kodu: '250', Adi: 'KDV Kanunu 17. Madde - Diğerleri' },
  { IstisnaId: 71, Kodu: '101', Adi: 'ÖTV - İhracat İstisnası' },
  { IstisnaId: 72, Kodu: '102', Adi: 'ÖTV - Diplomatik İstisna' },
  { IstisnaId: 79, Kodu: '151', Adi: 'ÖTV - İstisna Olmayan Diğer' },
];

export const HIZLI_VERGI_LISTESI: VergiItem[] = [
  { VergiKodu: '0015', VergiKisaAdi: 'KDV' },
  { VergiKodu: '9015', VergiKisaAdi: 'KDV TEVKİFATI' },
  { VergiKodu: '0003', VergiKisaAdi: 'GV STOPAJI' },
  { VergiKodu: '0011', VergiKisaAdi: 'KV STOPAJI' },
  { VergiKodu: '0059', VergiKisaAdi: 'KONAKLAMA VERGİSİ' },
  { VergiKodu: '4080', VergiKisaAdi: 'Ö.İLETİŞİM V (ÖİV)' },
  { VergiKodu: '0071', VergiKisaAdi: 'ÖTV 1.LİSTE' },
  { VergiKodu: '0073', VergiKisaAdi: 'ÖTV 3.LİSTE' },
  { VergiKodu: '0074', VergiKisaAdi: 'ÖTV 4.LİSTE' },
  { VergiKodu: '0077', VergiKisaAdi: 'ÖTV 2.LİSTE' },
  { VergiKodu: '1047', VergiKisaAdi: 'DAMGA VERGİSİ' },
  { VergiKodu: '8004', VergiKisaAdi: 'TRT PAYI' },
  { VergiKodu: '8008', VergiKisaAdi: 'ÇEVRE TEMİZLİK VERGİSİ' },
  { VergiKodu: '9944', VergiKisaAdi: 'BELEDİYE HAL RÜSUMU' },
];

export const HIZLI_TEVKIFAT_LISTESI: TevkifatItem[] = [
  { TevkifatId: 1, Kodu: '601', Adi: 'Yapım İşleri ile Mühendislik-Mimarlık Hizmetleri (4/10)', Orani: 40 },
  { TevkifatId: 2, Kodu: '602', Adi: 'Etüt, Plan-Proje, Danışmanlık ve Denetim (9/10)', Orani: 90 },
  { TevkifatId: 3, Kodu: '603', Adi: 'Makine, Teçhizat, Araç Bakım ve Onarım (7/10)', Orani: 70 },
  { TevkifatId: 8, Kodu: '604', Adi: 'Yemek Servis Hizmeti (5/10)', Orani: 50 },
  { TevkifatId: 9, Kodu: '605', Adi: 'Organizasyon Hizmeti (5/10)', Orani: 50 },
  { TevkifatId: 10, Kodu: '606', Adi: 'İşgücü Temin Hizmetleri (9/10)', Orani: 90 },
  { TevkifatId: 11, Kodu: '607', Adi: 'Özel Güvenlik Hizmeti (9/10)', Orani: 90 },
  { TevkifatId: 12, Kodu: '608', Adi: 'Yapı Denetim Hizmetleri (9/10)', Orani: 90 },
  { TevkifatId: 13, Kodu: '609', Adi: 'Fason Tekstil, Konfeksiyon, Çanta ve Ayakkabı (7/10)', Orani: 70 },
  { TevkifatId: 16, Kodu: '612', Adi: 'Temizlik Hizmeti (9/10)', Orani: 90 },
  { TevkifatId: 17, Kodu: '613', Adi: 'Çevre ve Bahçe Bakım Hizmetleri (9/10)', Orani: 90 },
  { TevkifatId: 18, Kodu: '614', Adi: 'Servis Taşımacılığı Hizmeti (5/10)', Orani: 50 },
  { TevkifatId: 19, Kodu: '615', Adi: 'Her Türlü Baskı ve Basım Hizmetleri (7/10)', Orani: 70 },
  { TevkifatId: 20, Kodu: '616', Adi: 'Diğer Hizmetler (5/10)', Orani: 50 },
  { TevkifatId: 21, Kodu: '617', Adi: 'Hurda Metalden Elde Edilen Külçe Teslimleri (7/10)', Orani: 70 },
  { TevkifatId: 23, Kodu: '619', Adi: 'Bakır, Çinko ve Alüminyum Ürünlerinin Teslimi (7/10)', Orani: 70 },
  { TevkifatId: 25, Kodu: '621', Adi: 'Hurda ve Atıklardan Elde Edilen Hammadde Teslimi (9/10)', Orani: 90 },
  { TevkifatId: 27, Kodu: '623', Adi: 'Ağaç ve Orman Ürünleri Teslimi (5/10)', Orani: 50 },
  { TevkifatId: 28, Kodu: '624', Adi: 'Yük Taşımacılığı Hizmeti (2/10)', Orani: 20 },
  { TevkifatId: 29, Kodu: '625', Adi: 'Ticari Reklam Hizmetleri (3/10)', Orani: 30 },
  { TevkifatId: 30, Kodu: '626', Adi: 'Diğer Teslimler (2/10)', Orani: 20 },
  { TevkifatId: 32, Kodu: '627', Adi: 'Demir-Çelik Ürünlerinin Teslimi (5/10)', Orani: 50 },
  { TevkifatId: 34, Kodu: '801', Adi: 'Yapım İşleri ve Mühendislik (Tam Tevkifat - 10/10)', Orani: 100 },
  { TevkifatId: 35, Kodu: '802', Adi: 'Danışmanlık ve Denetim (Tam Tevkifat - 10/10)', Orani: 100 },
  { TevkifatId: 36, Kodu: '803', Adi: 'Bakım ve Onarım Hizmetleri (Tam Tevkifat - 10/10)', Orani: 100 },
  { TevkifatId: 37, Kodu: '804', Adi: 'Yemek Servis Hizmeti (Tam Tevkifat - 10/10)', Orani: 100 },
  { TevkifatId: 39, Kodu: '806', Adi: 'İşgücü Temin Hizmetleri (Tam Tevkifat - 10/10)', Orani: 100 },
  { TevkifatId: 46, Kodu: '812', Adi: 'Temizlik Hizmeti (Tam Tevkifat - 10/10)', Orani: 100 },
  { TevkifatId: 48, Kodu: '814', Adi: 'Servis Taşımacılığı Hizmeti (Tam Tevkifat - 10/10)', Orani: 100 },
  { TevkifatId: 57, Kodu: '823', Adi: 'Yük Taşımacılığı Hizmeti (Tam Tevkifat - 10/10)', Orani: 100 },
  { TevkifatId: 58, Kodu: '824', Adi: 'Ticari Reklam Hizmetleri (Tam Tevkifat - 10/10)', Orani: 100 },
  { TevkifatId: 59, Kodu: '825', Adi: 'Demir-Çelik Ürünlerinin Teslimi (Tam Tevkifat - 10/10)', Orani: 100 },
];

export const HIZLI_PARA_BIRIMLERI: ParaBirimItem[] = [
  { ParaBirimId: 1, Kodu: 'TRY', Aciklama: 'Türk Lirası (₺)' },
  { ParaBirimId: 2, Kodu: 'USD', Aciklama: 'Amerikan Doları ($)' },
  { ParaBirimId: 3, Kodu: 'EUR', Aciklama: 'Euro (€)' },
  { ParaBirimId: 4, Kodu: 'GBP', Aciklama: 'İngiliz Sterlini (£)' },
  { ParaBirimId: 5, Kodu: 'CHF', Aciklama: 'İsviçre Frangı' },
  { ParaBirimId: 6, Kodu: 'CAD', Aciklama: 'Kanada Doları' },
  { ParaBirimId: 11, Kodu: 'AED', Aciklama: 'BAE Dirhemi' },
  { ParaBirimId: 13, Kodu: 'RUB', Aciklama: 'Rus Rublesi' },
  { ParaBirimId: 18, Kodu: 'SAR', Aciklama: 'Suudi Arabistan Riyali' },
  { ParaBirimId: 30, Kodu: 'CNY', Aciklama: 'Çin Yuanı' },
  { ParaBirimId: 33, Kodu: 'AZN', Aciklama: 'Azerbaycan Manatı' },
  { ParaBirimId: 10, Kodu: 'JPY', Aciklama: 'Japon Yeni' },
];

export const HIZLI_ODEME_TIPLERI: OdemeTipiItem[] = [
  { OdemeKodu: '1', Aciklama: 'Ödeme Tipi Muhtelif' },
  { OdemeKodu: '10', Aciklama: 'Nakit' },
  { OdemeKodu: '20', Aciklama: 'Çek' },
  { OdemeKodu: '23', Aciklama: 'Banka Çeki' },
  { OdemeKodu: '42', Aciklama: 'EFT / Banka Havalesi' },
  { OdemeKodu: '48', Aciklama: 'Kredi Kartı / Banka Kartı' },
  { OdemeKodu: 'ZZZ', Aciklama: 'Diğer' },
];

export const HIZLI_ODEME_KANALLARI: OdemeKanalItem[] = [
  { OdemeKanalKodu: '1', Aciklama: 'Posta' },
  { OdemeKanalKodu: '5', Aciklama: 'SWIFT' },
  { OdemeKanalKodu: '9', Aciklama: 'Bankada Elle' },
  { OdemeKanalKodu: '12', Aciklama: 'Kurye' },
  { OdemeKanalKodu: '14', Aciklama: 'Uluslararası Para Transferi' },
  { OdemeKanalKodu: '15', Aciklama: 'Ulusal Para Transferi (EFT/FAST)' },
  { OdemeKanalKodu: 'ZZZ', Aciklama: 'Karşılıklı Belirlenen Yol' },
];

export const HIZLI_TESLIM_SARTLARI: TeslimSartiItem[] = [
  { Id: 1, Aciklama: 'CFR', Detay: 'Masraflar ve Navlun / Cost and Freight' },
  { Id: 2, Aciklama: 'CIF', Detay: 'Masraflar, Sigorta ve Navlun / Cost, Insurance and Freight' },
  { Id: 3, Aciklama: 'CIP', Detay: 'Taşıma ve Sigorta Ödenmiş / Carriage and Insured Paid To' },
  { Id: 4, Aciklama: 'CPT', Detay: 'Taşıma Ödenmiş Olarak / Carriage Paid To' },
  { Id: 6, Aciklama: 'DDP', Detay: 'Gümrük Vergileri Ödenmiş / Delivered Duty Paid' },
  { Id: 10, Aciklama: 'EXW', Detay: 'İşyerinde Teslim / Ex Works' },
  { Id: 12, Aciklama: 'FCA', Detay: 'Taşıyıcıya Masrafsız / Free Carrier' },
  { Id: 13, Aciklama: 'FOB', Detay: 'Gemide Masrafsız / Free On Board' },
  { Id: 14, Aciklama: 'DAP', Detay: 'Belirlenen Yerde Teslim / Delivered At Place' },
  { Id: 16, Aciklama: 'DPU', Detay: 'Belirlenmiş Yerde Boşaltılmış / Delivered at Place Unloaded' },
];

export const HIZLI_TANITICI_KODLAR: string[] = [
  'TICARETSICILNO',
  'MERSISNO',
  'ABONENO',
  'MUSTERINO',
  'BAYINO',
  'HIZMETNO',
  'TESISATNO',
  'DISTRIBUTORNO',
  'TAPDKNO',
  'SAYACNO',
  'URETICINO',
  'CIFTCINO',
  'IMALATCINO',
  'DOSYANO',
  'HASTANO',
  'SUBENO',
  'PLAKA',
  'ARACKIMLIKNO',
  'PASAPORTNO',
  'SEVKIYATNO',
];

export const TURKIYE_ILLERI: IlItem[] = [
  { IlId: 1, IlAdi: 'ADANA' },
  { IlId: 2, IlAdi: 'ADIYAMAN' },
  { IlId: 3, IlAdi: 'AFYONKARAHİSAR' },
  { IlId: 4, IlAdi: 'AĞRI' },
  { IlId: 5, IlAdi: 'AMASYA' },
  { IlId: 6, IlAdi: 'ANKARA' },
  { IlId: 7, IlAdi: 'ANTALYA' },
  { IlId: 8, IlAdi: 'ARTVİN' },
  { IlId: 9, IlAdi: 'AYDIN' },
  { IlId: 10, IlAdi: 'BALIKESİR' },
  { IlId: 11, IlAdi: 'BİLECİK' },
  { IlId: 12, IlAdi: 'BİNGÖL' },
  { IlId: 13, IlAdi: 'BİTLİS' },
  { IlId: 14, IlAdi: 'BOLU' },
  { IlId: 15, IlAdi: 'BURDUR' },
  { IlId: 16, IlAdi: 'BURSA' },
  { IlId: 17, IlAdi: 'ÇANAKKALE' },
  { IlId: 18, IlAdi: 'ÇANKIRI' },
  { IlId: 19, IlAdi: 'ÇORUM' },
  { IlId: 20, IlAdi: 'DENİZLİ' },
  { IlId: 21, IlAdi: 'DİYARBAKIR' },
  { IlId: 22, IlAdi: 'EDİRNE' },
  { IlId: 23, IlAdi: 'ELAZIĞ' },
  { IlId: 24, IlAdi: 'ERZİNCAN' },
  { IlId: 25, IlAdi: 'ERZURUM' },
  { IlId: 26, IlAdi: 'ESKİŞEHİR' },
  { IlId: 27, IlAdi: 'GAZİANTEP' },
  { IlId: 28, IlAdi: 'GİRESUN' },
  { IlId: 29, IlAdi: 'GÜMÜŞHANE' },
  { IlId: 30, IlAdi: 'HAKKARİ' },
  { IlId: 31, IlAdi: 'HATAY' },
  { IlId: 32, IlAdi: 'ISPARTA' },
  { IlId: 33, IlAdi: 'MERSİN' },
  { IlId: 34, IlAdi: 'İSTANBUL' },
  { IlId: 35, IlAdi: 'İZMİR' },
  { IlId: 36, IlAdi: 'KARS' },
  { IlId: 37, IlAdi: 'KASTAMONU' },
  { IlId: 38, IlAdi: 'KAYSERİ' },
  { IlId: 39, IlAdi: 'KIRKLARELİ' },
  { IlId: 40, IlAdi: 'KIRŞEHİR' },
  { IlId: 41, IlAdi: 'KOCAELİ' },
  { IlId: 42, IlAdi: 'KONYA' },
  { IlId: 43, IlAdi: 'KÜTAHYA' },
  { IlId: 44, IlAdi: 'MALATYA' },
  { IlId: 45, IlAdi: 'MANİSA' },
  { IlId: 46, IlAdi: 'KAHRAMANMARAŞ' },
  { IlId: 47, IlAdi: 'MARDİN' },
  { IlId: 48, IlAdi: 'MUĞLA' },
  { IlId: 49, IlAdi: 'MUŞ' },
  { IlId: 50, IlAdi: 'NEVŞEHİR' },
  { IlId: 51, IlAdi: 'NİĞDE' },
  { IlId: 52, IlAdi: 'ORDU' },
  { IlId: 53, IlAdi: 'RİZE' },
  { IlId: 54, IlAdi: 'SAKARYA' },
  { IlId: 55, IlAdi: 'SAMSUN' },
  { IlId: 56, IlAdi: 'SİİRT' },
  { IlId: 57, IlAdi: 'SİNOP' },
  { IlId: 58, IlAdi: 'SİVAS' },
  { IlId: 59, IlAdi: 'TEKİRDAĞ' },
  { IlId: 60, IlAdi: 'TOKAT' },
  { IlId: 61, IlAdi: 'TRABZON' },
  { IlId: 62, IlAdi: 'TUNCELİ' },
  { IlId: 63, IlAdi: 'ŞANLIURFA' },
  { IlId: 64, IlAdi: 'UŞAK' },
  { IlId: 65, IlAdi: 'VAN' },
  { IlId: 66, IlAdi: 'YOZGAT' },
  { IlId: 67, IlAdi: 'ZONGULDAK' },
  { IlId: 68, IlAdi: 'AKSARAY' },
  { IlId: 69, IlAdi: 'BAYBURT' },
  { IlId: 70, IlAdi: 'KARAMAN' },
  { IlId: 71, IlAdi: 'KIRIKKALE' },
  { IlId: 72, IlAdi: 'BATMAN' },
  { IlId: 73, IlAdi: 'ŞIRNAK' },
  { IlId: 74, IlAdi: 'BARTIN' },
  { IlId: 75, IlAdi: 'ARDAHAN' },
  { IlId: 76, IlAdi: 'IĞDIR' },
  { IlId: 77, IlAdi: 'YALOVA' },
  { IlId: 78, IlAdi: 'KARABÜK' },
  { IlId: 79, IlAdi: 'KİLİS' },
  { IlId: 80, IlAdi: 'OSMANİYE' },
  { IlId: 81, IlAdi: 'DÜZCE' },
];
