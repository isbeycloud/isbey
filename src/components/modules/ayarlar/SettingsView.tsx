import React, { useState, useEffect } from 'react';
import { DataGrid } from '../../common/DataGrid';
import type { Column } from '../../common/DataGrid';

import type { Company, AuditLog, InvoiceTemplateType, DocumentTemplateSettings } from '../../../types';
import { api } from '../../../services/api';

import { useToast } from '../../../context/ToastContext';
import { useApp } from '../../../context/AppContext';
import { UserManagementTab } from './UserManagementTab';
import { HizliConnectSettingsTab } from './HizliConnectSettingsTab';
import { HizliBilisimIntegrationTab } from './HizliBilisimIntegrationTab';
import { DocumentTemplateEngine } from '../../templates/DocumentTemplateEngine';
import { DocumentTemplateListView } from './DocumentTemplateListView';
import { DocumentTemplateDesigner } from './DocumentTemplateDesigner';
import { InvoiceDesignTab } from './InvoiceDesignTab';
import type { DocumentType } from '../../../types';
import { CompanyLogoModal } from '../../common/CompanyLogoModal';
import { Building, Sliders, Database, ShieldCheck, Printer, Save, Download, RefreshCw, Users, LayoutTemplate, Palette, CheckCircle2, PlusCircle, Edit, Trash2, Copy, Star, FileText, Camera, Zap } from 'lucide-react';

export const SettingsView: React.FC = () => {
  const { showToast } = useToast();
  const { triggerRefresh, openFormDesigner } = useApp();

  const [activeTab, setActiveTab] = useState<'COMPANY' | 'USERS' | 'HIZLI_CONNECT' | 'HIZLI_BILISIM' | 'TEMPLATES' | 'INVOICE_DESIGN' | 'SEQUENCES' | 'BACKUP' | 'AUDIT_LOGS' | 'SYSTEM'>('COMPANY');

  // XSLT Document Designer states
  const [selectedXsltTemplateId, setSelectedXsltTemplateId] = useState<string | null>(null);
  const [selectedXsltDocType, setSelectedXsltDocType] = useState<DocumentType>('EFATURA');
  const [isXsltDesigning, setIsXsltDesigning] = useState(false);

  const [company, setCompany] = useState<Company | null>(null);
  const [sequences, setSequences] = useState<any>({});
  const [systemSettings, setSystemSettings] = useState<any>({});
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [isLogoModalOpen, setIsLogoModalOpen] = useState(false);

  // Template customizer state
  const [docSettings, setDocSettings] = useState<DocumentTemplateSettings>({
    invoiceTemplate: 'professional',
    primaryColor: '#0066cc',
    showLogo: true,
    showQrCode: true,
    showBankAccounts: true,
    showStampAndSignature: true,
    footerNotes: 'İşbu fatura muhteviyatına 8 gün içerisinde itiraz edilmediği takdirde aynen kabul edilmiş sayılır.',
  });

  useEffect(() => {
    loadSettings();
  }, [activeTab]);

  const loadSettings = async () => {
    setLoading(true);
    try {
      if (activeTab === 'AUDIT_LOGS') {
        const res = await api.getAuditLogs();
        if (res.success) setAuditLogs(res.auditLogs);
      } else {
        const res = await api.getSettings();
        if (res.success) {
          setCompany(res.company);
          setSequences(res.sequences);
          setSystemSettings(res.settings);
          if (res.company.documentSettings) {
            setDocSettings(res.company.documentSettings);
          }
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveDocSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!company) return;
    try {
      const updatedCompany = {
        ...company,
        documentSettings: docSettings,
      };
      const res = await api.updateCompany(updatedCompany);
      if (res.success) {
        setCompany(updatedCompany);
        showToast('Fatura ve belge tasarım tercihleri başarıyla kaydedildi.', 'success');
      }
    } catch (err: any) {
      showToast(err.message || 'Tasarım ayarları kaydedilemedi.', 'error');
    }
  };

  // Sample Invoice Payload for Live Interactive Preview
  const sampleInvoicePayload = {
    type: 'SALE',
    invoiceNo: 'SAT-2026-000124',
    date: '17.08.2026',
    maturityDate: '17.09.2026',
    customerTitle: 'Atlas Endüstriyel Bilişim Sistemleri San. ve Tic. Ltd. Şti.',
    customerAddress: 'Büyükdere Cad. Maslak Plaza Kat:8 No:42 Sarıyer / İSTANBUL',
    taxOffice: 'Maslak',
    taxNumber: '1280947192',
    paymentType: 'OPEN_ACCOUNT',
    notes: docSettings.footerNotes,
    items: [
      {
        productCode: 'STK-MON-01',
        productName: '27 inç 4K UltraHD IPS Çerçevesiz Monitör',
        quantity: 3,
        unit: 'Adet',
        unitPrice: 8500,
        vatRate: 20,
        lineGrandTotal: 30600,
      },
      {
        productCode: 'STK-KAB-09',
        productName: 'Thunderbolt 4 / Type-C 40Gbps Bağlantı Kablosu',
        quantity: 6,
        unit: 'Adet',
        unitPrice: 450,
        vatRate: 20,
        lineGrandTotal: 3240,
      },
      {
        productCode: 'HZM-KUR-01',
        productName: 'İş İstasyonu Yerinde Kurulum ve Konfigürasyon',
        quantity: 1,
        unit: 'Hizmet',
        unitPrice: 2000,
        vatRate: 20,
        lineGrandTotal: 2400,
      },
    ],
    subTotal: 30200,
    totalDiscount: 0,
    totalVat: 6040,
    grandTotal: 36240,
  };


  const handleSaveCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!company) return;
    try {
      const res = await api.updateCompany(company);
      if (res.success) {
        showToast(res.message, 'success');
        triggerRefresh();
      }
    } catch (err: any) {
      showToast(err.message || 'Firma bilgileri güncellenemedi.', 'error');
    }
  };

  const handleSaveSequences = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await api.updateSequences(sequences);
      if (res.success) {
        showToast(res.message, 'success');
      }
    } catch (err: any) {
      showToast(err.message || 'Numaratörler güncellenemedi.', 'error');
    }
  };

  const handleSaveSystemSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await api.updateSystemSettings(systemSettings);
      if (res.success) {
        showToast(res.message, 'success');
      }
    } catch (err: any) {
      showToast(err.message || 'Sistem ayarları güncellenemedi.', 'error');
    }
  };

  const handleCreateBackup = async () => {
    try {
      const res = await api.createBackup();
      if (res.success) {
        showToast(res.message, 'success');
      }
    } catch (err: any) {
      showToast(err.message || 'Yedek alınamadı.', 'error');
    }
  };

  const auditColumns: Column<AuditLog>[] = [
    {
      key: 'timestamp',
      title: 'Tarih / Saat',
      width: '160px',
      render: l => <span>{new Date(l.timestamp).toLocaleString('tr-TR')}</span>,
    },
    {
      key: 'username',
      title: 'Kullanıcı',
      width: '110px',
      render: l => <span style={{ fontWeight: 600 }}>{l.username}</span>,
    },
    {
      key: 'action',
      title: 'Eylem',
      width: '110px',
      render: l => {
        const isDelete = l.action === 'DELETE' || l.action === 'CANCEL';
        return (
          <span className={`badge ${isDelete ? 'badge-danger' : l.action === 'CREATE' ? 'badge-success' : 'badge-info'}`}>
            {l.action}
          </span>
        );
      },
    },
    {
      key: 'module',
      title: 'Modül',
      width: '110px',
      render: l => <span style={{ fontWeight: 600, color: 'var(--primary)' }}>{l.module}</span>,
    },
    {
      key: 'documentNo',
      title: 'Belge No',
      width: '130px',
      render: l => <span>{l.documentNo || '-'}</span>,
    },
    {
      key: 'details',
      title: 'İşlem Detayları',
      render: l => <span>{l.details}</span>,
    },
    {
      key: 'ipAddress',
      title: 'IP Adresi',
      width: '110px',
      render: l => <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{l.ipAddress}</span>,
    },
  ];

  return (
    <div className="view-content-container">
      {/* Ayarlar Alt Menüsü */}
      <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid var(--border-color)', paddingBottom: '10px' }}>
        <button
          className={`btn ${activeTab === 'COMPANY' ? 'btn-primary' : 'btn-secondary'} btn-sm`}
          onClick={() => setActiveTab('COMPANY')}
        >
          <Building size={14} />
          <span>Firma Bilgileri</span>
        </button>
        <button
          className={`btn ${activeTab === 'USERS' ? 'btn-primary' : 'btn-secondary'} btn-sm`}
          onClick={() => setActiveTab('USERS')}
        >
          <Users size={14} />
          <span>Kullanıcılar & Roller (RBAC)</span>
        </button>
        <button
          className={`btn ${activeTab === 'HIZLI_CONNECT' ? 'btn-primary' : 'btn-secondary'} btn-sm`}
          onClick={() => setActiveTab('HIZLI_CONNECT')}
          style={{ fontWeight: activeTab === 'HIZLI_CONNECT' ? 700 : 500 }}
        >
          <Zap size={14} color="#38bdf8" />
          <span>e-Dönüşüm (GİB)</span>
        </button>
        <button
          className={`btn ${activeTab === 'HIZLI_BILISIM' ? 'btn-primary' : 'btn-secondary'} btn-sm`}
          onClick={() => setActiveTab('HIZLI_BILISIM')}
          style={{ fontWeight: activeTab === 'HIZLI_BILISIM' ? 700 : 500 }}
        >
          <Zap size={14} color="#a855f7" />
          <span>Hızlı Bilişim Entegrasyonu</span>
        </button>
        <button
          className={`btn ${activeTab === 'TEMPLATES' ? 'btn-primary' : 'btn-secondary'} btn-sm`}
          onClick={() => setActiveTab('TEMPLATES')}
        >
          <LayoutTemplate size={14} />
          <span>Belge & Fatura Tasarımları</span>
        </button>
        {/* FAZ 25.3-A: Fatura Tasarım Modülü */}
        <button
          className={`btn ${activeTab === 'INVOICE_DESIGN' ? 'btn-primary' : 'btn-secondary'} btn-sm`}
          onClick={() => setActiveTab('INVOICE_DESIGN')}
        >
          <Palette size={14} />
          <span>Fatura Tasarımı</span>
        </button>
        <button
          className={`btn ${activeTab === 'SEQUENCES' ? 'btn-primary' : 'btn-secondary'} btn-sm`}
          onClick={() => setActiveTab('SEQUENCES')}
        >
          <Sliders size={14} />
          <span>Belge Numaraları & Seriler</span>
        </button>
        <button
          className={`btn ${activeTab === 'SYSTEM' ? 'btn-primary' : 'btn-secondary'} btn-sm`}
          onClick={() => setActiveTab('SYSTEM')}
        >
          <Printer size={14} />
          <span>Yazıcı & Sistem Tercihleri</span>
        </button>
        <button
          className={`btn ${activeTab === 'BACKUP' ? 'btn-primary' : 'btn-secondary'} btn-sm`}
          onClick={() => setActiveTab('BACKUP')}
        >
          <Database size={14} />
          <span>Yedekleme & Geri Yükleme</span>
        </button>
        <button
          className={`btn ${activeTab === 'AUDIT_LOGS' ? 'btn-primary' : 'btn-secondary'} btn-sm`}
          onClick={() => setActiveTab('AUDIT_LOGS')}
        >
          <ShieldCheck size={14} />
          <span>Audit Log Denetim Kayıtları</span>
        </button>
      </div>

      {/* 0. KULLANICI YÖNETİMİ */}
{activeTab === 'USERS' && <UserManagementTab />}

      {/* 0.1 HIZLI TEKNOLOJİ e-CONNECT ENTEGRASYONU */}
      {activeTab === 'HIZLI_CONNECT' && <HizliConnectSettingsTab />}

      {/* 0.2 HIZLI BİLİŞİM MÜŞTERİ ENTEGRASYON AYARLARI */}
      {activeTab === 'HIZLI_BILISIM' && <HizliBilisimIntegrationTab />}

      {/* 0.3 FATURA TASARIM MODÜLÜ (FAZ 25.3-A) */}
      {activeTab === 'INVOICE_DESIGN' && <InvoiceDesignTab />}

      {/* 3. PROFESYONEL XSLT BELGE & FATURA TASARIMLARI */}
      {activeTab === 'TEMPLATES' && (
        isXsltDesigning ? (
          <DocumentTemplateDesigner
            templateId={selectedXsltTemplateId}
            initialDocumentType={selectedXsltDocType}
            onBack={() => {
              setIsXsltDesigning(false);
              setSelectedXsltTemplateId(null);
            }}
          />
        ) : (
          <DocumentTemplateListView
            onOpenDesigner={(id, type) => {
              setSelectedXsltTemplateId(id);
              if (type) setSelectedXsltDocType(type);
              setIsXsltDesigning(true);
            }}
          />
        )
      )}



      {/* 1. FİRMA BİLGİLERİ */}
      {activeTab === 'COMPANY' && company && (
        <form onSubmit={handleSaveCompany} className="card-panel" style={{ padding: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px' }}>
            <h3 style={{ fontSize: '15px', fontWeight: 700 }}>Kurumsal Firma & Fatura Başlık Bilgileri</h3>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => setIsLogoModalOpen(true)}
              style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <Camera size={14} color="var(--primary)" />
              <span>Firma Amblemi / Logo Değiştir</span>
            </button>
          </div>

          {/* Amblem Kartı */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '16px',
            background: 'var(--bg-surface-secondary)',
            padding: '14px',
            borderRadius: '8px',
            border: '1px solid var(--border-color)',
            marginBottom: '16px',
          }}>
            <div style={{
              width: '64px',
              height: '64px',
              borderRadius: '8px',
              background: '#ffffff',
              border: '1px solid var(--border-color)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'hidden',
              flexShrink: 0,
              boxShadow: '0 2px 6px rgba(0,0,0,0.06)',
            }}>
              {company.logoUrl ? (
                <img
                  src={company.logoUrl}
                  alt="Firma Logosu"
                  style={{ width: '100%', height: '100%', objectFit: 'contain', padding: '4px' }}
                />
              ) : (
                <Building size={28} color="var(--text-muted)" style={{ opacity: 0.4 }} />
              )}
            </div>

            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-main)' }}>
                {company.logoUrl ? '✓ Firma Amblemi Tanımlı' : '⚠️ Henüz Firma Amblemi / Logosu Eklenmemiş'}
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                Yüklediğiniz amblem üst menü başlığında (Header), satış faturalarında ve e-belgelerde otomatik görünür.
              </div>
            </div>

            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => setIsLogoModalOpen(true)}
            >
              {company.logoUrl ? 'Amblemi Değiştir' : '+ Amblem Yükle'}
            </button>
          </div>

          <div className="form-grid-3">
            <div className="form-group" style={{ gridColumn: 'span 2' }}>
              <label className="form-label required">Firma Kısa Adı</label>
              <input
                type="text"
                className="form-input"
                value={company.name}
                onChange={e => setCompany({ ...company, name: e.target.value })}
              />
            </div>

            <div className="form-group">
              <label className="form-label required">Mali Yıl</label>
              <input
                type="number"
                className="form-input"
                value={company.fiscalYear}
                onChange={e => setCompany({ ...company, fiscalYear: Number(e.target.value) })}
              />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label required">Fatura Resmi Ticari Unvanı</label>
            <input
              type="text"
              className="form-input"
              value={company.title}
              onChange={e => setCompany({ ...company, title: e.target.value })}
            />
          </div>

          <div className="form-grid-3">
            <div className="form-group">
              <label className="form-label required">Vergi Dairesi</label>
              <input
                type="text"
                className="form-input"
                value={company.taxOffice}
                onChange={e => setCompany({ ...company, taxOffice: e.target.value })}
              />
            </div>

            <div className="form-group">
              <label className="form-label required">Vergi Numarası (VKN / TCKN)</label>
              <input
                type="text"
                className="form-input"
                value={company.taxNumber}
                onChange={e => setCompany({ ...company, taxNumber: e.target.value })}
              />
            </div>

            <div className="form-group">
              <label className="form-label required">Telefon</label>
              <input
                type="text"
                className="form-input"
                value={company.phone}
                onChange={e => setCompany({ ...company, phone: e.target.value })}
              />
            </div>
          </div>

          <div className="form-grid-3">
            <div className="form-group">
              <label className="form-label">E-Posta</label>
              <input
                type="email"
                className="form-input"
                value={company.email}
                onChange={e => setCompany({ ...company, email: e.target.value })}
              />
            </div>

            <div className="form-group">
              <label className="form-label">İl</label>
              <input
                type="text"
                className="form-input"
                value={company.city}
                onChange={e => setCompany({ ...company, city: e.target.value })}
              />
            </div>

            <div className="form-group">
              <label className="form-label">İlçe</label>
              <input
                type="text"
                className="form-input"
                value={company.district}
                onChange={e => setCompany({ ...company, district: e.target.value })}
              />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Açık Adres</label>
            <textarea
              className="form-textarea"
              rows={2}
              value={company.address}
              onChange={e => setCompany({ ...company, address: e.target.value })}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '12px' }}>
            <button type="submit" className="btn btn-primary">
              <Save size={14} />
              <span>Firma Bilgilerini Kaydet</span>
            </button>
          </div>
        </form>
      )}

      {/* 2. NUMARATÖRLER */}
      {activeTab === 'SEQUENCES' && sequences && (
        <form onSubmit={handleSaveSequences} className="card-panel" style={{ padding: '20px' }}>
          <div style={{ marginBottom: '16px' }}>
            <h3 style={{ fontSize: '15px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Sliders size={18} color="var(--primary)" />
              <span>Otomatik Belge Numaralandırma Serileri</span>
            </h3>
            <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
              Sistemde oluşturulan tüm fatura, irsaliye, teklif, sipariş ve finansal belgelerin seri ön eklerini (Prefix) ve sayaçlarını buradan yönetebilirsiniz.
            </p>
          </div>

          {(() => {
            const sequenceMeta: Record<string, { label: string; icon: string; desc: string }> = {
              SALES_INVOICE: { label: 'Satış Faturası', icon: '📄', desc: 'Müşterilere kesilen satış faturaları' },
              PURCHASE_INVOICE: { label: 'Alış Faturası', icon: '📥', desc: 'Tedarikçilerden alınan faturalar' },
              SALES_QUOTE: { label: 'Satış Teklifi', icon: '📝', desc: 'Müşterilere verilen fiyat teklifleri' },
              PURCHASE_QUOTE: { label: 'Alış Teklifi', icon: '📑', desc: 'Tedarikçilerden alınan teklifler' },
              SALES_ORDER: { label: 'Satış Siparişi', icon: '🛒', desc: 'Alınan müşteri siparişleri' },
              PURCHASE_ORDER: { label: 'Alış / Tedarik Siparişi', icon: '📦', desc: 'Tedarikçilere iletilen siparişler' },
              WAYBILL: { label: 'Sevk İrsaliyesi', icon: '🚚', desc: 'Mal sevkiyat ve kabul irsaliyeleri' },
              EXPENSE: { label: 'Masraf & Gider Fişi', icon: '🧾', desc: 'Genel işletme ve harcama fişleri' },
              COLLECTION: { label: 'Tahsilat Makbuzu', icon: '💰', desc: 'Nakit ve banka tahsilat belgeleri' },
              PAYMENT: { label: 'Tediye / Ödeme Makbuzu', icon: '💳', desc: 'Cari ve tedarikçi ödeme makbuzları' },
              CASH_TX: { label: 'Kasa Hareket Fişi', icon: '💵', desc: 'Kasa içi giriş, çıkış ve virmanlar' },
              BANK_TX: { label: 'Banka Dekont / Transfer', icon: '🏦', desc: 'Banka hesap transfer hareketleri' },
              CHECK: { label: 'Çek / Senet Bordrosu', icon: '📜', desc: 'Portföy çek ve senet kayıtları' },
              COST_CENTER: { label: 'Masraf Merkezi Kodu', icon: '🏢', desc: 'Departman ve proje kodlamaları' },
            };

            const currentYear = new Date().getFullYear();

            return (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '14px' }}>
                {Object.keys(sequences).map(key => {
                  const meta = sequenceMeta[key] || { label: key, icon: '📋', desc: 'Otomatik numara serisi' };
                  const seq = sequences[key];
                  const prefix = seq?.prefix || '';
                  const lastNum = Number(seq?.lastNumber || 0);
                  const length = Number(seq?.length || 6);
                  const nextPreview = `${prefix}-${currentYear}-${String(lastNum + 1).padStart(length, '0')}`;

                  return (
                    <div
                      key={key}
                      style={{
                        border: '1px solid var(--border-color)',
                        borderRadius: '8px',
                        padding: '14px',
                        background: 'var(--bg-surface-secondary)',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                        gap: '10px',
                      }}
                    >
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                          <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span style={{ fontSize: '16px' }}>{meta.icon}</span>
                            <span>{meta.label}</span>
                          </div>
                          <span style={{ fontSize: '10px', color: 'var(--text-light)', fontFamily: 'var(--font-mono)' }}>{key}</span>
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '8px' }}>
                          {meta.desc}
                        </div>

                        {/* Canlı Numara Önizlemesi */}
                        <div style={{
                          padding: '6px 10px',
                          background: 'var(--bg-surface)',
                          borderRadius: '6px',
                          border: '1px solid var(--border-light)',
                          fontSize: '11px',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          marginBottom: '10px',
                        }}>
                          <span style={{ color: 'var(--text-muted)' }}>Sıradaki No:</span>
                          <strong style={{ color: 'var(--primary)', fontFamily: 'var(--font-mono)', fontSize: '12px' }}>
                            {nextPreview}
                          </strong>
                        </div>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                        <div className="form-group" style={{ margin: 0 }}>
                          <label className="form-label" style={{ fontSize: '11px' }}>Seri Ön Eki</label>
                          <input
                            type="text"
                            className="form-input"
                            // 2026-09-13 (tasarım sadeleştirmesi): textTransform: uppercase kaldırıldı (tüm-büyük harf yasak).
                            style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}
                            value={seq.prefix || ''}
                            onChange={e => setSequences({
                              ...sequences,
                              [key]: { ...sequences[key], prefix: e.target.value.toUpperCase() }
                            })}
                          />
                        </div>
                        <div className="form-group" style={{ margin: 0 }}>
                          <label className="form-label" style={{ fontSize: '11px' }}>Son Sayaç Değeri</label>
                          <input
                            type="number"
                            min={0}
                            className="form-input"
                            style={{ fontFamily: 'var(--font-mono)' }}
                            value={seq.lastNumber ?? 0}
                            onChange={e => setSequences({
                              ...sequences,
                              [key]: { ...sequences[key], lastNumber: Number(e.target.value) }
                            })}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })()}

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '16px' }}>
            <button type="submit" className="btn btn-primary">
              <Save size={14} />
              <span>Numaratörleri Kaydet</span>
            </button>
          </div>
        </form>
      )}

      {/* 3. YEDEKLEME */}
      {activeTab === 'BACKUP' && (
        <div className="card-panel" style={{ padding: '20px' }}>
          <h3 style={{ fontSize: '15px', fontWeight: 700, marginBottom: '8px' }}>Veritabanı Güvenliği & Manuel Yedekleme</h3>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '16px' }}>
            Tüm cariler, faturalar, stok hareketleri, kasa ve banka kayıtları tek tıklama ile tarih-saat etiketli olarak JSON formatında yedeklenir.
          </p>

          <div style={{ display: 'flex', gap: '12px' }}>
            <button className="btn btn-primary btn-lg" onClick={handleCreateBackup}>
              <Download size={18} />
              <span>Şimdi Tam Veritabanı Yedeği Al (JSON Snapshot)</span>
            </button>
          </div>
        </div>
      )}

      {/* 4. AUDIT LOGLAR */}
      {activeTab === 'AUDIT_LOGS' && (
        <DataGrid
          columns={auditColumns}
          data={auditLogs}
          searchPlaceholder="Kullanıcı, modül, belge no veya detay ara..."
        />
      )}

      {/* 5. SİSTEM & YAZICI TERCİHLERİ */}
      {activeTab === 'SYSTEM' && systemSettings && (
        <form onSubmit={handleSaveSystemSettings} className="card-panel" style={{ padding: '20px' }}>
          <h3 style={{ fontSize: '15px', fontWeight: 700, marginBottom: '16px' }}>Yazıcı ve Sistem Tercihleri</h3>
          
          <div className="form-group">
            <label className="form-label">Varsayılan Satış Yazıcısı</label>
            <select
              className="form-select"
              value={systemSettings.printerType}
              onChange={e => setSystemSettings({ ...systemSettings, printerType: e.target.value })}
            >
              <option value="THERMAL_80MM">80mm Termal POS Fiş Yazıcısı</option>
              <option value="A4_INVOICE">A4 Lazer / Mürekkepli Fatura Yazıcısı</option>
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">Fiş Üst Bilgi Başlığı (Header)</label>
            <textarea
              className="form-textarea"
              rows={3}
              value={systemSettings.receiptHeader}
              onChange={e => setSystemSettings({ ...systemSettings, receiptHeader: e.target.value })}
            />
          </div>

          <div className="form-group">
            <label className="form-label">Fiş Alt Bilgi Notu (Footer)</label>
            <textarea
              className="form-textarea"
              rows={2}
              value={systemSettings.receiptFooter}
              onChange={e => setSystemSettings({ ...systemSettings, receiptFooter: e.target.value })}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '12px' }}>
            <button type="submit" className="btn btn-primary">
              <Save size={14} />
              <span>Ayarları Kaydet</span>
            </button>
          </div>
        </form>
      )}

      {/* Firma Amblemi / Logo Modalı */}
      <CompanyLogoModal
        isOpen={isLogoModalOpen}
        onClose={() => setIsLogoModalOpen(false)}
        currentLogoUrl={company?.logoUrl}
        onLogoUpdated={(newUrl) => {
          if (company) setCompany({ ...company, logoUrl: newUrl });
        }}
      />
    </div>
  );
};

// ─── Kayıtlı Form Tasarımları Tablosu Bileşeni ──────────────────────────────
interface FormDesignsListTableProps {
  onEdit: (id: string) => void;
}

const FormDesignsListTable: React.FC<FormDesignsListTableProps> = ({ onEdit }) => {
  const { showToast } = useToast();
  const [designs, setDesigns] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDesigns();
  }, []);

  const loadDesigns = async () => {
    setLoading(true);
    try {
      const res = await api.getFormDesigns();
      if (res.success) {
        setDesigns(res.formDesigns || []);
      }
    } catch (err: any) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleSetDefault = async (id: string) => {
    try {
      const res = await api.setDefaultFormDesign(id);
      if (res.success) {
        showToast('Varsayılan şablon güncellendi.', 'success');
        loadDesigns();
      }
    } catch (err: any) {
      showToast(err.message || 'Hata oluştu.', 'error');
    }
  };

  const handleDuplicate = async (id: string) => {
    try {
      const res = await api.duplicateFormDesign(id);
      if (res.success) {
        showToast('Şablon kopyalandı.', 'success');
        loadDesigns();
      }
    } catch (err: any) {
      showToast(err.message || 'Kopyalama hatası.', 'error');
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Bu form tasarımını silmek istediğinize emin misiniz?')) return;
    try {
      const res = await api.deleteFormDesign(id);
      if (res.success) {
        showToast('Tasarım silindi.', 'success');
        loadDesigns();
      }
    } catch (err: any) {
      showToast(err.message || 'Silme hatası.', 'error');
    }
  };

  const documentTypeMap: Record<string, string> = {
    INVOICE_SALES: 'Satış Faturası',
    INVOICE_PURCHASE: 'Alış Faturası',
    WAYBILL: 'İrsaliye',
    QUOTE: 'Teklif',
    ORDER: 'Sipariş',
    STATEMENT: 'Cari Ekstre',
    RECEIPT: 'Fiş / Makbuz',
  };

  const columns: Column<any>[] = [
    {
      key: 'name',
      title: 'Tasarım Adı',
      render: d => (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <FileText size={16} color="var(--primary)" />
          <div>
            <span style={{ fontWeight: 600 }}>{d.name}</span>
            {d.isDefault && (
              <span className="badge badge-success" style={{ marginLeft: '8px', fontSize: '9.5px' }}>
                ⭐ Varsayılan
              </span>
            )}
            {d.isBuiltIn && (
              <span className="badge badge-secondary" style={{ marginLeft: '4px', fontSize: '9.5px' }}>
                Sistem
              </span>
            )}
          </div>
        </div>
      ),
    },
    {
      key: 'documentType',
      title: 'Belge Türü',
      width: '140px',
      render: d => <span>{documentTypeMap[d.documentType] || d.documentType}</span>,
    },
    {
      key: 'paperSize',
      title: 'Boyut / Yön',
      width: '120px',
      render: d => <span>{d.paperSize} ({d.orientation === 'portrait' ? 'Dikey' : 'Yatay'})</span>,
    },
    {
      key: 'sections',
      title: 'Bölümler',
      width: '100px',
      render: d => <span>{d.sections?.length || 0} Bölüm</span>,
    },
    {
      key: 'updatedAt',
      title: 'Son Güncelleme',
      width: '130px',
      render: d => <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{new Date(d.updatedAt || d.createdAt).toLocaleDateString('tr-TR')}</span>,
    },
    {
      key: 'actions',
      title: 'İşlemler',
      width: '200px',
      render: d => (
        <div style={{ display: 'flex', gap: '4px' }}>
          <button
            className="btn btn-xs btn-primary"
            onClick={() => onEdit(d.id)}
            title="Form Tasarımcısında Düzenle"
          >
            <Edit size={12} />
            <span>Düzenle</span>
          </button>

          {!d.isDefault && (
            <button
              className="btn btn-xs btn-secondary"
              onClick={() => handleSetDefault(d.id)}
              title="Varsayılan Yap"
            >
              <Star size={12} />
            </button>
          )}

          <button
            className="btn btn-xs btn-secondary"
            onClick={() => handleDuplicate(d.id)}
            title="Kopyala"
          >
            <Copy size={12} />
          </button>

          {!d.isBuiltIn && (
            <button
              className="btn btn-xs btn-danger"
              onClick={() => handleDelete(d.id)}
              title="Sil"
            >
              <Trash2 size={12} />
            </button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div>
      <DataGrid
        data={designs}
        columns={columns}
        loading={loading}
        emptyMessage="Henüz kayıtlı özel form tasarımı bulunmuyor."
      />
    </div>
  );
};

