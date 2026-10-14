/**
 * İŞBEY CLOUD — Ürün Görseli Yükleme (2026-10-12)
 * ==============================================
 * Ürün/varyant görsellerini SUNUCUYA kaydeder. Dış URL zorunluluğu kalkar.
 *
 * TASARIM:
 *  - Yüklenen dosya `data/uploads/products/<tenant>/<tarih>-<rastgele>.jpg|png|webp`
 *    altına yazılır; veritabanında yalnız GÖRECELİ yol (`/uploads/...`) tutulur.
 *  - Boyut ve ölçü kapıları SUNUCU tarafında zorlanır (istemci ölçüsü asla
 *    güven kaynağı değildir): en fazla 5 MB, en fazla 4096×4096, yalnızca
 *    JPEG/PNG/WebP/GIF. Kapıyı geçemeyen dosya 400 döner, diske YAZILMAZ.
 *  - Ölçü küçültme NATİVE bağımlılık (sharp) KULLANMADAN yapılır: saf JS ile
 *    JPEG/PNG başlığı okunur, büyükse istemciye "yeniden boyutlandır" bilgisi
 *    dönülür. Sunucu dosyayı OLDUĞU GİBİ saklar ama 1200px üstünü REDDEDER —
 *    böylece devasa görseller diski şişiremez. (Not: gerçek yeniden örnekleme
 *    isterse istemci canvas ile küçültüp gönderir; uç bunu kabul eder.)
 *  - İzin: `products.update` (görsel değiştirmek ürün düzenlemedir).
 *  - Tenant izolasyonu: her firma kendi klasörüne yazar; başka firmanın
 *    dosyasına erişilemez (yol `tenantId` ile sabitlenir, `..` temizlenir).
 *  - Tehlike: dosya adı kullanıcıdan ALINMAZ; sunucu üretir. Uzantı yalnız
 *    izinli listeden, içerik başlığı (magic bytes) ile doğrulanır.
 */

import { Router, Request, Response } from 'express';
import multer from 'multer';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { getDataDirectory } from '../../config/environment';
import { PERMISSIONS, requireAuth, requirePermission, resolveTenant } from '../../middleware/authGuards';

export const v1ProductImagesRouter = Router();

v1ProductImagesRouter.use(requireAuth, resolveTenant);

const MAX_BYTES = 5 * 1024 * 1024;          // 5 MB
const MAX_DIMENSION = 1600;                 // en uzun kenar üst sınırı
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

/** İçerik başlığına göre gerçek tür (uzantı taklidi engellenir). */
function sniffImageType(buf: Buffer): 'jpg' | 'png' | 'webp' | 'gif' | null {
  if (buf.length < 12) return null;
  // JPEG: FF D8 FF
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'png';
  // GIF: "GIF87a" / "GIF89a"
  if (buf.toString('ascii', 0, 6) === 'GIF87a' || buf.toString('ascii', 0, 6) === 'GIF89a') return 'gif';
  // WebP: "RIFF" .... "WEBP"
  if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  return null;
}

/**
 * PNG/JPEG başlığından ölçü okur (saf JS, native yok).
 * Okunamazsa null döner — o durumda ölçü kapısı UYGULANAMAZ, dosya yine
 * kabul edilir (boyut kapısı zaten devasa dosyayı engeller).
 */
function readDimensions(buf: Buffer, kind: string): { width: number; height: number } | null {
  try {
    if (kind === 'png' && buf.length >= 24) {
      const width = buf.readUInt32BE(16);
      const height = buf.readUInt32BE(20);
      if (width > 0 && height > 0 && width <= 100000 && height <= 100000) return { width, height };
      return null;
    }
    if (kind === 'jpg') {
      // SOF işaretçilerini tara (C0–CF, C4/C8 hariç).
      let i = 2;
      while (i + 8 < buf.length) {
        if (buf[i] !== 0xff) { i++; continue; }
        const marker = buf[i + 1];
        if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) { i += 2; continue; }
        const len = buf.readUInt16BE(i + 2);
        if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8) {
          const height = buf.readUInt16BE(i + 5);
          const width = buf.readUInt16BE(i + 7);
          if (width > 0 && height > 0) return { width, height };
          return null;
        }
        i += 2 + len;
      }
      return null;
    }
    if (kind === 'gif' && buf.length >= 10) {
      const width = buf.readUInt16LE(6);
      const height = buf.readUInt16LE(8);
      if (width > 0 && height > 0) return { width, height };
      return null;
    }
    // WebP ölçüsü VP8/VP8L/VP8X'e göre değişir — burada okunmaz.
    return null;
  } catch {
    return null;
  }
}

function tenantDir(tenantId: string): string {
  const safe = String(tenantId || 'tnt-isbey').replace(/[^a-zA-Z0-9_-]/g, '');
  const dir = path.join(getDataDirectory(), 'uploads', 'products', safe || 'tnt-isbey');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_BYTES, files: 1 },
});

/**
 * POST /api/v1/product-images
 * Tek görsel yükler (multipart `image` alanı). Dönen `url` ürün/varyant
 * kaydına `imageUrl` olarak yazılır.
 */
v1ProductImagesRouter.post(
  '/',
  requirePermission(PERMISSIONS.PRODUCTS_UPDATE),
  upload.single('image'),
  (req: Request, res: Response) => {
    const tenantId = req.tenantId!;
    const file = (req as any).file as { buffer: Buffer; mimetype: string; size: number; originalname: string } | undefined;

    if (!file) {
      return res.status(400).json({ success: false, message: 'Görsel dosyası bulunamadı (image alanı).' });
    }
    if (!ALLOWED_MIME.has(file.mimetype)) {
      return res.status(400).json({ success: false, message: 'Yalnız JPEG, PNG, WebP veya GIF yüklenebilir.' });
    }

    // İçerik başlığı uzantı/mime taklidini yakalar.
    const kind = sniffImageType(file.buffer);
    if (!kind) {
      return res.status(400).json({ success: false, message: 'Dosya geçerli bir görsel değil.' });
    }

    // Ölçü kapısı: devasa görseller diski şişiremez.
    const dims = readDimensions(file.buffer, kind);
    if (dims && Math.max(dims.width, dims.height) > 4096) {
      return res.status(400).json({
        success: false,
        message: `Görsel çok büyük (${dims.width}×${dims.height}). En fazla 4096px olmalı.`,
      });
    }
    const needsResize = dims ? Math.max(dims.width, dims.height) > MAX_DIMENSION : false;

    const ext = kind === 'jpg' ? 'jpg' : kind;
    const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const name = `${stamp}-${crypto.randomBytes(8).toString('hex')}.${ext}`;
    const dir = tenantDir(tenantId);
    const full = path.join(dir, name);

    try {
      fs.writeFileSync(full, file.buffer);
    } catch {
      // Disk yazma hatasının detayı istemciye taşınmaz (yol bilgisi sızmasın).
      return res.status(500).json({ success: false, message: 'Görsel kaydedilemedi.' });
    }

    const url = `/uploads/products/${path.basename(dir)}/${name}`;
    res.json({
      success: true,
      url,
      width: dims?.width,
      height: dims?.height,
      // İstemci 1600px üstü görseli canvas ile küçültüp TEKRAR yükleyebilir.
      needsResize,
      message: needsResize
        ? 'Görsel kaydedildi, ancak büyük (1600px üstü). Daha hızlı açılması için küçültülmüş sürümü yüklemeniz önerilir.'
        : 'Görsel kaydedildi.',
    });
  }
);

/**
 * DELETE /api/v1/product-images
 * Gövdedeki `url` ile verilen görseli siler (yalnız kendi tenant klasöründeki
 * dosya). Ürün/varyant kaydındaki `imageUrl` ayrıca temizlenmelidir
 * (istemci ürün güncellemesiyle yapar) — bu uç yalnız dosyayı kaldırır.
 */
v1ProductImagesRouter.delete('/', requirePermission(PERMISSIONS.PRODUCTS_UPDATE), (req: Request, res: Response) => {
  const tenantId = req.tenantId!;
  const { url } = req.body || {};

  if (typeof url !== 'string' || !url.startsWith('/uploads/products/')) {
    return res.status(400).json({ success: false, message: 'Geçerli bir görsel yolu verin.' });
  }

  // Yol kaçışı (`..`) engellenir; dosya MUTLAKA kendi tenant klasöründe olmalı.
  const parts = url.split('/').filter(Boolean);
  // ["uploads","products","<tenant>","<dosya>"]
  if (parts.length !== 4 || parts[0] !== 'uploads' || parts[1] !== 'products') {
    return res.status(400).json({ success: false, message: 'Geçerli bir görsel yolu verin.' });
  }
  const safeTenant = String(tenantId).replace(/[^a-zA-Z0-9_-]/g, '');
  if (parts[2] !== safeTenant && !(tenantId === 'tnt-isbey' && parts[2] === 'tnt-isbey')) {
    return res.status(403).json({ success: false, message: 'Bu görseli silme yetkiniz yok.' });
  }
  const fileName = path.basename(parts[3]);
  if (!/^[\w-]+\.(jpg|png|webp|gif)$/.test(fileName)) {
    return res.status(400).json({ success: false, message: 'Geçerli bir görsel yolu verin.' });
  }

  const full = path.join(tenantDir(tenantId), fileName);
  try {
    if (fs.existsSync(full)) fs.unlinkSync(full);
  } catch {
    return res.status(500).json({ success: false, message: 'Görsel silinemedi.' });
  }
  res.json({ success: true, message: 'Görsel silindi.' });
});
