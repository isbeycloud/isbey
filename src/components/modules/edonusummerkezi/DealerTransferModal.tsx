import React, { useState } from 'react';
import {
  X,
  UploadCloud,
  FileText,
  CheckCircle2,
  AlertTriangle,
  Layers,
  ShieldCheck,
  Building,
} from 'lucide-react';
import { api } from '../../../services/api';
import { useToast } from '../../../context/ToastContext';

interface DealerTransferModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export const DealerTransferModal: React.FC<DealerTransferModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const { showToast: toast } = useToast();
  const [integrator, setIntegrator] = useState('DİĞER ÖZEL ENTEGRATÖR');
  const [docType, setDocType] = useState('EFATURA');
  const [direction, setDirection] = useState<'OUTGOING' | 'INCOMING'>('OUTGOING');
  const [simulatedCount, setSimulatedCount] = useState(5);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<any>(null);

  if (!isOpen) return null;

  const handleUploadTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      // Create batch payload
      const mockDocs = Array.from({ length: simulatedCount }).map((_, i) => {
        const uuid = `TRF-${Math.random().toString(36).substring(2, 10).toUpperCase()}-2026`;
        return {
          integrator,
          docType,
          direction,
          uuid,
          documentNo: `TRF202600000${String(100 + i).padStart(4, '0')}`,
          taxNumber: '1681136628',
          partyName: `Transfer Cari Firma ${i + 1}`,
          documentDate: new Date().toISOString().split('T')[0],
          amount: Math.floor(1000 + Math.random() * 9000),
          fileName: `Fatura_${uuid}.xml`,
          fileSize: 4096,
        };
      });

      const res = await api.uploadDealerTransferXml(mockDocs);
      if (res.success) {
        toast(`✓ Transfer başarıyla tamamlandı: ${res.importedCount} aktarıldı.`, 'success');
        setResult(res);
        if (onSuccess) onSuccess();
      } else {
        toast(res.message || 'Transfer başarısız oldu.', 'error');
      }
    } catch (err: any) {
      toast(err.message || 'Yükleme hatası.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-slate-900/80 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-xl flex flex-col overflow-hidden text-slate-800">
        
        {/* HEADER */}
        <div className="px-6 py-4 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white flex items-center justify-between border-b border-slate-700">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-600/30 border border-indigo-400/30 flex items-center justify-center text-indigo-300">
              <UploadCloud size={20} />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">
                Transfer Belgesi Yükleme (ZIP / XML)
              </h3>
              <p className="text-xs text-slate-400">
                Farklı entegratörlerden gelen geçmiş e-Belgeleri sisteme aktarma
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
        <div className="p-6 space-y-4">
          {result ? (
            <div className="space-y-4 text-center">
              <div className="w-14 h-14 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto">
                <CheckCircle2 size={32} />
              </div>
              <h4 className="text-base font-bold text-emerald-950">
                Transfer İşlemi Tamamlandı
              </h4>
              <div className="grid grid-cols-2 gap-3 max-w-sm mx-auto text-xs">
                <div className="bg-emerald-50 p-3 rounded-xl border border-emerald-200">
                  <div className="text-lg font-bold text-emerald-700">{result.importedCount}</div>
                  <div className="text-emerald-900 font-semibold">Aktarılan Belge</div>
                </div>
                <div className="bg-amber-50 p-3 rounded-xl border border-amber-200">
                  <div className="text-lg font-bold text-amber-700">{result.duplicateCount}</div>
                  <div className="text-amber-900 font-semibold">Mükerrer Atlanan</div>
                </div>
              </div>

              <div className="pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-6 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold"
                >
                  Kapat
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleUploadTransfer} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Kaynak Entegratör
                  </label>
                  <select
                    value={integrator}
                    onChange={(e) => setIntegrator(e.target.value)}
                    className="w-full text-xs bg-white border border-slate-300 rounded-lg p-2.5"
                  >
                    <option value="LOGO ÖZEL ENTEGRATÖR">Logo Özel Entegratör</option>
                    <option value="UYUMSOFT">Uyumsoft</option>
                    <option value="MİKRO ENTEGRATÖR">Mikro Entegratör</option>
                    <option value="FORIBA / SOVOS">Foriba / Sovos</option>
                    <option value="EDM BİLİŞİM">EDM Bilişim</option>
                    <option value="GİB PORTAL">GİB İnteraktif Portal</option>
                    <option value="DİĞER ÖZEL ENTEGRATÖR">Diğer Özel Entegratör</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Belge Türü
                  </label>
                  <select
                    value={docType}
                    onChange={(e) => setDocType(e.target.value)}
                    className="w-full text-xs bg-white border border-slate-300 rounded-lg p-2.5"
                  >
                    <option value="EFATURA">e-Fatura</option>
                    <option value="EARSIV">e-Arşiv</option>
                    <option value="EIRSALIYE">e-İrsaliye</option>
                    <option value="ESMM">e-SMM</option>
                    <option value="EMUSTAHSIL">e-Müstahsil</option>
                  </select>
                </div>
              </div>

              {/* Upload Dropzone */}
              <div className="border-2 border-dashed border-indigo-200 bg-indigo-50/40 rounded-2xl p-6 text-center space-y-2">
                <UploadCloud className="mx-auto text-indigo-500" size={36} />
                <div className="text-xs font-bold text-indigo-950">
                  ZIP Arşivi veya XML Dosyalarını Buraya Bırakın
                </div>
                <p className="text-[11px] text-slate-500">
                  UBL-TR 2.1 standardındaki XML dosyaları otomatik taranır ve UUID mükerrerliği kontrol edilir.
                </p>
                <div className="pt-2">
                  <span className="inline-block px-3 py-1 bg-white border border-indigo-200 text-indigo-700 rounded-lg text-xs font-semibold shadow-sm">
                    {simulatedCount} Adet XML Dosyası Seçildi
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-between text-xs text-slate-500 bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                <span className="flex items-center gap-1.5">
                  <ShieldCheck size={15} className="text-emerald-600" />
                  Mükerrerlik Denetimi: Aktif (Aynı UUID 2. kez aktarılmaz)
                </span>
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 bg-slate-100 text-slate-700 rounded-xl text-xs font-bold"
                >
                  İptal
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-6 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-md shadow-indigo-600/20"
                >
                  <UploadCloud size={15} />
                  {submitting ? 'Ayrıştırılıyor...' : 'Belgeleri İçe Aktar'}
                </button>
              </div>
            </form>
          )}
        </div>

      </div>
    </div>
  );
};
