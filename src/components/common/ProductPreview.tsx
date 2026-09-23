import { BarChart3, FileText, Package, Users, Wallet, Cloud, CheckCircle2 } from 'lucide-react';
import { BrandLogo } from './BrandLogo';
import './ProductPreview.css';

const modules = [
  { name: 'Genel Bakış', icon: BarChart3 }, { name: 'Faturalar', icon: FileText },
  { name: 'Cari Hesaplar', icon: Users }, { name: 'Stok', icon: Package },
  { name: 'Kasa & Banka', icon: Wallet },
];

/** Original, illustrative product graphic. Contains no third-party screenshots. */
export function ProductPreview({ title = 'İşletmenize tek ekrandan bakın', compact = false }: {
  title?: string; compact?: boolean;
}) {
  return <div className={`product-preview ${compact ? 'product-preview--compact' : ''}`} role="img"
    aria-label={`İŞBEY CLOUD — ${title}. Temsili arayüz, örnek veriler.`}>
    <div className="product-preview__top"><BrandLogo width={180} /><span><Cloud size={14} /> Bulut ERP</span></div>
    <div className="product-preview__body">
      <div className="product-preview__nav">{modules.map(({ name, icon: Icon }, i) =>
        <div key={name} className={i === 0 ? 'selected' : ''}><Icon size={15} /><span>{name}</span></div>)}</div>
      <div className="product-preview__main">
        <span className="product-preview__eyebrow">İŞİNİZİN KONTROLÜ SİZDE</span>
        <h3>{title}</h3>
        <div className="product-preview__metrics">
          <div><span>Satışlar</span><strong>₺128.450</strong><small>Bu ay</small></div>
          <div><span>Tahsilatlar</span><strong>₺96.200</strong><small>Tamamlanan</small></div>
        </div>
        <div className="product-preview__chart"><div><strong>Nakit akışı</strong><span>Son 6 ay</span></div>
          <div className="product-preview__bars">{[38, 56, 44, 72, 62, 90].map((h, i) =>
            <div key={i}><i style={{ height: `${h}%` }} /><small>{['Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl'][i]}</small></div>)}</div>
        </div>
        <div className="product-preview__status"><CheckCircle2 size={16} /><span>Fatura, stok ve cari hesaplar bir arada</span></div>
      </div>
    </div>
    <div className="product-preview__caption">İŞBEY CLOUD <span>Temsili arayüz · Örnek veriler</span></div>
  </div>;
}
