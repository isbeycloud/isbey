import fs from 'node:fs/promises';
import path from 'node:path';
import { createServer } from 'vite';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';

// Render exactly the same public component for everyone. No bot detection,
// private data, runtime API calls, credentials or paid-service activation.
const server = await createServer({ server: { middlewareMode: true, watch: null }, optimizeDeps: { noDiscovery: true, entries: [] }, appType: 'custom' });
try {
  const { LandingPage } = await server.ssrLoadModule('/src/pages/LandingPage.tsx');
  const { marketing, marketingFaqs, marketingFeatures } = await server.ssrLoadModule('/src/data/marketingContent.ts');
  const url = `${marketing.url}/`;
  const escape = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const structured = { '@context': 'https://schema.org', '@graph': [
    { '@type': 'Organization', '@id': `${url}#organization`, name: marketing.name, url, logo: `${marketing.url}/brand/isbey-cloud-logo.png` },
    { '@type': 'WebSite', '@id': `${url}#website`, name: marketing.name, url, inLanguage: 'tr-TR', publisher: { '@id': `${url}#organization` } },
    { '@type': 'SoftwareApplication', '@id': `${url}#software`, name: marketing.name, url, description: marketing.description, applicationCategory: 'BusinessApplication', operatingSystem: 'Web browser', inLanguage: 'tr-TR', publisher: { '@id': `${url}#organization` }, featureList: marketingFeatures.map(feature => feature.title) },
    { '@type': 'FAQPage', '@id': `${url}#sss`, inLanguage: 'tr-TR', mainEntity: marketingFaqs.map(faq => ({ '@type': 'Question', name: faq.question, acceptedAnswer: { '@type': 'Answer', text: faq.answer } })) },
  ] };
  const head = `<meta name="description" content="${escape(marketing.description)}" />
    <link rel="canonical" href="${url}" />
    <meta name="robots" content="index,follow,max-image-preview:large,max-snippet:-1" />
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="${escape(marketing.name)}" />
    <meta property="og:locale" content="tr_TR" />
    <meta property="og:title" content="${escape(marketing.title)}" />
    <meta property="og:description" content="${escape(marketing.description)}" />
    <meta property="og:url" content="${url}" />
    <meta property="og:image" content="${marketing.url}/brand/isbey-social.png" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:image:alt" content="İŞBEY CLOUD — Bulut ön muhasebe ve e-Fatura" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${escape(marketing.title)}" />
    <meta name="twitter:description" content="${escape(marketing.description)}" />
    <meta name="twitter:image" content="${marketing.url}/brand/isbey-social.png" />
    <meta name="twitter:image:alt" content="İŞBEY CLOUD — Ön muhasebe ve e-Fatura, aynı çalışma alanında" />
    <script type="application/ld+json">${JSON.stringify(structured).replace(/</g, '\\u003c')}</script>`;
  const entry = path.resolve('dist/index.html');
  let html = await fs.readFile(entry, 'utf8');
  if (html.includes('<!-- marketing-seo -->') && html.includes('<div id="root"></div>')) {
    html = html.replace(/<title>[^<]*<\/title>/, () => `<title>${escape(marketing.title)}</title>`).replace('<!-- marketing-seo -->', () => head).replace('<div id="root"></div>', () => `<div id="root">${renderToString(createElement(LandingPage, { onLoginClick() {}, onRegisterClick() {} }))}</div>`);
    await fs.writeFile(entry, html);
  } else if (!process.argv.includes('--sync-public')) throw Error('Marketing build placeholders are missing.');
  const robots = `# Public marketing content is crawlable by search and AI search crawlers.\nUser-agent: *\nUser-agent: OAI-SearchBot\nUser-agent: PerplexityBot\nUser-agent: Bingbot\nUser-agent: Googlebot\nAllow: /\nDisallow: /api/\nDisallow: /app/\nDisallow: /dashboard/\nDisallow: /src/\nDisallow: /accept-invite\nDisallow: /reset-password\nDisallow: /pay/\nDisallow: /share/\nDisallow: /*.json$\n\nSitemap: ${marketing.url}/sitemap.xml\n`;
  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url><loc>${url}</loc><lastmod>${marketing.updated}</lastmod></url>\n</urlset>\n`;
  const summary = `# ${marketing.name}\n\n> ${marketing.description}\n\n## Resmî kaynak\n\n- [Ürün tanıtımı](${url}): Özellikler, kullanım akışı, çözüm grupları ve sık sorulan sorular.\n- [Özellikler](${url}#ozellikler)\n- [Çözüm grupları](${url}#paketler)\n- [Sık sorulan sorular](${url}#sss)\n\n## Ürün kapsamı\n\n${marketingFeatures.map(feature => `- **${feature.title}:** ${feature.description}`).join('\n')}\n\n## Deneme, fiyat ve erişim\n\nDeneme kayıt tarihinde başlayan 14 günlük ön muhasebe denemesidir. İlk açılışta paket seçilir. İlk seçim ödeme veya otomatik tahsilat başlatmaz. e-Dönüşüm başvurusu, hizmet etkinleştirmesi ve firma entegratör bağlantısı ayrı süreçlerdir. Güncel satış fiyatları ve limitler hesaptaki Hizmetler ve Paketler ekranındadır; bu dosya fiyat teklifi değildir. İş menüleri etkin paket ve kullanıcı yetkileriyle sınırlanır.\n\n## Sık sorulan sorular\n\n${marketingFaqs.map(faq => `### ${faq.question}\n\n${faq.answer}`).join('\n\n')}\n\nSon içerik güncellemesi: ${marketing.updated}\n`;
  for (const [name, content] of Object.entries({ 'robots.txt': robots, 'sitemap.xml': sitemap, 'llms.txt': summary })) {
    await fs.writeFile(path.resolve('dist', name), content);
    if (process.argv.includes('--sync-public')) await fs.writeFile(path.resolve('public', name), content);
  }
  console.info(`Public landing page pre-rendered; canonical ${url}; ${marketingFaqs.length} visible FAQs and matching structured answers.`);
} finally { await server.close(); }
