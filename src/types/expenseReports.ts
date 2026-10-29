import type { ManagementReportWarning } from './managementReports';
export type ExpenseReportPaymentMethod = 'CASH' | 'BANK' | 'OTHER';
export interface ExpenseReportFilters {
    currency: string;
    startDate: string;
    endDate: string;
    categoryId?: string;
    costCenterId?: string;
    paymentMethod?: ExpenseReportPaymentMethod;
    account?: string;
    search?: string;
}
export interface ExpenseReportAmounts {
    count: number;
    netAmount: number;
    vatAmount: number;
    grossAmount: number;
}
export interface ExpenseReportRow {
    id: string;
    date: string;
    documentNo: string;
    title: string;
    categoryId: string;
    categoryName: string;
    costCenterId: string;
    costCenterName: string;
    supplierTitle: string;
    receiptNo: string;
    paymentMethod: ExpenseReportPaymentMethod;
    account: string;
    accountName: string;
    currency: string;
    netAmount: number;
    vatRate: number | null;
    vatAmount: number;
    grossAmount: number;
    notes: string;
}
export interface ExpenseReportGroup extends ExpenseReportAmounts {
    id: string;
    name: string;
}
export interface ExpenseReportsResponse {
    success: boolean;
    filters: ExpenseReportFilters;
    snapshotAt: string;
    snapshotDate: string;
    rows: ExpenseReportRow[];
    summary: ExpenseReportAmounts;
    byCategory: ExpenseReportGroup[];
    byCostCenter: ExpenseReportGroup[];
    options: {
        currencies: string[];
        categories: {
            id: string;
            name: string;
        }[];
        costCenters: {
            id: string;
            name: string;
        }[];
        accounts: {
            value: string;
            label: string;
            kind: 'CASH' | 'BANK';
            id: string;
        }[];
        paymentMethods: ExpenseReportPaymentMethod[];
    };
    warnings: ManagementReportWarning[];
    excludedCount: number;
}
export type ExpenseReportResponse = ExpenseReportsResponse;
