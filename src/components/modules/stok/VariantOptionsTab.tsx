/**
 * İŞBEY CLOUD — Varyant Özellikleri (Ürünler > Varyantlar)
 * ======================================================
 * 2026-10-12: Renk, Ebat, Malzeme gibi varyant ÖZELLİKLERİ ve değerleri
 * (Kırmızı/Mavi, S/M/L). Ürün kartı bu tanımları kullanır; değer kimlikleri
 * varyant atıflarında saklanır.
 *
 * Silme YOKTUR: özellik pasife alınır (ürünlerdeki atıflar kopmasın).
 * Düzenlemede mevcut değerin KİMLİĞİ korunur (ad değişse bile atıf yaşar);
 * listede olmayan eski değer sessizce SİLİNMEZ.
 */

import React, { useState, useEffect } from 'react';
import { DataGrid } from '../../common/DataGrid';
import type { Column } from '../../common/DataGrid';
import type { VariantOption } from '../../../types';
import { api } from '../../../services/api';
import { useToast } from '../../../context/ToastContext';
import { Modal } from '../../common/Modal';
import { Plus, Edit2, Check, X, Trash2 } from 'lucide-react';

interface ValueDraft {
  id?: string;
  name: string;
  swatch: string;
}

export const VariantOptionsTab: React.FC = () => {
  const { showToast } = useToast();

  const [options, setOptions] = useState<VariantOption[]>([]);
  const [loading, setLoading] = useState(true);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [selectionType, setSelectionType] = useState<'SINGLE' | 'MULTI'>('SINGLE');
  const [values, setValues] = useState<ValueDraft[]>([{ name: '', swatch: '' }]);

  useEffect(() => {
    loadOptions();
  }, []);

  const loadOptions = async () => {
    setLoading(true);
    try {
      const res = await api.getVariantOptions();
      if (res.success) setOptions(res.variantOptions);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenNew = () => {
    setEditingId(null);
    setName('');
    setSelectionType('SINGLE');
    setValues([{ name: '', swatch: '' }]);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (option: VariantOption) => {
    setEditingId(option.id);
    setName(option.name);
    setSelectionType(option.selectionType || 'SINGLE');
    setValues(
      option.values.map(v => ({ id: v.id, name: v.name, swatch: v.swatch || '' }))
    );
    setIsModalOpen(true);
  };

  const updateValue = (index: number, patch: Partial<ValueDraft>) => {
    setValues(prev => prev.map((v, i) => (i === index ? { ...v, ...patch } : v)));
  };

  const addValueRow = () => {
    setValues(prev => [...prev, { name: '', swatch: '' }]);
  };

  const removeValueRow = (index: number) => {
    // Son satır silinemez (en az bir değer zorunlu).
    if (values.length <= 1) return;
    setValues(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    if (!name.trim()) {
      showToast('Özellik adı zorunludur (örn. Renk, Ebat).', 'warning');
      return;
    }
    const cleanValues = values
      .map(v => ({ id: v.id, name: v.name.trim(), swatch: v.swatch.trim() || undefined }))
      .filter(v => v.name);
    if (cleanValues.length === 0) {
      showToast('En az bir değer girin (örn. Kırmızı, Mavi).', 'warning');
      return;
    }

    try {
      // `id` alanı sunucuya "mevcut değeri yerinde güncelle" demek içindir;
      // yeni değerlerde `id` YOKTUR (sunucu üretir). Gövde tipi kısmi tutulur
      // (sunucu `sanitizeValues` ile temizler).
      const payloadValues: Array<{ id?: string; name: string; swatch?: string }> = cleanValues.map(
        v => (v.id ? { id: v.id, name: v.name, swatch: v.swatch } : { name: v.name, swatch: v.swatch })
      );
      const res = editingId
        ? await api.updateVariantOption(editingId, { name: name.trim(), selectionType, values: payloadValues })
        : await api.createVariantOption({ name: name.trim(), selectionType, values: payloadValues });

      if (res.success) {
        showToast(res.message, 'success');
        setIsModalOpen(false);
        loadOptions();
      }
    } catch (err: any) {
      showToast(err.message || 'Varyant özelliği kaydedilemedi.', 'error');
    }
  };

  const handleDeactivate = async (option: VariantOption) => {
    try {
      const res = await api.deleteVariantOption(option.id);
      if (res.success) {
        showToast(res.message, 'success');
        loadOptions();
      }
    } catch (err: any) {
      showToast(err.message || 'Özellik pasife alınamadı.', 'error');
    }
  };

  const handleActivate = async (option: VariantOption) => {
    try {
      const res = await api.updateVariantOption(option.id, { active: true });
      if (res.success) {
        showToast('Özellik yeniden etkinleştirildi.', 'success');
        loadOptions();
      }
    } catch (err: any) {
      showToast(err.message || 'Özellik etkinleştirilemedi.', 'error');
    }
  };

  const columns: Column<VariantOption>[] = [
    {
      key: 'name',
      title: 'Özellik',
      render: (row) => <span style={{ fontWeight: 600 }}>{row.name}</span>,
    },
    {
      key: 'values',
      title: 'Değerler',
      render: (row) => (
        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
          {row.values.map(v => (
            <span
              key={v.id}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                fontSize: 'var(--fs-xs)',
                padding: '1px 7px',
                borderRadius: '10px',
                background: 'var(--bg-surface-hover)',
                color: 'var(--text-muted)',
              }}
            >
              {v.swatch && (
                <span
                  style={{
                    width: '10px',
                    height: '10px',
                    borderRadius: '50%',
                    background: v.swatch,
                    border: '1px solid var(--border-color)',
                    flexShrink: 0,
                  }}
                />
              )}
              {v.name}
            </span>
          ))}
        </div>
      ),
    },
    {
      key: 'active',
      title: 'Durum',
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
      title: 'İşlem',
      render: (row) => (
        <div style={{ display: 'flex', gap: '4px' }}>
          <button className="btn btn-secondary btn-sm" onClick={() => handleOpenEdit(row)} title="Düzenle">
            <Edit2 size={12} />
          </button>
          {row.active !== false ? (
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => handleDeactivate(row)}
              title="Pasife al (silinmez — ürünlerdeki atıflar korunur)"
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
          <h3 style={{ margin: 0, fontSize: 'var(--fs-md)' }}>Varyant Özellikleri</h3>
          <p style={{ margin: '3px 0 0 0', fontSize: 'var(--fs-xs)', color: 'var(--text-muted)' }}>
            Renk, Ebat, Malzeme gibi özellikleri ve değerlerini tanımlayın. Ürün kartında bu
            özellikler seçilir, kombinasyonlar varyant olur. Özellik silinmez, pasife alınır.
          </p>
        </div>
        <button className="btn btn-primary btn-sm" onClick={handleOpenNew}>
          <Plus size={13} /> Yeni Özellik
        </button>
      </div>

      <DataGrid
        columns={columns}
        data={options}
        rowKey="id"
        loading={loading}
        emptyMessage="Henüz varyant özelliği tanımlanmadı. Örn. Renk (Kırmızı, Mavi), Ebat (S, M, L)."
        pageSize={15}
      />

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingId ? 'Varyant Özelliği Düzenle' : 'Yeni Varyant Özelliği'}
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
        <div className="form-grid-2">
          <div className="form-group">
            <label className="form-label required">Özellik Adı</label>
            <input
              type="text"
              className="form-input"
              placeholder="Örn: Renk"
              value={name}
              onChange={e => setName(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label className="form-label">Seçim Türü</label>
            <select
              className="form-select"
              value={selectionType}
              onChange={e => setSelectionType(e.target.value as 'SINGLE' | 'MULTI')}
            >
              <option value="SINGLE">Tek seçim (Renk, Ebat)</option>
              <option value="MULTI">Çoklu seçim (Ekstra malzeme)</option>
            </select>
          </div>
        </div>

        <div className="form-group">
          <label className="form-label required">Değerler</label>
          {values.map((v, i) => (
            <div key={i} style={{ display: 'flex', gap: '6px', marginBottom: '6px', alignItems: 'center' }}>
              {/* Renkler için görsel ipucu (hex); diğer özelliklerde boş bırakılır. */}
              <input
                type="color"
                title="Renk örneği (isteğe bağlı)"
                value={/^#[0-9a-fA-F]{6}$/.test(v.swatch) ? v.swatch : '#d12131'}
                onChange={e => updateValue(i, { swatch: e.target.value })}
                style={{ width: '30px', height: '30px', padding: 0, border: '1px solid var(--border-color)', borderRadius: '6px', cursor: 'pointer', flexShrink: 0 }}
              />
              <input
                type="text"
                className="form-input"
                placeholder={i === 0 ? 'Örn: Kırmızı' : 'Değer adı'}
                value={v.name}
                onChange={e => updateValue(i, { name: e.target.value })}
              />
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => removeValueRow(i)}
                disabled={values.length <= 1}
                title="Değeri kaldır"
              >
                <Trash2 size={12} />
              </button>
            </div>
          ))}
          <button type="button" className="btn btn-secondary btn-sm" onClick={addValueRow}>
            <Plus size={12} /> Değer Ekle
          </button>
          <span style={{ display: 'block', marginTop: '6px', fontSize: 'var(--fs-2xs)', color: 'var(--text-muted)' }}>
            Kayıtlı değer adı değişse bile ürünlerdeki atıf korunur. Listede olmayan eski değer silinmez.
          </span>
        </div>
      </Modal>
    </div>
  );
};
