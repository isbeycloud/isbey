import React, { useState } from 'react';
import { Modal } from './Modal';
import { api } from '../../services/api';
import { useToast } from '../../context/ToastContext';
import { useApp } from '../../context/AppContext';
import { Upload, FileSpreadsheet, CheckCircle2, AlertCircle, ArrowRight, Download } from 'lucide-react';

interface ImportWizardModalProps {
  isOpen: boolean;
  onClose: () => void;
  importType?: 'CUSTOMERS' | 'PRODUCTS';
}

export const ImportWizardModal: React.FC<ImportWizardModalProps> = ({
  isOpen,
  onClose,
  importType = 'CUSTOMERS',
}) => {
  const { showToast } = useToast();
  const { triggerRefresh } = useApp();

  const [rawText, setRawText] = useState('');
  const [parsedRows, setParsedRows] = useState<any[]>([]);
  const [step, setStep] = useState<'INPUT' | 'PREVIEW'>('INPUT');
  const [loading, setLoading] = useState(false);

  const sampleCustomerData = `Unvan;Yetkili;Telefon;VergiNo;VergiDairesi;Bakiye;Vade
Mega Bilişim Ltd. Şti.;Kenan Er;0532 999 11 22;1234567890;Beşiktaş;0;30
Nova Mimarlık A.Ş.;Ayşe Demir;0533 888 22 33;9876543210;Şişli;0;45`;

  const sampleProductData = `UrunAdi;Barkod;StokKodu;AlisFiyati;SatisFiyati;KDV;MevcutStok
Logitech C920 Pro HD Webcam;8690000109201;STK-WEB;1850;2650;20;15
Kingston 64GB USB 3.2 Bellek;8690000106402;STK-USB;140;240;20;50`;

  const handleLoadSample = () => {
    setRawText(importType === 'CUSTOMERS' ? sampleCustomerData : sampleProductData);
  };

  const handleParse = () => {
    if (!rawText.trim()) {
      showToast('Lütfen içe aktarılacak metni yapıştırınız.', 'warning');
      return;
    }

    const lines = rawText.trim().split('\n');
    if (lines.length < 2) {
      showToast('En az 1 başlık satırı ve 1 veri satırı olmalıdır.', 'warning');
      return;
    }

    const delimiter = rawText.includes(';') ? ';' : rawText.includes('\t') ? '\t' : ',';
    const headers = lines[0].split(delimiter).map(h => h.trim());
    const rows: any[] = [];

    for (let i = 1; i < lines.length; i++) {
      const parts = lines[i].split(delimiter).map(p => p.trim());
      if (parts.length < 2) continue;

      if (importType === 'CUSTOMERS') {
        rows.push({
          title: parts[0] || '',
          contactName: parts[1] || '',
          phone: parts[2] || '',
          taxNumber: parts[3] || '',
          taxOffice: parts[4] || '',
          maturityDays: Number(parts[6]) || 30,
        });
      } else {
        rows.push({
          name: parts[0] || '',
          barcode: parts[1] || '',
          code: parts[2] || '',
          purchasePrice: Number(parts[3]) || 0,
          salePrice: Number(parts[4]) || 0,
          vatRate: Number(parts[5]) || 20,
          currentStock: Number(parts[6]) || 0,
        });
      }
    }

    if (rows.length === 0) {
      showToast('Geçerli veri satırı ayrıştırılamadı.', 'error');
      return;
    }

    setParsedRows(rows);
    setStep('PREVIEW');
  };

  const handleImportSubmit = async () => {
    setLoading(true);
    try {
      if (importType === 'CUSTOMERS') {
        const res = await api.importCustomers(parsedRows);
        if (res.success) {
          showToast(res.message, 'success');
          triggerRefresh();
          onClose();
        }
      } else {
        const res = await api.importProducts(parsedRows);
        if (res.success) {
          showToast(res.message, 'success');
          triggerRefresh();
          onClose();
        }
      }
    } catch (err: any) {
      showToast(err.message || 'İçe aktarma başarısız oldu.', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Toplu Excel / CSV İçe Aktarma Sihirbazı (${importType === 'CUSTOMERS' ? 'Cari Kartlar' : 'Stok Kartları'})`}
      size="large"
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            İptal
          </button>
          {step === 'INPUT' ? (
            <button type="button" className="btn btn-primary" onClick={handleParse}>
              <span>Verileri Ayrıştır & Önizle</span>
              <ArrowRight size={14} />
            </button>
          ) : (
            <>
              <button type="button" className="btn btn-secondary" onClick={() => setStep('INPUT')}>
                Geri Dön
              </button>
              <button type="button" className="btn btn-success" onClick={handleImportSubmit} disabled={loading}>
                <CheckCircle2 size={14} />
                <span>{loading ? 'İçe Aktarılıyor...' : `${parsedRows.length} Kaydı Sisteme Aktar`}</span>
              </button>
            </>
          )}
        </>
      }
    >
      {step === 'INPUT' ? (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
              Excel veya CSV dosyanızdan sütunları kopyalayıp aşağıdaki alana yapıştırabilirsiniz:
            </span>
            <button type="button" className="btn btn-secondary btn-sm" onClick={handleLoadSample}>
              Örnek Şablon Doldur
            </button>
          </div>

          <textarea
            className="form-textarea"
            rows={10}
            style={{ fontFamily: 'var(--font-mono)', fontSize: '12px' }}
            placeholder={importType === 'CUSTOMERS' ? sampleCustomerData : sampleProductData}
            value={rawText}
            onChange={e => setRawText(e.target.value)}
          />

          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '8px' }}>
            💡 <strong>İpucu:</strong> Kolon ayracı olarak noktalı virgül (;), sekme (Tab) veya virgül (,) kullanabilirsiniz.
          </div>
        </div>
      ) : (
        <div>
          <div style={{ background: '#ecfdf5', border: '1px solid #10b981', borderRadius: '6px', padding: '10px 14px', color: '#065f46', marginBottom: '14px', fontSize: '13px' }}>
            ✅ <strong>{parsedRows.length} adet geçerli satır</strong> başarıyla ayrıştırıldı. Onayladığınızda veritabanına eklenecektir.
          </div>

          <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
            <table className="data-grid-table" style={{ fontSize: '12px' }}>
              <thead>
                <tr>
                  {importType === 'CUSTOMERS' ? (
                    <>
                      <th>Cari Ünvan</th>
                      <th>Yetkili</th>
                      <th>Telefon</th>
                      <th>Vergi No / Daire</th>
                      <th>Vade</th>
                    </>
                  ) : (
                    <>
                      <th>Ürün Adı</th>
                      <th>Barkod</th>
                      <th>Kod</th>
                      <th>Alış Fiyatı</th>
                      <th>Satış Fiyatı</th>
                      <th>KDV</th>
                      <th>Açılış Stoğu</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {parsedRows.map((r, i) => (
                  <tr key={i}>
                    {importType === 'CUSTOMERS' ? (
                      <>
                        <td style={{ fontWeight: 600 }}>{r.title}</td>
                        <td>{r.contactName || '-'}</td>
                        <td>{r.phone || '-'}</td>
                        <td>{r.taxNumber ? `${r.taxNumber} (${r.taxOffice})` : '-'}</td>
                        <td>{r.maturityDays} Gün</td>
                      </>
                    ) : (
                      <>
                        <td style={{ fontWeight: 600 }}>{r.name}</td>
                        <td style={{ fontFamily: 'var(--font-mono)' }}>{r.barcode}</td>
                        <td style={{ fontFamily: 'var(--font-mono)' }}>{r.code}</td>
                        <td>{r.purchasePrice} ₺</td>
                        <td style={{ fontWeight: 700, color: 'var(--primary)' }}>{r.salePrice} ₺</td>
                        <td>%{r.vatRate}</td>
                        <td>{r.currentStock} Adet</td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Modal>
  );
};
