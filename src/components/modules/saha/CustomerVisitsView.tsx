import React, { useState, useEffect } from 'react';
import {
  MapPin,
  Calendar,
  Clock,
  Plus,
  CheckCircle2,
  AlertCircle,
  Camera,
  Navigation,
  User,
  Building,
  ArrowRight,
  RefreshCw,
  Search,
  X,
} from 'lucide-react';
import { api } from '../../../services/api';
import { useToast } from '../../../context/ToastContext';
import type { CustomerVisit, Customer, VisitOutcome } from '../../../types';

export const CustomerVisitsView: React.FC = () => {
  const { showToast } = useToast();
  const [activeTab, setActiveTab] = useState<'routes' | 'map'>('routes');
  const [visits, setVisits] = useState<CustomerVisit[]>([]);
  const [mapPins, setMapPins] = useState<any[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // New Visit Modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newVisit, setNewVisit] = useState({
    customerId: '',
    visitDate: new Date().toISOString().split('T')[0],
    startTime: '10:00',
    notes: '',
    outcome: 'COLLECTION_MADE' as VisitOutcome,
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [vRes, mRes, cRes] = await Promise.all([
        api.getVisits(),
        api.getVisitMapPins(),
        api.getCustomers(),
      ]);

      if (vRes.success) setVisits(vRes.visits || []);
      if (mRes.success) setMapPins(mRes.pins || []);
      if (cRes.success) setCustomers(cRes.customers || []);
    } catch (err: any) {
      showToast(err.message || 'Ziyaret verileri yüklenemedi.', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateVisit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newVisit.customerId) {
      showToast('Lütfen ziyaret edilecek cariyi seçiniz.', 'error');
      return;
    }
    try {
      const res = await api.createVisit(newVisit);
      if (res.success) {
        showToast(res.message, 'success');
        setIsModalOpen(false);
        setNewVisit({
          customerId: '',
          visitDate: new Date().toISOString().split('T')[0],
          startTime: '10:00',
          notes: '',
          outcome: 'COLLECTION_MADE',
        });
        loadData();
      }
    } catch (err: any) {
      showToast(err.message || 'Ziyaret oluşturulamadı.', 'error');
    }
  };

  const today = new Date().toISOString().split('T')[0];
  const todayVisits = visits.filter(v => v.visitDate === today);
  const completedToday = todayVisits.filter(v => v.status === 'COMPLETED').length;

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
      <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {/* 2026-09-13: sayfa kabuğu açık temaya geçti — ikon bloğu marka
                renginin açık tonuna, ikon da marka rengine çekildi. */}
            <div style={{ width: '44px', height: '44px', borderRadius: 'var(--radius-sm, 6px)', background: 'var(--primary-light)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Navigation size={24} color="var(--primary)" />
            </div>
            <div>
              <h1 style={{ fontSize: 'var(--fs-xl, 20px)', fontWeight: 700, margin: 0 }}>
                Saha Ziyaret & Rota Yönetimi
              </h1>
              <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: 'var(--fs-sm, 12px)' }}>
                Personel günlük müşteri ziyaret rotası, GPS harita pinleri ve ziyaret sonuç karnesi
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              onClick={() => setIsModalOpen(true)}
              style={{ padding: '10px 20px', borderRadius: 'var(--radius-sm, 6px)', border: 'none', background: 'var(--primary)', color: '#fff', fontWeight: 700, fontSize: 'var(--fs-sm, 12px)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}
            >
              <Plus size={18} />
              <span>Yeni Ziyaret Planla / Ekle</span>
            </button>
          </div>
        </div>

        {/* Tab Menüsü */}
        <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid var(--border-color)', marginBottom: '24px' }}>
          <button
            onClick={() => setActiveTab('routes')}
            style={{
              padding: '12px 20px',
              background: 'transparent',
              border: 'none',
              borderBottom: activeTab === 'routes' ? '2px solid var(--primary)' : '2px solid transparent',
              color: activeTab === 'routes' ? 'var(--primary)' : 'var(--text-muted)',
              fontWeight: activeTab === 'routes' ? 700 : 500,
              fontSize: 'var(--fs-base, 13px)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <Calendar size={18} />
            <span>Ziyaret Rotaları & Program ({visits.length})</span>
          </button>
          <button
            onClick={() => setActiveTab('map')}
            style={{
              padding: '12px 20px',
              background: 'transparent',
              border: 'none',
              borderBottom: activeTab === 'map' ? '2px solid var(--primary)' : '2px solid transparent',
              color: activeTab === 'map' ? 'var(--primary)' : 'var(--text-muted)',
              fontWeight: activeTab === 'map' ? 700 : 500,
              fontSize: 'var(--fs-base, 13px)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <MapPin size={18} />
            <span>Müşteri Harita Görünümü ({mapPins.length})</span>
          </button>
        </div>

        {/* ── 1. SEKME: ROTALAR & ZİYARET LİSTESİ ── */}
        {activeTab === 'routes' && (
          <div>
            {/* KPI Kartları */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px', marginBottom: '24px' }}>
              <div style={{ background: 'var(--bg-surface)', padding: '20px', borderRadius: 'var(--radius-md, 8px)', border: '1px solid var(--border-color)' }}>
                <div style={{ color: 'var(--text-muted)', fontSize: 'var(--fs-sm, 12px)', fontWeight: 600 }}>Bugünkü Ziyaretler</div>
                <div style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--text-main)', marginTop: '4px' }}>
                  {todayVisits.length}
                </div>
                <div style={{ fontSize: 'var(--fs-xs, 11px)', color: 'var(--success)', marginTop: '2px' }}>
                  {completedToday} Tamamlandı
                </div>
              </div>

              <div style={{ background: 'var(--bg-surface)', padding: '20px', borderRadius: 'var(--radius-md, 8px)', border: '1px solid var(--border-color)' }}>
                <div style={{ color: 'var(--text-muted)', fontSize: 'var(--fs-sm, 12px)', fontWeight: 600 }}>Başarı & Tahsilat Oranı</div>
                <div style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--success)', marginTop: '4px' }}>
                  %{todayVisits.length > 0 ? Math.round((completedToday / todayVisits.length) * 100) : 100}
                </div>
                <div style={{ fontSize: 'var(--fs-xs, 11px)', color: 'var(--text-muted)', marginTop: '2px' }}>Ziyaret verimlilik skoru</div>
              </div>

              <div style={{ background: 'var(--bg-surface)', padding: '20px', borderRadius: 'var(--radius-md, 8px)', border: '1px solid var(--border-color)' }}>
                <div style={{ color: 'var(--text-muted)', fontSize: 'var(--fs-sm, 12px)', fontWeight: 600 }}>Kayıtlı Tüm Ziyaretler</div>
                <div style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--info)', marginTop: '4px' }}>
                  {visits.length}
                </div>
                <div style={{ fontSize: 'var(--fs-xs, 11px)', color: 'var(--text-muted)', marginTop: '2px' }}>Saha geçmişi</div>
              </div>
            </div>

            {/* Ziyaret Listesi Tablosu */}
            <div style={{ background: 'var(--bg-surface)', borderRadius: 'var(--radius-md, 8px)', border: '1px solid var(--border-color)', overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--fs-base, 13px)', textAlign: 'left' }}>
                <thead>
                  <tr style={{ background: 'var(--bg-surface-secondary)', color: 'var(--text-muted)', borderBottom: '1px solid var(--border-color)' }}>
                    <th style={{ padding: '14px 18px' }}>Tarih / Saat</th>
                    <th style={{ padding: '14px 18px' }}>Müşteri</th>
                    <th style={{ padding: '14px 18px' }}>Saha Personeli</th>
                    <th style={{ padding: '14px 18px' }}>Ziyaret Sonucu</th>
                    <th style={{ padding: '14px 18px' }}>Notlar</th>
                    <th style={{ padding: '14px 18px' }}>GPS</th>
                    <th style={{ padding: '14px 18px' }}>Durum</th>
                  </tr>
                </thead>
                <tbody>
                  {visits.length === 0 ? (
                    <tr>
                      <td colSpan={7} style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
                        Kayıtlı ziyaret bulunmuyor.
                      </td>
                    </tr>
                  ) : (
                    visits.map(v => (
                      <tr key={v.id} style={{ borderBottom: '1px solid var(--border-light)' }}>
                        <td style={{ padding: '14px 18px', color: 'var(--text-muted)' }}>
                          <div>{new Date(v.visitDate).toLocaleDateString('tr-TR')}</div>
                          <div style={{ fontSize: 'var(--fs-xs, 11px)', color: 'var(--text-muted)' }}>{v.startTime}</div>
                        </td>
                        <td style={{ padding: '14px 18px', fontWeight: 700, color: 'var(--text-main)' }}>
                          {v.customerTitle}
                        </td>
                        <td style={{ padding: '14px 18px', color: 'var(--text-muted)' }}>
                          {v.fieldAgentName}
                        </td>
                        <td style={{ padding: '14px 18px' }}>
                          <span className="badge badge-info">
                            {v.outcome || 'Tahsilat Yapıldı'}
                          </span>
                        </td>
                        <td style={{ padding: '14px 18px', color: 'var(--text-muted)' }}>
                          {v.notes || '-'}
                        </td>
                        <td style={{ padding: '14px 18px' }}>
                          {v.latitude ? (
                            <span title={`Enlem: ${v.latitude}, Boylam: ${v.longitude}`} style={{ color: 'var(--success)' }}>
                              <MapPin size={16} />
                            </span>
                          ) : '-'}
                        </td>
                        <td style={{ padding: '14px 18px' }}>
                          <span className="badge badge-success">
                            {v.status}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── 2. SEKME: HARİTA GÖRÜNÜMÜ ── */}
        {activeTab === 'map' && (
          <div style={{ background: 'var(--bg-surface)', borderRadius: 'var(--radius-md, 8px)', border: '1px solid var(--border-color)', padding: '24px' }}>
            <h3 style={{ margin: '0 0 8px', fontSize: 'var(--fs-lg, 16px)', fontWeight: 700 }}>Müşteri Konum & Rota Haritası</h3>
            <p style={{ margin: '0 0 20px', color: 'var(--text-muted)', fontSize: 'var(--fs-sm, 12px)' }}>
              GPS koordinatlarına göre gruplanmış cari hesap haritası
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
              {mapPins.map(pin => (
                <div key={pin.customerId} style={{ background: 'var(--bg-surface-secondary)', borderRadius: 'var(--radius-md, 8px)', border: '1px solid var(--border-color)', padding: '18px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                    <h4 style={{ margin: 0, fontSize: 'var(--fs-base, 13px)', fontWeight: 700, color: 'var(--text-main)' }}>
                      {pin.title}
                    </h4>
                    <span style={{ fontSize: 'var(--fs-xs, 11px)', color: 'var(--info)', fontWeight: 700 }}>
                      {pin.city}
                    </span>
                  </div>
                  <div style={{ fontSize: 'var(--fs-sm, 12px)', color: 'var(--text-muted)', marginBottom: '12px' }}>
                    {pin.address}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--border-color)', paddingTop: '10px' }}>
                    <div>
                      <div style={{ fontSize: 'var(--fs-xs, 11px)', color: 'var(--text-muted)' }}>Bakiye</div>
                      <div style={{ fontSize: 'var(--fs-base, 13px)', fontWeight: 700, color: pin.balance > 0 ? 'var(--danger)' : 'var(--success)' }}>
                        {pin.balance.toLocaleString('tr-TR')} TL
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        setNewVisit({ ...newVisit, customerId: pin.customerId });
                        setIsModalOpen(true);
                      }}
                      style={{ padding: '6px 12px', borderRadius: 'var(--radius-sm, 6px)', background: 'var(--primary)', border: 'none', color: '#fff', fontSize: 'var(--fs-xs, 11px)', fontWeight: 700, cursor: 'pointer' }}
                    >
                      Ziyaret Başlat
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* New Visit Modal */}
      {isModalOpen && (
        <div className="modal-overlay" style={{ zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ width: '90vw', maxWidth: '520px', background: 'var(--bg-surface)', borderRadius: 'var(--radius-lg, 10px)', border: '1px solid var(--border-color)', padding: '24px', color: 'var(--text-main)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ margin: 0, fontSize: 'var(--fs-lg, 16px)', fontWeight: 700 }}>Yeni Ziyaret Kaydı</h3>
              <button onClick={() => setIsModalOpen(false)} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleCreateVisit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: 'var(--fs-sm, 12px)', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '4px' }}>Ziyaret Edilecek Müşteri *</label>
                <select
                  required
                  value={newVisit.customerId}
                  onChange={e => setNewVisit({ ...newVisit, customerId: e.target.value })}
                  style={{ width: '100%', padding: '10px 12px', background: 'var(--bg-surface)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm, 6px)', color: 'var(--text-main)', fontSize: 'var(--fs-base, 13px)' }}
                >
                  <option value="">-- Müşteri Seçiniz --</option>
                  {customers.map(c => (
                    <option key={c.id} value={c.id}>{c.title} ({c.code})</option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: 'var(--fs-sm, 12px)', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '4px' }}>Ziyaret Tarihi</label>
                  <input
                    type="date"
                    value={newVisit.visitDate}
                    onChange={e => setNewVisit({ ...newVisit, visitDate: e.target.value })}
                    style={{ width: '100%', padding: '8px 12px', background: 'var(--bg-surface)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm, 6px)', color: 'var(--text-main)', fontSize: 'var(--fs-base, 13px)' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 'var(--fs-sm, 12px)', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '4px' }}>Ziyaret Saati</label>
                  <input
                    type="time"
                    value={newVisit.startTime}
                    onChange={e => setNewVisit({ ...newVisit, startTime: e.target.value })}
                    style={{ width: '100%', padding: '8px 12px', background: 'var(--bg-surface)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm, 6px)', color: 'var(--text-main)', fontSize: 'var(--fs-base, 13px)' }}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 'var(--fs-sm, 12px)', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '4px' }}>Ziyaret Sonucu</label>
                <select
                  value={newVisit.outcome}
                  onChange={e => setNewVisit({ ...newVisit, outcome: e.target.value as any })}
                  style={{ width: '100%', padding: '10px 12px', background: 'var(--bg-surface)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm, 6px)', color: 'var(--text-main)', fontSize: 'var(--fs-base, 13px)' }}
                >
                  <option value="COLLECTION_MADE">Tahsilat Yapıldı</option>
                  <option value="ORDER_TAKEN">Sipariş Alındı</option>
                  <option value="DELIVERY_MADE">Teslimat Yapıldı</option>
                  <option value="NOT_FOUND">Müşteri Yerinde Bulunamadı</option>
                  <option value="REVISIT_REQUIRED">Tekrar Ziyaret Edilecek</option>
                  <option value="OTHER">Diğer</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 'var(--fs-sm, 12px)', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '4px' }}>Ziyaret Notları</label>
                <textarea
                  rows={3}
                  placeholder="Görüşme detayları..."
                  value={newVisit.notes}
                  onChange={e => setNewVisit({ ...newVisit, notes: e.target.value })}
                  style={{ width: '100%', padding: '8px 12px', background: 'var(--bg-surface)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm, 6px)', color: 'var(--text-main)', fontSize: 'var(--fs-base, 13px)' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  style={{ padding: '8px 16px', background: 'var(--bg-surface-secondary)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm, 6px)', color: 'var(--text-main)', cursor: 'pointer' }}
                >
                  İptal
                </button>
                <button
                  type="submit"
                  style={{ padding: '8px 20px', background: 'var(--primary)', border: 'none', borderRadius: 'var(--radius-sm, 6px)', color: '#fff', fontWeight: 700, cursor: 'pointer' }}
                >
                  Ziyareti Kaydet
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
