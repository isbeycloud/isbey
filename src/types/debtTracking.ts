export type DebtDirection = 'RECEIVABLE' | 'PAYABLE' | 'CLOSED';
export type DebtStatus = 'OPEN' | 'CONTACTED' | 'PROMISED' | 'DISPUTED';
export type DebtDueState = 'OVERDUE' | 'TODAY' | 'UPCOMING' | 'LATER' | 'UNSCHEDULED' | 'CLOSED' | 'NEEDS_REVIEW';
export interface DebtFollowup {
    revision: string;
    requestId: string;
    customerId: string;
    tenantId: string;
    direction: Exclude<DebtDirection, 'CLOSED'>;
    balanceSnapshot: number;
    dueDate: string;
    promiseDate: string;
    reminderDate: string;
    status: DebtStatus;
    note: string;
    updatedAt: string;
    updatedBy: string;
}
export interface DebtTrackingRow {
    customerId: string;
    customerName: string;
    customerCode: string;
    currency: string;
    revision: string;
    trackingRevision: string;
    direction: DebtDirection;
    balance: number | null;
    amount: number | null;
    dueState: DebtDueState;
    reminderDue: boolean;
    promiseOverdue: boolean;
    attention: boolean;
    reviewReason: string;
    followup: DebtFollowup | null;
    history: DebtFollowup[];
}
export interface DebtCurrencyTotal {
    currency: string;
    receivable: number;
    payable: number;
    overdueReceivable: number;
    overduePayable: number;
    receivableCount: number;
    payableCount: number;
}
export interface DebtTrackingResponse {
    success: boolean;
    today: string;
    rows: DebtTrackingRow[];
    totals: DebtCurrencyTotal[];
    counts: {
        overdue: number;
        today: number;
        upcoming: number;
        reminderDue: number;
        promiseOverdue: number;
        actionable: number;
        attention: number;
        needsReview: number;
        closed: number;
        unscheduled: number;
    };
}
export interface DebtTrackingInput {
    dueDate: string;
    promiseDate: string;
    reminderDate: string;
    status: DebtStatus;
    note: string;
    expectedRevision: string;
    expectedDirection: Exclude<DebtDirection, 'CLOSED'>;
    expectedBalance: number;
    requestId: string;
}
