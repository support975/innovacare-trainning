import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Firestore, doc, getDoc } from '@angular/fire/firestore';
import { Policy, PolicyAcknowledgement } from '../../learner/policy/model/policy.model';
import { PolicyService } from '../../../shared/services/policy';

type UserLabel = {
  name: string;
  email: string;
  role: string;
};

type ReportRow = {
  userId: string;
  userName: string;
  userEmail: string;
  userRole: string;
  status: 'acknowledged' | 'missing';
  policyVersion: string;
  acknowledgedAt: string;
  acknowledgedAtMs: number;
  assignmentState: 'assigned' | 'acknowledged_without_assignment';
};

@Component({
  selector: 'app-policy-ack-report',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './policy-ack-report.page.html',
  styleUrl: './policy-ack-report.page.css',
})
export class PolicyAckReportPage implements OnInit {
  private readonly policySvc = inject(PolicyService);
  private readonly afs = inject(Firestore);

  readonly policies = signal<Policy[]>([]);
  readonly rows = signal<ReportRow[]>([]);
  readonly selectedPolicyId = signal('');
  readonly statusFilter = signal<'all' | 'acknowledged' | 'missing'>('all');
  readonly search = signal('');
  readonly busy = signal(false);
  readonly loaded = signal(false);
  readonly notice = signal('');
  readonly isError = signal(false);

  readonly selectedPolicy = computed(() =>
    this.policies().find(policy => policy.id === this.selectedPolicyId()) ?? null
  );

  readonly filteredRows = computed(() => {
    const status = this.statusFilter();
    const term = this.search().trim().toLowerCase();

    return this.rows().filter(row => {
      const matchStatus = status === 'all' || row.status === status;
      const blob = `${row.userName} ${row.userEmail} ${row.userRole} ${row.policyVersion}`.toLowerCase();
      return matchStatus && (!term || blob.includes(term));
    });
  });

  readonly summary = computed(() => {
    const rows = this.rows();
    const assigned = rows.filter(row => row.assignmentState === 'assigned').length;
    const acknowledged = rows.filter(row => row.status === 'acknowledged').length;
    const missing = rows.filter(row => row.status === 'missing').length;
    const completionPct = assigned ? Math.round((acknowledged / assigned) * 100) : 0;

    return {
      assigned,
      acknowledged,
      missing,
      completionPct,
    };
  });

  async ngOnInit(): Promise<void> {
    await this.loadPolicies();
  }

  async loadPolicies(): Promise<void> {
    this.busy.set(true);
    this.notice.set('');
    this.isError.set(false);

    try {
      const policies = await this.policySvc.listPolicies({ includeArchived: true });
      const sorted = policies.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
      this.policies.set(sorted);

      if (!this.selectedPolicyId() && sorted[0]?.id) {
        this.selectedPolicyId.set(sorted[0].id);
        await this.run();
      }
    } catch (error: any) {
      this.notice.set(error?.message || 'Unable to load policies.');
      this.isError.set(true);
    } finally {
      this.busy.set(false);
    }
  }

  async run(): Promise<void> {
    const policyId = this.selectedPolicyId();
    if (!policyId) return;

    this.busy.set(true);
    this.loaded.set(false);
    this.notice.set('');
    this.isError.set(false);

    try {
      const [assignments, acknowledgements] = await Promise.all([
        this.policySvc.listAssignmentsForPolicy(policyId),
        this.policySvc.listAcknowledgementsForPolicy(policyId),
      ]);

      const activeAssignments = assignments.filter(assignment => assignment.active !== false);
      const assignedUserIds = activeAssignments
        .map(assignment => String(assignment.userId ?? ''))
        .filter(Boolean);

      const latestAckByUser = new Map<string, PolicyAcknowledgement>();
      for (const ack of acknowledgements) {
        const userId = String((ack as any).userId ?? '');
        if (!userId) continue;
        const current = latestAckByUser.get(userId);
        if (!current || this.epochMs(ack.acknowledgedAt) > this.epochMs(current.acknowledgedAt)) {
          latestAckByUser.set(userId, ack);
        }
      }

      const allUserIds = Array.from(new Set([
        ...assignedUserIds,
        ...Array.from(latestAckByUser.keys()),
      ]));

      const userMap = new Map<string, UserLabel>();
      await Promise.all(allUserIds.map(async uid => {
        userMap.set(uid, await this.getUserLabel(uid));
      }));

      const rows: ReportRow[] = allUserIds.map(userId => {
        const user = userMap.get(userId) ?? { name: '', email: '', role: '' };
        const ack = latestAckByUser.get(userId);
        const assigned = assignedUserIds.includes(userId);

        return {
          userId,
          userName: user.name || user.email || userId,
          userEmail: user.email,
          userRole: user.role || 'learner',
          status: ack ? 'acknowledged' : 'missing',
          policyVersion: String((ack as any)?.policyVersion ?? this.selectedPolicy()?.version ?? ''),
          acknowledgedAt: ack ? this.formatDate(ack.acknowledgedAt) : '-',
          acknowledgedAtMs: ack ? this.epochMs(ack.acknowledgedAt) : 0,
          assignmentState: assigned ? 'assigned' : 'acknowledged_without_assignment',
        };
      });

      rows.sort((a, b) => {
        if (a.status !== b.status) return a.status === 'missing' ? -1 : 1;
        return a.userName.localeCompare(b.userName);
      });

      this.rows.set(rows);
      this.loaded.set(true);

      if (!activeAssignments.length && !acknowledgements.length) {
        this.notice.set('No learner has been assigned to this policy yet.');
      }
    } catch (error: any) {
      this.notice.set(error?.message || 'Unable to build acknowledgement report.');
      this.isError.set(true);
    } finally {
      this.busy.set(false);
    }
  }

  exportCsv(): void {
    const rows = this.filteredRows();
    if (!rows.length) return;

    const header = ['User', 'Email', 'Role', 'Status', 'Version', 'Acknowledged At', 'Assignment'];
    const body = rows.map(row => [
      row.userName,
      row.userEmail,
      row.userRole,
      row.status,
      row.policyVersion,
      row.acknowledgedAt,
      row.assignmentState,
    ]);

    const csv = [header, ...body]
      .map(line => line.map(value => `"${String(value ?? '').replace(/"/g, '""')}"`).join(','))
      .join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `policy-acknowledgements-${this.selectedPolicyId() || 'report'}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  private async getUserLabel(uid: string): Promise<UserLabel> {
    try {
      const snap = await getDoc(doc(this.afs, `users/${uid}`));
      if (!snap.exists()) return { name: '', email: '', role: '' };

      const data: any = snap.data();
      const name = String(
        data.displayName ??
        data.fullName ??
        data.name ??
        data.profile?.displayName ??
        ''
      ).trim();
      const email = String(data.email ?? data.profile?.email ?? '').trim();
      const role = String(data.role ?? data.title ?? data.position ?? data.jobTitle ?? '').trim();

      return { name, email, role };
    } catch {
      return { name: '', email: '', role: '' };
    }
  }

  private formatDate(value: any): string {
    const ms = this.epochMs(value);
    if (!ms) return '-';
    return new Date(ms).toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: 'numeric',
      minute: '2-digit',
    });
  }

  private epochMs(value: any): number {
    if (!value) return 0;
    if (typeof value?.toMillis === 'function') return value.toMillis();
    if (typeof value?.seconds === 'number') return value.seconds * 1000;
    const parsed = new Date(value).getTime();
    return Number.isNaN(parsed) ? 0 : parsed;
  }
}
