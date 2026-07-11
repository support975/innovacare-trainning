import { CommonModule } from '@angular/common';
import { Component, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { AuthService } from '../../../core/auth';
import { SuperAdminLogsService } from '../services/super-admin-logs';
import {
  DemoRequestPriority,
  DemoRequestStatus,
  SuperAdminDemoRequest,
  SuperAdminDemoRequestsService,
} from '../services/super-admin-demo-requests';

@Component({
  selector: 'app-super-admin-demo-requests',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './demo-requests.html',
  styleUrl: './demo-requests.css',
})
export class DemoRequestsComponent {
  private readonly service = inject(SuperAdminDemoRequestsService);
  private readonly auth = inject(AuthService);
  private readonly logs = inject(SuperAdminLogsService);

  readonly requests = toSignal(this.service.list(), { initialValue: [] as SuperAdminDemoRequest[] });
  readonly profile = toSignal(this.auth.profile$, { initialValue: null });
  readonly statusFilter = signal<DemoRequestStatus | 'all'>('all');
  readonly search = signal('');
  readonly selectedId = signal<string | null>(null);
  readonly saving = signal(false);
  readonly notice = signal('');
  readonly internalNotes = signal('');
  readonly responseDraft = signal('');

  readonly filtered = computed(() => {
    const status = this.statusFilter();
    const term = this.search().trim().toLowerCase();

    return this.requests().filter((request) => {
      const normalizedStatus = this.statusOf(request);
      const statusMatch = status === 'all' || normalizedStatus === status;
      const blob = [
        request.fullName,
        request.workEmail,
        request.phone ?? '',
        request.organizationName,
        request.organizationType,
        request.selectedPlan ?? '',
        request.message,
      ].join(' ').toLowerCase();

      return statusMatch && (!term || blob.includes(term));
    });
  });

  readonly selected = computed(() => {
    const id = this.selectedId();
    const items = this.filtered();
    return items.find((item) => item.id === id) ?? items[0] ?? null;
  });

  readonly kpis = computed(() => {
    const all = this.requests();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return {
      total: all.length,
      new: all.filter((item) => this.statusOf(item) === 'new').length,
      contacted: all.filter((item) => this.statusOf(item) === 'contacted').length,
      converted: all.filter((item) => this.statusOf(item) === 'converted').length,
      today: all.filter((item) => {
        const created = this.toDate(item.createdAt);
        return created ? created >= today : false;
      }).length,
      urgent: all.filter((item) => this.priorityOf(item) === 'urgent').length,
    };
  });

  readonly statusOptions: Array<{ value: DemoRequestStatus; label: string }> = [
    { value: 'new', label: 'New' },
    { value: 'reviewing', label: 'Reviewing' },
    { value: 'contacted', label: 'Contacted' },
    { value: 'qualified', label: 'Qualified' },
    { value: 'converted', label: 'Converted' },
    { value: 'closed', label: 'Closed' },
  ];

  readonly priorityOptions: Array<{ value: DemoRequestPriority; label: string }> = [
    { value: 'normal', label: 'Normal' },
    { value: 'high', label: 'High' },
    { value: 'urgent', label: 'Urgent' },
  ];

  constructor() {
    effect(() => {
      const selected = this.selected();
      this.internalNotes.set(selected?.internalNotes ?? '');
      this.responseDraft.set(selected?.responseDraft || this.defaultResponse(selected));
    }, { allowSignalWrites: true });
  }

  select(request: SuperAdminDemoRequest): void {
    this.selectedId.set(request.id ?? null);
    this.notice.set('');
  }

  statusOf(request: SuperAdminDemoRequest): DemoRequestStatus {
    return request.status ?? 'new';
  }

  priorityOf(request: SuperAdminDemoRequest): DemoRequestPriority {
    return request.priority ?? 'normal';
  }

  async updateStatus(request: SuperAdminDemoRequest, status: DemoRequestStatus): Promise<void> {
    if (!request.id) return;
    this.saving.set(true);
    try {
      await this.service.updateStatus(request.id, status, this.profile()?.email ?? null);
      await this.audit('demo_request_status', request, `Demo request marked ${status}.`);
      this.setNotice('Request status updated.');
    } finally {
      this.saving.set(false);
    }
  }

  async updatePriority(request: SuperAdminDemoRequest, priority: DemoRequestPriority): Promise<void> {
    if (!request.id) return;
    this.saving.set(true);
    try {
      await this.service.updatePriority(request.id, priority, this.profile()?.email ?? null);
      await this.audit('demo_request_priority', request, `Demo request priority set to ${priority}.`);
      this.setNotice('Priority updated.');
    } finally {
      this.saving.set(false);
    }
  }

  async saveTreatment(request: SuperAdminDemoRequest): Promise<void> {
    if (!request.id) return;
    this.saving.set(true);
    try {
      await this.service.saveTreatment(request.id, {
        internalNotes: this.internalNotes(),
        responseDraft: this.responseDraft(),
        actorEmail: this.profile()?.email ?? null,
      });
      await this.audit('demo_request_treatment_saved', request, 'Demo request treatment saved.');
      this.setNotice('Treatment notes saved.');
    } finally {
      this.saving.set(false);
    }
  }

  async respond(request: SuperAdminDemoRequest): Promise<void> {
    if (!request.id) return;
    const draft = this.responseDraft().trim() || this.defaultResponse(request);
    this.openMailClient(request, draft);

    this.saving.set(true);
    try {
      await this.service.markResponded(request.id, draft, this.profile()?.email ?? null);
      await this.audit('demo_request_response_started', request, 'Response opened and request marked contacted.');
      this.setNotice('Email opened and request marked contacted.');
    } finally {
      this.saving.set(false);
    }
  }

  call(request: SuperAdminDemoRequest): void {
    if (!request.phone) return;
    window.location.href = `tel:${request.phone}`;
  }

  formatDate(value: any): string {
    const date = this.toDate(value);
    if (!date) return '—';
    return date.toLocaleString([], {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  }

  private defaultResponse(request: SuperAdminDemoRequest | null): string {
    if (!request) return '';

    const planLine = request.selectedPlan ? ` for the ${request.selectedPlan} plan` : '';
    return [
      `Hello ${request.fullName},`,
      '',
      `Thank you for requesting a demo of Innovacare Training${planLine}.`,
      `I reviewed your request for ${request.organizationName} and would be glad to schedule a short walkthrough.`,
      '',
      'Please send me two times that work for you this week, or reply with your preferred contact window.',
      '',
      'Best regards,',
      'Innovacare Training Team',
    ].join('\n');
  }

  private openMailClient(request: SuperAdminDemoRequest, draft: string): void {
    const subject = `Innovacare Training demo for ${request.organizationName}`;
    const href = `mailto:${encodeURIComponent(request.workEmail)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(draft)}`;
    window.location.href = href;
  }

  private async audit(action: string, request: SuperAdminDemoRequest, message: string): Promise<void> {
    await this.logs.audit({
      action,
      targetType: 'demoRequest',
      targetId: request.id,
      actorEmail: this.profile()?.email,
      message,
      meta: {
        organizationName: request.organizationName,
        workEmail: request.workEmail,
        selectedPlan: request.selectedPlan ?? null,
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
