import React, { useState, useEffect } from 'react';
import { DataGrid } from '../../common/DataGrid';
import type { Column } from '../../common/DataGrid';

import type { Product, PriceList } from '../../../types';
import { api } from '../../../services/api';
import { priceListName } from '../../../utils/priceResolver';

import { useApp } from '../../../context/AppContext';
import { ProductModal } from './ProductModal';
import { StockMovementModal } from './StockMovementModal';
import { WarehouseTransferModal } from './WarehouseTransferModal';
import { VariantOptionsTab } from './VariantOptionsTab';
import {
  Plus,
  ArrowRightLeft,
  ArrowUpDown,
  Edit2,
  AlertTriangle,
  Layers,
  List,
  Package,
} from 'lucide-react';

export const ProductListView: React.FC = () => {
  const { isNewProductModalOpen, setIsNewProductModalOpen, refreshKey } = useApp();

  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [criticalOnly, setCriticalOnly] = useState(false);
  // 2026-10-12: Stok ekranı iki sekmelidir: ürün listesi + varyant özellikleri.
  const [stockTab, setStockTab] = useState<'PRODUCTS' | 'VARIANTS'>('PRODUCTS');
  // 2026-10-12: "Fiyat Listeleri" sütununda liste ADLARINI gösterebilmek için
  // liste tanımları gerekir; ürün yalnız `priceListId` taşır.
  const [priceLists, setPriceLists] = useState<PriceList[]>([]);

  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [movementProduct, setMovementProduct] = useState<Product | null>(null);
  const [isTransferOpen, setIsTransferOpen] = useState(false);

  useEffect(() => {
    loadProducts();
  }, [criticalOnly, refreshKey]);

  useEffect(() => {
    // Liste adları yardımcı bir gösterimdir; yükleme hatası ürün listesini
    // ENGELLEMEZ (sütun kimlik yerine "—" gösterir).
    api.getPriceLists()
      .then(res => { if (res.success) setPriceLists(res.priceLists); })
      .catch(err => console.error(err));
  }, []);

  const loadProducts = async () => {
    setLoading(true);
    try {
      const res = await api.getProducts({ criticalOnly });
      if (res.success) {
        setProducts(res.products);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const columns: Column<Product>[] = [
    {
      key: 'barcode',
      title: 'Barkod / Kod',
      width: '140px',
      render: p => (
        <div>
          <div style={{ fontWeight: 700, color: 'var(--primary)', fontFamily: 'var(--font-mono)' }}>{p.code}</div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{p.barcode}</div>
        </div>
      ),
    },
    {
      key: 'name',
      title: 'Stok Adı / Ürün',
      render: p => (
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {p.imageUrl ? (
            <img
              src={p.imageUrl}
              alt={p.name}
              style={{ width: '32px', height: '32px', borderRadius: '6px', objectFit: 'cover', border: '1px solid var(--border-color)', flexShrink: 0 }}
            />
          ) : (
            <div style={{ width: '32px', height: '32px', borderRadius: '6px', background: 'var(--bg-surface-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid var(--border-color)', flexShrink: 0, color: 'var(--text-light)', fontSize: '12px' }}>
              📦
            </div>
          )}
          <div>
            <div style={{ fontWeight: 600 }}>{p.name}</div>
            {/* 2026-10-12: Varyantlı ürün rozeti + varyant adları (filtre/rapor). */}
            {(p.variants || []).filter(v => v.active !== false).length > 0 && (
              <div
                style={{ fontSize: '10px', color: 'var(--primary)', fontWeight: 600 }}
                title={(p.variants || []).filter(v => v.active !== false).map(v => `${v.name} (${v.currentStock} ${p.unit})`).join('\n')}
              >
                <Layers size={10} /> {(p.variants || []).filter(v => v.active !== false).length} varyant: {(p.variants || []).filter(v => v.active !== false).slice(0, 3).map(v => v.name).join(', ')}{(p.variants || []).filter(v => v.active !== false).length > 3 ? '…' : ''}
              </div>
            )}
            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
              {p.groupName || 'Genel'} • {p.warehouseName || 'Merkez Depo'}
            </div>
          </div>
        </div>
      ),
    },
    {
      key: 'unit',
      title: 'Birim',
      width: '70px',
    },
    {
      key: 'currentStock',
      title: 'Mevcut Stok',
      numeric: true,
      width: '120px',
      render: p => {
        const isCritical = p.currentStock <= p.criticalStock;
        return (
          <div>
            <span style={{ fontWeight: 800, color: isCritical ? '#ef4444' : '#10b981', fontSize: '14px' }}>
              {p.currentStock} {p.unit}
            </span>
            {isCritical && (
              <div style={{ fontSize: '10px', color: '#ef4444', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '2px' }}>
                <AlertTriangle size={10} /> Kritik Seviye (≤{p.criticalStock})
              </div>
            )}
          </div>
        );
      },
    },
    {
      key: 'purchasePrice',
      title: 'Alış Fiyatı',
      numeric: true,
      width: '120px',
      render: p => <span>{p.purchasePrice.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺</span>,
    },
    {
      key: 'salePrice',
      title: 'Satış Fiyatı',
      numeric: true,
      width: '120px',
      render: p => (
        <span style={{ fontWeight: 700, color: 'var(--primary)' }}>
          {p.salePrice.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺
        </span>
      ),
    },
    {
      // 2026-10-12: Ürün başına kaç fiyat listesi fiyatı tanımlı olduğunu
      // gösterir. Tanımsız ürünlerde boş kalır (taban fiyat geçerli).
      key: 'salePrices',
      title: 'Fiyat Listeleri',
      sortable: false,
      width: '130px',
      render: p => {
        const entries = p.salePrices || [];
        if (entries.length === 0) {
          return <span style={{ color: 'var(--text-light)', fontSize: 'var(--fs-xs)' }}>—</span>;
        }
        return (
          <span
            title={entries
              .map(e => `${priceListName(priceLists, e.priceListId)}: ${e.salePrice.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺`)
              .join('\n')}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '3px',
              fontSize: 'var(--fs-xs)',
              padding: '1px 6px',
              borderRadius: '10px',
              background: 'var(--bg-surface-hover)',
              color: 'var(--text-muted)',
            }}
          >
            <List size={11} />
            {entries.length} liste
          </span>
        );
      },
    },
    {
      key: 'vatRate',
      title: 'KDV',
      width: '70px',
      render: p => <span>%{p.vatRate}</span>,
    },
    {
      key: 'actions',
      title: 'İşlemler',
      sortable: false,
      width: '150px',
      render: p => (
        <div style={{ display: 'flex', gap: '4px' }} onClick={e => e.stopPropagation()}>
          <button
            className="btn btn-secondary btn-sm"
            title="Stok Hareketi Ekle"
            onClick={() => setMovementProduct(p)}
          >
            <ArrowUpDown size={13} color="var(--primary)" />
            <span>Hareket</span>
          </button>
          <button
            className="btn btn-secondary btn-sm"
            title="Düzenle"
            onClick={() => setEditingProduct(p)}
          >
            <Edit2 size={13} />
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="view-content-container">
      {/* 2026-10-12: Üst seviye sekmeler (ürün listesi / varyant özellikleri). */}
      <div style={{ display: 'flex', gap: '8px' }}>
        <button
          className={`btn ${stockTab === 'PRODUCTS' ? 'btn-primary' : 'btn-secondary'} btn-sm`}
          onClick={() => setStockTab('PRODUCTS')}
        >
          <Package size={14} />
          <span>Ürünler</span>
        </button>
        <button
          className={`btn ${stockTab === 'VARIANTS' ? 'btn-primary' : 'btn-secondary'} btn-sm`}
          onClick={() => setStockTab('VARIANTS')}
        >
          <Layers size={14} />
          <span>Varyantlar</span>
        </button>
      </div>

      {stockTab === 'VARIANTS' && <VariantOptionsTab />}

      {stockTab === 'PRODUCTS' && (
      <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            className={`btn ${!criticalOnly ? 'btn-primary' : 'btn-secondary'} btn-sm`}
            onClick={() => setCriticalOnly(false)}
          >
            Tüm Stok Kartları ({products.length})
          </button>
          <button
            className={`btn ${criticalOnly ? 'btn-danger' : 'btn-secondary'} btn-sm`}
            onClick={() => setCriticalOnly(true)}
          >
            <AlertTriangle size={14} />
            <span>Kritik Stok Seviyeleri</span>
          </button>
        </div>

        <div style={{ display: 'flex', gap: '8px' }}>
          <button className="btn btn-secondary" onClick={() => setIsTransferOpen(true)}>
            <ArrowRightLeft size={15} />
            <span>Depo Transferi</span>
          </button>
          <button className="btn btn-primary" onClick={() => setIsNewProductModalOpen(true)}>
            <Plus size={16} />
            <span>Yeni Stok Kartı Ekle</span>
          </button>
        </div>
      </div>

      <DataGrid
        columns={columns}
        data={products}
        loading={loading}
        searchPlaceholder="Ürün adı, stok kodu veya barkod ile ara..."
        onRowClick={p => setEditingProduct(p)}
        showTotals={true}
        totalColumns={['currentStock']}
      />
      </>
      )}

      <ProductModal
        isOpen={isNewProductModalOpen || !!editingProduct}
        onClose={() => {
          setIsNewProductModalOpen(false);
          setEditingProduct(null);
        }}
        productToEdit={editingProduct}
      />

      <StockMovementModal
        isOpen={!!movementProduct}
        onClose={() => setMovementProduct(null)}
        product={movementProduct}
      />

      <WarehouseTransferModal
        isOpen={isTransferOpen}
        onClose={() => setIsTransferOpen(false)}
      />
    </div>
  );
};
