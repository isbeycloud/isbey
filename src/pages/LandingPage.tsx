import { useEffect, useState } from 'react';
import { ArrowRight, Check, ChevronDown, FileText, Landmark, Menu, Package, ShieldCheck, Users, X, BarChart3, Cloud } from 'lucide-react';
import { BrandLogo } from '../components/common/BrandLogo';
import { marketing, marketingFaqs, marketingFeatures } from '../data/marketingContent';
import { LandingWorkspacePreview } from './LandingWorkspacePreview';
import './LandingPage.css';

interface LandingPageProps { onLoginClick: () => void; onRegisterClick: () => void }
const icons = [Users, FileText, Package, Landmark, Cloud, BarChart3];
const solutionGroups = [
  { title: 'Ön muhasebe', text: 'Günlük ticari işlerinizi takip etmek için.', items: ['Cari hesap ve alacak / borç takibi', 'Alış, satış ve ürün kayıtları', 'Kasa, banka ve dönem raporları'] },
  { title: 'e-Dönüşüm', text: 'Firmanızın e-belge süreçlerini yönetmek için.', items: ['e-Fatura ve e-Arşiv işlemleri', 'Gelen ve giden belge takibi', 'Firmaya özel entegratör bağlantısı'] },
  { title: 'Birlikte kullanım', text: 'İhtiyacınız olan hizmetleri bir araya getirmek için.', items: ['Etkin paketlerin birleşik kapsamı', 'Kapsama göre sadeleşen menüler', 'Kullanıcılara göre erişim yetkileri'] },
];

export const LandingPage = ({ onLoginClick, onRegisterClick }: LandingPageProps) => {
  const [mobileMenu, setMobileMenu] = useState(false);
  useEffect(() => {
    const elements = [document.documentElement, document.body, document.getElementById('root')].filter(Boolean) as HTMLElement[];
    const previous = elements.map(element => ({ element, overflow: element.style.overflow, height: element.style.height }));
    elements.forEach(element => { element.style.overflow = 'visible'; element.style.height = 'auto'; });
    document.body.classList.add('marketing-visible');
    return () => { previous.forEach(({ element, overflow, height }) => { element.style.overflow = overflow; element.style.height = height; }); document.body.classList.remove('marketing-visible'); };
  }, []);

  return <div className="landing-page">
    <a className="lp-skip" href="#icerik">İçeriğe geç</a>
    <header className="lp-header">
      <div className="lp-container lp-nav">
        <a href="#" aria-label="İŞBEY CLOUD ana sayfa"><BrandLogo width={205} /></a>
        <nav className={`lp-links ${mobileMenu ? 'lp-links-open' : ''}`} aria-label="Tanıtım menüsü">
          {[['#ozellikler', 'Özellikler'], ['#nasil-calisir', 'Nasıl çalışır?'], ['#paketler', 'Çözümler'], ['#sss', 'Sık sorulanlar']].map(([href, label]) => <a key={href} href={href} onClick={() => setMobileMenu(false)}>{label}</a>)}
        </nav>
        <div className="lp-nav-actions"><button className="lp-login" type="button" onClick={onLoginClick}>Giriş Yap <ArrowRight size={15} /></button><button className="lp-menu-toggle" type="button" aria-label={mobileMenu ? 'Menüyü kapat' : 'Menüyü aç'} aria-expanded={mobileMenu} onClick={() => setMobileMenu(!mobileMenu)}>{mobileMenu ? <X size={22} /> : <Menu size={22} />}</button></div>
      </div>
    </header>
    <main id="icerik">
      <section className="lp-container lp-hero" aria-labelledby="lp-title">
        <div className="lp-hero-copy"><p className="lp-eyebrow"><span /> İŞİNİZE ODAKLANIN</p>
          <h1 id="lp-title">Ön muhasebe ve <em>e-Fatura.</em><br />Aynı çalışma alanında.</h1>
          <p className="lp-lead">Cari hesaplar, faturalar, stok ve nakit takibi. İşletmenizin günlük işlerini tek tek programlarda aramadan, İŞBEY CLOUD ile yönetin.</p>
          <div className="lp-hero-actions"><button type="button" className="lp-button lp-button-primary" onClick={onRegisterClick}>Ücretsiz Dene <ArrowRight size={18} /></button><a className="lp-text-link" href="#nasil-calisir">Nasıl çalıştığını görün <ChevronDown size={16} /></a></div>
          <ul className="lp-assurances"><li><Check size={15} />14 gün ücretsiz deneme</li><li><Check size={15} />İlk seçimde ödeme yok</li><li><Check size={15} />Tarayıcıdan erişim</li></ul>
        </div>
        <div className="lp-hero-visual"><div className="lp-visual-label"><span>DAHA AZ KARMAŞA</span><span>DAHA NET BİR BAKIŞ ↘</span></div><LandingWorkspacePreview /><div className="lp-visual-foot"><ShieldCheck size={16} /> Yalnızca paketinize ve yetkilerinize uygun iş menüleri.</div></div>
      </section>
      <div className="lp-fit-strip"><div className="lp-container"><p>Günlük ticari işler için tek bir merkez.</p><div><span>Perakende</span><i /> <span>Toptan ticaret</span><i /><span>Hizmet işletmeleri</span><i /><span>Firma yöneticileri</span></div></div></div>
      <section id="ozellikler" className="lp-container lp-section" aria-labelledby="features-title">
        <div className="lp-section-heading"><div><p className="lp-eyebrow">GÜNLÜK İŞİNİZİN İÇİNDE</p><h2 id="features-title">Birbirinden kopuk kayıtlar yerine,<br />birlikte çalışan süreçler.</h2></div><p>İŞBEY CLOUD; ürün, müşteri ve finans kayıtlarınızı aynı yerde takip etmenize yardımcı olur. Kullanabileceğiniz hizmetler etkin paketinize göre belirlenir.</p></div>
        <div className="lp-features">{marketingFeatures.map((feature, index) => { const Icon = icons[index]; return <article key={feature.id}><div className="lp-feature-top"><Icon size={23} /><span>0{index + 1}</span></div><h3>{feature.title}</h3><p>{feature.description}</p><small>{feature.detail}</small></article>; })}</div>
      </section>
      <section id="nasil-calisir" className="lp-workflow" aria-labelledby="workflow-title"><div className="lp-container lp-workflow-grid">
        <div><p className="lp-eyebrow">BAŞLAMAK İÇİN</p><h2 id="workflow-title">İşinize uygun kapsam.<br />Size ait bir çalışma alanı.</h2><p>İhtiyacınız olan hizmetleri seçin. Paket kapsamı dışındaki iş menüleriyle ekranınızı kalabalıklaştırmayın.</p><button type="button" className="lp-button lp-button-primary" onClick={onRegisterClick}>Denemeyi başlat <ArrowRight size={17} /></button></div>
        <ol className="lp-steps">{[
          ['Hesabınızı oluşturun', 'VKN / TCKN ve iletişim bilgilerinizle kayıt işlemini başlatın. Hesap erişim bilgilerinizi e-postadan takip edin.'],
          ['Paketinizi seçin', 'İlk açılışta kullanacağınız hizmetleri belirleyin. Seçiminiz kaydedilir; ilk paket seçiminde ödeme alınmaz.'],
          ['İşlemlerinize başlayın', 'Yetkiniz ve paketiniz kapsamındaki cari, ürün, fatura ve finans kayıtlarıyla çalışın.'],
        ].map(([title, description], index) => <li key={title}><span>0{index + 1}</span><div><h3>{title}</h3><p>{description}</p></div></li>)}</ol>
      </div></section>
      <section id="paketler" className="lp-container lp-section" aria-labelledby="packages-title">
        <div className="lp-section-heading"><div><p className="lp-eyebrow">İHTİYACINIZA GÖRE</p><h2 id="packages-title">Bugünkü işinize uygun başlayın.</h2></div><p>Çözüm gruplarını inceleyin. Güncel paket kapsamları, ücretler ve kullanım sınırları hesabınızdaki <strong>Hizmetler ve Paketler</strong> ekranında yer alır.</p></div>
        <div className="lp-solutions">{solutionGroups.map((group, index) => <article key={group.title} className={index === 2 ? 'lp-solution-featured' : ''}><span className="lp-solution-index">0{index + 1} / ÇÖZÜM</span><h3>{group.title}</h3><p>{group.text}</p><ul>{group.items.map(item => <li key={item}><Check size={16} />{item}</li>)}</ul><button type="button" className="lp-button" onClick={onRegisterClick}>Hizmetleri incele <ArrowRight size={16} /></button></article>)}</div>
        <p className="lp-package-note">e-Dönüşüm hizmetleri, ilgili başvuru ve firma bağlantısı tamamlandıktan sonra kullanılabilir. Deneme süresi ön muhasebe içindir.</p>
      </section>
      <section id="sss" className="lp-faq-section" aria-labelledby="faq-title"><div className="lp-container lp-faq-grid"><div><p className="lp-eyebrow">AKLINIZDAKİ SORULAR</p><h2 id="faq-title">Başlamadan önce<br />bilmek isteyecekleriniz.</h2><p>Ürün, paketler ve deneme süreci hakkında net yanıtlar.</p></div><div className="lp-faqs">{marketingFaqs.map(faq => <details key={faq.question}><summary>{faq.question}<ChevronDown size={18} /></summary><p>{faq.answer}</p></details>)}</div></div></section>
      <section className="lp-container lp-final"><div><p className="lp-eyebrow">İŞİNİZE BİRAZ DAHA NET BAKIN.</p><h2>İlk adımı bugün atın.</h2><p>14 günlük denemenizle çalışma alanınızı keşfedin.</p></div><button type="button" className="lp-button lp-button-primary" onClick={onRegisterClick}>Ücretsiz hesabınızı oluşturun <ArrowRight size={18} /></button></section>
    </main>
    <footer className="lp-footer"><div className="lp-container"><div><BrandLogo width={180} /><p>Bulut ön muhasebe ve işletme yönetimi.</p></div><nav aria-label="Alt menü"><a href="#ozellikler">Özellikler</a><a href="#paketler">Çözümler</a><a href="#sss">Sık sorulanlar</a><a href="/llms.txt">Ürün özeti</a></nav><small>© {marketing.updated.slice(0, 4)} İŞBEY CLOUD</small></div></footer>
  </div>;
};
