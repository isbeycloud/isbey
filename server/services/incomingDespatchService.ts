import { storage } from '../db/storage';
import {
  IncomingDespatch,
  IncomingDespatchItem,
  Customer,
  Product,
  StockMovement,
} from '../db/schema';
import { ProviderFactory } from './providers/providerFactory';
import { DocumentStorageService } from './documentStorageService';
import { parseUblDocument } from './ubl/ublParser';
import { XmlValidatorService } from './ubl/xmlValidatorService';
import { IncomingDocumentError } from '../errors/incomingDocumentError';
import {
  matchSupplier,
  matchLine,
  draftProductFromLine,
  buildMappingRecords,
  type IngestionPlan,
} from './ubl/incomingDocumentMapper';

/**
 * GELEN e-İRSALİYE SERVİSİ
 * ═══════════════════════════════════════════════════════════════════════════
 * 2026-09-28 eklendi. Gelen e-Fatura akışıyla AYNI üç aşamalı disiplini izler:
 * senkron (çözümle + sakla) → plan (öner, yazma) → onay (hareket ettir).
 *
 * ⚠️ TEMEL FARK — MALİ BELGE DEĞİL: e-İrsaliye bir SEVK belgesidir. Onaylandığında
 *   • STOK GİRİŞİ oluşur (mal fiziksel olarak geldi),
 *   • CARİ BORÇ OLUŞMAZ (borç, satıcının keseceği faturayla doğar).
 *
 * Bu ayrım korunmazsa aynı mal için iki kez borç yazılır: bir kez irsaliyede,
 * bir kez de faturada. Bu yüzden burada `createInvoice` ÇAĞRILMAZ; yalnız stok
 * hareketi yazılır.
 *
 * Ayrıca irsaliyede BİRİM FİYAT ve KDV YOKTUR (bkz. `ublDespatchBuilder`).
 * Bu yüzden stok girişi maliyetsiz yapılır: maliyet, fatura onaylandığında
 * mevcut stok değerleme kuralına göre oluşur. Uydurma fiyat ATANMAZ.
 */
export class IncomingDespatchService {
  /**
   * 1. Gelen e-İrsaliyeleri Çeker, İçeriğini Çözümler ve Saklar.
   *
   * ⚠️ Yalnız `db.incomingDespatches` yazılır. Stok ve cariye DOKUNULMAZ.
   */
  public static async syncIncomingDespatches(
    tenantId: string,
    startDate?: string,
    /** 2026-09-29 — Denetim izi için işlemi yapan kullanıcı (bkz. fatura akışı). */
    actor?: { userId: string; username: string }
  ): Promise<{ syncedCount: number; duplicateCount: number; unreadableCount: number }> {
    const { provider, settings } = ProviderFactory.getProviderForTenant(tenantId);

    if (!provider.capabilities.supportsEDespatch) {
      throw new Error('Bağlı entegratör gelen e-İrsaliye desteği sunmuyor.');
    }

    const fromDate = startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const liste = await provider.getIncomingInvoices(fromDate, settings);

    // Gelen kutusu fatura ve irsaliyeyi birlikte döndürebilir; yalnız irsaliye
    // bu akışın konusudur.
    const irsaliyeler = liste.filter(i => i.documentKind === 'DESPATCH' || i.appType === 3);

    // ── AŞAMA 1: AĞ + DİSK + ÇÖZÜMLEME — state'e YAZILMAZ ────────────────
    //
    // ⚠️ 2026-09-28: Yazma işi ayrı bir transaction'a alındı. Önceden bu
    // metodun tamamı `storage.getState()` referansı üzerinden yazıyordu;
    // araya giren herhangi bir `update()` (ör. eşzamanlı bir `addAuditLog`)
    // o referansı bayatlatıp senkron sonucunu sessizce kaybettirebiliyordu
    // (bkz. `incomingInvoiceService` ve `storage.runTransaction`).
    // Ağ ve disk işleri transaction DIŞINDA kalır: yavaş G/Ç ile kilit
    // tutmak, eşzamanlı belge işlemlerini gereksiz yere bloklar.
    const hazir: IncomingDespatch[] = [];

    for (const item of irsaliyeler) {
      let xmlContent = item.xmlContent || '';
      if (!xmlContent.trim()) {
        const indirilen = await provider.getIncomingDocumentContent(item.uuid, item.appType ?? 3, settings);
        if (indirilen.success) xmlContent = indirilen.content;
      }

      // ── GÜVENLİK KAPISI (2026-09-29) — bkz. incomingInvoiceService'teki not.
      // İçerik dışarıdan gelir; XXE/DTD içeren belge diske yazılmaz/çözülmez.
      const guvenlik = XmlValidatorService.validateIncomingXml(xmlContent);
      const guvenlikIhlali = xmlContent.trim() && !guvenlik.safe;

      let xmlPath: string | undefined;
      if (xmlContent.trim() && !guvenlikIhlali) {
        xmlPath = DocumentStorageService.saveXml(tenantId, 'incoming_despatch', item.uuid, xmlContent);
      }

      const doc = xmlContent.trim() && !guvenlikIhlali ? parseUblDocument(xmlContent) : undefined;
      const parseErrors: string[] = guvenlikIhlali
        ? [guvenlik.reason || 'Belge güvenlik denetiminden geçemedi.']
        : doc
        ? [...doc.errors]
        : ['Belge içeriği entegratörden alınamadı; irsaliye kalemleri okunamadı.'];

      // Belge fatura çıkarsa bu akışa alınmaz — yanlış akışa düşmesi stok
      // hareketini cari borçla karıştırırdı.
      if (doc && doc.kind !== 'DESPATCH') {
        parseErrors.push('Belge e-Fatura olarak çözümlendi; e-İrsaliye bekleniyordu.');
      }

      const items: IncomingDespatchItem[] = doc
        ? doc.lines.map((l, i) => ({
            id: `incd-${item.uuid}-${i + 1}`,
            incomingDespatchId: item.uuid,
            ...(l.sellerProductCode ? { supplierProductCode: l.sellerProductCode } : {}),
            name: l.name,
            ...(l.barcode ? { barcode: l.barcode } : {}),
            quantity: l.quantity,
            unit: l.unitName,
            // Fiyat/KDV irsaliyede YOKTUR; undefined bırakılır (0 yazmak
            // "bedelsiz mal" izlenimi verirdi).
          }))
        : [];

      const now = new Date().toISOString();
      hazir.push({
        id: `incd-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        tenantId,
        uuid: item.uuid,
        despatchNo: doc?.documentNo || item.invoiceNo || '',
        supplierTaxNumber: doc?.supplier.taxNumber || item.supplierVkn || '',
        supplierTitle: doc?.supplier.title || item.supplierTitle || '',
        issueDate: doc?.issueDate || item.issueDate || '',
        documentKind: 'DESPATCH',
        status: parseErrors.length > 0 ? 'UNREADABLE' : 'RECEIVED',
        ...(xmlPath ? { xmlStoragePath: xmlPath } : {}),
        items,
        ...(parseErrors.length ? { parseErrors } : {}),
        ...(doc && doc.warnings.length ? { parseWarnings: doc.warnings } : {}),
        receivedAt: now,
        createdAt: now,
        updatedAt: now,
      } as IncomingDespatch);
    }

    // ── AŞAMA 2: TEK TRANSACTION — yalnız `incomingDespatches` yazılır ───
    return storage.runTransaction(draft => {
      if (!draft.incomingDespatches) draft.incomingDespatches = [];

      let syncedCount = 0;
      let duplicateCount = 0;
      let unreadableCount = 0;

      for (const yeni of hazir) {
        // Mükerrer kontrolü TRANSACTION İÇİNDE, güncel draft üzerinden yapılır:
        // dışarıda bakılsaydı aynı anda çalışan iki senkron aynı belgeyi iki
        // kez ekleyebilirdi.
        const exists = draft.incomingDespatches.some(
          d => d.uuid === yeni.uuid && (d.tenantId === tenantId || (tenantId === 'tnt-isbey' && !d.tenantId))
        );
        if (exists) {
          duplicateCount++;
          continue;
        }

        draft.incomingDespatches.push(yeni);
        syncedCount++;
        if ((yeni.parseErrors || []).length > 0) unreadableCount++;
      }

      storage.addAuditLog({
        userId: actor?.userId || 'system',
        username: actor?.username || 'Zamanlanmış görev',
        companyId: tenantId,
        action: 'INCOMING_DESPATCH_SYNC',
        module: 'E_DESPATCH',
        ipAddress: '127.0.0.1',
        details:
          `Gelen e-İrsaliye senkronu: ${syncedCount} yeni, ${duplicateCount} mükerrer atlandı` +
          (unreadableCount > 0 ? `, ${unreadableCount} belge okunamadı (UNREADABLE).` : '.'),
      });

      return { syncedCount, duplicateCount, unreadableCount };
    });
  }

  /**
   * Detay — çözümlenmiş belge içeriği (2026-09-29, bkz. fatura akışındaki not).
   * SALT OKUNUR.
   */
  public static getDocumentDetail(
    incomingDespatchId: string,
    tenantId: string
  ): { record: IncomingDespatch; document: ReturnType<typeof parseUblDocument> } {
    const kayit = this.find(incomingDespatchId, tenantId);
    if (!kayit) throw new IncomingDocumentError('NOT_FOUND', 'Gelen irsaliye kaydı bulunamadı.');

    const xml = kayit.xmlStoragePath ? DocumentStorageService.readXml(tenantId, kayit.xmlStoragePath) : null;
    if (!xml) {
      throw new IncomingDocumentError(
        'NOT_INGESTIBLE',
        kayit.parseErrors?.length
          ? `İrsaliye içeriği okunamadı: ${kayit.parseErrors[0]}`
          : 'İrsaliye içeriği diskte bulunamadı; detay gösterilemez. Belgeyi yeniden senkronize edin.'
      );
    }

    return { record: kayit, document: parseUblDocument(xml) };
  }

  /** Ham XML — `[XML]` sekmesi için. İçerik değiştirilmez. */
  public static getDocumentXml(
    incomingDespatchId: string,
    tenantId: string
  ): { xml: string; record: IncomingDespatch } {
    const kayit = this.find(incomingDespatchId, tenantId);
    if (!kayit) throw new IncomingDocumentError('NOT_FOUND', 'Gelen irsaliye kaydı bulunamadı.');
    const xml = kayit.xmlStoragePath ? DocumentStorageService.readXml(tenantId, kayit.xmlStoragePath) : null;
    if (!xml) {
      throw new IncomingDocumentError(
        'NOT_INGESTIBLE',
        'İrsaliye XML içeriği diskte bulunamadı; yeniden senkronize edin.'
      );
    }
    return { xml, record: kayit };
  }

  /** Kullanıcının belgeyi incelediğini işaretler (bkz. fatura akışındaki not). */
  public static async markReviewed(incomingDespatchId: string, tenantId: string): Promise<IncomingDespatch> {
    return storage.runTransaction(draft => {
      const kayit = this.find(incomingDespatchId, tenantId);
      if (!kayit) throw new IncomingDocumentError('NOT_FOUND', 'Gelen irsaliye kaydı bulunamadı.');
      if (!kayit.reviewedAt) {
        kayit.reviewedAt = new Date().toISOString();
        kayit.updatedAt = kayit.reviewedAt;
      }
      return kayit;
    });
  }

  private static find(idOrUuid: string, tenantId: string): IncomingDespatch | undefined {
    const db = storage.getState();
    return (db.incomingDespatches || []).find(
      d =>
        (d.id === idOrUuid || d.uuid === idOrUuid) &&
        (d.tenantId === tenantId || (tenantId === 'tnt-isbey' && !d.tenantId))
    );
  }

  /**
   * 2. Onay Ekranı İçin Eşleştirme Planı — YAZMAZ.
   *
   * `IngestionPlan` tipini yeniden kullanır; irsaliyede toplamlar 0 olur
   * (fiyat yok) ve bu bir eksiklik değildir.
   */
  public static getIngestionPlan(incomingDespatchId: string, tenantId: string): IngestionPlan {
    const db = storage.getState();
    const kayit = this.find(incomingDespatchId, tenantId);
    if (!kayit) throw new IncomingDocumentError('NOT_FOUND', 'Gelen irsaliye kaydı bulunamadı.');

    const xml = kayit.xmlStoragePath ? DocumentStorageService.readXml(tenantId, kayit.xmlStoragePath) : null;
    if (!xml) {
      throw new IncomingDocumentError(
        'NOT_INGESTIBLE',
        'İrsaliye içeriği diskte bulunamadı; eşleştirme yapılamaz. Belgeyi yeniden senkronize edin.'
      );
    }

    const doc = parseUblDocument(xml);
    const party = matchSupplier(doc, db.customers || [], tenantId);
    // 2026-09-29: Öğrenilmiş eşleştirme hafızası BURADA DA okunur. Aksi hâlde
    // aynı tedarikçinin aynı ürünü, faturada hatırlanırken irsaliyede
    // hatırlanmazdı; kullanıcı aynı kararı her sevk belgesinde yeniden verirdi.
    const lines = doc.lines.map(l =>
      matchLine(l, db.products || [], tenantId, db.productSupplierMappings || [], doc.supplier.taxNumber)
    );

    const matchedCount = lines.filter(l => !!l.product).length;

    return {
      document: doc,
      party,
      lines,
      totals: {
        computedSubTotal: 0,
        computedVatTotal: 0,
        computedGrandTotal: 0,
      },
      matchSummary: {
        total: lines.length,
        matched: matchedCount,
        highConfidence: lines.filter(l => l.confidence === 'HIGH' && !!l.product).length,
        pending: lines.length - matchedCount,
      },
      ...(doc.errors.length > 0 ? { blockedReason: doc.errors[0] } : {}),
    };
  }

  /**
   * 3. Onaylı Mal Girişi — STOK YALNIZ BURADA HAREKET EDER.
   *
   * ⚠️ CARİ BORÇ OLUŞTURULMAZ (bkz. sınıf açıklaması). Fiyat bilgisi irsaliyede
   * olmadığı için stok hareketi `unitPrice: 0` ile yazılır ve açıklamaya
   * "fiyatsız mal girişi" notu düşülür; maliyet faturası onaylandığında oluşur.
   */
  public static async approveDespatch(
    incomingDespatchId: string,
    tenantId: string,
    userId: string,
    username: string = 'Sistem',
    decisions?: {
      supplierId?: string;
      createSupplier?: boolean;
      lines?: Array<{ lineNo: string; productId?: string; createProduct?: boolean }>;
    }
  ): Promise<{ despatch: IncomingDespatch; movements: StockMovement[] }> {
    // ⚠️ TEK TRANSACTION — BURADA TUTULMASI ZORUNLU.
    //
    // 2026-09-28'de gelen fatura akışında ÖLÇÜLEN hata: `storage.addAuditLog()`
    // ve `storage.getNextSequence()` içeride `storage.update()` çağırır; o da
    // `this.db`'yi yeni bir klonla değiştirir. Metodun başında alınan `db`
    // referansı artık canlı nesne olmadığı için oraya yapılan `push` işlemleri
    // (stok kartları, stok hareketleri, irsaliye durumu) KAYBOLUR ve
    // `storage.save()` bayat veriyi yazar. Aynı tuzak burada da geçerli
    // olduğundan akış baştan transaction içine alındı.
    return storage.runTransaction(draft => {
      const kayit = this.find(incomingDespatchId, tenantId);
      if (!kayit) throw new IncomingDocumentError('NOT_FOUND', 'Gelen irsaliye kaydı bulunamadı.');
      // ⚠️ 409: Aynı irsaliyeyi ikinci kez onaylamak KALICI bir çakışmadır —
      // stok iki kez girer ve hata stok defterine kalıcı olarak işlenir.
      if (kayit.status === 'APPROVED') {
        throw new IncomingDocumentError('ALREADY_INGESTED', 'Bu irsaliye zaten onaylanmış.');
      }
      if (kayit.status === 'UNREADABLE') {
        throw new IncomingDocumentError(
          'NOT_INGESTIBLE',
          'İçeriği okunamayan irsaliye onaylanamaz: ' + (kayit.parseErrors?.[0] || 'belge okunamadı.')
        );
      }

      const plan = this.getIngestionPlan(incomingDespatchId, tenantId);
      if (plan.blockedReason) throw new Error(`İrsaliye onaylanamaz: ${plan.blockedReason}`);

      const now = new Date().toISOString();
      const whId = (draft.warehouses && draft.warehouses[0]?.id) || 'wh-default';
      const belgeRef = `GİR-${kayit.despatchNo || kayit.uuid.slice(0, 8)}`;

      // ── Tedarikçi: yalnızca EŞLEŞTİRME için; borç yazılmaz ──────────────
      let supplierId = decisions?.supplierId;
      if (!supplierId && plan.party.customer && !decisions?.createSupplier) {
        supplierId = plan.party.customer.id;
      }
      if (!supplierId) {
        const yeni: Customer = {
          id: `cust-sup-${Date.now()}`,
          tenantId,
          code: storage.getNextSequence('CUSTOMER_SUPPLIER') || `320.${String((draft.customers?.length || 0) + 1).padStart(5, '0')}`,
          title: plan.document.supplier.title || `Tedarikçi ${plan.document.supplier.taxNumber}`,
          taxNumber: plan.document.supplier.taxNumber || '',
          taxOffice: plan.document.supplier.taxOffice || '',
          city: plan.document.supplier.city || '',
          district: plan.document.supplier.district || '',
          type: 'SUPPLIER',
          currency: plan.document.currency || 'TRY',
          // Bilinçli olarak 0: irsaliye borç doğurmaz.
          balance: 0,
          totalDebit: 0,
          totalCredit: 0,
          active: true,
          createdAt: now,
          updatedAt: now,
        } as Customer;
        if (!draft.customers) draft.customers = [];
        draft.customers.push(yeni);
        supplierId = yeni.id;
      }

      const kararlar = new Map((decisions?.lines || []).map(l => [l.lineNo, l]));
      const movements: StockMovement[] = [];
      // Öğrenilecek eşleştirmeler — bkz. `buildMappingRecords` açıklaması.
      const ogrenilecek: Array<{ lineNo: string; supplierItemCode: string; barcode?: string; productId: string }> = [];

      for (const lm of plan.lines) {
        const karar = kararlar.get(lm.line.lineNo);
        let product: Product | undefined;

        if (karar?.productId) {
          product = (draft.products || []).find(p => p.id === karar.productId);
          if (!product) throw new Error(`Seçilen ürün kartı bulunamadı (satır ${lm.line.lineNo}).`);
          // Yalnız KULLANICININ açıkça seçtiği eşleştirme öğrenilir.
          const kod = lm.line.sellerProductCode || lm.line.barcode || '';
          if (kod) {
            ogrenilecek.push({
              lineNo: lm.line.lineNo,
              supplierItemCode: kod,
              ...(lm.line.barcode ? { barcode: lm.line.barcode } : {}),
              productId: product.id,
            });
          }
        } else if (lm.product && !karar?.createProduct) {
          product = lm.product;
        }

        if (!product) {
          const taslak = draftProductFromLine(lm.line);
          product = {
            id: `prod-auto-${Date.now()}-${movements.length}`,
            tenantId,
            code: taslak.code || `STK-IRS-${Date.now().toString().slice(-4)}-${movements.length + 1}`,
            name: taslak.name || 'Tanımsız Kalem',
            unit: taslak.unit || 'Adet',
            purchasePrice: 0,
            salePrice: 0,
            vatRate: 0,
            currentStock: 0,
            stock: 0,
            criticalStock: 0,
            warehouseId: whId,
            active: true,
            createdAt: now,
            updatedAt: now,
          } as Product;
          if (!draft.products) draft.products = [];
          draft.products.push(product);
        }

        const qty = lm.line.quantity;
        movements.push({
          id: `sm-irs-${Date.now()}-${movements.length}`,
          tenantId,
          productId: product.id,
          productCode: product.code,
          productName: product.name,
          warehouseId: whId,
          documentNo: belgeRef,
          documentType: 'WAYBILL',
          documentId: kayit.id,
          movementType: 'PURCHASE',
          quantity: qty,
          direction: 'IN',
          // Fiyat irsaliyede yok — uydurulmaz. Maliyet faturayla oluşur.
          unitPrice: 0,
          totalAmount: 0,
          currency: 'TRY',
          date: kayit.issueDate || now.slice(0, 10),
          notes: `Gelen e-İrsaliye ile mal girişi (fiyatsız — maliyet satıcı faturasıyla oluşur). Tedarikçi: ${plan.document.supplier.title || supplierId}`,
          userId,
          createdBy: username,
          createdAt: now,
        });

        product.currentStock = (product.currentStock || 0) + qty;
        product.stock = (product.stock || 0) + qty;
        product.updatedAt = now;
      }

      if (movements.length === 0) throw new Error('İrsaliyede aktarılabilir kalem yok; mal girişi oluşturulmadı.');

      if (!draft.stockMovements) draft.stockMovements = [];
      draft.stockMovements.push(...movements);

      kayit.status = 'APPROVED';
      kayit.convertedMovementRef = belgeRef;
      kayit.matchedSupplierId = supplierId;
      kayit.updatedAt = now;

      // ── Eşleştirme hafızası (2026-09-29) ───────────────────────────────
      // Fatura akışıyla AYNI kural: yalnız kullanıcının açıkça seçtiği
      // satırlar öğrenilir, tedarikçi kapsamlıdır, silinmiş ürünün kaydı
      // geçersiz sayılır (bkz. `matchLine`).
      if (ogrenilecek.length > 0 && plan.document.supplier.taxNumber) {
        const yeniKayitlar = buildMappingRecords(
          ogrenilecek,
          draft.productSupplierMappings || [],
          {
            tenantId,
            supplierTaxNumber: plan.document.supplier.taxNumber,
            now,
          }
        );
        if (yeniKayitlar.length > 0) {
          if (!draft.productSupplierMappings) draft.productSupplierMappings = [];
          for (const k of yeniKayitlar) {
            const idx = draft.productSupplierMappings.findIndex(m => m.id === k.id);
            if (idx >= 0) draft.productSupplierMappings[idx] = k;
            else draft.productSupplierMappings.push(k);
          }
        }
      }

      storage.addAuditLog({
        userId,
        username,
        companyId: tenantId,
        action: 'INCOMING_DESPATCH_APPROVED',
        module: 'E_DESPATCH',
        documentNo: kayit.despatchNo,
        ipAddress: '127.0.0.1',
        details:
          `${kayit.despatchNo} nolu gelen e-İrsaliye onaylandı: ${movements.length} kalem için stok girişi yapıldı (${belgeRef}). ` +
          `Cari borç OLUŞTURULMADI — borç satıcı faturasıyla doğar.`,
      });

      return { despatch: kayit, movements };
    });
  }


  /** 4. Gelen irsaliyeyi reddeder (stok hareketi oluşmaz). */
  public static async rejectDespatch(
    incomingDespatchId: string,
    tenantId: string,
    reason: string,
    userId: string,
    username: string = 'Sistem'
  ): Promise<IncomingDespatch> {
    // ⚠️ `addAuditLog()` içeride `storage.update()` çağırır ve `this.db`'yi
    // değiştirir; kaydı dışarıda bulup sonra yazsaydık red kararı diske hiç
    // yansımazdı. Bkz. `approveDespatch` başındaki ayrıntılı not.
    return storage.runTransaction(draft => {
      const kayit = this.find(incomingDespatchId, tenantId);
      if (!kayit) throw new IncomingDocumentError('NOT_FOUND', 'Gelen irsaliye kaydı bulunamadı.');
      if (kayit.status === 'APPROVED') {
        throw new IncomingDocumentError('INVALID_STATE', 'Onaylanmış irsaliye reddedilemez.');
      }

      kayit.status = 'REJECTED';
      kayit.rejectionReason = reason;
      kayit.updatedAt = new Date().toISOString();

      storage.addAuditLog({
        userId,
        username,
        companyId: tenantId,
        action: 'INCOMING_DESPATCH_REJECTED',
        module: 'E_DESPATCH',
        documentNo: kayit.despatchNo,
        ipAddress: '127.0.0.1',
        details: `${kayit.despatchNo} nolu gelen e-İrsaliye reddedildi. Sebep: ${reason}. Stok hareketi oluşmadı.`,
      });

      return kayit;
    });
  }
}
