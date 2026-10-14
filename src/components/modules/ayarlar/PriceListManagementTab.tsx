/**
 * İŞBEY CLOUD — Fiyat Listesi Yönetimi
 * ====================================
 * 2026-10-12: İsimli satış fiyat listeleri (Perakende, Toptan, Bayi, Proje…).
 *
 * Bu ekran YALNIZCA liste TANIMLARINI yönetir (ad, kod, varsayılan iskonto,
 * varsayılan liste). Ürünlerin bu listelerdeki fiyatları ürün kartında
 * girilir; carinin hangi listeye bağlı olduğu cari kartında seçilir.
 *
 * Silme YOKTUR: liste pasife alınır. Kullanımdaki bir liste silinseydi ona
 * bağlı cariler ve ürün fiyatları sessizce anlamsız kalırdı.
 */

import React, { useState, useEffect } from 'react';
import { DataGrid } from '../../common/DataGrid';
import type { Column } from '../../common/DataGrid';
import type { PriceList } from '../../../types';
import { api } from '../../../services/api';
import { useToast } from '../../../context/ToastContext';
import { Modal } from '../../common/Modal';
import { Plus, Edit2, Star, Check, X } from 'lucide-react';

export const PriceListManagementTab: React.FC = () => {
  const { showToast } = useToast();

  const [priceLists, setPriceLists] = useState<PriceList[]>([]);
  const [loading, setLoading] = useState(true);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: '',
    code: '',
    description: '',
    defaultDiscountRate: 0,
    isDefault: false,
  });

  useEffect(() => {
    loadPriceLists();
  }, []);

  const loadPriceLists = async () => {
    setLoading(true);
    try {
      const res = await api.getPriceLists();
      if (res.success) setPriceLists(res.priceLists);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenNew = () => {
    setEditingId(null);
    setForm({ name: '', code: '', description: '', defaultDiscountRate: 0, isDefault: priceLists.length === 0 });
    setIsModalOpen(true);
  };

  const handleOpenEdit = (list: PriceList) => {
    setEditingId(list.id);
    setForm({
      name: list.name,
      code: list.code,
      description: list.description || '',
      defaultDiscountRate: list.defaultDiscountRate || 0,
      isDefault: Boolean(list.isDefault),
    });
    setIsModalOpen(true);
  };

  const handleSubmit = async () => {
    if (!form.name.trim()) {
      showToast('Fiyat listesi adı zorunludur.', 'warning');
      return;
    }

    try {
      const res = editingId
        ? await api.updatePriceList(editingId, form)
        : await api.createPriceList(form);

      if (res.success) {
        showToast(res.message, 'success');
        setIsModalOpen(false);
        loadPriceLists();
      }
    } catch (err: any) {
      showToast(err.message || 'Fiyat listesi kaydedilemedi.', 'error');
    }
  };

  const handleDeactivate = async (list: PriceList) => {
    try {
      const res = await api.deletePriceList(list.id);
      if (res.success) {
        showToast(res.message, 'success');
        loadPriceLists();
      }
    } catch (err: any) {
      showToast(err.message || 'Fiyat listesi pasife alınamadı.', 'error');
    }
  };

  const handleActivate = async (list: PriceList) => {
    try {
      const res = await api.updatePriceList(list.id, { active: true });
      if (res.success) {
        showToast('Fiyat listesi yeniden etkinleştirildi.', 'success');
        loadPriceLists();
      }
    } catch (err: any) {
      showToast(err.message || 'Fiyat listesi etkinleştirilemedi.', 'error');
    }
  };

  const columns: Column<PriceList>[] = [
    {
      key: 'name',
      title:'Liste Adı',
      render: (row) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ fontWeight: 600 }}>{row.name}</span>
          {row.isDefault && (
            <span
              title="Varsayılan liste — caride liste seçilmemişse bu kullanılır"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '3px',
                fontSize: 'var(--fs-2xs)',
                padding: '1px 6px',
                borderRadius: '10px',
                background: 'var(--primary-light)',
                color: 'var(--primary)',
                fontWeight: 600,
              }}
            >
              <Star size={10} /> Varsayılan
            </span>
          )}
        </div>
      ),
    },
    {
      key: 'code',
      title:'Kod',
      render: (row) => <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-xs)' }}>{row.code}</span>,
    },
    {
      key: 'defaultDiscountRate',
      title:'Varsayılan İskonto',
      align: 'right',
      render: (row) => (
        <span>{row.defaultDiscountRate ? `%${row.defaultDiscountRate}` : '—'}</span>
      ),
    },
    {
      key: 'description',
      title:'Açıklama',
      render: (row) => (
        <span style={{ color: 'var(--text-muted)', fontSize: 'var(--fs-xs)' }}>{row.description || '—'}</span>
      ),
    },
    {
      key: 'active',
      title:'Durum',
      render: (row) =>
        row.active !== false ? (
          <span style={{ color: 'var(--success)', display: 'inline-flex', alignItems: 'center', gap: '3px', fontSize: 'var(--fs-xs)' }}>
            <Check size={12} /> Etkin
          </span>
        ) : (
          <span style={{ color: 'var(--text-light)', display: 'inline-flex', alignItems: 'center', gap: '3px', fontSize: 'var(--fs-xs)' }}>
            <X size={12} /> Pasif
          </span>
        ),
    },
    {
      key: 'actions',
      title:'İşlem',
      render: (row) => (
        <div style={{ display: 'flex', gap: '4px' }}>
          <button className="btn btn-secondary btn-sm" onClick={() => handleOpenEdit(row)} title="Düzenle">
            <Edit2 size={12} />
          </button>
          {row.active !== false ? (
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => handleDeactivate(row)}
              title="Pasife al (silinmez — bağlı cariler korunur)"
            >
              <X size={12} />
            </button>
          ) : (
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => handleActivate(row)}
              title="Yeniden etkinleştir"
            >
              <Check size={12} />
            </button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px', gap: '12px', flexWrap: 'wrap' }}>
        <div>
          <h3 style={{ margin: 0, fontSize: 'var(--fs-md)' }}>Satış Fiyat Listeleri</h3>
          <p style={{ margin: '3px 0 0 0', fontSize: 'var(--fs-xs)', color: 'var(--text-muted)' }}>
            Perakende, Toptan, Bayi gibi isimli fiyat listeleri tanımlayın. Ürün fiyatlarını ürün kartında,
            carinin listesini cari kartında seçersiniz. Liste yoksa ürünün taban satış fiyatı kullanılır.
          </p>
        </div>
        <button className="btn btn-primary btn-sm" onClick={handleOpenNew}>
          <Plus size={13} /> Yeni Liste
        </button>
      </div>

      <DataGrid
        columns={columns}
        data={priceLists}
        rowKey="id"
        loading={loading}
        emptyMessage="Henüz fiyat listesi tanımlanmadı. Örn. Perakende, Toptan, Bayi."
        pageSize={15}
      />

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingId ? 'Fiyat Listesi Düzenle' : 'Yeni Fiyat Listesi'}
        size="medium"
        footer={
          <>
            <button type="button" className="btn btn-secondary" onClick={() => setIsModalOpen(false)}>
              İptal
            </button>
            <button type="button" className="btn btn-primary" onClick={handleSubmit}>
              {editingId ? 'Güncelle' : 'Kaydet'}
            </button>
          </>
        }
      >
        <div className="form-group">
          <label className="form-label required">Liste Adı</label>
          <input
            type="text"
            className="form-input"
            placeholder="Örn: Toptan"
            value={form.name}
            onChange={e => setForm({ ...form, name: e.target.value })}
          />
        </div>

        <div className="form-grid-2">
          <div className="form-group">
            <label className="form-label">Liste Kodu</label>
            <input
              type="text"
              className="form-input"
              placeholder="Otomatik: FL-00X"
              value={form.code}
              onChange={e => setForm({ ...form, code: e.target.value })}
            />
          </div>

          <div className="form-group">
            <label className="form-label">Varsayılan İskonto (%)</label>
            <input
              type="number"
              step="0.01"
              min="0"
              max="100"
              className="form-input"
              value={form.defaultDiscountRate}
              onChange={e => setForm({ ...form, defaultDiscountRate: Number(e.target.value) })}
            />
          </div>
        </div>

        <div className="form-group">
          <label className="form-label">Açıklama</label>
          <textarea
            className="form-textarea"
            rows={2}
            placeholder="Bu listenin kimler için geçerli olduğu"
            value={form.description}
            onChange={e => setForm({ ...form, description: e.target.value })}
          />
        </div>

        <div className="form-group">
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={form.isDefault}
              onChange={e => setForm({ ...form, isDefault: e.target.checked })}
            />
            <span className="form-label" style={{ margin: 0 }}>
              Varsayılan liste (caride liste seçilmemişse bu kullanılır)
            </span>
          </label>
        </div>
      </Modal>
    </div>
  );
};
