// Child process fixture for shared-sidecar concurrency; never points at the production database.
import { CompanyCardsStore } from '../services/companyCards';
const [file, label] = process.argv.slice(2);
if (!file || !label)
    throw new Error('Missing test fixture path');
const store = new CompanyCardsStore(file);
for (let i = 0; i < 8; i++) {
    let saved = false;
    for (let attempt = 0; attempt < 200 && !saved; attempt++) {
        try {
            await store.create('a', { name: `${label}-${i}`, bankName: 'Test', last4: '1234', creditLimit: 1000, openingBalance: 0, statementDay: 1, dueDay: 10 });
            saved = true;
        }
        catch (e) {
            if ((e as {
                status: number;
            }).status !== 503)
                throw e;
            await new Promise(r => setTimeout(r, 5));
        }
    }
    if (!saved)
        throw new Error('Concurrent fixture timed out');
}
