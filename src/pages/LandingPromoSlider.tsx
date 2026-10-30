import { useEffect, useState } from 'react';
import { ArrowRight, ChevronLeft, ChevronRight, Pause, Phone, Play } from 'lucide-react';
import './LandingPromoSlider.css';

const slides = [
  { image: '/brand/isbey-tanitim.png', title: 'İŞBEY CLOUD', description: 'İşiniz için dijital çözümler', alt: 'İŞBEY CLOUD: Dijital dönüşümde güvenilir çözüm ortağınız. e-Fatura, e-Arşiv, e-İrsaliye, e-Defter, e-İmza ve Mali Mühür tanıtımı.' },
  { image: '/brand/beyoglu-tanitim.png', title: 'Beyoğlu Teknoloji', description: 'e-Dönüşüm hizmetleri · Satış, kurulum ve teknik destek', alt: 'Beyoğlu Teknoloji: Güvenli dijital çözümler. e-Dönüşüm hizmetleri, satış, kurulum ve teknik destek. Telefon: 0537 512 78 10.' },
];

export function LandingPromoSlider({ onRegisterClick }: { onRegisterClick: () => void }) {
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(true);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    setPaused(media.matches);
    const motionChange = () => { if (media.matches) setPaused(true); };
    const visibilityChange = () => setVisible(!document.hidden);
    visibilityChange();
    media.addEventListener('change', motionChange);
    document.addEventListener('visibilitychange', visibilityChange);
    return () => { media.removeEventListener('change', motionChange); document.removeEventListener('visibilitychange', visibilityChange); };
  }, []);
  useEffect(() => {
    if (paused || hovered || focused || !visible) return;
    const timer = window.setTimeout(() => setActive(index => (index + 1) % slides.length), 7000);
    return () => window.clearTimeout(timer);
  }, [active, paused, hovered, focused, visible]);
  const select = (index: number) => { setActive((index + slides.length) % slides.length); setPaused(true); };
  return <section className="lp-promo" aria-label="Tanıtım slaytları" aria-roledescription="slayt gösterisi"
    onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
    onFocusCapture={() => setFocused(true)} onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false); }}
    onKeyDown={event => { if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); select(active + (event.key === 'ArrowLeft' ? -1 : 1)); } }}>
    <div className="lp-promo-stage" aria-live={paused ? 'polite' : 'off'}>
      {slides.map((slide, index) => <div key={slide.image} className="lp-promo-slide" hidden={index !== active} role="group" aria-roledescription="slayt" aria-label={`${index + 1} / ${slides.length}: ${slide.title}`}>
        <img src={slide.image} alt={slide.alt} width="1899" height="829" fetchPriority={index === 0 ? 'high' : 'auto'} decoding="async" />
        <div className="lp-promo-caption"><div><strong>{slide.title}</strong><p>{slide.description}</p></div>
          {index === 0 ? <button type="button" onClick={onRegisterClick}>Ücretsiz deneyin <ArrowRight size={17} /></button> : <a href="tel:+905375127810"><Phone size={17} />0537 512 78 10</a>}
        </div>
      </div>)}
    </div>
    <div className="lp-promo-controls">
      <div className="lp-promo-arrows"><button type="button" aria-label="Önceki slayt" onClick={() => select(active - 1)}><ChevronLeft size={19} /></button><button type="button" aria-label="Sonraki slayt" onClick={() => select(active + 1)}><ChevronRight size={19} /></button></div>
      <div className="lp-promo-dots" role="group" aria-label="Slayt seçimi">{slides.map((slide, index) => <button key={slide.image} type="button" aria-label={`${slide.title} slaydını göster`} aria-pressed={index === active} onClick={() => select(index)}><span /></button>)}</div>
      <button type="button" className="lp-promo-play" aria-label={paused ? 'Otomatik geçişi başlat' : 'Otomatik geçişi duraklat'} onClick={() => setPaused(value => !value)}>{paused ? <Play size={15} /> : <Pause size={15} />}<span>{active + 1} / {slides.length}</span></button>
    </div>
  </section>;
}
