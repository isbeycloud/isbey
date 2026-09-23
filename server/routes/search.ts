import { Router, Request, Response } from 'express';
import { storage } from '../db/storage';
// FAZ 25.2-A (C2): Arama uçları kimlik doğrulaması zorunlu — tenant scope token'dan alınır
import { requireAuth } from '../middleware/authGuards';

export const searchRouter = Router();

// ─── FAZ 25.2-A (C2): Tenant Scope ─────────────────────────────────────────
// Tüm aramalar yalnızca çağıranın tenant verisi üzerinde çalışır. tenantId
// YALNIZCA token'dan (requireAuth → req.tenantId) gelir; req.query.tenantId
// veya x-tenant-id başlığı yetki kaynağı olarak KABUL EDİLMEZ (CLAUDE.md kuralı).
// Legacy kayıtlar (tenantId alanı olmayan) yalnızca varsayılan tenant'ta
// (tnt-isbey) geçerlidir — customers.ts konvansiyonu ile birebir aynıdır.
const TENANT_DEFAULT = 'tnt-isbey';
const inTenant = (recordTenantId: string | undefined | null, tenantId: string): boolean =>
  recordTenantId === tenantId || (!recordTenantId && tenantId === TENANT_DEFAULT);

searchRouter.use(requireAuth);

// Turkish case-insensitive & character normalizer
function normalizeTR(str: string = ''): string {
  return str
    .replace(/İ/g, 'i')
    .replace(/I/g, 'ı')
    .replace(/Ğ/g, 'g')
    .replace(/ğ/g, 'g')
    .replace(/Ü/g, 'u')
    .replace(/ü/g, 'u')
    .replace(/Ş/g, 's')
    .replace(/ş/g, 's')
    .replace(/Ö/g, 'o')
    .replace(/ö/g, 'o')
    .replace(/Ç/g, 'c')
    .replace(/ç/g, 'c')
    .toLowerCase()
    .trim();
}

// Generate smart acronym / initials variations
// e.g. "Adana Bilgisayar Teknoloji Limited Şirketi" -> ["abtls", "abtl", "abt", "ab", "abtlş"]
// e.g. "ABC Bilişim ve Yazılım Danışmanlık Ltd. Şti." -> ["abyd", "abvyd", "abcbyd", "aby", "abtl", "abydls"]
// e.g. "Samsung Galaxy A55 256 GB" -> ["sga55", "sga", "sg", "sga256gb", "sga256"]
// e.g. "Kablosuz Lazer Sessiz Mouse (Siyah)" -> ["klsm", "klm", "klsms"]
// e.g. "Mekanik RGB Oyuncu Klavyesi" -> ["mrok", "mok", "mrgbok", "mrgb"]
function extractInitialsVariations(text: string): string[] {
  if (!text) return [];
  const clean = normalizeTR(text);
  const words = clean.split(/[\s\-_\/,\.()\[\]"]+/).filter(w => w.length > 0);
  if (words.length === 0) return [];

  const results = new Set<string>();
  const STOP_WORDS = new Set(['ve', 'ile', 'veya', 'de', 'da', 'bir', 've/veya']);

  // 1. Raw initials (all words)
  const allInitials = words.map(w => w[0]).join('');
  results.add(allInitials);
  for (let i = 2; i <= allInitials.length; i++) {
    results.add(allInitials.slice(0, i));
  }

  // 2. Meaningful initials (excluding stop words like "ve", "ile")
  const meaningfulWords = words.filter(w => !STOP_WORDS.has(w));
  const meaningfulInitials = meaningfulWords.map(w => w[0]).join('');
  results.add(meaningfulInitials);
  for (let i = 2; i <= meaningfulInitials.length; i++) {
    results.add(meaningfulInitials.slice(0, i));
  }

  // 3. Keep short codes / numeric tokens intact (e.g. "A55", "RGB", "27", "144hz", "1tb", "cat6", "ssd", "a4")
  let tokenInitials = '';
  for (const w of meaningfulWords) {
    if (w.length <= 4 || /\d/.test(w)) {
      tokenInitials += w;
      results.add(w);
    } else {
      tokenInitials += w[0];
    }
  }
  results.add(tokenInitials);

  // 4. First word full + initials of remaining meaningful words (e.g. "ABC" + "B" + "Y" + "D" -> "abcybyd")
  if (meaningfulWords.length > 1) {
    const firstWord = meaningfulWords[0];
    const restInitials = meaningfulWords.slice(1).map(w => w[0]).join('');
    results.add(firstWord + restInitials);
    for (let i = 1; i <= restInitials.length; i++) {
      results.add(firstWord + restInitials.slice(0, i));
    }
  }

  return Array.from(results);
}


// Smart Match Scoring Algorithm
function scoreMatch(
  query: string,
  title: string,
  code?: string,
  barcode?: string,
  extraFields: (string | undefined)[] = []
): number {
  const q = normalizeTR(query);
  if (!q) return 0;

  const normTitle = normalizeTR(title);
  const normCode = normalizeTR(code || '');
  const normBarcode = normalizeTR(barcode || '');

  // 1. Exact Barcode or Code match (highest priority)
  if (normBarcode && normBarcode === q) return 1000;
  if (normCode && normCode === q) return 990;

  // 2. Exact Title match
  if (normTitle === q) return 950;

  // 3. Starts with Code
  if (normCode && normCode.startsWith(q)) return 920;

  // 4. Starts with Title
  if (normTitle.startsWith(q)) return 900;

  // 5. Acronym / Initials Exact Match (e.g. "ABTL" matches "Adana Bilgisayar Teknoloji Limited")
  const initials = extractInitialsVariations(title);
  for (const init of initials) {
    if (init === q) return 880;
  }

  // 6. Acronym Starts With Query (e.g. "ABT" matches "ABTL...")
  for (const init of initials) {
    if (init.startsWith(q)) return 850;
  }

  // 7. Word boundary match (any word in title starts with query)
  const words = normTitle.split(/[\s\-_\/,\.]+/);
  for (const w of words) {
    if (w === q) return 800;
    if (w.startsWith(q)) return 750;
  }

  // 8. Contains Title Substring
  if (normTitle.includes(q)) return 600;

  // 9. Extra fields match (Phone, TaxNo, City, Category)
  for (const field of extraFields) {
    if (field) {
      const normF = normalizeTR(field);
      if (normF === q) return 550;
      if (normF.startsWith(q)) return 500;
      if (normF.includes(q)) return 450;
    }
  }

  // 10. Code or Barcode contains query
  if (normCode.includes(q)) return 400;
  if (normBarcode.includes(q)) return 400;

  return 0;
}

// Module List for Global Navigation
const SYSTEM_MODULES = [
  { id: 'dashboard', title: 'Dashboard & Yönetici Özeti', code: 'MOD-DASH', subtitle: 'Finansal Genel Durum ve KPI', view: 'dashboard', tab: 'GENEL' },
  { id: 'cari', title: 'Cari Hesaplar & Müşteri / Tedarikçiler', code: 'MOD-CARI', subtitle: 'Borç-Alacak, Bakiye ve Ekstreler', view: 'cari', tab: 'CARI' },
  { id: 'stok', title: 'Stok & Ürün Yönetimi', code: 'MOD-STOK', subtitle: 'Ürün Kartları, Barkod ve Depo Durumu', view: 'stok', tab: 'STOK' },
  { id: 'satis', title: 'Satış Faturaları', code: 'MOD-SATIS', subtitle: 'Müşteri Satış Faturaları ve İcmaller', view: 'satis', tab: 'SATIS' },
  { id: 'alis', title: 'Alış Faturaları', code: 'MOD-ALIS', subtitle: 'Tedarikçi Giriş Faturaları', view: 'alis', tab: 'ALIS' },
  { id: 'pos', title: 'Hızlı Perakende Satış (POS)', code: 'MOD-POS', subtitle: 'Barkodlu Kasa ve Hızlı Fiş Kesme', view: 'pos', tab: 'SATIS' },
  { id: 'efatura', title: 'E-Fatura & E-Arşiv Portalı', code: 'MOD-EINV', subtitle: 'GİB Entegrasyonu, Gelen/Giden Belgeler', view: 'efatura', tab: 'FATURA' },
  { id: 'irsaliye', title: 'İrsaliyeler & Sevkiyat', code: 'MOD-IRS', subtitle: 'Sevk ve Alış İrsaliyeleri', view: 'irsaliye', tab: 'IRSALIYE' },
  { id: 'teklif', title: 'Teklif & Sipariş Yönetimi', code: 'MOD-TEK', subtitle: 'Fiyat Teklifleri ve Alınan Siparişler', view: 'teklif', tab: 'TEKLIF' },
  { id: 'kasa', title: 'Kasa Yönetimi & Nakit', code: 'MOD-KASA', subtitle: 'Nakit Giriş/Çıkış ve Virman', view: 'kasa', tab: 'KASA' },
  { id: 'banka', title: 'Banka Hesapları & POS', code: 'MOD-BNK', subtitle: 'Banka Hareketleri ve POS Cihazları', view: 'banka', tab: 'BANKA' },
  { id: 'gider', title: 'Giderler & Masraf Yönetimi', code: 'MOD-MAS', subtitle: 'Şirket Harcamaları ve Kategori Raporları', view: 'masraf', tab: 'MASRAF' },
  { id: 'raporlar', title: 'Finans & Muhasebe Raporları', code: 'MOD-RAP', subtitle: 'Kâr/Zarar, Bilanço, Yaşlandırma', view: 'raporlar', tab: 'RAPORLAR' },
  { id: 'personel', title: 'Personel & Maaş Takibi', code: 'MOD-PER', subtitle: 'Çalışanlar, Avans ve Bordrolar', view: 'personel', tab: 'PERSONEL' },
  { id: 'ayarlar', title: 'Ayarlar & Belge Tasarımları', code: 'MOD-AYAR', subtitle: 'Fatura Şablonları, Numaratörler, Roller', view: 'ayarlar', tab: 'AYARLAR' },
];

searchRouter.get('/', async (req, res) => {
  try {
    const q = ((req.query.q as string) || '').trim();
    const filterType = (req.query.type as string) || 'all';

    if (!q) {
      return res.json({
        success: true,
        query: '',
        totalCount: 0,
        categories: [],
      });
    }

    const db = storage.getState();

    // FAZ 25.2-A (C2): tenantId yalnızca token'dan alınır — query/header ASLA yetki kaynağı değildir
    const tenantId: string = req.tenantId || TENANT_DEFAULT;
    const isPlatformCaller = req.user?.role === 'SUPER_ADMIN' || req.user?.role === 'ADMIN';

    const customers = (db.customers || []).filter(c => inTenant(c.tenantId, tenantId));
    const products = (db.products || []).filter(p => inTenant(p.tenantId, tenantId));
    const invoices = (db.invoices || []).filter(inv => inTenant(inv.tenantId, tenantId));
    const waybills = (db.waybills || []).filter(wb => inTenant(wb.tenantId, tenantId));
    const quotes = (db.quotes || []).filter(qt => inTenant(qt.tenantId, tenantId));
    const cashTx = db.cashTransactions || [];
    const bankTx = db.bankTransactions || [];
    // FAZ 25.2-A (C2): Expense şemasında tenantId alanı yoktur (legacy veri — 25.2-C kapsamında
    // değerlendirilecek). Alan bulunmadığından sızıntıyı önlemek için varsayılan tenant dışındaki
    // arayanlar gider sonucu alamaz (güvenli varsayılan: gösterme).
    const expenses = tenantId === TENANT_DEFAULT ? (db.expenses || []) : [];

    const resultsMap: { [key: string]: any[] } = {
      COMPANY: [],
      USER: [],
      SERVICE: [],
      CUSTOMER: [],
      PRODUCT: [],
      INVOICE: [],
      WAYBILL: [],
      QUOTE: [],
      CASH: [],
      BANK: [],
      EXPENSE: [],
      MODULE: [],
    };

    // 1. SEARCH CUSTOMERS
    if (filterType === 'all' || filterType === 'customers') {
      for (const c of customers) {
        if (!c.active) continue;
        const score = scoreMatch(q, c.title, c.code, undefined, [
          c.taxNumber,
          c.phone,
          c.email,
          c.city,
          c.contactName,
        ]);
        if (score > 0) {
          resultsMap.CUSTOMER.push({
            type: 'CUSTOMER',
            id: c.id,
            code: c.code,
            title: c.title,
            subtitle: `Cari Kod: ${c.code} | Tel: ${c.phone || '-'} | ${c.city || 'Şehir Yok'}`,
            metadata: {
              badge: c.type === 'SUPPLIER' ? 'Tedarikçi' : c.type === 'BOTH' ? 'Müşteri+Satıcı' : 'Müşteri',
              balance: c.balance,
              phone: c.phone,
              taxNumber: c.taxNumber,
            },
            score,
          });
        }
      }
    }

    // 2. SEARCH PRODUCTS
    if (filterType === 'all' || filterType === 'products') {
      for (const p of products) {
        if (!p.active) continue;
        const score = scoreMatch(q, p.name, p.code, p.barcode, [
          p.category,
          p.group,
          p.brand,
          p.model,
          p.sku,
        ]);
        if (score > 0) {
          resultsMap.PRODUCT.push({
            type: 'PRODUCT',
            id: p.id,
            code: p.code,
            title: p.name,
            subtitle: `Stok Kodu: ${p.code} | Barkod: ${p.barcode || '-'} | Birim: ${p.unit}`,
            metadata: {
              badge: `${p.currentStock} ${p.unit}`,
              stock: p.currentStock,
              price: p.salePrice,
              unit: p.unit,
              barcode: p.barcode,
            },
            score,
          });
        }
      }
    }

    // 3. SEARCH INVOICES
    if (filterType === 'all' || filterType === 'invoices') {
      for (const inv of invoices) {
        const score = scoreMatch(q, inv.customerTitle, inv.invoiceNo, undefined, [
          inv.notes,
          inv.date,
          inv.type,
        ]);
        if (score > 0) {
          resultsMap.INVOICE.push({
            type: 'INVOICE',
            id: inv.id,
            code: inv.invoiceNo,
            title: `${inv.invoiceNo} – ${inv.customerTitle}`,
            subtitle: `Tarih: ${inv.date} | Tutar: ${inv.grandTotal.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺ | ${inv.paymentStatus === 'PAID' ? 'Ödendi' : 'Açık'}`,
            metadata: {
              badge: inv.type === 'PURCHASE' ? 'Alış Faturası' : 'Satış Faturası',
              amount: inv.grandTotal,
              date: inv.date,
              status: inv.status,
            },
            score,
          });
        }
      }
    }

    // 4. SEARCH WAYBILLS
    if (filterType === 'all' || filterType === 'waybills') {
      for (const wb of waybills) {
        const score = scoreMatch(q, wb.customerTitle, wb.waybillNo, undefined, [
          wb.carrierTitle,
          wb.plateNumber,
          wb.date,
        ]);
        if (score > 0) {
          resultsMap.WAYBILL.push({
            type: 'WAYBILL',
            id: wb.id,
            code: wb.waybillNo,
            title: `${wb.waybillNo} – ${wb.customerTitle}`,
            subtitle: `Sevk Tarihi: ${wb.shipmentDate || wb.date} | Plaka: ${wb.plateNumber || '-'}`,
            metadata: {
              badge: wb.type === 'PURCHASE_DESPATCH' ? 'Alış İrsaliyesi' : 'Sevk İrsaliyesi',
              date: wb.date,
              status: wb.status,
            },
            score,
          });
        }
      }
    }

    // 5. SEARCH QUOTES & ORDERS
    if (filterType === 'all' || filterType === 'quotes') {
      for (const qt of quotes) {
        const score = scoreMatch(q, qt.customerTitle, qt.quoteNo, undefined, [
          qt.notes,
          qt.date,
          qt.status,
        ]);
        if (score > 0) {
          resultsMap.QUOTE.push({
            type: 'QUOTE',
            id: qt.id,
            code: qt.quoteNo,
            title: `${qt.quoteNo} – ${qt.customerTitle}`,
            subtitle: `Tarih: ${qt.date} | Tutar: ${qt.grandTotal.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺ | Durum: ${qt.status}`,
            metadata: {
              badge: qt.type === 'PURCHASE_QUOTE' ? 'Alış Teklifi' : 'Satış Teklifi',
              amount: qt.grandTotal,
              date: qt.date,
              status: qt.status,
            },
            score,
          });
        }
      }
    }

    // 6. SEARCH EXPENSES
    if (filterType === 'all' || filterType === 'expenses') {
      for (const exp of expenses) {
        const score = scoreMatch(q, exp.title, exp.receiptNo, undefined, [
          exp.categoryName,
          exp.notes,
          exp.date,
        ]);
        if (score > 0) {
          resultsMap.EXPENSE.push({
            type: 'EXPENSE',
            id: exp.id,
            code: exp.receiptNo || 'GİDER',
            title: `${exp.title} (${exp.categoryName})`,
            subtitle: `Tarih: ${exp.date} | Tutar: ${exp.amount.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺`,
            metadata: {
              badge: exp.categoryName,
              amount: exp.amount,
              date: exp.date,
            },
            score,
          });
        }
      }
    }

    // 7. SEARCH COMPANIES / TENANTS
    // FAZ 25.2-A (C2): Firma kayıtları platform verisidir — yalnızca platform yöneticileri
    if ((filterType === 'all' || filterType === 'companies') && isPlatformCaller) {
      const companies = (db.tenants || []).filter(t => !t.isArchived);
      for (const comp of companies) {
        const score = scoreMatch(q, comp.name, comp.companyCode || comp.slug, undefined, [
          comp.title,
          comp.taxNumber,
          comp.ownerName,
          comp.email,
          comp.phone,
          comp.city,
        ]);
        if (score > 0) {
          if (!resultsMap.COMPANY) resultsMap.COMPANY = [];
          resultsMap.COMPANY.push({
            type: 'COMPANY',
            id: comp.id,
            code: comp.companyCode || comp.slug,
            title: comp.name,
            subtitle: `${comp.companyCode || ''} · VKN: ${comp.taxNumber} · Yetkili: ${comp.ownerName || '-'}`,
            metadata: {
              badge: comp.plan || 'Firma',
              status: comp.status,
              companyId: comp.id,
            },
            score: score + 20,
          });
        }
      }
    }

    // 8. SEARCH USERS
    // FAZ 25.2-A (C2): Kullanıcı kayıtları (PII) platform verisidir — yalnızca platform yöneticileri
    if ((filterType === 'all' || filterType === 'users') && isPlatformCaller) {
      const users = db.users || [];
      for (const u of users) {
        const score = scoreMatch(q, u.fullName, u.username, undefined, [
          u.email,
          u.phone,
          u.role,
        ]);
        if (score > 0) {
          if (!resultsMap.USER) resultsMap.USER = [];
          resultsMap.USER.push({
            type: 'USER',
            id: u.id,
            code: `@${u.username}`,
            title: `${u.fullName} (@${u.username})`,
            subtitle: `E-posta: ${u.email} | Rol: ${u.role} | Durum: ${u.active ? 'Aktif' : 'Pasif'}`,
            metadata: {
              badge: u.role,
              active: u.active,
            },
            score,
          });
        }
      }
    }

    // 9. SEARCH SERVICES & LICENSES
    // FAZ 25.2-A (C2): Hizmet katalogu platform verisidir — yalnızca platform yöneticileri
    if ((filterType === 'all' || filterType === 'services') && isPlatformCaller) {
      const services = db.services || [];
      for (const srv of services) {
        const score = scoreMatch(q, srv.name, srv.code, undefined, [srv.description, srv.category]);
        if (score > 0) {
          if (!resultsMap.SERVICE) resultsMap.SERVICE = [];
          resultsMap.SERVICE.push({
            type: 'SERVICE',
            id: srv.id,
            code: srv.code,
            title: srv.name,
            subtitle: `${srv.description} · Kategori: ${srv.category}`,
            metadata: {
              badge: srv.category,
              price: srv.price,
            },
            score,
          });
        }
      }
    }

    // 10. SEARCH HIZLI BİLİŞİM CUSTOMERS
    // FAZ 25.2-A (C2): Hızlı Bilişim müşteri kayıtları platform verisidir — yalnızca platform yöneticileri
    if ((filterType === 'all' || filterType === 'hizli' || filterType === 'customers') && isPlatformCaller) {
      const hizliCustomers = db.externalCustomers || [];
      for (const hc of hizliCustomers) {
        const score = scoreMatch(q, hc.companyName, hc.externalId, undefined, [
          hc.title,
          hc.taxNumber,
          hc.taxOffice,
          hc.contactName,
          hc.email,
          hc.phone,
          hc.city,
        ]);
        if (score > 0) {
          if (!resultsMap.HIZLI_CUSTOMER) resultsMap.HIZLI_CUSTOMER = [];
          resultsMap.HIZLI_CUSTOMER.push({
            type: 'HIZLI_CUSTOMER',
            id: hc.id,
            code: hc.externalId,
            title: hc.companyName,
            subtitle: `${hc.externalId} · VKN: ${hc.taxNumber} · Yetkili: ${hc.contactName} · Durum: ${hc.status}`,
            metadata: {
              badge: 'Hızlı Bilişim',
              status: hc.status,
              taxNumber: hc.taxNumber,
              phone: hc.phone,
              customerId: hc.id,
            },
            score: score + 15,
          });
        }
      }
    }

    // 11. SEARCH SYSTEM MODULES & MENU ITEMS
    if (filterType === 'all') {
      for (const mod of SYSTEM_MODULES) {
        const score = scoreMatch(q, mod.title, mod.code, undefined, [mod.subtitle]);
        if (score > 0) {
          resultsMap.MODULE.push({
            type: 'MODULE',
            id: mod.id,
            code: mod.code,
            title: mod.title,
            subtitle: mod.subtitle,
            metadata: {
              badge: 'Menü / Modül',
              view: mod.view,
              tab: mod.tab,
            },
            score: score - 50,
          });
        }
      }
    }

    // Sort each category by score descending
    const categoryConfigs = [
      { key: 'HIZLI_CUSTOMER', title: 'HIZLI BİLİŞİM MÜŞTERİLERİ' },
      { key: 'COMPANY', title: 'FİRMALAR' },
      { key: 'USER', title: 'KULLANICILAR' },
      { key: 'SERVICE', title: 'HİZMETLER & MODÜLLER' },
      { key: 'CUSTOMER', title: 'CARİLER' },
      { key: 'PRODUCT', title: 'ÜRÜNLER & STOK' },
      { key: 'INVOICE', title: 'FATURALAR' },
      { key: 'WAYBILL', title: 'İRSALİYELER' },
      { key: 'QUOTE', title: 'TEKLİF & SİPARİŞLER' },
      { key: 'EXPENSE', title: 'MASRAF & GİDERLER' },
      { key: 'MODULE', title: 'SİSTEM MENÜLERİ' },
    ];

    const categories = [];
    let totalCount = 0;

    for (const cfg of categoryConfigs) {
      const items = (resultsMap[cfg.key] || []).sort((a, b) => b.score - a.score).slice(0, 10);
      if (items.length > 0) {
        categories.push({
          key: cfg.key,
          title: cfg.title,
          count: items.length,
          items,
        });
        totalCount += items.length;
      }
    }

    return res.json({
      success: true,
      query: q,
      totalCount,
      categories,
    });
  } catch (err: any) {
    console.error('Search API error:', err);
    return res.status(500).json({
      success: false,
      message: 'Arama sırasında sunucu hatası meydana geldi.',
      error: err.message,
    });
  }
});

