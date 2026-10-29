import { randomUUID } from 'node:crypto';
import { UserAccountsStore } from '../services/userAccounts';
const [file, label] = process.argv.slice(2);
if (!file || !label)
    throw new Error('Missing fixture path');
const store = new UserAccountsStore(file);
for (let i = 0; i < 4; i++) {
    let saved = false;
    for (let attempt = 0; attempt < 200 && !saved; attempt++) {
        try {
            const user = store.me('employee', 'a').user;
            await store.updateProfile('owner', 'a', 'employee', { fullName: user.fullName, email: user.email, phone: user.phone, department: `${label}-${i}`, branch: user.branch, expectedRevision: user.revision, actingPassword: 'InitialPassword-123', requestId: randomUUID() });
            saved = true;
        }
        catch (error) {
            if (![409, 503].includes((error as {
                status: number;
            }).status))
                throw error;
            await new Promise(r => setTimeout(r, 5));
        }
    }
    if (!saved)
        throw new Error('Concurrent fixture timed out');
}
