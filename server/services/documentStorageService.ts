import fs from 'fs';
import path from 'path';
import { getDataDirectory } from '../config/environment';

export class DocumentStorageService {
  private static originalInvoicePath(tenantId: string, uuid: string): string {
    if (!/^[a-zA-Z0-9_-]{1,80}$/.test(tenantId) || !/^[a-zA-Z0-9_-]{1,80}$/.test(uuid)) {
      throw new Error('Belge arşiv kimliği geçersiz.');
    }
    return path.join(this.getBaseStorageDir(), tenantId, 'original-invoices', `${uuid.toLowerCase()}.xml`);
  }

  public static readOriginalInvoice(tenantId: string, uuid: string): string | null {
    const filePath = this.originalInvoicePath(tenantId, uuid);
    return fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : null;
  }

  /** Özgün dosya değiştirilemez; aynı içerikle tekrar ekleme yan etkisizdir. */
  public static saveOriginalInvoice(tenantId: string, uuid: string, xml: string): void {
    const filePath = this.originalInvoicePath(tenantId, uuid);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    try { fs.writeFileSync(filePath, xml, { encoding: 'utf8', flag: 'wx' }); }
    catch (err: any) {
      if (err.code !== 'EEXIST') throw err;
      if (fs.readFileSync(filePath, 'utf8') !== xml) throw new Error('Bu ETTN için farklı bir özgün XML zaten arşivlenmiş.');
    }
  }
  private static getBaseStorageDir(): string {
    return path.join(getDataDirectory(), 'storage', 'tenants');
  }

  /**
   * Güvenli ve Tenant İzolasyonlu Dizin Yolunu Çözümler
   */
  private static getDocumentDir(tenantId: string, year: string, docType: string): string {
    const safeTenant = tenantId.replace(/[^a-zA-Z0-9_-]/g, '');
    const safeYear = year.replace(/[^0-9]/g, '') || new Date().getFullYear().toString();
    const safeDocType = docType.toLowerCase().replace(/[^a-z0-9_-]/g, '');

    const dir = path.join(this.getBaseStorageDir(), safeTenant, 'documents', safeYear, safeDocType);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    return dir;
  }

  /**
   * XML Belgesini Diske Kaydeder
   */
  public static saveXml(tenantId: string, docType: string, uuid: string, xmlContent: string): string {
    const year = new Date().getFullYear().toString();
    const dir = this.getDocumentDir(tenantId, year, docType);
    const safeUuid = uuid.replace(/[^a-zA-Z0-9_-]/g, '');
    const filePath = path.join(dir, `${safeUuid}.xml`);

    fs.writeFileSync(filePath, xmlContent, 'utf-8');
    return filePath;
  }

  /**
   * XML Belgesini Okur (Tenant İzolasyonlu)
   */
  public static readXml(tenantId: string, filePath: string): string | null {
    if (!filePath || !fs.existsSync(filePath)) return null;

    // Path traversal koruması: Dosya ilgili tenant dizini altında olmalıdır
    const resolvedPath = path.resolve(filePath);
    const tenantBase = path.join(this.getBaseStorageDir(), tenantId.replace(/[^a-zA-Z0-9_-]/g, ''));
    if (!resolvedPath.startsWith(tenantBase)) {
      throw new Error('GÜVENLİK İHLALİ: Başka bir şirkete ait belge dosyasına erişim engellendi.');
    }

    return fs.readFileSync(resolvedPath, 'utf-8');
  }

  /**
   * PDF Belgesini Diske Kaydeder
   */
  public static savePdf(tenantId: string, docType: string, uuid: string, pdfBuffer: Buffer): string {
    const year = new Date().getFullYear().toString();
    const dir = this.getDocumentDir(tenantId, year, docType);
    const safeUuid = uuid.replace(/[^a-zA-Z0-9_-]/g, '');
    const filePath = path.join(dir, `${safeUuid}.pdf`);

    fs.writeFileSync(filePath, pdfBuffer);
    return filePath;
  }

  /**
   * PDF Belgesini Okur (Tenant İzolasyonlu)
   */
  public static readPdf(tenantId: string, filePath: string): Buffer | null {
    if (!filePath || !fs.existsSync(filePath)) return null;

    const resolvedPath = path.resolve(filePath);
    const tenantBase = path.join(this.getBaseStorageDir(), tenantId.replace(/[^a-zA-Z0-9_-]/g, ''));
    if (!resolvedPath.startsWith(tenantBase)) {
      throw new Error('GÜVENLİK İHLALİ: Başka bir şirkete ait belge dosyasına erişim engellendi.');
    }

    return fs.readFileSync(resolvedPath);
  }
}
