import { useState } from 'react';
import { ArrowDownLeft, ArrowUpRight, ChevronDown, FileText, Landmark, Package, Users } from 'lucide-react';

const examples = [
  { label: 'Cari', icon: Users, title: 'Hesaplarınız net, takibiniz kolay.', metric: 'Tahsil edilecek', value: '86.200 ₺', rows: [['Atlas Ticaret', 'Tahsilat', '18.500 ₺'], ['Ege Tedarik', 'Ödeme', '12.750 ₺'], ['Marmara Yapı', 'Tahsilat', '24.000 ₺']] },
  { label: 'Fatura', icon: FileText, title: 'Belgeleriniz aynı yerde.', metric: 'Bu ay satış', value: '248.500 ₺', rows: [['Satış faturası', 'Taslak', '18.500 ₺'], ['Alış faturası', 'Kayıtlı', '12.750 ₺'], ['Satış faturası', 'Kayıtlı', '24.000 ₺']] },
  { label: 'Stok', icon: Package, title: 'Ürünlerinizi birlikte takip edin.', metric: 'Listelenen ürün', value: '128 ürün', rows: [['Ofis sandalyesi', 'Merkez depo', '24 adet'], ['Çalışma masası', 'Merkez depo', '18 adet'], ['Masa lambası', 'Mağaza', '36 adet']] },
  { label: 'Nakit', icon: Landmark, title: 'Para hareketleri gözünüzün önünde.', metric: 'Kasa ve banka', value: '142.750 ₺', rows: [['Müşteri tahsilatı', 'Giriş', '18.500 ₺'], ['Tedarikçi ödemesi', 'Çıkış', '12.750 ₺'], ['Banka tahsilatı', 'Giriş', '24.000 ₺']] },
];

export function LandingWorkspacePreview() {
  const [active, setActive] = useState(0);
  const example = examples[active];
  return <div className="lp-preview" data-nosnippet>
    <div className="lp-preview-top"><span className="lp-preview-mark">İŞBEY <small>CLOUD</small></span><span>Örnek Firma <ChevronDown size={12} /></span></div>
    <div className="lp-preview-tabs" role="tablist" aria-label="Örnek çalışma alanı">
      {examples.map(({ label, icon: Icon }, index) => <button type="button" key={label} id={`preview-tab-${index}`} role="tab" tabIndex={index === active ? 0 : -1} aria-selected={index === active} aria-controls="preview-panel" onClick={() => setActive(index)} onKeyDown={event => {
        const next = event.key === 'ArrowRight' ? (index + 1) % examples.length : event.key === 'ArrowLeft' ? (index + examples.length - 1) % examples.length : event.key === 'Home' ? 0 : event.key === 'End' ? examples.length - 1 : null;
        if (next !== null) { event.preventDefault(); setActive(next); document.getElementById(`preview-tab-${next}`)?.focus(); }
      }}><Icon size={15} />{label}</button>)}
    </div>
    <div id="preview-panel" role="tabpanel" aria-labelledby={`preview-tab-${active}`} className="lp-preview-content">
      <p className="lp-eyebrow">İŞİNİZE GENEL BAKIŞ</p><h3>{example.title}</h3>
      <div className="lp-preview-numbers"><div><span>{example.metric}</span><strong>{example.value}</strong></div><div><span>Ödenecek</span><strong>42.750 ₺</strong></div></div>
      <div className="lp-preview-chart" aria-hidden="true"><span>Aylık hareketler</span><div>{[32, 48, 40, 68, 56, 84, 72, 94].map((height, index) => <i key={index} style={{ height: `${height}%` }} />)}</div></div>
      <div className="lp-preview-table">{example.rows.map(([name, state, amount], index) => <div key={name}><span className="lp-preview-row-icon">{index === 1 ? <ArrowUpRight size={15} /> : <ArrowDownLeft size={15} />}</span><span>{name}<small>{state}</small></span><strong>{amount}</strong></div>)}</div>
    </div><div className="lp-preview-caption">Temsili ekran · Örnek veriler</div>
  </div>;
}
