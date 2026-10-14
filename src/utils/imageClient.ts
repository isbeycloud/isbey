/**
 * İŞBEY CLOUD — İstemci Görsel Küçültme (2026-10-12)
 * ==================================================
 * Ürün görseli sunucuya YÜKLENMEDEN ÖNCE tarayıcıda küçültülür:
 * en uzun kenar 1200px, JPEG kalite 0.82. Böylece 8 MB'lık telefon fotoğrafı
 * ~150-300 KB olarak gider — hem yükleme hızlı hem sunucu diski korunur.
 *
 * Canvas kullanılamazsa (çok eski tarayıcı) hata fırlatır; arayan taraf
 * orijinal dosyayı gönderir (sunucu 5 MB/4096px kapılarını zaten zorlar).
 */

export interface DownscaleResult {
  file: File;
  resized: boolean;
  width: number;
  height: number;
  originalWidth: number;
  originalHeight: number;
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Görsel okunamadı.'));
    };
    img.src = url;
  });
}

/**
 * Görseli en uzun kenarı `maxEdge` olacak şekilde küçültür.
 * Küçük görseller (sınır altı) OLDUĞU GİBİ döner — gereksiz yeniden
 * kodlama kalite kaybettirirdi. GIF'ler hareketini koruması için
 * küçültülmez (olduğu gibi döner).
 */
export async function downscaleImageFile(
  file: File,
  maxEdge = 1200,
  quality = 0.82
): Promise<DownscaleResult> {
  const img = await loadImage(file);
  const originalWidth = img.naturalWidth || img.width;
  const originalHeight = img.naturalHeight || img.height;

  // GIF: hareketsiz kareye indirgememek için dokunulmaz.
  const isGif = file.type === 'image/gif';
  const longest = Math.max(originalWidth, originalHeight);
  if (isGif || longest <= maxEdge || longest <= 0) {
    return {
      file,
      resized: false,
      width: originalWidth,
      height: originalHeight,
      originalWidth,
      originalHeight,
    };
  }

  const scale = maxEdge / longest;
  const width = Math.round(originalWidth * scale);
  const height = Math.round(originalHeight * scale);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas kullanılamıyor.');

  // Beyaz zemin: şeffaf PNG'ler JPEG'e çevrilince siyah değil beyaz olur.
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(img, 0, 0, width, height);

  const blob: Blob | null = await new Promise(resolve =>
    canvas.toBlob(resolve, 'image/jpeg', quality)
  );
  if (!blob) throw new Error('Görsel küçültülemedi.');

  const base = file.name.replace(/\.[a-zA-Z0-9]+$/, '') || 'urun';
  return {
    file: new File([blob], `${base}.jpg`, { type: 'image/jpeg' }),
    resized: true,
    width,
    height,
    originalWidth,
    originalHeight,
  };
}
