import { Component, computed, effect, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { arrayUnion, serverTimestamp } from '@angular/fire/firestore';
import { toSignal } from '@angular/core/rxjs-interop';
import { AuthService } from '../../../core/auth';
import { SuperAdminBillingService } from '../services/super-admin-billing';
import { SuperAdminLogsService } from '../services/super-admin-logs';
import { SuperAdminOrganizationsService } from '../services/super-admin-organizations';
import { PlanType, SuperAdminBillingRecord, SuperAdminOrganization } from '../models/super-admin.models';

type BillingStatus = 'active' | 'trial' | 'past_due' | 'cancelled';
type ManualPaymentMethod = 'mobile_money' | 'bank_transfer' | 'cash' | 'check' | 'other';
type BillingInterval = 'monthly' | 'yearly' | 'one_time';

type ManualPaymentEntry = {
  id: string;
  amount: number;
  currency: string;
  method: ManualPaymentMethod;
  receiverNumber?: string;
  payerName?: string;
  payerPhone?: string;
  reference?: string;
  note?: string;
  recordedAt: string;
  recordedBy?: string | null;
  status: 'received';
};

type BillingRecord = SuperAdminBillingRecord & {
  billingEmail?: string;
  seats?: number;
  interval?: 'monthly' | 'yearly';
  paymentProvider?: 'stripe' | 'manual' | string;
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  stripeCheckoutSessionId?: string;
  notes?: string;
  internalNotes?: string;
  manualPayments?: ManualPaymentEntry[];
  lastPayment?: ManualPaymentEntry;
  lastPaymentMethod?: string;
  lastPaymentReference?: string;
  lastPaymentAmount?: number;
  localPaymentNumber?: string;
  lastManualPaymentAt?: any;
  lastPaymentReminderAt?: any;
  lastActionAt?: any;
  lastActionBy?: string | null;
};

@Component({
  selector: 'app-billing',
  imports: [CommonModule, FormsModule],
  templateUrl: './billing.html',
  styleUrl: './billing.css',
})
export class Billing {
  private readonly svc = inject(SuperAdminBillingService);
  private readonly orgsSvc = inject(SuperAdminOrganizationsService);
  private readonly logs = inject(SuperAdminLogsService);
  private readonly auth = inject(AuthService);

  readonly statusFilter = signal<BillingStatus | 'all'>('all');
  readonly planFilter = signal<PlanType | 'all'>('all');
  readonly search = signal('');
  readonly selectedId = signal<string | null>(null);
  readonly saving = signal(false);
  readonly notice = signal('');
  readonly notes = signal('');
  readonly reminderDraft = signal('');
  readonly manualAmount = signal<number | null>(null);
  readonly manualCurrency = signal('USD');
  readonly manualMethod = signal<ManualPaymentMethod>('mobile_money');
  readonly manualReceiverNumber = signal('');
  readonly manualPayerName = signal('');
  readonly manualPayerPhone = signal('');
  readonly manualReference = signal('');
  readonly manualNote = signal('');
  readonly createPanelOpen = signal(true);
  readonly newBillOrgId = signal('');
  readonly newBillOrgName = signal('');
  readonly newBillEmail = signal('');
  readonly newBillPlan = signal<PlanType>('pro');
  readonly newBillStatus = signal<BillingStatus>('active');
  readonly newBillAmount = signal<number | null>(null);
  readonly newBillCurrency = signal('USD');
  readonly newBillInterval = signal<BillingInterval>('monthly');
  readonly newBillMethod = signal<ManualPaymentMethod>('mobile_money');
  readonly newBillLocalNumber = signal('');
  readonly newBillPayerName = signal('');
  readonly newBillPayerPhone = signal('');
  readonly newBillReference = signal('');
  readonly newBillNote = signal('');

  readonly records = toSignal(this.svc.list(), { initialValue: [] as SuperAdminBillingRecord[] });
  readonly billingRecords = computed(() => this.records() as BillingRecord[]);
  readonly organizations = toSignal(this.orgsSvc.list(), { initialValue: [] as SuperAdminOrganization[] });
  readonly profile = toSignal(this.auth.profile$, { initialValue: null });

  readonly filtered = computed(() => {
    const status = this.statusFilter();
    const plan = this.planFilter();
    const term = this.search().toLowerCase().trim();

    return this.billingRecords().filter((record) => {
      const matchStatus = status === 'all' || record.status === status;
      const matchPlan = plan === 'all' || record.plan === plan;
      const blob = [
        record.orgName ?? '',
        record.orgId ?? '',
        record.billingEmail ?? '',
        record.stripeCustomerId ?? '',
        record.stripeSubscriptionId ?? '',
      ].join(' ').toLowerCase();
      return matchStatus && matchPlan && (!term || blob.includes(term));
    });
  });

  readonly selected = computed(() => {
    const id = this.selectedId();
    return this.filtered().find((record) => record.id === id) ?? this.filtered()[0] ?? null;
  });

  readonly stats = computed(() => {
    const all = this.billingRecords();
    const active = all.filter((record) => record.status === 'active');
    const pastDue = all.filter((record) => record.status === 'past_due');
    const now = new Date();
    const soon = new Date();
    soon.setDate(now.getDate() + 30);

    const recurring = active.reduce((sum, record) => sum + this.monthlyValue(record), 0);
    const unpaid = pastDue.reduce((sum, record) => sum + Number(record.amount ?? 0), 0);
    const renewals = all.filter((record) => {
      const end = this.toDate(record.periodEnd);
      return end ? end >= now && end <= soon : false;
    }).length;

    return {
      total: all.length,
      active: active.length,
      trial: all.filter((record) => record.status === 'trial').length,
      pastDue: pastDue.length,
      cancelled: all.filter((record) => record.status === 'cancelled').length,
      recurring,
      unpaid,
      renewals,
    };
  });

  readonly statusOptions: Array<{ value: BillingStatus; label: string }> = [
    { value: 'active', label: 'Active' },
    { value: 'trial', label: 'Trial' },
    { value: 'past_due', label: 'Past due' },
    { value: 'cancelled', label: 'Cancelled' },
  ];

  readonly planOptions: Array<{ value: PlanType; label: string }> = [
    { value: 'free', label: 'Starter' },
    { value: 'pro', label: 'Growth' },
    { value: 'enterprise', label: 'Enterprise' },
  ];

  readonly manualMethodOptions: Array<{ value: ManualPaymentMethod; label: string }> = [
    { value: 'mobile_money', label: 'Mobile money / local number' },
    { value: 'bank_transfer', label: 'Bank transfer' },
    { value: 'cash', label: 'Cash' },
    { value: 'check', label: 'Check' },
    { value: 'other', label: 'Other' },
  ];

  constructor() {
    effect(() => {
      const selected = this.selected();
      this.notes.set(selected?.notes ?? selected?.internalNotes ?? '');
      this.reminderDraft.set(this.defaultReminder(selected));
      this.manualAmount.set(selected?.amount ?? null);
      this.manualCurrency.set(selected?.currency || 'USD');
      this.manualMethod.set('mobile_money');
      this.manualReceiverNumber.set(selected?.localPaymentNumber ?? '');
      this.manualPayerName.set('');
      this.manualPayerPhone.set('');
      this.manualReference.set('');
      this.manualNote.set('');
    }, { allowSignalWrites: true });
  }

  select(record: BillingRecord): void {
    this.selectedId.set(record.id ?? null);
    this.notice.set('');
  }

  selectNewBillOrg(orgId: string): void {
    this.newBillOrgId.set(orgId);
    const org = this.organizations().find((item) => item.id === orgId);
    if (!org) return;

    this.newBillOrgName.set(org.name ?? org.id ?? '');
    this.newBillEmail.set(org.ownerEmail ?? '');
    this.newBillPlan.set(org.plan ?? 'pro');
  }

  async createManualBill(): Promise<void> {
    const amount = Number(this.newBillAmount() ?? 0);
    const orgId = this.newBillOrgId() || this.slugify(this.newBillOrgName());
    const orgName = this.newBillOrgName().trim();

    if (!orgId || !orgName) {
      this.setNotice('Select an organization or enter an organization name before creating a bill.');
      return;
    }

    if (!Number.isFinite(amount) || amount <= 0) {
      this.setNotice('Enter a valid bill amount before creating a bill.');
      return;
    }

    const currency = (this.newBillCurrency() || 'USD').toUpperCase();
    const payment = this.buildManualPayment({
      amount,
      currency,
      method: this.newBillMethod(),
      receiverNumber: this.newBillLocalNumber(),
      payerName: this.newBillPayerName(),
      payerPhone: this.newBillPayerPhone(),
      reference: this.newBillReference(),
      note: this.newBillNote(),
    });

    this.saving.set(true);
    try {
      const id = await this.svc.create({
        orgId,
        orgName,
        billingEmail: this.cleanText(this.newBillEmail()),
        plan: this.newBillPlan(),
        status: this.newBillStatus(),
        amount,
        currency,
        interval: this.newBillInterval(),
        paymentProvider: payment.method === 'mobile_money' ? 'mobile_money' : 'manual',
        manualPayments: [payment],
        lastPayment: payment,
        lastPaymentAmount: amount,
        lastPaymentMethod: payment.method,
        lastPaymentReference: payment.reference,
        localPaymentNumber: payment.receiverNumber,
        lastManualPaymentAt: serverTimestamp(),
        lastActionAt: serverTimestamp(),
        lastActionBy: this.profile()?.email ?? null,
        createdAt: serverTimestamp(),
      } as SuperAdminBillingRecord);

      await this.audit(
        'billing_manual_bill_created',
        { id, orgId, orgName, plan: this.newBillPlan(), status: this.newBillStatus() } as BillingRecord,
        `Manual bill created: ${this.formatMoneyForCurrency(amount, currency)} via ${this.methodLabel(payment.method)}.`
      );

      this.selectedId.set(id);
      this.resetNewBillForm();
      this.createPanelOpen.set(false);
      this.setNotice('Manual bill created.');
    } finally {
      this.saving.set(false);
    }
  }

  async updateStatus(record: BillingRecord, status: BillingStatus): Promise<void> {
    if (!record.id) return;
    this.saving.set(true);
    try {
      await this.svc.update(record.id, {
        status,
        lastActionAt: serverTimestamp(),
        lastActionBy: this.profile()?.email ?? null,
      } as Partial<SuperAdminBillingRecord>);
      await this.audit('billing_status_updated', record, `Billing status changed to ${status}.`);
      this.setNotice('Billing status updated.');
    } finally {
      this.saving.set(false);
    }
  }

  async updatePlan(record: BillingRecord, plan: PlanType): Promise<void> {
    if (!record.id) return;
    this.saving.set(true);
    try {
      await this.svc.update(record.id, {
        plan,
        lastActionAt: serverTimestamp(),
        lastActionBy: this.profile()?.email ?? null,
      } as Partial<SuperAdminBillingRecord>);
      await this.audit('billing_plan_updated', record, `Billing plan changed to ${plan}.`);
      this.setNotice('Plan updated.');
    } finally {
      this.saving.set(false);
    }
  }

  async saveNotes(record: BillingRecord): Promise<void> {
    if (!record.id) return;
    this.saving.set(true);
    try {
      await this.svc.update(record.id, {
        notes: this.notes(),
        lastActionAt: serverTimestamp(),
        lastActionBy: this.profile()?.email ?? null,
      } as Partial<SuperAdminBillingRecord>);
      await this.audit('billing_notes_saved', record, 'Billing notes saved.');
      this.setNotice('Billing notes saved.');
    } finally {
      this.saving.set(false);
    }
  }

  async markManualPayment(record: BillingRecord): Promise<void> {
    if (!record.id) return;
    const amount = Number(this.manualAmount() ?? 0);
    if (!Number.isFinite(amount) || amount <= 0) {
      this.setNotice('Enter a valid payment amount before recording payment.');
      return;
    }

    const payment = this.buildManualPayment({
      amount,
      currency: (this.manualCurrency() || record.currency || 'USD').toUpperCase(),
      method: this.manualMethod(),
      receiverNumber: this.manualReceiverNumber(),
      payerName: this.manualPayerName(),
      payerPhone: this.manualPayerPhone(),
      reference: this.manualReference(),
      note: this.manualNote(),
    });

    this.saving.set(true);
    try {
      await this.svc.update(record.id, {
        status: 'active',
        amount,
        currency: payment.currency,
        paymentProvider: payment.method === 'mobile_money' ? 'mobile_money' : 'manual',
        manualPayments: arrayUnion(payment),
        lastPayment: payment,
        lastPaymentAmount: amount,
        lastPaymentMethod: payment.method,
        lastPaymentReference: payment.reference,
        localPaymentNumber: payment.receiverNumber || record.localPaymentNumber,
        lastManualPaymentAt: serverTimestamp(),
        lastActionAt: serverTimestamp(),
        lastActionBy: this.profile()?.email ?? null,
      } as Partial<SuperAdminBillingRecord>);
      await this.audit(
        'billing_manual_payment_received',
        record,
        `Manual payment received: ${this.formatMoneyForCurrency(amount, payment.currency)} via ${this.methodLabel(payment.method)}.`
      );
      this.manualReference.set('');
      this.manualPayerName.set('');
      this.manualPayerPhone.set('');
      this.manualNote.set('');
      this.setNotice('Manual payment recorded.');
    } finally {
      this.saving.set(false);
    }
  }

  async sendReminder(record: BillingRecord): Promise<void> {
    if (!record.id) return;
    this.openReminderEmail(record);
    this.saving.set(true);
    try {
      await this.svc.update(record.id, {
        lastPaymentReminderAt: serverTimestamp(),
        lastActionAt: serverTimestamp(),
        lastActionBy: this.profile()?.email ?? null,
      } as Partial<SuperAdminBillingRecord>);
      await this.audit('billing_payment_reminder_started', record, 'Payment reminder email opened.');
      this.setNotice('Payment reminder opened and logged.');
    } finally {
      this.saving.set(false);
    }
  }

  setManualAmount(value: string | number | null): void {
    if (value === '' || value === null) {
      this.manualAmount.set(null);
      return;
    }
    this.manualAmount.set(Number(value));
  }

  setManualMethod(value: string): void {
    this.manualMethod.set((value || 'mobile_money') as ManualPaymentMethod);
  }

  setNewBillAmount(value: string | number | null): void {
    if (value === '' || value === null) {
      this.newBillAmount.set(null);
      return;
    }
    this.newBillAmount.set(Number(value));
  }

  setNewBillPlan(value: string): void {
    this.newBillPlan.set((value || 'pro') as PlanType);
  }

  setNewBillStatus(value: string): void {
    this.newBillStatus.set((value || 'active') as BillingStatus);
  }

  setNewBillInterval(value: string): void {
    this.newBillInterval.set((value || 'monthly') as BillingInterval);
  }

  setNewBillMethod(value: string): void {
    this.newBillMethod.set((value || 'mobile_money') as ManualPaymentMethod);
  }

  openStripe(record: BillingRecord): void {
    const target = record.stripeSubscriptionId
      ? `https://dashboard.stripe.com/subscriptions/${record.stripeSubscriptionId}`
      : record.stripeCustomerId
        ? `https://dashboard.stripe.com/customers/${record.stripeCustomerId}`
        : '';
    if (target) window.open(target, '_blank', 'noopener,noreferrer');
  }

  formatDate(value: any): string {
    const date = this.toDate(value);
    return date ? date.toLocaleDateString() : '-';
  }

  formatMoney(value: number | undefined | null): string {
    return this.formatMoneyForCurrency(value, 'USD');
  }

  formatMoneyForCurrency(value: number | undefined | null, currency = 'USD'): string {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency || 'USD',
      maximumFractionDigits: 0,
    }).format(Number(value ?? 0));
  }

  renewalState(record: BillingRecord): string {
    const end = this.toDate(record.periodEnd);
    if (!end) return 'No renewal date';
    const days = Math.ceil((+end - Date.now()) / 86_400_000);
    if (days < 0) return `${Math.abs(days)} days overdue`;
    if (days === 0) return 'Renews today';
    return `${days} days remaining`;
  }

  hasStripeLink(record: BillingRecord): boolean {
    return !!record.stripeCustomerId || !!record.stripeSubscriptionId;
  }

  methodLabel(method?: string | null): string {
    return this.manualMethodOptions.find((option) => option.value === method)?.label ?? (method || 'Manual');
  }

  recentManualPayments(record: BillingRecord): ManualPaymentEntry[] {
    return [...(record.manualPayments ?? [])]
      .sort((a, b) => +new Date(b.recordedAt) - +new Date(a.recordedAt))
      .slice(0, 5);
  }

  private monthlyValue(record: BillingRecord): number {
    const amount = Number(record.amount ?? 0);
    return record.interval === 'yearly' ? amount / 12 : amount;
  }

  private defaultReminder(record: BillingRecord | null): string {
    if (!record) return '';
    const name = record.orgName || record.orgId;
    const amount = this.formatMoney(record.amount);
    return [
      `Hello,`,
      '',
      `I am following up on the Innovacare Training billing record for ${name}.`,
      `Current status: ${record.status}. Amount on file: ${amount}.`,
      '',
      `Please let us know if you would like us to resend a secure payment link or update the billing contact.`,
      '',
      `Best regards,`,
      `Innovacare Training Billing`,
    ].join('\n');
  }

  private openReminderEmail(record: BillingRecord): void {
    const email = record.billingEmail || '';
    const subject = `Innovacare Training billing follow-up - ${record.orgName || record.orgId}`;
    const href = `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(this.reminderDraft())}`;
    window.location.href = href;
  }

  private buildManualPayment(input: {
    amount: number;
    currency: string;
    method: ManualPaymentMethod;
    receiverNumber: string;
    payerName: string;
    payerPhone: string;
    reference: string;
    note: string;
  }): ManualPaymentEntry {
    return {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      amount: input.amount,
      currency: input.currency,
      method: input.method,
      receiverNumber: this.cleanText(input.receiverNumber),
      payerName: this.cleanText(input.payerName),
      payerPhone: this.cleanText(input.payerPhone),
      reference: this.cleanText(input.reference),
      note: this.cleanText(input.note),
      recordedAt: new Date().toISOString(),
      recordedBy: this.profile()?.email ?? null,
      status: 'received',
    };
  }

  private resetNewBillForm(): void {
    this.newBillOrgId.set('');
    this.newBillOrgName.set('');
    this.newBillEmail.set('');
    this.newBillPlan.set('pro');
    this.newBillStatus.set('active');
    this.newBillAmount.set(null);
    this.newBillCurrency.set('USD');
    this.newBillInterval.set('monthly');
    this.newBillMethod.set('mobile_money');
    this.newBillLocalNumber.set('');
    this.newBillPayerName.set('');
    this.newBillPayerPhone.set('');
    this.newBillReference.set('');
    this.newBillNote.set('');
  }

  private cleanText(value: string): string | undefined {
    const cleaned = value.trim();
    return cleaned || undefined;
  }

  private slugify(value: string): string {
    const slug = value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    return slug ? `manual-${slug}` : '';
  }

  private async audit(action: string, record: BillingRecord, message: string): Promise<void> {
    await this.logs.audit({
      action,
      targetType: 'billingRecord',
      targetId: record.id,
      actorEmail: this.profile()?.email,
      message,
      meta: {
        orgId: record.orgId,
        orgName: record.orgName ?? null,
        plan: record.plan,
        status: record.status,
      },
    });
  }

  private toDate(value: any): Date | null {
    if (!value) return null;
    const date = typeof value?.toDate === 'function' ? value.toDate() : new Date(value);
    return Number.isNaN(+date) ? null : date;
  }

  private setNotice(message: string): void {
    this.notice.set(message);
    window.setTimeout(() => {
      if (this.notice() === message) this.notice.set('');
    }, 3000);
  }
}
