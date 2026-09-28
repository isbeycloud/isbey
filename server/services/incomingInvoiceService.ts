import { storage } from '../db/storage';
import {
  IncomingInvoice,
  IncomingInvoiceItem,
  Invoice,
  Customer,
  Product,
  Tenant,
} from '../db/schema';
import { ProviderFactory } from './providers/providerFactory';
import { DocumentStorageService } from './documentStorageService';
import { DocumentConversionService } from './documentConversionService';
import { parseUblDocument } from './ubl/ublParser';
import {
  buildIngestionPlan,
  draftProductFromLine,
  draftSupplierFromDocument,
  type IngestionPlan,
} from './ubl/incomingDocumentMapper';

/**
 * GELEN e-BELGE SERVİSİ
 * ═══════════════════════════════════════════════════════════════════════════
 * 2026-09-28 — Yeniden yazıldı. Önceki hâlde:
 *
 *   • Belge içeriği HİÇ okunmuyordu; entegratörün liste ucundan gelen birkaç
 *     meta alan alınıyor, XML ise diske boş/eksik yazılıyordu.
 *   • Kalemler UYDURULUYORDU: adı "Gelen Mal / Hizmet Kalemi", miktarı 1,
 *     KDV'si sabit %20. Yani 10 kalemli, %1/%10 KDV'li bir faturanın içeriği
 *     tamamen kayboluyordu.
 *   • Dönüşümde rastgele bir ürün seçiliyor ("ilk bulunan ürün") ve tüm fatura
 *     TEK satır, sabit %20 KDV ile alış olarak yazılıyordu.
 *
 * YENİ AKIŞ — ÜÇ AŞAMA, ARADA KULLANICI ONAYI:
 *   1. `syncIncomingInvoices`  → içeriği indirir, ÇÖZÜMLER, gerçek kalemleri
 *      `RECEIVED` durumunda SAKLAR. **Stok ve cariye DOKUNMAZ.**
 *   2. `getIngestionPlan`      → öneri listesi üretir (tedarikçi/ürün eşleşmesi).
 *      Hiçbir şey yazmaz; onay ekranı bunu gösterir.
 *   3. `approveAndConvert`     → kullanıcı kararlarıyla ALIŞ FATURASI keser.
 *      Stok girişi ve tedarikçi borcu **yalnız burada**, tek bir çağrıda
 *      (`DocumentConversionService.createInvoice`) oluşur.
 *
 * KURAL: Eksik/bozuk belge ASLA uydurulmaz. İçerik okunamıyorsa kayıt
 * `UNREADABLE` olur ve içeri aktarma engellenir.
 */
export class IncomingInvoiceService {
  /**
   * 1. Gelen e-Faturaları Entegratörden Çeker, İçeriğini Çözümler ve Saklar.
   *
   * ⚠️ YAN ETKİ SINIRI: Yalnız `db.incomingInvoices` yazılır. Cari, stok ve
   * finansal hareketlere DOKUNULMAZ — onlar onaydan sonra oluşur.
   */
  public static async syncIncomingInvoices(
    tenantId: string,
    startDate?: string
  ): Promise<{ syncedCount: number; duplicateCount: number; unreadableCount: number }> {
    const { provider, settings } = ProviderFactory.getProviderForTenant(tenantId);
    const fromDate = startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    const tumListe = await provider.getIncomingInvoices(fromDate, settings);

    // ⚠️ Gelen kutusu e-Fatura ve e-İrsaliye'yi BİRLİKTE döndürür. İrsaliye bu
    // akışın konusu DEĞİLDİR: içeri aktarılırsa alış faturası kesilir ve cari
    // borç doğar; oysa irsaliye mali belge değildir (bkz. `incomingDespatchService`).
    // 2026-09-28'de bu filtre EKSİKTİ ve bir e-İrsaliye fatura senkronuyla
    // içeri alınabiliyordu — test bunu yakaladı.
    const incomingList = tumListe.filter(i => i.documentKind !== 'DESPATCH' && i.appType !== 3);

    // ── AŞAMA 1: İçerik indirme + çözümleme — YAZMA YOK ────────────────────
    // Ağ ve disk işleri transaction DIŞINDA yapılır; transaction'ı ağ
    // gecikmesi boyunca açık tutmak yazma kilidini gereksiz meşgul ederdi.
    const hazir: Array<{
      meta: any;
      xmlPath?: string;
      doc?: ReturnType<typeof parseUblDocument>;
      parseErrors: string[];
      items: IncomingInvoiceItem[];
    }> = [];

    for (const item of incomingList) {
      const appType = item.appType ?? (item.documentKind === 'DESPATCH' ? 3 : 1);

      // Liste ucu yalnız meta veri verir. İçerik alınamazsa belge SAKLANIR
      // ama `UNREADABLE` işaretlenir: kullanıcı "içeriği okunamayan belge"
      // olarak görür, uydurma satırlarla "okunmuş" gibi görünmez.
      let xmlContent = item.xmlContent || '';
      if (!xmlContent.trim()) {
        const indirilen = await provider.getIncomingDocumentContent(item.uuid, appType, settings);
        if (indirilen.success) xmlContent = indirilen.content;
      }

      let xmlPath: string | undefined;
      if (xmlContent.trim()) {
        xmlPath = DocumentStorageService.saveXml(tenantId, 'incoming_invoice', item.uuid, xmlContent);
      }

      const doc = xmlContent.trim() ? parseUblDocument(xmlContent) : undefined;

      // Çözümleme başarısızsa `errors`, kalem hiç yoksa da hata üretilir.
      const parseErrors: string[] = doc
        ? [...doc.errors]
        : ['Belge içeriği entegratörden alınamadı; fatura kalemleri okunamadı.'];

      const items: IncomingInvoiceItem[] = doc
        ? doc.lines.map((l, i) => ({
            id: `inci-${item.uuid}-${i + 1}`,
            incomingInvoiceId: item.uuid,
            ...(l.sellerProductCode ? { supplierProductCode: l.sellerProductCode } : {}),
            name: l.name,
            ...(l.barcode ? { barcode: l.barcode } : {}),
            quantity: l.quantity,
            unit: l.unitName,
            unitPrice: l.unitPrice,
            vatRate: l.vatRate,
            vatAmount: l.vatAmount,
            lineTotal: l.lineTotal,
          }))
        : [];

      hazir.push({ meta: item, ...(xmlPath ? { xmlPath } : {}), ...(doc ? { doc } : {}), parseErrors, items });
    }

    // ── AŞAMA 2: Kayıt — TEK TRANSACTION (atomik) ──────────────────────────
    //
    // ⚠️ NEDEN TRANSACTION: 2026-09-28'de şu hata gerçekten yaşandı ve ölçüldü.
    // Bu döngü transaction DIŞINDA çalışırken `storage.getNextSequence()` veya
    // `storage.addAuditLog()` çağrılırsa, `storage.update()` `this.db`'yi YENİ
    // BİR KLONLA değiştirir. Elimizdeki `db` referansı artık deposuzun canlı
    // nesnesi DEĞİLDİR; o referansa yapılan itme (push) işlemleri depo
    // tarafından hiç görülmez ve `storage.save()` bayat veriyi yazar. Sonuç:
    // senkron "1 belge alındı" der ama belge diske HİÇ yazılmaz.
    //
    // Transaction içinde `getState()` draft'ı döndürür ve `update()` doğrudan
    // draft'a işler; `this.db` yerinden oynamaz. Atomiklik de cabası: kaydın
    // yarısı yazılıp yarısı yazılmaz durumu oluşamaz.
    return storage.runTransaction(draft => {
      if (!draft.incomingInvoices) draft.incomingInvoices = [];
      const now = new Date().toISOString();
      let syncedCount = 0;
      let duplicateCount = 0;
      let unreadableCount = 0;

      for (const h of hazir) {
        const item = h.meta;
        const exists = draft.incomingInvoices.some(
          inv => inv.uuid === item.uuid && (inv.tenantId === tenantId || (tenantId === 'tnt-isbey' && !inv.tenantId))
        );
        if (exists) {
          duplicateCount++;
          continue;
        }

        const status = h.parseErrors.length > 0 ? 'UNREADABLE' : 'RECEIVED';

        const newIncoming: IncomingInvoice = {
          id: `inc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          tenantId,
          uuid: item.uuid,
          // Belge okunabildiyse ÇÖZÜMLENEN değerler meta veriye tercih edilir:
          // entegratörün özeti ile belgenin kendi içeriği çelişebilir ve
          // muhasebeye giren, belgenin kendisidir.
          invoiceNo: h.doc?.documentNo || item.invoiceNo || '',
          supplierTaxNumber: h.doc?.supplier.taxNumber || item.supplierVkn || '',
          supplierTitle: h.doc?.supplier.title || item.supplierTitle || '',
          issueDate: h.doc?.issueDate || item.issueDate || '',
          subTotal: h.doc ? h.doc.subTotal : item.subTotal,
          vatAmount: h.doc ? h.doc.vatTotal : item.vatAmount,
          grandTotal: h.doc ? h.doc.grandTotal : item.grandTotal,
          currency: h.doc?.currency || item.currency || 'TRY',
          status,
          ...(h.xmlPath ? { xmlStoragePath: h.xmlPath } : {}),
          items: h.items,
          ...(h.doc?.declaredSubTotal !== undefined ? { declaredSubTotal: h.doc.declaredSubTotal } : {}),
          ...(h.doc?.declaredVatTotal !== undefined ? { declaredVatTotal: h.doc.declaredVatTotal } : {}),
          ...(h.doc?.declaredPayable !== undefined ? { declaredPayable: h.doc.declaredPayable } : {}),
          ...(h.parseErrors.length ? { parseErrors: h.parseErrors } : {}),
          ...(h.doc && h.doc.warnings.length ? { parseWarnings: h.doc.warnings } : {}),
          documentKind: h.doc?.kind || item.documentKind || 'INVOICE',
          receivedAt: now,
          createdAt: now,
          updatedAt: now,
        };

        draft.incomingInvoices.push(newIncoming);
        syncedCount++;
        if (h.parseErrors.length > 0) unreadableCount++;
      }

      return { syncedCount, duplicateCount, unreadableCount };
    });
  }

  /** Tenant'a ait gelen fatura kaydını bulur (ID veya ETTN ile). */
  private static findIncoming(idOrUuid: string, tenantId: string): IncomingInvoice | undefined {
    const db = storage.getState();
    return (db.incomingInvoices || []).find(
      i =>
        (i.id === idOrUuid || i.uuid === idOrUuid) &&
        (i.tenantId === tenantId || (tenantId === 'tnt-isbey' && !i.tenantId))
    );
  }

  /**
   * 2. Onay Ekranı İçin Eşleştirme Planı
   *
   * Yazma YAPMAZ. Kayıtlı belgeyi diskten yeniden okuyup güncel stok/cari
   * listesine göre öneri üretir — böylece kullanıcı onay ekranını açtığında
   * "senkron anındaki" değil, ŞU ANKİ kartlarla eşleşme görür.
   */
  public static getIngestionPlan(incomingInvoiceId: string, tenantId: string): IngestionPlan {
    const db = storage.getState();
    const inc = this.findIncoming(incomingInvoiceId, tenantId);
    if (!inc) throw new Error('Gelen fatura kaydı bulunamadı.');

    const xml = inc.xmlStoragePath ? DocumentStorageService.readXml(tenantId, inc.xmlStoragePath) : null;
    if (!xml) {
      throw new Error(
        'Belge içeriği diskte bulunamadı; eşleştirme yapılamaz. Belgeyi yeniden senkronize edin.'
      );
    }

    const doc = parseUblDocument(xml);
    return buildIngestionPlan(doc, {
      customers: db.customers || [],
      products: db.products || [],
      tenantId,
    });
  }

  /**
   * 3. Onaylı Dönüşüm — Gelen Belgeyi Alış Faturasına Çevirir.
   *
   * ⚠️ STOK VE CARİ YALNIZ BURADA HAREKET EDER.
   *
   * Kullanıcı kararları `decisions` ile gelir; verilmeyen kararlar için
   * otomatik eşleşme kullanılır. Hiçbir karar yoksa ve eşleşme de yoksa
   * işlem HATA İLE durur — eski davranıştaki "ilk bulunan ürünü kullan"
   * yaklaşımı yanlış ürüne stok ve maliyet yazardı.
   */
  public static async approveAndConvert(
    incomingInvoiceId: string,
    tenantId: string,
    userId: string,
    username: string = 'Sistem',
    decisions?: {
      supplierId?: string;
      createSupplier?: boolean;
      lines?: Array<{ lineNo: string; productId?: string; createProduct?: boolean }>;
    }
  ): Promise<Invoice> {
    // ⚠️ TEK TRANSACTION — BURADA TUTULMASI ZORUNLU.
    //
    // 2026-09-28'de bu metot transaction DIŞINDA çalışırken ÖLÇÜLEN hata:
    // `storage.getNextSequence()` ve `storage.addAuditLog()` içeride
    // `storage.update()` çağırır; o da `this.db`'yi YENİ BİR KLONLA değiştirir.
    // Metodun başında alınan `const db = storage.getState()` referansı artık
    // canlı depo nesnesi DEĞİLDİR; ardından `db.customers.push(...)` ile eklenen
    // tedarikçi ve ürün kartları KAYBOLUR. Ölçülen sonuç: ürün kartı canlı
    // nesnede olmadığı için `createInvoice` "Cari hesap bulunamadı" diye
    // patlıyordu; patlamadığı durumda ise alış faturası, stok hareketleri ve
    // cari hareket DİSKE HİÇ YAZILMIYORDU.
    //
    // Transaction içinde `getState()` draft'ı döndürür ve `update()` doğrudan
    // draft'a işler; `this.db` yerinden oynamaz. Yan fayda: tedarikçi kartı,
    // ürün kartları, alış faturası, stok hareketleri ve cari hareket AYNI atomik
    // yazımda oluşur — yarısı yazılmış bir dönüşüm kalamaz.
    return storage.runTransaction(async draft => {
      // Kayıt ve doğrulamalar da TRANSACTION İÇİNDE yapılır: `findIncoming`
      // `storage.getState()` kullanır ve burada DRAFT'ı döndürür. Kaydı dışarıda
      // alsaydık, `inc.status = ...` satırı draft tarafından ezilecek `this.db`
      // nesnesini günceller ve dönüşüm durumu diske hiç yansımazdı. (Aynı sınıf
      // hata, aynı gün ölçüldü.)
      const inc = this.findIncoming(incomingInvoiceId, tenantId);
      if (!inc) throw new Error('Gelen fatura kaydı bulunamadı.');
      if (inc.status === 'CONVERTED_TO_PURCHASE') {
        throw new Error('Bu belge zaten alış faturasına dönüştürülmüş.');
      }

      const plan = this.getIngestionPlan(incomingInvoiceId, tenantId);
      if (plan.blockedReason) {
        throw new Error(`Belge içeri aktarılamaz: ${plan.blockedReason}`);
      }

      const tenant = (draft.tenants || []).find(t => t.id === tenantId);
      if (!tenant) throw new Error('Firma kaydı bulunamadı.');

      // ── Tedarikçi (cari) ─────────────────────────────────────────────────
      let supplier: Customer | undefined;
      if (decisions?.supplierId) {
        supplier = (draft.customers || []).find(c => c.id === decisions.supplierId);
        if (!supplier) throw new Error('Seçilen tedarikçi kartı bulunamadı.');
      } else if (plan.party.customer && !decisions?.createSupplier) {
        supplier = plan.party.customer;
      }
      if (!supplier) {
        // Yeni cari kartı açılır — ama YALNIZ kullanıcı onayıyla.
        const taslak = draftSupplierFromDocument(plan.document, tenant);
        const seq = storage.getNextSequence('CUSTOMER_SUPPLIER');
        supplier = {
          id: `cust-sup-${Date.now()}`,
          tenantId,
          code: seq || `320.${String((draft.customers?.length || 0) + 1).padStart(5, '0')}`,
          title: taslak.title || 'Tedarikçi',
          taxNumber: taslak.taxNumber || '',
          taxOffice: taslak.taxOffice || '',
          city: taslak.city || '',
          district: taslak.district || '',
          type: 'SUPPLIER',
          currency: taslak.currency || 'TRY',
          balance: 0,
          totalDebit: 0,
          totalCredit: 0,
          active: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        } as Customer;
        if (!draft.customers) draft.customers = [];
        draft.customers.push(supplier);
      }

      // ── Kalemler → Alış faturası satırları ───────────────────────────────
      const kararlar = new Map((decisions?.lines || []).map(l => [l.lineNo, l]));
      const items: Array<{ productId: string; quantity: number; unitPrice: number; vatRate: number }> = [];

      for (const lm of plan.lines) {
        const karar = kararlar.get(lm.line.lineNo);
        let product: Product | undefined;

        if (karar?.productId) {
          product = (draft.products || []).find(p => p.id === karar.productId);
          if (!product) throw new Error(`Seçilen ürün kartı bulunamadı (satır ${lm.line.lineNo}).`);
        } else if (lm.product && !karar?.createProduct) {
          product = lm.product;
        }

        if (!product) {
          // Ürün kartı aç. Alış fiyatı = belgedeki birim fiyat (maliyet doğru
          // yansısın); satış fiyatı UYDURULMAZ — 0 bırakılır, kullanıcı girer.
          const taslak = draftProductFromLine(lm.line);
          product = {
            id: `prod-auto-${Date.now()}-${items.length}`,
            tenantId,
            code: taslak.code || `STK-ALIS-${Date.now().toString().slice(-4)}-${items.length + 1}`,
            name: taslak.name || 'Tanımsız Kalem',
            unit: taslak.unit || 'Adet',
            purchasePrice: taslak.purchasePrice || 0,
            salePrice: 0,
            vatRate: taslak.vatRate ?? 0,
            currentStock: 0,
            stock: 0,
            criticalStock: 0,
            warehouseId: 'wh-default',
            active: true,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          } as Product;
          if (!draft.products) draft.products = [];
          draft.products.push(product);
        }

        items.push({
          productId: product.id,
          quantity: lm.line.quantity,
          unitPrice: lm.line.unitPrice,
          vatRate: lm.line.vatRate,
        });
      }

      if (items.length === 0) {
        throw new Error('Belgede aktarılabilir kalem yok; alış faturası oluşturulmadı.');
      }

      // ── Alış faturası: STOK GİRİŞİ + TEDARİKÇİ BORCU ─────────────────────
      const purchaseInvoice = await DocumentConversionService.createInvoice({
        tenantId,
        type: 'PURCHASE',
        customerId: supplier.id,
        date: inc.issueDate || new Date().toISOString().slice(0, 10),
        items,
        notes:
          `Gelen e-Faturadan aktarıldı (ETTN: ${inc.uuid}, Fatura No: ${inc.invoiceNo}).` +
          (inc.parseWarnings?.length ? ` Uyarılar: ${inc.parseWarnings.join(' ')}` : ''),
        userId,
        username,
      });

      // ── Cari hareket — YETKİLİ DEFTER ────────────────────────────────────
      //
      // ⚠️ `createInvoice` cari hareketi `accountTransactions`'a yazar; fakat
      // bakiyeyi sürdüren defter `accountTransactions` DEĞİL,
      // `currentTransactions`'tır (bkz. `storage.recalculateBalances` ve
      // `routes/customers.ts`). Yalnız `createInvoice`'a güvenilseydi gelen
      // faturanın doğurduğu tedarikçi borcu cari ekranında HİÇ GÖRÜNMEZDİ:
      // bakiye 0 kalır, borç kapanmaz ve kullanıcı yanlış bilgi görürdü.
      // Aynı kayıt `routes/waybills.ts`teki irsaliye→fatura dönüşümünde de
      // yazılıyor; bu akış da aynı disiplini izler.
      if (!draft.currentTransactions) draft.currentTransactions = [];
      draft.currentTransactions.push({
        id: `ctx-${Date.now()}`,
        tenantId,
        customerId: supplier.id,
        customerCode: supplier.code,
        customerTitle: supplier.title,
        documentNo: purchaseInvoice.invoiceNo,
        documentType: 'PURCHASE_INVOICE',
        date: purchaseInvoice.date,
        maturityDate: purchaseInvoice.maturityDate,
        // Alış faturası BORÇ doğurur → credit artar (satışta debit artardı).
        debit: 0,
        credit: purchaseInvoice.grandTotal,
        balance: 0,
        description: `${purchaseInvoice.invoiceNo} - Gelen e-Faturadan aktarılan alış faturası`,
        relatedInvoiceId: purchaseInvoice.id,
        userId,
        createdAt: new Date().toISOString(),
      });

      // `inc`, bu transaction'ın draft'ından gelen CANLI nesnedir.
      inc.status = 'CONVERTED_TO_PURCHASE';
      inc.convertedPurchaseInvoiceId = purchaseInvoice.id;
      inc.matchedSupplierId = supplier.id;
      inc.updatedAt = new Date().toISOString();

      storage.addAuditLog({
        userId,
        username,
        companyId: tenantId,
        action: 'INCOMING_INVOICE_CONVERTED',
        module: 'E_INVOICE',
        documentNo: inc.invoiceNo,
        ipAddress: '127.0.0.1',
        details:
          `${inc.invoiceNo} nolu gelen e-fatura ${purchaseInvoice.invoiceNo} nolu alış faturasına dönüştürüldü ` +
          `(${items.length} kalem, tedarikçi: ${supplier.title}). Stok girişi ve cari borç bu onayla oluştu.`,
      });

      return purchaseInvoice;
    });
  }


  /**
   * 4. Gelen e-Faturayı Kabul veya Reddetme Bildirimi
   *
   * Bu işlem ENTEGRATÖRE bildirim gönderir; yerel stok/cari durumunu
   * DEĞİŞTİRMEZ (onlar `approveAndConvert` işindedir).
   */
  public static async respondToInvoice(
    incomingInvoiceId: string,
    tenantId: string,
    action: 'ACCEPTED' | 'REJECTED',
    reason?: string,
    userId?: string,
    username: string = 'Sistem'
  ): Promise<IncomingInvoice> {
    const db = storage.getState();
    // 2026-09-12: `action` doğrulanır. Önceden ham gövdeden geliyordu; geçersiz
    // bir değer (ör. 'FOO') else dalına düşüp belgeyi ACCEPTED yaparken denetim
    // kaydına "REDDEDİLDİ" yazıyordu — kayıt kendi içinde çelişiyordu.
    if (action !== 'ACCEPTED' && action !== 'REJECTED') {
      throw new Error("Geçersiz işlem: 'action' yalnızca ACCEPTED veya REJECTED olabilir.");
    }

    const incInvoice = this.findIncoming(incomingInvoiceId, tenantId);
    if (!incInvoice) throw new Error('Gelen fatura bulunamadı.');

    // 2026-09-12 (fail-closed): yapılandırma yoksa hiçbir şey yapılmaz.
    // Aksi hâlde fabrika sessizce MOCK'a düşüyor, red bildirimi hiçbir yere
    // gitmeden "iletildi" sayılıyordu.
    const { provider, settings } = ProviderFactory.getProviderForTenant(tenantId);

    // 2026-09-16 GÜNCELLEME (`docs/44` §2): RED bildirimi artık `CancelDocument`
    // ile DEĞİL, `SendApplicationResponse` + `ResponseCode: "RED"` ile gidiyor.
    //
    // Önceden `provider.cancelInvoice(...)` çağrılıyordu ve bu SÖZLEŞMEYE AYKIRIYDI:
    // red bir "uygulama yanıtı"dır, iptal değildir. `CancelDocument` ucunun AppType
    // kümesi 3/6/7'dir (e-Arşiv / e-SMM / Müstahsil) ve e-Fatura (1) BULUNMAZ — yani
    // gelen bir e-Faturayı reddetmek iptal ucuyla yapılıyordu ve başarısız olurdu.
    //
    // Her iki dal da AYNI disiplini uygular: sağlayıcı `{ success: false }`
    // dönebilir (hata fırlatmak yerine) → sonuç MUTLAKA kontrol edilir ve
    // bildirilemeyen bir yanıt, belgenin durumunu DEĞİŞTİRMEZ.
    //
    // Ayrıca ETTN zorunludur (`docs/44` §1): boş kimlikle bildirim göndermek,
    // entegratörde hiçbir belgeyi hedeflemeyen bir istek üretir.
    const belgeUuid = typeof incInvoice.uuid === 'string' ? incInvoice.uuid.trim() : '';
    if (!belgeUuid) {
      throw new Error('Gelen belgenin e-Belge UUID (ETTN) bilgisi yok; uygulama yanıtı gönderilemedi.');
    }

    const yanitKodu: 'KABUL' | 'RED' = action === 'ACCEPTED' ? 'KABUL' : 'RED';
    const yanit = await provider.respondToInvoice(
      {
        uuid: belgeUuid,
        responseCode: yanitKodu,
        description: action === 'REJECTED' ? reason || 'Müşteri reddi' : undefined,
        documentId: incInvoice.invoiceNo,
        documentDate: incInvoice.issueDate,
      },
      settings
    );
    if (!yanit?.success) {
      throw new Error(yanit?.message || `${yanitKodu} bildirimi entegratöre iletilemedi; durum değiştirilmedi.`);
    }

    if (action === 'ACCEPTED') {
      incInvoice.status = 'ACCEPTED';
    } else {
      incInvoice.status = 'REJECTED';
      incInvoice.rejectionReason = reason;
    }

    incInvoice.updatedAt = new Date().toISOString();

    storage.addAuditLog({
      userId: userId || 'usr-sys',
      username,
      companyId: tenantId,
      action: action === 'ACCEPTED' ? 'INCOMING_INVOICE_ACCEPTED' : 'INCOMING_INVOICE_REJECTED',
      module: 'E_INVOICE',
      documentNo: incInvoice.invoiceNo,
      ipAddress: '127.0.0.1',
      details: `${incInvoice.invoiceNo} gelen fatura için '${action}' yanıtı verildi.${reason ? ` Sebep: ${reason}` : ''}`,
    });

    storage.save();
    return incInvoice;
  }
}
