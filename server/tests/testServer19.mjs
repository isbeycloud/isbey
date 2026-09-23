// FAZ 19 izole test sunucusu — gerçek auth.ts + authGuards.ts kodlarına HTTP üzerinden saldırı yüzeyi.
//
// NEDEN YENİDEN YAZILDI (2026-09-15):
//   Eski `testServer19.js` iki nedenle HİÇ BAŞLAMIYORDU (gerçek çıktıyla doğrulandı):
//     1. `ReferenceError: require is not defined in ES module scope`
//        — kök package.json "type": "module" iken dosya CommonJS yazılmıştı.
//     2. `require('./routes/auth')` / `require('./middleware/authGuards')`
//        — bu dizinler `server/` altında (bir üst dizin), `server/tests/` altında değil.
//   Ayrıca `testServer19.js` ESM'e çevrilip yolu düzeltilse bile .ts kaynakları
//   düz node ile import EDİLEMEZ (uzantısız import + TypeScript). Bu yüzden harness
//   artık ESM + proje genelindeki ts-resolve yükleyicisi ile koşar.
//
// Koşum:
//   TS_PKG_PATH=<repo>/node_modules/typescript/lib/typescript.js \
//   node --experimental-loader /tmp/ts-resolve.mjs server/tests/testServer19.mjs
//
// Kapsam: YALNIZCA yerel HTTP. Dış ağ çağrısı YOKTUR — bu sunucu hiçbir uzak
// adrese bağlanmaz ve hiçbir belge göndermez (CLAUDE.md md.1).

import dotenv from 'dotenv';
import express from 'express';

dotenv.config();

const { authRouter } = await import('../routes/auth.ts');
const { requireAuth, requireRole, requirePermission, resolveTenant } = await import('../middleware/authGuards.ts');

const app = express();
app.use(express.json());
app.use('/api/auth', authRouter);

const protectedDemo = express.Router();
protectedDemo.use(requireAuth);
protectedDemo.use(resolveTenant);
protectedDemo.get('/erp-only', requireRole('SATIS', 'KASA', 'COMPANY_ADMIN', 'MUHASEBE'),
  (req, res) => res.json({ success: true, endpoint: 'erp-only', tenantId: req.tenantId, role: req.userRole }));
protectedDemo.get('/muhasebe-only', requireRole('MUHASEBE'),
  (req, res) => res.json({ success: true, endpoint: 'muhasebe-only' }));
protectedDemo.get('/admin-only', requireRole('SUPER_ADMIN', 'ADMIN'),
  (req, res) => res.json({ success: true, endpoint: 'admin-only' }));
protectedDemo.post('/sensitive-action', requirePermission('invoices.delete'),
  (req, res) => res.json({ success: true, endpoint: 'sensitive-action' }));
protectedDemo.get('/tenant-data', (req, res) => res.json({ success: true, endpoint: 'tenant-data', tenantId: req.tenantId }));
app.use('/api/protected', protectedDemo);

const PORT = Number(process.env.FAZ19_PORT || 4719);
const srv = app.listen(PORT, () => console.log(`FAZ19-TEST-SERVER-READY:${PORT}`));

// Testler bittiğinde temiz kapanış (port sızmasın).
const kapat = () => srv.close(() => process.exit(0));
process.on('SIGTERM', kapat);
process.on('SIGINT', kapat);
