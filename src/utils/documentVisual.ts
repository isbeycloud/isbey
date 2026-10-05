import type { DocumentVisualResponse } from '../services/api';
import { transformXmlWithXsltInBrowser } from './xsltTransform';
import qrcode from 'qrcode-generator';

qrcode.stringToBytes = value => Array.from(new TextEncoder().encode(value));

/** Belge çıktısı aktif içerik çalıştırmadan gösterilir ve yazdırılır. */
export function renderDocumentVisual(response: DocumentVisualResponse): string {
  const result = transformXmlWithXsltInBrowser(response.xml, response.xslt);
  if (!result.ok) throw new Error(result.error || 'Belge XSLT ile görüntülenemedi.');
  const document = new DOMParser().parseFromString(result.html, 'text/html');
  // Şablonun QR verisini işler; şablondaki JavaScript hiçbir zaman çalıştırılmaz.
  const qrValue = document.getElementById('qrvalue')?.textContent?.trim();
  const qrTarget = document.getElementById('qrcode');
  const existingQr = document.getElementById('qrkod');
  if (qrValue && new TextEncoder().encode(qrValue).length <= 1000 && qrTarget && !existingQr?.getAttribute('src')?.startsWith('data:image/')) {
    const qr = qrcode(0, 'H');
    qr.addData(qrValue, 'Byte');
    qr.make();
    const image = document.createElement('img');
    image.alt = 'Fatura karekodu'; image.width = 180; image.height = 180;
    image.src = qr.createDataURL(2, 0);
    qrTarget.replaceChildren(image);
    existingQr?.remove();
  }
  document.querySelectorAll('script, iframe, object, embed, base, meta[http-equiv], link').forEach(node => node.remove());
  document.querySelectorAll('*').forEach(node => {
    for (const attr of Array.from(node.attributes)) {
      if (/^on/i.test(attr.name) || attr.name === 'srcdoc') node.removeAttribute(attr.name);
    }
  });
  const policy = document.createElement('meta');
  policy.httpEquiv = 'Content-Security-Policy';
  policy.content = "default-src 'none'; img-src data: blob:; style-src 'unsafe-inline'; font-src data:; form-action 'none'; base-uri 'none'";
  document.head.prepend(policy);
  return '<!DOCTYPE html>' + document.documentElement.outerHTML;
}

export function downloadDocumentXml(xml: string, name: string) {
  const url = URL.createObjectURL(new Blob([xml], { type: 'application/xml;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `${name.replace(/[\\/:*?"<>|]/g, '_')}.xml`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
