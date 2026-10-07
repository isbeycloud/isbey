import React from 'react';

/**
 * Belge sorgulama filtre çubuğu (docs/85).
 *
 * Desen `edonusum/IncomingDocumentsView.tsx`'teki süzgeç ızgarasından alındı
 * (aynı CSS değişkenleri, aynı `form-control` sınıfı) — böylece iki ekran
 * görsel olarak ayrışmaz. Bu bileşen SUNUCUYA İSTEK ATMAZ; yalnız durumu
 * yönetir, sorguyu çağıran taraf yapar.
 */

export interface BelgeSorguDegeri {
  startDate: string;
  endDate: string;
  /** Unvan / kod / belge no araması. `titleOnly` ile daraltılır. */
  search: string;
  /** true → yalnız unvan; false/undefined → unvan + kod + belge no. */
  titleOnly: boolean;
  taxNumber: string;
  documentNo: string;
  status: string;
}

export const BOS_SORGU: BelgeSorguDegeri = {
  startDate: '',
  endDate: '',
  search: '',
  titleOnly: false,
  taxNumber: '',
  documentNo: '',
  status: '',
};

/** YYYY-AA-GG (yerel saat). `toISOString` UTC'ye kaydırıp gün atlatabilir. */
function gunISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const g = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${g}`;
}

/** Hazır tarih kısayolları. "Son 30 gün" varsayılanı da bunu kullanır. */
export function tarihAraligi(preset: 'BUGUN' | 'SON30' | 'BU_AY' | 'GECEN_AY' | 'BU_YIL' | 'TUMU') {
  const simdi = new Date();
  switch (preset) {
    case 'BUGUN': {
      const g = gunISO(simdi);
      return { startDate: g, endDate: g };
    }
    case 'SON30': {
      const bas = new Date(simdi);
      bas.setDate(bas.getDate() - 29); // bugün dahil 30 takvim günü
      return { startDate: gunISO(bas), endDate: gunISO(simdi) };
    }
    case 'BU_AY':
      return { startDate: gunISO(new Date(simdi.getFullYear(), simdi.getMonth(), 1)), endDate: gunISO(simdi) };
    case 'GECEN_AY':
      return {
        startDate: gunISO(new Date(simdi.getFullYear(), simdi.getMonth() - 1, 1)),
        endDate: gunISO(new Date(simdi.getFullYear(), simdi.getMonth(), 0)),
      };
    case 'BU_YIL':
      return { startDate: gunISO(new Date(simdi.getFullYear(), 0, 1)), endDate: gunISO(simdi) };
    case 'TUMU':
    default:
      return { startDate: '', endDate: '' };
  }
}

const KISAYOLLAR: Array<{ id: Parameters<typeof tarihAraligi>[0]; etiket: string }> = [
  { id: 'SON30', etiket: 'Son 30 Gün' },
  { id: 'BUGUN', etiket: 'Bugün' },
  { id: 'BU_AY', etiket: 'Bu Ay' },
  { id: 'GECEN_AY', etiket: 'Geçen Ay' },
  { id: 'BU_YIL', etiket: 'Bu Yıl' },
  { id: 'TUMU', etiket: 'Tümü' },
];

export interface BelgeSorguCubuguProps {
  value: BelgeSorguDegeri;
  onChange: (next: BelgeSorguDegeri) => void;
  /** Belge türüne göre "Belge No" etiketi (Fatura No / İrsaliye No). */
  belgeNoEtiketi?: string;
  /** Durum seçenekleri; sekme değişince farklı liste gelebilir. */
  durumSecenekleri?: Array<{ id: string; etiket: string }>;
  /** false → "yalnız unvan" kutusu gizlenir (uç bu ayrımı desteklemiyorsa). */
  titleOnlyGoster?: boolean;
  onTemizle: () => void;
}

export const BelgeSorguCubugu: React.FC<BelgeSorguCubuguProps> = ({
  value,
  onChange,
  belgeNoEtiketi = 'Belge No',
  durumSecenekleri = [],
  titleOnlyGoster = true,
  onTemizle,
}) => {
  const ayarla = <K extends keyof BelgeSorguDegeri>(key: K, v: BelgeSorguDegeri[K]) =>
    onChange({ ...value, [key]: v });

  const tersAralik = Boolean(value.startDate && value.endDate && value.startDate > value.endDate);

  return (
    <div
      style={{
        display: 'flex', flexDirection: 'column', gap: '8px',
        padding: '12px', background: 'var(--bg-surface-secondary)',
        border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md, 8px)',
      }}
    >
      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
        {KISAYOLLAR.map(k => (
          <button
            key={k.id}
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => onChange({ ...value, ...tarihAraligi(k.id) })}
          >
            {k.etiket}
          </button>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '8px' }}>
        <label style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
          Başlangıç Tarihi
          <input type="date" className="form-control" value={value.startDate}
            onChange={e => ayarla('startDate', e.target.value)} />
        </label>
        <label style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
          Bitiş Tarihi
          <input type="date" className="form-control" value={value.endDate}
            onChange={e => ayarla('endDate', e.target.value)} />
        </label>
        <label style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
          Unvan / Kod / Belge Ara
          <input type="text" className="form-control" value={value.search}
            placeholder="Beyoğlu Teknoloji" onChange={e => ayarla('search', e.target.value)} />
        </label>
        <label style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
          VKN / TCKN
          <input type="text" className="form-control" value={value.taxNumber}
            placeholder="1234567890" onChange={e => ayarla('taxNumber', e.target.value)} />
        </label>
        <label style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
          {belgeNoEtiketi}
          <input type="text" className="form-control" value={value.documentNo}
            placeholder="GIB2026000000001" onChange={e => ayarla('documentNo', e.target.value)} />
        </label>
        {durumSecenekleri.length > 0 && (
          <label style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
            Durum
            <select className="form-control" value={value.status}
              onChange={e => ayarla('status', e.target.value)}>
              {durumSecenekleri.map(s => <option key={s.id} value={s.id}>{s.etiket}</option>)}
            </select>
          </label>
        )}
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: '6px' }}>
          <button type="button" className="btn btn-secondary btn-sm" onClick={onTemizle}>Temizle</button>
        </div>
      </div>

      {titleOnlyGoster && (
        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: 'var(--text-muted)' }}>
          <input type="checkbox" checked={value.titleOnly}
            onChange={e => ayarla('titleOnly', e.target.checked)} />
          Yalnız unvanda ara (kod ve belge no hariç)
        </label>
      )}

      {tersAralik && (
        <div style={{ fontSize: '11px', color: 'var(--danger, #c0392b)' }}>
          Başlangıç tarihi bitiş tarihinden sonra olamaz; sorgu gönderilmedi.
        </div>
      )}
    </div>
  );
};
