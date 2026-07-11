import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Firestore, collection, collectionData, collectionGroup, query, where } from '@angular/fire/firestore';
import { toSignal } from '@angular/core/rxjs-interop';
import { combineLatest, from, map, of, switchMap } from 'rxjs';
import { filter } from 'rxjs/operators';
import { AuthService } from '../../../core/auth';
import { PolicyService } from '../../../shared/services/policy';
import type { Policy, PolicyAcknowledgement } from '../../learner/policy/model/policy.model';

interface LearnerDoc {
  id: string;
  displayName?: string;
  email?: string;
  role?: string;
  orgId?: string | null;
}

interface EnrollmentDoc {
  uid?: string;
  courseId: string;
  status: string;
  score?: number;
  orgId?: string | null;
  dueDate?: any;
  assignedAt?: any;
}

type PolicyComplianceRow = {
  id: string;
  title: string;
  version: string;
  acked: number;
  missing: number;
  compliancePct: number;
};

type LearnerRiskRow = {
  id: string;
  learner: string;
  email: string;
  overdueCount: number;
  missingPolicies: number;
  avgScore: number | null;
  riskScore: number;
  riskLabel: 'High' | 'Medium' | 'Low';
};

type RiskFilter = 'all' | 'high' | 'medium' | 'low';

const DAY = 24 * 60 * 60 * 1000;
const DEFAULT_DUE_DAYS = 30;

function epochMs(x: any): number | undefined {
  if (!x) return undefined;
  if (typeof x === 'number') return x;
  if (typeof x === 'string') {
    const ts = Date.parse(x);
    return Number.isNaN(ts) ? undefined : ts;
  }
  if (typeof x?.toMillis === 'function') return x.toMillis();
  if (typeof x?.seconds === 'number') return x.seconds * 1000;
  return undefined;
}

@Component({
  standalone: true,
  selector: 'app-audit-center',
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <div class="audit-page">
      <header class="page-header">
        <div>
          <div class="page-eyebrow">Manager · Audit</div>
          <h1 class="page-title">Audit Center</h1>
          <p class="page-sub">Track policy evidence, learner compliance gaps and operational risk in one place.</p>
        </div>
        <div class="page-actions">
          <a class="btn-primary" routerLink="/manager/policies">Policy Library</a>
          <a class="btn-ghost" routerLink="/manager/learners">Learner Risk</a>
        </div>
      </header>

      <section class="stat-row">
        <article class="stat-card"><div class="stat-value">{{ summary().requiredPolicies }}</div><div class="stat-label">Required policies</div></article>
        <article class="stat-card"><div class="stat-value">{{ summary().learners }}</div><div class="stat-label">Learners in scope</div></article>
        <article class="stat-card stat-card--warn"><div class="stat-value">{{ summary().missingAcknowledgements }}</div><div class="stat-label">Missing acknowledgements</div></article>
        <article class="stat-card stat-card--warn"><div class="stat-value">{{ summary().overdueLearners }}</div><div class="stat-label">Learners overdue</div></article>
      </section>

      <section class="toolbar">
        <label class="toolbar-label" for="policyFilter">Focus policy</label>
        <select id="policyFilter" class="toolbar-select" [ngModel]="selectedPolicyId()" (ngModelChange)="selectedPolicyId.set($event)">
          <option value="">All required policies</option>
          <option *ngFor="let policy of requiredPolicies()" [value]="policy.id">{{ policy.title }}</option>
        </select>
        <label class="toolbar-label" for="riskFilter">Risk level</label>
        <select id="riskFilter" class="toolbar-select" [ngModel]="riskFilter()" (ngModelChange)="riskFilter.set($event)">
          <option value="all">All risks</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
      </section>

      <section class="grid">
        <article class="panel">
          <div class="panel-head">
            <h2>Policy compliance snapshot</h2>
            <div class="panel-actions">
              <button type="button" class="panel-btn" (click)="exportPolicyCsv()">Export CSV</button>
              <a class="panel-link" routerLink="/manager/policy-report">Legacy report</a>
            </div>
          </div>
          <div class="table-wrap">
            <table class="table">
              <thead>
                <tr>
                  <th>Policy</th>
                  <th>Version</th>
                  <th>Acknowledged</th>
                  <th>Missing</th>
                  <th>Compliance</th>
                </tr>
              </thead>
              <tbody>
                <tr *ngFor="let row of filteredPolicyRows()">
                  <td>{{ row.title }}</td>
                  <td>{{ row.version || '—' }}</td>
                  <td>{{ row.acked }}</td>
                  <td><span class="pill pill--warn">{{ row.missing }}</span></td>
                  <td>{{ row.compliancePct }}%</td>
                </tr>
                <tr *ngIf="!filteredPolicyRows().length"><td colspan="5" class="empty-row">No compliance rows available.</td></tr>
              </tbody>
            </table>
          </div>
        </article>

        <article class="panel">
          <div class="panel-head">
            <h2>Priority learner risk</h2>
            <div class="panel-actions">
              <button type="button" class="panel-btn" (click)="exportRiskCsv()">Export CSV</button>
              <a class="panel-link" routerLink="/manager/learners">Open learner directory</a>
            </div>
          </div>
          <div class="table-wrap">
            <table class="table">
              <thead>
                <tr>
                  <th>Learner</th>
                  <th>Overdue</th>
                  <th>Policies missing</th>
                  <th>Avg score</th>
                  <th>Risk</th>
                </tr>
              </thead>
              <tbody>
                <tr *ngFor="let row of filteredLearnerRisk()">
                  <td>
                    <div class="learner-name">{{ row.learner }}</div>
                    <div class="learner-email">{{ row.email || '—' }}</div>
                  </td>
                  <td>{{ row.overdueCount }}</td>
                  <td>{{ row.missingPolicies }}</td>
                  <td>{{ row.avgScore !== null ? row.avgScore + '%' : '—' }}</td>
                  <td><span class="pill" [class.pill--high]="row.riskLabel === 'High'" [class.pill--warn]="row.riskLabel === 'Medium'">{{ row.riskLabel }} · {{ row.riskScore }}</span></td>
                </tr>
                <tr *ngIf="!filteredLearnerRisk().length"><td colspan="5" class="empty-row">No learner risks found.</td></tr>
              </tbody>
            </table>
          </div>
        </article>
      </section>
    </div>
  `,
  styles: [`
    .audit-page{display:grid;gap:1.5rem;padding:1.75rem 2rem;max-width:1280px;margin:0 auto;color:#1a2b4a}
    .page-header{display:flex;justify-content:space-between;align-items:flex-end;gap:1rem;flex-wrap:wrap;padding-bottom:1.5rem;border-bottom:1px solid #e4ecf7}
    .page-eyebrow{font-size:.72rem;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:#00a79d;margin-bottom:.4rem}
    .page-title{margin:0;font-size:clamp(1.4rem,3vw,1.9rem);font-weight:800;color:#1a3f6f}.page-sub{margin:.35rem 0 0;color:#5a6a7e;font-size:.88rem}
    .page-actions{display:flex;gap:.75rem;flex-wrap:wrap}.btn-primary,.btn-ghost{display:inline-flex;align-items:center;justify-content:center;padding:.68rem 1.2rem;border-radius:8px;font-weight:700;text-decoration:none}.btn-primary{background:#f26b21;color:#fff}.btn-ghost{background:#fff;color:#1a3f6f;border:1.5px solid #d6e0ee}
    .stat-row{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:1rem}.stat-card{background:#fff;border:1px solid #e4ecf7;border-radius:14px;padding:1.15rem 1.2rem;box-shadow:0 4px 16px rgba(26,63,111,.06)}.stat-card--warn{background:#fff8f0}
    .stat-value{font-size:1.9rem;font-weight:900;color:#1a3f6f}.stat-label{margin-top:.25rem;font-size:.76rem;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#5a6a7e}
    .toolbar{display:flex;align-items:center;gap:.8rem;flex-wrap:wrap}.toolbar-label{font-size:.82rem;font-weight:700;color:#5a6a7e}.toolbar-select{padding:.55rem .85rem;border:1.5px solid #d6e0ee;border-radius:8px;background:#fff;min-width:260px}
    .grid{display:grid;grid-template-columns:1.2fr 1fr;gap:1rem}.panel{background:#fff;border:1px solid #e4ecf7;border-radius:14px;overflow:hidden;box-shadow:0 4px 16px rgba(26,63,111,.06)}
    .panel-head{display:flex;justify-content:space-between;align-items:center;gap:1rem;padding:1.1rem 1.25rem;border-bottom:1px solid #f0f4fb}.panel-head h2{margin:0;font-size:1rem;color:#1a3f6f}.panel-link{color:#00a79d;font-weight:700;text-decoration:none}
    .panel-actions{display:flex;align-items:center;gap:.75rem;flex-wrap:wrap}.panel-btn{padding:.5rem .9rem;border:1px solid #d6e0ee;border-radius:8px;background:#fff;color:#1a3f6f;font-weight:700;cursor:pointer}
    .table-wrap{overflow:auto}.table{width:100%;border-collapse:collapse;font-size:.875rem}.table th{padding:.8rem 1rem;text-align:left;font-size:.72rem;text-transform:uppercase;letter-spacing:.06em;color:#8ea0b8;background:#f8fafd;border-bottom:1px solid #f0f4fb}.table td{padding:.9rem 1rem;border-bottom:1px solid #f4f7fb;vertical-align:middle}
    .pill{display:inline-block;padding:3px 10px;border-radius:999px;font-size:.74rem;font-weight:800;background:#e8eef8;color:#1a3f6f;border:1px solid #d6e0ee}.pill--warn{background:#fff3ec;color:#c14a00;border-color:#fbd0ae}.pill--high{background:#fde8e8;color:#b91c1c;border-color:#fecaca}
    .learner-name{font-weight:800;color:#1a3f6f}.learner-email{font-size:.78rem;color:#8ea0b8;margin-top:.15rem}.empty-row{text-align:center;color:#8ea0b8;padding:2rem}
    @media (max-width:980px){.grid{grid-template-columns:1fr}.stat-row{grid-template-columns:repeat(2,minmax(0,1fr))}}
    @media (max-width:680px){.audit-page{padding:1rem}.stat-row{grid-template-columns:1fr}.page-actions{width:100%}.btn-primary,.btn-ghost{width:100%}.toolbar-select{width:100%}}
  `]
})
export class AuditCenterComponent {
  private afs = inject(Firestore);
  private authSvc = inject(AuthService);
  private policySvc = inject(PolicyService);

  selectedPolicyId = signal('');
  riskFilter = signal<RiskFilter>('all');

  private profile$ = this.authSvc.profile$.pipe(filter(Boolean));

  private learners$ = this.profile$.pipe(
    switchMap(profile => {
      if (!profile.orgId) return of([] as LearnerDoc[]);
      const q = query(collection(this.afs, 'users'), where('orgId', '==', profile.orgId), where('role', '==', 'learner'));
      return collectionData(q, { idField: 'id' }).pipe(map(list => (list || []) as LearnerDoc[]));
    })
  );

  private enrollments$ = this.profile$.pipe(
    switchMap(profile => {
      if (!profile.orgId) return of([] as EnrollmentDoc[]);
      const q = query(collectionGroup(this.afs, 'enrollments'), where('orgId', '==', profile.orgId));
      return collectionData(q, { idField: 'id' }).pipe(map(list => (list || []) as EnrollmentDoc[]));
    })
  );

  private requiredPolicies$ = from(this.policySvc.listPolicies({ includeArchived: false })).pipe(
    map(list => list.filter(policy => policy.status === 'active' && policy.requiresAcknowledgement && policy.id))
  );

  private acknowledgements$ = this.requiredPolicies$.pipe(
    switchMap(policies => {
      if (!policies.length) return of([] as PolicyAcknowledgement[]);
      return combineLatest(policies.map(policy => from(this.policySvc.listAcknowledgementsForPolicy(policy.id!)))).pipe(
        map(groups => groups.flat())
      );
    })
  );

  requiredPolicies = toSignal(this.requiredPolicies$, { initialValue: [] as Policy[] });

  private policyRows$ = combineLatest([this.requiredPolicies$, this.learners$, this.acknowledgements$]).pipe(
    map(([policies, learners, acks]) => policies.map(policy => {
      const ackedUsers = new Set(acks.filter(ack => ack.policyId === policy.id).map(ack => ack.userId));
      const acked = learners.filter(learner => ackedUsers.has(learner.id)).length;
      const missing = Math.max(learners.length - acked, 0);
      return {
        id: policy.id!,
        title: policy.title,
        version: policy.version,
        acked,
        missing,
        compliancePct: learners.length ? Math.round((acked / learners.length) * 100) : 0,
      } as PolicyComplianceRow;
    }))
  );
  policyRows = toSignal(this.policyRows$, { initialValue: [] as PolicyComplianceRow[] });
  filteredPolicyRows = computed(() => {
    const rows = this.policyRows();
    const selected = this.selectedPolicyId();
    return selected ? rows.filter(row => row.id === selected) : rows;
  });

  private learnerRisk$ = combineLatest([this.learners$, this.enrollments$, this.requiredPolicies$, this.acknowledgements$]).pipe(
    map(([learners, enrollments, policies, acks]) => {
      const ackPairs = new Set(acks.map(ack => `${ack.policyId}:${ack.userId}`));
      const now = Date.now();
      return learners
        .map(learner => {
          const learnerEnrollments = enrollments.filter(item => item.uid === learner.id);
          const overdueCount = learnerEnrollments.filter(item => {
            if (item.status === 'completed') return false;
            const assigned = epochMs(item.assignedAt);
            const dueTs = epochMs(item.dueDate) ?? (assigned ? assigned + DEFAULT_DUE_DAYS * DAY : undefined);
            return !!dueTs && dueTs < now;
          }).length;
          const completed = learnerEnrollments.filter(item => item.status === 'completed' && typeof item.score === 'number');
          const avgScore = completed.length ? Math.round(completed.reduce((sum, item) => sum + (item.score ?? 0), 0) / completed.length) : null;
          const missingPolicies = policies.filter(policy => !ackPairs.has(`${policy.id}:${learner.id}`)).length;
          const riskScore = overdueCount * 35 + missingPolicies * 25 + (avgScore !== null && avgScore < 70 ? 20 : avgScore !== null && avgScore < 85 ? 8 : 0);
          const riskLabel = riskScore >= 60 ? 'High' : riskScore >= 25 ? 'Medium' : 'Low';
          return {
            id: learner.id,
            learner: learner.displayName || learner.email || learner.id,
            email: learner.email || '',
            overdueCount,
            missingPolicies,
            avgScore,
            riskScore,
            riskLabel,
          } as LearnerRiskRow;
        })
        .filter(row => row.riskScore > 0)
        .sort((a, b) => b.riskScore - a.riskScore)
        .slice(0, 10);
    })
  );
  learnerRisk = toSignal(this.learnerRisk$, { initialValue: [] as LearnerRiskRow[] });
  filteredLearnerRisk = computed(() => {
    const filterValue = this.riskFilter();
    const rows = this.learnerRisk();
    if (filterValue === 'all') return rows;
    const label = filterValue[0].toUpperCase() + filterValue.slice(1);
    return rows.filter(row => row.riskLabel === label);
  });

  summary = toSignal(
    combineLatest([this.requiredPolicies$, this.learners$, this.acknowledgements$, this.learnerRisk$]).pipe(
      map(([policies, learners, acks, learnerRisk]) => ({
        requiredPolicies: policies.length,
        learners: learners.length,
        missingAcknowledgements: Math.max(policies.length * learners.length - acks.length, 0),
        overdueLearners: learnerRisk.filter(row => row.overdueCount > 0).length,
      }))
    ),
    { initialValue: { requiredPolicies: 0, learners: 0, missingAcknowledgements: 0, overdueLearners: 0 } }
  );

  exportPolicyCsv() {
    const rows = this.filteredPolicyRows();
    const csv = [
      ['policy', 'version', 'acknowledged', 'missing', 'compliancePct'],
      ...rows.map(row => [row.title, row.version, String(row.acked), String(row.missing), String(row.compliancePct)]),
    ]
      .map(columns => columns.map(value => `"${String(value ?? '').replace(/"/g, '""')}"`).join(','))
      .join('\r\n');
    this.downloadCsv(csv, 'audit-policy-compliance');
  }

  exportRiskCsv() {
    const rows = this.filteredLearnerRisk();
    const csv = [
      ['learner', 'email', 'overdueCount', 'missingPolicies', 'avgScore', 'riskLabel', 'riskScore'],
      ...rows.map(row => [row.learner, row.email, String(row.overdueCount), String(row.missingPolicies), row.avgScore === null ? '' : String(row.avgScore), row.riskLabel, String(row.riskScore)]),
    ]
      .map(columns => columns.map(value => `"${String(value ?? '').replace(/"/g, '""')}"`).join(','))
      .join('\r\n');
    this.downloadCsv(csv, 'audit-learner-risk');
  }

  private downloadCsv(csv: string, prefix: string) {
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${prefix}-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }
}