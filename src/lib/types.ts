export type RoutingMode =
  | 'PREFER_ON_DEVICE'
  | 'ONLY_ON_DEVICE'
  | 'PREFER_IN_CLOUD'
  | 'ONLY_IN_CLOUD';

export type TelemetrySource = 'ON_DEVICE' | 'IN_CLOUD' | 'PREVIEW_LOCAL';

export type PaymentMethod = 'CASH' | 'MPESA' | 'CREDIT' | 'MIXED' | 'SUPPLIER_EXPENSE';

export type LedgerCategory =
  | 'Sale'
  | 'Credit Tab'
  | 'Credit Repayment'
  | 'Wholesale Restock'
  | 'Shop Expense';

export interface LineItem {
  name: string;
  quantity: number;
  unit: string;
  unitPriceKes: number;
  lineTotalKes: number;
}

export interface PrivacyRedaction {
  kind: 'PHONE' | 'MPESA_CODE' | 'CUSTOMER_NAME' | 'NATIONAL_ID' | 'EMAIL';
  original: string;
  masked: string;
}

export interface PrivacyRedactionResult {
  sanitizedText: string;
  redactions: PrivacyRedaction[];
}

export interface InferenceTelemetry {
  id: string;
  timestamp: string;
  task: 'note_parse' | 'receipt_scan' | 'margin_strategy';
  requestedMode: RoutingMode;
  inferenceSource: TelemetrySource;
  modelUsed?: string;
  latencyMs: number;
  redactedCount: number;
  fallbackUsed: boolean;
  estimatedCloudTokensSaved: number;
  note?: string;
}

export interface LedgerEntry {
  id: string;
  createdAt: string;
  rawInput: string;
  sanitizedInput: string;
  redactionCount: number;
  customerAlias: string;
  category: LedgerCategory;
  paymentMethod: PaymentMethod;
  items: LineItem[];
  totalKes: number;
  paidKes: number;
  creditOwedKes: number;
  estimatedMarginPct: number;
  summary: string;
  inferenceSource: TelemetrySource;
  requestedMode: RoutingMode;
  modelUsed?: string;
  latencyMs: number;
}

export type SyncState = 'firestore_synced' | 'offline_cached' | 'local_only';

export interface HybridBenchmarkResult {
  note: string;
  sanitizedNote: string;
  redactedCount: number;
  onDeviceRun: InferenceTelemetry;
  cloudRun: InferenceTelemetry;
}

export interface AnonymizedCategoryTotal {
  category: LedgerCategory;
  count: number;
  volumeKes: number;
  creditOwedKes: number;
}

export interface AnonymizedItemSummary {
  sku: string;
  unitsSoldOrRestocked: number;
  revenueKes: number;
}

export interface AnonymizedLedgerSummary {
  generatedAt: string;
  entryCount: number;
  totalCashCollectedKes: number;
  totalCreditOutstandingKes: number;
  weightedMarginPct: number;
  onDeviceSharePct: number;
  categories: AnonymizedCategoryTotal[];
  topItems: AnonymizedItemSummary[];
}

export interface StrategyAdvice {
  generatedAt: string;
  inferenceSource: TelemetrySource;
  latencyMs: number;
  headline: string;
  restockPriorities: string[];
  creditRiskActions: string[];
  cashflowNote: string;
  auditedPayload: AnonymizedLedgerSummary;
}

export type AppCheckStatus =
  | 'active'
  | 'debug_token'
  | 'not_configured'
  | 'error';

export interface FirebaseConfigStatus {
  configured: boolean;
  missingKeys: string[];
  projectId: string | null;
  appCheckStatus: AppCheckStatus;
  appCheckDetail: string;
}
