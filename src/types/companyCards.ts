/** Manual company card tracking only; amounts are TRY. No payment credentials. */
export interface CompanyCard {
    id: string;
    tenantId: string;
    name: string;
    bankName: string;
    last4: string;
    creditLimit: number;
    openingBalance: number;
    currency: 'TRY';
    statementDay: number;
    dueDay: number;
    status: 'ACTIVE' | 'ARCHIVED';
    revision: string;
    createdAt: string;
    updatedAt: string;
    balance: number;
    availableLimit: number;
    totalSpent: number;
    totalRefunded: number;
    totalRepaid: number;
}
export interface CompanyCardEntry {
    id: string;
    tenantId: string;
    cardId: string;
    requestId: string;
    type: 'SPEND' | 'REFUND' | 'REPAYMENT';
    date: string;
    amount: number;
    merchant: string;
    category: string;
    description: string;
    receiptNo: string;
    status: 'ACTIVE' | 'VOID';
    revision: string;
    createdAt: string;
    createdBy: string;
    voidReason?: string;
    voidedAt?: string;
    voidedBy?: string;
}
export type CompanyCardInput = Pick<CompanyCard, 'name' | 'bankName' | 'last4' | 'creditLimit' | 'openingBalance' | 'statementDay' | 'dueDay' | 'status' | 'currency'>;
export type CompanyCardEntryInput = Pick<CompanyCardEntry, 'requestId' | 'type' | 'date' | 'amount' | 'merchant' | 'category' | 'description' | 'receiptNo'>;
