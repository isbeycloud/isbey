import { formatUnitLabel } from '../../../utils/unitDisplay';
import React, { useState, useEffect, useRef } from 'react';
import { Modal } from '../../common/Modal';
import type { Customer, Product, InvoiceItem, InvoiceProfile, InvoiceCategory, InvoiceSeries, Warehouse } from '../../../types';
import type { InvoiceDesignConfig } from '../../templates/invoiceDesignConfig';
import { usePriceListPricing } from '../../../hooks/usePriceListPricing';
import { api } from '../../../services/api';
import { useToast } from '../../../context/ToastContext';
import { useApp } from '../../../context/AppContext';
import { ProductSelectorModal, type ProductSelection } from '../../common/ProductSelectorModal';
import { CustomerSelectorModal } from '../../common/CustomerSelectorModal';
import { QuickProductCreateModal } from '../../common/QuickProductCreateModal';
import { QuickCustomerCreateModal } from '../../common/QuickCustomerCreateModal';
import { Plus, Trash2, Search, Barcode, Package, ShieldAlert, Building, Zap, DollarSign, Percent, Globe, CheckCircle2 } from 'lucide-react';

interface NewInvoiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  invoiceType: 'SALES' | 'PURCHASE';
}

const TEVKIFAT_CODES = [
  { code: '601', name: 'Yapım İşleri ile Bu İşlerle Birlikte İfa Edilen Mühendislik-Mimarlık (4/10)', rate: 0.4 },
  { code: '602', name: 'Temizlik, Çevre ve Bahçe Bakım Hizmetleri (9/10)', rate: 0.9 },
  { code: '603', name: 'Özel Güvenlik Hizmeti (9/10)', rate: 0.9 },
  { code: '604', name: 'Makine, Teçhizat, Demirbaş ve Taşıtlara Ait Tadil, Bakım ve Onarım (7/10)', rate: 0.7 },
  { code: '605', name: 'Yemek Servis ve Organizasyon Hizmetleri (5/10)', rate: 0.5 },
  { code: '606', name: 'İşgücü Temin Hizmetleri (9/10)', rate: 0.9 },
  { code: '607', name: 'Servis Taşımacılığı Hizmeti (5/10)', rate: 0.5 },
  { code: '608', name: 'Fason Olarak Yaptırılan Tekstil ve Konfeksiyon İşleri (7/10)', rate: 0.7 },
  { code: '612', name: 'Demir-Çelik Ürünlerinin Teslimi (4/10)', rate: 0.4 },
  { code: '627', name: 'Diğer Hizmetler (5/10)', rate: 0.5 },
];

const EXEMPTION_CODES = [
  { code: '301', name: '11/1-a Mal İhracatı' },
  { code: '302', name: '11/1-a Hizmet İhracatı' },
  { code: '304', name: '11/1-b Serbest Bölgedeki Müşterilere Yapılan Teslimler' },
  { code: '350', name: 'Diğer İstisnalar' },
];

export const NewInvoiceModal: React.FC<NewInvoiceModalProps> = ({ isOpen, onClose, invoiceType }) => {
  const { showToast } = useToast();
  const { triggerRefresh, openPrintModal, setActiveView } = useApp();

  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  // 2026-10-12: Fiyat listesi mantığı tek kaynakta (bkz. hooks/usePriceListPricing).
  const { priceLists, resolvePrice, trackProduct, repriceItems } = usePriceListPricing({
    isOpen,
    customer: selectedCustomer,
    isPurchase: invoiceType === 'PURCHASE',
  });
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [maturityDate, setMaturityDate] = useState('');
  const [paymentType, setPaymentType] = useState<'OPEN_ACCOUNT' | 'CASH' | 'CREDIT_CARD' | 'BANK_TRANSFER'>('OPEN_ACCOUNT');
  // 2026-10-17: Faturanın stok hareketi HANGİ depoya yazılacak. Bu alan yoktu
  // ve sunucu eski hâlde `'wh-1'` (canlıda VAR OLMAYAN kimlik) ya da ürünün
  // kırık `warehouseId` referansına düşüyordu. Liste yalnız SEÇİLİ FIRMANIN
  // depolarını içerir; seçim yoksa ve firmanın tek deposu varsa o seçilir.
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [warehouseId, setWarehouseId] = useState('');
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<InvoiceItem[]>([]);

  // Advanced E-Invoice / E-Transformation state
  const [invoiceProfile, setInvoiceProfile] = useState<InvoiceProfile>('TICARIFATURA');
  const [invoiceCategory, setInvoiceCategory] = useState<InvoiceCategory>('SATIS');
  // 2026-10-12: Sekmeli vergi seçimi (Genel / e-Devlet / Diğer) + Diğer sekmesi alanları.
  const [taxTab, setTaxTab] = useState<'GENEL' | 'EDEVLET' | 'DIGER'>('GENEL');
  const [replacesDespatch, setReplacesDespatch] = useState(false);
  const [ettnNo, setEttnNo] = useState('');
  // 2026-10-12: SERİ + TASARIM seçimi (fatura kayıt ekranı).
  const [invoiceSeries, setInvoiceSeries] = useState<InvoiceSeries[]>([]);
  const [selectedSeriesId, setSelectedSeriesId] = useState('');
  const [designs, setDesigns] = useState<InvoiceDesignConfig[]>([]);
  const [selectedDesignId, setSelectedDesignId] = useState('');
  const [withholdingCode, setWithholdingCode] = useState('');
  const [withholdingRate, setWithholdingRate] = useState<number>(0);
  const [exemptionCode, setExemptionCode] = useState('');
  const [currency, setCurrency] = useState<'TRY' | 'USD' | 'EUR' | 'GBP'>('TRY');
  const [exchangeRate, setExchangeRate] = useState<number>(1);
  const [isTaxpayerChecking, setIsTaxpayerChecking] = useState(false);
  const [taxpayerError, setTaxpayerError] = useState('');
  const [taxpayerRetry, setTaxpayerRetry] = useState(0);
  // 2026-09-12: Üç değerli mükellefiyet alanları için açık tip (isEInvoiceUser: boolean | null)
  const [taxpayerInfo, setTaxpayerInfo] = useState<{
    vkn: string;
    title: string;
    isEInvoiceUser: boolean | null;
    isEArchiveUser: boolean | null;
    firstRegistrationDate?: string | null;
    aliases: Array<{ alias: string; type: 'GB' | 'PK'; creationDate?: string }>;
    taxOffice?: string;
    address?: string;
    city?: string;
    district?: string;
  } | null>(null);

  // Modals state
  const [isCustomerSelectorOpen, setIsCustomerSelectorOpen] = useState(false);
  const [isProductSelectorOpen, setIsProductSelectorOpen] = useState(false);
  const [isQuickCustomerOpen, setIsQuickCustomerOpen] = useState(false);
  const [isQuickProductOpen, setIsQuickProductOpen] = useState(false);

  // Fast Barcode Scanner input
  const [quickBarcode, setQuickBarcode] = useState('');
  const barcodeInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      resetForm();
      // 2026-10-12: Seri + tasarım listeleri (yükleme hatası faturayı ENGELLEMEZ;
      // liste yoksa seri seçimi gizlenir, tasarım varsayılanla yazdırılır).
      api.getInvoiceSeries({ type: invoiceType === 'PURCHASE' ? 'PURCHASE' : 'SALES', activeOnly: true })
        .then(res => {
          if (res.success) {
            setInvoiceSeries(res.invoiceSeries);
            const def = res.invoiceSeries.find(s => s.isDefault) || res.invoiceSeries[0];
            setSelectedSeriesId(def?.id || '');
          }
        })
        .catch(err => console.error(err));
      api.getInvoiceDesigns()
        .then(res => {
          if (res.success && Array.isArray(res.invoiceDesigns)) {
            setDesigns(res.invoiceDesigns);
            const def = res.invoiceDesigns.find((d: any) => d.isDefault) || res.invoiceDesigns[0];
            setSelectedDesignId(def?.id || '');
          }
        })
        .catch(err => console.error(err));
      // 2026-10-17: Faturaya yazılacak depo listesi (tenant'a göre süzülmüş uç).
      api.getProductMeta()
        .then(res => {
          if (res.success) {
            setWarehouses(res.warehouses || []);
            if (res.warehouses?.length === 1) setWarehouseId(res.warehouses[0].id);
          }
        })
        .catch(() => setWarehouses([]));
    }
  }, [isOpen, invoiceType]);
  // Handle Taxpayer Check when Customer changes
  useEffect(() => {
    let active = true;
    setTaxpayerInfo(null);
    setTaxpayerError('');
    setIsTaxpayerChecking(false);
    if (!selectedCustomer) {
      setTaxpayerInfo(null);
      return;
    }
    if (invoiceType !== 'SALES') return;
    const vkn = (selectedCustomer.taxNumber || '').trim().replace(/\D/g, '');
    if (vkn.length === 10 || vkn.length === 11) {
      checkTaxpayerStatus(vkn, () => active);
    } else {
      setTaxpayerError('Alıcının 10 veya 11 haneli VKN/TCKN bilgisini tamamlayın.');
    }
    return () => { active = false; };
  }, [selectedCustomer, invoiceType, taxpayerRetry]);

  const checkTaxpayerStatus = async (vkn: string, active: () => boolean) => {
    setIsTaxpayerChecking(true);
    try {
      const checked = await api.checkTaxpayerV1(vkn, true);
      if (!active()) return;
      if (!checked.success || typeof checked.taxpayer?.isEInvoiceUser !== 'boolean') throw new Error('Alıcı mükellefiyeti doğrulanamadı.');
      const t = checked.taxpayer;
      if (t.isEInvoiceUser && !t.aliasPK) throw new Error('Alıcının tekil e-Fatura posta kutusu doğrulanamadı.');
      const res = { success: true, taxpayer: { vkn: t.identifier, title: t.title, isEInvoiceUser: t.isEInvoiceUser,
        isEArchiveUser: null, aliases: [...(t.aliasPK ? [{ type: 'PK' as const, alias: t.aliasPK }] : []), ...(t.aliasGB ? [{ type: 'GB' as const, alias: t.aliasGB }] : [])] } };
      if (res.success && res.taxpayer) {
        setTaxpayerInfo(res.taxpayer);
        // 2026-09-12 (uydurma temizliği): `isEInvoiceUser` artık üç değerli —
        // true (mükellef), false (değil), null (DOĞRULANAMADI; yerel kayıt var ama
        // GİB durumu bilinmiyor). Bilinmeyen durumu "e-Arşiv" diye göstermek
        // uydurma bir mükellefiyet iddiası olurdu; o yüzden ayrı ele alınır.
        if (res.taxpayer.isEInvoiceUser === true) {
          setInvoiceProfile('TICARIFATURA');
          showToast(`✓ ${selectedCustomer?.title} GİB e-Fatura mükellefidir.`, 'success');
        } else if (res.taxpayer.isEInvoiceUser === false) {
          setInvoiceProfile('EARSIVFATURA');
          showToast(`ℹ️ Müşteri e-Arşiv faturası kapsamındadır.`, 'info');
        }
      } else if (res && (res as any).message) {
        showToast(`ℹ️ ${(res as any).message}`, 'info');
      }
    } catch (err) {
      if (active()) setTaxpayerError(err instanceof Error ? err.message : 'Alıcı sorgulanamadı.');
    } finally {
      if (active()) setIsTaxpayerChecking(false);
    }
  };

  // Keyboard Shortcuts
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F2') {
        e.preventDefault();
        setIsCustomerSelectorOpen(true);
      } else if (e.key === 'F3') {
        e.preventDefault();
        setIsProductSelectorOpen(true);
      } else if (e.key === 'F4') {
        e.preventDefault();
        setIsQuickProductOpen(true);
      } else if (e.key === 'F5') {
        e.preventDefault();
        setIsQuickCustomerOpen(true);
      } else if (e.ctrlKey && e.key === 'Enter') {
        e.preventDefault();
        handleSaveInvoice();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, selectedCustomer, items, date, maturityDate, paymentType, notes, invoiceProfile, invoiceCategory, withholdingCode, withholdingRate, exemptionCode, currency, exchangeRate, taxpayerInfo, taxpayerError, isTaxpayerChecking, taxTab, replacesDespatch, ettnNo]);

  const resetForm = () => {
    setSelectedCustomer(null);
    setDate(new Date().toISOString().split('T')[0]);
    setMaturityDate('');
    setPaymentType('OPEN_ACCOUNT');
    setNotes('');
    setItems([]);
    setQuickBarcode('');
    setInvoiceProfile('TICARIFATURA');
    setInvoiceCategory('SATIS');
    setWithholdingCode('');
    setWithholdingRate(0);
    setExemptionCode('');
    setCurrency('TRY');
    setExchangeRate(1);
    setTaxpayerInfo(null);
    setSelectedSeriesId('');
    setSelectedDesignId('');
    setTaxTab('GENEL');
    setReplacesDespatch(false);
    setEttnNo('');
  };

  const handleSelectCustomer = (cust: Customer) => {    setSelectedCustomer(cust);
    const mat = new Date(new Date(date).getTime() + (cust.maturityDays || 30) * 24 * 3600 * 1000)
      .toISOString()
      .split('T')[0];
    setMaturityDate(mat);
  };

  const handleAddProductsToItems = (selection: ProductSelection[]) => {
    const additions = selection.map(({ product, variant }) => {
      const resolved = resolvePrice(product, variant);
      const unitPrice = resolved.unitPrice;
      const vatRate = product.vatRate || 20;
      const label = variant ? `${product.name} (${variant.name})` : product.name;
      const newItem: InvoiceItem = {
        productId: product.id,
        variantId: variant?.id,
        variantName: variant?.name,
        productCode: product.code,
        productName: label,
        barcode: variant?.barcode || product.barcode,
        quantity: 1,
        unit: product.unit,
        unitPrice,
        discount1: 0,
        discount2: 0,
        discountAmount: 0,
        vatRate,
        vatAmount: unitPrice * (vatRate / 100),
        vatIncluded: false,
        priceListId: resolved.priceListId,
        lineTotal: unitPrice,
        lineGrandTotal: unitPrice * (1 + vatRate / 100),
      };
      if (!items.some(item => item.productId === product.id && (item.variantId || undefined) === (variant?.id || undefined))) trackProduct(product, unitPrice, variant);
      return newItem;
    });
    // Apply the complete batch against current rows so existing-row increments
    // cannot overwrite another product added during the same React update.
    setItems(previous => additions.reduce((rows, item) => {
      const index = rows.findIndex(row => row.productId === item.productId && (row.variantId || undefined) === (item.variantId || undefined));
      if (index < 0) return [...rows, item];
      const next = [...rows];
      const existing = rows[index];
      const quantity = (existing.quantity || 1) + 1;
      const lineTotal = quantity * existing.unitPrice * (1 - (existing.discount1 || 0) / 100);
      const vatAmount = lineTotal * (existing.vatRate / 100);
      next[index] = { ...existing, quantity, lineTotal, vatAmount, lineGrandTotal: lineTotal + vatAmount };
      return next;
    }, previous));
    if (additions.length) showToast(additions.length === 1 ? `"${additions[0].productName}" faturaya eklendi.` : `${additions.length} ürün / varyant faturaya eklendi.`, 'success');
  };

  const handleAddProductToItems = (product: Product, variant?: import('../../../types').ProductVariant) => {
    handleAddProductsToItems([{ product, variant }]);
  };

  /**
   * 2026-10-12: Cari (veya carinin fiyat listesi) değişince mevcut satırları
   * yeniden fiyatla. Elle düzenlenmiş satırlara DOKUNULMAZ; kural tek yerde
   * (usePriceListPricing) yaşar ki tüm belgeler aynı davransın.
   */
  useEffect(() => {
    setItems(prevItems =>
      repriceItems(prevItems, (item, unitPrice, priceListId) => {
        const qty = item.quantity || 1;
        const afterDisc = qty * unitPrice * (1 - (item.discount1 || 0) / 100) * (1 - (item.discount2 || 0) / 100);
        const vatAmt = afterDisc * (item.vatRate / 100);
        return {
          ...item,
          unitPrice,
          priceListId,
          discountAmount: qty * unitPrice - afterDisc,
          lineTotal: afterDisc,
          vatAmount: vatAmt,
          lineGrandTotal: afterDisc + vatAmt,
        };
      })
    );
  }, [selectedCustomer, priceLists, repriceItems]);

  // Fast Barcode Scan Handler
  const handleBarcodeScan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickBarcode.trim()) return;

    try {
      const pRes = await api.getProducts();
      if (pRes.success) {
        const found = pRes.products.find(
          p => p.barcode === quickBarcode.trim() || p.code.toLowerCase() === quickBarcode.trim().toLowerCase()
        );
        if (found) {
          handleAddProductToItems(found);
          setQuickBarcode('');
        } else {
          showToast(`"${quickBarcode}" barkoduna ait ürün bulunamadı.`, 'warning');
          setIsQuickProductOpen(true);
        }
      }
    } catch (err) {
      console.error(err);
    }
  };

  const updateItem = (index: number, field: string, val: any) => {
    const updated = [...items];
    const item = { ...updated[index], [field]: val };

    const qty = Number(item.quantity) || 1;
    const price = Number(item.unitPrice) || 0;
    const d1 = Number(item.discount1) || 0;
    const d2 = Number(item.discount2) || 0;
    const vRate = Number(item.vatRate) || 0;

    const discounted = qty * price * (1 - d1 / 100) * (1 - d2 / 100);
    const discAmount = qty * price - discounted;

    if (item.vatIncluded) {
      item.lineGrandTotal = Math.round(discounted * 100) / 100;
      item.lineTotal = Math.round((discounted / (1 + vRate / 100)) * 100) / 100;
      item.vatAmount = Math.round((item.lineGrandTotal - item.lineTotal) * 100) / 100;
    } else {
      item.lineTotal = Math.round(discounted * 100) / 100;
      item.vatAmount = Math.round((item.lineTotal * (vRate / 100)) * 100) / 100;
      item.lineGrandTotal = Math.round((item.lineTotal + item.vatAmount) * 100) / 100;
    }
    item.discountAmount = Math.round(discAmount * 100) / 100;

    updated[index] = item;
    setItems(updated);
  };

  const removeItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index));
  };

  // Math Calculations
  const subTotal = items.reduce((sum, it) => sum + it.lineTotal, 0);
  const totalDiscount = items.reduce((sum, it) => sum + it.discountAmount, 0);
  const totalVat = items.reduce((sum, it) => sum + it.vatAmount, 0);
  const totalWithholding = withholdingRate > 0 ? Math.round(totalVat * withholdingRate * 100) / 100 : 0;
  const payableVat = Math.round((totalVat - totalWithholding) * 100) / 100;
  const grandTotal = Math.round((subTotal + totalVat - totalWithholding) * 100) / 100;

  const handleTevkifatChange = (code: string) => {
    setWithholdingCode(code);
    const item = TEVKIFAT_CODES.find(t => t.code === code);
    setWithholdingRate(item ? item.rate : 0);
    if (code) {
      setInvoiceCategory('TEVKIFAT');
    } else if (invoiceCategory === 'TEVKIFAT') {
      setInvoiceCategory('SATIS');
    }
  };

  const handleCategoryChange = (cat: InvoiceCategory) => {
    setInvoiceCategory(cat);
    if (cat === 'ISTISNA' && !exemptionCode) {
      setExemptionCode('301');
    }
    if (cat !== 'TEVKIFAT') {
      setWithholdingCode('');
      setWithholdingRate(0);
    }
  };

  const handleSaveInvoice = async () => {
    if (invoiceType === 'SALES' && (isTaxpayerChecking || !taxpayerInfo || taxpayerError)) {
      showToast(taxpayerError || 'Alıcının mükellefiyet sorgusunun tamamlanmasını bekleyin.', 'warning');
      return;
    }
    if (!selectedCustomer) {
      showToast('Lütfen Cari Seçim Penceresi üzerinden bir cari seçiniz.', 'warning');
      setIsCustomerSelectorOpen(true);
      return;
    }
    if (items.length === 0) {
      showToast('Lütfen Ürün Seçim Penceresi veya Barkod ile en az bir ürün ekleyiniz.', 'warning');
      setIsProductSelectorOpen(true);
      return;
    }

    // 2026-10-17: Depo seçimi ZORUNLU. Sunucu artık `'wh-1'`/ürünün kırık depo
    // referansı gibi yollara DÜŞMÜYOR; seçim yapılmadan hiç istek gönderilmez.
    if (!warehouseId) {
      showToast(
        warehouses.length === 0
          ? 'Bu firma için tanımlı depo yok. Fatura kaydedilemez; lütfen önce bir depo tanımlayın.'
          : 'Faturanın stok hareketi için önce bir depo seçiniz.',
        'warning'
      );
      return;
    }

    // 2026-10-20: SIFIR TUTARLI SATIŞ — sessiz geçemez.
    // Sunucu kapısı (`server/services/zeroPriceGate.ts`) gerekçesiz 0 TL satışı
    // reddediyor. Kullanıcı bunu ancak kaydettikten sonra hata olarak görmesin:
    // burada, göndermeden ÖNCE sorulur. Vazgeçerse hiç istek gitmez; yazarsa
    // gerekçe gövdeye eklenir ve belgeyle birlikte saklanır.
    // (Canlıda SAT-2026-000005 0 TL kesilip 3 adet stok çıkmış, nedeni hiçbir
    // yerde yazmıyordu.)
    let zeroTotalReason: string | undefined;
    // Modal yalnız SALES/PURCHASE üretir (perakende yolu `POSSalesView`'dir ve
    // kendi sorusunu sorar). ALIŞ kapsam dışı — sunucu kapısı da almaz.
    if (grandTotal <= 0 && invoiceType === 'SALES') {
      const sifirSatirlar = items
        .filter(it => (Number(it.quantity) || 0) * (Number(it.unitPrice) || 0) <= 0)
        .map(it => `${it.productCode} ${it.productName} (${it.quantity} × ${Number(it.unitPrice) || 0} TL)`)
        .join(', ');
      const cevap = window.prompt(
        `Bu faturanın toplamı ${grandTotal.toFixed(2)} TL.\n\n` +
        `Sıfır tutarlı satış stok çıkışı doğurur ama alacak doğurmaz.\n` +
        `Kalemler: ${sifirSatirlar || `${items.length} satır`}\n\n` +
        `Bu bilinçli bir işlemse GEREKÇESİNİ yazın (en az 10 karakter).\n` +
        `Vazgeçerseniz fatura kaydedilmez; fiyatları düzeltebilirsiniz.`,
        ''
      );
      if (cevap === null) {
        showToast('Sıfır tutarlı fatura kaydedilmedi. Fiyatları kontrol edin.', 'warning');
        return;
      }
      if (cevap.trim().length < 10) {
        showToast('Gerekçe en az 10 karakter olmalı. Fatura kaydedilmedi.', 'warning');
        return;
      }
      zeroTotalReason = cevap.trim();
    }

    try {
      const res = await api.createInvoice({
        type: invoiceType,
        customerId: selectedCustomer.id,
        // 2026-10-17: Hedef depo SUNUCU kapısından geçecek şekilde gönderilir.
        warehouseId,
        // 2026-10-12: Seri seçildiyse numara o seriden gelir; seçilmediyse
        // sunucu eski tek sayacı kullanır. Tasarım seçimi yazdırma önizlemesine taşınır.
        invoiceSeriesId: selectedSeriesId || undefined,
        date,
        maturityDate,
        paymentType,
        paidAmount: paymentType === 'CASH' || paymentType === 'CREDIT_CARD' ? grandTotal : 0,
        notes,
        currency,
        exchangeRate,
        invoiceProfile,
        invoiceCategory,
        withholdingCode: withholdingCode || undefined,
        withholdingRate: withholdingRate > 0 ? withholdingRate : undefined,
        exemptionCode: exemptionCode || undefined,
        recipientTaxNumber: selectedCustomer.taxNumber,
        recipientAliasGB: taxpayerInfo?.aliases?.find((a: any) => a.type === 'GB')?.alias,
        zeroTotalReason,
        items,
      });

      if (res.success && res.invoice) {
        showToast(res.message, 'success');
        triggerRefresh();
        onClose();
        openPrintModal('A4_INVOICE', `${res.invoice.invoiceNo} Faturası`, res.invoice, selectedDesignId || undefined);
      }
    } catch (err: any) {
      showToast(err.message || 'Fatura kaydedilemedi.', 'error');
    }
  };

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        title={invoiceType === 'PURCHASE' ? '📥 Yeni Alış Faturası Girişi' : '📤 Yeni Satış & E-Fatura Oluştur'}
        size="full"
        footer={
          <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
              ⌨️ Kısayollar: <strong>F2</strong> Cari Seç | <strong>F3</strong> Ürün Seç | <strong>F4</strong> Hızlı Ürün | <strong>F5</strong> Hızlı Cari | <strong>CTRL+ENTER</strong> Kaydet
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button type="button" className="btn btn-secondary" onClick={onClose}>
                İptal (ESC)
              </button>
              <button type="button" className="btn btn-primary" disabled={invoiceType === 'SALES' && (isTaxpayerChecking || !taxpayerInfo || !!taxpayerError)} onClick={handleSaveInvoice}>
                Faturayı Kaydet ve Muhasebeleştir (CTRL+ENTER)
              </button>
            </div>
          </div>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {taxpayerError && <div role="alert" style={{ color: '#b91c1c' }}>{taxpayerError} <button type="button" className="btn btn-secondary" onClick={() => setTaxpayerRetry(n => n + 1)}>Tekrar sorgula</button></div>}
          
          {/* 1. CARİ VE E-DÖNÜŞÜM / SENARYO PANELİ */}
          <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '14px' }}>
            {/* Sol: Merkezi Cari Kart Seçimi ve GİB Mükellef Bilgisi */}
            <div style={{ background: 'var(--bg-surface-secondary)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Building size={16} />
                  {invoiceType === 'PURCHASE' ? 'Tedarikçi / Satıcı Cari Kartı' : 'Müşteri / Alıcı Cari Kartı'}
                </span>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={() => setIsCustomerSelectorOpen(true)}
                    style={{ fontSize: '11px', padding: '3px 8px' }}
                  >
                    <Search size={13} /> Cari Seç (F2)
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => setIsQuickCustomerOpen(true)}
                    style={{ fontSize: '11px', padding: '3px 8px' }}
                  >
                    <Plus size={13} /> Yeni Cari (F5)
                  </button>
                </div>
              </div>

              {selectedCustomer ? (
                <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '10px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-main)' }}>
                          {selectedCustomer.title}
                        </span>
                        {isTaxpayerChecking && (
                          <span style={{ fontSize: '10px', color: '#0284c7' }}>GİB Sorgulanıyor...</span>
                        )}
                        {taxpayerInfo && (
                          <span
                            style={{
                              fontSize: '10px',
                              fontWeight: 700,
                              padding: '2px 6px',
                              borderRadius: '4px',
                              backgroundColor:
                                taxpayerInfo.isEInvoiceUser === true ? '#10b981'
                                : taxpayerInfo.isEInvoiceUser === false ? '#64748b'
                                : '#b45309',
                              color: '#ffffff',
                            }}
                            title={taxpayerInfo.isEInvoiceUser == null ? 'Mükellefiyet durumu GİB\'den doğrulanamadı' : undefined}
                          >
                            {taxpayerInfo.isEInvoiceUser === true
                              ? '✓ e-Fatura Mükellefi'
                              : taxpayerInfo.isEInvoiceUser === false
                                ? 'e-Arşiv'
                                : '? Mükellefiyet Doğrulanamadı'}
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                        Kod: <strong>{selectedCustomer.code}</strong> | VKN/TCKN: {selectedCustomer.taxNumber || '-'} | {selectedCustomer.city || 'Şehir Yok'}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Güncel Bakiye:</div>
                      <div style={{ fontSize: '13px', fontWeight: 800, color: selectedCustomer.balance > 0 ? '#ef4444' : '#10b981' }}>
                        {selectedCustomer.balance.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺
                      </div>
                    </div>
                  </div>

                  {/* Risk Limit Warning */}
                  {selectedCustomer.riskLimit > 0 && selectedCustomer.balance > selectedCustomer.riskLimit && (
                    <div style={{ marginTop: '8px', background: '#fef2f2', border: '1px solid #ef4444', borderRadius: '4px', padding: '4px 8px', fontSize: '11px', color: '#b91c1c', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <ShieldAlert size={14} />
                      <strong>UYARI:</strong> Cari risk limiti aşılmış! (Limit: {selectedCustomer.riskLimit.toLocaleString('tr-TR')} ₺)
                    </div>
                  )}
                </div>
              ) : (
                <div
                  onClick={() => setIsCustomerSelectorOpen(true)}
                  style={{
                    border: '2px dashed var(--border-color)',
                    borderRadius: '6px',
                    padding: '16px',
                    textAlign: 'center',
                    cursor: 'pointer',
                    background: 'var(--bg-surface)',
                    color: 'var(--text-muted)',
                  }}
                >
                  <Search size={22} style={{ margin: '0 auto 6px auto', opacity: 0.6 }} />
                  <div style={{ fontSize: '12px', fontWeight: 600 }}>Cari Kart Seçmek İçin Tıklayın (F2)</div>
                  <div style={{ fontSize: '11px', opacity: 0.8 }}>Ünvan veya VKN/TCKN ile anında bulun</div>
                </div>
              )}
            </div>

            {/* Sağ: Tarih, Vade, Senaryo ve Fatura Tipi */}
            <div style={{ background: 'var(--bg-surface-secondary)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '12px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <div className="form-group">
                <label className="form-label required">Fatura Tarihi</label>
                <input
                  type="date"
                  className="form-input"
                  value={date}
                  onChange={e => setDate(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Vade Tarihi</label>
                <input
                  type="date"
                  className="form-input"
                  value={maturityDate}
                  onChange={e => setMaturityDate(e.target.value)}
                />
              </div>

              {/* 2026-10-12: SERİ + TASARIM seçimi. Seri YOKSA bu iki alan
                  gizlenir (eski tek sayaç + varsayılan tasarım kullanılır). */}
              {invoiceSeries.length > 0 && (
                <div className="form-group">
                  <label className="form-label">Belge Serisi</label>
                  <select
                    className="form-select"
                    value={selectedSeriesId}
                    onChange={e => setSelectedSeriesId(e.target.value)}
                    title={invoiceSeries.find(s => s.id === selectedSeriesId)?.nextPreview
                      ? `Sıradaki: ${invoiceSeries.find(s => s.id === selectedSeriesId)?.nextPreview}`
                      : undefined}
                  >
                    <option value="">Otomatik (varsayılan sayaç)</option>
                    {invoiceSeries.map(s => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.prefix}){s.nextPreview ? ` — Sıradaki: ${s.nextPreview}` : ''}{s.isDefault ? ' ★' : ''}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {designs.length > 1 && (
                <div className="form-group">
                  <label className="form-label">e-Belge Tasarımı</label>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <select
                      className="form-select"
                      style={{ flex: 1 }}
                      value={selectedDesignId}
                      onChange={e => setSelectedDesignId(e.target.value)}
                    >
                      {designs.map(d => (
                        <option key={d.id} value={d.id}>
                          {d.name}{d.isDefault ? ' (Varsayılan)' : ''}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      title="Tasarımı düzenle (Ayarlar > Fatura Tasarımı)"
                      onClick={() => {
                        setActiveView('ayarlar');
                        onClose();
                        showToast('Ayarlar > Fatura Tasarımı bölümünden tasarımı düzenleyebilirsiniz.', 'info');
                      }}
                    >
                      Düzenle
                    </button>
                  </div>
                </div>
              )}

              {/* 2026-10-12: SEKMELİ VERGİ SEÇİMİ (Genel / e-Devlet / Diğer).
                  e-Devlet sekmesinde senaryo + GİB fatura tipi seçilir. */}
              <div className="form-group" style={{ gridColumn: 'span 2' }}>
                <div style={{ display: 'flex', gap: '16px', borderBottom: '1px solid var(--border-color)', marginBottom: '10px' }}>
                  {(['GENEL', 'EDEVLET', 'DIGER'] as const).map(tab => (
                    <button
                      key={tab}
                      type="button"
                      onClick={() => setTaxTab(tab)}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        cursor: 'pointer',
                        padding: '6px 2px',
                        fontSize: '12px',
                        fontWeight: taxTab === tab ? 700 : 400,
                        color: taxTab === tab ? 'var(--primary)' : 'var(--text-muted)',
                        borderBottom: taxTab === tab ? '2px solid var(--primary)' : '2px solid transparent',
                        marginBottom: '-1px',
                      }}
                    >
                      {tab === 'GENEL' ? 'Genel' : tab === 'EDEVLET' ? 'e-Devlet' : 'Diğer'}
                    </button>
                  ))}
                </div>

                {taxTab === 'GENEL' && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                    <div>
                      <label className="form-label">Fatura Tipi / Türü</label>
                      <select
                        className="form-select"
                        value={['SATIS', 'IADE'].includes(invoiceCategory) ? invoiceCategory : 'SATIS'}
                        onChange={e => handleCategoryChange(e.target.value as any)}
                      >
                        <option value="SATIS">Satış Faturası</option>
                        <option value="IADE">İade Faturası</option>
                      </select>
                    </div>
                    <div>
                      <label className="form-label">Para Birimi</label>
                      <select
                        className="form-select"
                        value={currency}
                        onChange={e => setCurrency(e.target.value as any)}
                      >
                        <option value="TRY">TRY (Türk Lirası)</option>
                        <option value="USD">USD (Amerikan Doları)</option>
                        <option value="EUR">EUR (Euro)</option>
                        <option value="GBP">GBP (İngiliz Sterlini)</option>
                      </select>
                    </div>
                  </div>
                )}

                {taxTab === 'EDEVLET' && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                    <div>
                      <label className="form-label">Senaryo</label>
                      <input
                        type="text"
                        className="form-input"
                        value="Ticari Fatura"
                        disabled
                        title="Senaryo alıcının mükellefiyetine göre otomatik belirlenir"
                      />
                      <span style={{ fontSize: 'var(--fs-2xs)', color: 'var(--text-muted)' }}>
                        Senaryo: {invoiceProfile === 'TICARIFATURA' ? 'Ticari Fatura' : invoiceProfile === 'TEMELFATURA' ? 'Temel Fatura' : 'e-Arşiv'}
                      </span>
                    </div>
                    <div>
                      <label className="form-label">GİB Fatura Tipi</label>
                      <select
                        className="form-select"
                        value={invoiceCategory}
                        onChange={e => handleCategoryChange(e.target.value as any)}
                      >
                        <option value="SATIS">Satış</option>
                        <option value="IADE">İade</option>
                        <option value="TEVKIFAT">Tevkifat</option>
                        <option value="ISTISNA">İstisna (0 KDV)</option>
                        <option value="OZELMATRAH">Özel Matrah</option>
                        <option value="IHRACKAYITLI">İhraç Kayıtlı</option>
                        <option value="KONAKLAMA">Konaklama Vergisi</option>
                        <option value="SGK">SGK</option>
                      </select>
                    </div>
                    <div style={{ gridColumn: 'span 2' }}>
                      <label className="form-label">Fatura Senaryosu (detay)</label>
                      <select
                        className="form-select"
                        value={invoiceProfile}
                        onChange={e => setInvoiceProfile(e.target.value as any)}
                      >
                        <option value="TICARIFATURA" disabled={invoiceType === 'SALES' && taxpayerInfo?.isEInvoiceUser === false}>Ticari Fatura (Kabul/Red)</option>
                        <option value="TEMELFATURA" disabled={invoiceType === 'SALES' && taxpayerInfo?.isEInvoiceUser === false}>Temel Fatura (Doğrudan Kabul)</option>
                        <option value="EARSIVFATURA" disabled={invoiceType === 'SALES' && taxpayerInfo?.isEInvoiceUser === true}>e-Arşiv Fatura (Bireysel/GİB)</option>
                        <option value="IHRACAT">İhracat Faturası (GÇB)</option>
                        <option value="KAMU">Kamu Faturası</option>
                        <option value="HAL">Hal Faturası</option>
                      </select>
                    </div>
                  </div>
                )}

                {taxTab === 'DIGER' && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                    <div>
                      <label className="form-label">İrsaliye Yerine Geçer</label>
                      <select
                        className="form-select"
                        value={replacesDespatch ? 'EVET' : 'HAYIR'}
                        onChange={e => setReplacesDespatch(e.target.value === 'EVET')}
                      >
                        <option value="HAYIR">Hayır</option>
                        <option value="EVET">Evet</option>
                      </select>
                    </div>
                    <div>
                      <label className="form-label">ETTN No</label>
                      <input
                        type="text"
                        className="form-input"
                        value={ettnNo}
                        onChange={e => setEttnNo(e.target.value)}
                        placeholder="Otomatik (kaydederken üretilir)"
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* 2. TEVKİFAT, İSTİSNA, ÖZEL MATRAH, KONAKLAMA, SGK & DÖVİZ EK AYAR PANELİ (Şarta Bağlı) */}
          {(invoiceCategory === 'TEVKIFAT' || invoiceCategory === 'ISTISNA' || invoiceCategory === 'OZELMATRAH' || invoiceCategory === 'KONAKLAMA' || invoiceCategory === 'SGK' || currency !== 'TRY') && (
            <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px', padding: '10px 14px', display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: '12px' }}>
              {invoiceCategory === 'TEVKIFAT' && (
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label" style={{ color: '#166534', fontWeight: 700 }}>Tevkifat Kodu ve Oranı</label>
                  <select
                    className="form-select"
                    value={withholdingCode}
                    onChange={e => handleTevkifatChange(e.target.value)}
                  >
                    <option value="">-- Tevkifat Kodu Seçin --</option>
                    {TEVKIFAT_CODES.map(t => (
                      <option key={t.code} value={t.code}>
                        {t.code} - {t.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {invoiceCategory === 'ISTISNA' && (
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label" style={{ color: '#166534', fontWeight: 700 }}>GİB KDV Muafiyet / İstisna Kodu</label>
                  <select
                    className="form-select"
                    value={exemptionCode}
                    onChange={e => setExemptionCode(e.target.value)}
                  >
                    {EXEMPTION_CODES.map(ex => (
                      <option key={ex.code} value={ex.code}>
                        {ex.code} - {ex.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* 2026-10-12: Yeni GİB tipleri bilgi paneli (hesap mantığı değişmez;
                  tip `InvoiceTypeCode` alanına yazılır, KDV/matrah hesabı aynı kalır). */}
              {(invoiceCategory === 'OZELMATRAH' || invoiceCategory === 'KONAKLAMA' || invoiceCategory === 'SGK' || invoiceCategory === 'IHRACKAYITLI') && (
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label" style={{ color: '#166534', fontWeight: 700 }}>
                    {invoiceCategory === 'OZELMATRAH' ? 'Özel Matrah' : invoiceCategory === 'KONAKLAMA' ? 'Konaklama Vergisi' : invoiceCategory === 'SGK' ? 'SGK' : 'İhraç Kayıtlı Teslim'}
                  </label>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', background: 'var(--bg-surface)', border: '1px solid var(--border-light)', borderRadius: '6px', padding: '8px 10px' }}>
                    {invoiceCategory === 'OZELMATRAH' && 'GİB tipi "Özel Matrah" olarak işlenir. Matrah ve KDV hesabı mevcut kalem tutarlarından yapılır.'}
                    {invoiceCategory === 'KONAKLAMA' && 'GİB tipi "Konaklama Vergisi" olarak işlenir. Konaklama vergisi kalem tutarlarına dahildir.'}
                    {invoiceCategory === 'SGK' && 'GİB tipi "SGK" olarak işlenir. SGK kesintisi ayrıca hesaplanmaz, brüt tutar korunur.'}
                    {invoiceCategory === 'IHRACKAYITLI' && 'GİB tipi "İhraç Kayıtlı" olarak işlenir. İhracat istisnası ayrıca belge gerektirir.'}
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', gap: '8px' }}>
                <div className="form-group" style={{ flex: 1, margin: 0 }}>
                  <label className="form-label">Para Birimi</label>
                  <select
                    className="form-select"
                    value={currency}
                    onChange={e => setCurrency(e.target.value as any)}
                  >
                    <option value="TRY">TRY (Türk Lirası)</option>
                    <option value="USD">USD (Amerikan Doları)</option>
                    <option value="EUR">EUR (Euro)</option>
                    <option value="GBP">GBP (İngiliz Sterlini)</option>
                  </select>
                </div>
                {currency !== 'TRY' && (
                  <div className="form-group" style={{ width: '110px', margin: 0 }}>
                    <label className="form-label">TCMB Kuru</label>
                    <input
                      type="number"
                      step="0.0001"
                      className="form-input"
                      value={exchangeRate}
                      onChange={e => setExchangeRate(Number(e.target.value) || 1)}
                    />
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 3. HIZLI BARKOD OKUYUCU VE ÜRÜN SEÇİM ÇUBUĞU */}
          <div style={{ background: 'var(--bg-surface-secondary)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '10px 14px', display: 'flex', gap: '10px', alignItems: 'center' }}>
            <form onSubmit={handleBarcodeScan} style={{ display: 'flex', gap: '8px', flex: 1 }}>
              <div style={{ position: 'relative', flex: 1 }}>
                <Barcode size={18} color="var(--text-muted)" style={{ position: 'absolute', left: '10px', top: '9px' }} />
                <input
                  ref={barcodeInputRef}
                  type="text"
                  className="form-input"
                  style={{ paddingLeft: '34px' }}
                  placeholder="Barkod okutun veya stok kodu yazıp Enter'a basın..."
                  value={quickBarcode}
                  onChange={e => setQuickBarcode(e.target.value)}
                />
              </div>
              <button type="submit" className="btn btn-secondary btn-sm">
                Barkodla Ekle
              </button>
            </form>

            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => setIsProductSelectorOpen(true)}
              style={{ display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap' }}
            >
              <Package size={15} />
              <span>📦 Ürünler Penceresi (F3)</span>
            </button>

            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => setIsQuickProductOpen(true)}
              style={{ display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap' }}
            >
              <Plus size={15} />
              <span>+ Yeni Ürün (F4)</span>
            </button>
          </div>

          {/* 4. FATURA KALEMLERİ TABLOSU */}
          <div style={{ border: '1px solid var(--border-color)', borderRadius: '8px', overflow: 'hidden' }}>
            <table className="datagrid-table" style={{ width: '100%', fontSize: '12px' }}>
              <thead>
                <tr>
                  <th style={{ width: '35px', textAlign: 'center' }}>#</th>
                  <th style={{ width: '100px' }}>Stok Kodu</th>
                  <th>Ürün / Hizmet Açıklaması</th>
                  <th style={{ width: '85px', textAlign: 'center' }}>Miktar</th>
                  <th style={{ width: '70px', textAlign: 'center' }}>Birim</th>
                  <th style={{ width: '110px', textAlign: 'right' }}>Birim Fiyat</th>
                  <th style={{ width: '70px', textAlign: 'center' }}>İsk %</th>
                  <th style={{ width: '70px', textAlign: 'center' }}>KDV %</th>
                  <th style={{ width: '110px', textAlign: 'right' }}>Net Tutar</th>
                  <th style={{ width: '110px', textAlign: 'right' }}>KDV Dahil</th>
                  <th style={{ width: '40px' }}></th>
                </tr>
              </thead>
              <tbody>
                {items.length === 0 ? (
                  <tr>
                    <td colSpan={11} style={{ textAlign: 'center', padding: '36px', color: 'var(--text-muted)' }}>
                      <Package size={30} style={{ margin: '0 auto 8px auto', opacity: 0.5 }} />
                      <div style={{ fontWeight: 600 }}>Henüz fatura kalemi eklenmedi.</div>
                      <div style={{ fontSize: '11px', marginTop: '4px' }}>
                        Faturaya ürün eklemek için <strong>"Ürünler Penceresi (F3)"</strong> butonunu kullanın veya barkod okutun.
                      </div>
                    </td>
                  </tr>
                ) : (
                  items.map((item, idx) => (
                    <tr key={idx}>
                      <td style={{ textAlign: 'center', color: 'var(--text-muted)' }}>{idx + 1}</td>
                      <td style={{ fontWeight: 600, color: 'var(--primary)', fontFamily: 'var(--font-mono)' }}>
                        {item.productCode}
                      </td>
                      <td>
                        <div style={{ fontWeight: 600 }}>{item.productName}</div>
                        {item.barcode && <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Barkod: {item.barcode}</div>}
                      </td>
                      <td>
                        <input
                          type="number"
                          min="1"
                          className="form-input"
                          style={{ width: '100%', padding: '4px', textAlign: 'center', fontSize: '12px' }}
                          value={item.quantity}
                          onChange={e => updateItem(idx, 'quantity', e.target.value)}
                        />
                      </td>
                      <td style={{ textAlign: 'center' }}>{formatUnitLabel(item.unit, '')}</td>
                      <td>
                        <input
                          type="number"
                          step="0.01"
                          className="form-input"
                          style={{ width: '100%', padding: '4px', textAlign: 'right', fontSize: '12px' }}
                          value={item.unitPrice}
                          onChange={e => updateItem(idx, 'unitPrice', e.target.value)}
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          min="0"
                          max="100"
                          className="form-input"
                          style={{ width: '100%', padding: '4px', textAlign: 'center', fontSize: '12px' }}
                          value={item.discount1}
                          onChange={e => updateItem(idx, 'discount1', e.target.value)}
                        />
                      </td>
                      <td>
                        <select
                          className="form-select"
                          style={{ width: '100%', padding: '4px', textAlign: 'center', fontSize: '12px' }}
                          value={item.vatRate}
                          onChange={e => updateItem(idx, 'vatRate', e.target.value)}
                        >
                          <option value="0">%0</option>
                          <option value="1">%1</option>
                          <option value="10">%10</option>
                          <option value="20">%20</option>
                        </select>
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 600 }}>
                        {item.lineTotal.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--primary)' }}>
                        {item.lineGrandTotal.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <button
                          type="button"
                          onClick={() => removeItem(idx)}
                          style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#ef4444' }}
                          title="Satırı Sil"
                        >
                          <Trash2 size={15} />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* 5. ÖDEME ŞEKLİ & DİP TOPLAMLAR ÖZETİ */}
          <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '14px', alignItems: 'flex-start' }}>
            <div style={{ background: 'var(--bg-surface-secondary)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '12px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div className="form-group">
                  <label className="form-label">Ödeme Şekli</label>
                  <select
                    className="form-select"
                    value={paymentType}
                    onChange={e => setPaymentType(e.target.value as any)}
                  >
                    <option value="OPEN_ACCOUNT">Açık Hesap (Vadeli Cari)</option>
                    <option value="CASH">Peşin Nakit (Kasa)</option>
                    <option value="CREDIT_CARD">Kredi Kartı (POS)</option>
                    <option value="BANK_TRANSFER">Banka Havalesi / EFT</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Fatura Notu</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="Faturada görünecek açıklama..."
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                  />
                </div>
                {/* 2026-10-17: Stok hareketinin yazılacağı depo. Seçilmezse
                    kaydetme engellenir (sunucu varsayılan seçmez). */}
                <div className="form-group" style={{ gridColumn: 'span 2' }}>
                  <label className="form-label required">Depo (Stok Hareketi)</label>
                  <select
                    className="form-select"
                    value={warehouseId}
                    onChange={e => setWarehouseId(e.target.value)}
                    disabled={warehouses.length === 0}
                  >
                    {warehouses.length === 0 ? (
                      <option value="">Depo tanımlı değil — önce depo tanımlayın</option>
                    ) : (
                      <>
                        <option value="">-- Depo Seçiniz --</option>
                        {warehouses.map(w => (
                          <option key={w.id} value={w.id}>
                            {w.name}
                          </option>
                        ))}
                      </>
                    )}
                  </select>
                  {warehouses.length === 0 && (
                    <div style={{ fontSize: '11px', color: 'var(--danger, #ef4444)', marginTop: '4px' }}>
                      Bu firma için tanımlı depo yok; fatura stok hareketi oluşturamaz.
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div style={{ border: '1px solid var(--border-color)', borderRadius: '8px', background: 'var(--bg-surface-secondary)', padding: '12px 16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', fontSize: '13px' }}>
                <span style={{ color: 'var(--text-muted)' }}>Ara Toplam (Net):</span>
                <strong>{subTotal.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺</strong>
              </div>
              {totalDiscount > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', fontSize: '13px', color: '#ef4444' }}>
                  <span>Toplam İskonto:</span>
                  <strong>-{totalDiscount.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺</strong>
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', fontSize: '13px' }}>
                <span style={{ color: 'var(--text-muted)' }}>Hesaplanan KDV:</span>
                <strong>{totalVat.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺</strong>
              </div>
              {totalWithholding > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', fontSize: '13px', color: '#ea580c' }}>
                  <span>Tevkifat Tutarı ({withholdingCode}):</span>
                  <strong>-{totalWithholding.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺</strong>
                </div>
              )}
              {totalWithholding > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '13px' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Ödenecek KDV:</span>
                  <strong>{payableVat.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺</strong>
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '18px', fontWeight: 800, borderTop: '2px solid var(--border-color)', paddingTop: '8px' }}>
                <span>GENEL TOPLAM:</span>
                <span style={{ color: 'var(--primary)' }}>{grandTotal.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺</span>
              </div>
            </div>
          </div>
        </div>
      </Modal>

      {/* MERKEZİ CARİ SEÇİM MODALI */}
      <CustomerSelectorModal
        isOpen={isCustomerSelectorOpen}
        onClose={() => setIsCustomerSelectorOpen(false)}
        onSelect={handleSelectCustomer}
        filterType={invoiceType === 'PURCHASE' ? 'SUPPLIER' : 'CUSTOMER'}
      />

      {/* MERKEZİ ÜRÜN SEÇİM MODALI */}
      <ProductSelectorModal
        isOpen={isProductSelectorOpen}
        onClose={() => setIsProductSelectorOpen(false)}
        onSelect={handleAddProductToItems}
        onSelectMany={handleAddProductsToItems}
        priceType={invoiceType === 'PURCHASE' ? 'PURCHASE' : 'SALE'}
      />

      {/* HIZLI YENİ CARİ EKLEME MODALI */}
      <QuickCustomerCreateModal
        isOpen={isQuickCustomerOpen}
        onClose={() => setIsQuickCustomerOpen(false)}
        onCustomerCreated={handleSelectCustomer}
        defaultType={invoiceType === 'PURCHASE' ? 'SUPPLIER' : 'CUSTOMER'}
      />

      {/* HIZLI YENİ ÜRÜN EKLEME MODALI */}
      <QuickProductCreateModal
        isOpen={isQuickProductOpen}
        onClose={() => setIsQuickProductOpen(false)}
        onProductCreated={handleAddProductToItems}
      />
    </>
  );
};
