import React, { useState, useEffect } from 'react';
import {
  Smartphone,
  Laptop,
  Globe,
  ShieldCheck,
  AlertTriangle,
  LogOut,
  RefreshCw,
  CheckCircle2,
} from 'lucide-react';
import { api } from '../../../services/api';
import { useToast } from '../../../context/ToastContext';
import type { UserDevice } from '../../../types';

export const DeviceSecurityView: React.FC = () => {
  const { showToast } = useToast();
  const [devices, setDevices] = useState<UserDevice[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadDevices();
  }, []);

  const loadDevices = async () => {
    setIsLoading(true);
    try {
      const res = await api.getUserDevices();
      if (res.success) setDevices(res.devices || []);
    } catch {
      // ignore
    } finally {
      setIsLoading(false);
    }
  };

  const handleTerminate = async (id: string) => {
    try {
      const res = await api.terminateUserDevice(id);
      if (res.success) {
        showToast(res.message, 'success');
        loadDevices();
      }
    } catch (err: any) {
      showToast(err.message || 'Oturum kapatılamadı.', 'error');
    }
  };

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
      <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ width: '46px', height: '46px', borderRadius: 'var(--radius-sm, 6px)', background: 'var(--primary-light)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <ShieldCheck size={26} color="var(--primary)" />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <h1 style={{ fontSize: 'var(--fs-xl, 20px)', fontWeight: 700, margin: 0 }}>
                  Cihaz Yönetimi & Oturum Güvenliği
                </h1>
                <span className="badge badge-success" style={{ fontSize: 'var(--fs-xs, 11px)' }}>
                  {devices.length} Aktif Cihaz
                </span>
              </div>
              <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: 'var(--fs-sm, 12px)' }}>
                Hesabınıza bağlı oturumlar, güvenilir cihazlar ve uzaktan oturum sonlandırma merkezi
              </p>
            </div>
          </div>

          <button
            onClick={loadDevices}
            style={{ padding: '10px 16px', background: 'var(--bg-surface)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm, 6px)', color: 'var(--text-main)', fontSize: 'var(--fs-sm, 12px)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <RefreshCw size={16} />
            <span>Yenile</span>
          </button>
        </div>

        {/* Cihaz Kartları Listesi */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {devices.map(dev => (
            <div
              key={dev.id}
              style={{
                background: 'var(--bg-surface)',
                borderRadius: 'var(--radius-md, 8px)',
                border: '1px solid var(--border-color)',
                padding: '20px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: '16px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                <div style={{ width: '46px', height: '46px', borderRadius: 'var(--radius-sm, 6px)', background: 'var(--primary-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--primary)' }}>
                  {dev.platform === 'Android' || dev.platform === 'iOS' ? <Smartphone size={24} /> : <Laptop size={24} />}
                </div>

                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <h3 style={{ margin: 0, fontSize: 'var(--fs-lg, 16px)', fontWeight: 700, color: 'var(--text-main)' }}>
                      {dev.deviceName}
                    </h3>
                    {dev.isCurrent && (
                      <span className="badge badge-success" style={{ fontSize: 'var(--fs-xs, 11px)' }}>
                        Bu Cihaz (Şu An Aktif)
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 'var(--fs-sm, 12px)', color: 'var(--text-muted)', marginTop: '4px' }}>
                    Platform: <b>{dev.platform}</b> | IP Adresi: {dev.ipAddress} | Son Aktivite: {new Date(dev.lastActiveAt).toLocaleString('tr-TR')}
                  </div>
                </div>
              </div>

              {!dev.isCurrent && (
                <button
                  onClick={() => handleTerminate(dev.id)}
                  style={{ padding: '8px 16px', background: 'var(--danger-bg)', border: '1px solid var(--danger-border)', borderRadius: 'var(--radius-sm, 6px)', color: 'var(--danger-text)', fontWeight: 700, fontSize: 'var(--fs-sm, 12px)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
                >
                  <LogOut size={14} />
                  <span>Oturumu Kapat</span>
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
