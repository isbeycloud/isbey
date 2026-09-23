import React, { useState, useMemo } from 'react';
import {
  Search,
  ChevronDown,
  ChevronUp,
  Download,
  Printer,
  SlidersHorizontal,
  PackageOpen,
  ArrowUpDown,
} from 'lucide-react';
import { Skeleton } from '../ui/Skeleton';

export interface Column<T> {
  key: string;
  title: string | React.ReactNode;
  render?: (row: T) => React.ReactNode;
  numeric?: boolean;
  sortable?: boolean;
  width?: string;
  align?: 'left' | 'center' | 'right';
}

interface DataGridProps<T> {
  columns: Column<T>[];
  data: T[];
  searchPlaceholder?: string;
  onRowClick?: (row: T) => void;
  actions?: React.ReactNode;
  showTotals?: boolean;
  totalColumns?: string[];
  emptyMessage?: string;
  emptyIcon?: React.ReactNode;
  pageSize?: number;
  loading?: boolean;
  rowKey?: string;
}

export function DataGrid<T extends Record<string, any>>({
  columns,
  data,
  searchPlaceholder = 'Tabloda ara...',
  onRowClick,
  actions,
  showTotals = false,
  totalColumns = [],
  emptyMessage = 'Kayıt bulunamadı.',
  emptyIcon,
  pageSize = 15,
  loading = false,
  rowKey = 'id',
}: DataGridProps<T>) {
  const [searchTerm, setSearchTerm] = useState('');
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [currentPage, setCurrentPage] = useState(1);
  const [density, setDensity] = useState<'compact' | 'comfortable'>('compact');

  // Search filtering
  const filteredData = useMemo(() => {
    if (!searchTerm.trim()) return data;
    const q = searchTerm.toLowerCase();
    return data.filter(row => {
      return Object.values(row).some(val => {
        if (val === null || val === undefined) return false;
        return String(val).toLowerCase().includes(q);
      });
    });
  }, [data, searchTerm]);

  // Sorting
  const sortedData = useMemo(() => {
    if (!sortKey) return filteredData;
    return [...filteredData].sort((a, b) => {
      const valA = a[sortKey];
      const valB = b[sortKey];
      if (valA === valB) return 0;
      if (valA === null || valA === undefined) return 1;
      if (valB === null || valB === undefined) return -1;

      if (typeof valA === 'number' && typeof valB === 'number') {
        return sortDir === 'asc' ? valA - valB : valB - valA;
      }
      return sortDir === 'asc'
        ? String(valA).localeCompare(String(valB), 'tr')
        : String(valB).localeCompare(String(valA), 'tr');
    });
  }, [filteredData, sortKey, sortDir]);

  // Pagination
  const totalPages = Math.max(1, Math.ceil(sortedData.length / pageSize));
  const paginatedData = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return sortedData.slice(start, start + pageSize);
  }, [sortedData, currentPage, pageSize]);

  const handleSort = (key: string, sortable?: boolean) => {
    if (sortable === false) return;
    if (sortKey === key) {
      setSortDir(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  // Export to CSV
  const handleExportCSV = () => {
    if (sortedData.length === 0) return;
    const headers = columns.map(c => `"${c.title}"`).join(';');
    const rows = sortedData.map(row => {
      return columns.map(col => {
        const val = row[col.key];
        return `"${val !== undefined && val !== null ? String(val).replace(/"/g, '""') : ''}"`;
      }).join(';');
    });
    const csvContent = '\uFEFF' + [headers, ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `isbey_export_${Date.now()}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  // Totals calculation
  const totals = useMemo(() => {
    if (!showTotals || totalColumns.length === 0) return {};
    const res: Record<string, number> = {};
    totalColumns.forEach(key => {
      res[key] = sortedData.reduce((sum, row) => sum + (Number(row[key]) || 0), 0);
    });
    return res;
  }, [sortedData, showTotals, totalColumns]);

  const rowHeight = density === 'compact' ? 'var(--table-row-sm, 32px)' : 'var(--table-row-md, 42px)';

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--ib-surface, #ffffff)',
        border: '1px solid var(--ib-border, #e2e8f0)',
        borderRadius: 'var(--ib-radius-md, 8px)',
        boxShadow: 'var(--shadow-sm, 0 1px 3px rgba(23, 32, 51, 0.05))',
        overflow: 'hidden',
      }}
      className="erp-datagrid-container"
    >
      {/* Üst Toolbar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 16px',
          borderBottom: '1px solid var(--ib-border, #e2e8f0)',
          background: 'var(--ib-surface-subtle, #f5f7fa)',
          flexWrap: 'wrap',
          gap: '10px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, maxWidth: '360px' }}>
          <div
            style={{
              position: 'relative',
              width: '100%',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <Search
              size={14}
              style={{
                position: 'absolute',
                left: '10px',
                color: 'var(--ib-text-muted, #64748b)',
              }}
            />
            <input
              type="text"
              value={searchTerm}
              onChange={e => {
                setSearchTerm(e.target.value);
                setCurrentPage(1);
              }}
              placeholder={searchPlaceholder}
              style={{
                width: '100%',
                padding: '6px 12px 6px 32px',
                background: '#ffffff',
                border: '1px solid var(--ib-border, #e2e8f0)',
                borderRadius: 'var(--ib-radius-sm, 4px)',
                fontSize: 'var(--fs-sm, 12px)',
                color: 'var(--ib-text, #1a1f2e)',
                outline: 'none',
              }}
            />
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {/* Yoğunluk Değiştirici */}
          <button
            onClick={() => setDensity(density === 'compact' ? 'comfortable' : 'compact')}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              padding: '6px 10px',
              background: '#ffffff',
              border: '1px solid var(--ib-border, #e2e8f0)',
              borderRadius: 'var(--ib-radius-sm, 4px)',
              fontSize: 'var(--fs-sm, 12px)',
              fontWeight: 600,
              color: 'var(--ib-text-secondary, #475569)',
              cursor: 'pointer',
            }}
            title={density === 'compact' ? 'Geniş Satır Moduna Geç' : 'Kompakt Satır Moduna Geç'}
          >
            <SlidersHorizontal size={13} />
            <span>{density === 'compact' ? 'Kompakt' : 'Geniş'}</span>
          </button>

          {/* Dışa Aktar CSV */}
          <button
            onClick={handleExportCSV}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              padding: '6px 10px',
              background: '#ffffff',
              border: '1px solid var(--ib-border, #e2e8f0)',
              borderRadius: 'var(--ib-radius-sm, 4px)',
              fontSize: 'var(--fs-sm, 12px)',
              fontWeight: 600,
              color: 'var(--ib-text-secondary, #475569)',
              cursor: 'pointer',
            }}
            title="CSV Dışa Aktar"
          >
            <Download size={13} />
            <span>Dışa Aktar</span>
          </button>

          {actions}
        </div>
      </div>

      {/* Tablo Alanı */}
      <div style={{ overflowX: 'auto', maxHeight: '600px', overflowY: 'auto' }}>
        <table
          style={{
            width: '100%',
            borderCollapse: 'collapse',
            fontSize: density === 'compact' ? 'var(--fs-sm, 12px)' : 'var(--fs-base, 13px)',
            textAlign: 'left',
          }}
        >
          {/* Sticky Header */}
          <thead
            style={{
              position: 'sticky',
              top: 0,
              zIndex: 10,
              background: 'var(--ib-surface-subtle, #f5f7fa)',
              borderBottom: '1px solid var(--ib-border, #e2e8f0)',
            }}
          >
            <tr>
              {columns.map(col => {
                const isSorted = sortKey === col.key;
                const isRight = col.numeric || col.align === 'right';
                const isCenter = col.align === 'center';
                return (
                  <th
                    key={col.key}
                    onClick={() => handleSort(col.key, col.sortable)}
                    style={{
                      padding: density === 'compact' ? '8px 12px' : '10px 14px',
                      fontWeight: 700,
                      color: 'var(--ib-text-secondary, #475569)',
                      textAlign: isRight ? 'right' : isCenter ? 'center' : 'left',
                      width: col.width,
                      cursor: col.sortable !== false ? 'pointer' : 'default',
                      userSelect: 'none',
                      whiteSpace: 'nowrap',
                      borderRight: '1px solid var(--ib-border-light, #f1f5f9)',
                    }}
                  >
                    <div
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                        justifyContent: isRight ? 'flex-end' : isCenter ? 'center' : 'flex-start',
                        width: '100%',
                      }}
                    >
                      <span>{col.title}</span>
                      {col.sortable !== false && (
                        <span style={{ color: isSorted ? 'var(--ib-accent, #f97316)' : 'var(--border-strong)' }}>
                          {isSorted ? (
                            sortDir === 'asc' ? <ChevronUp size={13} /> : <ChevronDown size={13} />
                          ) : (
                            <ArrowUpDown size={11} />
                          )}
                        </span>
                      )}
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>

          {/* Body */}
          <tbody>
            {loading ? (
              // Skeleton Loading Rows
              Array.from({ length: 6 }).map((_, idx) => (
                <tr key={idx} style={{ height: rowHeight, borderBottom: '1px solid var(--ib-border-light, #f1f5f9)' }}>
                  {columns.map((col, cIdx) => (
                    <td key={cIdx} style={{ padding: '8px 12px' }}>
                      <Skeleton width={cIdx === 0 ? '60%' : '80%'} height="14px" />
                    </td>
                  ))}
                </tr>
              ))
            ) : paginatedData.length === 0 ? (
              // Empty State Row
              <tr>
                <td colSpan={columns.length} style={{ padding: '40px 20px', textAlign: 'center' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                    <div style={{ color: 'var(--ib-text-muted, #64748b)' }}>
                      {emptyIcon || <PackageOpen size={36} />}
                    </div>
                    <div style={{ fontWeight: 600, color: 'var(--ib-text, #1a1f2e)', fontSize: 'var(--fs-base, 13px)' }}>
                      {emptyMessage}
                    </div>
                    {searchTerm && (
                      <div style={{ fontSize: 'var(--fs-sm, 12px)', color: 'var(--ib-text-muted, #64748b)' }}>
                        "{searchTerm}" aramasına uygun sonuç bulunamadı.
                      </div>
                    )}
                  </div>
                </td>
              </tr>
            ) : (
              // Data Rows
              paginatedData.map((row, rIdx) => (
                <tr
                  key={row[rowKey] || rIdx}
                  onClick={() => onRowClick && onRowClick(row)}
                  style={{
                    height: rowHeight,
                    borderBottom: '1px solid var(--ib-border-light, #f1f5f9)',
                    background: rIdx % 2 === 1 ? 'rgba(248, 250, 252, 0.5)' : '#ffffff',
                    cursor: onRowClick ? 'pointer' : 'default',
                    transition: 'background 120ms ease',
                  }}
                  className="erp-grid-row"
                >
                  {columns.map(col => {
                    const isRight = col.numeric || col.align === 'right';
                    const isCenter = col.align === 'center';
                    return (
                      <td
                        key={col.key}
                        style={{
                          padding: density === 'compact' ? '6px 12px' : '9px 14px',
                          color: 'var(--ib-text, #1a1f2e)',
                          textAlign: isRight ? 'right' : isCenter ? 'center' : 'left',
                          borderRight: '1px solid var(--ib-border-light, #f1f5f9)',
                          whiteSpace: 'nowrap',
                          fontVariantNumeric: isRight ? 'tabular-nums' : undefined,
                        }}
                      >
                        {col.render ? col.render(row) : (row[col.key] !== undefined && row[col.key] !== null ? String(row[col.key]) : '—')}
                      </td>
                    );
                  })}
                </tr>
              ))
            )}
          </tbody>

          {/* Totals Footer */}
          {showTotals && Object.keys(totals).length > 0 && (
            <tfoot
              style={{
                position: 'sticky',
                bottom: 0,
                background: 'var(--ib-surface-subtle, #f5f7fa)',
                borderTop: '2px solid var(--ib-border-strong, #c9d3e0)',
                fontWeight: 700,
              }}
            >
              <tr>
                {columns.map((col, idx) => {
                  const isTotalCol = totalColumns.includes(col.key);
                  const isRight = col.numeric || col.align === 'right';
                  return (
                    <td
                      key={col.key}
                      style={{
                        padding: '10px 12px',
                        textAlign: isRight ? 'right' : 'left',
                        color: isTotalCol ? 'var(--ib-accent, #f97316)' : 'var(--ib-text-secondary, #475569)',
                        borderRight: '1px solid var(--ib-border-light, #f1f5f9)',
                      }}
                    >
                      {idx === 0 && !isTotalCol ? (
                        <span>Toplam</span>
                      ) : isTotalCol ? (
                        <span>{totals[col.key].toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₺</span>
                      ) : null}
                    </td>
                  );
                })}
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {/* Alt Pagination Bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 16px',
          borderTop: '1px solid var(--ib-border, #e2e8f0)',
          background: 'var(--ib-surface-subtle, #f5f7fa)',
          fontSize: 'var(--fs-sm, 12px)',
          color: 'var(--ib-text-muted, #64748b)',
        }}
      >
        <div>
          Toplam <b style={{ color: 'var(--ib-text, #1a1f2e)' }}>{sortedData.length}</b> kayıt (Sayfa {currentPage} / {totalPages})
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <button
            disabled={currentPage <= 1}
            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
            style={{
              padding: '4px 8px',
              background: '#ffffff',
              border: '1px solid var(--ib-border, #e2e8f0)',
              borderRadius: '4px',
              cursor: currentPage <= 1 ? 'not-allowed' : 'pointer',
              opacity: currentPage <= 1 ? 0.5 : 1,
              fontWeight: 600,
              color: 'var(--ib-text-secondary, #475569)',
            }}
          >
            Önceki
          </button>

          {Array.from({ length: Math.min(5, totalPages) }).map((_, i) => {
            const pageNum = i + 1;
            const isActive = currentPage === pageNum;
            return (
              <button
                key={pageNum}
                onClick={() => setCurrentPage(pageNum)}
                style={{
                  width: '26px',
                  height: '26px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: isActive ? 'var(--ib-primary, #d12131)' : '#ffffff',
                  color: isActive ? '#ffffff' : 'var(--ib-text, #1a1f2e)',
                  border: '1px solid var(--ib-border, #e2e8f0)',
                  borderRadius: '4px',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                {pageNum}
              </button>
            );
          })}

          <button
            disabled={currentPage >= totalPages}
            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
            style={{
              padding: '4px 8px',
              background: '#ffffff',
              border: '1px solid var(--ib-border, #e2e8f0)',
              borderRadius: '4px',
              cursor: currentPage >= totalPages ? 'not-allowed' : 'pointer',
              opacity: currentPage >= totalPages ? 0.5 : 1,
              fontWeight: 600,
              color: 'var(--ib-text-secondary, #475569)',
            }}
          >
            Sonraki
          </button>
        </div>
      </div>
    </div>
  );
}
