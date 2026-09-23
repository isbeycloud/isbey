import React, { useState, useEffect } from 'react';
import { Modal } from '../../common/Modal';
import { api } from '../../../services/api';
import { useToast } from '../../../context/ToastContext';
import { useApp } from '../../../context/AppContext';
import type { ExternalCustomer, Tenant, User } from '../../../types';
import {
  Building,
  UserCheck,
  Zap,
  Phone,
  Mail,
  MapPin,
  FileText,
  Calendar,
  ShieldAlert,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  Plus,
  Link2
} from 'lucide-react';

interface HizliCustomerDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  customerId: string | null;
  onOpenConvertModal: (customer: ExternalCustomer) => void;
  onOpenMatchModal: (customer: ExternalCustomer) => void;
  onSuccess: () => void;
}

export const HizliCustomerDetailModal: React.FC<HizliCustomerDetailModalProps> = ({
  isOpen,
  onClose,
  customerId,
  onOpenConvertModal,
  onOpenMatchModal,
  onSuccess,
}) => {
  const { showToast } = useToast();
  const { triggerRefresh } = useApp();

  const [loading, setLoading] = useState(false);
  const [customer, setCustomer] = useState<ExternalCustomer | null>(null);
  const [linkedCompany, setLinkedCompany] = useState<Tenant | null>(null);
  const [linkedUser, setLinkedUser] = useState<User | null>(null);
  const [duplicateCheck, setDuplicateCheck] = useState<any>(null);
  const [creatingUser, setCreatingUser] = useState(false);

  useEffect(() => {
    if (isOpen && customerId) {
      loadDetail(customerId);
    }
  }, [isOpen, customerId]);

  const loadDetail = async (id: string) => {
    setLoading(true);
    try {
      const res = await api.getHizliCustomer(id);
      if (res.success && res.customer) {
        setCustomer(res.customer);
        setLinkedCompany(res.linkedCompany || null);
        setLinkedUser(res.linkedUser || null);
        setDuplicateCheck(res.duplicateCheck || null);
      }
    } catch (err: any) {
      showToast(err.message || 'Müşteri detayı yüklenemedi.', 'error');
    } finally {
      setLoading(false);
    }
  };

  if (!customer) return null;

  const handleCreateUserOnly = async () => {
    setCreatingUser(true);
    try {
      const res = await api.createHizliUser({ customerId: customer.id });
      if (res.success) {
        showToast(res.message, 'success');
        triggerRefresh();
        onSuccess();
        loadDetail(customer.id);
      }
    } catch (err: any) {
      showToast(err.message || 'Kullanıcı oluşturulamadı.', 'error');
    } finally {
      setCreatingUser(false);
    }
  };

  const statusBadge = (st: string) => {
    switch (st) {
      case 'NEW':
        return <span className="badge badge-warning" style={{ fontSize: '12px' }}>● Yeni (İŞBEY'e Aktarılmadı)</span>;
      case 'IMPORTED':
        return <span className="badge badge-info" style={{ fontSize: '12px' }}>● İŞBEY Firması Oluşturuldu</span>;
      case 'USER_CREATED':
        return <span className="badge badge-success" style={{ fontSize: '12px' }}>● Firma + Kullanıcı Aktif</span>;
      case 'MATCHED':
        return <span className="badge badge-primary" style={{ fontSize: '12px' }}>● Mevcut Firmayla Eşleştirildi</span>;
      case 'ERROR':
        return <span className="badge badge-danger" style={{ fontSize: '12px' }}>● Hata</span>;
      default:
        return <span className="badge badge-secondary">{st}</span>;
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`🏢 Hızlı Bilişim Müşteri Detayı — ${customer.companyName}`}
      size="large"
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {/* Üst Durum Çubuğu */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: 'var(--bg-surface-secondary)',
          padding: '12px 14px',
          borderRadius: '8px',
          border: '1px solid var(--border-color)',
        }}>
          <div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>HIZLI BİLİŞİM ENTEGRASYON DURUMU</div>
            <div style={{ marginTop: '4px' }}>{statusBadge(customer.status)}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>DIŞ MÜŞTERİ KODU</div>
            <strong style={{ fontSize: '14px', color: 'var(--primary)' }}>{customer.externalId}</strong>
          </div>
        </div>

        {/* Duplicate Uyarısı */}
        {duplicateCheck?.hasDuplicate && !customer.isbeyCompanyId && (
          <div style={{
            background: 'rgba(234, 88, 12, 0.1)',
            border: '1px solid rgba(234, 88, 12, 0.3)',
            borderRadius: '8px',
            padding: '12px 14px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '10px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#ea580c', fontSize: '13px' }}>
              <AlertCircle size={18} />
              <span>{duplicateCheck.message}</span>
            </div>
            <button
              type="button"
              className="btn btn-warning btn-sm"
              onClick={() => {
                onClose();
                onOpenMatchModal(customer);
              }}
              style={{ flexShrink: 0 }}
            >
              Mevcut Firmayla Eşleştir
            </button>
          </div>
        )}

        {/* 2 Kolonlu Bilgi Kartları */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
          {/* Sol Kolon: Firma Bilgileri */}
          <div style={{
            border: '1px solid var(--border-color)',
            borderRadius: '8px',
            padding: '14px',
            background: 'var(--bg-surface)',
          }}>
            <h4 style={{ margin: '0 0 12px', fontSize: '13px', fontWeight: 700, color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Building size={16} />
              <span>Hızlı Bilişim Firma Bilgileri</span>
            </h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '13px' }}>
              <div><strong>Kısa Adı:</strong> {customer.companyName}</div>
              <div><strong>Ticari Unvan:</strong> {customer.title || customer.companyName}</div>
              <div><strong>Vergi No / Dairesi:</strong> {customer.taxNumber} ({customer.taxOffice})</div>
              <div><strong>Adres:</strong> {customer.address || '-'}</div>
              <div><strong>Şehir / İlçe:</strong> {customer.city || 'İstanbul'} / {customer.district || '-'}</div>
              <div><strong>Kayıt Tarihi:</strong> {new Date(customer.registeredAt).toLocaleDateString('tr-TR')}</div>
            </div>
          </div>

          {/* Sağ Kolon: Yetkili & İletişim */}
          <div style={{
            border: '1px solid var(--border-color)',
            borderRadius: '8px',
            padding: '14px',
            background: 'var(--bg-surface)',
          }}>
            <h4 style={{ margin: '0 0 12px', fontSize: '13px', fontWeight: 700, color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <UserCheck size={16} />
              <span>Yetkili & İletişim Bilgileri</span>
            </h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '13px' }}>
              <div><strong>Yetkili Kişi:</strong> {customer.contactName}</div>
              <div><strong>E-Posta:</strong> <a href={`mailto:${customer.email}`}>{customer.email}</a></div>
              <div><strong>Telefon:</strong> <a href={`tel:${customer.phone}`}>{customer.phone}</a></div>
              <div><strong>Son Senkronizasyon:</strong> {new Date(customer.syncedAt).toLocaleString('tr-TR')}</div>
            </div>
          </div>
        </div>

        {/* İŞBEY Bağlantı Durumu Kartı */}
        <div style={{
          border: '1px solid var(--border-color)',
          borderRadius: '8px',
          padding: '14px',
          background: 'var(--bg-surface-secondary)',
        }}>
          <h4 style={{ margin: '0 0 10px', fontSize: '13px', fontWeight: 700, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Zap size={16} style={{ color: 'var(--primary)' }} />
            <span>İŞBEY ERP Entegrasyon Bağlantısı</span>
          </h4>

          {linkedCompany ? (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', fontSize: '13px' }}>
              <div>
                <strong>Bağlı İŞBEY Firması:</strong> {linkedCompany.name} ({linkedCompany.companyCode})
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                  Paket: <strong>{linkedCompany.plan}</strong> · Durum: <span className="badge badge-success">{linkedCompany.status}</span>
                </div>
              </div>
              <div>
                <strong>Bağlı Yönetici:</strong> {linkedUser ? `@${linkedUser.username} (${linkedUser.fullName})` : 'Kullanıcı henüz açılmadı'}
                {linkedUser && (
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                    Rol: <span className="badge badge-primary">{linkedUser.role}</span>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
              Bu müşteri henüz bir İŞBEY firmasına dönüştürülmedi veya eşleştirilmedi.
            </div>
          )}
        </div>

        {/* Alt İşlem Butonları */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--border-color)', paddingTop: '12px' }}>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Kapat
          </button>

          <div style={{ display: 'flex', gap: '8px' }}>
            {!customer.isbeyCompanyId && (
              <>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => {
                    onClose();
                    onOpenMatchModal(customer);
                  }}
                  style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                >
                  <Link2 size={15} />
                  <span>Mevcut Firmayla Eşleştir</span>
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => {
                    onClose();
                    onOpenConvertModal(customer);
                  }}
                  style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 700 }}
                >
                  <Plus size={15} />
                  <span>+ İŞBEY FİRMASI OLUŞTUR</span>
                </button>
              </>
            )}

            {customer.isbeyCompanyId && !customer.isbeyUserId && (
              <button
                type="button"
                className="btn btn-success"
                onClick={handleCreateUserOnly}
                disabled={creatingUser}
                style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                <UserCheck size={15} />
                <span>{creatingUser ? 'Açılıyor...' : '+ KULLANICI OLUŞTUR'}</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
};
