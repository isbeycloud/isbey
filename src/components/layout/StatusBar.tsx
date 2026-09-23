import React, { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useApp } from '../../context/AppContext';
import { api } from '../../services/api';
import { Building, ShieldCheck } from 'lucide-react';

interface StatusInfo {
  companyName: string;
}

/**
 * Alt durum çubuğu.
 *
 * 2026-09-13 (tasarım + dürüstlük düzeltmesi):
 * Önceden burada ÜÇ gösterge vardı ve ikisi uydurmaydı:
 *   - "Sistem Online"  → sabit yeşil nokta, hiçbir sağlık kontrolüne bağlı değildi.
 *   - "Senkronize"     → sabit metin, arkasında senkronizasyon işi yoktu.
 * Bunlar kullanıcıya var olmayan bir güvence veriyordu. Artık YALNIZ gerçek
 * `isOnline` durumu gösterilir; sistem sağlığı iddiası yapılmaz.
 *
 * Ayrıca çubuk tam genişlikte KIRMIZI bir şeritti (--color-primary). Marka
 * renginin böyle bir yüzeyi kaplaması "her yerde kırmızı" izlenimi veriyordu;
 * nötr yüzeye çevrildi, marka rengi yalnız gerçek uyarı durumunda görünür.
 */
export const StatusBar: React.FC = () => {
  const { user } = useAuth();
  const { activeTenant, isOnline, refreshKey } = useApp();
  const [info, setInfo] = useState<StatusInfo>({ companyName: '' });

  useEffect(() => {
    const load = async () => {
      try {
        const res: any = await api.getSettings().catch(() => ({ success: false }));
        if (res && res.success) {
          setInfo({ companyName: res.company?.name || '' });
        }
      } catch (_) {
        /* Sessiz: durum çubuğu bilgisi kritik değil, ekranı bloke etmez. */
      }
    };
    load();
  }, [refreshKey]);

  // 2026-09-13: Sabit "10:24" benzeri uydurma saat ve her 10 sn'de bir
  // gereksiz render üreten zamanlayıcı kaldırıldı. Durum çubuğu artık
  // saniyeleri göstermez; kullanıcı saati işletim sisteminden okur.

  const companyLabel = activeTenant?.name || info.companyName;

  return (
    <footer className="status-bar">
      {/* Sol: yalnız GERÇEK bağlantı durumu */}
      <div className="status-bar-left">
        <div className="status-item">
          <span
            className="status-dot"
            style={{ background: isOnline ? 'var(--success)' : 'var(--danger)' }}
          />
          <span>{isOnline ? 'Bağlı' : 'Bağlantı kesildi'}</span>
        </div>
      </div>

      {/* Sağ: firma + kullanıcı. Değer yoksa alan hiç gösterilmez. */}
      <div className="status-bar-right">
        {companyLabel && (
          <>
            <div className="status-item">
              <Building size={11} />
              <span>{companyLabel}</span>
            </div>
            <span className="status-separator" />
          </>
        )}

        {user && (
          <div className="status-item">
            <ShieldCheck size={11} />
            <span>
              {user.fullName || user.username}
              {user.role ? ` · ${user.role}` : ''}
            </span>
          </div>
        )}
      </div>
    </footer>
  );
};
