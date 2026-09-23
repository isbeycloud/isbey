import React from 'react';
import { Badge } from './Badge';

export interface StatusBadgeProps {
  status: string;
  size?: 'sm' | 'md';
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status, size = 'md' }) => {
  const normalized = (status || '').toUpperCase().trim();

  const getMapping = (): { label: string; variant: 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'accent' } => {
    switch (normalized) {
      case 'APPROVED':
      case 'ODENDI':
      case 'COMPLETED':
      case 'SUCCESS':
      case 'ACTIVE':
      case 'AKTIF':
      case 'ONLINE':
      case 'ONAYLANDI':
      case 'GECERLI':
        return { label: normalized === 'APPROVED' ? 'ONAYLANDI' : normalized, variant: 'success' };

      case 'PENDING':
      case 'BEKLEMEDE':
      case 'DRAFT':
      case 'TASLAK':
      case 'IN_PROGRESS':
      case 'PROCESSING':
        return { label: normalized === 'PENDING' ? 'BEKLEMEDE' : normalized, variant: 'warning' };

      case 'CANCELLED':
      case 'IPTAL':
      case 'FAILED':
      case 'HATA':
      case 'OVERDUE':
      case 'VADESI_GECTI':
      case 'REJECTED':
      case 'REDDEDILDI':
        return { label: normalized === 'CANCELLED' ? 'İPTAL' : normalized, variant: 'danger' };

      case 'SENT':
      case 'GONDERILDI':
      case 'DELIVERED':
      case 'TESLIM_EDILDI':
      case 'INFO':
        return { label: normalized === 'SENT' ? 'GÖNDERİLDİ' : normalized, variant: 'info' };

      case 'PARTIAL':
      case 'KISMI_ODENDI':
      case 'TRIAL':
        return { label: normalized === 'PARTIAL' ? 'KISMİ' : normalized, variant: 'accent' };

      // 2026-09-16 (`docs/46` §3): 'MOCK_SENT' gerçek bir GİB gönderimi DEĞİLDİR.
      // Belge yalnız test sağlayıcısından geçti. Ham değer gösterilirse
      // "GÖNDERİLDİ" ile karıştırılabilir; etiket bunu açıkça söyler.
      case 'MOCK_SENT':
        return { label: 'GİB\'E GÖNDERİLMEDİ (TEST)', variant: 'neutral' };

      default:
        return { label: status || '—', variant: 'neutral' };
    }
  };

  const { label, variant } = getMapping();

  return (
    <Badge variant={variant} size={size} dot>
      {label}
    </Badge>
  );
};
