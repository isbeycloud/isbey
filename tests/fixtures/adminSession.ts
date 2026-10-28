import { test as base, expect } from '@playwright/test';
export interface AdminSession { token: string; activeTenant: { id: string }; user: { id: string; username: string } }
// Gerçek giriş sınırını değiştirmeden yönetici senaryoları aynı oturumu kullanır.
export const test = base.extend<{}, { adminSession: AdminSession }>({
  adminSession: [async ({ playwright }, use, workerInfo) => {
    const request = await playwright.request.newContext({ baseURL: String(workerInfo.project.use.baseURL) });
    try {
      const response = await request.post('/api/auth/login', { data: { username: 'admin', password: 'admin123' } });
      expect(response.status()).toBe(200);
      const session: AdminSession = await response.json(); expect(session.token).toBeTruthy();
      await use(session);
    } finally { await request.dispose(); }
  }, { scope: 'worker' }],
});
export { expect };
