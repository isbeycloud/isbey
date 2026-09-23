import { Router, Request, Response } from 'express';
import { storage } from '../db/storage';
import { HizliConnectService, tokenStore } from '../services/hizliConnectService';
import { DocumentConversionService } from '../services/documentConversionService';
import { requireAuth, requireRole } from '../middleware/authGuards';

const router = Router();

router.use(requireAuth);

// GET /api/efatura/templates/content - XSLT Şablon İçeriğini Getir
router.get('/templates/content', async (req: Request, res: Response) => {
  try {
    const { type = 'EFATURA', code = 'general' } = req.query;
    const fs = await import('fs');
    const path = await import('path');
    
    const fileName = type === 'EARSIV' || type === 'E_ARSIV' 
      ? `hizli_e_arsiv_${code}.xslt`
      : `hizli_e_fatura_${code}.xslt`;
      
    const filePath = path.join(process.cwd(), 'data', 'templates', fileName);
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf-8');
      res.setHeader('Content-Type', 'application/xml; charset=utf-8');
      return res.send(content);
    }
    
    return res.status(404).json({ success: false, message: 'XSLT şablon dosyası bulunamadı.' });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/efatura/:invoiceId/xml
router.get('/:invoiceId/xml', (req: Request, res: Response) => {
  try {
    const db = storage.getState();
    const tenantId = req.tenantId || 'tnt-isbey';
    const invoice = db.invoices.find(i => i.id === req.params.invoiceId && (i.tenantId === tenantId || (!i.tenantId && tenantId === 'tnt-isbey')));
    if (!invoice) {
      return res.status(404).json({ success: false, message: 'Fatura bulunamadı.' });
    }

    const tenant = (db.tenants || []).find(t => t.id === tenantId);
    const company = tenant || db.company;

    // 2026-09-12 (uydurma temizliği): SATICI kimliği eskiden eksikse SABİT bir
    // mükellefe düşüyordu — `<cbc:ID schemeID="VKN">${company.taxNumber || '1681136628'}`
    // ve unvan için `|| 'BEYOĞLU TEKNOLOJİ LTD. ŞTİ.'`. Yani firma ayarları eksik
    // olan bir kiracının GİB'e gidecek faturası BAŞKA bir mükellefin VKN'si ve
    // unvanıyla üretiliyordu. Kimlik uydurularak resmî belge üretilemez: eksikse
    // açık hata döner (CLAUDE.md md.1).
    const supplierTaxNumber = String((company as any)?.taxNumber || '').trim();
    const supplierTitle = String((company as any)?.title || (company as any)?.name || '').trim();
    if (!supplierTaxNumber || !supplierTitle) {
      return res.status(422).json({
        success: false,
        message:
          'Fatura üretilemedi: satıcı firmanın VKN ve unvanı tanımlı değil. ' +
          'Lütfen firma bilgilerini tamamlayıp tekrar deneyin.',
      });
    }

    // 2026-09-12 (uydurma temizliği): ALICI kimliği de artık uydurulmaz.
    // Önceden `db.customers` içinde bulunamazsa gövde şu hâle düşüyordu:
    //   taxNumber: invoice.customerCode || ''  → şablon satır 131'de
    //   `${customer.taxNumber || '11111111111'}` ile 11 haneli UYDURMA bir
    //   TCKN'ye; CityName 'Adana', CitySubdivisionName 'Merkez', TaxScheme
    //   'Vergi Dairesi' sabitlerine düşülüyordu. Yani GİB'e gidecek bir fatura,
    //   alıcının gerçek VKN'si/adresi bilinmeden ÜRETİLİYORDU. Resmî belgede
    //   alıcı kimliği tahminle doldurulamaz.
    //
    // Alıcı kaydı aslen e-Fatura sistemindeki ALICI mükellef listesinden gelir;
    // İŞBEY'de bu kayıt `customers` koleksiyonudur. Farklı bir koleksiyonda
    // tutuluyorsa `HizliConnectService.checkGibUser` ile (gerçek API) alıcı
    // VKN'si doğrulanarak çözülebilir. Şimdilik: kayıt yoksa açık hata döner.
    let customer = db.customers.find(c => c.id === invoice.customerId);
    if (!customer) {
      // Savunma: `customers` doğrudan eşleşmediyse VKN/customerCode üzerinden dene
      // (gerçek kayıt varsa kullanılır; uydurma ÜRETİLMEZ).
      const code = String(invoice.customerCode || '').replace(/\D/g, '');
      if (code) customer = db.customers.find(c => (c.taxNumber || '').replace(/\D/g, '') === code);
    }
    if (!customer) {
      return res.status(422).json({
        success: false,
        message:
          'Fatura (XML) üretilemedi: alıcı cari kaydı bulunamadı. Resmî belgede alıcı ' +
          'VKN/unvan/adres bilgileri uydurulamaz; lütfen alıcıyı tanımlayıp tekrar deneyin.',
      });
    }

    const isTckn = customer.taxNumber && customer.taxNumber.length === 11;
    // 2026-09-16 (`docs/47` §6/B): XML ve HTML çıktıları AYNI kaydı ÇELİŞKİLİ
    // anlatıyordu. XML'de `isDraft` yalnız 'DRAFT'/boş iken true oluyordu; HTML
    // yolunda (`:365`) ise `!isSent`. `MOCK_SENT` bu ikisinin arasında kalıyordu:
    // XML "taslak değil" derken (uyarı notu YOK) HTML "TASLAK FATURA" filigranı
    // basıyordu. Ölçüm (`docs/47` §3.3): aynı belge, iki farklı hüküm.
    //
    // Doğru ölçüt HTML yolundaki gibidir: belge YALNIZ gerçekten gönderildiyse
    // (SENT/DELIVERED/ACCEPTED) taslak değildir. 'QUEUED'/'SENDING'/'WAITING' gibi
    // sıradaki durumlar da gönderilmiş DEĞİLDİR; onlara da taslak uyarısı düşer —
    // bu, öncekinden daha doğrudur (entegratöre ulaşmamış belge resmî geçerlilik
    // taşımaz). `MOCK_SENT` bilerek bu kümenin DIŞINDADIR.
    const isSent = invoice.eInvoiceStatus === 'SENT' || invoice.eInvoiceStatus === 'DELIVERED' || invoice.eInvoiceStatus === 'ACCEPTED';
    const isDraft = !isSent;
    // 2026-09-12 (uydurma veri temizliği): ETTN yoksa `<cbc:UUID>` alanına
    // sahte bir UUID deseni gibi İKNA EDİCİ ama SAHTE bir
    // belge kimliği yazılıyordu. ETTN GİB'in resmî belge kimliğidir; onu tahmin
    // edilebilir bir kalıpla üretmek "bu belge GİB'de kayıtlı" izlenimi verir.
    // Artık gerçek ETTN yoksa alan açıkça "TASLAK-ETTN-YOK" olarak işaretlenir
    // ve XML'e ek uyarı notu düşülür; resmî kimlik taklidi yapılmaz.
    //
    // 2026-09-16 (`docs/47` §6/B): Kimlik alanının KOŞULU da rozetle aynı ölçüte
    // bağlandı. Önceden yalnız "alan boş mu" diye bakılıyordu; belge hiçbir
    // entegratöre gönderilmemiş olsa bile alan DOLUYSA (ör. yalnız MOCK
    // sağlayıcıdan geçmiş kayıtlarda) kimlik XML'e YAZILIYOR ve bu XML indirilip
    // karşı tarafa verilebiliyordu — `docs/47` §2'de ölçülen 5 kayıt tam bu hâlde.
    // GİB onayı gelmemiş bir kimliği resmî belge kimliği diye dağıtmak, hiç
    // yazmamaktan zararlıdır. Artık gönderilmemiş belgede kimlik SUSTURULUR.
    const gercekEttn = typeof invoice.eInvoiceUUID === 'string' && invoice.eInvoiceUUID.trim()
      ? invoice.eInvoiceUUID.trim()
      : null;
    // Gösterilecek gerçek ETTN: yalnız belge gerçekten gönderilmişse.
    const gosterilecekEttn = isSent ? gercekEttn : null;
    const ettn = gosterilecekEttn
      || (gercekEttn ? 'DOGRULANMAMIS-ETTN' : 'TASLAK-ETTN-YOK');

    // Generate GİB Standard UBL-TR 2.1 XML
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
         xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
         xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2"
         xmlns:ubltr="urn:oasis:names:specification:ubl:schema:xsd:TurkishCustomization">
  <cbc:UBLVersionID>2.1</cbc:UBLVersionID>
  <cbc:CustomizationID>TR1.2</cbc:CustomizationID>
  <cbc:ProfileID>TEMELFATURA</cbc:ProfileID>
  <cbc:ID>${invoice.invoiceNo}</cbc:ID>
  <cbc:CopyIndicator>false</cbc:CopyIndicator>
  <cbc:UUID>${ettn}</cbc:UUID>
  <cbc:IssueDate>${invoice.date}</cbc:IssueDate>
  <cbc:InvoiceTypeCode>SATIS</cbc:InvoiceTypeCode>
  <cbc:Note>${isDraft ? 'TASLAK FATURADIR - GİB RESMİ GEÇERLİLİĞİ YOKTUR' : ''}${!gercekEttn ? ' | ETTN ATANMAMIŞTIR - BELGE GİB\'E GÖNDERİLMEMİŞTİR' : ''}${gercekEttn && !isSent ? ' | GİB\'E GÖNDERİLMEMİŞTİR - KİMLİK DOĞRULANMAMIŞTIR' : ''}</cbc:Note>
  <cbc:DocumentCurrencyCode>TRY</cbc:DocumentCurrencyCode>

  <!-- SATICI (FİRMA) BİLGİLERİ -->
  <cac:AccountingSupplierParty>
    <cac:Party>
      <cac:PartyIdentification>
        <cbc:ID schemeID="VKN">${supplierTaxNumber}</cbc:ID>
      </cac:PartyIdentification>
      <cac:PartyName>
        <cbc:Name>${supplierTitle}</cbc:Name>
      </cac:PartyName>
      <cac:PostalAddress>
        <cbc:StreetName>${(company as any).address || ''}</cbc:StreetName>
        <cbc:CityName>${(company as any).city || ''}</cbc:CityName>
        <cbc:CitySubdivisionName>${(company as any).district || ''}</cbc:CitySubdivisionName>
        <cac:Country>
          <cbc:Name>Türkiye</cbc:Name>
        </cac:Country>
      </cac:PostalAddress>
      <cac:PartyTaxScheme>
        <cac:TaxScheme>
          <cbc:Name>${(company as any).taxOffice || ''}</cbc:Name>
        </cac:TaxScheme>
      </cac:PartyTaxScheme>
      <cac:Contact>
        <cbc:Telephone>${(company as any).phone || ''}</cbc:Telephone>
        <cbc:ElectronicMail>${(company as any).email || ''}</cbc:ElectronicMail>
      </cac:Contact>
    </cac:Party>
  </cac:AccountingSupplierParty>

  <!-- ALICI (MÜŞTERİ / CARİ) BİLGİLERİ -->
  <cac:AccountingCustomerParty>
    <cac:Party>
      <cac:PartyIdentification>
        <cbc:ID schemeID="${isTckn ? 'TCKN' : 'VKN'}">${customer.taxNumber || ''}</cbc:ID>
      </cac:PartyIdentification>
      <cac:PartyName>
        <cbc:Name>${customer.title || invoice.customerTitle}</cbc:Name>
      </cac:PartyName>
      <cac:PostalAddress>
        <cbc:StreetName>${customer.address || ''}</cbc:StreetName>
        <cbc:CityName>${customer.city || ''}</cbc:CityName>
        <cbc:CitySubdivisionName>${customer.district || ''}</cbc:CitySubdivisionName>
        <cac:Country>
          <cbc:Name>Türkiye</cbc:Name>
        </cac:Country>
      </cac:PostalAddress>
      <cac:PartyTaxScheme>
        <cac:TaxScheme>
          <cbc:Name>${customer.taxOffice || ''}</cbc:Name>
        </cac:TaxScheme>
      </cac:PartyTaxScheme>
      <cac:Contact>
        <cbc:Telephone>${customer.phone || ''}</cbc:Telephone>
        <cbc:ElectronicMail>${customer.email || ''}</cbc:ElectronicMail>
      </cac:Contact>
    </cac:Party>
  </cac:AccountingCustomerParty>

  <!-- VERGİ VE TOPLAMLAR -->
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="TRY">${(invoice.totalVat || 0).toFixed(2)}</cbc:TaxAmount>
    <cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="TRY">${((invoice.subTotal || 0) - (invoice.totalDiscount || 0)).toFixed(2)}</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="TRY">${(invoice.totalVat || 0).toFixed(2)}</cbc:TaxAmount>
      <cac:TaxCategory>
        <cbc:Percent>20</cbc:Percent>
        <cac:TaxScheme>
          <cbc:Name>KDV</cbc:Name>
          <cbc:TaxTypeCode>0015</cbc:TaxTypeCode>
        </cac:TaxScheme>
      </cac:TaxCategory>
    </cac:TaxSubtotal>
  </cac:TaxTotal>

  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="TRY">${(invoice.subTotal || 0).toFixed(2)}</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="TRY">${((invoice.subTotal || 0) - (invoice.totalDiscount || 0)).toFixed(2)}</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="TRY">${(invoice.grandTotal || 0).toFixed(2)}</cbc:TaxInclusiveAmount>
    <cbc:AllowanceTotalAmount currencyID="TRY">${(invoice.totalDiscount || 0).toFixed(2)}</cbc:AllowanceTotalAmount>
    <cbc:PayableAmount currencyID="TRY">${(invoice.grandTotal || 0).toFixed(2)}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>

  <!-- FATURA KALEMLERİ -->
  ${(invoice.items || []).map((item: any, idx: number) => `
  <cac:InvoiceLine>
    <cbc:ID>${idx + 1}</cbc:ID>
    <cbc:InvoicedQuantity unitCode="${item.unit === 'Adet' ? 'C62' : 'NIU'}">${item.quantity || 1}</cbc:InvoicedQuantity>
    <cbc:LineExtensionAmount currencyID="TRY">${(item.lineTotal || (item.unitPrice * item.quantity) || 0).toFixed(2)}</cbc:LineExtensionAmount>
    <cac:Item>
      <cbc:Name>${item.productName || 'Mal/Hizmet'}</cbc:Name>
      <cac:SellersItemIdentification>
        <cbc:ID>${item.productCode || `PRD-${idx + 1}`}</cbc:ID>
      </cac:SellersItemIdentification>
    </cac:Item>
    <cac:Price>
      <cbc:PriceAmount currencyID="TRY">${(item.unitPrice || 0).toFixed(2)}</cbc:PriceAmount>
    </cac:Price>
  </cac:InvoiceLine>`).join('')}
</Invoice>`;

    res.setHeader('Content-Type', 'application/xml');
    res.send(xml);
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/efatura/taxpayer-check/:vkn - Canlı GİB / Hızlı Bilişim Mükellef Sorgulama
router.get('/taxpayer-check/:vkn', async (req: Request, res: Response) => {
  try {
    const vkn = (String(req.params.vkn || '')).trim().replace(/\D/g, '');
    if (!vkn || (vkn.length !== 10 && vkn.length !== 11)) {
      return res.status(400).json({ success: false, message: 'Geçerli bir 10 haneli VKN veya 11 haneli TCKN giriniz.' });
    }

    const db = storage.getState();
    // Yerel cari kaydı (yalnızca GERÇEK veriyi zenginleştirmek için — uydurma üretmez)
    const localCust = db.customers.find(c => (c.taxNumber || '').replace(/\D/g, '') === vkn);

    // 2026-09-12 (uydurma temizliği): Bu uç "Canlı GİB / Hızlı Bilişim Mükellef
    // Sorgulama" olarak sunuluyordu ama GERÇEK sorgu HİÇ yapılmıyordu:
    //   (a) `checkRes.data` diye bir alan yok — `checkGibUser` düz bir nesne döner
    //       (success/title/aliasPk/aliasGb/...), yani online dal hiç dolmuyordu.
    //   (b) Bu yüzden `isEInvoiceUser` VKN'nin SON HANESİNDEN türetiliyordu
    //       (…0/…2/…8 → mükellef). Yanlış "mükellef" kararı yanlış belge tipine
    //       (e-Fatura vs e-Arşiv) yol açar.
    //   (c) `isEArchiveUser: true` SABİTTİ; `firstRegistrationDate` ve GİB
    //       alias'ları (`urn:mail:defaultgb@<vkn>.com.tr`) UYDURULUYORDU.
    // Artık: önce yerel GERÇEK kayıt kullanılır (varsa "yerel" kaynak işaretlenir);
    // online token varsa GERÇEK API'ye sorulur; ikisi de yoksa uydurma yerine
    // doğrulanamadı yanıtı döner.
    let result: any = null;
    let source: 'GIB_ONLINE' | 'YEREL_KAYIT' | null = null;

    if (hizliConfig.token) {
      try {
        const checkRes = await HizliConnectService.checkGibUser(vkn, hizliConfig.token, hizliConfig.isTestMode);
        if (checkRes && checkRes.success) {
          result = {
            vkn,
            title: checkRes.title || '',
            isEInvoiceUser: Boolean(checkRes.isEInvoiceUser),
            // e-Arşiv durumu bu API'den DÖNMEZ; bilinmediği için null bırakılır (uydurulmaz)
            isEArchiveUser: null,
            firstRegistrationDate: (checkRes as any).firstCreationTime || null,
            // API alias'ları düz alanlar olarak döner (dizi değil); yoksa BOŞ dizi
            aliases: [
              checkRes.aliasPk ? { alias: checkRes.aliasPk, type: 'PK' } : null,
              checkRes.aliasGb ? { alias: checkRes.aliasGb, type: 'GB' } : null,
            ].filter(Boolean),
            taxOffice: localCust?.taxOffice || '',
            address: localCust?.address || '',
            city: localCust?.city || '',
            district: localCust?.district || '',
          };
          source = 'GIB_ONLINE';
        }
      } catch (e) {
        // Gerçek API'ye ulaşılamadı — aşağıda yerel kayda düşülür
      }
    }

    if (!result && localCust) {
      result = {
        vkn,
        title: localCust.title || '',
        // Yerel kayıttan e-Fatura mükellefiyeti ÇIKARILAMAZ → uydurulmaz
        isEInvoiceUser: null,
        isEArchiveUser: null,
        firstRegistrationDate: null,
        aliases: [],
        taxOffice: localCust.taxOffice || '',
        address: localCust.address || '',
        city: localCust.city || '',
        district: localCust.district || '',
      };
      source = 'YEREL_KAYIT';
    }

    if (!result) {
      return res.status(200).json({
        success: false,
        source: null,
        message:
          'Mükellef sorgusu yapılamadı: ne Hızlı Bilişim/GİB bağlantısı ne de yerel cari kaydı ' +
          'mevcut. Mükellefiyet durumu DOĞRULANMADAN gösterilmez.',
        taxpayer: null,
      });
    }

    return res.json({ success: true, source, taxpayer: result });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/efatura/:invoiceId/html - GİB Standart XSLT/HTML Fatura Görseli
router.get('/:invoiceId/html', (req: Request, res: Response) => {
  try {
    const db = storage.getState();
    const invoice = db.invoices.find(i => i.id === req.params.invoiceId);
    if (!invoice) {
      return res.status(404).send('<h2>Fatura bulunamadı.</h2>');
    }

    // 2026-09-12 (uydurma temizliği): Bu blok, kiracının firma kaydı yoksa
    // ekrana SABİT bir mükellef (BEYOĞLU TEKNOLOJİ / VKN 1681136628 / Adana
    // adresi) yazıyordu. Fatura görselinde başka bir firmanın kimliğinin
    // görünmesi hem yanıltıcı hem de resmî belge açısından sakıncalıdır.
    // Kimlik artık uydurulmaz; eksikse görsel üretilmeden açık hata döner.
    const tenantIdHtml = req.tenantId || 'tnt-isbey';
    const company = (db.tenants || []).find(t => t.id === tenantIdHtml) || db.company;
    const htmlTaxNumber = String((company as any)?.taxNumber || '').trim();
    const htmlTitle = String((company as any)?.title || (company as any)?.name || '').trim();
    if (!htmlTaxNumber || !htmlTitle) {
      return res
        .status(422)
        .send('<h2>Fatura görseli üretilemedi: satıcı firmanın VKN ve unvanı tanımlı değil.</h2>');
    }

    // 2026-09-12 (uydurma temizliği): Önceden `taxNumber: invoice.customerCode || ''`
    // ile cari KODU, alıcının VKN'si gibi görüntüleniyordu (aşağıda VKN/TCKN
    // alanında). Cari kodu VKN değildir — görselde onu VKN diye yazmak yanıltıcıdır.
    // Gerçek kayıt VKN/customerCode üzerinden aranır; bulunamazsa VKN BOŞ bırakılır.
    let customer = db.customers.find(c => c.id === invoice.customerId);
    if (!customer) {
      const code = String(invoice.customerCode || '').replace(/\D/g, '');
      if (code) customer = db.customers.find(c => (c.taxNumber || '').replace(/\D/g, '') === code);
    }
    const customerView = customer || {
      title: invoice.customerTitle,
      taxNumber: '',
      taxOffice: '',
      address: '',
      city: '',
      district: '',
      phone: '',
      email: '',
    };

    const isSent = invoice.eInvoiceStatus === 'SENT' || invoice.eInvoiceStatus === 'DELIVERED' || invoice.eInvoiceStatus === 'ACCEPTED';
    const isDraft = !isSent;
    // 2026-09-12: Baskı/HTML görünümünde de ETTN uydurulmaz. Gerçek ETTN yoksa
    // "ETTN ATANMAMIŞ" yazılır; sahte bir GİB kimliği
    // basılı belgeye GİB onayı görüntüsü verirdi.
    //
    // 2026-09-16 (`docs/47` §6/B): Kimlik alanının koşulu rozetle aynı ölçüte
    // bağlandı. Önceden `isDraft` burada `!isSent` iken XML yolunda `=== 'DRAFT'`
    // idi; aynı belge iki çıktıda çelişiyordu. Artık ikisi de aynı `isSent`
    // ölçütünü kullanır ve gönderilmemiş belgede kimlik SUSTURULUR — XML yoluyla
    // aynı kural (bkz. `:114-128`).
    const gercekEttnHtml = typeof invoice.eInvoiceUUID === 'string' && invoice.eInvoiceUUID.trim()
      ? invoice.eInvoiceUUID.trim()
      : null;
    const gosterilecekEttnHtml = isSent ? gercekEttnHtml : null;
    const ettn = gosterilecekEttnHtml
      || (gercekEttnHtml
        ? 'ETTN DOĞRULANMAMIŞ (GİB\'e gönderilmedi)'
        : 'ETTN ATANMAMIŞ (GİB\'e gönderilmedi)');
    const docType = invoice.invoiceProfile === 'EARSIVFATURA' || (!customerView.taxNumber || customerView.taxNumber.length === 11) ? 'e-Arşiv Fatura' : 'e-Fatura';
    const profile = invoice.invoiceProfile || 'TICARIFATURA';
    const invoiceCategory = invoice.invoiceCategory || (invoice.type === 'PURCHASE' ? 'ALIS' : 'SATIS');

    const html = `<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="UTF-8">
  <title>${docType} - ${invoice.invoiceNo}</title>
  <style>
    @page { size: A4; margin: 12mm; }
    * { box-sizing: border-box; }
    body {
      font-family: 'Segoe UI', Arial, sans-serif;
      font-size: 11px;
      color: #1e293b;
      margin: 0;
      padding: 20px;
      background: #f8fafc;
    }
    .invoice-card {
      max-width: 820px;
      margin: 0 auto;
      background: #ffffff;
      padding: 30px;
      border: 1px solid #e2e8f0;
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
      position: relative;
    }
    .watermark {
      position: absolute;
      top: 45%;
      left: 50%;
      transform: translate(-50%, -50%) rotate(-35deg);
      font-size: 56px;
      font-weight: 900;
      color: rgba(220, 38, 38, 0.08);
      pointer-events: none;
      white-space: nowrap;
      text-transform: uppercase;
      letter-spacing: 6px;
    }
    .header-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 20px;
      border-bottom: 2px solid #0f172a;
      padding-bottom: 15px;
      margin-bottom: 15px;
    }
    .logo-title {
      font-size: 16px;
      font-weight: 800;
      color: #0f172a;
      line-height: 1.3;
    }
    .gib-badge {
      display: inline-block;
      padding: 4px 10px;
      background: #0f172a;
      color: #ffffff;
      font-weight: 700;
      font-size: 12px;
      border-radius: 4px;
      margin-bottom: 6px;
    }
    .meta-table td {
      padding: 3px 6px;
      font-size: 11px;
    }
    .meta-table td.label {
      font-weight: 700;
      color: #475569;
      width: 120px;
    }
    .parties-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 15px;
      margin-bottom: 20px;
    }
    .party-box {
      border: 1px solid #cbd5e1;
      border-radius: 6px;
      padding: 12px;
      background: #f8fafc;
    }
    .party-box h4 {
      margin: 0 0 8px 0;
      font-size: 11px;
      text-transform: uppercase;
      color: #0f172a;
      border-bottom: 1px solid #e2e8f0;
      padding-bottom: 4px;
    }
    .items-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 15px;
      font-size: 10.5px;
    }
    .items-table th {
      background: #0f172a;
      color: #ffffff;
      padding: 7px 6px;
      text-align: left;
      font-weight: 600;
    }
    .items-table th.num, .items-table td.num {
      text-align: right;
    }
    .items-table td {
      padding: 7px 6px;
      border-bottom: 1px solid #e2e8f0;
    }
    .items-table tr:nth-child(even) td {
      background: #fcfdfe;
    }
    .totals-grid {
      display: grid;
      grid-template-columns: 1.2fr 0.8fr;
      gap: 20px;
      margin-top: 15px;
    }
    .totals-table {
      width: 100%;
      border-collapse: collapse;
    }
    .totals-table td {
      padding: 4px 8px;
      font-size: 11px;
    }
    .totals-table td.label {
      text-align: right;
      font-weight: 600;
      color: #475569;
    }
    .totals-table td.val {
      text-align: right;
      font-weight: 700;
      color: #0f172a;
      width: 120px;
    }
    .totals-table tr.grand-total td {
      border-top: 2px solid #0f172a;
      font-size: 13px;
      font-weight: 800;
      color: #0284c7;
      padding-top: 6px;
    }
    .qr-zone {
      display: flex;
      align-items: center;
      gap: 15px;
      border: 1px dashed #cbd5e1;
      padding: 10px;
      border-radius: 6px;
      background: #ffffff;
    }
    .qr-box {
      width: 70px;
      height: 70px;
      background: #0f172a;
      color: #ffffff;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 9px;
      font-weight: bold;
      text-align: center;
      border-radius: 4px;
    }
    .signature-area {
      margin-top: 25px;
      display: grid;
      grid-template-columns: 1fr 1fr;
      text-align: center;
      padding-top: 15px;
      border-top: 1px solid #e2e8f0;
    }
    .actions-bar {
      max-width: 820px;
      margin: 0 auto 15px auto;
      display: flex;
      justify-content: flex-end;
      gap: 10px;
    }
    .btn {
      padding: 8px 16px;
      border-radius: 6px;
      font-weight: 600;
      cursor: pointer;
      border: none;
      font-size: 12px;
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }
    .btn-print { background: #0f172a; color: #fff; }
    .btn-xml { background: #0284c7; color: #fff; }
    @media print {
      body { background: #fff; padding: 0; }
      .invoice-card { border: none; box-shadow: none; padding: 0; }
      .actions-bar { display: none; }
    }
  </style>
</head>
<body>
  <div class="actions-bar">
    <button class="btn btn-print" onclick="window.print()">🖨️ Yazdır (PDF)</button>
    <a href="/api/efatura/${invoice.id}/xml" target="_blank" class="btn btn-xml">📄 UBL-XML İndir</a>
  </div>

  <div class="invoice-card">
    ${isDraft ? '<div class="watermark">TASLAK FATURA</div>' : ''}

    <div class="header-grid">
      <div>
        <div class="gib-badge">${docType.toUpperCase()}</div>
        <div class="logo-title">${htmlTitle}</div>
        <div style="margin-top: 6px; color: #475569; line-height: 1.4;">
          ${(company as any).address || ''}<br>
          ${(company as any).district || ''} / ${(company as any).city || ''}<br>
          <b>V.D.:</b> ${(company as any).taxOffice || '—'} &nbsp;|&nbsp; <b>VKN:</b> ${htmlTaxNumber}<br>
          <b>Tel:</b> ${company.phone || ''} &nbsp;|&nbsp; <b>E-Posta:</b> ${company.email || ''}
        </div>
      </div>
      <div>
        <table class="meta-table" style="width: 100%;">
          <tr><td class="label">Özelleştirme No:</td><td>TR1.2</td></tr>
          <tr><td class="label">Senaryo:</td><td><b>${profile}</b></td></tr>
          <tr><td class="label">Fatura Tipi:</td><td><b>${invoiceCategory}</b></td></tr>
          <tr><td class="label">Fatura No:</td><td><b style="color: #0284c7; font-size: 13px;">${invoice.invoiceNo}</b></td></tr>
          <tr><td class="label">Fatura Tarihi:</td><td>${invoice.date}</td></tr>
          <tr><td class="label">Düzenleme Saati:</td><td>${invoice.createdAt ? invoice.createdAt.substring(11, 16) : '12:00'}</td></tr>
          <tr><td class="label">ETTN:</td><td style="font-family: monospace; font-size: 9.5px; word-break: break-all;">${ettn}</td></tr>
        </table>
      </div>
    </div>

    <div class="parties-grid">
      <div class="party-box">
        <h4>SAYIN (ALICI)</h4>
        <div style="font-weight: 700; font-size: 12px; margin-bottom: 4px;">${customerView.title || invoice.customerTitle}</div>
        <div>${customerView.address || '—'}</div>
        <div>${customerView.district || ''} ${customerView.city ? `/ ${customerView.city}` : ''}</div>
        <div style="margin-top: 6px;">
          <b>V.D.:</b> ${customerView.taxOffice || '—'} &nbsp;|&nbsp; <b>VKN/TCKN:</b> ${customerView.taxNumber || '—'}
        </div>
      </div>
      <div class="party-box">
        <h4>SEVKİYAT & ÖDEME BİLGİLERİ</h4>
        <div><b>Ödeme Şekli:</b> ${invoice.paymentType || 'Cari Hesap'}</div>
        <div><b>Vade Tarihi:</b> ${invoice.maturityDate || invoice.date}</div>
        <div><b>Para Birimi:</b> ${invoice.currency || 'TRY'} ${invoice.exchangeRate ? `(Kur: ${invoice.exchangeRate})` : ''}</div>
        ${invoice.notes ? `<div style="margin-top: 6px; font-style: italic; color: #475569;"><b>Not:</b> ${invoice.notes}</div>` : ''}
      </div>
    </div>

    <table class="items-table">
      <thead>
        <tr>
          <th style="width: 30px;">#</th>
          <th>Mal / Hizmet Açıklaması</th>
          <th class="num" style="width: 60px;">Miktar</th>
          <th style="width: 50px;">Birim</th>
          <th class="num" style="width: 80px;">Birim Fiyat</th>
          <th class="num" style="width: 70px;">İskonto</th>
          <th class="num" style="width: 55px;">KDV %</th>
          <th class="num" style="width: 70px;">KDV Tutarı</th>
          ${invoice.withholdingRate ? '<th class="num" style="width: 70px;">Tevkifat</th>' : ''}
          <th class="num" style="width: 90px;">Mal/Hizmet Tutarı</th>
        </tr>
      </thead>
      <tbody>
        ${(invoice.items || []).map((item: any, idx: number) => `
        <tr>
          <td>${idx + 1}</td>
          <td>
            <b>${item.productName}</b>
            <div style="font-size: 9.5px; color: #64748b;">Kod: ${item.productCode || '-'} ${item.barcode ? `| Barkod: ${item.barcode}` : ''}</div>
          </td>
          <td class="num">${item.quantity}</td>
          <td>${item.unit || 'Adet'}</td>
          <td class="num">${(item.unitPrice || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺</td>
          <td class="num">${(item.discountAmount || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺</td>
          <td class="num">%${item.vatRate || 20}</td>
          <td class="num">${(item.vatAmount || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺</td>
          ${invoice.withholdingRate ? `<td class="num">${((item.vatAmount || 0) * (invoice.withholdingRate || 0)).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺</td>` : ''}
          <td class="num"><b>${(item.lineTotal || (item.unitPrice * item.quantity) || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺</b></td>
        </tr>
        `).join('')}
      </tbody>
    </table>

    <div class="totals-grid">
      <div>
        <div class="qr-zone">
          <div class="qr-box">GİB QR KOD<br>UBL-TR 2.1</div>
          <div style="font-size: 10px; color: #475569; line-height: 1.4;">
            <b>GİB Durum Kodu:</b> ${isSent ? '1200 - Başarıyla İşlendi' : 'Taslak (Gönderilmedi)'}<br>
            <b>E-İmza / Mühür:</b> Mali Mühürle Elektronik Olarak İmzalanmıştır.<br>
            <b>Zaman Damgası:</b> ${invoice.createdAt || new Date().toISOString()}
          </div>
        </div>
      </div>
      <div>
        <table class="totals-table">
          <tr><td class="label">Ara Toplam (Net):</td><td class="val">${(invoice.subTotal || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺</td></tr>
          ${invoice.totalDiscount ? `<tr><td class="label">Toplam İskonto:</td><td class="val" style="color: #dc2626;">-${(invoice.totalDiscount || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺</td></tr>` : ''}
          <tr><td class="label">Hesaplanan KDV:</td><td class="val">${(invoice.totalVat || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺</td></tr>
          ${invoice.totalWithholding ? `<tr><td class="label">Tevkifat Tutarı (${invoice.withholdingCode || ''}):</td><td class="val" style="color: #ea580c;">-${(invoice.totalWithholding || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺</td></tr>` : ''}
          ${invoice.payableVat ? `<tr><td class="label">Ödenecek KDV:</td><td class="val">${(invoice.payableVat || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺</td></tr>` : ''}
          <tr class="grand-total"><td class="label">ÖDENECEK TUTAR:</td><td class="val">${(invoice.grandTotal || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺</td></tr>
        </table>
      </div>
    </div>

    <div class="signature-area">
      <div>
        <b>Düzenleyen / Kaşe</b><br><br>
        <span style="font-size: 10px; color: #64748b;">${htmlTitle}</span>
      </div>
      <div>
        <b>Teslim Alan / İmza</b><br><br>
        <span style="font-size: 10px; color: #64748b;">${customerView.title || invoice.customerTitle}</span>
      </div>
    </div>
  </div>
</body>
</html>`;

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (err: any) {
    res.status(500).send(`Hata: ${err.message}`);
  }
});

// POST /api/efatura/batch-send - Çoklu Faturaları Topluca GİB'e Gönder
//
// 2026-09-12 (KRİTİK — uydurma GİB başarısı):
// Bu uç DAHA ÖNCE HİÇBİR API ÇAĞRISI YAPMIYORDU. Yalnız DB'yi güncelliyor;
// ETTN yoksa rastgele UUID uyduruyor,
// GİB başarı kodu ("GİB başarıyla işledi" gerçek kodu) ve
// "GİB e-Connect üzerinden başarıyla işlendi ve alıcıya iletildi" açıklamasını
// yazıp "GİB kuyruğuna iletildi" mesajı dönüyordu.
//
// Sonuç: HİÇ GÖNDERİLMEMİŞ faturalar İŞBEY'de gönderilmiş görünüyordu. 1200
// kodu, iletimin gerçekleştiği izlenimini veren en güçlü yalandır.
//
// Artık: (a) her fatura için GERÇEK API çağrısı yapılır, (b) DB yalnız
// entegratör `success: true` döndürdüğünde güncellenir, (c) UUID uydurulmaz,
// (d) kontör tüketen bu işlem platform yöneticisiyle sınırlıdır.
router.post('/batch-send', requireRole('SUPER_ADMIN', 'platform_admin'), async (req: Request, res: Response) => {
  try {
    const { invoiceIds } = req.body;
    if (!Array.isArray(invoiceIds) || invoiceIds.length === 0) {
      return res.status(400).json({ success: false, message: 'En az bir fatura ID seçilmelidir.' });
    }

    const db = storage.getState();
    const results: any[] = [];

    for (const id of invoiceIds) {
      const inv = db.invoices.find(i => i.id === id);
      if (!inv) {
        results.push({ id, success: false, status: 'NOT_FOUND' });
        continue;
      }

      // ÖNEMLİ: Gerçek içerik hâlâ gönderilmiyor olabilir; bu yüzden tek
      // doğru kaynak entegratörün YANITIDIR. Yanıt ne diyorsa o yazılır.
      let result: any = { success: false, message: 'Gönderim denenmedi.' };
      try {
        const customer = db.customers.find(c => c.id === inv.customerId);
        result = await HizliConnectService.sendInvoice(
          inv, customer, db.company, hizliConfig, hizliConfig.token
        );
      } catch (callErr: any) {
        result = { success: false, message: callErr.message };
      }

      if (result?.success === true) {
        const uuid = result.uuid || inv.eInvoiceUUID || null;
        await storage.runTransaction(draft => {
          const target = draft.invoices.find(i => i.id === id);
          if (!target) return;
          target.eInvoiceStatus = 'SENT';
          // 1200 SABİT YAZILMAZ — entegratör ne döndüyse o.
          if (result.gibStatusCode !== undefined) target.gibStatusCode = result.gibStatusCode;
          target.gibStatusDescription = result.gibStatusDescription || result.message || 'Entegratöre iletildi.';
          if (uuid) target.eInvoiceUUID = uuid;
          target.updatedAt = new Date().toISOString();
        });
        results.push({ id, invoiceNo: inv.invoiceNo, uuid, success: true, status: 'SENT', message: result.message });
      } else {
        // Başarısızlıkta DB'ye statü YAZILMAZ; durum olduğu gibi kalır.
        results.push({ id, invoiceNo: inv.invoiceNo, success: false, status: 'FAILED', message: result?.message || 'Gönderim başarısız.' });
      }
    }

    const basarili = results.filter(r => r.success).length;
    const basarisiz = results.length - basarili;

    res.status(basarisiz > 0 && basarili === 0 ? 502 : 200).json({
      success: basarisiz === 0,
      message: basarisiz === 0
        ? `${basarili} adet fatura entegratöre iletildi.`
        : `${basarili} başarılı, ${basarisiz} başarısız. Başarısız faturaların statüsü DEĞİŞTİRİLMEDİ.`,
      sentCount: basarili,
      failedCount: basarisiz,
      results,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/efatura/batch-status-sync - Toplu GİB Durum Güncelleme
//
// 2026-09-12 (KRİTİK — uydurma GİB durumu):
// Bu uç DAHA ÖNCE GİB'e HİÇ SORMUYORDU. `SENT`/`WAITING`/`QUEUED` durumundaki
// her faturayı koşulsuz `DELIVERED` yapıyor, GİB başarı kodu ve
// "1200 - Belge GİB ve alıcı posta kutusu tarafından başarıyla işlendi."
// yazıyordu. Yani GİB'de reddedilmiş bir belge bile "alıcıya teslim edildi"
// görünüyordu. `invoiceIds` filtresi de yalnız `targetInvoices` değişkenine
// atanıyor, döngü TÜM faturalar üzerinde dönüyordu — filtre hiç uygulanmıyordu.
//
// Artık: her fatura için entegratörden GERÇEK durum sorgulanır
// (getInvoiceStatus → GetDocumentListGUID); yalnız entegratörün döndürdüğü
// kod/açıklama yazılır. Durum alınamazsa kayıt DEĞİŞTİRİLMEZ.
// Bu uç salt-okunur bir sorgu DEĞİLDİR (DB yazar) ancak kontör tüketmez.
router.post('/batch-status-sync', requireRole('SUPER_ADMIN', 'platform_admin'), async (req: Request, res: Response) => {
  try {
    const { invoiceIds } = req.body;
    const db = storage.getState();

    // Filtre GERÇEKTEN uygulanır (önceki kodda yalnız yerel değişkene yazılıyordu).
    const adaylar = db.invoices.filter(i => {
      if (i.isDeleted) return false;
      if (Array.isArray(invoiceIds) && invoiceIds.length > 0 && !invoiceIds.includes(i.id)) return false;
      return ['SENT', 'WAITING', 'QUEUED'].includes(String(i.eInvoiceStatus));
    });

    const updated: any[] = [];
    const atlanan: any[] = [];

    for (const inv of adaylar) {
      if (!inv.eInvoiceUUID) {
        atlanan.push({ id: inv.id, invoiceNo: inv.invoiceNo, reason: 'ETTN yok — GİB durumu sorgulanamaz.' });
        continue;
      }

      const st = await HizliConnectService.getInvoiceStatus(inv.eInvoiceUUID, hizliConfig.isTestMode);
      // Entegratör durum döndürmediyse kayıt DEĞİŞTİRİLMEZ (uydurma yok).
      if (!st || !st.gibStatus) {
        atlanan.push({ id: inv.id, invoiceNo: inv.invoiceNo, reason: st?.message || 'GİB durumu alınamadı.' });
        continue;
      }

      const yeniDurum = st.status || 'WAITING';
      await storage.runTransaction(draft => {
        const target = draft.invoices.find(i => i.id === inv.id);
        if (!target) return;
        target.eInvoiceStatus = yeniDurum as any;
        target.gibStatusCode = Number(st.gibStatus);
        target.gibStatusDescription = st.message || st.status;
        target.updatedAt = new Date().toISOString();
      });
      updated.push({ id: inv.id, invoiceNo: inv.invoiceNo, status: yeniDurum, gibCode: st.gibStatus });
    }

    res.json({
      success: true,
      message: `${updated.length} adet faturanın GİB durumu entegratörden alındı.${atlanan.length ? ` ${atlanan.length} fatura atlandı (durum alınamadı).` : ''}`,
      syncedCount: updated.length,
      skippedCount: atlanan.length,
      updated,
      skipped: atlanan,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/efatura/incoming - Gelen e-Faturalar Listesi
router.get('/incoming', (req: Request, res: Response) => {
  try {
    const db = storage.getState();
    // Invoices marked as incoming or purchase invoices with e-Invoice data
    const incomingList = db.invoices.filter(i => !i.isDeleted && (i.isIncomingEInvoice || i.type === 'PURCHASE'));
    res.json({ success: true, incomingInvoices: incomingList });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/efatura/incoming/:id/convert-to-purchase - Gelen e-Faturayı Alış Faturasına ve Stoğa Aktar
router.post('/incoming/:id/convert-to-purchase', async (req: Request, res: Response) => {
  try {
    const { warehouseId, updateStock = true } = req.body;
    const db = storage.getState();
    const inv = db.invoices.find(i => i.id === req.params.id);
    if (!inv) {
      return res.status(404).json({ success: false, message: 'Gelen fatura kaydı bulunamadı.' });
    }

    await storage.runTransaction(draft => {
      const target = draft.invoices.find(i => i.id === req.params.id);
      if (target) {
        target.type = 'PURCHASE';
        target.status = 'ACTIVE';
        target.warehouseId = warehouseId || target.warehouseId || 'wh-default';
        target.updatedAt = new Date().toISOString();

        // Update supplier balance (Payable / Alacak)
        const supplier = draft.customers.find(c => c.id === target.customerId || c.taxNumber === target.incomingSupplierVkn);
        if (supplier) {
          supplier.balance = (supplier.balance || 0) - target.grandTotal; // Tedarikçiye borçlandık
        }

        // Add Stock Movements
        if (updateStock && Array.isArray(target.items)) {
          for (const item of target.items) {
            const prod = draft.products.find(p => p.id === item.productId || p.code === item.productCode);
            if (prod) {
              prod.stock = (prod.stock || 0) + item.quantity;
              draft.stockMovements.push({
                id: `sm-inc-${Date.now()}-${item.productId}`,
                productId: prod.id,
                productCode: prod.code,
                productName: prod.name,
                warehouseId: target.warehouseId,
                documentNo: target.invoiceNo,
                documentType: 'INVOICE',
                documentId: target.id,
                movementType: 'IN',
                quantity: item.quantity,
                direction: 'IN',
                unitPrice: item.unitPrice,
                totalAmount: item.lineTotal,
                date: target.date,
                notes: `Gelen e-Fatura Aktarımı (${target.invoiceNo})`,
                userId: 'admin',
                createdAt: new Date().toISOString(),
              });
            }
          }
        }
      }
    });

    res.json({
      success: true,
      message: `${inv.invoiceNo} nolu gelen e-Fatura başarıyla Alış Faturası ve Depo Stok Girişi olarak sisteme işlendi.`,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ──────────────────────────────────────────────────────────────────────────
// HIZLI TEKNOLOJİ (e-Connect) ÖZEL ENTEGRATÖR SERVİS ROTALARI
// ──────────────────────────────────────────────────────────────────────────

// In-memory / storage configuration store — .env'den doldurulur
// tokenStore (hizliConnectService) ile senkronize çalışır
// FAZ 10: Hardcode API key YASAK — credential sadece .env'den okunur; eksikse boş kalır ve
// istek anında açıkça hata döndürülür (getHizliConfig kullanılmadan önce kontrol edin)
let hizliConfig = {
  apiKey: process.env.HIZLI_BILISIM_API_KEY || '',
  secretKey: process.env.HIZLI_BILISIM_SECRET_KEY || '',
  username: process.env.HIZLI_BILISIM_WS_USERNAME || '',
  password: process.env.HIZLI_BILISIM_WS_PASSWORD || '',
  hashedUsername: process.env.HIZLI_BILISIM_HASHED_USERNAME || '',
  hashedPassword: process.env.HIZLI_BILISIM_HASHED_PASSWORD || '',
  isTestMode: process.env.HIZLI_BILISIM_IS_TEST_MODE !== 'false',
  senderIdentifier: '4810592817',
  senderUrn: 'urn:mail:defaultpk@hizlibilisimteknolojileri.net',
  autoCheckGibUser: true,
  get token() { return tokenStore.token; },
  get tokenExpireDate() { return tokenStore.expireDate; },
};

// ──────────────────────────────────────────────────────────────────────────
// 2026-09-12 (güvenlik sertleştirmesi — Hızlı Bilişim credential'ları)
//
// TESPİT: Bu router `router.use(requireAuth)` dışında hiçbir yetki kontrolü
// taşımıyordu. Yani GİRİŞ YAPMIŞ HER kullanıcı (tüm kiracılar dâhil) aşağıdaki
// uçlarla entegratör kimlik bilgilerini değiştirebiliyordu. Üstelik
// `hizliConfig` ve `tokenStore` süreç genelinde (global) tutuluyor — yani
// Tenant A'nın yaptığı değişiklik TÜM kiracıların GİB gönderimini etkiler.
//
// Bu yüzden credential/global durum YAZAN uçlar yalnız platform yöneticisine
// açıldı. Kural: "sadece Sidebar gizlemek güvenlik değildir" (CLAUDE.md md.2).
//
// NOT: Guard her uçta AÇIKÇA `requireRole('SUPER_ADMIN', 'platform_admin')`
// olarak yazılır (takma ad kullanılmaz). Gerekçe: FAZ 25.2-D matris jeneratörü
// (faz252dAuthzMatrixGenerator.mjs) guard zincirini argüman metninden regex ile
// okur; tanımadığı bir takma adı "guard yok" sayar → matris uçları herkese
// ALLOW yazar → runtime suite doğru 403 cevabını "beklenti ALLOW → 403" diye
// FAIL raporlar (koşu #3'teki 48 FAIL'in kök nedeni). Bu yüzden burada DRY
// tercih edilmedi.
// ──────────────────────────────────────────────────────────────────────────

// Canlı (production) Hızlı Bilişim endpoint'ine geçiş, QA onay fazından önce
// KAPALIDIR (CLAUDE.md md.1). Test moduna geçiş her zaman serbesttir.
// Bilinçli onay için ortam değişkeni gerekir: HIZLI_BILISIM_ALLOW_PROD=true
function isProductionSwitchAllowed(): boolean {
  return process.env.HIZLI_BILISIM_ALLOW_PROD === 'true';
}

// GET /api/efatura/hizli/config - Ayarları getir
router.get('/hizli/config', requireRole('SUPER_ADMIN', 'platform_admin'), (req: Request, res: Response) => {
  res.json({
    success: true,
    config: {
      ...hizliConfig,
      // 2026-09-15: `...hizliConfig` spread'i `apiKey` ve `username`'i
      // maskelenmeden dışarı taşıyordu — canlı entegratör anahtarı düz metin
      // olarak tarayıcıya gidiyordu. Liste burada tamamlandı.
      apiKey: hizliConfig.apiKey ? '••••••••' : '',
      username: hizliConfig.username ? '••••••••' : '',
      password: hizliConfig.password ? '••••••••' : '',
      secretKey: hizliConfig.secretKey ? '••••••••' : '',
      // 2026-09-12: spread nedeniyle maskelenmeden sızan hash'ler kapatıldı.
      // Hash'ler SecretKey ile üretilir; açıkta bırakmak WS şifresine giden
      // yolu kısaltır. Frontend zaten yalnız "tanımlı mı" bilgisine ihtiyaç duyar.
      hashedUsername: hizliConfig.hashedUsername ? '••••••••' : '',
      hashedPassword: hizliConfig.hashedPassword ? '••••••••' : '',
    },
  });
});

// POST /api/efatura/hizli/encrypt - SecretKey ile Hash üret
router.post('/hizli/encrypt', requireRole('SUPER_ADMIN', 'platform_admin'), async (req: Request, res: Response) => {
  const { secretKey, username, password, isTest = true } = req.body;
  if (!secretKey || !username || !password) {
    return res.status(400).json({ success: false, message: 'SecretKey, kullanıcı adı ve şifre zorunludur.' });
  }
  // 2026-09-12: Canlı modda Login denemesi production endpoint'e gider.
  // QA onay fazı öncesi yalnız test moduna izin verilir (CLAUDE.md md.1).
  if (isTest === false && !isProductionSwitchAllowed()) {
    return res.status(403).json({
      success: false,
      message: 'Canlı (production) Hızlı Bilişim bağlantısı QA onay fazı öncesi kapalıdır. Test modunu kullanın.',
    });
  }

  try {
    const result: any = await HizliConnectService.utilEncrypt(secretKey, username, password, isTest);
    if (result.success && result.hashedUsername && result.hashedPassword) {
      hizliConfig.hashedUsername = result.hashedUsername;
      hizliConfig.hashedPassword = result.hashedPassword;
      hizliConfig.username = username;
      hizliConfig.isTestMode = isTest;
      // tokenStore'a da yaz (diğer route'lar kullansın)
      tokenStore.hashedUsername = result.hashedUsername;
      tokenStore.hashedPassword = result.hashedPassword;
      tokenStore.isTestMode = isTest;
      // 2026-09-12: hash'ler yanıtta DÖNMEZ (bkz. /hizli/config notu).
      return res.json({
        success: true,
        message: result.message,
        hashesObtained: true,
        isTestMode: isTest,
      });
    }
    res.status(400).json({ success: false, message: result.message });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/efatura/hizli/test-connection - Login & Token Al
router.post('/hizli/test-connection', requireRole('SUPER_ADMIN', 'platform_admin'), async (req: Request, res: Response) => {
  const {
    apiKey: apiKeyIstek,
    isTest: isTestIstek,
  } = req.body;

  // 2026-09-15: GET /hizli/config artık `apiKey`'i maskeli ('••••••••') döndürüyor.
  // Frontend bu maskeli değeri forma yükleyip geri gönderirse, gerçek anahtar
  // maskeyle EZİLİRDİ. Sentinel/boş değer "değiştirmedim" sayılır ve sunucudaki
  // mevcut değer korunur.
  const apiKey = (!apiKeyIstek || apiKeyIstek === '••••••••' || String(apiKeyIstek).trim() === '')
    ? hizliConfig.apiKey
    : String(apiKeyIstek);

  // 2026-09-12: Hash'ler istek gövdesinden ALINMAZ. Önceki kod
  // `hashedUsername`/`hashedPassword`'ı body'den kabul ediyordu; çağıran taraf
  // hash'leri bilmek/taşımak zorundaydı — hash'ler ise SecretKey ile üretilen
  // ve yanıtlarda sızdırılan değerlerdi. Doğru kaynak sunucu tarafıdır.
  const hashedUsername = tokenStore.hashedUsername || hizliConfig.hashedUsername;
  const hashedPassword = tokenStore.hashedPassword || hizliConfig.hashedPassword;

  // 2026-09-12: `isTest` gövdeden serbestçe kabul EDİLMEZ. Varsayılanı
  // sunucudaki güvenli moddur; gövdeden yalnızca `true` (test) yönünde
  // daraltma yapılabilir, `false` (canlı) yönünde GENİŞLETİLEMEZ.
  const isTest = (isTestIstek === true) ? true : hizliConfig.isTestMode;

  if (isTest === false && !isProductionSwitchAllowed()) {
    return res.status(403).json({
      success: false,
      message: 'Canlı (production) Hızlı Bilişim bağlantısı QA onay fazı öncesi kapalıdır. Test modunu kullanın.',
    });
  }

  try {
    // hashedUsername/Password yoksa tam init yap
    if (!hashedUsername || !hashedPassword) {
      const initResult = await HizliConnectService.autoInitialize();
      return res.json(initResult);
    }

    const result = await HizliConnectService.login(apiKey, hashedUsername, hashedPassword, isTest);
    if (result.success && result.token) {
      hizliConfig.apiKey = apiKey;
      hizliConfig.isTestMode = isTest;
      tokenStore.token = result.token;
      tokenStore.expireDate = result.expireDate || '';
      tokenStore.isTestMode = isTest;
    }
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/efatura/hizli/check-gib-user - GİB Mükellef Sorgula
router.post('/hizli/check-gib-user', async (req: Request, res: Response) => {
  const { vkn } = req.body;
  if (!vkn) {
    return res.status(400).json({ success: false, message: 'Sorgulanacak VKN/TCKN belirtilmelidir.' });
  }

  try {
    const result = await HizliConnectService.checkGibUser(vkn, hizliConfig.token, hizliConfig.isTestMode);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/efatura/hizli/credits - Kalan Kontör Bakiyesi
router.get('/hizli/credits', async (req: Request, res: Response) => {
  try {
    const result = await HizliConnectService.getCredits(hizliConfig.token, hizliConfig.isTestMode);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/efatura/hizli/token-status - Token Durumu
router.get('/hizli/token-status', (req: Request, res: Response) => {
  const hasToken = !!tokenStore.token;
  const expireDate = tokenStore.expireDate ? new Date(tokenStore.expireDate) : null;
  const isExpired = expireDate ? expireDate < new Date() : true;
  const remainingMs = expireDate ? Math.max(0, expireDate.getTime() - Date.now()) : 0;
  const remainingHours = Math.floor(remainingMs / (1000 * 60 * 60));

  res.json({
    success: true,
    hasToken,
    isExpired: hasToken ? isExpired : true,
    token: hasToken ? `${tokenStore.token.substring(0, 20)}...` : null,
    expireDate: tokenStore.expireDate || null,
    remainingHours: hasToken ? remainingHours : 0,
    isTestMode: tokenStore.isTestMode,
    lastInitAt: tokenStore.lastInitAt || null,
    apiUrl: HizliConnectService.getBaseUrl(tokenStore.isTestMode),
    message: hasToken
      ? (isExpired ? '⚠️ Token süresi dolmuş. Yenilenmelidir.' : `✅ Token aktif. ${remainingHours} saat kaldı.`)
      : '❌ Token mevcut değil. Bağlantı kurulması gerekiyor.',
  });
});

// POST /api/efatura/hizli/refresh-token - Token Yenile
router.post('/hizli/refresh-token', requireRole('SUPER_ADMIN', 'platform_admin'), async (req: Request, res: Response) => {
  try {
    const result = await HizliConnectService.refreshToken();
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/efatura/hizli/switch-mode - Test ↔ Canlı Mod Değiştir
router.post('/hizli/switch-mode', requireRole('SUPER_ADMIN', 'platform_admin'), async (req: Request, res: Response) => {
  const { isTestMode } = req.body;
  if (typeof isTestMode !== 'boolean') {
    return res.status(400).json({ success: false, message: 'isTestMode (boolean) zorunludur.' });
  }
  // 2026-09-12: Canlı moda geçiş fail-closed. Bu anahtar süreç geneli
  // (global) olduğu için tek bir çağrı TÜM kiracıların GİB trafiğini
  // production'a çevirir — QA onay fazı olmadan açılamaz.
  if (isTestMode === false && !isProductionSwitchAllowed()) {
    return res.status(403).json({
      success: false,
      message: 'Canlı (production) moda geçiş QA onay fazı öncesi kapalıdır. Test modu korunuyor.',
      isTestMode: true,
    });
  }
  try {
    hizliConfig.isTestMode = isTestMode;
    tokenStore.isTestMode = isTestMode;
    // Mod değiştiğinde yeniden init et
    const result = await HizliConnectService.autoInitialize();
    res.json({
      ...result,
      isTestMode,
      apiUrl: HizliConnectService.getBaseUrl(isTestMode),
      message: `${isTestMode ? '🧪 Test' : '🚀 Canlı'} moda geçildi. ${result.message}`,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/efatura/hizli/save-credentials - Kullanıcı adı/şifre kaydet + anlık şifrele + login
router.post('/hizli/save-credentials', requireRole('SUPER_ADMIN', 'platform_admin'), async (req: Request, res: Response) => {
  const { username, password, isTestMode = true } = req.body;
  if (!username || !password) {
    return res.status(400).json({ success: false, message: 'Kullanıcı adı ve şifre zorunludur.' });
  }
  // 2026-09-12: (a) varsayılan `false` idi — parametre gönderilmezse CANLI
  // moda geçiyordu; güvenli varsayılan artık `true` (test). (b) canlı geçiş
  // QA onay fazı öncesi kapalı.
  if (isTestMode === false && !isProductionSwitchAllowed()) {
    return res.status(403).json({
      success: false,
      message: 'Canlı (production) Hızlı Bilişim bağlantısı QA onay fazı öncesi kapalıdır. Test modunu kullanın.',
    });
  }
  try {
    const secretKey = process.env.HIZLI_BILISIM_SECRET_KEY || hizliConfig.secretKey;
    const apiKey = process.env.HIZLI_BILISIM_API_KEY || hizliConfig.apiKey;

    // Şifrele
    const encResult = await HizliConnectService.utilEncrypt(secretKey, username, password, isTestMode);
    if (!encResult.success || !encResult.hashedUsername || !encResult.hashedPassword) {
      return res.status(400).json({ success: false, message: `Şifreleme başarısız: ${encResult.message}` });
    }

    // tokenStore'a yaz
    tokenStore.hashedUsername = encResult.hashedUsername;
    tokenStore.hashedPassword = encResult.hashedPassword;
    tokenStore.isTestMode = isTestMode;
    hizliConfig.username = username;
    hizliConfig.isTestMode = isTestMode;

    // Login
    const loginResult = await HizliConnectService.login(apiKey, encResult.hashedUsername, encResult.hashedPassword, isTestMode);
    if (loginResult.success && loginResult.token) {
      tokenStore.token = loginResult.token;
      tokenStore.expireDate = loginResult.expireDate || '';
      tokenStore.lastInitAt = new Date().toISOString();
    }

    // 2026-09-12: (a) başarısızlıkta `success: false` döner (önceki kod
    // gövdede success alanı döndürüyordu ama hâlâ HTTP 200 veriyordu).
    // (b) hash yanıtta SIZMAZ.
    res.status(loginResult.success ? 200 : 400).json({
      success: loginResult.success,
      message: loginResult.success
        ? `Kimlik bilgileri kaydedildi ve ${isTestMode ? 'test' : 'canlı'} sisteme bağlantı kuruldu.`
        : `Şifreleme başarılı ancak login başarısız: ${loginResult.message}`,
      hashesObtained: true,
      tokenObtained: loginResult.success && !!loginResult.token,
      expireDate: tokenStore.expireDate,
      isTestMode,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/efatura/hizli/send-invoice - e-Connect ile GİB'e Fatura Gönder
//
// 2026-09-12: Bu uç KONTÖR TÜKETEN canlı belge gönderimidir ve önceden yalnız
// requireAuth ile korunuyordu; giriş yapmış her kullanıcı tetikleyebiliyordu.
// Üstelik gönderim süreç geneli `tokenStore`/`hizliConfig` ile yapıldığından,
// gönderen kiracının kimliğiyle değil, en son Login olan firmanın token'ıyla
// gidiyordu (kiracılar arası kimlik karışması). CLAUDE.md md.1 gereği canlı
// gönderim QA onay fazı öncesi kapalıdır; bu yüzden uç platform yöneticisine
// kısıtlandı.
//
// NOT (takip işi): Bu uç, kiracı bazlı token üreten `hizliTeknolojiProvider`
// (ensureTenantToken) üzerinden çalışacak şekilde taşınmalıdır. O zamana kadar
// gönderim yalnız platform yöneticisi tarafından yapılabilir.
router.post('/hizli/send-invoice', requireRole('SUPER_ADMIN', 'platform_admin'), async (req: Request, res: Response) => {
  const { invoiceId } = req.body;
  const db = storage.getState();
  const invoice = db.invoices.find(i => i.id === invoiceId);
  if (!invoice) {
    return res.status(404).json({ success: false, message: 'Fatura bulunamadı.' });
  }

  // ────────────────────────────────────────────────────────────────────
  // 2026-09-12 (kiracı izolasyonu — gönderim ÖNCESİ):
  // Önceki akışta sahiplik kontrolü YALNIZ `runTransaction` içinde, yani GİB'e
  // gönderim YAPILDIKTAN SONRA uygulanıyordu. Bu sırada:
  //   • entegratör ucu kontör tüketiyor,
  //   • kiracı B'nin belgesi GERÇEKTEN GİB'e iletiliyordu,
  //   • sonra 403 dönüp "gönderilmedi" deniyordu (yanlış — belge gönderilmişti).
  // Fail-closed kural gereği sahiplik, ağ çağrısından ÖNCE doğrulanır.
  // ────────────────────────────────────────────────────────────────────
  const requestTenantId = req.tenantId;
  if (!requestTenantId || invoice.tenantId !== requestTenantId) {
    storage.addAuditLog({
      userId: req.user?.id || 'bilinmeyen',
      username: req.user?.username || req.user?.name || 'bilinmeyen-kullanici',
      userRole: req.userRole || '',
      action: 'UPDATE',
      module: 'INVOICE',
      documentNo: invoice.invoiceNo,
      ipAddress: req.ip || '127.0.0.1',
      details: 'e-Connect gönderimi REDDEDİLDİ — fatura isteği yapan kiracıya ait değil (gönderim yapılmadı).',
    });
    return res.status(404).json({ success: false, message: 'Fatura bulunamadı.' });
  }

  const customer = db.customers.find(c => c.id === invoice.customerId);
  const company = db.company;

  try {
    const result = await HizliConnectService.sendInvoice(
      invoice,
      customer,
      company,
      hizliConfig,
      hizliConfig.token
    );

    // ────────────────────────────────────────────────────────────────────
    // 2026-09-12 (kritik dürüstlük düzeltmesi):
    // Önceki kod `result` başarılı mı diye BAKMADAN faturayı APPROVED yapıyor,
    // `[e-Connect GİB No: ... | ETTN: ...]` notunu yazıyor ve audit log'a
    // "GİB'e iletildi" düşüyordu. HizliConnectService.sendInvoiceModel() hata
    // durumunda `{ success: false, message }` döndürür (sahte başarı üretmez),
    // yani entegratör reddettiğinde İŞBEY faturayı **GİB'e gönderilmiş** gibi
    // işaretliyordu. Bu, muhasebe bütünlüğünü bozan bir yalandır: gönderilmemiş
    // belge kesinleşmiş sayılır. Artık hata yolu DB'ye HİÇBİR ŞEY yazmaz.
    // ────────────────────────────────────────────────────────────────────
    if (!result || result.success !== true) {
      storage.addAuditLog({
        userId: req.user?.id || 'bilinmeyen',
        username: req.user?.username || req.user?.name || 'bilinmeyen-kullanici',
        userRole: req.userRole || '',
        action: 'UPDATE',
        module: 'INVOICE',
        documentNo: invoice.invoiceNo,
        ipAddress: req.ip || '127.0.0.1',
        details: `e-Connect gönderimi BAŞARISIZ — fatura statüsü değiştirilmedi: ${result?.message || 'bilinmeyen hata'}`,
      });
      return res.status(502).json({
        success: false,
        message: result?.message || 'Entegratörden geçerli bir yanıt alınamadı; fatura gönderilmedi.',
        gibStatusCode: result?.gibStatusCode ?? null,
      });
    }

    // ────────────────────────────────────────────────────────────────────
    // 2026-09-12 (gerçek alan adları):
    // `HizliConnectService.sendInvoiceModel()` yanıtı `{ success, data, message }`
    // biçimindedir; belge kimliği `data` içindedir. Bu uç ise `result.uuid` /
    // `result.invoiceNumber` okuyordu — ikisi de `undefined` olduğu için audit
    // log'a ve fatura notuna "ETTN: undefined | GİB No: undefined" yazılıyordu.
    // Burada yanıt şekli TEK yerde normalize edilir; hiçbir alan UYDURULMAZ
    // (bulunamazsa boş kalır ve log'da "YOK" olarak raporlanır).
    // ────────────────────────────────────────────────────────────────────
    const sentData = result.data ?? {};
    const sentUuid: string = sentData.uuid || sentData.UUID || result.uuid || '';
    const sentInvoiceNumber: string =
      sentData.invoiceNumber || sentData.InvoiceNumber || sentData.ettn || result.invoiceNumber || '';

    // Sahiplik yukarıda (ağ çağrısından ÖNCE) doğrulandı; buradaki kontrol
    // yalnızca arada durum değişmişse diye ikinci savunma hattıdır (TOCTOU).
    let invoiceUpdated = false;

    await storage.runTransaction(draft => {
      const inv = draft.invoices.find(i => i.id === invoiceId);
      if (!inv) return;
      if (!requestTenantId || inv.tenantId !== requestTenantId) return;
      inv.status = 'APPROVED';
      // 2026-09-12: Fatura durumu APPROVED yapılıyordu ama e-Dönüşüm alanları
      // DRAFT/boş kalıyordu; gönderilmiş belge listede hâlâ "Taslak" görünüyordu.
      // Gönderim GERÇEKLEŞTİĞİ (result.success === true) için alanlar burada
      // gerçek yanıttan doldurulur — uydurma değer yazılmaz.
      inv.eInvoiceStatus = 'SENT';
      inv.eInvoiceUUID = sentUuid || inv.eInvoiceUUID || null;
      inv.notes = `${inv.notes || ''} [e-Connect GİB No: ${sentInvoiceNumber || 'YOK'} | ETTN: ${sentUuid || 'YOK'}]`;
      invoiceUpdated = true;
    });

    if (!invoiceUpdated) {
      // Buraya yalnızca kontrol ile işlem arasında fatura silinmiş/kiracısı
      // değişmişse düşülür (TOCTOU). GİB gönderimi bu noktaya gelindiğinde
      // ZATEN yapılmıştır — bu yüzden "gönderilmedi" DENMEZ; aksi hâlde
      // operatör belgeyi tekrar göndermeye çalışıp mükerrer belge üretir.
      return res.status(409).json({
        success: false,
        message: 'Belge entegratöre iletildi ancak yerel kayıt güncellenemedi (fatura bu kiracıda bulunamadı). Yinelenen gönderim yapmayın; kaydı kontrol edin.',
        uuid: sentUuid || null,
        invoiceNumber: sentInvoiceNumber || null,
      });
    }

    storage.addAuditLog({
      userId: req.user?.id || 'bilinmeyen',
      username: req.user?.username || req.user?.name || 'bilinmeyen-kullanici',
      userRole: req.userRole || '',
      action: 'UPDATE',
      module: 'INVOICE',
      documentNo: invoice.invoiceNo,
      ipAddress: req.ip || '127.0.0.1',
      details: `Fatura Hızlı Teknoloji e-Connect üzerinden GİB'e iletildi. (ETTN: ${sentUuid || 'YOK'} | Belge No: ${sentInvoiceNumber || 'YOK'})`,
    });

    // 2026-09-12: Önceden ham servis yanıtı (`{success, data, message}`) olduğu
    // gibi dönüyordu; frontend `uuid` beklediği için toast "ETTN: undefined"
    // gösteriyordu. Sözleşme burada açıkça kurulur — uydurma alan eklenmez,
    // entegratörün döndürdüğü değerler normalize edilerek verilir.
    return res.json({
      success: true,
      uuid: sentUuid || null,
      invoiceNumber: sentInvoiceNumber || null,
      message: result.message || 'Fatura entegratöre iletildi.',
      data: sentData,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/efatura/hizli/documents - Gelen / Giden Belge Listesi
router.get('/hizli/documents', async (req: Request, res: Response) => {
  try {
    const appType = Number(req.query.appType) || 1;
    const dateType = req.query.dateType as string;
    const startDate = req.query.startDate as string;
    const endDate = req.query.endDate as string;
    const isNew = req.query.isNew === 'true';

    const result = await HizliConnectService.getDocumentList({
      appType,
      dateType,
      startDate,
      endDate,
      isNew,
    }, hizliConfig.token, hizliConfig.isTestMode);

    res.json(result);
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/efatura/hizli/document-file - Belge Dosyası İndir / Görüntüle (PDF/HTML/XML)
router.get('/hizli/document-file', async (req: Request, res: Response) => {
  try {
    const appType = Number(req.query.appType) || 1;
    const uuid = req.query.uuid as string;
    const format = (req.query.format as 'PDF' | 'HTML' | 'XML') || 'PDF';

    const result = await HizliConnectService.getDocumentFile(
      appType,
      uuid,
      format,
      false,
      hizliConfig.token,
      hizliConfig.isTestMode
    );

    res.json(result);
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/efatura/hizli/application-response - Ticari Fatura Kabul / Red
router.post('/hizli/application-response', async (req: Request, res: Response) => {
  try {
    const { uuid, responseType, reason } = req.body;

    if (!uuid) {
      return res.status(400).json({ success: false, message: 'Yanıt gönderilecek belgenin UUID (ETTN) bilgisi belirtilmelidir.' });
    }
    if (responseType !== 'KABUL' && responseType !== 'RED') {
      return res.status(400).json({ success: false, message: 'responseType yalnız "KABUL" veya "RED" olabilir.' });
    }

    // Sözleşme (docs/41 §2.1) `Documents[]` içinde DocumentId ve DocumentDate
    // de ister. Kayıt yerelde varsa gerçek değerlerinden türetilir — uydurma yok.
    const db = storage.getState();
    const kayit = (db.invoices || []).find((i: any) => i.id === uuid || i.eInvoiceUUID === uuid);

    // 2026-09-16 (`docs/44`): `DocumentUUID` sözleşmede e-Belge UUID'sidir (ETTN).
    // Önceden istemciden gelen ham `uuid` (yani `inv.id`, iç kayıt kimliği)
    // doğrudan gövdeye yazılıyordu; entegratör belgeyi bu kimlikle BULAMAZ.
    // Artık gönderilen değer HER ZAMAN kaydın gerçek `eInvoiceUUID`'sidir.
    // İstemci id veya ETTN göndermiş olabilir; ikisi de çözümlenir, ama gövdeye
    // yalnız ETTN gider. ETTN yoksa istek REDDEDİLİR (uydurma/yanlış kimlik
    // göndermektense hiç göndermemek doğrudur).
    const documentUuid = typeof kayit?.eInvoiceUUID === 'string' ? kayit.eInvoiceUUID.trim() : '';

    if (!documentUuid) {
      return res.status(400).json({
        success: false,
        message: !kayit
          ? 'Belge yerel kayıtta bulunamadı; uygulama yanıtı gönderilemedi.'
          : 'Belgenin e-Belge UUID (ETTN) bilgisi yok. Uygulama yanıtı yalnız entegratöre iletilmiş belgeler için gönderilebilir.',
      });
    }

    const documentId = kayit?.invoiceNo || '';
    const documentDate = kayit?.date || '';

    if (!documentId || !documentDate) {
      // Eksik alanı boş göndermek yerine açıkça bildir — sessizce eksik gövde yollama.
      return res.status(400).json({
        success: false,
        message: 'Belgenin numarası ve tarihi yerel kayıtta bulunamadı; uygulama yanıtı gönderilemedi.',
      });
    }

    const result = await HizliConnectService.sendApplicationResponse(
      {
        documentUuid,
        responseCode: responseType,
        responseDescription: reason,
        documentId,
        documentDate,
      },
      hizliConfig.token,
      hizliConfig.isTestMode
    );
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/efatura/hizli/cancel-earsiv - e-Arşiv Fatura İptal
router.post('/hizli/cancel-earsiv', async (req: Request, res: Response) => {
  try {
    const { uuid, cancelReason } = req.body;
    if (!uuid) {
      return res.status(400).json({ success: false, message: 'İptal edilecek belge UUID (ETTN) belirtilmelidir.' });
    }
    const reason = cancelReason || 'Alıcı talebi üzerine iptal';
    const tenantId = (req as any).tenantId || 'tnt-isbey';
    const userId = (req as any).user?.id || 'sys';
    const username = (req as any).user?.fullName || (req as any).user?.username || 'Sistem';

    const db = storage.getState();
    const inv = (db.invoices || []).find(i => i.eInvoiceUUID === uuid && (!i.tenantId || i.tenantId === tenantId));

    if (inv) {
      await DocumentConversionService.cancelInvoice(inv.id, tenantId, reason, userId, username);
      return res.json({ success: true, message: 'e-Arşiv fatura başarıyla iptal edildi.' });
    }

    const result = await HizliConnectService.cancelEArsivInvoice(
      uuid,
      reason,
      hizliConfig.token,
      hizliConfig.isTestMode
    );
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// POST /api/efatura/hizli/send-despatch - e-İrsaliye Gönder
router.post('/hizli/send-despatch', async (req: Request, res: Response) => {
  try {
    const { payload } = req.body;
    const result = await HizliConnectService.sendDespatchAdvice(
      payload || [{}],
      hizliConfig.token,
      hizliConfig.isTestMode
    );
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/efatura/hizli/send-receipt - e-SMM Gönder
router.post('/hizli/send-receipt', async (req: Request, res: Response) => {
  try {
    const { payload } = req.body;
    const result = await HizliConnectService.sendReceipt(
      payload || [{}],
      hizliConfig.token,
      hizliConfig.isTestMode
    );
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/efatura/hizli/code-list - GİB Kod Listeleri (TEVKIFAT, ISTISNA, FATURATURU vb.)
router.get('/hizli/code-list', async (req: Request, res: Response) => {
  try {
    const type = (req.query.type as string) || 'FATURATURU';
    const result = await HizliConnectService.getCodeList(type, hizliConfig.token, hizliConfig.isTestMode);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/efatura/hizli/tcmb-rate - TCMB Kur Bilgisi
router.get('/hizli/tcmb-rate', async (req: Request, res: Response) => {
  try {
    const currency = (req.query.currency as string) || 'USD';
    const type = (req.query.type as 'SatisKur' | 'AlisKur') || 'SatisKur';
    const result = await HizliConnectService.tcmbKurGetir(currency, type, hizliConfig.token, hizliConfig.isTestMode);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/efatura/hizli/prefix-list - Seri No / Önek Listesi
router.get('/hizli/prefix-list', async (req: Request, res: Response) => {
  try {
    const type = Number(req.query.type) || 1;
    const result = await HizliConnectService.getPrefixCodeList(type, hizliConfig.token, hizliConfig.isTestMode);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/efatura/hizli/prefix-save - Seri No / Önek Kaydet
router.post('/hizli/prefix-save', async (req: Request, res: Response) => {
  try {
    const result = await HizliConnectService.savePrefixCode(req.body, hizliConfig.token, hizliConfig.isTestMode);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/efatura/hizli/xslt-list - Şablon Listesi
router.get('/hizli/xslt-list', async (req: Request, res: Response) => {
  try {
    const result = await HizliConnectService.getXsltList(hizliConfig.token, hizliConfig.isTestMode);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/efatura/hizli/import-xslt - Hızlı Bilişim'deki XSLT Fatura Tasarımlarını İçe Aktar
router.post('/hizli/import-xslt', async (req: Request, res: Response) => {
  try {
    const { serviceType = 'ALL', xsltCode = 'general' } = req.body;
    const axios = (await import('axios')).default;
    const fs = await import('fs');
    const path = await import('path');

    // Hızlı Bilişim Client üzerinden Token al
    const { HizliBilisimClient } = await import('../services/hizliBilisim/hizliBilisimClient');
    const auth = await HizliBilisimClient.getAuthToken();
    if (!auth.token) {
      return res.status(401).json({ success: false, message: auth.error || 'Hızlı Bilişim API oturumu açılamadı.' });
    }

    const config = HizliBilisimClient.getConfig();
    const headers = { Authorization: `Bearer ${auth.token}`, 'Content-Type': 'application/json' };
    const importedDesigns = [];

    const typesToImport = serviceType === 'ALL' 
      ? ['E_FATURA', 'E_ARSIV'] 
      : [serviceType];

    const templateDir = path.join(process.cwd(), 'data', 'templates');
    if (!fs.existsSync(templateDir)) {
      fs.mkdirSync(templateDir, { recursive: true });
    }

    for (const type of typesToImport) {
      try {
        const response = await axios.get(
          `${config.apiUrl}/HizliApi/RestApi/XsltContent?serviceType=${type}&xsltCode=${xsltCode}`,
          { headers, timeout: config.timeout }
        );

        if (response.data?.IsSucceeded && response.data?.XsltManuelContent) {
          const rawBase64 = response.data.XsltManuelContent;
          const xsltXml = Buffer.from(rawBase64, 'base64').toString('utf-8');
          const fileName = `hizli_${type.toLowerCase()}_${xsltCode}.xslt`;
          const filePath = path.join(templateDir, fileName);

          fs.writeFileSync(filePath, xsltXml, 'utf-8');

          const isEfatura = type === 'E_FATURA';
          const docType = isEfatura ? 'EFATURA' : 'EARSIV';
          const designName = `Hızlı Bilişim ${isEfatura ? 'e-Fatura' : 'e-Arşiv'} Standart Tasarım (${xsltCode})`;

          const formDesign = {
            id: `fd-hizli-${type.toLowerCase()}-${xsltCode}`,
            name: designName,
            documentType: docType,
            description: `Hızlı Bilişim portalından içe aktarılan resmi ${type} XSLT şablonu (${xsltCode}).`,
            version: 1,
            isDefault: true,
            isBuiltIn: false,
            paperSize: 'A4',
            orientation: 'portrait',
            marginTop: 10,
            marginBottom: 10,
            marginLeft: 10,
            marginRight: 10,
            sections: [],
            metadata: {
              source: 'HIZLI_BILISIM',
              serviceType: type,
              xsltCode: xsltCode,
              xsltFile: fileName,
              importedAt: new Date().toISOString(),
              contentLength: xsltXml.length,
            },
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            createdBy: 'hizli_entegrasyon',
          };

          await storage.runTransaction(draft => {
            if (!draft.formDesigns) draft.formDesigns = [];
            const existingIdx = draft.formDesigns.findIndex(d => d.id === formDesign.id);
            if (existingIdx >= 0) {
              draft.formDesigns[existingIdx] = { ...draft.formDesigns[existingIdx], ...formDesign } as any;
            } else {
              draft.formDesigns.push(formDesign as any);
            }
          });

          importedDesigns.push({
            type,
            xsltCode,
            name: designName,
            size: xsltXml.length,
            file: fileName,
          });
        }
      } catch (itemErr: any) {
        console.warn(`[IMPORT_XSLT] ${type} hatası:`, itemErr.message);
      }
    }

    return res.json({ success: true, importedDesigns });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/efatura/hizli/create-model-invoice - Hızlı Bilişim Uyumlu Fatura Kaydet
//
// 2026-09-12: Uç adı "...Kaydet / Gönder" idi ve `sendToGib: true` kabul ediyordu
// ama HİÇBİR gönderim yapmıyordu — buna rağmen faturayı APPROVED + SENT yapıp
// "GİB kuyruğuna alındı" diyordu. Bu yanıltıcı parametre kaldırıldı; uç artık
// yalnız TASLAK kaydeder. Gönderim için ayrı uç (`/hizli/send-invoice` veya
// `/batch-send`) kullanılmalıdır. Uydurma ETTN üretimi de kaldırıldı.
router.post('/hizli/create-model-invoice', async (req: Request, res: Response) => {
  try {
    const { model, isDraft = true } = req.body;
    if (!model || !model.invoiceheader || !model.customer) {
      return res.status(400).json({ success: false, message: 'Fatura modeli veya başlık/müşteri bilgisi eksik.' });
    }

    const header = model.invoiceheader;
    const cust = model.customer;
    const lines = model.invoiceLines || [];
    const db = storage.getState();

    // Find or create customer — YALNIZ isteği yapan kiracının carileri içinde.
    // 2026-09-12: önceki sorgu tüm kiracıların customers dizisinde geziyordu;
    // aynı VKN'ye sahip başka kiracının carisi eşleşip bu faturaya
    // bağlanabiliyordu (kiracılar arası veri karışması).
    const requestTenantId = req.tenantId;

    let matchedCustomer = db.customers.find(
      c => (!requestTenantId || c.tenantId === requestTenantId) &&
           ((cust.IdentificationID && c.taxNumber === cust.IdentificationID) ||
            (c.title && c.title.toLowerCase() === cust.PartyName?.toLowerCase()))
    );

    const invoiceDate = header.IssueDate && header.IssueDate.includes('.')
      ? header.IssueDate.split('.').reverse().join('-')
      : header.IssueDate || new Date().toISOString().split('T')[0];

    const invoiceId = `inv-hizli-${Date.now()}`;
    // 2026-09-12: Fatura numarası `Math.random()` ile üretiliyordu — çakışma
    // riski taşır ve muhasebede numara boşluğu/tekrarı yaratır. Projenin geri
    // kalanı `storage.getNextSequence()` kullanır; burada da aynısı kullanılır.
    const invoiceNo = header.Invoice_ID && header.Invoice_ID !== 'Otomatik'
      ? header.Invoice_ID
      : storage.getNextSequence('SALES_INVOICE');

    // ────────────────────────────────────────────────────────────────────
    // 2026-09-12 (uydurma veri temizliği):
    // (a) `header.UUID` yokken ETTN sahte bir kalıp ile UYDURULUYORDU.
    //     ETTN GİB'in belge kimliğidir; tahmin edilebilir sahte bir değer yazmak
    //     "belge GİB'e ulaştı" izlenimi üretir. Artık yoksa null kalır. (notNull
    //     kısıtına uymak için pratikte otomatik faturada üretilir, ama uydurma
    //     değer DEĞİL, açıkça yokluk olarak işaretlenir.)
    // (b) `sendToGib=true` geldiğinde GERÇEK gönderim yapılmadan fatura
    //     APPROVED + eInvoiceStatus='SENT' işaretleniyor ve "GİB kuyruğuna
    //     alındı" deniyordu. Gönderim yapılmıyorsa durum 'DRAFT'/'WAITING' kalır.
    // ────────────────────────────────────────────────────────────────────
    const hamUuid = typeof header.UUID === 'string' && header.UUID.trim() ? header.UUID.trim() : null;
    // Gelen UUID gerçek bir GİB ETTN'si biçiminde mi? Değilse ETTN olarak
    // KABUL EDİLMEZ (serbest metni ETTN diye kaydetmek de yanlış olurdu).
    const isRealGibUuid = Boolean(hamUuid && hamUuid.toLowerCase().startsWith('urn:uuid:') && hamUuid.length > 20);
    const realUuid = isRealGibUuid ? hamUuid : null;
    const gibActuallySent = false; // Bu uç GERÇEK gönderim yapmaz — yalnız kayıt oluşturur.

    const processedItems = lines.map((l: any, idx: number) => {
      const kdvTax = (l.lineTaxes || []).find((t: any) => t.Tax_Code === '0015') || { Tax_Perc: 20, Tax_Amnt: 0 };
      const rawPrice = Number(l.Price_Amount) || 0;
      const qty = Number(l.Quantity_Amount) || 1;
      const disc = Number(l.Allowance_Amount) || 0;
      const total = Number(l.Price_Total) || (qty * rawPrice - disc);

      return {
        id: `item-${Date.now()}-${idx}`,
        productId: l.Item_ID_Seller || `prd-temp-${idx}`,
        productCode: l.Item_ID_Seller || `HB-${idx + 1}`,
        productName: l.Item_Name || '',
        quantity: qty,
        unit: l.Quantity_Unit_User || 'C62',
        unitPrice: rawPrice,
        vatRate: kdvTax.Tax_Perc || 20,
        vatAmount: kdvTax.Tax_Amnt || 0,
        discountRate: Number(l.Allowance_Percent) || 0,
        discountAmount: disc,
        lineTotal: total,
      };
    });

    const newInvoice: any = {
      id: invoiceId,
      tenantId: requestTenantId,
      invoiceNo: invoiceNo,
      type: 'SALES',
      customerId: matchedCustomer ? matchedCustomer.id : null,
      customerTitle: cust.PartyName || `${cust.Person_FirstName || ''} ${cust.Person_FamilyName || ''}`.trim() || '',
      customerCode: cust.IdentificationID || '',
      date: invoiceDate,
      maturityDate: invoiceDate,
      items: processedItems,
      subTotal: Number(header.LineExtensionAmount) || 0,
      totalDiscount: Number(header.AllowanceTotalAmount) || 0,
      totalVat: ((header.TaxInclusiveAmount || 0) - (header.LineExtensionAmount || 0) + (header.AllowanceTotalAmount || 0)),
      grandTotal: Number(header.PayableAmount) || Number(header.TaxInclusiveAmount) || 0,
      paidAmount: 0,
      remainingAmount: Number(header.PayableAmount) || Number(header.TaxInclusiveAmount) || 0,
      paymentStatus: 'UNPAID',
      // Gönderim bu uçta YAPILMAZ; bu yüzden APPROVED/SENT YAZILMAZ.
      status: 'DRAFT',
      eInvoiceStatus: gibActuallySent ? 'SENT' : (isDraft ? 'DRAFT' : 'WAITING'),
      eInvoiceUUID: realUuid,
      notes: header.Note || `Hızlı Bilişim ${header.ProfileID} - ${header.InvoiceTypeCode}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      hizliModel: model,
    };

    await storage.runTransaction(draft => {
      draft.invoices.unshift(newInvoice);

      // Cari bakiye güncelleme
      if (matchedCustomer) {
        const c = draft.customers.find(item => item.id === matchedCustomer!.id);
        if (c) {
          c.balance = (c.balance || 0) + newInvoice.grandTotal;
        }
      }
    });

    storage.addAuditLog({
      userId: req.user?.id || 'bilinmeyen',
      username: req.user?.username || req.user?.name || 'bilinmeyen-kullanici',
      userRole: req.userRole || '',
      action: 'CREATE',
      module: 'INVOICE',
      documentNo: invoiceNo,
      ipAddress: req.ip || '127.0.0.1',
      details: `Hızlı Bilişim uyumlu ${header.ProfileID} fatura TASLAK olarak kaydedildi. (ETTN: ${realUuid || 'YOK'})`,
    });

    // 2026-09-12: "GİB kuyruğuna alındı" mesajı YALNIZ gerçek gönderim
    // yapıldıysa doğrudur; bu uç gönderim yapmaz. Kullanıcıya açıkça söylenir.
    return res.json({
      success: true,
      message: 'Fatura taslak olarak kaydedildi. GİB\'e gönderim için ayrı gönderim adımı gerekir.',
      gibSent: gibActuallySent,
      invoice: newInvoice,
      invoiceNo,
      ettn: realUuid,
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ──────────────────────────────────────────────────────────────────────────
// YENİ SWAGGER ENDPOINT'LERİ
// ──────────────────────────────────────────────────────────────────────────

// GET /api/efatura/hizli/cari-list - Cari Listesi
router.get('/hizli/cari-list', async (req: Request, res: Response) => {
  try {
    const result = await HizliConnectService.cariList(hizliConfig.token, hizliConfig.isTestMode);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/efatura/hizli/cari/:vkn - Cari Detay (VKN ile)
router.get('/hizli/cari/:vkn', async (req: Request, res: Response) => {
  try {
    const result = await HizliConnectService.cariGetById(String(req.params.vkn), hizliConfig.token, hizliConfig.isTestMode);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/efatura/hizli/stock-list - Stok Listesi
router.get('/hizli/stock-list', async (req: Request, res: Response) => {
  try {
    const result = await HizliConnectService.stockList(hizliConfig.token, hizliConfig.isTestMode);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/efatura/hizli/stock-save - Stok Kaydet
router.post('/hizli/stock-save', async (req: Request, res: Response) => {
  try {
    const result = await HizliConnectService.stockSave(req.body, hizliConfig.token, hizliConfig.isTestMode);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/efatura/hizli/stock-delete - Stok Sil
router.post('/hizli/stock-delete', async (req: Request, res: Response) => {
  const { stokId } = req.body;
  if (!stokId) return res.status(400).json({ success: false, message: 'stokId zorunludur.' });
  try {
    const result = await HizliConnectService.stokDelete(Number(stokId), hizliConfig.token, hizliConfig.isTestMode);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/efatura/hizli/dashboard-info - Hızlı Bilişim Dashboard Bilgisi
router.get('/hizli/dashboard-info', async (req: Request, res: Response) => {
  const { identifier } = req.query;
  try {
    const result = await HizliConnectService.getDashboardInfo(
      String(identifier || hizliConfig.senderIdentifier),
      hizliConfig.token,
      hizliConfig.isTestMode
    );
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/efatura/hizli/send-email - E-posta Gönder
router.post('/hizli/send-email', async (req: Request, res: Response) => {
  const { appType = 1, uuid, emailList, subject } = req.body;
  if (!uuid || !emailList?.length) {
    return res.status(400).json({ success: false, message: 'uuid ve emailList zorunludur.' });
  }
  try {
    const result = await HizliConnectService.setEmailSend(
      { appType, uuid, emailList, subject },
      hizliConfig.token,
      hizliConfig.isTestMode
    );
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/efatura/hizli/resend-email - E-posta Yeniden Gönder
router.post('/hizli/resend-email', async (req: Request, res: Response) => {
  const { appType = 1, uuid } = req.body;
  if (!uuid) return res.status(400).json({ success: false, message: 'uuid zorunludur.' });
  try {
    const result = await HizliConnectService.reSendMail({ appType, uuid }, hizliConfig.token, hizliConfig.isTestMode);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/efatura/hizli/document-viewer - Belge Görüntüleyici
router.get('/hizli/document-viewer', async (req: Request, res: Response) => {
  const { appType, vknTckn, documentNo, payableAmount } = req.query;
  if (!vknTckn || !documentNo || !payableAmount) {
    return res.status(400).json({ success: false, message: 'vknTckn, documentNo ve payableAmount zorunludur.' });
  }
  try {
    const result = await HizliConnectService.getDocumentViewer(
      { appType: Number(appType || 1), vknTckn: String(vknTckn), documentNo: String(documentNo), payableAmount: Number(payableAmount) },
      hizliConfig.token,
      hizliConfig.isTestMode
    );
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/efatura/hizli/incoming-all - Gelen Tüm Belgeler
router.get('/hizli/incoming-all', async (req: Request, res: Response) => {
  const { dateType, startDate, endDate } = req.query;
  try {
    const result = await HizliConnectService.getDocumentReceiverAllList({
      dateType: String(dateType || 'CreateDate'),
      startDate: String(startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()),
      endDate: String(endDate || new Date().toISOString()),
    }, hizliConfig.token, hizliConfig.isTestMode);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/efatura/hizli/document-flag - Belge Bayrağı Güncelle
router.post('/hizli/document-flag', async (req: Request, res: Response) => {
  const { appType = 1, uuid, flagName, flagValue } = req.body;
  if (!uuid || !flagName || flagValue === undefined) {
    return res.status(400).json({ success: false, message: 'uuid, flagName ve flagValue zorunludur.' });
  }
  try {
    const result = await HizliConnectService.setDocumentFlag(
      Number(appType), uuid, flagName, Number(flagValue),
      hizliConfig.token, hizliConfig.isTestMode
    );
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/efatura/hizli/kontor-hareketleri - Kontör Hareketleri
router.get('/hizli/kontor-hareketleri', async (req: Request, res: Response) => {
  const { vkn } = req.query;
  try {
    const result = vkn
      ? await HizliConnectService.kontorHareketleriVknTckn(String(vkn), hizliConfig.token, hizliConfig.isTestMode)
      : await HizliConnectService.kontorHareketleri(hizliConfig.token, hizliConfig.isTestMode);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/efatura/hizli/validate-xml - XML Doğrulama
router.post('/hizli/validate-xml', async (req: Request, res: Response) => {
  const { xmlContent, appType = 1 } = req.body;
  if (!xmlContent) return res.status(400).json({ success: false, message: 'xmlContent zorunludur.' });
  try {
    const result = await HizliConnectService.controlDocumentXML(xmlContent, Number(appType), hizliConfig.token, hizliConfig.isTestMode);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/efatura/hizli/last-invoice-id - Son Fatura Numarası
router.get('/hizli/last-invoice-id', async (req: Request, res: Response) => {
  const { appType = 1, seri = 'GIB' } = req.query;
  try {
    const result = await HizliConnectService.getLastInvoiceIdAndDate(
      Number(appType), String(seri), hizliConfig.token, hizliConfig.isTestMode
    );
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/efatura/hizli/musteri-aktif-pasif - Müşteri Aktif/Pasif Yap
router.post('/hizli/musteri-aktif-pasif', async (req: Request, res: Response) => {
  const { vknTckn, isActive } = req.body;
  if (!vknTckn || typeof isActive !== 'boolean') {
    return res.status(400).json({ success: false, message: 'vknTckn ve isActive (boolean) zorunludur.' });
  }
  try {
    const result = await HizliConnectService.musteriAktifPasif(vknTckn, isActive, hizliConfig.token, hizliConfig.isTestMode);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

export default router;
