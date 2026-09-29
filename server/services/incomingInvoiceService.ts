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
import { XmlValidatorService } from './ubl/xmlValidatorService';
import {
  buildIngestionPlan,
  buildMappingRecords,
  discountPercentForLine,
  draftProductFromLine,
  draftSupplierFromDocument,
  type IngestionPlan,
} from './ubl/incomingDocumentMapper';
import { IncomingDocumentError } from '../errors/incomingDocumentError';
import {
  MAX_CONTENT_DOWNLOADS_PER_SYNC,
  clampDateRange,
  resolveDateRange,
  type SyncDocumentResult,
  type SyncRangeInput,
  type SyncSummary,
} from './incomingSyncContract';

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
    /**
     * 2026-09-29 genişletildi: kullanıcı tarih aralığı seçebilir.
     *
     * Geriye dönük uyum: eski çağrılar (`syncIncomingInvoices(tenantId, '2026-09-01')`)
     * düz bir `yyyy-MM-dd` dizesi geçiyordu; o biçim de kabul edilir ve
     * "özel başlangıç, bitiş = bugün" olarak yorumlanır.
     */
    aralik?: SyncRangeInput | string,
    /**
     * 2026-09-29 — Denetim izi için işlemi YAPAN kullanıcı. İsteğe bağlıdır
     * çünkü arka plan/zamanlanmış çağrılar da bu metodu kullanır; o durumda
     * kayıt "Zamanlanmış görev" olarak düşer. Hiçbir koşulda token/parola
     * yazılmaz — yalnız kimlik ve sayılar.
     */
    actor?: { userId: string; username: string }
  ): Promise<SyncSummary> {
    const { provider, settings } = ProviderFactory.getProviderForTenant(tenantId);

    const baslangicZamani = new Date().toISOString();

    // ── TARİH ARALIĞI ───────────────────────────────────────────────────────
    // Seçim SUNUCUDA çözülür: arayüz "son 7 gün" gönderse bile aralığı burada
    // hesaplarız, çünkü elle atılan bir istek 5 yıllık aralık çekebilirdi.
    // `clampDateRange` sonucu SESSİZCE kısaltmaz; ne yaptığını `adjustment`
    // alanında söyler (kullanıcı "eski belgelerim gelmiyor" diye uğraşmasın).
    const hamAralik = typeof aralik === 'string'
      ? resolveDateRange('CUSTOM', aralik, undefined)
      : resolveDateRange(aralik?.preset, aralik?.startDate, aralik?.endDate);
    const sinirli = clampDateRange(hamAralik.startDate, hamAralik.endDate);

    const tumListe = await provider.getIncomingInvoices(sinirli.startDate, settings, sinirli.endDate);

    // ⚠️ Gelen kutusu e-Fatura ve e-İrsaliye'yi BİRLİKTE döndürür. İrsaliye bu
    // akışın konusu DEĞİLDİR: içeri aktarılırsa alış faturası kesilir ve cari
    // borç doğar; oysa irsaliye mali belge değildir (bkz. `incomingDespatchService`).
    // 2026-09-28'de bu filtre EKSİKTİ ve bir e-İrsaliye fatura senkronuyla
    // içeri alınabiliyordu — test bunu yakaladı.
    const incomingList = tumListe.filter(i => i.documentKind !== 'DESPATCH' && i.appType !== 3);

    // ── MEVCUT HAVUZ (okuma amaçlı anlık görüntü) ─────────────────────────
    //
    // ⚠️ Bu YALNIZ bir ÖN KONTROLDÜR — asıl mükerrer kararı transaction içinde,
    // güncel draft üzerinden verilir (aşağıda). Amacı şu: havuzda zaten olan
    // belgeler için İÇERİK HİÇ İNDİRİLMEZ. Bu hem gereksiz ağ trafiğini
    // önler hem de indirme sınırının yalnız GERÇEK yeni belgelere harcanmasını
    // sağlar; aksi hâlde aynı aralığı tekrar çekmek sınırı mükerrerlere
    // harcayıp ilerleme kaydetmezdi.
    const mevcutHavuz = (storage.getState().incomingInvoices || []).filter(
      inv => inv.tenantId === tenantId || (tenantId === 'tnt-isbey' && !inv.tenantId)
    );
    /** ETTN → kayıt. Okunamayanlar TEKRAR denenir (bkz. 'UPDATED'). */
    const mevcutUuidler = new Map(mevcutHavuz.map(inv => [inv.uuid, inv]));

    // ── AŞAMA 1: İçerik indirme + çözümleme — YAZMA YOK ────────────────────
    // Ağ ve disk işleri transaction DIŞINDA yapılır; transaction'ı ağ
    // gecikmesi boyunca açık tutmak yazma kilidini gereksiz meşgul ederdi.
    const hazir: Array<{
      meta: any;
      xmlPath?: string;
      doc?: ReturnType<typeof parseUblDocument>;
      parseErrors: string[];
      items: IncomingInvoiceItem[];
      /** Aynı ETTN daha önce okunamadıysa bu turda GÜNCELLENECEK kayıt. */
      guncellenecekId?: string;
    }> = [];
    /** Belge bazlı sonuçlar — kullanıcı hangi belgenin neden hatalı olduğunu görür. */
    const belgeSonuclari: SyncDocumentResult[] = [];
    /** Bu turda içerik indirmek için harcanan kota. */
    let indirmeSayisi = 0;
    let atlananSayisi = 0;

    for (const item of incomingList) {
      const appType = item.appType ?? (item.documentKind === 'DESPATCH' ? 3 : 1);
      const belgeNo = item.invoiceNo || '';

      // Daha önce başarıyla okunmuş belge → hiç dokunma, içerik indirme.
      const mevcut = mevcutUuidler.get(item.uuid);
      const tekrarDenenecek = mevcut?.status === 'UNREADABLE';
      if (mevcut && !tekrarDenenecek) {
        belgeSonuclari.push({ uuid: item.uuid, documentNo: belgeNo, outcome: 'DUPLICATE' });
        continue;
      }

      // İçerik indirme kotası. Mükerrerler yukarıda elendiği için sınır yalnız
      // GERÇEK işe harcanır. Kota dolduğunda belge KAYBOLMAZ; 'SKIPPED' olarak
      // raporlanır ve bir sonraki turda işlenir (sessizce yutulmaz).
      if (indirmeSayisi >= MAX_CONTENT_DOWNLOADS_PER_SYNC) {
        atlananSayisi++;
        belgeSonuclari.push({
          uuid: item.uuid,
          documentNo: belgeNo,
          outcome: 'SKIPPED',
          message:
            `Tek senkronda en fazla ${MAX_CONTENT_DOWNLOADS_PER_SYNC} belge indirilebilir. ` +
            'Bu belge bir sonraki çekimde alınacak — tarih aralığını daraltıp tekrar çekebilirsiniz.',
        });
        continue;
      }
      indirmeSayisi++;

      // Liste ucu yalnız meta veri verir. İçerik alınamazsa belge SAKLANIR
      // ama `UNREADABLE` işaretlenir: kullanıcı "içeriği okunamayan belge"
      // olarak görür, uydurma satırlarla "okunmuş" gibi görünmez.
      let xmlContent = item.xmlContent || '';
      if (!xmlContent.trim()) {
        const indirilen = await provider.getIncomingDocumentContent(item.uuid, appType, settings);
        if (indirilen.success) xmlContent = indirilen.content;
      }

      // ── GÜVENLİK KAPISI (2026-09-29) ─────────────────────────────────────
      // ⚠️ BURASI SALDIRGANIN DENETLEYEBİLDİĞİ TEK YERDİR: içerik bizden değil,
      // entegratörden (yani dışarıdan) gelir. XXE/DTD içeren belge DİSKE HİÇ
      // YAZILMAZ ve ÇÖZÜMLENMEZ; yalnız `UNREADABLE` olarak kayda geçer ki
      // kullanıcı belgenin geldiğini ama reddedildiğini görsün.
      const guvenlik = XmlValidatorService.validateIncomingXml(xmlContent);
      const guvenlikIhlali = xmlContent.trim() && !guvenlik.safe;

      let xmlPath: string | undefined;
      if (xmlContent.trim() && !guvenlikIhlali) {
        xmlPath = DocumentStorageService.saveXml(tenantId, 'incoming_invoice', item.uuid, xmlContent);
      }

      const doc = xmlContent.trim() && !guvenlikIhlali ? parseUblDocument(xmlContent) : undefined;

      // Çözümleme başarısızsa `errors`, kalem hiç yoksa da hata üretilir.
      const parseErrors: string[] = guvenlikIhlali
        ? [guvenlik.reason || 'Belge güvenlik denetiminden geçemedi.']
        : doc
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

      // ── HATA SEBEBİ KULLANICIYA AÇIKÇA SÖYLENİR (§7) ─────────────────────
      // Belge listede vardı ama içeriği alınamadıysa sessizce "boş belge"
      // YAZILMAZ; "UBL/XML içeriği alınamadı" mesajı üretilir ve kullanıcı
      // aynı belgeyi tekrar deneyebilir (okunamayan kayıt bir sonraki
      // senkronda otomatik olarak YENİDEN denenir).
      if (parseErrors.length > 0) {
        belgeSonuclari.push({
          uuid: item.uuid,
          documentNo: doc?.documentNo || belgeNo,
          outcome: 'ERROR',
          message: doc
            ? parseErrors[0]
            : 'Belge listede bulundu ancak UBL/XML içeriği alınamadı. "Tekrar Dene" ile yeniden çekebilirsiniz.',
        });
      }

      hazir.push({
        meta: item,
        ...(xmlPath ? { xmlPath } : {}),
        ...(doc ? { doc } : {}),
        parseErrors,
        items,
        ...(tekrarDenenecek && mevcut ? { guncellenecekId: mevcut.id } : {}),
      });
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
      let unreadableCount = 0;
      let updatedCount = 0;
      /**
       * EŞ ZAMANLI MÜKERRER — AŞAMA 1'de "yeni" sanılıp transaction anında
       * başka bir senkron tarafından çoktan eklenmiş belgeler. Ayrı sayılır
       * çünkü `belgeSonuclari`nda karşılığı yoktur (o liste AŞAMA 1'de yazılır).
       */
      let esZamanliMukerrer = 0;

      for (const h of hazir) {
        const item = h.meta;

        // ── MÜKERRER KARARI — TRANSACTION İÇİNDE, GÜNCEL DRAFT ÜZERİNDEN ────
        // Dışarıda bakılsaydı aynı anda çalışan iki senkron aynı belgeyi iki
        // kez ekleyebilirdi. Idempotentlik anahtarı ETTN/UUID'dir.
        const mevcutKayit = draft.incomingInvoices.find(
          inv => inv.uuid === item.uuid && (inv.tenantId === tenantId || (tenantId === 'tnt-isbey' && !inv.tenantId))
        );
        if (mevcutKayit && !h.guncellenecekId) {
          esZamanliMukerrer++;
          continue;
        }

        const status = h.parseErrors.length > 0 ? 'UNREADABLE' : 'RECEIVED';

        // ── TEKRAR DENEME: okunamayan kayıt bu turda okunabildiyse GÜNCELLE ──
        // ⚠️ Belge KİMLİĞİ ve geçmişi korunur (`id`, `createdAt`, `reviewedAt`);
        // yalnız içerik alanları tazelenir. Yeni kayıt açsaydık aynı ETTN için
        // iki kayıt oluşurdu — kullanıcı hangisinin geçerli olduğunu bilemezdi.
        if (mevcutKayit && h.guncellenecekId) {
          if (status === 'UNREADABLE') {
            // Hâlâ okunamıyor — kayda dokunma. Belge zaten havuzda ve durumu
            // değişmedi; bu yüzden "mükerrer" değil, "değişmedi" olarak sayılır.
            continue;
          }
          Object.assign(mevcutKayit, {
            invoiceNo: h.doc?.documentNo || item.invoiceNo || mevcutKayit.invoiceNo,
            supplierTaxNumber: h.doc?.supplier.taxNumber || item.supplierVkn || mevcutKayit.supplierTaxNumber,
            supplierTitle: h.doc?.supplier.title || item.supplierTitle || mevcutKayit.supplierTitle,
            issueDate: h.doc?.issueDate || item.issueDate || mevcutKayit.issueDate,
            subTotal: h.doc ? h.doc.subTotal : mevcutKayit.subTotal,
            vatAmount: h.doc ? h.doc.vatTotal : mevcutKayit.vatAmount,
            grandTotal: h.doc ? h.doc.grandTotal : mevcutKayit.grandTotal,
            currency: h.doc?.currency || mevcutKayit.currency,
            status,
            ...(h.xmlPath ? { xmlStoragePath: h.xmlPath } : {}),
            items: h.items,
            ...(h.doc?.declaredSubTotal !== undefined ? { declaredSubTotal: h.doc.declaredSubTotal } : {}),
            ...(h.doc?.declaredVatTotal !== undefined ? { declaredVatTotal: h.doc.declaredVatTotal } : {}),
            ...(h.doc?.declaredPayable !== undefined ? { declaredPayable: h.doc.declaredPayable } : {}),
            ...(h.doc && h.doc.warnings.length ? { parseWarnings: h.doc.warnings } : {}),
            updatedAt: now,
          });
          // Okunamama sebepleri TEMİZLENİR — belge artık okunabilir.
          delete (mevcutKayit as any).parseErrors;
          updatedCount++;
          belgeSonuclari.push({
            uuid: item.uuid,
            documentNo: mevcutKayit.invoiceNo,
            outcome: 'UPDATED',
            message: 'Belge içeriği bu çekimde alındı; kayıt okunabilir hâle getirildi.',
          });
          continue;
        }

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
        if (!belgeSonuclari.some(b => b.uuid === item.uuid)) {
          belgeSonuclari.push({
            uuid: item.uuid,
            documentNo: newIncoming.invoiceNo,
            outcome: h.parseErrors.length > 0 ? 'ERROR' : 'NEW',
            ...(h.parseErrors.length > 0
              ? { message: 'Belge listede bulundu ancak UBL/XML içeriği alınamadı.' }
              : {}),
          });
        }
      }

      const bitisZamani = new Date().toISOString();

      // ── SAYILAR BELGE BAZLI SONUÇLARDAN TÜRETİLİR (2026-09-29) ───────────
      // ⚠️ ÖLÇÜLEN HATA: Mükerrerler AŞAMA 1'de elenip `hazir`e hiç girmiyordu;
      // bu yüzden transaction içindeki yerel sayaç onları HİÇ görmüyor ve özet
      // "0 mükerrer" diyordu. Kullanıcı aynı belgeyi tekrar çektiğinde "hiçbir
      // şey bulunamadı" sanıp aralığı gereksiz yere büyütürdü. Tek doğru kaynak
      // `belgeSonuclari`tır: her belge için tam olarak bir satır içerir.
      const hataSayisi = belgeSonuclari.filter(b => b.outcome === 'ERROR').length;
      // `esZamanliMukerrer`: AŞAMA 1'de yeni sanılıp transaction anında başka
      // bir senkron tarafından eklenmiş olan belgeler. Sayıya EKLENİR ki iki
      // sayı toplamı her zaman `foundCount`u vermeye devam etsin.
      const mükerrerSayisi =
        belgeSonuclari.filter(b => b.outcome === 'DUPLICATE').length + esZamanliMukerrer;

      // ── DENETİM İZİ (2026-09-29) ────────────────────────────────────────
      // Senkron "kim, ne zaman, hangi aralıkta, kaç belge" sorusunun cevabını
      // bırakmalıdır. ⚠️ Yalnız SAYILAR ve TARİHLER yazılır: belge içeriği,
      // ETTN listesi, token veya kimlik bilgisi denetim kaydına GİRMEZ
      // (bkz. CLAUDE.md md.16 — secret loglamama).
      storage.addAuditLog({
        userId: actor?.userId || 'system',
        username: actor?.username || 'Zamanlanmış görev',
        companyId: tenantId,
        action: 'INCOMING_INVOICE_SYNC',
        module: 'E_INVOICE',
        ipAddress: '127.0.0.1',
        details:
          `Gelen e-Fatura senkronu (${sinirli.startDate} → ${sinirli.endDate}): ` +
          `${incomingList.length} belge bulundu, ${syncedCount} yeni, ${mükerrerSayisi} mükerrer atlandı, ` +
          `${updatedCount} belge güncellendi, ${hataSayisi} hatalı` +
          (atlananSayisi > 0 ? `, ${atlananSayisi} belge sınır nedeniyle ertelendi.` : '.') +
          (sinirli.adjustment ? ` [${sinirli.adjustment}]` : '') +
          ' Stok ve cari DEĞİŞMEDİ.',
      });

      const ozet: SyncSummary = {
        startedAt: baslangicZamani,
        finishedAt: bitisZamani,
        dateRange: { startDate: sinirli.startDate, endDate: sinirli.endDate },
        foundCount: incomingList.length,
        newCount: syncedCount,
        duplicateCount: mükerrerSayisi,
        errorCount: hataSayisi,
        updatedCount,
        skippedCount: atlananSayisi,
        truncated: atlananSayisi > 0,
        documents: belgeSonuclari,
        // Geriye dönük uyum (eski istemciler ve mevcut testler).
        syncedCount,
        unreadableCount,
        ...(sinirli.adjustment ? { rangeAdjustment: sinirli.adjustment } : {}),
        // 2026-09-29 — Aralık HER ZAMAN raporlanır, `CUSTOM` dâhil.
        // ⚠️ ÖLÇÜLEN TUTARSIZLIK: önceden `CUSTOM` dışlanıyordu; sonuç "hangi
        // aralık çekildi" sorusunun cevabı arayüzde boş kalıyordu — kullanıcı
        // özel tarih girdiğinde ne çektiğini göremiyordu. Aralık zaten
        // `dateRange`te var; onu GİZLEMEK için bir sebep yok.
        rangePreset: hamAralik.preset,
      };
      return ozet;
    });
  }

  /**
   * 1b. DETAY — Belgenin çözümlenmiş içeriği (2026-09-29).
   *
   * Detay ekranının `[Belge]` ve `[Kalemler]` sekmeleri bunu kullanır.
   *
   * ⚠️ NEDEN `getIngestionPlan` YETMİYOR: Plan, EŞLEŞTİRME kararı için üretilir
   * ve bu yüzden mevcut cari/stok listesine bağımlıdır. Kullanıcı yalnız
   * "belgede ne yazıyor" sorusunu sorduğunda tüm kart listesini taramak
   * gereksizdir; ayrıca plan, eşleşmeyen kalem olduğunda kullanıcıya "sen ne
   * yapacaksın" sorusunu sorar. Detay okuması NÖTR olmalıdır.
   *
   * ⚠️ SALT OKUNUR: Hiçbir şey yazmaz, saymaz, işaretlemez. `reviewedAt`
   * işareti ayrı bir uçtadır (bkz. `markReviewed`).
   *
   * Belge içeriği diskte yoksa `NOT_INGESTIBLE` (422) döner: kayıt vardır ama
   * gösterilecek içerik yoktur — bu bir "bulunamadı" değildir.
   */
  public static getDocumentDetail(
    incomingInvoiceId: string,
    tenantId: string
  ): { record: IncomingInvoice; document: ReturnType<typeof parseUblDocument> } {
    const inc = this.findIncoming(incomingInvoiceId, tenantId);
    if (!inc) throw new IncomingDocumentError('NOT_FOUND', 'Gelen fatura kaydı bulunamadı.');

    const xml = inc.xmlStoragePath ? DocumentStorageService.readXml(tenantId, inc.xmlStoragePath) : null;
    if (!xml) {
      throw new IncomingDocumentError(
        'NOT_INGESTIBLE',
        inc.parseErrors?.length
          ? `Belge içeriği okunamadı: ${inc.parseErrors[0]}`
          : 'Belge içeriği diskte bulunamadı; detay gösterilemez. Belgeyi yeniden senkronize edin.'
      );
    }

    return { record: inc, document: parseUblDocument(xml) };
  }

  /**
   * 1c. HAM XML — `[XML]` sekmesi için (2026-09-29).
   *
   * Biçimlendirme isteğe bağlıdır (`pretty`). Ham içerik HİÇ DEĞİŞTİRİLMEZ;
   * girintileme ayrı bir katmanda, saf fonksiyonla yapılır.
   */
  public static getDocumentXml(
    incomingInvoiceId: string,
    tenantId: string
  ): { xml: string; record: IncomingInvoice } {
    const inc = this.findIncoming(incomingInvoiceId, tenantId);
    if (!inc) throw new IncomingDocumentError('NOT_FOUND', 'Gelen fatura kaydı bulunamadı.');
    const xml = inc.xmlStoragePath ? DocumentStorageService.readXml(tenantId, inc.xmlStoragePath) : null;
    if (!xml) {
      throw new IncomingDocumentError(
        'NOT_INGESTIBLE',
        'Belge XML içeriği diskte bulunamadı; yeniden senkronize edin.'
      );
    }
    return { xml, record: inc };
  }

  /**
   * Kullanıcının belgeyi İNCELEDİĞİNİ işaretler (2026-09-29).
   *
   * ⚠️ NEDEN AYRI BİR UÇ: `getIngestionPlan` SALT-OKUNUR olmak zorundadır —
   * sözleşmesi budur ve test bunu doğrular. "Bakıldı" işareti bir YAZMA işidir
   * ve yalnız kullanıcı ekranı gerçekten açtığında atılmalıdır; plan ucunun
   * yan etkisi olarak yazılsaydı, bir listeleme/denetim çağrısı bile belgeyi
   * "bakılmış" göstererek operasyon sayaçlarını yanıltırdı.
   *
   * Boş yazma yapmaz: zaten işaretliyse dokunmaz (gereksiz disk turu yok).
   */
  public static async markReviewed(incomingInvoiceId: string, tenantId: string): Promise<IncomingInvoice> {
    return storage.runTransaction(draft => {
      const inc = this.findIncoming(incomingInvoiceId, tenantId);
      if (!inc) throw new IncomingDocumentError('NOT_FOUND', 'Gelen fatura kaydı bulunamadı.');
      if (!inc.reviewedAt) {
        inc.reviewedAt = new Date().toISOString();
        inc.updatedAt = inc.reviewedAt;
      }
      return inc;
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
    // 2026-09-29: 404 — kayıt yok, "istek bozuk" değil.
    if (!inc) throw new IncomingDocumentError('NOT_FOUND', 'Gelen fatura kaydı bulunamadı.');

    const xml = inc.xmlStoragePath ? DocumentStorageService.readXml(tenantId, inc.xmlStoragePath) : null;
    if (!xml) {
      // 422 — belge VAR ama içeriği yok; yeniden senkron gerekir.
      throw new IncomingDocumentError(
        'NOT_INGESTIBLE',
        'Belge içeriği diskte bulunamadı; eşleştirme yapılamaz. Belgeyi yeniden senkronize edin.'
      );
    }

    const doc = parseUblDocument(xml);
    return buildIngestionPlan(doc, {
      customers: db.customers || [],
      products: db.products || [],
      tenantId,
      // 2026-09-29: öğrenilmiş tedarikçi-ürün eşleştirmeleri. Bu olmadan her
      // faturada aynı eşleştirme yeniden elle yapılırdı.
      savedMappings: db.productSupplierMappings || [],
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
      if (!inc) {
        throw new IncomingDocumentError('NOT_FOUND', 'Gelen fatura kaydı bulunamadı.');
      }
      // ── İDEMPOTENTLİK (2026-09-29) ───────────────────────────────────────
      // ⚠️ Kural SUNUCUDA uygulanır. Arayüzdeki "İçeri Al" düğmesinin kapalı
      // olması bir kolaylıktır, güvence DEĞİLDİR: aynı istek elle (veya iki
      // sekmeden) iki kez gönderilirse iki alış faturası doğar, stok iki kez
      // girer, tedarikçi borcu iki katına çıkar. Bu yüzden burada 409 döneriz.
      if (inc.status === 'CONVERTED_TO_PURCHASE') {
        throw new IncomingDocumentError(
          'ALREADY_INGESTED',
          // ⚠️ "zaten alış faturasına dönüştürülmüş" ifadesi KORUNUR: hem bu
          // davranış sözleşmesi testi hem arayüz bu metne göre karar veriyor.
          // Metni serbestçe değiştirmek, doğru davranan bir kuralı sırf söz
          // dizimi yüzünden kırmızı gösterirdi.
          `Bu belge zaten alış faturasına dönüştürülmüş${inc.convertedPurchaseInvoiceId ? ` (alış faturası: ${inc.convertedPurchaseInvoiceId})` : ''}. ` +
            'Aynı belge ikinci kez içeri alınamaz.'
        );
      }
      if (inc.status === 'UNREADABLE') {
        throw new IncomingDocumentError(
          'NOT_INGESTIBLE',
          `İçeriği okunamayan belge içeri alınamaz: ${inc.parseErrors?.[0] || 'belge okunamadı.'}`
        );
      }
      if (inc.status === 'REJECTED') {
        throw new IncomingDocumentError(
          'INVALID_STATE',
          'Reddedilmiş belge içeri alınamaz. Önce belgeyi entegratörden yeniden çekin.'
        );
      }

      const plan = this.getIngestionPlan(incomingInvoiceId, tenantId);
      if (plan.blockedReason) {
        throw new IncomingDocumentError('NOT_INGESTIBLE', `Belge içeri aktarılamaz: ${plan.blockedReason}`);
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
      const items: Array<{
        productId: string; quantity: number; unitPrice: number; vatRate: number; discount1?: number;
      }> = [];

      /**
       * Öğrenilecek eşleştirmeler (2026-09-29).
       *
       * ⚠️ YALNIZ KULLANICININ AÇIK KARARI öğrenilir (`karar.productId`).
       * Otomatik eşleşen satırlar öğrenilmez: bir kez yapılan YANLIŞ otomatik
       * eşleşme hafızaya yazılırsa kalıcı hâle gelir ve kullanıcı nedenini
       * anlamadığı bir öneriyi her faturada görür.
       */
      const ogrenilecek: Array<{ lineNo: string; supplierItemCode: string; barcode?: string; productId: string }> = [];

      for (const lm of plan.lines) {
        const karar = kararlar.get(lm.line.lineNo);
        let product: Product | undefined;
        let kullaniciSecti = false;

        if (karar?.productId) {
          product = (draft.products || []).find(p => p.id === karar.productId);
          if (!product) throw new Error(`Seçilen ürün kartı bulunamadı (satır ${lm.line.lineNo}).`);
          kullaniciSecti = true;
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

        // Kullanıcı bir kart SEÇTİYSE bu karar öğrenilir (tedarikçi kapsamlı).
        if (kullaniciSecti) {
          const kod = lm.line.sellerProductCode || lm.line.barcode || lm.line.buyerProductCode
            || lm.line.manufacturerProductCode;
          if (kod) {
            ogrenilecek.push({
              lineNo: lm.line.lineNo,
              supplierItemCode: kod,
              ...(lm.line.barcode ? { barcode: lm.line.barcode } : {}),
              productId: product.id,
            });
          }
        }

        items.push({
          productId: product.id,
          quantity: lm.line.quantity,
          unitPrice: lm.line.unitPrice,
          vatRate: lm.line.vatRate,
          // ⚠️ 2026-09-29: Belgede satır iskontosu varsa YÜZDE olarak geçilir.
          // Geçilmezse fatura motoru brüt tutarı esas alır ve alış faturası
          // tedarikçi belgesinden YÜKSEK çıkar (cari borç + stok maliyeti şişer).
          ...(discountPercentForLine(lm.line) !== undefined
            ? { discount1: discountPercentForLine(lm.line)! }
            : {}),
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
          // KDV dışı vergi varsa fark AÇIKÇA yazılır: sessizce yutmak, cari
          // borcun belgedeki ödenecek tutardan küçük olmasına yol açar ve
          // kullanıcı nedenini bulamazdı.
          (plan.totals.otherTaxTotal
            ? ` Belgede KDV dışı vergi var (${plan.totals.otherTaxTotal.toFixed(2)} ${inc.currency}): belgenin ödenecek tutarı ${plan.totals.computedPayableTotal?.toFixed(2) ?? '-'}; bu vergi alış faturasına ayrıca eklenmedi, maliyet kaydını elle doğrulayın.`
            : '') +
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

      // ── Öğrenilen eşleştirmeleri yaz (2026-09-29) ────────────────────────
      // Tedarikçi kapsamlı: anahtar `supplierTaxNumber + supplierProductCode`.
      // Bir sonraki aynı tedarikçi belgesinde bu kod otomatik önerilir.
      const yeniEslesmeler = buildMappingRecords(
        ogrenilecek,
        draft.productSupplierMappings || [],
        {
          tenantId,
          // Belgedeki VKN esastır; yoksa mevcut kayda düşülür.
          supplierTaxNumber: plan.document.supplier.taxNumber || inc.supplierTaxNumber || '',
          now: new Date().toISOString(),
        }
      );
      if (yeniEslesmeler.length > 0) {
        if (!draft.productSupplierMappings) draft.productSupplierMappings = [];
        for (const y of yeniEslesmeler) {
          const idx = draft.productSupplierMappings.findIndex(m => m.id === y.id);
          if (idx >= 0) draft.productSupplierMappings[idx] = y;
          else draft.productSupplierMappings.push(y);
        }
      }

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
          `(${items.length} kalem, tedarikçi: ${supplier.title}, ETTN: ${inc.uuid}, tutar: ${purchaseInvoice.grandTotal.toFixed(2)} ${inc.currency}). ` +
          `Stok girişi ve cari borç bu onayla oluştu.` +
          (yeniEslesmeler.length > 0 ? ` ${yeniEslesmeler.length} ürün eşleştirmesi öğrenildi.` : '') +
          (inc.parseWarnings?.length ? ` Uyarılar: ${inc.parseWarnings.join(' ')}` : ''),
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
