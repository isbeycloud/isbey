import React, { useState, useEffect, useRef } from 'react';
import {
  Zap, CheckCircle2, ArrowRight, ShieldCheck, Smartphone,
  BarChart3, Users, Package, FileText, Sparkles, HelpCircle,
  ChevronDown, ChevronUp, Building, CreditCard, Headphones,
  Check, Star, BookOpen, Briefcase, Calendar, DollarSign,
  Clock, TrendingUp, Send, X, Phone, Mail, MessageCircle,
  Play, Globe, Award, ChevronRight, ChevronLeft,
} from 'lucide-react';

interface LandingPageProps {
  onLoginClick: () => void;
  onRegisterClick: () => void;
}

/* ─── Renk Paleti (KULLANIMDIŞI) ──────────────────────────────────
   2026-09-13: Açık temaya geçişte bu yerel koyu palet referansları
   kaldırıldı; tüm stiller index.css'teki tasarım token'larını
   (var(--primary), var(--text-main), var(--bg-surface) ...) kullanıyor.
   Aşağıdaki nesne yalnızca tarihsel referans olarak duruyor —
   YENİ KODDA KULLANMAYIN, aksi halde açık tema bozulur.
   ────────────────────────────────────────────────────────────────── */
const C = {
  red: '#e53935',
  redDark: '#c62828',
  redLight: '#ffebee',
  redMid: '#ef5350',
  navy: '#1a1a2e',
  navyMid: '#16213e',
  navyLight: '#0f3460',
  white: '#ffffff',
  gray50: '#f8f9fa',
  gray100: '#f1f3f4',
  gray200: '#e8eaed',
  gray400: '#bdc1c6',
  gray500: '#9aa0a6',
  gray300: '#d1d5db',
  gray600: '#5f6368',
  gray700: '#3c4043',
  gray800: '#202124',
  green: '#2e7d32',
  greenLight: '#e8f5e9',
};

export const LandingPage: React.FC<LandingPageProps> = ({ onLoginClick, onRegisterClick }) => {
  /* ── Body scroll düzeltmesi ── */
  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const root = document.getElementById('root');
    const prevHO = html.style.overflow, prevBO = body.style.overflow;
    const prevHH = html.style.height, prevBH = body.style.height;
    const prevRO = root?.style.overflow ?? '', prevRH = root?.style.height ?? '';
    html.style.overflow = 'auto'; body.style.overflow = 'auto';
    html.style.height = 'auto'; body.style.height = 'auto';
    if (root) { root.style.overflow = 'visible'; root.style.height = 'auto'; }
    return () => {
      html.style.overflow = prevHO; body.style.overflow = prevBO;
      html.style.height = prevHH; body.style.height = prevBH;
      if (root) { root.style.overflow = prevRO; root.style.height = prevRH; }
    };
  }, []);

  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const [billingCycle, setBillingCycle] = useState<'MONTHLY' | 'ANNUAL'>('ANNUAL');
  const [activeFeature, setActiveFeature] = useState(0);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isDemoModalOpen, setIsDemoModalOpen] = useState(false);
  const [demoSubmitted, setDemoSubmitted] = useState(false);
  const [demoForm, setDemoForm] = useState({ name: '', phone: '', email: '', company: '', sector: 'Toptan & Dağıtım' });
  const [navScrolled, setNavScrolled] = useState(false);

  /* ── Scroll izle (nav shadow) ── */
  useEffect(() => {
    const onScroll = () => setNavScrolled(window.scrollY > 20);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  /* ── Özellik slider için auto-advance ── */
  useEffect(() => {
    const t = setInterval(() => setActiveFeature(p => (p + 1) % features.length), 4500);
    return () => clearInterval(t);
  }, []);

  const features = [
    {
      tab: 'Mobil',
      title: 'Her Yerden, Her Cihazdan Yönetin',
      desc: 'Bilgisayar, tablet veya cep telefonunuzdan; internet erişiminiz olan her yerden İŞBEY CLOUD ile işletmenizin ön muhasebe işlemlerini kesintisiz yönetin.',
      img: '/isbey-mobil.jpg',
      alt: 'İŞBEY CLOUD Mobil Uygulama',
    },
    {
      tab: 'e-Fatura',
      title: 'e-Fatura Programı',
      desc: 'GİB onaylı özel entegratör altyapımızla dakikalar içinde e-Fatura mükellefiyetinizi aktif edin. e-Faturanızı hızlı ve kolayca oluşturup anında gönderin.',
      img: '/isbey-efatura.jpg',
      alt: 'İŞBEY CLOUD e-Fatura Programı',
    },
    {
      tab: 'e-Arşiv',
      title: 'e-Arşiv Fatura',
      desc: 'e-Faturalı olun ya da olmayın; bilgisayardan, cep telefonundan veya tabletten e-Arşiv Fatura göndermek İŞBEY CLOUD ile çok hızlı ve kolay.',
      img: '/isbey-earsiv.jpg',
      alt: 'İŞBEY CLOUD e-Arşiv Fatura',
    },
    {
      tab: 'Cari Hesap',
      title: 'Online Cari Hesap Takip Programı',
      desc: 'Müşteri ve tedarikçilerinizle olan tahsilat/ödeme takibini online gerçekleştirin. B2B tahsilat linki ile SMS veya WhatsApp üzerinden anında ödeme alın.',
      img: '/isbey-cari.jpg',
      alt: 'İŞBEY CLOUD Cari Hesap',
    },
    {
      tab: 'Stok Takibi',
      title: 'Online Stok Takip Programı',
      desc: 'Gerçekleştirdiğiniz alış/satışlar sonrasında stoklarınız otomatik güncellenir. Giriş-çıkış hareketlerini, kritik stok eşiklerini kolayca görüntüleyin.',
      img: '/isbey-stok.jpg',
      alt: 'İŞBEY CLOUD Stok Takibi',
    },
    {
      tab: 'Nakit Yönetimi',
      title: 'Kasa ve Banka Hesabı Takibi',
      desc: 'Tahsilat ve ödemelerinizi kasa ve banka hesaplarınızla ilişkilendirerek nakit yönetimi takibini gerçekleştirin. 17+ banka entegrasyonu ile otomatik senkron.',
      img: '/isbey-nakit.jpg',
      alt: 'İŞBEY CLOUD Kasa Banka',
    },
    {
      tab: 'Raporlar',
      title: 'İşinizi İyi Yönetmeniz İçin Özet Raporlar',
      desc: 'Yaptığınız işlemlerin günlük özetlerini inceleyin, kar-zarar ve bilanço raporlarınıza anında erişin. 60+ işletme raporu ile işinizi daha iyi yönetin.',
      img: '/isbey-raporlar.jpg',
      alt: 'İŞBEY CLOUD Raporlar',
    },
    {
      tab: 'Entegrasyonlar',
      title: 'Entegrasyonlarla İşinizi Büyütün',
      desc: 'Trendyol, Hepsiburada, Amazon, 17 banka entegrasyonu, CRM, kargo ve akıllı fiş okuma. Tüm iş süreçlerinizi tek platformda birleştirin.',
      img: '/isbey-entegrasyon.jpg',
      alt: 'İŞBEY CLOUD Entegrasyonlar',
    },
  ];

  const faqs = [
    { q: 'İŞBEY CLOUD 14 günlük deneme gerçekten ücretsiz mi?', a: 'Evet, kredi kartı bilgisi girmeden 14 gün boyunca tüm modülleri sınırsızca deneyebilirsiniz. Üstelik 100 ücretsiz e-belge kontörü hediye edilir. Süre bitiminde hiçbir otomatik çekim uygulanmaz.' },
    { q: 'e-Fatura ve e-Arşiv geçişini nasıl yapabilirim?', a: 'İŞBEY CLOUD, GİB onaylı özel entegratördür. Kayıt sonrası mali mühür veya e-imzanız ile 15 dakikada e-Faturaya geçiş yapıp hemen resmi fatura kesmeye başlayabilirsiniz. Ücretsiz danışmanlık desteği sunuyoruz.' },
    { q: 'Mevcut programdaki cari ve stok verilerimi aktarabilir miyim?', a: 'Evet! Akıllı Excel İçe Aktarma Sihirbazı sayesinde eski programınızdan aldığınız Excel listelerini 2 dakikada hatasız şekilde sisteme yükleyebilirsiniz.' },
    { q: 'Muhasebeciyle birlikte kullanabilir miyim?', a: 'Kesinlikle! Muhasebecinize özel ücretsiz yetkili kullanıcı tanımlayabilirsiniz. Mali müşaviriniz kendi ofisinden tüm fatura ve beyanname verilerini inceleyip tek tıkla muhasebe yazılımına aktarabilir.' },
    { q: 'Verilerim güvende mi ve yedekleniyor mu?', a: 'Tüm verileriniz ISO 27001 sertifikalı Tier-3 Türkiye veri merkezlerinde 256-bit SSL şifreleme ile saklanır. Günde 3 kez coğrafi yedekleme yapılır. KVKK uyumlu altyapı.' },
    { q: 'Müşterilerimden online kredi kartı tahsilatı yapabilir miyim?', a: 'Evet! B2B Tahsilat özelliğiyle müşterilerinize SMS veya WhatsApp üzerinden güvenli 3D Secure ödeme linki gönderin. Tutar otomatik cari hesabına işlenir.' },
  ];

  const prices: Record<'MONTHLY' | 'ANNUAL', {
    name: string; monthlyPrice: number; yearlyTotal: number; featured?: boolean;
    gifts: string[]; features: string[]; cta: string;
  }[]> = {
    MONTHLY: [
      { name: 'e-Dönüşüm Paketi', monthlyPrice: 429, yearlyTotal: 5148, gifts: ['100 e-Belge Kontörü Hediye', 'Ücretsiz e-Fatura Geçiş Danışmanlığı'], features: ['e-Fatura, e-Arşiv, e-İrsaliye, e-SMM', 'Gelen/giden e-Fatura yönetimi', 'iOS ve Android mobil uygulama', 'e-Ticaret entegrasyonu', 'Online tahsilat entegrasyonu (Ücretsiz)', 'Mali Müşavir Paneli (Ücretsiz)'], cta: 'Ücretsiz Deneyin' },
      { name: 'Ön Muhasebe Paketi', monthlyPrice: 429, yearlyTotal: 5148, gifts: [], features: ['GİB e-Arşiv Fatura (Ücretsiz)', 'Alış/Satış fatura takibi', 'Cari hesap & alacak-borç takibi', 'Stok ve ürün takibi', 'Kasa & banka takibi', 'Çek-Senet portföyü', 'Banka entegrasyonu (Ücretsiz)', 'Akıllı fiş okuma (Ücretsiz)', 'iOS ve Android mobil uygulama'], cta: 'Ücretsiz Deneyin' },
      { name: 'e-Dönüşüm + Ön Muhasebe', monthlyPrice: 699, yearlyTotal: 8388, featured: true, gifts: ['Her İki Paketin Tüm Özellikleri', '100 e-Belge Kontörü Hediye'], features: ['e-Fatura, e-Arşiv, e-İrsaliye, e-SMM', 'GİB e-Arşiv Fatura', 'Cari hesap & stok & kasa-banka', 'Çek-Senet portföyü', 'B2B online tahsilat', 'Banka entegrasyonu (Ücretsiz)', '17+ banka desteği', 'CRM, kargo, e-ticaret entegrasyonu', 'Yapay Zeka Finans Asistanı'], cta: 'Ücretsiz Deneyin' },
    ],
    ANNUAL: [
      { name: 'e-Dönüşüm Paketi', monthlyPrice: 349, yearlyTotal: 4188, gifts: ['Yıllık 1000 e-Belge Kontörü Hediye', 'Ücretsiz e-Fatura Geçiş Danışmanlığı'], features: ['e-Fatura, e-Arşiv, e-İrsaliye, e-SMM', 'Gelen/giden e-Fatura yönetimi', 'iOS ve Android mobil uygulama', 'e-Ticaret entegrasyonu', 'Online tahsilat entegrasyonu (Ücretsiz)', 'Mali Müşavir Paneli (Ücretsiz)'], cta: 'Ücretsiz Deneyin' },
      { name: 'Ön Muhasebe Paketi', monthlyPrice: 349, yearlyTotal: 4188, gifts: [], features: ['GİB e-Arşiv Fatura (Ücretsiz)', 'Alış/Satış fatura takibi', 'Cari hesap & alacak-borç takibi', 'Stok ve ürün takibi', 'Kasa & banka takibi', 'Çek-Senet portföyü', 'Banka entegrasyonu (Ücretsiz)', 'Akıllı fiş okuma (Ücretsiz)', 'iOS ve Android mobil uygulama'], cta: 'Ücretsiz Deneyin' },
      { name: 'e-Dönüşüm + Ön Muhasebe', monthlyPrice: 599, yearlyTotal: 7188, featured: true, gifts: ['Her İki Paketin Tüm Özellikleri', 'Yıllık 1000 e-Belge Kontörü Hediye', '1 Yıllık e-İmza HEDİYE'], features: ['e-Fatura, e-Arşiv, e-İrsaliye, e-SMM', 'GİB e-Arşiv Fatura', 'Cari hesap & stok & kasa-banka', 'Çek-Senet portföyü', 'B2B online tahsilat', 'Banka entegrasyonu (Ücretsiz)', '17+ banka desteği', 'CRM, kargo, e-ticaret entegrasyonu', 'Yapay Zeka Finans Asistanı'], cta: 'Ücretsiz Deneyin' },
    ],
  };

  const testimonials = [
    { name: 'Ahmet K.', role: 'Toptan Gıda', rating: 5, text: 'e-Fatura geçişimizi 15 dakikada hallettik. Artık her yerden fatura kesebiliyoruz. Harika destek ekibi!' },
    { name: 'Selin Ö.', role: 'E-ticaret Satıcısı', rating: 5, text: 'Trendyol siparişlerim otomatik faturalanıyor, stok takibi çok pratik. İŞBEY olmadan düşünemiyorum.' },
    { name: 'Murat D.', role: 'İnşaat Malzemeleri', rating: 5, text: 'Müşterilerime WhatsApp\'tan ödeme linki atıyorum, anında tahsilat yapıyorum. Çok kullanışlı.' },
    { name: 'Fatma Y.', role: 'Serbest Mali Müşavir', rating: 5, text: 'Mükelleflerin faturalarına tek ekrandan erişiyorum. Mali müşavir paneli gerçekten çok iyi düşünülmüş.' },
    { name: 'Kerem E.', role: 'Teknoloji Mağazası', rating: 5, text: 'POS satışı, stok ve e-fatura hepsi entegre. Ayrı programlara gerek kalmadı, maliyet de düştü.' },
    { name: 'Zeynep A.', role: 'Tekstil Üreticisi', rating: 5, text: 'Çek-senet takibini artık ihmal etmiyoruz. Sistem hatırlatıyor, vade kaçırmıyoruz. Teşekkürler.' },
  ];

  const handleDemoSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setDemoSubmitted(true);
    setTimeout(() => {
      setIsDemoModalOpen(false);
      setDemoSubmitted(false);
      setDemoForm({ name: '', phone: '', email: '', company: '', sector: 'Toptan & Dağıtım' });
    }, 2000);
  };

  // ─── Inline CSS Helpers ──────────────────────────────────────────
  // 2026-09-13: Koyu tema renk literalleri (gradient + renkli glow) açık tema token'larına çevrildi;
  // gradyan yerine düz --primary kullanılıyor ki marka rengi tek kaynaktan yönetilsin.
  const btnRed: React.CSSProperties = {
    background: 'var(--primary)',
    color: '#ffffff', border: 'none', borderRadius: 'var(--radius-sm, 6px)',
    fontWeight: 700, cursor: 'pointer',
    transition: 'all 0.2s',
  };
  const btnOutline: React.CSSProperties = {
    background: 'transparent', color: 'var(--primary)',
    border: '2px solid var(--primary)', borderRadius: 'var(--radius-sm, 6px)',
    fontWeight: 700, cursor: 'pointer', transition: 'all 0.2s',
  };
  const card: React.CSSProperties = {
    background: 'var(--bg-surface)', borderRadius: 'var(--radius-lg, 10px)',
    border: '1px solid var(--border-color)',
    boxShadow: 'var(--shadow-sm)',
    transition: 'box-shadow 0.2s, transform 0.2s',
  };

  return (
    <div style={{ background: 'var(--bg-surface)', color: 'var(--text-main)', fontFamily: "'Inter','Geist',system-ui,-apple-system,sans-serif", overflowX: 'hidden', minHeight: '100vh' }}>

      {/* ── ANNOUNCEMENT BAND ─────────────────────────────────── */}
      <div style={{ background: 'var(--bg-surface-secondary)', color: 'var(--text-main)', padding: '10px 20px', textAlign: 'center', fontSize: 'var(--fs-base, 13px)', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px', flexWrap: 'wrap' }}>
        <span><strong>Hoş Geldin Kampanyası:</strong> İlk 3 ay %30 indirim + 100 ücretsiz e-belge kontörü — Sınırlı kontenjan!</span>
        <button onClick={onRegisterClick} style={{ ...btnRed, padding: '5px 16px', fontSize: 'var(--fs-sm, 12px)', borderRadius: 'var(--radius-xs, 4px)', boxShadow: 'none' }}>Hemen Başla →</button>
      </div>

      {/* ── NAV ──────────────────────────────────────────────────── */}
      <nav style={{
        position: 'sticky', top: 0, zIndex: 60, background: 'var(--bg-surface)',
        borderBottom: '1px solid var(--border-color)',
        boxShadow: navScrolled ? 'var(--shadow-sm)' : 'none',
        transition: 'box-shadow 0.3s', padding: '0 24px',
      }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: '68px' }}>

          {/* Logo */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }} onClick={onLoginClick}>
            <div style={{ width: '38px', height: '38px', borderRadius: 'var(--radius-lg, 10px)', background: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Zap size={20} color="#fff" />
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 'var(--fs-lg, 16px)', letterSpacing: '-0.5px', color: 'var(--text-main)' }}>
                İŞBEY <span style={{ color: 'var(--primary)', fontWeight: 700 }}>CLOUD</span>
              </div>
              <div style={{ fontSize: 'var(--fs-xs, 11px)', color: 'var(--text-muted)', letterSpacing: '0.5px', marginTop: '-2px' }}>GİB Onaylı Bulut ERP</div>
            </div>
          </div>

          {/* Desktop Nav Links */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: 'var(--fs-base, 13px)', fontWeight: 500 }}>
            {[
              { label: 'Özellikler', href: '#features' },
              { label: 'e-Fatura', href: '#features' },
              { label: 'Entegrasyonlar', href: '#integrations' },
              { label: 'Fiyatlar', href: '#pricing' },
              { label: 'Müşteriler', href: '#testimonials' },
              { label: 'SSS', href: '#faq' },
            ].map(l => (
              <a key={l.label} href={l.href} style={{ color: 'var(--text-muted)', textDecoration: 'none', padding: '8px 12px', borderRadius: 'var(--radius-sm, 6px)', transition: 'background 0.15s, color 0.15s' }}
                onMouseEnter={e => { (e.target as HTMLElement).style.background = 'var(--bg-surface-hover)'; (e.target as HTMLElement).style.color = 'var(--primary)'; }}
                onMouseLeave={e => { (e.target as HTMLElement).style.background = 'transparent'; (e.target as HTMLElement).style.color = 'var(--text-muted)'; }}
              >{l.label}</a>
            ))}
          </div>

          {/* Nav CTA */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <button onClick={onLoginClick} style={{ ...btnOutline, padding: '9px 20px', fontSize: 'var(--fs-base, 13px)' }}>Giriş Yap</button>
            <button onClick={onRegisterClick} style={{ ...btnRed, padding: '10px 22px', fontSize: 'var(--fs-base, 13px)', display: 'flex', alignItems: 'center', gap: '6px' }}>
              14 Gün Ücretsiz Deneyin <ArrowRight size={15} />
            </button>
          </div>
        </div>
      </nav>

      {/* ── HERO ─────────────────────────────────────────────────── */}
      <section id="hero" aria-labelledby="hero-heading"
        style={{ background: 'var(--bg-surface-secondary)', color: 'var(--text-main)', minHeight: '580px', display: 'flex', alignItems: 'center', position: 'relative', overflow: 'hidden' }}
      >
        {/* Hero Bg Image Overlay */}
        <div style={{ position: 'absolute', inset: 0, backgroundImage: 'url(/hero-bg.webp)', backgroundSize: 'cover', backgroundPosition: 'center right', opacity: 0.18, zIndex: 0 }} />

        <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '70px 24px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '48px', alignItems: 'center', width: '100%', position: 'relative', zIndex: 1 }}>
          {/* Left */}
          <div>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', background: 'var(--primary-light)', border: '1px solid var(--primary-glow)', padding: '6px 16px', borderRadius: 'var(--radius-pill, 9999px)', fontSize: 'var(--fs-sm, 12px)', fontWeight: 700, color: 'var(--primary)', marginBottom: '22px', letterSpacing: '0.5px' }}>
              <Sparkles size={13} /> GİB Canlı Entegratör Onaylı
            </div>

            <h1 id="hero-heading" itemProp="name" style={{ fontSize: 'clamp(1.9rem, 3.5vw, 3rem)', fontWeight: 700, lineHeight: 1.17, letterSpacing: '-1px', marginBottom: '20px' }}>
              Türkiye'nin KOBİ'leri İçin<br />
              <span style={{ color: 'var(--primary)' }}>e-Fatura</span> ve<br />
              <span style={{ color: 'var(--primary)' }}>Ön Muhasebe Programı</span>
            </h1>

            <p itemProp="description" style={{ fontSize: 'var(--fs-lg, 16px)', color: 'var(--text-muted)', lineHeight: 1.7, marginBottom: '32px', maxWidth: '500px' }}>
              15 dakikada e-Faturaya geçin, her yerden ön muhasebenizi yönetin!<br />
              <strong style={{ color: 'var(--text-main)' }}>14 gün ücretsiz</strong> deneyin, kredi kartı gerekmez.
            </p>

            {/* Email CTA */}
            <div style={{ background: 'var(--bg-surface)', borderRadius: 'var(--radius-md, 8px)', padding: '18px', marginBottom: '20px', maxWidth: '440px', boxShadow: 'var(--shadow-lg)' }}>
              <input type="email" placeholder="E-posta Adresiniz" style={{ width: '100%', border: '2px solid var(--border-color)', borderRadius: 'var(--radius-sm, 6px)', padding: '13px 16px', fontSize: 'var(--fs-md, 14px)', color: 'var(--text-main)', background: 'var(--bg-surface)', outline: 'none', marginBottom: '10px', boxSizing: 'border-box' }}
                onFocus={e => (e.target.style.borderColor = 'var(--primary)')}
                onBlur={e => (e.target.style.borderColor = 'var(--border-color)')}
              />
              <button onClick={onRegisterClick} style={{ ...btnRed, width: '100%', padding: '14px', fontSize: 'var(--fs-md, 14px)', borderRadius: 'var(--radius-sm, 6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                14 Gün Ücretsiz Deneyin <ArrowRight size={18} />
              </button>
            </div>

            {/* Trust badges */}
            <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap', fontSize: 'var(--fs-sm, 12px)', color: 'var(--text-muted)' }}>
              {['Kredi Kartı Gerekmez', '100 e-Belge Kontörü Hediye', 'GİB & ISO 27001 Onaylı'].map(t => (
                <span key={t} style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <CheckCircle2 size={15} color="var(--success)" /> {t}
                </span>
              ))}
            </div>
          </div>

          {/* Right — App Screenshot */}
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
            <div style={{ position: 'relative' }}>
              <div style={{ background: 'var(--bg-surface)', borderRadius: 'var(--radius-lg, 10px)', padding: '12px', border: '1px solid var(--border-color)', boxShadow: 'var(--shadow-lg)' }}>
                <img src="/isbey-hero-preview.jpg" alt="İŞBEY CLOUD Uygulama Ekranı" style={{ width: '100%', maxWidth: '540px', borderRadius: 'var(--radius-md, 8px)', display: 'block', boxShadow: 'var(--shadow-md)' }} />
              </div>
              {/* Floating badge */}
              <div style={{ position: 'absolute', bottom: '-16px', left: '50%', transform: 'translateX(-50%)', background: 'var(--bg-surface)', borderRadius: 'var(--radius-md, 8px)', padding: '10px 20px', display: 'flex', alignItems: 'center', gap: '10px', boxShadow: 'var(--shadow-md)', whiteSpace: 'nowrap' }}>
                <div style={{ display: 'flex', gap: '2px' }}>{[1,2,3,4,5].map(i => <Star key={i} size={14} fill="#f59e0b" color="#f59e0b" />)}</div>
                <span style={{ fontSize: 'var(--fs-base, 13px)', fontWeight: 700, color: 'var(--text-main)' }}>4.9/5 — 1.240+ Değerlendirme</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── STAT BAR ─────────────────────────────────────────────── */}
      <section style={{ background: 'var(--bg-surface-secondary)', borderBottom: '1px solid var(--border-color)', padding: '28px 24px' }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto', display: 'flex', justifyContent: 'space-around', flexWrap: 'wrap', gap: '16px', textAlign: 'center' }}>
          {[
            { num: '70.000+', label: 'Aktif İşletme' },
            { num: '15 dk', label: 'e-Fatura Geçiş Süresi' },
            { num: '%99.98', label: 'Bulut Uptime' },
            { num: '17+', label: 'Banka Entegrasyonu' },
            { num: '7/24', label: 'Müşteri Desteği' },
          ].map(s => (
            <div key={s.num} style={{ minWidth: '140px' }}>
              <div style={{ fontSize: 'var(--fs-2xl, 26px)', fontWeight: 700, color: 'var(--primary)', letterSpacing: '-0.5px' }}>{s.num}</div>
              <div style={{ fontSize: 'var(--fs-sm, 12px)', color: 'var(--text-muted)', fontWeight: 500, marginTop: '4px' }}>{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── FEATURES SLIDER ─────────────────────────────────────── */}
      <section id="features" style={{ padding: '80px 24px', background: 'var(--bg-surface)' }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
          <h2 style={{ textAlign: 'center', fontSize: 'var(--fs-xl, 20px)', fontWeight: 700, color: 'var(--text-main)', marginBottom: '36px', letterSpacing: '-0.5px' }}>Özellikler</h2>

          {/* Tab Bar */}
          <div style={{ display: 'flex', justifyContent: 'center', flexWrap: 'wrap', gap: '6px', marginBottom: '40px' }}>
            {features.map((f, i) => (
              <button key={f.tab} onClick={() => setActiveFeature(i)}
                style={{ padding: '8px 18px', borderRadius: 'var(--radius-pill, 9999px)', border: `2px solid ${i === activeFeature ? 'var(--primary)' : 'var(--border-color)'}`, background: i === activeFeature ? 'var(--primary)' : 'var(--bg-surface)', color: i === activeFeature ? '#ffffff' : 'var(--text-muted)', fontWeight: 700, fontSize: 'var(--fs-sm, 12px)', cursor: 'pointer', transition: 'all 0.2s' }}
              >{f.tab}</button>
            ))}
          </div>

          {/* Feature Content */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '48px', alignItems: 'center', background: 'var(--bg-surface-secondary)', borderRadius: 'var(--radius-lg, 10px)', padding: '40px', border: '1px solid var(--border-color)' }}>
            <div>
              <img src={features[activeFeature].img} alt={features[activeFeature].alt}
                style={{ width: '100%', borderRadius: 'var(--radius-md, 8px)', boxShadow: 'var(--shadow-md)', display: 'block' }} />
            </div>
            <div>
              <h3 style={{ fontSize: 'var(--fs-lg, 16px)', fontWeight: 700, color: 'var(--text-main)', marginBottom: '16px', lineHeight: 1.3 }}>{features[activeFeature].title}</h3>
              <p style={{ fontSize: 'var(--fs-md, 14px)', color: 'var(--text-muted)', lineHeight: 1.7, marginBottom: '28px' }}>{features[activeFeature].desc}</p>
              <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                <button onClick={onRegisterClick} style={{ ...btnRed, padding: '12px 24px', fontSize: 'var(--fs-md, 14px)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  Ücretsiz Dene <ArrowRight size={16} />
                </button>
                <button onClick={() => setIsDemoModalOpen(true)} style={{ ...btnOutline, padding: '12px 20px', fontSize: 'var(--fs-md, 14px)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Calendar size={16} /> Demo İste
                </button>
              </div>
            </div>
          </div>

          {/* Feature Nav Arrows */}
          <div style={{ display: 'flex', justifyContent: 'center', gap: '12px', marginTop: '20px' }}>
            <button onClick={() => setActiveFeature(p => (p - 1 + features.length) % features.length)}
              style={{ width: '40px', height: '40px', borderRadius: '50%', border: '2px solid var(--border-color)', background: 'var(--bg-surface)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--text-muted)' }}>
              <ChevronLeft size={18} />
            </button>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              {features.map((_, i) => (
                <button key={i} onClick={() => setActiveFeature(i)}
                  style={{ width: i === activeFeature ? '24px' : '8px', height: '8px', borderRadius: 'var(--radius-xs, 4px)', background: i === activeFeature ? 'var(--primary)' : 'var(--border-color)', border: 'none', cursor: 'pointer', transition: 'all 0.3s', padding: 0 }} />
              ))}
            </div>
            <button onClick={() => setActiveFeature(p => (p + 1) % features.length)}
              style={{ width: '40px', height: '40px', borderRadius: '50%', border: '2px solid var(--border-color)', background: 'var(--bg-surface)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--text-muted)' }}>
              <ChevronRight size={18} />
            </button>
          </div>
        </div>
      </section>

      {/* ── INTEGRATIONS SECTION ─────────────────────────────────── */}
      <section id="integrations" style={{ background: 'var(--bg-surface-secondary)', padding: '70px 24px', borderTop: '1px solid var(--border-color)' }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto', textAlign: 'center' }}>
          <h2 style={{ fontSize: 'var(--fs-xl, 20px)', fontWeight: 700, color: 'var(--text-main)', marginBottom: '12px' }}>Entegrasyonlarla İşinizi Büyütün</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: 'var(--fs-md, 14px)', marginBottom: '48px', maxWidth: '600px', margin: '0 auto 48px' }}>
            Banka, pazaryeri, kargo ve muhasebe yazılımlarıyla tam entegrasyon. Tüm iş süreçleriniz tek platformda.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '20px', marginBottom: '40px' }}>
            {[
              { icon: <Building size={28} color="var(--primary)" />, title: '17+ Banka Entegrasyonu', desc: 'Garanti, İş Bankası, Akbank, Yapı Kredi ve daha fazlası. Hesap hareketleri otomatik senkron.' },
              { icon: <Package size={28} color="var(--primary)" />, title: 'Pazaryeri Entegrasyonu', desc: 'Trendyol, Hepsiburada, Amazon TR. Siparişler otomatik faturalanır, stok otomatik güncellenir.' },
              { icon: <Smartphone size={28} color="var(--primary)" />, title: 'Kargo Entegrasyonu', desc: 'Aras, MNG, Yurtiçi, UPS ile sipariş bazlı kargo takibi ve otomatik irsaliye.' },
              { icon: <FileText size={28} color="var(--primary)" />, title: 'CRM Entegrasyonu', desc: 'Tekliften satışa, faturalamaya kadar tüm süreci hatasız takip edin.' },
              { icon: <BarChart3 size={28} color="var(--primary)" />, title: 'Akıllı Fiş Okuma', desc: 'Gider fişinizin fotoğrafını çekin, otomatik gider kaydına dönüşsün. Yapay zeka destekli.' },
              { icon: <CreditCard size={28} color="var(--primary)" />, title: 'Online Tahsilat', desc: 'SMS veya WhatsApp ile 3D Secure ödeme linki gönderin. Tutar anında cari hesaba işlenir.' },
            ].map(item => (
              <div key={item.title} style={{ ...card, padding: '24px', textAlign: 'left' }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.boxShadow = 'var(--shadow-md)'; (e.currentTarget as HTMLElement).style.transform = 'translateY(-3px)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.boxShadow = 'var(--shadow-sm)'; (e.currentTarget as HTMLElement).style.transform = 'none'; }}
              >
                <div style={{ background: 'var(--primary-light)', width: '52px', height: '52px', borderRadius: 'var(--radius-md, 8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '14px' }}>{item.icon}</div>
                <div style={{ fontWeight: 700, fontSize: 'var(--fs-md, 14px)', color: 'var(--text-main)', marginBottom: '8px' }}>{item.title}</div>
                <div style={{ fontSize: 'var(--fs-base, 13px)', color: 'var(--text-muted)', lineHeight: 1.6 }}>{item.desc}</div>
              </div>
            ))}
          </div>

          <button onClick={onRegisterClick} style={{ ...btnRed, padding: '14px 32px', fontSize: 'var(--fs-md, 14px)', display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
            Tüm Entegrasyonları Görün <ArrowRight size={16} />
          </button>
        </div>
      </section>

      {/* ── PRICING ─────────────────────────────────────────────── */}
      <section id="pricing" style={{ background: 'var(--bg-surface)', padding: '80px 24px' }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
          <h2 style={{ textAlign: 'center', fontSize: 'var(--fs-xl, 20px)', fontWeight: 700, color: 'var(--text-main)', marginBottom: '8px' }}>İhtiyacınıza En Uygun Paketler</h2>
          <p style={{ textAlign: 'center', color: 'var(--text-muted)', marginBottom: '32px', fontSize: 'var(--fs-md, 14px)' }}>14 gün ücretsiz deneyin. Kredi kartı gerekmez.</p>

          {/* Toggle */}
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '40px' }}>
            <div style={{ display: 'flex', background: 'var(--bg-surface-secondary)', borderRadius: 'var(--radius-md, 8px)', padding: '4px', position: 'relative' }}>
              {(['MONTHLY', 'ANNUAL'] as const).map(b => (
                <button key={b} onClick={() => setBillingCycle(b)}
                  style={{ padding: '10px 24px', borderRadius: 'var(--radius-sm, 6px)', border: 'none', fontWeight: 700, fontSize: 'var(--fs-base, 13px)', cursor: 'pointer', background: billingCycle === b ? 'var(--bg-surface)' : 'transparent', color: billingCycle === b ? 'var(--primary)' : 'var(--text-muted)', boxShadow: billingCycle === b ? 'var(--shadow-xs)' : 'none', transition: 'all 0.2s' }}>
                  {b === 'MONTHLY' ? 'Aylık' : 'Yıllık'} {b === 'ANNUAL' && <span style={{ background: 'var(--primary)', color: '#ffffff', fontSize: 'var(--fs-xs, 11px)', padding: '2px 7px', borderRadius: 'var(--radius-xs, 4px)', marginLeft: '6px' }}>%25 İndirim</span>}
                </button>
              ))}
            </div>
          </div>

          {/* Price Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '24px' }}>
            {prices[billingCycle].map((pkg, i) => (
              <div key={pkg.name} style={{ ...card, padding: '28px', position: 'relative', border: pkg.featured ? '2px solid var(--primary)' : '1px solid var(--border-color)', transform: pkg.featured ? 'scale(1.03)' : 'none' }}>
                {pkg.featured && (
                  <div style={{ position: 'absolute', top: '-14px', left: '50%', transform: 'translateX(-50%)', background: 'var(--primary)', color: '#ffffff', padding: '5px 16px', borderRadius: 'var(--radius-pill, 9999px)', fontSize: 'var(--fs-sm, 12px)', fontWeight: 700, whiteSpace: 'nowrap' }}>
                    En Çok Tercih Edilen
                  </div>
                )}
                <div style={{ fontWeight: 700, fontSize: 'var(--fs-md, 14px)', color: 'var(--text-main)', marginBottom: '16px' }}>{pkg.name}</div>
                <div style={{ marginBottom: '6px' }}>
                  <span style={{ fontSize: 'var(--fs-2xl, 26px)', fontWeight: 700, color: 'var(--primary)' }}>{pkg.monthlyPrice} ₺</span>
                  <span style={{ fontSize: 'var(--fs-sm, 12px)', color: 'var(--text-muted)' }}> + KDV / Aylık</span>
                </div>
                <div style={{ fontSize: 'var(--fs-sm, 12px)', color: 'var(--text-muted)', marginBottom: '20px' }}>
                  Yıllık toplam <strong>{pkg.yearlyTotal.toLocaleString('tr')} ₺</strong> + KDV ödenir
                </div>

                {/* Gifts */}
                {pkg.gifts.length > 0 && (
                  <div style={{ background: 'var(--primary-light)', borderRadius: 'var(--radius-sm, 6px)', padding: '10px 14px', marginBottom: '16px' }}>
                    {pkg.gifts.map(g => (
                      <div key={g} style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', fontSize: 'var(--fs-sm, 12px)', fontWeight: 700, color: 'var(--primary)', marginBottom: '4px' }}>
                        {g}
                      </div>
                    ))}
                  </div>
                )}

                {/* Feature list */}
                <ul style={{ listStyle: 'none', margin: '0 0 24px', padding: 0, display: 'flex', flexDirection: 'column', gap: '9px' }}>
                  {pkg.features.map(f => (
                    <li key={f} style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', fontSize: 'var(--fs-sm, 12px)', color: 'var(--text-muted)' }}>
                      <CheckCircle2 size={16} color="var(--success)" style={{ flexShrink: 0, marginTop: '2px' }} /> {f}
                    </li>
                  ))}
                </ul>

                <button onClick={onRegisterClick}
                  style={pkg.featured ? { ...btnRed, width: '100%', padding: '14px', fontSize: 'var(--fs-md, 14px)', borderRadius: 'var(--radius-sm, 6px)' } : { ...btnOutline, width: '100%', padding: '13px', fontSize: 'var(--fs-md, 14px)', borderRadius: 'var(--radius-sm, 6px)' }}>
                  {pkg.cta}
                </button>
              </div>
            ))}
          </div>

          <p style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 'var(--fs-sm, 12px)', marginTop: '24px' }}>
            Tüm paketlerde 14 gün ücretsiz deneme hakkı. KDV hariç fiyatlardır.
          </p>
        </div>
      </section>

      {/* ── TESTIMONIALS ─────────────────────────────────────────── */}
      <section id="testimonials" style={{ background: 'var(--bg-surface-secondary)', padding: '70px 24px', borderTop: '1px solid var(--border-color)' }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
          <h2 style={{ textAlign: 'center', fontSize: 'var(--fs-xl, 20px)', fontWeight: 700, color: 'var(--text-main)', marginBottom: '8px' }}>Müşterilerimiz Ne Diyor?</h2>
          <p style={{ textAlign: 'center', color: 'var(--text-muted)', marginBottom: '48px' }}>Kullanan 10 kişiden 9'u İŞBEY CLOUD'u öneriyor.</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '20px' }}>
            {testimonials.map(t => (
              <div key={t.name} style={{ ...card, padding: '24px' }}>
                <div style={{ display: 'flex', gap: '3px', marginBottom: '12px' }}>
                  {[1,2,3,4,5].map(i => <Star key={i} size={16} fill="#f59e0b" color="#f59e0b" />)}
                </div>
                <p style={{ color: 'var(--text-muted)', fontSize: 'var(--fs-base, 13px)', lineHeight: 1.65, marginBottom: '16px', fontStyle: 'italic' }}>"{t.text}"</p>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div style={{ width: '38px', height: '38px', borderRadius: '50%', background: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ffffff', fontWeight: 700, fontSize: 'var(--fs-md, 14px)' }}>
                    {t.name[0]}
                  </div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 'var(--fs-base, 13px)', color: 'var(--text-main)' }}>{t.name}</div>
                    <div style={{ fontSize: 'var(--fs-sm, 12px)', color: 'var(--text-muted)' }}>{t.role}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FAQ ─────────────────────────────────────────────────── */}
      <section id="faq" style={{ background: 'var(--bg-surface)', padding: '70px 24px' }}>
        <div style={{ maxWidth: '860px', margin: '0 auto' }}>
          <h2 style={{ textAlign: 'center', fontSize: 'var(--fs-xl, 20px)', fontWeight: 700, color: 'var(--text-main)', marginBottom: '8px' }}>Sık Sorulan Sorular</h2>
          <p style={{ textAlign: 'center', color: 'var(--text-muted)', marginBottom: '40px' }}>Aklınızdaki soruların yanıtları burada.</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {faqs.map((faq, i) => (
              <div key={i} style={{ border: '1px solid var(--border-color)', borderRadius: 'var(--radius-lg, 10px)', overflow: 'hidden', transition: 'border-color 0.2s' }}>
                <button onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '18px 20px', background: openFaq === i ? 'var(--primary-light)' : 'var(--bg-surface)', border: 'none', cursor: 'pointer', textAlign: 'left', gap: '12px', transition: 'background 0.2s' }}>
                  <span style={{ fontWeight: 700, fontSize: 'var(--fs-md, 14px)', color: 'var(--text-main)', lineHeight: 1.4 }}>{faq.q}</span>
                  <span style={{ flexShrink: 0, color: 'var(--primary)' }}>{openFaq === i ? <ChevronUp size={20} /> : <ChevronDown size={20} />}</span>
                </button>
                {openFaq === i && (
                  <div style={{ padding: '0 20px 18px', background: 'var(--primary-light)', fontSize: 'var(--fs-base, 13px)', color: 'var(--text-muted)', lineHeight: 1.7 }}>{faq.a}</div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FINAL CTA ─────────────────────────────────────────────── */}
      <section style={{ background: 'var(--bg-surface-secondary)', color: 'var(--text-main)', padding: '70px 24px', textAlign: 'center' }}>
        <div style={{ maxWidth: '700px', margin: '0 auto' }}>
          <h2 style={{ fontSize: 'var(--fs-xl, 20px)', fontWeight: 700, marginBottom: '16px', letterSpacing: '-0.5px' }}>
            İşletmenizi Dijital Geleceğe Taşıyın
          </h2>
          <p style={{ fontSize: 'var(--fs-lg, 16px)', color: 'var(--text-muted)', marginBottom: '36px', lineHeight: 1.7 }}>
            70.000'den fazla işletme İŞBEY CLOUD'a güveniyor. Siz de 14 gün ücretsiz deneyin, farkı hissedin.
          </p>
          <div style={{ display: 'flex', gap: '14px', justifyContent: 'center', flexWrap: 'wrap' }}>
            <button onClick={onRegisterClick} style={{ ...btnRed, padding: '16px 36px', fontSize: 'var(--fs-lg, 16px)', display: 'flex', alignItems: 'center', gap: '8px', background: 'var(--primary)' }}>
              14 Gün Ücretsiz Deneyin <ArrowRight size={18} />
            </button>
            <button onClick={() => setIsDemoModalOpen(true)} style={{ padding: '16px 28px', fontSize: 'var(--fs-lg, 16px)', borderRadius: 'var(--radius-md, 8px)', border: '2px solid var(--border-color)', background: 'transparent', color: 'var(--text-main)', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Calendar size={16} /> Canlı Demo Talep Et
            </button>
          </div>
          <div style={{ display: 'flex', gap: '20px', justifyContent: 'center', flexWrap: 'wrap', marginTop: '24px', fontSize: 'var(--fs-base, 13px)', color: 'var(--text-muted)' }}>
            {['Kredi kartı gerekmez', '1 dakikada kurulum', 'GİB & ISO 27001 onaylı', '7/24 destek'].map(t => (
              <span key={t} style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                <Check size={14} color="var(--success)" /> {t}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ── FOOTER ────────────────────────────────────────────────── */}
      <footer style={{ background: 'var(--bg-surface)', color: 'var(--text-muted)', padding: '50px 24px 28px' }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', gap: '40px', marginBottom: '40px' }}>

            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
                <div style={{ width: '36px', height: '36px', borderRadius: 'var(--radius-lg, 10px)', background: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Zap size={20} color="#fff" />
                </div>
                <span style={{ fontWeight: 700, fontSize: 'var(--fs-lg, 16px)', color: 'var(--text-main)' }}>İŞBEY <span style={{ color: 'var(--primary)' }}>CLOUD</span></span>
              </div>
              <p style={{ fontSize: 'var(--fs-base, 13px)', lineHeight: 1.7, marginBottom: '16px', maxWidth: '260px' }}>
                KOBİ ve kurumsal işletmeler için GİB onaylı bulut tabanlı Ön Muhasebe ve e-Fatura platformu.
              </p>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {['ISO 27001', 'KVKK', '256-bit SSL', 'GİB Onaylı'].map(b => (
                  <span key={b} style={{ fontSize: 'var(--fs-xs, 11px)', fontWeight: 700, background: 'var(--bg-surface-secondary)', color: 'var(--info)', padding: '3px 9px', borderRadius: 'var(--radius-xs, 4px)', border: '1px solid var(--border-color)' }}>{b}</span>
                ))}
              </div>
            </div>

            <div>
              <div style={{ fontWeight: 700, color: 'var(--text-main)', marginBottom: '16px', fontSize: 'var(--fs-md, 14px)' }}>Ürün</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: 'var(--fs-base, 13px)' }}>
                {['e-Fatura', 'e-Arşiv', 'Ön Muhasebe', 'Stok Takibi', 'Hızlı POS', 'B2B Tahsilat'].map(l => (
                  <a key={l} href="#features" style={{ color: 'var(--text-muted)', textDecoration: 'none', transition: 'color 0.2s' }}
                    onMouseEnter={e => (e.target as HTMLElement).style.color = 'var(--primary)'}
                    onMouseLeave={e => (e.target as HTMLElement).style.color = 'var(--text-muted)'}
                  >{l}</a>
                ))}
              </div>
            </div>

            <div>
              <div style={{ fontWeight: 700, color: 'var(--text-main)', marginBottom: '16px', fontSize: 'var(--fs-md, 14px)' }}>Şirket</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: 'var(--fs-base, 13px)' }}>
                {['Hakkımızda', 'Müşteriler', 'Blog', 'Kariyer', 'Bayilik', 'İletişim'].map(l => (
                  <a key={l} href="#" style={{ color: 'var(--text-muted)', textDecoration: 'none', transition: 'color 0.2s' }}
                    onMouseEnter={e => (e.target as HTMLElement).style.color = 'var(--primary)'}
                    onMouseLeave={e => (e.target as HTMLElement).style.color = 'var(--text-muted)'}
                  >{l}</a>
                ))}
              </div>
            </div>

            <div>
              <div style={{ fontWeight: 700, color: 'var(--text-main)', marginBottom: '16px', fontSize: 'var(--fs-md, 14px)' }}>İletişim</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', fontSize: 'var(--fs-base, 13px)' }}>
                <a href="tel:08503000000" style={{ color: 'var(--text-muted)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Phone size={15} color="var(--primary)" /> 0850 300 00 00
                </a>
                <a href="mailto:destek@isbey.cloud" style={{ color: 'var(--text-muted)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Mail size={15} color="var(--primary)" /> destek@isbey.cloud
                </a>
                <a href="https://wa.me/908503000000" target="_blank" rel="noreferrer" style={{ color: 'var(--text-muted)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <MessageCircle size={15} color="var(--primary)" /> WhatsApp Destek
                </a>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Building size={15} color="var(--primary)" />
                  <span>Teknopark İstanbul / Kadıköy</span>
                </div>
              </div>
            </div>
          </div>

          <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', fontSize: 'var(--fs-sm, 12px)' }}>
            <div>
              <span itemScope itemType="https://schema.org/Organization"><span itemProp="name">İŞBEY Teknoloji ve Ticaret A.Ş.</span></span>
              {' '}© 2026 — Tüm hakları saklıdır.
            </div>
            <div style={{ display: 'flex', gap: '18px', flexWrap: 'wrap' }}>
              {['Gizlilik Politikası', 'Kullanım Şartları', 'KVKK Aydınlatma', 'Çerez Politikası'].map(l => (
                <span key={l} style={{ cursor: 'pointer', transition: 'color 0.2s' }}
                  onMouseEnter={e => (e.target as HTMLElement).style.color = 'var(--primary)'}
                  onMouseLeave={e => (e.target as HTMLElement).style.color = ''}
                >{l}</span>
              ))}
              <a href="/sitemap.xml" style={{ color: 'var(--text-muted)', textDecoration: 'none' }} rel="nofollow">Site Haritası</a>
            </div>
          </div>
        </div>
      </footer>

      {/* ── FLOATING WHATSAPP BUTTON ─────────────────────────────── */}
      <a href="https://wa.me/908503000000?text=Merhaba,%20İŞBEY%20CLOUD%20hakkında%20bilgi%20almak%20istiyorum."
        target="_blank" rel="noreferrer"
        style={{ position: 'fixed', bottom: '24px', right: '24px', zIndex: 90, width: '56px', height: '56px', borderRadius: '50%', background: '#25d366', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ffffff', textDecoration: 'none', transition: 'transform 0.2s, box-shadow 0.2s' }}
        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = 'scale(1.1)'; }}
        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = 'scale(1)'; }}
        title="WhatsApp'tan Bize Yazın"
      >
        <MessageCircle size={28} />
      </a>

      {/* ── DEMO MODAL ──────────────────────────────────────────── */}
      {isDemoModalOpen && (
        <div className="modal-overlay" style={{ zIndex: 100 }}>
          <div style={{ background: 'var(--bg-surface)', borderRadius: 'var(--radius-lg, 10px)', padding: '36px', maxWidth: '480px', width: '100%', boxShadow: 'var(--shadow-xl)', position: 'relative' }}>
            <button onClick={() => setIsDemoModalOpen(false)} style={{ position: 'absolute', top: '16px', right: '16px', background: 'var(--bg-surface-secondary)', border: 'none', borderRadius: '50%', width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
              <X size={16} color="var(--text-muted)" />
            </button>

            {demoSubmitted ? (
              <div style={{ textAlign: 'center', padding: '20px 0' }}>
                <h3 style={{ fontSize: 'var(--fs-lg, 16px)', fontWeight: 700, color: 'var(--text-main)', marginBottom: '12px' }}>Talebiniz Alındı!</h3>
                <p style={{ color: 'var(--text-muted)', lineHeight: 1.6 }}>Uzman danışmanımız <strong>15 dakika içinde</strong> sizi arayacaktır.</p>
              </div>
            ) : (
              <>
                <div style={{ textAlign: 'center', marginBottom: '24px' }}>
                  <h3 style={{ fontSize: 'var(--fs-lg, 16px)', fontWeight: 700, color: 'var(--text-main)' }}>Canlı Demo Talep Et</h3>
                  <p style={{ color: 'var(--text-muted)', fontSize: 'var(--fs-md, 14px)', marginTop: '6px' }}>Uzmanımız size özel 30 dakikalık demo sunar.</p>
                </div>
                <form onSubmit={handleDemoSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  {[
                    { key: 'name', label: 'Ad Soyad', placeholder: 'Ahmet Yılmaz', type: 'text' },
                    { key: 'phone', label: 'Telefon', placeholder: '0532 000 00 00', type: 'tel' },
                    { key: 'email', label: 'E-posta', placeholder: 'ahmet@firma.com', type: 'email' },
                    { key: 'company', label: 'Firma Adı', placeholder: 'Yılmaz Ticaret Ltd. Şti.', type: 'text' },
                  ].map(field => (
                    <div key={field.key}>
                      <label style={{ fontSize: 'var(--fs-base, 13px)', fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: '6px' }}>{field.label}</label>
                      <input type={field.type} required placeholder={field.placeholder}
                        value={(demoForm as any)[field.key]}
                        onChange={e => setDemoForm(f => ({ ...f, [field.key]: e.target.value }))}
                        style={{ width: '100%', border: `2px solid var(--border-color)`, borderRadius: 'var(--radius-sm, 6px)', padding: '11px 14px', fontSize: 'var(--fs-md, 14px)', outline: 'none', boxSizing: 'border-box', transition: 'border-color 0.2s' }}
                        onFocus={e => (e.target.style.borderColor = 'var(--primary)')}
                        onBlur={e => (e.target.style.borderColor = 'var(--border-color)')}
                      />
                    </div>
                  ))}
                  <button type="submit" style={{ ...btnRed, padding: '14px', fontSize: 'var(--fs-md, 14px)', width: '100%', borderRadius: 'var(--radius-sm, 6px)', marginTop: '4px' }}>
                    Demo Talep Gönder →
                  </button>
                </form>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
