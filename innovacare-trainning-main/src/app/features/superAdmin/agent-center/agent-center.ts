import { CommonModule } from '@angular/common';
import { Component, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import {
  AgentTask,
  AgentTaskIntent,
  AgentTaskStatus,
  AgenticAgentService,
} from '../services/agentic-agent.service';
import { LanguageService } from '../../../shared/services/language';

type AgentBlueprint = {
  key: string;
  name: string;
  intent: AgentTaskIntent;
  label: string;
  summary: string;
  output: string;
  recommendedAction: string;
  priority: 'normal' | 'high' | 'urgent';
};

@Component({
  selector: 'app-agent-center',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './agent-center.html',
  styleUrl: './agent-center.css',
})
export class AgentCenterComponent {
  private readonly agent = inject(AgenticAgentService);
  readonly lang = inject(LanguageService);

  readonly tasks = toSignal(this.agent.list(), { initialValue: [] as AgentTask[] });
  readonly selectedId = signal<string | null>(null);
  readonly statusFilter = signal<AgentTaskStatus | 'active' | 'all'>('active');
  readonly intentFilter = signal<AgentTaskIntent | 'all'>('all');
  readonly search = signal('');
  readonly busy = signal(false);
  readonly notice = signal('');
  readonly error = signal('');
  readonly emailSubject = signal('');
  readonly emailHtml = signal('');
  readonly notificationUid = signal('');
  readonly orgId = signal('');
  readonly agentTopic = signal('Promote Innovacare Training to organizations outside healthcare');

  readonly blueprints: AgentBlueprint[] = [
    {
      key: 'seo_article',
      name: this.lang.t('SEO & Article Agent'),
      intent: 'seo_article',
      label: this.lang.t('Content Studio'),
      summary: this.lang.t('Plans SEO article topics, headlines, keywords, meta descriptions and article quality checks.'),
      output: this.lang.t('SEO brief, article outline, meta title, meta description, keywords, publish checklist.'),
      recommendedAction: this.lang.t('Create an SEO article brief and draft pack in Content Studio.'),
      priority: 'high',
    },
    {
      key: 'lead_follow_up',
      name: this.lang.t('Commercial Lead Follow-up Agent'),
      intent: 'lead_follow_up',
      label: this.lang.t('Sales'),
      summary: this.lang.t('Ranks demo requests and prepares practical follow-up emails for warm, medium and cold leads.'),
      output: this.lang.t('Lead score, next action, email subject, email body, follow-up timing.'),
      recommendedAction: this.lang.t('Review lead context and queue a personalized follow-up email.'),
      priority: 'urgent',
    },
    {
      key: 'organization_onboarding',
      name: this.lang.t('Organization Onboarding Agent'),
      intent: 'organization_onboarding',
      label: this.lang.t('Implementation'),
      summary: this.lang.t('Suggests starter courses, quick practice sheets, policies and reminders for a new organization.'),
      output: this.lang.t('Onboarding checklist, initial assignments, role setup, launch reminders.'),
      recommendedAction: this.lang.t('Prepare an organization launch plan before inviting learners.'),
      priority: 'high',
    },
    {
      key: 'compliance_certification',
      name: this.lang.t('Compliance & Certification Agent'),
      intent: 'compliance_certification',
      label: this.lang.t('Governance'),
      summary: this.lang.t('Monitors training gaps, expiring certificates and proof-of-readiness needs.'),
      output: this.lang.t('Compliance risks, overdue list, certification recommendations, report notes.'),
      recommendedAction: this.lang.t('Review compliance gaps and create certification or reminder actions.'),
      priority: 'high',
    },
    {
      key: 'notification_reminder',
      name: this.lang.t('Notification & Reminder Agent'),
      intent: 'notification_reminder',
      label: this.lang.t('Engagement'),
      summary: this.lang.t('Prepares reminder messages for overdue, inactive or upcoming learners and managers.'),
      output: this.lang.t('Reminder audience, message text, send timing, escalation suggestion.'),
      recommendedAction: this.lang.t('Request a reminder scan or create an in-app notification.'),
      priority: 'normal',
    },
    {
      key: 'content_repurpose',
      name: this.lang.t('Content Repurpose Agent'),
      intent: 'content_repurpose',
      label: this.lang.t('Marketing'),
      summary: this.lang.t('Turns one article into LinkedIn, Facebook, WhatsApp, newsletter and short video copy.'),
      output: this.lang.t('Social posts, newsletter teaser, WhatsApp text, short video script.'),
      recommendedAction: this.lang.t('Repurpose a published article into channel-specific marketing posts.'),
      priority: 'high',
    },
  ];

  readonly statusOptions: Array<{ value: AgentTaskStatus | 'active' | 'all'; label: string }> = [
    { value: 'active', label: this.lang.t('Active') },
    { value: 'all', label: this.lang.t('All') },
    { value: 'new', label: this.lang.t('New') },
    { value: 'ready', label: this.lang.t('Ready') },
    { value: 'in_progress', label: this.lang.t('In progress') },
    { value: 'completed', label: this.lang.t('Completed') },
    { value: 'dismissed', label: this.lang.t('Dismissed') },
    { value: 'failed', label: this.lang.t('Failed') },
  ];

  readonly intentOptions: Array<{ value: AgentTaskIntent | 'all'; label: string }> = [
    { value: 'all', label: this.lang.t('All intents') },
    { value: 'intake', label: this.lang.t('Intake') },
    { value: 'marketing_follow_up', label: this.lang.t('Marketing') },
    { value: 'notification', label: this.lang.t('Notification') },
    { value: 'email', label: this.lang.t('Email') },
    { value: 'reminder', label: this.lang.t('Reminder') },
    { value: 'seo_article', label: this.lang.t('SEO Article') },
    { value: 'lead_follow_up', label: this.lang.t('Lead Follow-up') },
    { value: 'organization_onboarding', label: this.lang.t('Org Onboarding') },
    { value: 'compliance_certification', label: this.lang.t('Compliance') },
    { value: 'notification_reminder', label: this.lang.t('Smart Reminder') },
    { value: 'content_repurpose', label: this.lang.t('Repurpose') },
  ];

  readonly filtered = computed(() => {
    const status = this.statusFilter();
    const intent = this.intentFilter();
    const term = this.search().trim().toLowerCase();

    return this.tasks().filter((task) => {
      const taskStatus = this.statusOf(task);
      const statusMatch =
        status === 'all' ||
        (status === 'active' && !['completed', 'dismissed'].includes(taskStatus)) ||
        taskStatus === status;
      const intentMatch = intent === 'all' || task.intent === intent;
      const blob = [
        task.title,
        task.summary,
        task.leadName || '',
        task.leadEmail || '',
        task.organizationName || '',
        task.organizationType || '',
      ].join(' ').toLowerCase();
      return statusMatch && intentMatch && (!term || blob.includes(term));
    });
  });

  readonly selected = computed(() => {
    const id = this.selectedId();
    const items = this.filtered();
    return items.find((item) => item.id === id) ?? items[0] ?? null;
  });

  readonly stats = computed(() => {
    const tasks = this.tasks();
    return {
      total: tasks.length,
      active: tasks.filter((task) => !['completed', 'dismissed'].includes(this.statusOf(task))).length,
      urgent: tasks.filter((task) => this.priorityOf(task) === 'urgent').length,
      email: tasks.filter((task) => task.intent === 'email' || task.intent === 'marketing_follow_up').length,
      reminders: tasks.filter((task) => task.intent === 'reminder').length,
      agents: this.blueprints.length,
    };
  });

  constructor() {
    effect(() => {
      const task = this.selected();
      this.emailSubject.set(String(task?.metadata?.suggestedSubject || this.defaultSubject(task)));
      this.emailHtml.set(String(task?.metadata?.suggestedHtml || this.defaultEmail(task)));
      this.orgId.set(task?.orgId || '');
      this.notificationUid.set('');
      this.error.set('');
    }, { allowSignalWrites: true });
  }

  select(task: AgentTask): void {
    this.selectedId.set(task.id ?? null);
    this.notice.set('');
    this.error.set('');
  }

  statusOf(task: AgentTask): AgentTaskStatus {
    return task.status || 'new';
  }

  priorityOf(task: AgentTask): 'normal' | 'high' | 'urgent' {
    return task.priority || 'normal';
  }

  canEmail(task: AgentTask | null): boolean {
    return !!task?.leadEmail;
  }

  async queueEmail(task: AgentTask): Promise<void> {
    if (!task.id || !task.leadEmail) return;
    await this.run(this.lang.t('Email queued for delivery.'), {
      taskId: task.id,
      action: 'queue_email',
      to: [task.leadEmail],
      subject: this.emailSubject(),
      html: this.emailHtml(),
    });
  }

  async createNotification(task: AgentTask): Promise<void> {
    if (!task.id) return;
    const uid = this.notificationUid().trim();
    if (!uid) {
      this.error.set(this.lang.t('Enter the target user UID before creating an in-app notification.'));
      return;
    }
    await this.run(this.lang.t('In-app notification created.'), {
      taskId: task.id,
      action: 'create_notification',
      notificationUid: uid,
      notificationTitle: task.title,
      notificationBody: task.summary,
    });
  }

  async requestReminderScan(task: AgentTask): Promise<void> {
    if (!task.id) return;
    const orgId = this.orgId().trim();
    if (!orgId) {
      this.error.set(this.lang.t('Enter an organization ID before requesting reminder scan.'));
      return;
    }
    await this.run(this.lang.t('Reminder scan requested.'), {
      taskId: task.id,
      action: 'request_reminder_scan',
      orgId,
    });
  }

  async complete(task: AgentTask): Promise<void> {
    if (!task.id) return;
    await this.run(this.lang.t('Task completed.'), { taskId: task.id, action: 'complete' });
  }

  async dismiss(task: AgentTask): Promise<void> {
    if (!task.id) return;
    await this.run(this.lang.t('Task dismissed.'), { taskId: task.id, action: 'dismiss' });
  }

  async backfill(): Promise<void> {
    this.busy.set(true);
    this.error.set('');
    try {
      const result = await this.agent.backfill(50);
      this.setNotice(`${this.lang.t('Agent queue refreshed from')} ${result.createdOrUpdated} ${this.lang.t('intake records.')}`);
    } catch (err: any) {
      this.error.set(err?.message || this.lang.t('Unable to backfill agent tasks.'));
    } finally {
      this.busy.set(false);
    }
  }

  async markInProgress(task: AgentTask): Promise<void> {
    if (!task.id) return;
    this.busy.set(true);
    this.error.set('');
    try {
      await this.agent.markInProgress(task.id);
      this.setNotice(this.lang.t('Task moved to in progress.'));
    } catch (err: any) {
      this.error.set(err?.message || this.lang.t('Unable to update task.'));
    } finally {
      this.busy.set(false);
    }
  }

  async createAgentTask(blueprint: AgentBlueprint): Promise<void> {
    this.busy.set(true);
    this.error.set('');
    const topic = this.agentTopic().trim() || blueprint.summary;
    try {
      await this.agent.createManualTask({
        sourceType: 'manual',
        sourceId: `${blueprint.key}_${Date.now()}`,
        intent: blueprint.intent,
        title: `${blueprint.name}: ${topic}`,
        summary: blueprint.summary,
        priority: blueprint.priority,
        status: 'ready',
        channel: blueprint.intent === 'notification_reminder' ? 'notification' : 'mixed',
        recommendedAction: blueprint.recommendedAction,
        metadata: {
          agentKey: blueprint.key,
          agentName: blueprint.name,
          topic,
          output: blueprint.output,
          suggestedSubject: `${blueprint.name} action plan`,
          suggestedHtml: this.defaultAgentBrief(blueprint, topic),
        },
      });
      this.setNotice(`${blueprint.name} ${this.lang.t('task created.')}`);
    } catch (err: any) {
      this.error.set(err?.message || this.lang.t('Unable to create agent task.'));
    } finally {
      this.busy.set(false);
    }
  }

  formatDate(value: any): string {
    const date = this.toDate(value);
    if (!date) return '-';
    return date.toLocaleString([], {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  }

  private async run(message: string, payload: any): Promise<void> {
    this.busy.set(true);
    this.error.set('');
    try {
      await this.agent.runAction(payload);
      this.setNotice(message);
    } catch (err: any) {
      this.error.set(err?.message || this.lang.t('Agent action failed.'));
    } finally {
      this.busy.set(false);
    }
  }

  private defaultSubject(task: AgentTask | null): string {
    if (!task) return '';
    return task.organizationName
      ? `${this.lang.t('Innovacare Training follow-up for')} ${task.organizationName}`
      : this.lang.t('Innovacare Training follow-up');
  }

  private defaultEmail(task: AgentTask | null): string {
    const name = task?.leadName || 'there';
    const organization = task?.organizationName || 'your organization';
    return [
      `<p>Hello ${this.escape(name)},</p>`,
      `<p>Thank you for your interest in Innovacare Training. I reviewed the request for ${this.escape(organization)} and can help you set up the right workflow.</p>`,
      '<p>Please reply with two times that work for a short walkthrough.</p>',
      '<p>Best regards,<br>Innovacare Training Team</p>',
    ].join('');
  }

  private defaultAgentBrief(agent: AgentBlueprint, topic: string): string {
    return [
      `<p><strong>Agent:</strong> ${this.escape(agent.name)}</p>`,
      `<p><strong>Topic:</strong> ${this.escape(topic)}</p>`,
      `<p><strong>Purpose:</strong> ${this.escape(agent.summary)}</p>`,
      `<p><strong>Expected output:</strong> ${this.escape(agent.output)}</p>`,
      `<p><strong>Next action:</strong> ${this.escape(agent.recommendedAction)}</p>`,
    ].join('');
  }

  private escape(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
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
