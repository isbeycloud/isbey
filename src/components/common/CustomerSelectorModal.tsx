import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Modal } from './Modal';
import type { Customer, CustomerType } from '../../types';
import { api } from '../../services/api';
import { useToast } from '../../context/ToastContext';
import { QuickCustomerCreateModal } from './QuickCustomerCreateModal';
import { Search, Plus, Check, User, Phone, Mail, Building, AlertTriangle, ShieldAlert } from 'lucide-react';

interface CustomerSelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (customer: Customer) => void;
  filterType?: CustomerType | 'ALL';
  title?: string;
}

export const CustomerSelectorModal: React.FC<CustomerSelectorModalProps> = ({
  isOpen,
  onClose,
  onSelect,
  filterType = 'ALL',
  title = '🏢 Cari Hesap & Muhatap Seçimi',
}) => {
  const { showToast } = useToast();

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);

  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>(filterType);
  const [balanceFilter, setBalanceFilter] = useState<'ALL' | 'DEBTORS' | 'CREDITORS'>('ALL');
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);

  const [isQuickCreateOpen, setIsQuickCreateOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      loadCustomers();
      setSearchQuery('');
      setSelectedCustomerId(null);
      setTypeFilter(filterType);
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 100);
    }
  }, [isOpen, filterType]);

  const loadCustomers = async () => {
    setLoading(true);
    try {
      const res = await api.getCustomers();
      if (res.success) {
        setCustomers(res.customers);
      }
    } catch (err) {
      console.error('Error loading customers:', err);
    } finally {
      setLoading(false);
    }
  };

  const filteredCustomers = useMemo(() => {
    let result = customers;

    if (typeFilter !== 'ALL') {
      result = result.filter(c => c.type === typeFilter || c.type === 'BOTH');
    }

    if (balanceFilter === 'DEBTORS') {
      result = result.filter(c => (c.balance || 0) > 0);
    } else if (balanceFilter === 'CREDITORS') {
      result = result.filter(c => (c.balance || 0) < 0);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().replace(/İ/g, 'i').replace(/I/g, 'ı').trim();
      
      result = result.filter(c => {
        const titleNorm = c.title.toLowerCase().replace(/İ/g, 'i').replace(/I/g, 'ı');
        const codeNorm = c.code.toLowerCase();
        
        // Direct matching
        if (titleNorm.includes(q) || codeNorm.includes(q)) return true;
        if (c.taxNumber && c.taxNumber.includes(q)) return true;
        if (c.phone && c.phone.includes(q)) return true;
        if (c.city && c.city.toLowerCase().includes(q)) return true;
        if (c.contactName && c.contactName.toLowerCase().includes(q)) return true;

        // Smart Acronym Matching (e.g. "ABTL" matches "Adana Bilgisayar Teknoloji Limited")
        const words = titleNorm.split(/[\s\-_\/,\.]+/).filter(w => w.length > 0);
        const initials = words.map(w => w[0]).join('');
        if (initials.includes(q) || initials.startsWith(q)) return true;

        // First word + initials (e.g. "ABCEL")
        if (words.length > 1) {
          const firstWordInit = words[0] + words.slice(1).map(w => w[0]).join('');
          if (firstWordInit.includes(q)) return true;
        }

        return false;
      });
    }

    return result;
  }, [customers, searchQuery, typeFilter, balanceFilter]);


  const handleSelect = (customer: Customer) => {
    if (customer.riskLimit && customer.balance > customer.riskLimit) {
      showToast(`Uyarı: "${customer.title}" carisinin risk limiti aşılmıştır! (Bakiye: ${customer.balance.toLocaleString('tr-TR')} ₺ / Limit: ${customer.riskLimit.toLocaleString('tr-TR')} ₺)`, 'warning');
    }
    onSelect(customer);
    onClose();
  };

  const handleQuickCreated = (newCustomer: Customer) => {
    setCustomers(prev => [newCustomer, ...prev]);
    handleSelect(newCustomer);
  };

  const selectedCustomerObj = customers.find(c => c.id === selectedCustomerId);

  return (
    <>
      <Modal isOpen={isOpen} onClose={onClose} title={title} size="large">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          
          {/* Top Search & Create Bar */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '10px', alignItems: 'center' }}>
            <div style={{ position: 'relative' }}>
              <Search size={16} color="var(--text-muted)" style={{ position: 'absolute', left: '10px', top: '10px' }} />
              <input
                ref={searchInputRef}
                type="text"
                className="form-input"
                style={{ paddingLeft: '32px' }}
                placeholder="Cari ünvanı, kodu, VKN/TCKN, telefon veya şehir ile ara... (F2)"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
              />
            </div>

            <button
              type="button"
              className="btn btn-primary"
              onClick={() => setIsQuickCreateOpen(true)}
              style={{ display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap' }}
            >
              <Plus size={16} />
              <span>+ Yeni Cari Ekle</span>
            </button>
          </div>

          {/* Filter Badges */}
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap', background: 'var(--bg-surface-secondary)', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)' }}>Cari Türü:</span>
              <div style={{ display: 'flex', gap: '4px' }}>
                <button
                  type="button"
                  className={`btn ${typeFilter === 'ALL' ? 'btn-primary' : 'btn-secondary'} btn-sm`}
                  style={{ padding: '2px 8px', fontSize: '11px' }}
                  onClick={() => setTypeFilter('ALL')}
                >
                  Tümü
                </button>
                <button
                  type="button"
                  className={`btn ${typeFilter === 'CUSTOMER' ? 'btn-primary' : 'btn-secondary'} btn-sm`}
                  style={{ padding: '2px 8px', fontSize: '11px' }}
                  onClick={() => setTypeFilter('CUSTOMER')}
                >
                  Müşteriler
                </button>
                <button
                  type="button"
                  className={`btn ${typeFilter === 'SUPPLIER' ? 'btn-primary' : 'btn-secondary'} btn-sm`}
                  style={{ padding: '2px 8px', fontSize: '11px' }}
                  onClick={() => setTypeFilter('SUPPLIER')}
                >
                  Tedarikçiler
                </button>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)' }}>Bakiye:</span>
              <div style={{ display: 'flex', gap: '4px' }}>
                <button
                  type="button"
                  className={`btn ${balanceFilter === 'ALL' ? 'btn-primary' : 'btn-secondary'} btn-sm`}
                  style={{ padding: '2px 8px', fontSize: '11px' }}
                  onClick={() => setBalanceFilter('ALL')}
                >
                  Tümü
                </button>
                <button
                  type="button"
                  className={`btn ${balanceFilter === 'DEBTORS' ? 'btn-danger' : 'btn-secondary'} btn-sm`}
                  style={{ padding: '2px 8px', fontSize: '11px' }}
                  onClick={() => setBalanceFilter('DEBTORS')}
                >
                  Borçlu Cariler
                </button>
              </div>
            </div>

            <div style={{ marginLeft: 'auto', fontSize: '12px', color: 'var(--text-muted)' }}>
              <strong>{filteredCustomers.length}</strong> cari listeleniyor
            </div>
          </div>

          {/* Risk Limit Warning Banner if selected customer exceeds risk limit */}
          {selectedCustomerObj && selectedCustomerObj.riskLimit > 0 && selectedCustomerObj.balance > selectedCustomerObj.riskLimit && (
            <div style={{ background: '#fef2f2', border: '1px solid #ef4444', borderRadius: '8px', padding: '8px 12px', display: 'flex', alignItems: 'center', gap: '10px', color: '#b91c1c', fontSize: '12px' }}>
              <ShieldAlert size={18} />
              <div>
                <strong>DİKKAT — Risk Limiti Aşılmış:</strong> {selectedCustomerObj.title} carisinin güncel bakiyesi ({selectedCustomerObj.balance.toLocaleString('tr-TR')} ₺), tanımlı risk limitinden ({selectedCustomerObj.riskLimit.toLocaleString('tr-TR')} ₺) fazladır!
              </div>
            </div>
          )}

          {/* Cariler Tablosu */}
          <div style={{ maxHeight: '380px', overflowY: 'auto', border: '1px solid var(--border-color)', borderRadius: '8px' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', textAlign: 'left' }}>
              <thead style={{ position: 'sticky', top: 0, background: 'var(--bg-surface-secondary)', borderBottom: '2px solid var(--border-color)', zIndex: 2 }}>
                <tr>
                  <th style={{ padding: '8px 10px', width: '90px' }}>Cari Kod</th>
                  <th style={{ padding: '8px 10px' }}>Ünvan / Ad Soyad</th>
                  <th style={{ padding: '8px 10px', width: '90px' }}>Tür</th>
                  <th style={{ padding: '8px 10px', width: '110px' }}>VKN / TCKN</th>
                  <th style={{ padding: '8px 10px', width: '110px' }}>Telefon</th>
                  <th style={{ padding: '8px 10px', width: '90px' }}>Şehir</th>
                  <th style={{ padding: '8px 10px', textAlign: 'right', width: '110px' }}>Bakiye</th>
                  <th style={{ padding: '8px 10px', textAlign: 'center', width: '70px' }}>Vade</th>
                  <th style={{ padding: '8px 10px', textAlign: 'center', width: '80px' }}>İşlem</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={9} style={{ padding: '30px', textAlign: 'center', color: 'var(--text-muted)' }}>
                      Cariler yükleniyor...
                    </td>
                  </tr>
                ) : filteredCustomers.length === 0 ? (
                  <tr>
                    <td colSpan={9} style={{ padding: '30px', textAlign: 'center', color: 'var(--text-muted)' }}>
                      <div>Aradığınız kriterlere uygun cari kart bulunamadı.</div>
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        style={{ marginTop: '10px' }}
                        onClick={() => setIsQuickCreateOpen(true)}
                      >
                        <Plus size={14} /> Yeni Cari Kart Ekle
                      </button>
                    </td>
                  </tr>
                ) : (
                  filteredCustomers.map(c => {
                    const isSelected = selectedCustomerId === c.id;
                    const bal = c.balance || 0;
                    const isDebit = bal > 0;
                    const isCredit = bal < 0;
                    const isRiskExceeded = c.riskLimit > 0 && bal > c.riskLimit;

                    return (
                      <tr
                        key={c.id}
                        onClick={() => setSelectedCustomerId(c.id)}
                        onDoubleClick={() => handleSelect(c)}
                        style={{
                          borderBottom: '1px solid var(--border-color)',
                          cursor: 'pointer',
                          backgroundColor: isSelected ? 'var(--primary-light)' : 'transparent',
                          transition: 'background-color 0.15s ease',
                        }}
                      >
                        <td style={{ padding: '8px 10px', fontWeight: 600, color: 'var(--primary)' }}>
                          {c.code}
                        </td>
                        <td style={{ padding: '8px 10px', fontWeight: 600 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span>{c.title}</span>
                            {isRiskExceeded && <span title="Risk Limiti Aşıldı" style={{ color: '#ef4444' }}>⚠️</span>}
                          </div>
                          {c.address && <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{c.address}</div>}
                        </td>
                        <td style={{ padding: '8px 10px' }}>
                          <span className={`badge ${c.type === 'CUSTOMER' ? 'badge-info' : c.type === 'SUPPLIER' ? 'badge-warning' : 'badge-success'}`}>
                            {c.type === 'CUSTOMER' ? 'Müşteri' : c.type === 'SUPPLIER' ? 'Tedarikçi' : 'Müş+Ted'}
                          </span>
                        </td>
                        <td style={{ padding: '8px 10px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                          {c.taxNumber || '-'}
                        </td>
                        <td style={{ padding: '8px 10px', color: 'var(--text-muted)' }}>
                          {c.phone || '-'}
                        </td>
                        <td style={{ padding: '8px 10px', color: 'var(--text-muted)' }}>
                          {c.city || '-'}
                        </td>
                        <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700, color: isDebit ? '#ef4444' : isCredit ? '#10b981' : 'var(--text-muted)' }}>
                          {bal.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺
                          <div style={{ fontSize: '9px', fontWeight: 400, color: 'var(--text-muted)' }}>
                            {isDebit ? '(Borçlu)' : isCredit ? '(Alacaklı)' : '(Sıfır)'}
                          </div>
                        </td>
                        <td style={{ padding: '8px 10px', textAlign: 'center', color: 'var(--text-muted)' }}>
                          {c.maturityDays || 30} gün
                        </td>
                        <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                          <button
                            type="button"
                            className="btn btn-primary btn-sm"
                            style={{ padding: '2px 8px', fontSize: '11px' }}
                            onClick={e => {
                              e.stopPropagation();
                              handleSelect(c);
                            }}
                          >
                            <Check size={12} /> Seç
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px', color: 'var(--text-muted)' }}>
            <span>💡 İpucu: Listeden bir cariye <strong>çift tıklayarak</strong> anında faturaya aktarabilirsiniz.</span>
            <button type="button" className="btn btn-secondary btn-sm" onClick={onClose}>
              Kapat
            </button>
          </div>
        </div>
      </Modal>

      {/* Hızlı Yeni Cari Ekle Modalı */}
      <QuickCustomerCreateModal
        isOpen={isQuickCreateOpen}
        onClose={() => setIsQuickCreateOpen(false)}
        onCustomerCreated={handleQuickCreated}
        initialTitle={searchQuery}
        defaultType={typeFilter === 'SUPPLIER' ? 'SUPPLIER' : 'CUSTOMER'}
      />
    </>
  );
};
