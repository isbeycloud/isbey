import { randomUUID } from 'node:crypto';
import { DebtTrackingStore } from '../services/debtTracking';
const [file, label] = process.argv.slice(2);
if (!file || !label)
    throw new Error('Missing fixture path');
const store = new DebtTrackingStore(file, () => new Date('2026-10-29T12:00:00Z'));
for (let i = 0; i < 8; i++) {
    let saved = false;
    for (let attempt = 0; attempt < 200 && !saved; attempt++) {
        const row = store.list('a').rows.find(r => r.customerId === 'payable')!;
        try {
            await store.save('a', 'payable', { dueDate: '', promiseDate: '', reminderDate: '', status: 'CONTACTED', note: `${label}-${i}`, expectedRevision: row.trackingRevision, expectedDirection: row.direction, expectedBalance: row.balance, requestId: randomUUID() });
            saved = true;
        }
        catch (e) {
            if (![409, 503].includes((e as {
                status: number;
            }).status))
                throw e;
            await new Promise(r => setTimeout(r, 5));
        }
    }
    if (!saved)
        throw new Error('Concurrent fixture timed out');
}
