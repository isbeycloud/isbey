import { Router } from 'express';
import type { Response } from 'express';
import { requireAuth, resolveTenant, requireRole, requirePermission } from '../middleware/authGuards';
import { rateLimit } from '../middleware/productionSecurity';
import { userAccounts, UserAccountsError } from '../services/userAccounts';
export const userAccountsRouter = Router();
const fail = (e: unknown, res: Response) => res.status(e instanceof UserAccountsError ? e.status : 503).json({ success: false, message: e instanceof UserAccountsError ? e.message : 'Hesap işlemi tamamlanamadı. Lütfen tekrar deneyin.' });
userAccountsRouter.use(requireAuth, resolveTenant, rateLimit({ name: 'user-accounts', windowMs: 60000, max: 120 }), (_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
});
userAccountsRouter.get('/me', (req, res) => {
    try {
        res.json(userAccounts.me(req.user.id, req.tenantId!));
    }
    catch (e) {
        fail(e, res);
    }
});
userAccountsRouter.get('/', requireRole('SUPER_ADMIN', 'ADMIN', 'COMPANY_ADMIN'), requirePermission('users.view'), (req, res) => {
    try {
        res.json(userAccounts.list(req.user.id, req.tenantId!));
    }
    catch (e) {
        fail(e, res);
    }
});
for (const route of ['me', ':id']) {
    userAccountsRouter.put('/' + route + '/profile', async (req, res) => {
        try {
            const id = route === 'me' ? req.user.id : String(req.params.id);
            res.json({ success: true, ...await userAccounts.updateProfile(req.user.id, req.tenantId!, id, req.body) });
        }
        catch (e) {
            fail(e, res);
        }
    });
    userAccountsRouter.post('/' + route + '/password', async (req, res) => {
        try {
            const id = route === 'me' ? req.user.id : String(req.params.id);
            res.json({ success: true, ...await userAccounts.setPassword(req.user.id, req.tenantId!, id, req.body) });
        }
        catch (e) {
            fail(e, res);
        }
    });
    userAccountsRouter.post('/' + route + '/password-email', rateLimit({ name: 'user-account-mail', windowMs: 15 * 60000, max: 10 }), async (req, res) => {
        try {
            const id = route === 'me' ? req.user.id : String(req.params.id);
            const result = await userAccounts.sendPasswordEmail(req.user.id, req.tenantId!, id, req.body);
            res.status(result.mail.status === 'SENT' ? 200 : result.mail.status === 'PENDING' ? 202 : 503).json({ success: result.mail.status === 'SENT', ...result, message: result.mail.status === 'SENT' ? 'Şifre belirleme e-postası gönderildi.' : result.mail.status === 'FAILED' ? 'E-posta kabul edilmedi.' : 'Gönderim sonucu henüz doğrulanamadı. Aynı isteği yinelemek yeni e-posta göndermez.' });
        }
        catch (e) {
            fail(e, res);
        }
    });
}
export const accountPasswordResetRouter = Router();
accountPasswordResetRouter.use(rateLimit({ name: 'account-password-reset', windowMs: 15 * 60000, max: 20 }), (_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
});
accountPasswordResetRouter.post('/', async (req, res) => {
    try {
        res.json(await userAccounts.resetPassword(req.body));
    }
    catch (e) {
        fail(e, res);
    }
});
