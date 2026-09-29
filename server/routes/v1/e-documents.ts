import { Router, Request, Response } from 'express';
import { storage } from '../../db/storage';
import { PERMISSIONS, requireAuth, requirePermission, resolveTenant } from '../../middleware/authGuards';
import { ElectronicDocumentService } from '../../services/electronicDocumentService';
import { IncomingInvoiceService } from '../../services/incomingInvoiceService';
import { IncomingDespatchService } from '../../services/incomingDespatchService';
import { DocumentStorageService } from '../../services/documentStorageService';
import { ProviderConfigurationError, ProviderTransportError } from '../../services/providers/providerFactory';
import { IncomingDocumentError } from '../../errors/incomingDocumentError';
import {
  operationalStatus,
  operasyonDurumunaUygun,
  urunIndeksiKur,
  sayilariTopla,
  type OperationalStatus,
  type RawStatus,
} from '../../services/incomingDocumentStatus';
import { renderIncomingDocumentHtml } from '../../services/ubl/incomingDocumentRenderer';
import { formatXmlForDisplay } from '../../services/ubl/xmlPrettyPrint';
import type { SyncSummary } from '../../services/incomingSyncContract';

export const v1EDocumentsRouter = Router();

v1EDocumentsRouter.use(requireAuth, resolveTenant);

/**
 * 2026-09-12: Entegratör hatalarını SINIFINA göre ayırır:
 *   - yapılandırma eksiği  → 503 + `configured: false` (kurulum sorunu)
 *   - entegratöre ulaşılamama → 502 (üst bağımlılık arızası)
 *   - diğer (doğrulama vb.)   → 400 (istemci kusuru)
 * Önceden ilk ikisi de 400'e düşüyor ve kurulum/ağ arızası "belge geçersiz"
 * gibi görünüp kullanıcıyı yanıltıyordu.
 */
function belgeHatasi(res: Response, err: any) {
  // 2026-09-29 — GELEN BELGE ALAN HATASI KENDİ DURUM KODUNU TAŞIR.
  //
  // ⚠️ NEDEN: Bu akışta "bu belge zaten içeri alınmış" (409) ile "isteğin
  // bozuk" (400) AYNI ŞEY DEĞİLDİR. Hepsi 400 dönerse istemci "bir daha
  // denersem düzelir" sanır ve aynı isteği tekrarlar; oysa mükerrer içeri alma
  // denemesi KALICI bir çakışmadır ve tekrarlanmamalıdır. Ayrıca idempotentlik
  // kuralı yalnız arayüz düğmesinin kapalı olmasına dayanamaz — sunucu da bunu
  // makine tarafından okunabilir bir kodla bildirmelidir.
  if (IncomingDocumentError.is(err)) {
    return res.status(err.httpStatus).json({ success: false, code: err.code, message: err.message });
  }
  return entegratorHatasi(res, err);
}

/**
 * SENKRON SONUÇ MESAJI (§5) — "12 belge bulundu / 8 yeni / 4 zaten mevcut / 0 hata".
 *
 * ⚠️ NEDEN TEK YERDE: fatura ve irsaliye sekmeleri aynı cümleyi kurmak
 * zorundadır. İki ayrı metin zamanla birbirinden ayrışır ve kullanıcı iki
 * sekmede farklı biçimde bilgilendirilir.
 *
 * ⚠️ Mesajda ASLA kimlik bilgisi/token/parola bulunmaz — yalnız sayılar ve
 * tarihler. Belge bazlı hataların ayrıntısı `result.documents` içindedir.
 */
function syncOzetMesaji(r: SyncSummary, tur: string): string {
  const parcalar = [
    `${r.foundCount} ${tur} bulundu`,
    `${r.newCount} yeni`,
    `${r.duplicateCount} zaten mevcut`,
    `${r.errorCount} hatalı`,
  ];
  if (r.updatedCount > 0) parcalar.push(`${r.updatedCount} güncellendi`);
  if (r.skippedCount > 0) parcalar.push(`${r.skippedCount} belge sınır nedeniyle ertelendi`);
  return (
    `${parcalar.join(' / ')}. Stok ve cari DEĞİŞMEDİ; içeri aktarma onayınızı bekliyor.` +
    (r.rangeAdjustment ? ` Not: ${r.rangeAdjustment}` : '')
  );
}

function entegratorHatasi(res: Response, err: any) {
  if (ProviderConfigurationError.is(err)) {
    return res.status(503).json({ success: false, configured: false, message: err.message });
  }
  // 2026-09-12: Entegratöre ULAŞILAMAMA da sunucu tarafı bir arızadır, istemci
  // kusuru değil. Önceden bu durum 400 dönüyordu; "senin isteğin bozuk" demek
  // yanıltıcıdır ve istemcinin retry/uyarı mantığını saptırır.
  if (ProviderTransportError.is(err)) {
    return res.status(502).json({ success: false, message: err.message });
  }
  return res.status(400).json({ success: false, message: err?.message || 'İşlem başarısız.' });
}

/**
 * GET /api/v1/e-documents
 * Giden ve gelen tüm elektronik belgeleri sayfalanmış listeler
 */
v1EDocumentsRouter.get('/', requirePermission(PERMISSIONS.EINVOICE_VIEW), (req: Request, res: Response) => {
  const tenantId = req.tenantId!;
  const {
    page = '1',
    limit = '25',
    type,
    status,
    direction = 'OUTGOING',
    search = '',
    startDate,
    endDate,
  } = req.query as Record<string, string>;

  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.max(1, Math.min(100, parseInt(limit, 10) || 25));

  const db = storage.getState();
  let list = (db.electronicDocuments || []).filter(
    d => (d.tenantId === tenantId || (tenantId === 'tnt-isbey' && !d.tenantId))
  );

  if (direction && direction !== 'ALL') {
    list = list.filter(d => d.documentDirection === direction);
  }

  if (type && type !== 'ALL') {
    list = list.filter(d => d.documentType === type);
  }

  if (status && status !== 'ALL') {
    list = list.filter(d => d.status === status);
  }

  if (startDate) {
    list = list.filter(d => d.createdAt >= startDate);
  }

  if (endDate) {
    list = list.filter(d => d.createdAt <= endDate);
  }

  if (search.trim()) {
    const q = search.trim().toLowerCase();
    list = list.filter(
      d =>
        d.documentNumber?.toLowerCase().includes(q) ||
        d.uuid?.toLowerCase().includes(q) ||
        d.receiverTitle?.toLowerCase().includes(q) ||
        d.receiverIdentifier?.includes(q)
    );
  }

  list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const total = list.length;
  const startIndex = (pageNum - 1) * limitNum;
  const paginated = list.slice(startIndex, startIndex + limitNum);

  const summary = {
    totalDocuments: list.length,
    queued: list.filter(d => d.status === 'QUEUED' || d.status === 'SENDING').length,
    sent: list.filter(d => d.status === 'SENT').length,
    accepted: list.filter(d => d.status === 'ACCEPTED').length,
    rejected: list.filter(d => d.status === 'REJECTED').length,
    failed: list.filter(d => d.status === 'FAILED').length,
  };

  res.json({
    success: true,
    data: paginated,
    pagination: { total, page: pageNum, limit: limitNum, totalPages: Math.ceil(total / limitNum) },
    summary,
  });
});

/**
 * POST /api/v1/e-documents/send-invoice
 * Faturayı e-Fatura / e-Arşiv kuyruğuna alır
 */
v1EDocumentsRouter.post('/send-invoice', requirePermission(PERMISSIONS.INVOICES_SEND), async (req: Request, res: Response) => {
  const tenantId = req.tenantId!;
  const user = req.user!;
  const { invoiceId, profile } = req.body;

  if (!invoiceId) {
    return res.status(400).json({ success: false, message: 'Fatura ID (invoiceId) zorunludur.' });
  }

  try {
    const doc = await ElectronicDocumentService.queueInvoice({
      invoiceId,
      tenantId,
      profile,
      userId: user.id,
      username: user.fullName || user.username,
    });
    res.status(202).json({
      success: true,
      message: 'Fatura başarıyla e-Belge gönderim kuyruğuna alındı.',
      document: doc,
    });
  } catch (err: any) {
    return entegratorHatasi(res, err);
  }
});

/**
 * POST /api/v1/e-documents/send-waybill
 * İrsaliyeyi e-İrsaliye kuyruğuna alır
 */
v1EDocumentsRouter.post('/send-waybill', requirePermission(PERMISSIONS.WAYBILLS_CREATE), async (req: Request, res: Response) => {
  const tenantId = req.tenantId!;
  const user = req.user!;
  const { waybillId } = req.body;

  if (!waybillId) {
    return res.status(400).json({ success: false, message: 'İrsaliye ID (waybillId) zorunludur.' });
  }

  try {
    const doc = await ElectronicDocumentService.queueWaybill({
      waybillId,
      tenantId,
      userId: user.id,
      username: user.fullName || user.username,
    });
    res.status(202).json({
      success: true,
      message: 'İrsaliye başarıyla e-İrsaliye kuyruğuna alındı.',
      document: doc,
    });
  } catch (err: any) {
    return entegratorHatasi(res, err);
  }
});

/**
 * GET /api/v1/e-documents/:id
 * Belge detay kartı ve durum timeline'ı
 */
v1EDocumentsRouter.get('/:id', requirePermission(PERMISSIONS.EINVOICE_VIEW), (req: Request, res: Response) => {
  const tenantId = req.tenantId!;
  const db = storage.getState();
  const doc = (db.electronicDocuments || []).find(
    d => d.id === req.params.id && (d.tenantId === tenantId || (tenantId === 'tnt-isbey' && !d.tenantId))
  );

  if (!doc) return res.status(404).json({ success: false, message: 'Elektronik belge bulunamadı.' });

  res.json({ success: true, document: doc });
});

/**
 * GET /api/v1/e-documents/:id/status
 * Entegratörden anlık durum senkronizasyonu yapar
 */
v1EDocumentsRouter.get('/:id/status', requirePermission(PERMISSIONS.EINVOICE_VIEW), async (req: Request, res: Response) => {
  const tenantId = req.tenantId!;
  try {
    const doc = await ElectronicDocumentService.syncDocumentStatus(String(req.params.id), tenantId);
    res.json({ success: true, document: doc });
  } catch (err: any) {
    return entegratorHatasi(res, err);
  }
});

/**
 * GET /api/v1/e-documents/:id/xml
 * Belgenin UBL-TR XML içeriğini döner
 */
v1EDocumentsRouter.get('/:id/xml', requirePermission(PERMISSIONS.EINVOICE_VIEW), (req: Request, res: Response) => {
  const tenantId = req.tenantId!;
  const db = storage.getState();
  const doc = (db.electronicDocuments || []).find(
    d => d.id === req.params.id && (d.tenantId === tenantId || (tenantId === 'tnt-isbey' && !d.tenantId))
  );

  if (!doc || !doc.xmlStoragePath) {
    return res.status(404).json({ success: false, message: 'Belgeye ait XML dosyası bulunamadı.' });
  }

  try {
    const xml = DocumentStorageService.readXml(tenantId, doc.xmlStoragePath);
    if (!xml) return res.status(404).json({ success: false, message: 'XML dosyası okunamadı.' });

    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.send(xml);
  } catch (err: any) {
    res.status(403).json({ success: false, message: err.message });
  }
});

// ──────────────────────────────────────────────────────────
// GELEN E-FATURA ENDPOINTLERİ
// ──────────────────────────────────────────────────────────

/**
 * GET /api/v1/e-documents/incoming/list
 */
v1EDocumentsRouter.get('/incoming/list', requirePermission(PERMISSIONS.EINVOICE_VIEW), (req: Request, res: Response) => {
  const tenantId = req.tenantId!;
  const {
    page = '1',
    limit = '25',
    status,
    search = '',
    startDate,
    endDate,
    supplierTaxNumber,
    documentNo,
    ettn,
    documentType = 'ALL',
  } = req.query as Record<string, string>;

  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.max(1, Math.min(100, parseInt(limit, 10) || 25));

  const db = storage.getState();
  const hepsi = (db.incomingInvoices || []).filter(
    inv => (inv.tenantId === tenantId || (tenantId === 'tnt-isbey' && !inv.tenantId))
  );

  // ── OPERASYON DURUMU (2026-09-29) ─────────────────────────────────────
  // Ürün indeksi LİSTE BAŞINA BİR KEZ kurulur; her belge için yeniden aramak
  // 100 belge × 5000 ürün karşılaştırması demekti.
  const idx = urunIndeksiKur(db.products || []);
  const durumlu = hepsi.map(inv => ({
    kayit: inv,
    durum: operationalStatus(
      inv.status as RawStatus,
      inv.items || [],
      idx,
      !!inv.reviewedAt
    ) as OperationalStatus,
  }));

  // Sayaçlar SÜZGEÇTEN ÖNCE hesaplanır: pano kartları ve sekme rozetleri
  // "toplamda kaç belge şu durumda" sorusunu yanıtlar. Süzgeçten sonra
  // hesaplansaydı, kullanıcı bir süzgeç uyguladığında sayaçlar kendi kendini
  // sıfırlar ve geri kalan iş görünmez olurdu.
  const sayaclar = sayilariTopla(durumlu.map(d => d.durum));

  let list = durumlu;
  // `status` artık OPERASYON durumunu süzer (NEW/PENDING_MATCH/…). Ham durum
  // (RECEIVED vb.) de kabul edilir ki eski istemciler kırılmasın.
  if (status && status !== 'ALL') {
    const operasyonel = ['NEW', 'PENDING_MATCH', 'READY', 'INGESTED', 'ERROR'];
    list = operasyonel.includes(status)
      ? list.filter(d => operasyonDurumunaUygun(d.durum, status))
      : list.filter(d => d.kayit.status === status);
  }

  // Belge türü: gelen kutusu fatura ve irsaliyeyi birlikte döndürebilir.
  if (documentType && documentType !== 'ALL') {
    list = list.filter(d => (d.kayit.documentKind || 'INVOICE') === documentType);
  }

  if (startDate) list = list.filter(d => (d.kayit.issueDate || '') >= startDate);
  if (endDate) list = list.filter(d => (d.kayit.issueDate || '') <= endDate);
  if (supplierTaxNumber) {
    const v = supplierTaxNumber.replace(/[^0-9]/g, '');
    list = list.filter(d => (d.kayit.supplierTaxNumber || '').replace(/[^0-9]/g, '') === v);
  }
  if (documentNo) {
    const v = documentNo.toLowerCase();
    list = list.filter(d => d.kayit.invoiceNo?.toLowerCase().includes(v));
  }
  if (ettn) {
    const v = ettn.toLowerCase();
    list = list.filter(d => d.kayit.uuid?.toLowerCase().includes(v));
  }

  if (search.trim()) {
    const q = search.trim().toLowerCase();
    list = list.filter(
      d =>
        d.kayit.invoiceNo?.toLowerCase().includes(q) ||
        d.kayit.supplierTitle?.toLowerCase().includes(q) ||
        d.kayit.supplierTaxNumber?.includes(q) ||
        d.kayit.uuid?.toLowerCase().includes(q)
    );
  }

  list = [...list].sort(
    (a, b) => new Date(b.kayit.issueDate).getTime() - new Date(a.kayit.issueDate).getTime()
  );

  const total = list.length;
  const startIndex = (pageNum - 1) * limitNum;
  const paginated = list.slice(startIndex, startIndex + limitNum);

  res.json({
    success: true,
    // `operationalStatus` kaydın KENDİSİNE yazılmaz (türetilmiştir); yanıtta
    // ayrı bir alan olarak döner ki arayüz belge verisini kirletmesin.
    data: paginated.map(d => ({ ...d.kayit, operationalStatus: d.durum })),
    // Sayaçlar (pano kartları ve sekme rozetleri).
    statusCounts: sayaclar,
    pagination: { total, page: pageNum, limit: limitNum, totalPages: Math.ceil(total / limitNum) },
  });
});

/**
 * POST /api/v1/e-documents/incoming/sync
 */
v1EDocumentsRouter.post('/incoming/sync', requirePermission(PERMISSIONS.EINVOICE_VIEW), async (req: Request, res: Response) => {
  const tenantId = req.tenantId!;
  // Geriye dönük uyum: eski gövde `{ startDate }` idi; yeni gövde
  // `{ preset, startDate, endDate }`. İkisi de kabul edilir — arayüz
  // güncellenmeden de eski çağrılar çalışmaya devam eder.
  const { preset, startDate, endDate } = (req.body || {}) as {
    preset?: any;
    startDate?: string;
    endDate?: string;
  };

  try {
    const result = await IncomingInvoiceService.syncIncomingInvoices(
      tenantId,
      preset || startDate || endDate ? { preset, startDate, endDate } : undefined,
      { userId: req.user!.id, username: req.user!.fullName || req.user!.username }
    );
    res.json({ success: true, message: syncOzetMesaji(result, 'e-Fatura'), result });
  } catch (err: any) {
    return entegratorHatasi(res, err);
  }
});

/**
 * GET /api/v1/e-documents/incoming/:id/detail
 *
 * DETAY EKRANI VERİSİ (2026-09-29): belgenin çözümlenmiş içeriği + kaydın
 * kendisi. **Hiçbir şey yazmaz.**
 *
 * ⚠️ PLAN UCUNDAN FARKI: Plan, eşleştirme KARARI için üretilir ve mevcut
 * cari/stok listesine bağlıdır. Detay ise nötr bir okumadır: "belgede ne
 * yazıyor" sorusunu yanıtlar ve hiçbir kart listesi taramaz. Ayrıca plan
 * ucu, içeriği olmayan belgede 422 dönerken detay ucu daha açıklayıcı bir
 * gerekçe verir.
 *
 * `reviewedAt` işareti BURADAN atılmaz: detayı görmek, eşleştirme ekranını
 * açmakla aynı şey değildir.
 */
v1EDocumentsRouter.get(
  '/incoming/:id/detail',
  requirePermission(PERMISSIONS.EINVOICE_VIEW),
  (req: Request, res: Response) => {
    const tenantId = req.tenantId!;
    try {
      const { record, document } = IncomingInvoiceService.getDocumentDetail(String(req.params.id), tenantId);
      res.json({ success: true, record, document });
    } catch (err: any) {
      return belgeHatasi(res, err);
    }
  }
);

/**
 * GET /api/v1/e-documents/incoming/:id/xml
 *
 * Belgenin HAM UBL XML'i. `?pretty=1` verilirse girintilenir.
 *
 * ⚠️ Ham içerik DEĞİŞTİRİLMEZ: girintileme ayrı bir saf fonksiyonda yapılır ve
 * yalnız etiketler arasına boşluk ekler. Belgeyi ağaca çevirip yeniden
 * serileştirmek (ad alanı/nitelik sırasını değiştirirdi) yapılmaz —
 * kullanıcı gördüğü XML'in belgedeki XML olduğundan emin olmalıdır.
 *
 * Yanıt JSON'dur (düz metin değil): biçimlendirme uygulanmadıysa NEDEN
 * uygulanmadığı da bildirilir; sessizce ham içerik dönmek yanıltıcı olurdu.
 */
v1EDocumentsRouter.get(
  '/incoming/:id/xml',
  requirePermission(PERMISSIONS.EINVOICE_VIEW),
  (req: Request, res: Response) => {
    const tenantId = req.tenantId!;
    try {
      const { xml } = IncomingInvoiceService.getDocumentXml(String(req.params.id), tenantId);
      const istenen = req.query.pretty === '1' || req.query.pretty === 'true';
      if (!istenen) {
        return res.json({ success: true, xml, formatted: false });
      }
      const bicim = formatXmlForDisplay(xml);
      res.json({ success: true, xml: bicim.xml, formatted: bicim.formatted, ...(bicim.reason ? { reason: bicim.reason } : {}) });
    } catch (err: any) {
      return belgeHatasi(res, err);
    }
  }
);

/**
 * GET /api/v1/e-documents/incoming/:id/visual
 *
 * `[Görsel]` sekmesi: belgenin A4 görünümü.
 *
 * ⚠️ ŞABLON SEÇİMİ BİLİNÇLİDİR: Gelen belge TEDARİKÇİNİN belgesidir. Onu bizim
 * giden-fatura şablonumuzla (logo, IBAN, alt not) basmak, karşı firmanın
 * faturasına BİZİM banka hesabımızı koymak olurdu. Entegratör sözleşmesi
 * (`electronicDocumentProvider.ts`) bir XSLT DÖNDÜRMÜYOR — yani "sağlayıcı
 * XSLT'si varsa onu kullan" kolu bugün için BOŞTUR ve uydurma şablonla
 * doldurulmaz. Bu yüzden görünüm doğrudan belgenin kendi alanlarından üretilir;
 * hiçbir değer hesaplanmaz.
 */
v1EDocumentsRouter.get(
  '/incoming/:id/visual',
  requirePermission(PERMISSIONS.EINVOICE_VIEW),
  (req: Request, res: Response) => {
    const tenantId = req.tenantId!;
    try {
      const { document } = IncomingInvoiceService.getDocumentDetail(String(req.params.id), tenantId);
      res.json({
        success: true,
        // `renderedBy: 'client'` → istemci bu HTML'i sandbox'lı iframe'de gösterir.
        renderedBy: 'client',
        html: renderIncomingDocumentHtml(document),
      });
    } catch (err: any) {
      return belgeHatasi(res, err);
    }
  }
);

/**
 * GET /api/v1/e-documents/incoming/:id/plan
 *
 * Onay ekranının verisini üretir: belgenin çözümlenmiş içeriği + tedarikçi ve
 * ürün eşleştirme ÖNERİLERİ. **Hiçbir şey yazmaz.**
 *
 * 2026-09-28: Ayrı bir uç olmasının nedeni, kullanıcının stok/cari üzerinde
 * etki yaratmadan eşleştirmeyi gözden geçirebilmesidir.
 */
v1EDocumentsRouter.get(
  '/incoming/:id/plan',
  requirePermission(PERMISSIONS.EINVOICE_VIEW),
  (req: Request, res: Response) => {
    const tenantId = req.tenantId!;
    try {
      const plan = IncomingInvoiceService.getIngestionPlan(String(req.params.id), tenantId);
      res.json({ success: true, plan });
    } catch (err: any) {
      return belgeHatasi(res, err);
    }
  }
);

/**
 * POST /api/v1/e-documents/incoming/:id/reviewed
 *
 * Kullanıcının belgeyi İNCELEDİĞİNİ işaretler. **Hiçbir malî etkisi yoktur.**
 *
 * ⚠️ NEDEN GEREKLİ: "Yeni" ile "Eşleştirme Bekliyor" arasındaki fark yalnız
 * "kullanıcı baktı mı" sorusundadır; belgenin kendi verisinden çıkarılamaz.
 * Bu işaret olmadan operasyon listesi yeni gelen belgeleri ayırt edemez.
 *
 * Yetki: `einvoice.view` — çünkü bu bir OKUMA davranışının kaydıdır, belge
 * üzerinde değişiklik yapmaz ve malî sonuç doğurmaz.
 */
v1EDocumentsRouter.post(
  '/incoming/:id/reviewed',
  requirePermission(PERMISSIONS.EINVOICE_VIEW),
  async (req: Request, res: Response) => {
    const tenantId = req.tenantId!;
    try {
      const kayit = await IncomingInvoiceService.markReviewed(String(req.params.id), tenantId);
      res.json({ success: true, invoice: kayit });
    } catch (err: any) {
      return belgeHatasi(res, err);
    }
  }
);

/**
 * POST /api/v1/e-documents/incoming-despatches/:id/reviewed
 * (fatura akışıyla aynı — bkz. yukarıdaki not)
 */
v1EDocumentsRouter.post(
  '/incoming-despatches/:id/reviewed',
  requirePermission(PERMISSIONS.WAYBILLS_VIEW),
  async (req: Request, res: Response) => {
    const tenantId = req.tenantId!;
    try {
      const kayit = await IncomingDespatchService.markReviewed(String(req.params.id), tenantId);
      res.json({ success: true, despatch: kayit });
    } catch (err: any) {
      return belgeHatasi(res, err);
    }
  }
);

/**
 * POST /api/v1/e-documents/incoming/:id/convert
 *
 * Gelen belgeyi ONAYLANAN eşleştirmelerle alış faturasına dönüştürür.
 * Stok girişi ve tedarikçi borcu YALNIZ bu çağrıda oluşur.
 *
 * Gövde (hepsi isteğe bağlı; verilmeyen kalemler için otomatik eşleşme
 * kullanılır, eşleşme de yoksa yeni kart açılır):
 *   { supplierId?, createSupplier?, lines?: [{ lineNo, productId?, createProduct? }] }
 */
v1EDocumentsRouter.post('/incoming/:id/convert', requirePermission(PERMISSIONS.INVOICES_CREATE), async (req: Request, res: Response) => {
  const tenantId = req.tenantId!;
  const user = req.user!;
  const { supplierId, createSupplier, lines } = req.body || {};

  try {
    const invoice = await IncomingInvoiceService.approveAndConvert(
      String(req.params.id),
      tenantId,
      user.id,
      user.fullName || user.username,
      { supplierId, createSupplier, lines }
    );
    res.status(201).json({
      success: true,
      message: 'Gelen fatura onaylandı; alış faturası, stok girişi ve tedarikçi borcu oluşturuldu.',
      invoice,
    });
  } catch (err: any) {
    // ALREADY_INGESTED → 409, NOT_FOUND → 404, NOT_INGESTIBLE → 422.
    return belgeHatasi(res, err);
  }
});

// ──────────────────────────────────────────────────────────
// GELEN e-İRSALİYE (e-DespatchAdvice) — 2026-09-28
//
// e-Fatura akışıyla AYNI üç aşama, ama farklı sonuç: onay STOK GİRİŞİ yapar,
// CARİ BORÇ OLUŞTURMAZ (irsaliye mali belge değildir). Uçlar ayrı tutulur ki
// iki akışın yetkileri ve yan etkileri karışmasın.
// ──────────────────────────────────────────────────────────

/**
 * GET /api/v1/e-documents/incoming-despatches/list
 *
 * 2026-09-28: Sayfalama sözleşmesi gelen e-Fatura ucuyla (`/incoming/list`)
 * BİREBİR eşitlendi: `page / limit / total / totalPages`. Önceden bu uç tüm
 * listeyi tek yanıtta döndürüyordu; gelen kutusu büyüdükçe yanıt sınırsız
 * şişiyor ve iki sekme farklı davranıyordu.
 *
 * Geriye dönük uyum: `incomingDespatches` alanı KORUNUR (sayfalanmış dilim).
 * Böylece eski istemciler kırılmaz; yalnız `data` + `pagination` eklenir.
 */
v1EDocumentsRouter.get(
  '/incoming-despatches/list',
  requirePermission(PERMISSIONS.WAYBILLS_VIEW),
  (req: Request, res: Response) => {
    const tenantId = req.tenantId!;
    const {
      page = '1',
      limit = '25',
      status,
      search = '',
      startDate,
      endDate,
      supplierTaxNumber,
      documentNo,
      ettn,
    } = req.query as Record<string, string>;

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.max(1, Math.min(100, parseInt(limit, 10) || 25));

    const db = storage.getState();
    const hepsi = (db.incomingDespatches || []).filter(
      d => d.tenantId === tenantId || (tenantId === 'tnt-isbey' && !d.tenantId)
    );

    // Operasyon durumu — fatura listesiyle AYNI kurallar (tek kaynak:
    // `incomingDocumentStatus`). İki sekmenin farklı sayması, kullanıcıya
    // hangi sayının doğru olduğunu bilemediği bir tablo gösterirdi.
    const idx = urunIndeksiKur(db.products || []);
    const durumlu = hepsi.map(d => ({
      kayit: d,
      durum: operationalStatus(
        d.status as RawStatus,
        d.items || [],
        idx,
        !!d.reviewedAt
      ) as OperationalStatus,
    }));

    const sayaclar = sayilariTopla(durumlu.map(d => d.durum));

    let list = durumlu;
    if (status && status !== 'ALL') {
      const operasyonel = ['NEW', 'PENDING_MATCH', 'READY', 'INGESTED', 'ERROR'];
      list = operasyonel.includes(status)
        ? list.filter(d => operasyonDurumunaUygun(d.durum, status))
        : list.filter(d => d.kayit.status === status);
    }

    if (startDate) list = list.filter(d => (d.kayit.issueDate || '') >= startDate);
    if (endDate) list = list.filter(d => (d.kayit.issueDate || '') <= endDate);
    if (supplierTaxNumber) {
      const v = supplierTaxNumber.replace(/[^0-9]/g, '');
      list = list.filter(d => (d.kayit.supplierTaxNumber || '').replace(/[^0-9]/g, '') === v);
    }
    if (documentNo) {
      const v = documentNo.toLowerCase();
      list = list.filter(d => d.kayit.despatchNo?.toLowerCase().includes(v));
    }
    if (ettn) {
      const v = ettn.toLowerCase();
      list = list.filter(d => d.kayit.uuid?.toLowerCase().includes(v));
    }

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        d =>
          d.kayit.despatchNo?.toLowerCase().includes(q) ||
          d.kayit.supplierTitle?.toLowerCase().includes(q) ||
          d.kayit.supplierTaxNumber?.includes(q) ||
          d.kayit.uuid?.toLowerCase().includes(q)
      );
    }

    list = [...list].sort(
      (a, b) => new Date(b.kayit.issueDate).getTime() - new Date(a.kayit.issueDate).getTime()
    );

    const total = list.length;
    const startIndex = (pageNum - 1) * limitNum;
    const paginated = list.slice(startIndex, startIndex + limitNum);
    const dilim = paginated.map(d => ({ ...d.kayit, operationalStatus: d.durum }));

    res.json({
      success: true,
      data: dilim,
      statusCounts: sayaclar,
      // Geriye dönük uyum: `incomingDespatches` KORUNUR.
      incomingDespatches: dilim,
      pagination: { total, page: pageNum, limit: limitNum, totalPages: Math.ceil(total / limitNum) },
      total,
    });
  }
);

/**
 * POST /api/v1/e-documents/incoming-despatches/sync
 */
v1EDocumentsRouter.post(
  '/incoming-despatches/sync',
  requirePermission(PERMISSIONS.WAYBILLS_VIEW),
  async (req: Request, res: Response) => {
    const tenantId = req.tenantId!;
    const { preset, startDate, endDate } = (req.body || {}) as {
      preset?: any; startDate?: string; endDate?: string;
    };
    try {
      const result = await IncomingDespatchService.syncIncomingDespatches(
        tenantId,
        preset || startDate || endDate ? { preset, startDate, endDate } : undefined,
        { userId: req.user!.id, username: req.user!.fullName || req.user!.username }
      );
      res.json({ success: true, message: syncOzetMesaji(result, 'gelen irsaliye'), result });
    } catch (err: any) {
      return entegratorHatasi(res, err);
    }
  }
);

/**
 * GET /api/v1/e-documents/incoming-despatches/:id/detail — SALT OKUNUR.
 * (fatura akışıyla aynı sözleşme; bkz. `/incoming/:id/detail` notu)
 */
v1EDocumentsRouter.get(
  '/incoming-despatches/:id/detail',
  requirePermission(PERMISSIONS.WAYBILLS_VIEW),
  (req: Request, res: Response) => {
    const tenantId = req.tenantId!;
    try {
      const { record, document } = IncomingDespatchService.getDocumentDetail(String(req.params.id), tenantId);
      res.json({ success: true, record, document });
    } catch (err: any) {
      return belgeHatasi(res, err);
    }
  }
);

/** GET /api/v1/e-documents/incoming-despatches/:id/xml — HAM içerik. */
v1EDocumentsRouter.get(
  '/incoming-despatches/:id/xml',
  requirePermission(PERMISSIONS.WAYBILLS_VIEW),
  (req: Request, res: Response) => {
    const tenantId = req.tenantId!;
    try {
      const { xml } = IncomingDespatchService.getDocumentXml(String(req.params.id), tenantId);
      const istenen = req.query.pretty === '1' || req.query.pretty === 'true';
      if (!istenen) return res.json({ success: true, xml, formatted: false });
      const bicim = formatXmlForDisplay(xml);
      res.json({ success: true, xml: bicim.xml, formatted: bicim.formatted, ...(bicim.reason ? { reason: bicim.reason } : {}) });
    } catch (err: any) {
      return belgeHatasi(res, err);
    }
  }
);

/** GET /api/v1/e-documents/incoming-despatches/:id/visual — A4 görünüm. */
v1EDocumentsRouter.get(
  '/incoming-despatches/:id/visual',
  requirePermission(PERMISSIONS.WAYBILLS_VIEW),
  (req: Request, res: Response) => {
    const tenantId = req.tenantId!;
    try {
      const { document } = IncomingDespatchService.getDocumentDetail(String(req.params.id), tenantId);
      res.json({
        success: true,
        renderedBy: 'client',
        html: renderIncomingDocumentHtml(document),
      });
    } catch (err: any) {
      return belgeHatasi(res, err);
    }
  }
);

/**
 * GET /api/v1/e-documents/incoming-despatches/:id/plan — YAZMAZ.
 */
v1EDocumentsRouter.get(
  '/incoming-despatches/:id/plan',
  requirePermission(PERMISSIONS.WAYBILLS_VIEW),
  (req: Request, res: Response) => {
    const tenantId = req.tenantId!;
    try {
      const plan = IncomingDespatchService.getIngestionPlan(String(req.params.id), tenantId);
      res.json({ success: true, plan });
    } catch (err: any) {
      return belgeHatasi(res, err);
    }
  }
);

/**
 * POST /api/v1/e-documents/incoming-despatches/:id/approve
 *
 * Onaylanan irsaliye için STOK GİRİŞİ oluşturur. Cari borç OLUŞMAZ.
 *
 * 2026-09-28: Yetki `waybills.create`'ten `waybills.approve`'a alındı. `create`
 * GİDEN sevk irsaliyesi kesmektir; bura ise gelen malı kaydetmektir. Aynı kod
 * kullanılınca muhasebeciye gelen malı onaylatmak için sevk irsaliyesi kesme
 * yetkisi de verilmiş oluyordu (en az yetki ihlali).
 */
v1EDocumentsRouter.post(
  '/incoming-despatches/:id/approve',
  requirePermission(PERMISSIONS.WAYBILLS_APPROVE),
  async (req: Request, res: Response) => {
    const tenantId = req.tenantId!;
    const user = req.user!;
    const { supplierId, createSupplier, lines } = req.body || {};
    try {
      const sonuc = await IncomingDespatchService.approveDespatch(
        String(req.params.id),
        tenantId,
        user.id,
        user.fullName || user.username,
        { supplierId, createSupplier, lines }
      );
      res.status(201).json({
        success: true,
        message: `İrsaliye onaylandı: ${sonuc.movements.length} kalem için stok girişi yapıldı. Cari borç oluşturulmadı.`,
        despatch: sonuc.despatch,
        movements: sonuc.movements,
      });
    } catch (err: any) {
      return belgeHatasi(res, err);
    }
  }
);

/**
 * POST /api/v1/e-documents/incoming-despatches/:id/reject
 */
v1EDocumentsRouter.post(
  '/incoming-despatches/:id/reject',
  requirePermission(PERMISSIONS.WAYBILLS_APPROVE),
  async (req: Request, res: Response) => {
    const tenantId = req.tenantId!;
    const user = req.user!;
    const { reason } = req.body || {};
    try {
      const kayit = await IncomingDespatchService.rejectDespatch(
        String(req.params.id),
        tenantId,
        reason || 'Belirtilmedi',
        user.id,
        user.fullName || user.username
      );
      res.json({ success: true, message: 'Gelen irsaliye reddedildi; stok hareketi oluşmadı.', despatch: kayit });
    } catch (err: any) {
      return belgeHatasi(res, err);
    }
  }
);

/**
 * POST /api/v1/e-documents/incoming/:id/respond
 * Gelen faturayı kabul veya reddeder
 */
v1EDocumentsRouter.post('/incoming/:id/respond', requirePermission(PERMISSIONS.EINVOICE_VIEW), async (req: Request, res: Response) => {
  const tenantId = req.tenantId!;
  const user = req.user!;
  const { action = 'ACCEPTED', reason } = req.body;

  try {
    const updated = await IncomingInvoiceService.respondToInvoice(
      String(req.params.id),
      tenantId,
      action,
      reason,
      user.id,
      user.fullName || user.username
    );
    res.json({ success: true, message: `Gelen fatura durumu '${action}' olarak güncellendi.`, invoice: updated });
  } catch (err: any) {
    return entegratorHatasi(res, err);
  }
});
