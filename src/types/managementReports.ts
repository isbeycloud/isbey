export interface ManagementReportFilters {
    startDate: string;
    endDate: string;
    currency: string;
}
export interface ManagementReportWarning {
    code: string;
    message: string;
    count: number;
}
export interface ManagementBalanceRow {
    customerId: string;
    code: string;
    name: string;
    currency: string;
    balance: number | null;
    receivable: number | null;
    payable: number | null;
    periodDebit: number | null;
    periodCredit: number | null;
    needsReview: boolean;
    reviewReason: string;
}
export interface ManagementProductRow {
    productId: string;
    code: string;
    name: string;
    variantId: string;
    variantName: string;
    unit: string;
    currency: string;
    salesQuantity: number;
    returnQuantity: number;
    netQuantity: number;
    salesNet: number;
    salesReturnNet: number;
    netSales: number;
    currentUnitCost: number | null;
    estimatedCost: number | null;
    estimatedGrossProfit: number | null;
    knownCostLines: number;
    unknownCostLines: number;
}
export interface ManagementMonthlyRow {
    month: string;
    salesNet: number;
    salesReturnsNet: number;
    netSales: number;
    purchaseNet: number;
    purchaseReturnsNet: number;
    netPurchases: number;
    invoiceCount: number;
}
export interface ManagementExpenseRow {
    categoryId: string;
    categoryName: string;
    netAmount: number;
    vatAmount: number;
    grossAmount: number;
    count: number;
}
export interface ManagementStockRow {
    productId: string;
    code: string;
    name: string;
    variantId: string;
    variantName: string;
    unit: string;
    currentStock: number;
    criticalStock: number;
    lastMovementDate: string | null;
}
export interface ManagementCashBankRow {
    id: string;
    kind: 'CASH' | 'BANK';
    name: string;
    currency: string;
    balance: number | null;
    needsReview: boolean;
    reviewReason: string;
}
export interface ManagementReportsResponse {
    success: boolean;
    filters: ManagementReportFilters;
    snapshotAt: string;
    snapshotDate: string;
    currencyOptions: string[];
    warnings: ManagementReportWarning[];
    overview: {
        netSales: number;
        netPurchases: number;
        salesVat: number;
        purchaseVat: number;
        expenseNet: number;
        expenseGross: number;
        receivable: number;
        payable: number;
        cashBalance: number;
        bankBalance: number;
        postedInvoiceCount: number;
        excludedInvoiceCount: number;
    };
    balances: {
        rows: ManagementBalanceRow[];
        receivable: number;
        payable: number;
        periodDebit: number;
        periodCredit: number;
        excludedCount: number;
    };
    products: ManagementProductRow[];
    profitability: {
        basis: 'CURRENT_PURCHASE_COST_ESTIMATE';
        netSales: number;
        coveredNetSales: number;
        uncoveredNetSales: number;
        estimatedCost: number;
        estimatedGrossProfit: number | null;
        knownCostLines: number;
        unknownCostLines: number;
        coveragePercent: number | null;
        expensesNet: number;
        complete: boolean;
    };
    monthly: ManagementMonthlyRow[];
    expenses: {
        rows: ManagementExpenseRow[];
        totalNet: number;
        totalVat: number;
        totalGross: number;
        excludedCount: number;
    };
    stock: {
        critical: ManagementStockRow[];
        idle: ManagementStockRow[];
        idleDays: number;
    };
    cashBank: ManagementCashBankRow[];
}
