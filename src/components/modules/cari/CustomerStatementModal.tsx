import React, { useState, useEffect } from 'react';
import { Modal } from '../../common/Modal';
import type { Customer } from '../../../types';
import { api } from '../../../services/api';

import { useApp } from '../../../context/AppContext';
import { Printer, RefreshCw, Download } from 'lucide-react';

interface CustomerStatementModalProps {
  isOpen: boolean;
  onClose: () => void;
  customer: Customer | null;
}

export const CustomerStatementModal: React.FC<CustomerStatementModalProps> = ({ isOpen, onClose, customer }) => {
  const { openPrintModal } = useApp();
  const [statement, setStatement] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen && customer) {
      loadStatement(customer.id);
    }
  }, [isOpen, customer]);

  const loadStatement = async (id: string) => {
    setLoading(true);
    try {
      const res = await api.getCustomerStatement(id);
      if (res.success) {
        setStatement(res.statement);
        setSummary(res.summary);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  if (!customer) return null;

  const handlePrint = () => {
    openPrintModal('STATEMENT', `${customer.title} - Cari Ekstre`, {
      customer,
      statement,
      summary,
    });
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Cari Hesap Ekstresi: ${customer.title} (${customer.code})`}
      size="full"
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Kapat
          </button>
          <button type="button" className="btn btn-primary" onClick={handlePrint}>
            <Printer size={14} />
            <span>Yazdır / PDF Önizle</span>
          </button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {/* Customer Mini Info Bar */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', background: 'var(--bg-surface-secondary)', padding: '14px 16px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
          <div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Cari Ünvan:</div>
            <div style={{ fontSize: '13px', fontWeight: 700 }}>{customer.title}</div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Tel: {customer.phone}</div>
          </div>
          <div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Toplam Borç (Bizim Alacağımız):</div>
            <div style={{ fontSize: '15px', fontWeight: 700, color: '#0284c7' }}>
              {(customer.totalDebit || 0).toLocaleString('tr-TR')} ₺
            </div>
          </div>
          <div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Toplam Alacak (Ödemeler/Alış):</div>
            <div style={{ fontSize: '15px', fontWeight: 700, color: '#10b981' }}>
              {(customer.totalCredit || 0).toLocaleString('tr-TR')} ₺
            </div>
          </div>
          <div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Net Güncel Bakiye:</div>
            <div style={{ fontSize: '16px', fontWeight: 800, color: customer.balance > 0 ? '#ef4444' : '#10b981' }}>
              {customer.balance.toLocaleString('tr-TR')} ₺ {customer.balance > 0 ? '(Müşteri Borçlu)' : '(Borcumuz Var)'}
            </div>
          </div>
        </div>

        {/* Statement Table */}
        <div style={{ border: '1px solid var(--border-color)', borderRadius: '8px', overflow: 'hidden' }}>
          <table className="datagrid-table" style={{ width: '100%' }}>
            <thead>
              <tr>
                <th>Tarih</th>
                <th>Belge No</th>
                <th>İşlem Türü</th>
                <th>Açıklama</th>
                <th style={{ textAlign: 'right' }}>Borç (₺)</th>
                <th style={{ textAlign: 'right' }}>Alacak (₺)</th>
                <th style={{ textAlign: 'right' }}>Kümülatif Bakiye (₺)</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: '30px' }}>
                    <RefreshCw size={20} className="animate-spin" /> Ekstre hesaplanıyor...
                  </td>
                </tr>
              ) : statement.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)' }}>
                    Bu cari hesaba ait hareket kaydı bulunamadı.
                  </td>
                </tr>
              ) : (
                statement.map((row, idx) => (
                  <tr key={idx}>
                    <td>{row.date}</td>
                    <td style={{ fontWeight: 600, color: 'var(--primary)' }}>{row.documentNo}</td>
                    <td>{row.documentType}</td>
                    <td>{row.description}</td>
                    <td style={{ textAlign: 'right', fontWeight: 600, color: row.debit > 0 ? '#0284c7' : 'inherit' }}>
                      {row.debit > 0 ? row.debit.toLocaleString('tr-TR', { minimumFractionDigits: 2 }) : '-'}
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 600, color: row.credit > 0 ? '#10b981' : 'inherit' }}>
                      {row.credit > 0 ? row.credit.toLocaleString('tr-TR', { minimumFractionDigits: 2 }) : '-'}
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 700 }}>
                      {row.runningBalance.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </Modal>
  );
};
