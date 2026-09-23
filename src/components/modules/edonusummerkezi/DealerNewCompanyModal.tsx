import React, { useState } from 'react';
import {
  X,
  Building,
  User,
  MapPin,
  ShieldCheck,
  CreditCard,
  Save,
  CheckCircle2,
  Copy,
  Link2,
  AlertCircle,
} from 'lucide-react';
import { TURKIYE_ILLERI } from '../../../data/hizliBilisimConstants';
import { api } from '../../../services/api';
import { useToast } from '../../../context/ToastContext';

interface DealerNewCompanyModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export const DealerNewCompanyModal: React.FC<DealerNewCompanyModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const { showToast: toast } = useToast();
  const [submitting, setSubmitting] = useState(false);
  const [createdResult, setCreatedResult] = useState<{
    customer: any;
    activationLink?: string;
  } | null>(null);

  const [formData, setFormData] = useState({
    companyType: 'LIMITED',
    companyName: '',
    title: '',
    taxNumber: '',
    taxOffice: '',
    identityNumber: '',
    mersisNo: '',
    naceCode: '',
    phone: '',
    email: '',
    website: '',
    city: 'ADANA',
    district: '',
    address: '',
    postalCode: '01000',
    contactName: '',
    contactLastName: '',
    contactPhone: '',
    contactEmail: '',
    initialCredits: 500,
    services: {
      eFatura: true,
      eArsiv: true,
      eIrsaliye: true,
      eSmm: false,
      eMustahsil: false,
      eDefter: true,
      eDoviz: false,
      eKiymetliMaden: false,
    },
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.companyName || !formData.taxNumber) {
      toast('Lütfen Firma Unvanı ve VKN/TCKN alanlarını doldurunuz.', 'error');
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        ...formData,
        contactName: `${formData.contactName} ${formData.contactLastName}`.trim() || formData.contactName,
      };

      const res = await api.createDealerCustomer(payload);
      if (res.success) {
        toast('✓ Yeni Firma ve Müşteri Başvurusu Başarıyla Oluşturuldu!', 'success');
        setCreatedResult({
          customer: res.customer,
          activationLink: res.activationLink,
        });
        if (onSuccess) onSuccess();
      } else {
        toast(res.message || 'Firma kaydı oluşturulamadı.', 'error');
      }
    } catch (err: any) {
      toast(err.message || 'Kayıt sırasında hata oluştu.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-slate-900/80 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden text-slate-800">
        
        {/* HEADER */}
        <div className="px-6 py-4 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white flex items-center justify-between border-b border-slate-700">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-600/30 border border-indigo-400/30 flex items-center justify-center text-indigo-300">
              <Building size={20} />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">
                Yeni Firma ve Müşteri Başvuru Formu
              </h3>
              <p className="text-xs text-slate-400">
                HBT Bayi Portalı standartlarında firma, yetkili, e-hizmet ve kontör tanımlaması
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg"
          >
            <X size={20} />
          </button>
        </div>

        {/* BODY */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-slate-50/50">
          {createdResult ? (
            <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-6 text-center space-y-4">
              <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto shadow-inner">
                <CheckCircle2 size={36} />
              </div>
              <h4 className="text-lg font-bold text-emerald-950">
                Firma Başarıyla Kayıt Edildi!
              </h4>
              <p className="text-xs text-emerald-800 max-w-md mx-auto">
                <strong>{createdResult.customer.title}</strong> firması sisteme eklendi ve 
                <strong> {createdResult.customer.credits?.remaining || 500}</strong> adet başlangıç kontörü tanımlandı.
              </p>

              {createdResult.activationLink && (
                <div className="bg-white p-4 rounded-xl border border-emerald-200 max-w-lg mx-auto text-left space-y-2">
                  <div className="flex items-center justify-between text-xs font-bold text-slate-700">
                    <span className="flex items-center gap-1.5 text-indigo-700">
                      <Link2 size={15} /> Müşteri Şifre Belirleme / Aktivasyon Linki:
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(createdResult.activationLink!);
                        toast('Aktivasyon linki kopyalandı!', 'info');
                      }}
                      className="px-2 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded text-[11px] font-bold flex items-center gap-1"
                    >
                      <Copy size={12} /> Kopyala
                    </button>
                  </div>
                  <code className="block bg-slate-50 p-2 rounded text-xs font-mono text-slate-700 break-all select-all border border-slate-200">
                    {createdResult.activationLink}
                  </code>
                </div>
              )}

              <div className="pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-6 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold shadow-md"
                >
                  Tamamla ve Kapat
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              {/* 1. FİRMA BİLGİLERİ */}
              <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-3">
                <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-2 border-b border-slate-100 pb-2">
                  <Building size={15} className="text-indigo-600" /> 1. Firma Temel Bilgileri
                </h4>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Firma Türü *
                    </label>
                    <select
                      value={formData.companyType}
                      onChange={(e) => setFormData({ ...formData, companyType: e.target.value })}
                      className="w-full text-xs bg-white border border-slate-300 rounded-lg px-2.5 py-2"
                    >
                      <option value="LIMITED">Limited Şirket (LTD. ŞTİ.)</option>
                      <option value="ANONIM">Anonim Şirket (A.Ş.)</option>
                      <option value="SAHIS">Şahıs Şirketi / Gerçek Kişi</option>
                      <option value="DIGER">Diğer / Kooperatif / Vakıf</option>
                    </select>
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Firma Resmi Unvanı *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="Örn: ABC BİLİŞİM TEKNOLOJİLERİ SAN. TİC. LTD. ŞTİ."
                      value={formData.companyName}
                      onChange={(e) => setFormData({ ...formData, companyName: e.target.value, title: e.target.value })}
                      className="w-full text-xs font-semibold bg-white border border-slate-300 rounded-lg px-3 py-2"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      VKN / TCKN *
                    </label>
                    <input
                      type="text"
                      required
                      maxLength={11}
                      placeholder="10 veya 11 haneli kimlik"
                      value={formData.taxNumber}
                      onChange={(e) => setFormData({ ...formData, taxNumber: e.target.value.replace(/\D/g, '') })}
                      className="w-full text-xs font-mono font-bold bg-white border border-slate-300 rounded-lg px-3 py-2"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Vergi Dairesi
                    </label>
                    <input
                      type="text"
                      placeholder="Vergi dairesi adı"
                      value={formData.taxOffice}
                      onChange={(e) => setFormData({ ...formData, taxOffice: e.target.value })}
                      className="w-full text-xs bg-white border border-slate-300 rounded-lg px-3 py-2"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      MERSİS No
                    </label>
                    <input
                      type="text"
                      placeholder="16 haneli MERSİS"
                      value={formData.mersisNo}
                      onChange={(e) => setFormData({ ...formData, mersisNo: e.target.value })}
                      className="w-full text-xs bg-white border border-slate-300 rounded-lg px-3 py-2"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Telefon Numarası
                    </label>
                    <input
                      type="tel"
                      placeholder="0322 xxx xx xx"
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      className="w-full text-xs bg-white border border-slate-300 rounded-lg px-3 py-2"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Firma E-Posta
                    </label>
                    <input
                      type="email"
                      placeholder="muhasebe@sirket.com"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      className="w-full text-xs bg-white border border-slate-300 rounded-lg px-3 py-2"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      NACE Kodu / Sektör
                    </label>
                    <input
                      type="text"
                      placeholder="Örn: 62.01.01"
                      value={formData.naceCode}
                      onChange={(e) => setFormData({ ...formData, naceCode: e.target.value })}
                      className="w-full text-xs bg-white border border-slate-300 rounded-lg px-3 py-2"
                    />
                  </div>
                </div>
              </div>

              {/* 2. ADRES BİLGİLERİ */}
              <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-3">
                <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-2 border-b border-slate-100 pb-2">
                  <MapPin size={15} className="text-indigo-600" /> 2. Adres & Lokasyon
                </h4>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      İl *
                    </label>
                    <select
                      value={formData.city}
                      onChange={(e) => setFormData({ ...formData, city: e.target.value })}
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
                      İlçe
                    </label>
                    <input
                      type="text"
                      placeholder="İlçe adı"
                      value={formData.district}
                      onChange={(e) => setFormData({ ...formData, district: e.target.value })}
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
                      value={formData.postalCode}
                      onChange={(e) => setFormData({ ...formData, postalCode: e.target.value })}
                      className="w-full text-xs bg-white border border-slate-300 rounded-lg px-3 py-2"
                    />
                  </div>

                  <div className="md:col-span-3">
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Açık Adres
                    </label>
                    <input
                      type="text"
                      placeholder="Mahalle, Cadde, Sokak, Bina No, Daire"
                      value={formData.address}
                      onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                      className="w-full text-xs bg-white border border-slate-300 rounded-lg px-3 py-2"
                    />
                  </div>
                </div>
              </div>

              {/* 3. YETKİLİ VE E-DÖNÜŞÜM HİZMETLERİ */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Yetkili */}
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-3">
                  <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-2 border-b border-slate-100 pb-2">
                    <User size={15} className="text-indigo-600" /> 3. Yetkili Kişi
                  </h4>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Ad *</label>
                      <input
                        type="text"
                        required
                        placeholder="Yetkili Adı"
                        value={formData.contactName}
                        onChange={(e) => setFormData({ ...formData, contactName: e.target.value })}
                        className="w-full text-xs bg-white border border-slate-300 rounded-lg px-3 py-2"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Soyad</label>
                      <input
                        type="text"
                        placeholder="Soyadı"
                        value={formData.contactLastName}
                        onChange={(e) => setFormData({ ...formData, contactLastName: e.target.value })}
                        className="w-full text-xs bg-white border border-slate-300 rounded-lg px-3 py-2"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Yetkili Telefon</label>
                    <input
                      type="tel"
                      placeholder="05xx xxx xx xx"
                      value={formData.contactPhone}
                      onChange={(e) => setFormData({ ...formData, contactPhone: e.target.value })}
                      className="w-full text-xs bg-white border border-slate-300 rounded-lg px-3 py-2"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Yetkili E-Posta</label>
                    <input
                      type="email"
                      placeholder="yetkili@sirket.com"
                      value={formData.contactEmail}
                      onChange={(e) => setFormData({ ...formData, contactEmail: e.target.value })}
                      className="w-full text-xs bg-white border border-slate-300 rounded-lg px-3 py-2"
                    />
                  </div>

                  <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-700">Başlangıç Kontörü:</span>
                    <input
                      type="number"
                      min={0}
                      value={formData.initialCredits}
                      onChange={(e) => setFormData({ ...formData, initialCredits: Number(e.target.value) || 0 })}
                      className="w-28 text-right text-xs font-bold font-mono bg-slate-50 border border-slate-300 rounded-lg px-2 py-1.5"
                    />
                  </div>
                </div>

                {/* E-Dönüşüm Hizmetleri */}
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-3">
                  <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-2 border-b border-slate-100 pb-2">
                    <ShieldCheck size={15} className="text-emerald-600" /> 4. E-Dönüşüm Hizmetleri
                  </h4>

                  <div className="grid grid-cols-2 gap-2 text-xs">
                    {[
                      { key: 'eFatura', label: 'e-Fatura Entegrasyonu' },
                      { key: 'eArsiv', label: 'e-Arşiv Fatura' },
                      { key: 'eIrsaliye', label: 'e-İrsaliye' },
                      { key: 'eSmm', label: 'e-SMM (Serbest Meslek)' },
                      { key: 'eMustahsil', label: 'e-Müstahsil Makbuzu' },
                      { key: 'eDefter', label: 'e-Defter (Yevmiye/Kebir)' },
                      { key: 'eDoviz', label: 'e-Döviz Alım/Satım' },
                      { key: 'eKiymetliMaden', label: 'e-Kıymetli Maden' },
                    ].map((srv) => (
                      <label
                        key={srv.key}
                        className={`flex items-center gap-2 p-2 rounded-lg border cursor-pointer transition-all ${
                          (formData.services as any)[srv.key]
                            ? 'bg-indigo-50/70 border-indigo-300 text-indigo-950 font-bold'
                            : 'bg-slate-50 border-slate-200 text-slate-600'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={(formData.services as any)[srv.key]}
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              services: {
                                ...formData.services,
                                [srv.key]: e.target.checked,
                              },
                            })
                          }
                          className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                        />
                        <span>{srv.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>

              {/* FOOTER ACTIONS */}
              <div className="pt-4 border-t border-slate-200 flex items-center justify-between">
                <p className="text-xs text-slate-500 flex items-center gap-1.5">
                  <ShieldCheck size={14} className="text-emerald-600" />
                  Kayıt tamamlandığında kullanıcı otomatik oluşturulacak ve aktivasyon linki üretilecektir.
                </p>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={onClose}
                    className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-colors"
                  >
                    İptal
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="px-6 py-2 bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 text-white rounded-xl text-xs font-bold flex items-center gap-2 shadow-md shadow-indigo-600/30"
                  >
                    <Save size={15} />
                    {submitting ? 'Kaydediliyor...' : 'Firmayı Kaydet & Aktive Et'}
                  </button>
                </div>
              </div>
            </form>
          )}
        </div>

      </div>
    </div>
  );
};
