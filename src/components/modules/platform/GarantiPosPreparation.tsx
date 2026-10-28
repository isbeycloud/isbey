import React, { useEffect, useState } from 'react';
import { api } from '../../../services/api';
import type { GarantiReadiness } from '../../../types/packageCheckout';

export const GarantiPosPreparation: React.FC = () => {
  const [state, setState] = useState<GarantiReadiness | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const load = async () => {
    setLoading(true); setError('');
    try { setState(await api.getGarantiReadiness()); }
    catch (err) { setError(err instanceof Error ? err.message : 'Hazırlık durumu alınamadı.'); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, []);
  return <section aria-label="Garanti BBVA sanal POS hazırlığı" style={{ maxWidth: 820, display: 'grid', gap: 16 }}>
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
      <h2 style={{ margin: 0 }}>Garanti BBVA Sanal POS</h2>
      <button className="btn btn-secondary" disabled={loading} onClick={load}>{loading ? 'Kontrol ediliyor…' : 'Durumu Yenile'}</button>
    </div>
    <p style={{ margin: 0 }}>Başvuru yapıldı; banka test bilgileri bekleniyor. Paket satın alma için 3D Secure ortak ödeme sayfası hazırlanıyor.</p>
    <div className="alert alert-warning" role="status">Online tahsilat kapalı. Paket atama işlemi ödeme alındığı anlamına gelmez.</div>
    {error && <p role="alert">{error}</p>}
    {state && <>
      <div style={{ padding: 16, background: 'var(--bg-surface)', border: '1px solid var(--border-color)', borderRadius: 8 }}>
        <p style={{ marginTop: 0 }}><strong>Ortam:</strong> {state.mode === 'TEST' ? 'Banka test ortamı' : state.mode === 'PROD' ? 'Canlı ortam seçilmiş; ödeme hâlâ kapalı' : 'Henüz seçilmedi'}</p>
        <ul style={{ paddingLeft: 20, lineHeight: 1.9 }}>
          {state.checks.map(check => <li key={check.key}>{check.label}: <strong>{check.configured ? 'Tanımlandı' : 'Bekleniyor'}</strong></li>)}
          <li>İşyeri / terminal biçimi: <strong>{state.identifiersValid ? 'Uygun' : 'Kontrol bekliyor'}</strong></li>
          <li>Güvenli uygulama adresi: <strong>{state.publicUrlValid ? 'Tanımlandı' : 'Kontrol bekliyor'}</strong></li>
        </ul>
        <p style={{ marginBottom: 0 }}>Bilgilerin tanımlanması banka bağlantısının doğrulandığı anlamına gelmez. Parolalar bu ekranda gösterilmez.</p>
      </div>
      <div style={{ padding: 16, background: 'var(--bg-surface)', border: '1px solid var(--border-color)', borderRadius: 8 }}>
        <strong>Açılış öncesi kalan işler</strong>
        <ol style={{ paddingLeft: 20, lineHeight: 1.9 }}>
          <li>Bankanın terminal için 3D Secure ortak ödeme modelini açması ve test bilgilerinin güvenli şekilde tanımlanması.</li>
          <li>Paket fiyatlarının, vergilerin ve yıllık toplamların kesinleştirilmesi.</li>
          <li>Banka dönüşünün imza ve işlem sorgusuyla doğrulanması; tekrar bildirimde tek paket aktivasyonu.</li>
          <li>Başarılı, reddedilen, yarım kalan ve zaman aşımına uğrayan ödemelerin banka testleri.</li>
        </ol>
      </div>
    </>}
  </section>;
};
