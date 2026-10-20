/**
 * İŞBEY CLOUD — ORTAK RAPOR FİLTRE ÇUBUĞU (2026-10-17)
 * =====================================================
 * Cari / stok / kasa-banka detay raporlarının ÜÇÜ de aynı filtre çubuğunu
 * kullanır. Böylece "kapsamlı filtre" tek yerde yaşar; ekranlar arasında
 * davranış farkı (birinde tarih var, öbüründe yok) oluşmaz.
 *
 * GÖRÜNÜRLÜK: Her sekmeye yalnız ANLAMLI filtre kutusu gösterilir.
 *   CARI      → tarih, cari, durum, tutar, arama
 *   STOK      → ürün, varyant, depo, durum, tutar, arama
 *   KASA_BANKA→ tarih, kasa, banka, belge tipi, tutar
 *
 * Hata politikası: geçersiz filtre SESSİZCE yutulmaz; çubuğun altında kırmızı
 * uyarı çıkar ve "Filtrele" düğmesi pasifleşir.
 */
import React, { useState } from 'react';
import { Search, X, AlertCircle, ChevronDown, ChevronUp, SlidersHorizontal } from 'lucide-react';
import {
  DOC_TYPE_LABELS, EMPTY_REPORT_FILTERS, STATUS_LABELS,
  hasAnyFilter, toQueryParams, validateFilters,
} from './reportFilterTypes';
import type { ReportFilterOptions, ReportFilterState } from './reportFilterTypes';

export type ReportScope = 'CARI' | 'STOK' | 'KASA_BANKA';

interface Props {
  scope: ReportScope;
  filters: ReportFilterState;
  onChange: (next: ReportFilterState) => void;
  options: ReportFilterOptions;
  onApply: () => void;
  onReset: () => void;
  loading?: boolean;
}

/** Çoklu seçim kutusu: seçili değerleri etiketle gösterir. */
const MultiSelect: React.FC<{
  label: string;
  items: { id: string; label: string }[];
  selected: string[];
  onChange: (ids: string[]) => void;
  width?: number;
}> = ({ label, items, selected, onChange, width = 190 }) => {
  const [open, setOpen] = useState(false);
  const summary = selected.length === 0 ? 'Tümü'
    : selected.length === 1 ? (items.find(i => i.id === selected[0])?.label || '1 seçim')
    : `${selected.length} seçim`;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', position: 'relative' }}>
      <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)' }}>{label}</span>
      <button
        type="button"
        className="btn btn-secondary btn-sm"
        onClick={() => setOpen(o => !o)}
        style={{ width: `${width}px`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '6px' }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{summary}</span>
        {open ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
      </button>
      {open && (
        <div
          style={{
            position: 'absolute', top: '100%', left: 0, zIndex: 40, marginTop: '4px',
            background: 'var(--bg-card, #fff)', border: '1px solid var(--border-color, #e2e8f0)',
            borderRadius: '6px', boxShadow: '0 8px 24px rgba(0,0,0,.14)',
            maxHeight: '230px', overflowY: 'auto', minWidth: `${width}px`, padding: '4px',
          }}
        >
          {items.length === 0 && (
            <div style={{ padding: '8px', fontSize: '12px', color: 'var(--text-muted)' }}>Kayıt yok</div>
          )}
          {items.map(item => {
            const checked = selected.includes(item.id);
            return (
              <label
                key={item.id}
                style={{ display: 'flex', alignItems: 'center', gap: '7px', padding: '5px 7px', fontSize: '12px', cursor: 'pointer', borderRadius: '4px' }}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => onChange(checked ? selected.filter(s => s !== item.id) : [...selected, item.id])}
                />
                <span>{item.label}</span>
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
};

export const ReportFilterBar: React.FC<Props> = ({
  scope, filters, onChange, options, onApply, onReset, loading = false,
}) => {
  const [expanded, setExpanded] = useState(true);
  const error = validateFilters(filters);
  const active = hasAnyFilter(filters);
  const appliedCount = Object.keys(toQueryParams(filters)).length;

  const set = <K extends keyof ReportFilterState>(key: K, value: ReportFilterState[K]) =>
    onChange({ ...filters, [key]: value });

  const showDates = scope !== 'STOK';
  const showSearch = scope !== 'KASA_BANKA';

  return (
    <div
      style={{
        border: '1px solid var(--border-color, #e2e8f0)', borderRadius: '8px',
        padding: '10px 12px', background: 'var(--bg-card, #fff)',
        display: 'flex', flexDirection: 'column', gap: '8px',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <SlidersHorizontal size={15} />
          <span style={{ fontSize: '13px', fontWeight: 700 }}>Kapsamlı Filtreler</span>
          {appliedCount > 0 && (
            <span className="badge badge-info" style={{ fontSize: '10px' }}>{appliedCount} aktif</span>
          )}
        </div>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setExpanded(e => !e)}>
          {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          <span>{expanded ? 'Gizle' : 'Göster'}</span>
        </button>
      </div>

      {expanded && (
        <>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
            {showDates && (
              <>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                  <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)' }}>Başlangıç</span>
                  <input
                    type="date" className="form-input" style={{ width: '150px', padding: '4px 8px', fontSize: '12px' }}
                    value={filters.startDate} onChange={e => set('startDate', e.target.value)}
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                  <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)' }}>Bitiş</span>
                  <input
                    type="date" className="form-input" style={{ width: '150px', padding: '4px 8px', fontSize: '12px' }}
                    value={filters.endDate} onChange={e => set('endDate', e.target.value)}
                  />
                </div>
              </>
            )}

            {scope === 'CARI' && (
              <>
                <MultiSelect
                  label="Cari" items={options.customers.map(c => ({ id: c.id, label: `${c.code} — ${c.title}` }))}
                  selected={filters.customerIds} onChange={ids => set('customerIds', ids)}
                />
                <MultiSelect
                  label="Durum" items={options.statuses.map(s => ({ id: s, label: STATUS_LABELS[s] || s }))}
                  selected={filters.statuses} onChange={ids => set('statuses', ids)} width={150}
                />
              </>
            )}

            {scope === 'STOK' && (
              <>
                <MultiSelect
                  label="Ürün" items={options.products.map(p => ({ id: p.id, label: `${p.code} — ${p.name}` }))}
                  selected={filters.productIds} onChange={ids => set('productIds', ids)}
                />
                <MultiSelect
                  label="Varyant"
                  items={options.variants.map(v => ({ id: v.id, label: `${v.productName} / ${v.name}` }))}
                  selected={filters.variantIds} onChange={ids => set('variantIds', ids)}
                />
                <MultiSelect
                  label="Depo" items={options.warehouses.map(w => ({ id: w.id, label: `${w.code} — ${w.name}` }))}
                  selected={filters.warehouseIds} onChange={ids => set('warehouseIds', ids)} width={170}
                />
                <MultiSelect
                  label="Durum" items={[{ id: 'ACTIVE', label: 'Aktif' }, { id: 'PASSIVE', label: 'Pasif' }]}
                  selected={filters.statuses} onChange={ids => set('statuses', ids)} width={130}
                />
              </>
            )}

            {scope === 'KASA_BANKA' && (
              <>
                <MultiSelect
                  label="Kasa" items={options.cashRegisters.map(c => ({ id: c.id, label: `${c.code || ''} ${c.name}`.trim() }))}
                  selected={filters.cashRegisterIds} onChange={ids => set('cashRegisterIds', ids)} width={170}
                />
                <MultiSelect
                  label="Banka" items={options.bankAccounts.map(b => ({ id: b.id, label: `${b.bankName || ''} ${b.name}`.trim() }))}
                  selected={filters.bankAccountIds} onChange={ids => set('bankAccountIds', ids)} width={190}
                />
                <MultiSelect
                  label="Belge Tipi" items={options.types.map(t => ({ id: t, label: DOC_TYPE_LABELS[t] || t }))}
                  selected={filters.types} onChange={ids => set('types', ids)} width={190}
                />
              </>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
              <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)' }}>Alt Tutar</span>
              <input
                type="number" className="form-input" placeholder="0" style={{ width: '110px', padding: '4px 8px', fontSize: '12px' }}
                value={filters.minAmount} onChange={e => set('minAmount', e.target.value)}
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
              <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)' }}>Üst Tutar</span>
              <input
                type="number" className="form-input" placeholder="—" style={{ width: '110px', padding: '4px 8px', fontSize: '12px' }}
                value={filters.maxAmount} onChange={e => set('maxAmount', e.target.value)}
              />
            </div>

            {showSearch && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)' }}>Arama</span>
                <div style={{ position: 'relative' }}>
                  <Search size={13} style={{ position: 'absolute', left: '8px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                  <input
                    className="form-input" placeholder={scope === 'CARI' ? 'Kod veya ünvan' : 'Kod veya ad'}
                    style={{ width: '180px', padding: '4px 8px 4px 26px', fontSize: '12px' }}
                    value={filters.search} onChange={e => set('search', e.target.value)}
                  />
                </div>
              </div>
            )}

            <div style={{ display: 'flex', gap: '6px', marginLeft: 'auto' }}>
              <button
                type="button" className="btn btn-secondary btn-sm"
                onClick={onReset} disabled={!active}
              >
                <X size={13} />
                <span>Temizle</span>
              </button>
              <button
                type="button" className="btn btn-primary btn-sm"
                onClick={onApply} disabled={loading || !!error}
              >
                <Search size={13} />
                <span>{loading ? 'Yükleniyor...' : 'Filtrele'}</span>
              </button>
            </div>
          </div>

          {error && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#ef4444', fontSize: '12px' }}>
              <AlertCircle size={14} />
              <span>{error}</span>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export { EMPTY_REPORT_FILTERS };
