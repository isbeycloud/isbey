import { BrandLogo } from '../components/common/BrandLogo';
import React, { useState, useEffect } from 'react';
import {
  CreditCard,
  ShieldCheck,
  CheckCircle2,
  Lock,
  Building,
  Calendar,
  AlertCircle,
} from 'lucide-react';
import { api } from '../services/api';

interface PublicPaymentPageProps {
  token: string;
  onPaymentSuccess?: () => void;
}

export const PublicPaymentPage: React.FC<PublicPaymentPageProps> = ({ token, onPaymentSuccess }) => {
  const [linkData, setLinkData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Form State
  const [cardNumber, setCardNumber] = useState('');
  const [cardHolder, setCardHolder] = useState('');
  const [expiry, setExpiry] = useState('');
  const [cvv, setCvv] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  useEffect(() => {
    loadLink();
  }, [token]);

  const loadLink = async () => {
    setIsLoading(true);
    try {
      const res = await api.resolvePublicPaymentLink(token);
      if (res.success) {
        setLinkData(res.paymentLink);
      } else {
        setErrorMsg((res as any).message || 'Ödeme linki bulunamadı.');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Ödeme linki yüklenirken hata oluştu.');
    } finally {
      setIsLoading(false);
    }
  };

  const formatCardNumber = (val: string) => {
    const cleaned = val.replace(/\D/g, '').slice(0, 16);
    return cleaned.replace(/(\d{4})/g, '$1 ').trim();
  };

  const formatExpiry = (val: string) => {
    const cleaned = val.replace(/\D/g, '').slice(0, 4);
    if (cleaned.length >= 2) {
      return `${cleaned.slice(0, 2)}/${cleaned.slice(2)}`;
    }
    return cleaned;
  };

  const handlePay = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cardNumber || !cardHolder || !expiry || !cvv) {
      setErrorMsg('Lütfen tüm kart bilgilerini eksiksiz doldurunuz.');
      return;
    }

    setIsProcessing(true);
    setErrorMsg(null);
    try {
      const res = await api.payPublicPaymentLink({
        token,
        cardNumber: cardNumber.replace(/\s+/g, ''),
        cardHolder,
        expiry,
        cvv,
      });

      if (res.success) {
        setIsSuccess(true);
        if (onPaymentSuccess) onPaymentSuccess();
      } else {
        setErrorMsg(res.message || 'Ödeme işlemi bankanız tarafından reddedildi.');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Ödeme işlemi başarısız oldu.');
    } finally {
      setIsProcessing(false);
    }
  };

  if (isLoading) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--bg-surface-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--info)' }}>
        <div style={{ textAlign: 'center' }}>
          <div className="spinner" style={{ margin: '0 auto 12px' }} />
          <p>Güvenli ödeme sayfası yükleniyor...</p>
        </div>
      </div>
    );
  }

  if (errorMsg && !linkData) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--bg-surface-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-main)', padding: '20px' }}>
        <div style={{ background: 'var(--bg-surface)', borderRadius: 'var(--radius-lg, 10px)', padding: '30px', maxWidth: '420px', textAlign: 'center', border: '1px solid var(--danger-border)' }}>
          <AlertCircle size={48} color="var(--danger)" style={{ margin: '0 auto 16px' }} />
          <h2 style={{ fontSize: 'var(--fs-lg, 16px)', fontWeight: 700, margin: '0 0 8px' }}>Geçersiz Ödeme Linki</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: 'var(--fs-base, 13px)', margin: 0 }}>{errorMsg}</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-surface-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', color: 'var(--text-main)' }}>
      <div style={{ width: '100%', maxWidth: '460px', background: 'var(--bg-surface)', borderRadius: 'var(--radius-lg, 10px)', border: '1px solid var(--border-color)', boxShadow: 'var(--shadow-xl)', overflow: 'hidden' }}>
        {/* Üst Güvenlik Bandı */}
        <div style={{ background: 'var(--primary)', padding: '24px', textAlign: 'center', color: '#fff' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', fontSize: 'var(--fs-sm, 12px)', fontWeight: 700, marginBottom: '6px', opacity: 0.9 }}>
            <Lock size={14} />
            <span>256-Bit SSL Güvenli Tahsilat Portalı</span>
          </div>
          <BrandLogo width={250} style={{ padding: 8 }} />
          <p style={{ margin: '4px 0 0', fontSize: 'var(--fs-base, 13px)', opacity: 0.85 }}>{linkData?.customerTitle}</p>
        </div>

        <div style={{ padding: '24px' }}>
          {!isSuccess ? (
            <form onSubmit={handlePay} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* Tutar Kutusu */}
              <div style={{ background: 'var(--bg-surface-secondary)', padding: '16px', borderRadius: 'var(--radius-md, 8px)', border: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: 'var(--fs-sm, 12px)', color: 'var(--text-muted)', fontWeight: 700 }}>Ödenecek Tutar</div>
                  <div style={{ fontSize: 'var(--fs-base, 13px)', color: 'var(--text-muted)' }}>{linkData?.description}</div>
                </div>
                <div style={{ fontSize: 'var(--fs-xl, 20px)', fontWeight: 700, color: 'var(--success)' }}>
                  {linkData?.amount.toLocaleString('tr-TR')} {linkData?.currency}
                </div>
              </div>

              {errorMsg && (
                <div style={{ padding: '10px 14px', background: 'var(--danger-bg)', border: '1px solid var(--danger-border)', borderRadius: 'var(--radius-sm, 6px)', color: 'var(--danger-text)', fontSize: 'var(--fs-base, 13px)' }}>
                  {errorMsg}
                </div>
              )}

              {/* Kart Bilgileri */}
              <div>
                <label style={{ display: 'block', fontSize: 'var(--fs-sm, 12px)', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '4px' }}>Kart Üzerindeki İsim</label>
                <input
                  type="text"
                  required
                  placeholder="Ad Soyad"
                  value={cardHolder}
                  onChange={e => setCardHolder(e.target.value.toUpperCase())}
                  style={{ width: '100%', padding: '10px 12px', background: 'var(--bg-surface-secondary)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm, 6px)', color: 'var(--text-main)', fontSize: 'var(--fs-md, 14px)' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 'var(--fs-sm, 12px)', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '4px' }}>Kart Numarası</label>
                <input
                  type="text"
                  required
                  placeholder="•••• •••• •••• ••••"
                  value={cardNumber}
                  onChange={e => setCardNumber(formatCardNumber(e.target.value))}
                  style={{ width: '100%', padding: '10px 12px', background: 'var(--bg-surface-secondary)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm, 6px)', color: 'var(--text-main)', fontSize: 'var(--fs-lg, 16px)', fontFamily: 'monospace', letterSpacing: '0.05em' }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: 'var(--fs-sm, 12px)', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '4px' }}>Son Kullanma (AA/YY)</label>
                  <input
                    type="text"
                    required
                    placeholder="MM/YY"
                    value={expiry}
                    onChange={e => setExpiry(formatExpiry(e.target.value))}
                    style={{ width: '100%', padding: '10px 12px', background: 'var(--bg-surface-secondary)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm, 6px)', color: 'var(--text-main)', fontSize: 'var(--fs-md, 14px)', textAlign: 'center' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 'var(--fs-sm, 12px)', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '4px' }}>Güvenlik Kodu (CVV)</label>
                  <input
                    type="password"
                    maxLength={4}
                    required
                    placeholder="•••"
                    value={cvv}
                    onChange={e => setCvv(e.target.value)}
                    style={{ width: '100%', padding: '10px 12px', background: 'var(--bg-surface-secondary)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm, 6px)', color: 'var(--text-main)', fontSize: 'var(--fs-md, 14px)', textAlign: 'center' }}
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isProcessing}
                style={{
                  width: '100%',
                  padding: '14px',
                  background: 'var(--success)',
                  border: 'none',
                  borderRadius: 'var(--radius-md, 8px)',
                  color: '#fff',
                  fontWeight: 700,
                  fontSize: 'var(--fs-lg, 16px)',
                  cursor: 'pointer',
                  marginTop: '10px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                }}
              >
                {isProcessing ? <div className="spinner" /> : <ShieldCheck size={20} />}
                <span>{linkData?.amount.toLocaleString('tr-TR')} TL Güvenli Öde</span>
              </button>
            </form>
          ) : (
            <div style={{ textAlign: 'center', padding: '20px 0' }}>
              <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: 'var(--success-bg)', color: 'var(--success)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                <CheckCircle2 size={40} />
              </div>
              <h3 style={{ margin: '0 0 6px', fontSize: 'var(--fs-lg, 16px)', fontWeight: 700, color: 'var(--text-main)' }}>Ödemeniz Alındı!</h3>
              <p style={{ color: 'var(--text-muted)', fontSize: 'var(--fs-base, 13px)', margin: '0 0 20px' }}>
                İşleminiz başarıyla tamamlandı ve cari hesap ekstrenize işlendi.
              </p>
              <div style={{ fontSize: 'var(--fs-lg, 16px)', fontWeight: 700, color: 'var(--success)', marginBottom: '8px' }}>
                {linkData?.amount.toLocaleString('tr-TR')} {linkData?.currency}
              </div>
              <div style={{ fontSize: 'var(--fs-sm, 12px)', color: 'var(--text-muted)' }}>
                Onay Zamanı: {new Date().toLocaleString('tr-TR')}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
