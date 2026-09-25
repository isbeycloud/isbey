import React, { useState, useEffect } from 'react';
import {
  X,
  Plus,
  Trash2,
  Send,
  Save,
  Eye,
  Download,
  Building,
  User,
  Calendar,
  Clock,
  DollarSign,
  FileText,
  Truck,
  ShieldCheck,
  CreditCard,
  Layers,
  Search,
  RefreshCw,
  Copy,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
} from 'lucide-react';
import {
  HIZLI_BIRIM_LISTESI,
  HIZLI_ISTISNA_LISTESI,
  HIZLI_VERGI_LISTESI,
  HIZLI_TEVKIFAT_LISTESI,
  HIZLI_PARA_BIRIMLERI,
  HIZLI_ODEME_TIPLERI,
  HIZLI_ODEME_KANALLARI,
  HIZLI_TANITICI_KODLAR,
  TURKIYE_ILLERI,
} from '../../../data/hizliBilisimConstants';
import type {
  HizliInvoiceModel,
  HizliInvoiceLine,
  HizliProfileId,
  HizliInvoiceTypeCode,
} from '../../../types/hizliBilisim';
import {
  generateEttn,
  calculateHizliLine,
  calculateHizliInvoiceTotals,
  formatCurrency,
} from '../../../utils/hizliBilisimCalculator';
import { api } from '../../../services/api';
import { useToast } from '../../../context/ToastContext';
import { useApp } from '../../../context/AppContext';

interface HizliInvoiceCreateModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultProfileId?: HizliProfileId;
  defaultInvoiceTypeCode?: HizliInvoiceTypeCode;
  onSuccess?: () => void;
}

type TabKey = 'ALICI' | 'IRSALIYE' | 'SGK' | 'ODEME' | 'EK_ALANLAR' | 'IADE';

export const HizliInvoiceCreateModal: React.FC<HizliInvoiceCreateModalProps> = ({
  isOpen,
  onClose,
  defaultProfileId = 'TICARIFATURA',
  defaultInvoiceTypeCode = 'SATIS',
  onSuccess,
}) => {
  const { showToast: toast } = useToast();
  const { triggerRefresh } = useApp();

  const [activeTab, setActiveTab] = useState<TabKey>('ALICI');
  const [submitting, setSubmitting] = useState(false);
  const [fetchingRate, setFetchingRate] = useState(false);

  // Müşteri & Ürün Arama Havuzu
  const [existingCustomers, setExistingCustomers] = useState<any[]>([]);
  const [existingProducts, setExistingProducts] = useState<any[]>([]);

  // KDV Dahil / Hariç Modu
  const [isKdvDahil, setIsKdvDahil] = useState(false);

  // Ana Fatura Modeli
  const [model, setModel] = useState<HizliInvoiceModel>({
    invoiceheader: {
      SignedByUser: false,
      LocalReferenceId: null,
      SubeKodu: 1,
      Prefix: '',
      SourceUrn: 'urn:mail:defaultgb@beyogluteknoloji.com',
      DestinationUrn: null,
      UpdateDocument: false,
      UUID: generateEttn(),
      Invoice_ID: 'Otomatik',
      ProfileID: defaultProfileId,
      InvoiceTypeCode: defaultInvoiceTypeCode,
      IssueDate: new Date().toISOString().split('T')[0],
      IssueTime: new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }),
      DocumentCurrencyCode: 'TRY',
      CalculationRate: 1,
      XSLT_Adi: 'general',
      XSLT_Doc: null,
      LineExtensionAmount: 0,
      AllowanceTotalAmount: 0,
      TaxInclusiveAmount: 0,
      ChargeTotalAmount: 0,
      PayableRoundingAmount: 0,
      PayableAmount: 0,
      Note: '',
      Notes: null,
      OrderReferenceId: null,
      OrderReferenceDate: null,
      EArchiveSendType: null,
      IsInternetSale: false,
      Kdv_Statu: false,
      Manuel_Total: false,
    },
    customer: {
      IdentificationID: '',
      PartyName: '',
      TaxSchemeName: '',
      StreetName: '',
      CitySubdivisionName: '',
      CityName: 'ADANA',
      CountryName: 'TURKIYE',
      Telephone: '',
      PostalZone: '',
      ElectronicMail: '',
      WebsiteURI: '',
      Person_FirstName: '',
      Person_FamilyName: '',
      ManuelCityAndSubdivision: true,
    },
    supplier: {
      supplierParty: {
        IdentificationID: '1681136628',
        PartyName: 'BEYOĞLU TEKNOLOJİ LTD. ŞTİ.',
        TaxSchemeName: 'ZİYAPAŞA VERGİ DAİRESİ MÜDÜRLÜĞÜ',
        StreetName: 'Reşatbey Mah. Ordu Cad. Ünsal Apt. No:79/B',
        CitySubdivisionName: 'SEYHAN',
        CityName: 'ADANA',
        CountryName: 'TURKIYE',
        Telephone: '0322 408 16 26',
        PostalZone: '01000',
        ElectronicMail: 'muhasebe@beyogluteknoloji.com',
      },
    },
    despatchs: [],
    paymentMeans: {
      PaymentMeansCode: '10',
      PaymentDueDate: new Date().toISOString().split('T')[0],
      InstructionNote: '',
      PaymentChannelCode: '',
      PayeeFinancialAccount: '',
      PayeeFinancialCurrencyCode: 'TRY',
    },
    invoiceLines: [
      {
        ID: 1,
        Item_Name: '',
        Quantity_Amount: 1,
        Quantity_Unit_User: 'C62',
        Price_Amount: 0,
        Allowance_Percent: 0,
        Allowance_Amount: 0,
        Price_Total: 0,
        lineTaxes: [
          {
            Tax_Code: '0015',
            Tax_Name: 'KDV',
            Tax_Perc: 20,
            Tax_Base: 0,
            Tax_Amnt: 0,
          },
        ],
      },
    ],
  });

  // Başlangıç verilerini yükle
  useEffect(() => {
    if (isOpen) {
      loadInitialData();
      // Yeni ETTN oluştur
      setModel((prev) => ({
        ...prev,
        invoiceheader: {
          ...prev.invoiceheader,
          UUID: generateEttn(),
          ProfileID: defaultProfileId,
          InvoiceTypeCode: defaultInvoiceTypeCode,
          IssueDate: new Date().toISOString().split('T')[0],
          IssueTime: new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }),
        },
      }));
    }
  }, [isOpen, defaultProfileId, defaultInvoiceTypeCode]);

  const loadInitialData = async () => {
    setModel(prev => ({ ...prev, invoiceheader: { ...prev.invoiceheader, Prefix: '' } }));
    try {
      const defaults = await api.getTenantInvoiceDefaults();
      if (defaults.success) setModel(prev => ({ ...prev, invoiceheader: { ...prev.invoiceheader, Prefix: defaults.settings.defaultInvoicePrefix || '' } }));
    } catch {
      toast('Firmanın fatura serisi alınamadı. Seri seçimini kontrol edin.', 'error');
    }
    try {
      const [custRes, prodRes] = await Promise.all([
        api.getCustomers(),
        api.getProducts(),
      ]);
      if (custRes.success && custRes.customers) {
        setExistingCustomers(custRes.customers);
      }
      if (prodRes.success && prodRes.products) {
        setExistingProducts(prodRes.products);
      }
    } catch (err) {
      console.warn('Veri yükleme hatası:', err);
    }
  };

  // TCMB Kur Getir
  const handleFetchTcmbRate = async () => {
    const curr = model.invoiceheader.DocumentCurrencyCode;
    if (curr === 'TRY') {
      setModel((prev) => ({
        ...prev,
        invoiceheader: { ...prev.invoiceheader, CalculationRate: 1 },
      }));
      toast('TRY kuru 1.00 olarak ayarlandı.', 'info');
      return;
    }

    setFetchingRate(true);
    try {
      const res = await api.getHizliTcmbRate(curr, 'SatisKur');
      if (res.success && res.rate) {
        setModel((prev) => ({
          ...prev,
          invoiceheader: { ...prev.invoiceheader, CalculationRate: res.rate },
        }));
        toast(`TCMB ${curr} Satış Kuru: ${res.rate.toFixed(4)} TL alındı.`, 'success');
      } else {
        toast('Kur bilgisi alınamadı.', 'error');
      }
    } catch (err: any) {
      toast(err.message || 'Kur getirme hatası.', 'error');
    } finally {
      setFetchingRate(false);
    }
  };

  // Müşteri seçildiğinde form alanlarını doldur
  const handleSelectCustomer = (cust: any) => {
    setModel((prev) => ({
      ...prev,
      customer: {
        IdentificationID: cust.taxNumber || cust.tckn || '',
        PartyName: cust.title || cust.name || '',
        TaxSchemeName: cust.taxOffice || '',
        StreetName: cust.address || '',
        CitySubdivisionName: cust.district || '',
        CityName: cust.city || 'ADANA',
        CountryName: 'TURKIYE',
        Telephone: cust.phone || '',
        PostalZone: cust.postalCode || '01000',
        ElectronicMail: cust.email || '',
        WebsiteURI: '',
        Person_FirstName: '',
        Person_FamilyName: '',
        ManuelCityAndSubdivision: true,
      },
      invoiceheader: {
        ...prev.invoiceheader,
        DestinationUrn: cust.pkUrn || null,
      },
    }));
    toast(`${cust.title || cust.name} bilgileri aktarıldı.`, 'info');
  };

  // Satır Değişikliği ve Otomatik Hesaplama
  const handleLineChange = (index: number, field: keyof HizliInvoiceLine, value: any) => {
    setModel((prev) => {
      const updatedLines = [...prev.invoiceLines];
      const targetLine = { ...updatedLines[index], [field]: value };

      // Satırı yeniden hesapla
      const recalculatedLine = calculateHizliLine(targetLine, isKdvDahil);
      updatedLines[index] = recalculatedLine;

      // Fatura toplamlarını hesapla
      const { header } = calculateHizliInvoiceTotals(prev.invoiceheader, updatedLines);

      return {
        ...prev,
        invoiceLines: updatedLines,
        invoiceheader: header,
      };
    });
  };

  // Satır KDV / Tevkifat Değişimi
  const handleLineTaxChange = (
    lineIndex: number,
    kdvPerc: number,
    tevkifatCode?: string,
    exemptionCode?: string
  ) => {
    setModel((prev) => {
      const updatedLines = [...prev.invoiceLines];
      const targetLine = { ...updatedLines[lineIndex] };

      let tevkPerc = 0;
      if (tevkifatCode) {
        const found = HIZLI_TEVKIFAT_LISTESI.find((t) => t.Kodu === tevkifatCode);
        if (found) tevkPerc = found.Orani;
      }

      targetLine.lineTaxes = [
        {
          Tax_Code: '0015',
          Tax_Name: 'KDV',
          Tax_Perc: kdvPerc,
          Tax_Base: 0,
          Tax_Amnt: 0,
          Tax_Exem_Code: exemptionCode || undefined,
          Tevkifat_Code: tevkifatCode || undefined,
          Tevkifat_Perc: tevkPerc || undefined,
        },
      ];

      const recalculatedLine = calculateHizliLine(targetLine, isKdvDahil);
      updatedLines[lineIndex] = recalculatedLine;

      const { header } = calculateHizliInvoiceTotals(prev.invoiceheader, updatedLines);

      return {
        ...prev,
        invoiceLines: updatedLines,
        invoiceheader: header,
      };
    });
  };

  // Satır Ekle
  const handleAddLine = () => {
    setModel((prev) => {
      const newLine: HizliInvoiceLine = {
        ID: prev.invoiceLines.length + 1,
        Item_Name: '',
        Quantity_Amount: 1,
        Quantity_Unit_User: 'C62',
        Price_Amount: 0,
        Allowance_Percent: 0,
        Allowance_Amount: 0,
        Price_Total: 0,
        lineTaxes: [
          {
            Tax_Code: '0015',
            Tax_Name: 'KDV',
            Tax_Perc: 20,
            Tax_Base: 0,
            Tax_Amnt: 0,
          },
        ],
      };
      const updatedLines = [...prev.invoiceLines, calculateHizliLine(newLine, isKdvDahil)];
      const { header } = calculateHizliInvoiceTotals(prev.invoiceheader, updatedLines);
      return { ...prev, invoiceLines: updatedLines, invoiceheader: header };
    });
  };

  // Satır Sil
  const handleRemoveLine = (index: number) => {
    if (model.invoiceLines.length <= 1) {
      toast('En az bir fatura satırı bulunmalıdır.', 'error');
      return;
    }
    setModel((prev) => {
      const updatedLines = prev.invoiceLines
        .filter((_, idx) => idx !== index)
        .map((l, i) => ({ ...l, ID: i + 1 }));
      const { header } = calculateHizliInvoiceTotals(prev.invoiceheader, updatedLines);
      return { ...prev, invoiceLines: updatedLines, invoiceheader: header };
    });
  };

  // İrsaliye Ekle
  const handleAddDespatch = () => {
    setModel((prev) => ({
      ...prev,
      despatchs: [
        ...(prev.despatchs || []),
        {
          DespatchDocumentID: '',
          DespatchDocumentIssueDate: prev.invoiceheader.IssueDate,
        },
      ],
    }));
  };

  // İrsaliye Sil
  const handleRemoveDespatch = (idx: number) => {
    setModel((prev) => ({
      ...prev,
      despatchs: (prev.despatchs || []).filter((_, i) => i !== idx),
    }));
  };

  // Fatura Kaydet (Taslak) veya Kaydet + GİB'e Gönder
  //
  // 2026-09-12 (dürüstlük düzeltmesi):
  // Bu fonksiyon daha önce `sendToGib=true` iken SADECE `create-model-invoice`
  // çağırıyor ve sonucu ne olursa olsun "✓ Fatura GİB'e Başarıyla İletildi!"
  // yazıyordu. Oysa `create-model-invoice` ucu HİÇBİR gönderim yapmaz (yalnız
  // taslak kaydeder) ve döndürdüğü `ettn` çoğu zaman null olduğu için ekranda
  // "ETTN: null" görünüyordu. Yani kullanıcıya gönderilmemiş bir belge için
  // "GİB'e iletildi" deniyordu — muhasebe açısından yalandır.
  //
  // Artık iki adım AYRI yürütülür ve sonuç gerçek yanıta göre raporlanır:
  //   1) Fatura taslak olarak kaydedilir (create-model-invoice)
  //   2) Yalnız gönderim istenmişse gerçek gönderim ucu çağrılır (send-invoice)
  //      ve GİB/entegratör reddederse fatura "gönderildi" SAYILMAZ.
  const handleSubmitInvoice = async (sendToGib: boolean) => {
    if (!/^[A-Z][A-Z0-9]{2}$/.test(model.invoiceheader.Prefix || '')) {
      toast('Üç karakterli fatura serisini giriniz.', 'error');
      return;
    }
    if (!model.customer.IdentificationID || !model.customer.PartyName) {
      toast('Lütfen alıcı VKN/TCKN ve Ünvan bilgilerini eksiksiz doldurunuz.', 'error');
      setActiveTab('ALICI');
      return;
    }

    if (model.invoiceLines.some((l) => !l.Item_Name || Number(l.Price_Amount) <= 0)) {
      toast('Lütfen tüm satırlarda Mal/Hizmet Adı ve Birim Fiyat alanlarını doldurunuz.', 'error');
      return;
    }

    setSubmitting(true);
    try {
      // 1. Adım: her iki durumda da faturayı kaydet (gönderimde de kayıt şart).
      const res = await api.createHizliModelInvoice({ model, isDraft: true });

      if (!res.success) {
        toast(res.message || 'Fatura kaydedilemedi.', 'error');
        return;
      }

      const invoiceId = res.invoice?.id;
      const invoiceNo = res.invoiceNo;

      // Yalnız taslak istendiyse burada biter.
      if (!sendToGib) {
        toast(`✓ Taslak Fatura Kaydedildi! (No: ${invoiceNo})`, 'success');
        triggerRefresh();
        if (onSuccess) onSuccess();
        onClose();
        return;
      }

      // 2. Adım: GERÇEK gönderim.
      if (!invoiceId) {
        toast(
          `Fatura taslak olarak kaydedildi (No: ${invoiceNo}) ancak kayıt kimliği alınamadığı için gönderilemedi.`,
          'error'
        );
        triggerRefresh();
        return;
      }

      // `api.request` HTTP 4xx/5xx'te FIRLATIR (success:false gövdesi dönmez).
      // Bu yüzden gönderim adımı kendi try/catch'inde ele alınır: aksi hâlde
      // hata dıştaki catch'e düşer ve kullanıcı "taslak kaydedildi" bilgisini
      // kaybeder — kaydın oluştuğunu sanıp yeniden dener (mükerrer fatura).
      let sendOk = false;
      let sendMessage = '';
      let sendUuid = '';

      try {
        const sendRes = await api.sendHizliInvoice(invoiceId);
        sendOk = sendRes.success === true;
        sendUuid = sendRes.uuid || '';
        sendMessage = sendRes.message || '';
      } catch (sendErr: any) {
        sendOk = false;
        sendMessage = sendErr?.message || 'entegratör gönderimi reddetti';
      }

      if (sendOk) {
        toast(`Fatura entegratör tarafından kabul edildi. GİB durumunu takip edin.${sendUuid ? ` (ETTN: ${sendUuid})` : ''}`, 'success');
      } else {
        // Gönderim başarısız → taslak KAYDEDİLDİ, ama GÖNDERİLMEDİ. Bu ayrım
        // kullanıcıya net söylenir; "başarılı" izlenimi verilmez.
        toast(
          `Fatura taslak olarak kaydedildi (No: ${invoiceNo}) ancak GİB'e GÖNDERİLEMEDİ: ${sendMessage}`,
          'error'
        );
      }

      triggerRefresh();
      if (onSuccess) onSuccess();
      onClose();
    } catch (err: any) {
      toast(err.message || 'İşlem sırasında hata oluştu.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  // XML İndir
  const handleDownloadXml = () => {
    const jsonStr = JSON.stringify(model, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Fatura_${model.invoiceheader.UUID}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast('Fatura verisi indirildi.', 'info');
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-900/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-7xl max-h-[96vh] flex flex-col overflow-hidden text-slate-800">
        
        {/* MODAL HEADER */}
        <div className="px-6 py-4 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white flex items-center justify-between border-b border-slate-700 shadow-md">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-600/30 border border-indigo-400/40 flex items-center justify-center text-indigo-300 font-bold text-lg shadow-inner">
              <FileText size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-bold tracking-tight text-white">
                  Yeni e-Fatura / e-Arşiv Oluştur
                </h3>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-500/20 text-indigo-300 border border-indigo-400/30">
                  Hızlı Bilişim & GİB Uyumlu
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Resmi UBL-TR 2.1 e-Fatura, e-Arşiv ve e-İrsaliye standartlarına uygun belge düzenleme motoru
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleDownloadXml}
              title="Fatura Modelini JSON/XML olarak indir"
              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-600 text-xs font-medium text-slate-200 flex items-center gap-1.5 transition-colors"
            >
              <Download size={14} /> Veri İndir
            </button>
            <button
              type="button"
              onClick={() => handleSubmitInvoice(false)}
              disabled={submitting}
              className="px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold flex items-center gap-1.5 transition-all shadow-sm"
            >
              <Save size={14} /> Taslak Kaydet
            </button>
            <button
              type="button"
              onClick={() => handleSubmitInvoice(true)}
              disabled={submitting}
              className="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1.5 transition-all shadow-sm ring-2 ring-emerald-400/20"
            >
              <Send size={14} /> GİB'e Gönder
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors ml-2"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* MODAL BODY (SCROLLABLE) */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5 bg-slate-50/50">
          
          {/* 1. ÜST GENEL BİLGİLER (KART) */}
          <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              
              {/* Senaryo */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Senaryo *
                </label>
                <select
                  value={model.invoiceheader.ProfileID}
                  onChange={(e) =>
                    setModel((prev) => ({
                      ...prev,
                      invoiceheader: {
                        ...prev.invoiceheader,
                        ProfileID: e.target.value as HizliProfileId,
                      },
                    }))
                  }
                  className="w-full text-xs font-medium bg-white border border-slate-300 rounded-lg px-2.5 py-2 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                >
                  <option value="TICARIFATURA">TİCARİ FATURA</option>
                  <option value="TEMELFATURA">TEMEL FATURA</option>
                  <option value="EARSIVFATURA">e-ARŞİV FATURA</option>
                  <option value="IHRACAT">İHRACAT FATURASI</option>
                  <option value="KAMU">KAMU FATURASI</option>
                  <option value="SGK">SGK FATURASI</option>
                  <option value="HKS">HAL KAYIT SİSTEMİ (HKS)</option>
                  <option value="ILAC_TIBBICIHAZ">İLAÇ / TIBBİ CİHAZ</option>
                  <option value="YATIRIMTESVIK">YATIRIM TEŞVİK</option>
                  <option value="IDIS">İDİS (İnşaat Demiri İzleme)</option>
                </select>
              </div>

              {/* Fatura Tipi */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Fatura Tipi *
                </label>
                <select
                  value={model.invoiceheader.InvoiceTypeCode}
                  onChange={(e) =>
                    setModel((prev) => ({
                      ...prev,
                      invoiceheader: {
                        ...prev.invoiceheader,
                        InvoiceTypeCode: e.target.value as HizliInvoiceTypeCode,
                      },
                    }))
                  }
                  className="w-full text-xs font-medium bg-white border border-slate-300 rounded-lg px-2.5 py-2 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                >
                  <option value="SATIS">SATIŞ</option>
                  <option value="ISTISNA">İSTİSNA</option>
                  <option value="IADE">İADE</option>
                  <option value="TEVKIFAT">TEVKİFAT</option>
                  <option value="TEVKIFATIADE">TEVKİFAT İADE</option>
                  <option value="OZELMATRAH">ÖZEL MATRAH</option>
                  <option value="IHRACKAYITLI">İHRAÇ KAYITLI</option>
                  <option value="SGK">SGK</option>
                  <option value="HKSSATIS">HKS SATIŞ</option>
                  <option value="KONAKLAMAVERGISI">KONAKLAMA VERGİSİ</option>
                </select>
              </div>

              {/* Fatura Tarihi & Saati */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Tarih *
                  </label>
                  <input
                    type="date"
                    value={model.invoiceheader.IssueDate}
                    onChange={(e) =>
                      setModel((prev) => ({
                        ...prev,
                        invoiceheader: {
                          ...prev.invoiceheader,
                          IssueDate: e.target.value,
                        },
                      }))
                    }
                    className="w-full text-xs bg-white border border-slate-300 rounded-lg px-2.5 py-2 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Saat *
                  </label>
                  <input
                    type="time"
                    value={model.invoiceheader.IssueTime}
                    onChange={(e) =>
                      setModel((prev) => ({
                        ...prev,
                        invoiceheader: {
                          ...prev.invoiceheader,
                          IssueTime: e.target.value,
                        },
                      }))
                    }
                    className="w-full text-xs bg-white border border-slate-300 rounded-lg px-2.5 py-2 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  />
                </div>
              </div>

              {/* Para Birimi & Kur */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Para Birimi & Kur
                </label>
                <div className="flex gap-1.5">
                  <select
                    value={model.invoiceheader.DocumentCurrencyCode}
                    onChange={(e) => {
                      const c = e.target.value;
                      setModel((prev) => ({
                        ...prev,
                        invoiceheader: {
                          ...prev.invoiceheader,
                          DocumentCurrencyCode: c,
                          CalculationRate: c === 'TRY' ? 1 : prev.invoiceheader.CalculationRate,
                        },
                      }));
                    }}
                    className="w-1/2 text-xs font-medium bg-white border border-slate-300 rounded-lg px-2 py-2"
                  >
                    {HIZLI_PARA_BIRIMLERI.map((p) => (
                      <option key={p.Kodu} value={p.Kodu}>
                        {p.Kodu}
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    step="0.0001"
                    title="Döviz Kuru"
                    placeholder="1.0000"
                    value={model.invoiceheader.CalculationRate}
                    onChange={(e) =>
                      setModel((prev) => ({
                        ...prev,
                        invoiceheader: {
                          ...prev.invoiceheader,
                          CalculationRate: Number(e.target.value) || 1,
                        },
                      }))
                    }
                    className="w-1/2 text-xs bg-white border border-slate-300 rounded-lg px-2 py-2 text-right"
                  />
                  <button
                    type="button"
                    onClick={handleFetchTcmbRate}
                    disabled={fetchingRate}
                    title="TCMB'den Güncel Kuru Getir"
                    className="px-2 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-indigo-700 rounded-lg text-xs font-bold"
                  >
                    <RefreshCw size={13} className={fetchingRate ? 'animate-spin' : ''} />
                  </button>
                </div>
              </div>

            </div>

            {/* ETTN / Prefix Bilgisi */}
            <div className="mt-3 pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-slate-700">ETTN (UUID):</span>
                <code className="bg-slate-100 px-2 py-0.5 rounded text-indigo-700 font-mono font-bold select-all">
                  {model.invoiceheader.UUID}
                </code>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(model.invoiceheader.UUID);
                    toast('ETTN kopyalandı.', 'info');
                  }}
                  className="text-slate-400 hover:text-slate-700"
                >
                  <Copy size={13} />
                </button>
              </div>

              <div className="flex items-center gap-4">
                <div className="flex items-center gap-1.5">
                  <span className="font-semibold text-slate-700">Ön Ek:</span>
                  <input
                    type="text"
                    maxLength={3}
                    value={model.invoiceheader.Prefix || ''}
                    onChange={(e) =>
                      setModel((prev) => ({
                        ...prev,
                        invoiceheader: {
                          ...prev.invoiceheader,
                          Prefix: e.target.value.toUpperCase(),
                        },
                      }))
                    }
                    className="w-16 text-center uppercase font-bold text-xs bg-slate-50 border border-slate-200 rounded px-1.5 py-0.5"
                  />
                </div>

                <div className="flex items-center gap-1.5">
                  <span className="font-semibold text-slate-700">Gönderici (GB):</span>
                  <span className="text-slate-600 truncate max-w-[220px]">
                    {model.invoiceheader.SourceUrn}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* 2. SEKMELİ DETAY FORMU (ALICI, İRSALİYE, SGK, ÖDEME, EK ALANLAR) */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            {/* TAB HEADERS */}
            <div className="flex border-b border-slate-200 bg-slate-50 px-3 pt-2 gap-1 overflow-x-auto">
              <button
                type="button"
                onClick={() => setActiveTab('ALICI')}
                className={`px-4 py-2.5 text-xs font-bold rounded-t-lg transition-all flex items-center gap-2 ${
                  activeTab === 'ALICI'
                    ? 'bg-white text-indigo-700 border-t-2 border-indigo-600 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                <User size={14} /> Alıcı / Cari Bilgileri *
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('IRSALIYE')}
                className={`px-4 py-2.5 text-xs font-bold rounded-t-lg transition-all flex items-center gap-2 ${
                  activeTab === 'IRSALIYE'
                    ? 'bg-white text-indigo-700 border-t-2 border-indigo-600 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                <Truck size={14} /> İrsaliye Eşleme ({model.despatchs?.length || 0})
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('ODEME')}
                className={`px-4 py-2.5 text-xs font-bold rounded-t-lg transition-all flex items-center gap-2 ${
                  activeTab === 'ODEME'
                    ? 'bg-white text-indigo-700 border-t-2 border-indigo-600 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                <CreditCard size={14} /> Ödeme & Banka
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('SGK')}
                className={`px-4 py-2.5 text-xs font-bold rounded-t-lg transition-all flex items-center gap-2 ${
                  activeTab === 'SGK'
                    ? 'bg-white text-indigo-700 border-t-2 border-indigo-600 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                <ShieldCheck size={14} /> SGK / Medula Ek Alanları
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('EK_ALANLAR')}
                className={`px-4 py-2.5 text-xs font-bold rounded-t-lg transition-all flex items-center gap-2 ${
                  activeTab === 'EK_ALANLAR'
                    ? 'bg-white text-indigo-700 border-t-2 border-indigo-600 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                <Layers size={14} /> Ek Alanlar & Notlar
              </button>
            </div>

            {/* TAB CONTENTS */}
            <div className="p-4">
              
              {/* TAB 1: ALICI BİLGİLERİ */}
              {activeTab === 'ALICI' && (
                <div className="space-y-4 animate-in fade-in-50 duration-150">
                  {/* Hızlı Müşteri Seçici */}
                  <div className="bg-indigo-50/60 p-3 rounded-lg border border-indigo-100 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2 text-xs font-bold text-indigo-900">
                      <Search size={14} /> Kayıtlı Carilerden Hızlı Seç:
                    </div>
                    <div className="flex-1 max-w-md">
                      <select
                        onChange={(e) => {
                          const c = existingCustomers.find((item) => item.id === e.target.value);
                          if (c) handleSelectCustomer(c);
                        }}
                        className="w-full text-xs bg-white border border-indigo-200 rounded-lg px-2.5 py-1.5 focus:ring-2 focus:ring-indigo-500"
                        defaultValue=""
                      >
                        <option value="" disabled>
                          Cari kart seçiniz...
                        </option>
                        {existingCustomers.map((c) => (
                          <option key={c.id} value={c.id}>
                            [{c.taxNumber || 'VKN YOK'}] {c.title || c.name} ({c.city || 'Şehir Yok'})
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {/* Sütun 1 */}
                    <div className="space-y-3">
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                          VKN / TCKN *
                        </label>
                        <input
                          type="text"
                          maxLength={11}
                          placeholder="10 veya 11 haneli kimlik no"
                          value={model.customer.IdentificationID}
                          onChange={(e) =>
                            setModel((prev) => ({
                              ...prev,
                              customer: {
                                ...prev.customer,
                                IdentificationID: e.target.value.replace(/\D/g, ''),
                              },
                            }))
                          }
                          className="w-full text-xs font-mono font-bold bg-white border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                          Firma Unvanı / Adı Soyadı *
                        </label>
                        <input
                          type="text"
                          placeholder="Resmi Ticari Unvan"
                          value={model.customer.PartyName}
                          onChange={(e) =>
                            setModel((prev) => ({
                              ...prev,
                              customer: {
                                ...prev.customer,
                                PartyName: e.target.value,
                              },
                            }))
                          }
                          className="w-full text-xs font-semibold bg-white border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                          Alıcı Posta Kutusu (PK Etiketi)
                        </label>
                        <input
                          type="text"
                          placeholder="urn:mail:defaultpk@..."
                          value={model.invoiceheader.DestinationUrn || ''}
                          onChange={(e) =>
                            setModel((prev) => ({
                              ...prev,
                              invoiceheader: {
                                ...prev.invoiceheader,
                                DestinationUrn: e.target.value,
                              },
                            }))
                          }
                          className="w-full text-xs font-mono bg-white border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500"
                        />
                      </div>
                    </div>

                    {/* Sütun 2 */}
                    <div className="space-y-3">
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                          Vergi Dairesi
                        </label>
                        <input
                          type="text"
                          placeholder="Vergi Dairesi Adı"
                          value={model.customer.TaxSchemeName}
                          onChange={(e) =>
                            setModel((prev) => ({
                              ...prev,
                              customer: {
                                ...prev.customer,
                                TaxSchemeName: e.target.value,
                              },
                            }))
                          }
                          className="w-full text-xs bg-white border border-slate-300 rounded-lg px-3 py-2"
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-xs font-semibold text-slate-700 mb-1">
                            İl *
                          </label>
                          <select
                            value={model.customer.CityName}
                            onChange={(e) =>
                              setModel((prev) => ({
                                ...prev,
                                customer: {
                                  ...prev.customer,
                                  CityName: e.target.value,
                                },
                              }))
                            }
                            className="w-full text-xs bg-white border border-slate-300 rounded-lg px-2.5 py-2"
                          >
                            {TURKIYE_ILLERI.map((il) => (
                              <option key={il.IlId} value={il.IlAdi}>
                                {il.IlAdi}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-slate-700 mb-1">
                            İlçe *
                          </label>
                          <input
                            type="text"
                            placeholder="İlçe"
                            value={model.customer.CitySubdivisionName}
                            onChange={(e) =>
                              setModel((prev) => ({
                                ...prev,
                                customer: {
                                  ...prev.customer,
                                  CitySubdivisionName: e.target.value,
                                },
                              }))
                            }
                            className="w-full text-xs bg-white border border-slate-300 rounded-lg px-2.5 py-2"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                          Açık Adres
                        </label>
                        <input
                          type="text"
                          placeholder="Mahalle, Cadde, No"
                          value={model.customer.StreetName}
                          onChange={(e) =>
                            setModel((prev) => ({
                              ...prev,
                              customer: {
                                ...prev.customer,
                                StreetName: e.target.value,
                              },
                            }))
                          }
                          className="w-full text-xs bg-white border border-slate-300 rounded-lg px-3 py-2"
                        />
                      </div>
                    </div>

                    {/* Sütun 3 */}
                    <div className="space-y-3">
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                          E-Posta Adresi
                        </label>
                        <input
                          type="email"
                          placeholder="ornek@sirket.com"
                          value={model.customer.ElectronicMail}
                          onChange={(e) =>
                            setModel((prev) => ({
                              ...prev,
                              customer: {
                                ...prev.customer,
                                ElectronicMail: e.target.value,
                              },
                            }))
                          }
                          className="w-full text-xs bg-white border border-slate-300 rounded-lg px-3 py-2"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                          Telefon Numarası
                        </label>
                        <input
                          type="tel"
                          placeholder="05xx xxx xx xx"
                          value={model.customer.Telephone}
                          onChange={(e) =>
                            setModel((prev) => ({
                              ...prev,
                              customer: {
                                ...prev.customer,
                                Telephone: e.target.value,
                              },
                            }))
                          }
                          className="w-full text-xs bg-white border border-slate-300 rounded-lg px-3 py-2"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                          Posta Kodu
                        </label>
                        <input
                          type="text"
                          maxLength={5}
                          placeholder="34000"
                          value={model.customer.PostalZone}
                          onChange={(e) =>
                            setModel((prev) => ({
                              ...prev,
                              customer: {
                                ...prev.customer,
                                PostalZone: e.target.value,
                              },
                            }))
                          }
                          className="w-full text-xs bg-white border border-slate-300 rounded-lg px-3 py-2"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 2: İRSALİYE EŞLEME */}
              {activeTab === 'IRSALIYE' && (
                <div className="space-y-3 animate-in fade-in-50 duration-150">
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-slate-600">
                      Fatura ile ilişkili sevk / e-İrsaliye belgelerinin numara ve tarihlerini ekleyebilirsiniz.
                    </p>
                    <button
                      type="button"
                      onClick={handleAddDespatch}
                      className="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-indigo-700 rounded-lg text-xs font-bold flex items-center gap-1"
                    >
                      <Plus size={14} /> Yeni İrsaliye Ekle
                    </button>
                  </div>

                  {(model.despatchs || []).length === 0 ? (
                    <div className="text-center py-8 border-2 border-dashed border-slate-200 rounded-xl">
                      <Truck className="mx-auto text-slate-300 mb-2" size={32} />
                      <p className="text-xs text-slate-500 font-medium">Ekli irsaliye bulunmuyor.</p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto border border-slate-200 rounded-lg">
                      <table className="w-full text-xs text-left">
                        <thead className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200">
                          <tr>
                            <th className="p-2.5 w-1/2">İrsaliye Numarası</th>
                            <th className="p-2.5 w-1/3">İrsaliye Tarihi</th>
                            <th className="p-2.5 text-center">İşlem</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {(model.despatchs || []).map((despatch, idx) => (
                            <tr key={idx}>
                              <td className="p-2">
                                <input
                                  type="text"
                                  placeholder="Örn: IRS2026000000123"
                                  value={despatch.DespatchDocumentID}
                                  onChange={(e) => {
                                    const updated = [...(model.despatchs || [])];
                                    updated[idx].DespatchDocumentID = e.target.value;
                                    setModel((p) => ({ ...p, despatchs: updated }));
                                  }}
                                  className="w-full text-xs bg-white border border-slate-200 rounded px-2 py-1.5"
                                />
                              </td>
                              <td className="p-2">
                                <input
                                  type="date"
                                  value={despatch.DespatchDocumentIssueDate}
                                  onChange={(e) => {
                                    const updated = [...(model.despatchs || [])];
                                    updated[idx].DespatchDocumentIssueDate = e.target.value;
                                    setModel((p) => ({ ...p, despatchs: updated }));
                                  }}
                                  className="w-full text-xs bg-white border border-slate-200 rounded px-2 py-1.5"
                                />
                              </td>
                              <td className="p-2 text-center">
                                <button
                                  type="button"
                                  onClick={() => handleRemoveDespatch(idx)}
                                  className="p-1 text-red-500 hover:bg-red-50 rounded"
                                >
                                  <Trash2 size={14} />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {/* TAB 3: ÖDEME & BANKA */}
              {activeTab === 'ODEME' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-in fade-in-50 duration-150">
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Ödeme Şekli *
                      </label>
                      <select
                        value={model.paymentMeans?.PaymentMeansCode || '10'}
                        onChange={(e) =>
                          setModel((prev) => ({
                            ...prev,
                            paymentMeans: {
                              ...prev.paymentMeans!,
                              PaymentMeansCode: e.target.value,
                            },
                          }))
                        }
                        className="w-full text-xs bg-white border border-slate-300 rounded-lg px-2.5 py-2"
                      >
                        {HIZLI_ODEME_TIPLERI.map((o) => (
                          <option key={o.OdemeKodu} value={o.OdemeKodu}>
                            {o.Aciklama} ({o.OdemeKodu})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Ödeme Vade Tarihi
                      </label>
                      <input
                        type="date"
                        value={model.paymentMeans?.PaymentDueDate || ''}
                        onChange={(e) =>
                          setModel((prev) => ({
                            ...prev,
                            paymentMeans: {
                              ...prev.paymentMeans!,
                              PaymentDueDate: e.target.value,
                            },
                          }))
                        }
                        className="w-full text-xs bg-white border border-slate-300 rounded-lg px-3 py-2"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Ödeme Notu / Açıklaması
                      </label>
                      <input
                        type="text"
                        placeholder="Örn: 30 gün vadeli havale"
                        value={model.paymentMeans?.InstructionNote || ''}
                        onChange={(e) =>
                          setModel((prev) => ({
                            ...prev,
                            paymentMeans: {
                              ...prev.paymentMeans!,
                              InstructionNote: e.target.value,
                            },
                          }))
                        }
                        className="w-full text-xs bg-white border border-slate-300 rounded-lg px-3 py-2"
                      />
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Ödeme Kanalı (Transfer Yolu)
                      </label>
                      <select
                        value={model.paymentMeans?.PaymentChannelCode || ''}
                        onChange={(e) =>
                          setModel((prev) => ({
                            ...prev,
                            paymentMeans: {
                              ...prev.paymentMeans!,
                              PaymentChannelCode: e.target.value,
                            },
                          }))
                        }
                        className="w-full text-xs bg-white border border-slate-300 rounded-lg px-2.5 py-2"
                      >
                        <option value="">Seçiniz</option>
                        {HIZLI_ODEME_KANALLARI.map((k) => (
                          <option key={k.OdemeKanalKodu} value={k.OdemeKanalKodu}>
                            {k.Aciklama}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Hesap No / IBAN
                      </label>
                      <input
                        type="text"
                        placeholder="TRxx xxxx xxxx xxxx xxxx xxxx xx"
                        value={model.paymentMeans?.PayeeFinancialAccount || ''}
                        onChange={(e) =>
                          setModel((prev) => ({
                            ...prev,
                            paymentMeans: {
                              ...prev.paymentMeans!,
                              PayeeFinancialAccount: e.target.value,
                            },
                          }))
                        }
                        className="w-full text-xs font-mono bg-white border border-slate-300 rounded-lg px-3 py-2"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 4: SGK / MEDULA */}
              {activeTab === 'SGK' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-in fade-in-50 duration-150">
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        İlave Fatura Tipi
                      </label>
                      <select
                        value={model.invoiceheader.Sgk_AccountingCost || ''}
                        onChange={(e) =>
                          setModel((prev) => ({
                            ...prev,
                            invoiceheader: {
                              ...prev.invoiceheader,
                              Sgk_AccountingCost: e.target.value,
                            },
                          }))
                        }
                        className="w-full text-xs bg-white border border-slate-300 rounded-lg px-2.5 py-2"
                      >
                        <option value="">Seçiniz</option>
                        <option value="SAGLIK_ECZ">SAĞLIK_ECZANE</option>
                        <option value="SAGLIK_HAS">SAĞLIK_HASTANE</option>
                        <option value="SAGLIK_OPT">SAĞLIK_OPTİK</option>
                        <option value="SAGLIK_MED">SAĞLIK_MEDİKAL</option>
                        <option value="ABONELIK">ABONELİK</option>
                        <option value="MAL_HIZMET">MAL_HİZMET</option>
                        <option value="DIGER">DİĞER</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Mükellef Kodu
                      </label>
                      <input
                        type="text"
                        placeholder="SGK Mükellef Kodu"
                        value={model.invoiceheader.Sgk_Mukellef_Kodu || ''}
                        onChange={(e) =>
                          setModel((prev) => ({
                            ...prev,
                            invoiceheader: {
                              ...prev.invoiceheader,
                              Sgk_Mukellef_Kodu: e.target.value,
                            },
                          }))
                        }
                        className="w-full text-xs bg-white border border-slate-300 rounded-lg px-3 py-2"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Mükellef Adı
                      </label>
                      <input
                        type="text"
                        placeholder="Mükellef Adı Soyadı"
                        value={model.invoiceheader.Sgk_Mukellef_Adi || ''}
                        onChange={(e) =>
                          setModel((prev) => ({
                            ...prev,
                            invoiceheader: {
                              ...prev.invoiceheader,
                              Sgk_Mukellef_Adi: e.target.value,
                            },
                          }))
                        }
                        className="w-full text-xs bg-white border border-slate-300 rounded-lg px-3 py-2"
                      />
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Dosya Numarası
                      </label>
                      <input
                        type="text"
                        placeholder="SGK Dosya No"
                        value={model.invoiceheader.Sgk_DosyaNo || ''}
                        onChange={(e) =>
                          setModel((prev) => ({
                            ...prev,
                            invoiceheader: {
                              ...prev.invoiceheader,
                              Sgk_DosyaNo: e.target.value,
                            },
                          }))
                        }
                        className="w-full text-xs bg-white border border-slate-300 rounded-lg px-3 py-2"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                          Dönem Başlangıç
                        </label>
                        <input
                          type="date"
                          value={model.invoiceheader.Sgk_Period_StartDate || ''}
                          onChange={(e) =>
                            setModel((prev) => ({
                              ...prev,
                              invoiceheader: {
                                ...prev.invoiceheader,
                                Sgk_Period_StartDate: e.target.value,
                              },
                            }))
                          }
                          className="w-full text-xs bg-white border border-slate-300 rounded-lg px-2.5 py-2"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                          Dönem Bitiş
                        </label>
                        <input
                          type="date"
                          value={model.invoiceheader.Sgk_Period_EndDate || ''}
                          onChange={(e) =>
                            setModel((prev) => ({
                              ...prev,
                              invoiceheader: {
                                ...prev.invoiceheader,
                                Sgk_Period_EndDate: e.target.value,
                              },
                            }))
                          }
                          className="w-full text-xs bg-white border border-slate-300 rounded-lg px-2.5 py-2"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 5: EK ALANLAR & NOTLAR */}
              {activeTab === 'EK_ALANLAR' && (
                <div className="space-y-3 animate-in fade-in-50 duration-150">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Sipariş Numarası
                      </label>
                      <input
                        type="text"
                        placeholder="Sipariş Ref No"
                        value={model.invoiceheader.OrderReferenceId || ''}
                        onChange={(e) =>
                          setModel((prev) => ({
                            ...prev,
                            invoiceheader: {
                              ...prev.invoiceheader,
                              OrderReferenceId: e.target.value,
                            },
                          }))
                        }
                        className="w-full text-xs bg-white border border-slate-300 rounded-lg px-3 py-2"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Sipariş Tarihi
                      </label>
                      <input
                        type="date"
                        value={model.invoiceheader.OrderReferenceDate || ''}
                        onChange={(e) =>
                          setModel((prev) => ({
                            ...prev,
                            invoiceheader: {
                              ...prev.invoiceheader,
                              OrderReferenceDate: e.target.value,
                            },
                          }))
                        }
                        className="w-full text-xs bg-white border border-slate-300 rounded-lg px-3 py-2"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Fatura Notu / Açıklaması
                    </label>
                    <textarea
                      rows={3}
                      placeholder="Fatura üzerinde görünecek açıklama ve şartlar..."
                      value={model.invoiceheader.Note || ''}
                      onChange={(e) =>
                        setModel((prev) => ({
                          ...prev,
                          invoiceheader: {
                            ...prev.invoiceheader,
                            Note: e.target.value,
                          },
                        }))
                      }
                      className="w-full text-xs bg-white border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* 3. FATURA KALEMLERİ TABLOSU */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <h4 className="text-sm font-bold text-slate-800">
                  Fatura Kalemleri ({model.invoiceLines.length})
                </h4>

                {/* KDV Dahil / Hariç Butonu */}
                <div className="flex items-center bg-slate-200 p-0.5 rounded-lg text-xs font-semibold">
                  <button
                    type="button"
                    onClick={() => {
                      setIsKdvDahil(false);
                      setModel((prev) => {
                        const updated = prev.invoiceLines.map((l) => calculateHizliLine(l, false));
                        const { header } = calculateHizliInvoiceTotals(prev.invoiceheader, updated);
                        return { ...prev, invoiceLines: updated, invoiceheader: header };
                      });
                    }}
                    className={`px-3 py-1 rounded-md transition-all ${
                      !isKdvDahil ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-600'
                    }`}
                  >
                    KDV Hariç
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsKdvDahil(true);
                      setModel((prev) => {
                        const updated = prev.invoiceLines.map((l) => calculateHizliLine(l, true));
                        const { header } = calculateHizliInvoiceTotals(prev.invoiceheader, updated);
                        return { ...prev, invoiceLines: updated, invoiceheader: header };
                      });
                    }}
                    className={`px-3 py-1 rounded-md transition-all ${
                      isKdvDahil ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-600'
                    }`}
                  >
                    KDV Dahil
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleAddLine}
                  className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all shadow-sm"
                >
                  <Plus size={14} /> Yeni Kalem Ekle
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left border-collapse">
                <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                  <tr>
                    <th className="p-2 text-center w-10">#</th>
                    <th className="p-2 min-w-[220px]">Mal / Hizmet Adı *</th>
                    <th className="p-2 w-20 text-right">Miktar</th>
                    <th className="p-2 w-28">Birim *</th>
                    <th className="p-2 w-28 text-right">Birim Fiyat</th>
                    <th className="p-2 w-20 text-right">İsk %</th>
                    <th className="p-2 w-24 text-right">İskonto T.</th>
                    <th className="p-2 w-28 text-right">Matrah (Net)</th>
                    <th className="p-2 w-24">KDV %</th>
                    <th className="p-2 w-28 text-right">KDV Tutarı</th>
                    <th className="p-2 min-w-[140px]">İstisna / Tevkifat</th>
                    <th className="p-2 text-center w-12">Sil</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {model.invoiceLines.map((line, idx) => {
                    const currentKdv = line.lineTaxes?.[0]?.Tax_Perc ?? 20;
                    const isExempt = currentKdv === 0;

                    return (
                      <tr key={idx} className="hover:bg-slate-50/80 transition-colors">
                        <td className="p-2 text-center font-bold text-slate-400">
                          {line.ID}
                        </td>

                        {/* Mal / Hizmet Adı */}
                        <td className="p-2">
                          <input
                            type="text"
                            list={`products-datalist-${idx}`}
                            placeholder="Ürün adı yazın veya listeden seçin..."
                            value={line.Item_Name}
                            onChange={(e) => {
                              const val = e.target.value;
                              const matched = existingProducts.find(
                                (p) => p.name === val || p.code === val
                              );
                              if (matched) {
                                handleLineChange(idx, 'Item_Name', matched.name);
                                handleLineChange(idx, 'Price_Amount', matched.salePrice || 0);
                                handleLineChange(
                                  idx,
                                  'Quantity_Unit_User',
                                  matched.unit === 'Adet' ? 'C62' : 'NIU'
                                );
                              } else {
                                handleLineChange(idx, 'Item_Name', val);
                              }
                            }}
                            className="w-full text-xs font-semibold bg-white border border-slate-300 rounded px-2 py-1.5 focus:ring-1 focus:ring-indigo-500"
                          />
                          <datalist id={`products-datalist-${idx}`}>
                            {existingProducts.map((p) => (
                              <option key={p.id} value={p.name}>
                                [{p.code}] {p.name} - {p.salePrice} ₺
                              </option>
                            ))}
                          </datalist>
                        </td>

                        {/* Miktar */}
                        <td className="p-2">
                          <input
                            type="number"
                            min="0.01"
                            step="any"
                            value={line.Quantity_Amount}
                            onChange={(e) =>
                              handleLineChange(idx, 'Quantity_Amount', Number(e.target.value))
                            }
                            className="w-full text-xs text-right bg-white border border-slate-300 rounded px-1.5 py-1.5 font-mono"
                          />
                        </td>

                        {/* Birim */}
                        <td className="p-2">
                          <select
                            value={line.Quantity_Unit_User}
                            onChange={(e) =>
                              handleLineChange(idx, 'Quantity_Unit_User', e.target.value)
                            }
                            className="w-full text-xs bg-white border border-slate-300 rounded px-1.5 py-1.5"
                          >
                            {HIZLI_BIRIM_LISTESI.map((b) => (
                              <option key={b.BirimKodu} value={b.BirimKodu}>
                                {b.Aciklama} ({b.BirimKodu})
                              </option>
                            ))}
                          </select>
                        </td>

                        {/* Birim Fiyat */}
                        <td className="p-2">
                          <input
                            type="number"
                            min="0"
                            step="any"
                            value={line.Price_Amount}
                            onChange={(e) =>
                              handleLineChange(idx, 'Price_Amount', Number(e.target.value))
                            }
                            className="w-full text-xs text-right bg-white border border-slate-300 rounded px-1.5 py-1.5 font-mono font-bold text-slate-800"
                          />
                        </td>

                        {/* İskonto % */}
                        <td className="p-2">
                          <input
                            type="number"
                            min="0"
                            max="100"
                            step="any"
                            value={line.Allowance_Percent || ''}
                            placeholder="0"
                            onChange={(e) => {
                              handleLineChange(idx, 'AllowanceCalculatorType', 'Percent');
                              handleLineChange(idx, 'Allowance_Percent', Number(e.target.value));
                            }}
                            className="w-full text-xs text-right bg-white border border-slate-300 rounded px-1 py-1.5 font-mono"
                          />
                        </td>

                        {/* İskonto Tutarı */}
                        <td className="p-2 text-right font-mono text-slate-600">
                          {formatCurrency(line.Allowance_Amount || 0, '')}
                        </td>

                        {/* Mal / Hizmet Tutarı (Net Matrah) */}
                        <td className="p-2 text-right font-mono font-bold text-indigo-950">
                          {formatCurrency(line.Price_Total || 0, '')}
                        </td>

                        {/* KDV % */}
                        <td className="p-2">
                          <select
                            value={currentKdv}
                            onChange={(e) => {
                              const newPerc = Number(e.target.value);
                              handleLineTaxChange(idx, newPerc);
                            }}
                            className="w-full text-xs font-bold bg-white border border-slate-300 rounded px-1.5 py-1.5"
                          >
                            <option value={20}>%20</option>
                            <option value={10}>%10</option>
                            <option value={1}>%1</option>
                            <option value={0}>%0</option>
                          </select>
                        </td>

                        {/* KDV Tutarı */}
                        <td className="p-2 text-right font-mono font-bold text-slate-700">
                          {formatCurrency(line.lineTaxes?.[0]?.Tax_Amnt || 0, '')}
                        </td>

                        {/* İstisna / Tevkifat Seçimi */}
                        <td className="p-2">
                          {isExempt ? (
                            <select
                              value={line.lineTaxes?.[0]?.Tax_Exem_Code || '350'}
                              onChange={(e) =>
                                handleLineTaxChange(idx, 0, undefined, e.target.value)
                              }
                              className="w-full text-[11px] bg-amber-50 border border-amber-300 rounded px-1.5 py-1 text-amber-900 font-semibold"
                            >
                              {HIZLI_ISTISNA_LISTESI.map((ist) => (
                                <option key={ist.Kodu} value={ist.Kodu}>
                                  {ist.Kodu} - {ist.Adi}
                                </option>
                              ))}
                            </select>
                          ) : model.invoiceheader.InvoiceTypeCode === 'TEVKIFAT' ? (
                            <select
                              value={line.lineTaxes?.[0]?.Tevkifat_Code || ''}
                              onChange={(e) =>
                                handleLineTaxChange(idx, currentKdv, e.target.value)
                              }
                              className="w-full text-[11px] bg-purple-50 border border-purple-300 rounded px-1.5 py-1 text-purple-900 font-semibold"
                            >
                              <option value="">Tevkifat Yok</option>
                              {HIZLI_TEVKIFAT_LISTESI.map((tev) => (
                                <option key={tev.Kodu} value={tev.Kodu}>
                                  {tev.Kodu} - {tev.Adi}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <span className="text-[11px] text-slate-400 italic">Standart KDV</span>
                          )}
                        </td>

                        {/* Satır Sil */}
                        <td className="p-2 text-center">
                          <button
                            type="button"
                            onClick={() => handleRemoveLine(idx)}
                            className="p-1 text-red-500 hover:bg-red-50 rounded transition-colors"
                          >
                            <Trash2 size={15} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* 4. GENEL TOPLAMLAR VE ÖZET KARTLARI */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Sol: Fatura Notları ve Açıklama Özeti */}
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between">
              <div>
                <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <FileText size={14} className="text-indigo-600" /> Belge Bilgi Notu
                </h4>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Bu belge GİB e-Fatura / e-Arşiv UBL-TR 2.1 formatına uygun olarak Hızlı Bilişim
                  e-Connect entegratörü üzerinden iletilecektir.
                </p>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs font-semibold text-slate-600">
                <span>Profil: <strong className="text-slate-800">{model.invoiceheader.ProfileID}</strong></span>
                <span>Tip: <strong className="text-slate-800">{model.invoiceheader.InvoiceTypeCode}</strong></span>
                <span>Para Birimi: <strong className="text-indigo-700">{model.invoiceheader.DocumentCurrencyCode}</strong></span>
              </div>
            </div>

            {/* Sağ: Matematiksel Hesap Özeti */}
            <div className="bg-gradient-to-br from-slate-900 to-indigo-950 text-white p-4 rounded-xl shadow-lg border border-slate-800 space-y-2.5">
              <div className="flex justify-between items-center text-xs text-slate-300">
                <span>Mal / Hizmet Toplam Tutarı:</span>
                <span className="font-mono font-semibold text-white">
                  {formatCurrency(model.invoiceheader.LineExtensionAmount, model.invoiceheader.DocumentCurrencyCode)}
                </span>
              </div>

              {model.invoiceheader.AllowanceTotalAmount > 0 && (
                <div className="flex justify-between items-center text-xs text-amber-300">
                  <span>Toplam İskonto Tutarı (-):</span>
                  <span className="font-mono font-semibold">
                    -{formatCurrency(model.invoiceheader.AllowanceTotalAmount, model.invoiceheader.DocumentCurrencyCode)}
                  </span>
                </div>
              )}

              {/* KDV Dağılımı */}
              {(model.invoiceheader.Taxes || []).map((t, idx) => (
                <div key={idx} className="flex justify-between items-center text-xs text-slate-300 pl-2 border-l-2 border-indigo-500">
                  <span>
                    Hesaplanan {t.Tax_Name} (%{t.Tax_Perc}) [Matrah: {formatCurrency(t.Tax_Base, '')}]:
                  </span>
                  <span className="font-mono font-semibold text-white">
                    {formatCurrency(t.Tax_Amnt, model.invoiceheader.DocumentCurrencyCode)}
                  </span>
                </div>
              ))}

              <div className="flex justify-between items-center text-xs text-slate-300 pt-1.5 border-t border-slate-800">
                <span>Vergiler Dahil Toplam:</span>
                <span className="font-mono font-semibold text-slate-200">
                  {formatCurrency(model.invoiceheader.TaxInclusiveAmount, model.invoiceheader.DocumentCurrencyCode)}
                </span>
              </div>

              {/* ÖDENECEK TUTAR */}
              <div className="pt-2 border-t border-slate-700 flex justify-between items-center">
                <span className="text-sm font-bold text-emerald-400">
                  ÖDENECEK TOPLAM TUTAR:
                </span>
                <span className="text-lg font-black font-mono text-emerald-300">
                  {formatCurrency(model.invoiceheader.PayableAmount, model.invoiceheader.DocumentCurrencyCode)}
                </span>
              </div>

              {/* Dövizli Faturada TL Karşılığı */}
              {model.invoiceheader.DocumentCurrencyCode !== 'TRY' && (
                <div className="pt-1.5 border-t border-slate-800 flex justify-between items-center text-xs text-indigo-300 font-semibold">
                  <span>TL Karşılığı (Kur: {model.invoiceheader.CalculationRate}):</span>
                  <span className="font-mono font-bold">
                    {formatCurrency(model.invoiceheader.PayableAmount * model.invoiceheader.CalculationRate, '₺')}
                  </span>
                </div>
              )}
            </div>
          </div>

        </div>

        {/* MODAL FOOTER */}
        <div className="px-6 py-3.5 bg-slate-100 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <ShieldCheck size={16} className="text-emerald-600" />
            <span>GİB e-Fatura / e-Arşiv UBL-TR 2.1 İmzalamaya Hazır</span>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-white hover:bg-slate-50 border border-slate-300 text-xs font-bold text-slate-700 transition-colors shadow-sm"
            >
              İptal / Kapat
            </button>

            <button
              type="button"
              onClick={() => handleSubmitInvoice(false)}
              disabled={submitting}
              className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold flex items-center gap-1.5 transition-all shadow-md shadow-blue-500/20"
            >
              <Save size={15} /> Taslak Olarak Kaydet
            </button>

            <button
              type="button"
              onClick={() => handleSubmitInvoice(true)}
              disabled={submitting}
              className="px-5 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-black flex items-center gap-2 transition-all shadow-lg shadow-emerald-600/30 ring-2 ring-emerald-400/30"
            >
              <Send size={15} />
              {submitting ? 'Gönderiliyor...' : "GİB'e / Hızlı Portal'a Gönder"}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
