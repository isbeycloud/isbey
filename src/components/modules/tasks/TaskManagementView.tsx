import React, { useState, useEffect } from 'react';
import {
  CheckSquare,
  Plus,
  Clock,
  CheckCircle2,
  AlertCircle,
  User,
  Calendar,
  Filter,
  Tag,
  MessageSquare,
  X,
} from 'lucide-react';
import { api } from '../../../services/api';
import { useToast } from '../../../context/ToastContext';
import type { WorkspaceTask } from '../../../types';

export const TaskManagementView: React.FC = () => {
  const { showToast } = useToast();
  const [tasks, setTasks] = useState<WorkspaceTask[]>([]);
  const [filterStatus, setFilterStatus] = useState<string>('ALL');
  const [isLoading, setIsLoading] = useState(true);

  // New Task Modal
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [newTask, setNewTask] = useState({
    title: '',
    description: '',
    assignedToUserId: 'usr-saha-1',
    assignedToName: 'Ahmet Saha',
    priority: 'MEDIUM' as WorkspaceTask['priority'],
    dueDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
  });

  useEffect(() => {
    loadTasks();
  }, []);

  const loadTasks = async () => {
    setIsLoading(true);
    try {
      const res = await api.getWorkspaceTasks();
      if (res.success) setTasks(res.tasks || []);
    } catch (err: any) {
      showToast(err.message || 'Görevler yüklenemedi.', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTask.title) return;

    try {
      const res = await api.createWorkspaceTask(newTask);
      if (res.success) {
        showToast(res.message, 'success');
        setIsTaskModalOpen(false);
        setNewTask({
          title: '',
          description: '',
          assignedToUserId: 'usr-saha-1',
          assignedToName: 'Ahmet Saha',
          priority: 'MEDIUM',
          dueDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        });
        loadTasks();
      }
    } catch (err: any) {
      showToast(err.message || 'Görev oluşturulamadı.', 'error');
    }
  };

  const handleUpdateStatus = async (taskId: string, newStatus: string) => {
    try {
      const res = await api.updateWorkspaceTaskStatus(taskId, newStatus);
      if (res.success) {
        showToast(res.message, 'success');
        loadTasks();
      }
    } catch (err: any) {
      showToast(err.message || 'Durum güncellenemedi.', 'error');
    }
  };

  const filteredTasks = tasks.filter(t => filterStatus === 'ALL' || t.status === filterStatus);

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
      <div style={{ maxWidth: '1280px', margin: '0 auto' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ width: '46px', height: '46px', borderRadius: 'var(--radius-sm, 6px)', background: 'var(--primary-light)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <CheckSquare size={26} color="var(--primary)" />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <h1 style={{ fontSize: 'var(--fs-xl, 20px)', fontWeight: 700, margin: 0 }}>
                  Görev Yönetimi & Ortak Workspace
                </h1>
                <span className="badge badge-success">
                  {tasks.length} Görev
                </span>
              </div>
              <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: 'var(--fs-sm, 12px)' }}>
                Mali müşavir, yönetici ve saha personeli arasında görev dağılımı ve durum takibi
              </p>
            </div>
          </div>

          <button
            onClick={() => setIsTaskModalOpen(true)}
            style={{ padding: '10px 18px', background: 'var(--primary)', border: 'none', borderRadius: 'var(--radius-sm, 6px)', color: '#fff', fontWeight: 700, fontSize: 'var(--fs-sm, 12px)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}
          >
            <Plus size={18} />
            <span>Yeni Görev Ata</span>
          </button>
        </div>

        {/* Filtreler */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
          {[
            { id: 'ALL', label: 'Tüm Görevler' },
            { id: 'NEW', label: 'Yeni' },
            { id: 'IN_PROGRESS', label: 'Devam Ediyor' },
            { id: 'COMPLETED', label: 'Tamamlandı' },
          ].map(f => (
            <button
              key={f.id}
              onClick={() => setFilterStatus(f.id)}
              style={{
                padding: '8px 16px',
                borderRadius: 'var(--radius-sm, 6px)',
                border: 'none',
                background: filterStatus === f.id ? 'var(--primary)' : 'var(--bg-surface-secondary)',
                color: filterStatus === f.id ? '#fff' : 'var(--text-muted)',
                fontWeight: 700,
                fontSize: 'var(--fs-sm, 12px)',
                cursor: 'pointer',
              }}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Görev Kartları Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '16px' }}>
          {filteredTasks.map(t => (
            <div
              key={t.id}
              style={{
                background: 'var(--bg-surface)',
                borderRadius: 'var(--radius-md, 8px)',
                border: '1px solid var(--border-color)',
                padding: '18px 20px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
              }}
            >
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
                  <span style={{
                    padding: '2px 8px',
                    borderRadius: 'var(--radius-xs, 4px)',
                    fontSize: 'var(--fs-xs, 11px)',
                    fontWeight: 700,
                    background:
                      t.priority === 'CRITICAL' ? 'var(--danger-bg)' :
                      t.priority === 'HIGH' ? 'var(--warning-bg)' :
                      'var(--info-bg)',
                    color:
                      t.priority === 'CRITICAL' ? 'var(--danger-text)' :
                      t.priority === 'HIGH' ? 'var(--warning-text)' :
                      'var(--info-text)',
                  }}>
                    {t.priority} Öncelik
                  </span>

                  <span className={t.status === 'COMPLETED' ? 'badge badge-success' : 'badge badge-warning'}>
                    {t.status}
                  </span>
                </div>

                <h3 style={{ margin: '0 0 6px', fontSize: 'var(--fs-lg, 16px)', fontWeight: 700, color: 'var(--text-main)' }}>
                  {t.title}
                </h3>
                <p style={{ margin: '0 0 14px', color: 'var(--text-muted)', fontSize: 'var(--fs-sm, 12px)', lineHeight: '1.4' }}>
                  {t.description}
                </p>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: 'var(--fs-sm, 12px)', color: 'var(--text-main)', borderTop: '1px solid var(--border-light)', paddingTop: '10px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <User size={14} color="var(--info)" />
                    <span><b>Atanan:</b> {t.assignedToName} (Oluşturan: {t.createdByName})</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Calendar size={14} color="var(--warning)" />
                    <span><b>Son Tarih:</b> {t.dueDate}</span>
                  </div>
                </div>
              </div>

              {/* Durum Değiştirme Butonları */}
              <div style={{ display: 'flex', gap: '6px', marginTop: '14px', paddingTop: '10px', borderTop: '1px solid var(--border-light)' }}>
                {t.status !== 'IN_PROGRESS' && t.status !== 'COMPLETED' && (
                  <button
                    onClick={() => handleUpdateStatus(t.id, 'IN_PROGRESS')}
                    style={{ flex: 1, padding: '6px', background: 'var(--info)', border: 'none', borderRadius: 'var(--radius-sm, 6px)', color: '#fff', fontSize: 'var(--fs-sm, 12px)', fontWeight: 700, cursor: 'pointer' }}
                  >
                    Başlat
                  </button>
                )}
                {t.status !== 'COMPLETED' && (
                  <button
                    onClick={() => handleUpdateStatus(t.id, 'COMPLETED')}
                    style={{ flex: 1, padding: '6px', background: 'var(--success)', border: 'none', borderRadius: 'var(--radius-sm, 6px)', color: '#fff', fontSize: 'var(--fs-sm, 12px)', fontWeight: 700, cursor: 'pointer' }}
                  >
                    Tamamla
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* New Task Modal */}
      {isTaskModalOpen && (
        // 2026-09-13: Karartma .modal-overlay sınıfından gelir; satır içi koyu arka plan + blur kaldırıldı ki açık temada tutarlı kalsın.
        <div className="modal-overlay" style={{ zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ width: '90vw', maxWidth: '480px', background: 'var(--bg-surface)', borderRadius: 'var(--radius-lg, 10px)', border: '1px solid var(--border-color)', padding: '24px', color: 'var(--text-main)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ margin: 0, fontSize: 'var(--fs-lg, 16px)', fontWeight: 700 }}>Yeni Görev Tanımla & Ata</h3>
              <button onClick={() => setIsTaskModalOpen(false)} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleCreateTask} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: 'var(--fs-xs, 11px)', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '4px' }}>Görev Başlığı</label>
                <input
                  type="text"
                  required
                  placeholder="Örn: Ekim Ayı Mazot Fişlerinin Girilmesi"
                  value={newTask.title}
                  onChange={e => setNewTask({ ...newTask, title: e.target.value })}
                  style={{ width: '100%', padding: '8px 12px', background: 'var(--bg-surface-secondary)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm, 6px)', color: 'var(--text-main)', fontSize: 'var(--fs-base, 13px)' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 'var(--fs-xs, 11px)', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '4px' }}>Açıklama</label>
                <textarea
                  rows={3}
                  required
                  value={newTask.description}
                  onChange={e => setNewTask({ ...newTask, description: e.target.value })}
                  style={{ width: '100%', padding: '8px 12px', background: 'var(--bg-surface-secondary)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm, 6px)', color: 'var(--text-main)', fontSize: 'var(--fs-base, 13px)' }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: 'var(--fs-xs, 11px)', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '4px' }}>Kime Atanacak?</label>
                  <select
                    value={newTask.assignedToUserId}
                    onChange={e => {
                      const name = e.target.value === 'usr-accountant' ? 'SMMM Yetkilisi' : 'Ahmet Saha';
                      setNewTask({ ...newTask, assignedToUserId: e.target.value, assignedToName: name });
                    }}
                    style={{ width: '100%', padding: '8px 12px', background: 'var(--bg-surface-secondary)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm, 6px)', color: 'var(--text-main)', fontSize: 'var(--fs-base, 13px)' }}
                  >
                    <option value="usr-saha-1">Ahmet Saha (Saha Personeli)</option>
                    <option value="usr-accountant">Mali Müşavir (SMMM Yetkilisi)</option>
                    <option value="usr-admin">Yönetici</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 'var(--fs-xs, 11px)', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '4px' }}>Öncelik</label>
                  <select
                    value={newTask.priority}
                    onChange={e => setNewTask({ ...newTask, priority: e.target.value as any })}
                    style={{ width: '100%', padding: '8px 12px', background: 'var(--bg-surface-secondary)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm, 6px)', color: 'var(--text-main)', fontSize: 'var(--fs-base, 13px)' }}
                  >
                    <option value="LOW">Düşük</option>
                    <option value="MEDIUM">Orta</option>
                    <option value="HIGH">Yüksek</option>
                    <option value="CRITICAL">Kritik</option>
                  </select>
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 'var(--fs-xs, 11px)', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '4px' }}>Son Teslim Tarihi</label>
                <input
                  type="date"
                  value={newTask.dueDate}
                  onChange={e => setNewTask({ ...newTask, dueDate: e.target.value })}
                  style={{ width: '100%', padding: '8px 12px', background: 'var(--bg-surface-secondary)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm, 6px)', color: 'var(--text-main)', fontSize: 'var(--fs-base, 13px)' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
                <button
                  type="button"
                  onClick={() => setIsTaskModalOpen(false)}
                  style={{ padding: '8px 16px', background: 'var(--bg-surface-secondary)', border: 'none', borderRadius: 'var(--radius-sm, 6px)', color: 'var(--text-main)', cursor: 'pointer' }}
                >
                  İptal
                </button>
                <button
                  type="submit"
                  style={{ padding: '8px 20px', background: 'var(--primary)', border: 'none', borderRadius: 'var(--radius-sm, 6px)', color: '#fff', fontWeight: 700, cursor: 'pointer' }}
                >
                  Görevi Oluştur
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
