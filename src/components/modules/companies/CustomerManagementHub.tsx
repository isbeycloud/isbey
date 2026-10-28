import { useEffect, useState } from 'react';
import { Building2, Users, Settings2 } from 'lucide-react';
import { useAuth } from '../../../context/AuthContext';
import { CompanyManagementView } from './CompanyManagementView';
import { HizliBayiYonetimeView } from '../hizlibilisim/HizliBayiYonetimeView';
import { PlatformAdminView } from '../platform/PlatformAdminView';
import './CustomerManagementHub.css';

type Section = 'companies' | 'portfolio' | 'platform';
export function CustomerManagementHub({ initialSection = 'companies' }: { initialSection?: Section }) {
  const { canAccessModule } = useAuth();
  const [section, setSection] = useState<Section>(initialSection);
  useEffect(() => setSection(initialSection), [initialSection]);
  const sections = [
    { id: 'companies' as const, module: 'companies', label: 'Firmalar', description: 'Firma bilgileri, kullanıcılar ve paket / ücret yönetimi', icon: Building2 },
    { id: 'portfolio' as const, module: 'hizlibilisim', label: 'Müşteri Havuzu', description: 'Müşteri aktarımı, firma eşleştirme ve e-hizmet başvuruları', icon: Users },
    { id: 'platform' as const, module: 'platform-admin', label: 'Platform Ayarları', description: 'Paket tarifeleri, kontör paketleri ve platform özeti', icon: Settings2 },
  ].filter(item => canAccessModule(item.module));
  const active = sections.find(item => item.id === section) || sections[0];
  if (!active) return <p role="alert">Müşteri ve firma yönetimine erişim yetkiniz bulunmuyor.</p>;
  return <div className="customer-management-hub">
    <header className="customer-management-header">
      <div><h1>Müşteri & Firma Yönetimi</h1><p>Firma kaydından paket ve kullanıcı yönetimine, tüm müşteri işlemleri tek yerde.</p></div>
      <span className="customer-management-current">{active.label}</span>
    </header>
    <nav className="customer-management-sections" aria-label="Müşteri yönetimi bölümleri">
      {sections.map(item => <button key={item.id} type="button" aria-current={active.id === item.id ? 'page' : undefined}
        onClick={() => setSection(item.id)}><item.icon size={19} aria-hidden="true" /><span><strong>{item.label}</strong><small>{item.description}</small></span></button>)}
    </nav>
    <section className="customer-management-body" aria-label={active.label}>
      {active.id === 'companies' && <CompanyManagementView />}
      {active.id === 'portfolio' && <HizliBayiYonetimeView embedded />}
      {active.id === 'platform' && <PlatformAdminView embedded onOpenCompanies={canAccessModule('companies') ? () => setSection('companies') : undefined} />}
    </section>
  </div>;
}
