import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { from, map } from 'rxjs';
import { PolicyService } from '../../../shared/services/policy';
import type { Policy } from '../../learner/policy/model/policy.model';

type PolicyRow = Policy & {
  statusLabel: string;
  reviewState: 'due' | 'soon' | 'scheduled' | 'none';
};

@Component({
  standalone: true,
  selector: 'app-policy-library',
  imports: [CommonModule, RouterLink],
  template: `
    <div class="policy-library">
      <header class="page-header">
        <div>
          <div class="page-eyebrow">Manager · Compliance</div>
          <h1 class="page-title">Policy Library</h1>
          <p class="page-sub">Review active policies, edit governance content and monitor upcoming review windows.</p>
        </div>
        <div class="page-actions">
          <a class="btn-primary" routerLink="/manager/policy/new">+ Create Policy</a>
          <a class="btn-ghost" routerLink="/manager/policy-assignments">Assign Policies</a>
          <a class="btn-ghost" routerLink="/manager/audit">Open Audit Center</a>
        </div>
      </header>

      <section class="stat-row">
        <article class="stat-card">
          <div class="stat-value">{{ stats().total }}</div>
          <div class="stat-label">Policies</div>
        </article>
        <article class="stat-card">
          <div class="stat-value">{{ stats().active }}</div>
          <div class="stat-label">Active</div>
        </article>
        <article class="stat-card">
          <div class="stat-value">{{ stats().requiringAck }}</div>
          <div class="stat-label">Require acknowledgement</div>
        </article>
        <article class="stat-card stat-card--warn">
          <div class="stat-value">{{ stats().reviewDue }}</div>
          <div class="stat-label">Review due / soon</div>
        </article>
      </section>

      <section class="panel">
        <div class="panel-head">
          <h2>Governance catalogue</h2>
          <a class="panel-link" routerLink="/manager/policy-report">Acknowledgement report</a>
        </div>
        <div class="table-wrap">
          <table class="table">
            <thead>
              <tr>
                <th>Policy</th>
                <th>Category</th>
                <th>Version</th>
                <th>Language</th>
                <th>Acknowledgement</th>
                <th>Review</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let p of policies()">
                <td>
                  <div class="policy-title">{{ p.title }}</div>
                  <div class="policy-meta">{{ p.area || 'General governance' }}</div>
                </td>
                <td>{{ p.category || '—' }}</td>
                <td>{{ p.version || '—' }}</td>
                <td>{{ p.language | uppercase }}</td>
                <td>
                  <span class="pill" [class.pill--teal]="p.requiresAcknowledgement">{{ p.requiresAcknowledgement ? 'Required' : 'Optional' }}</span>
                </td>
                <td>
                  <span class="pill" [class.pill--warn]="p.reviewState !== 'scheduled'" [class.pill--neutral]="p.reviewState === 'scheduled' || p.reviewState === 'none'">
                    {{ reviewLabel(p) }}
                  </span>
                </td>
                <td>
                  <span class="pill" [class.pill--neutral]="p.status !== 'active'" [class.pill--teal]="p.status === 'active'">{{ p.statusLabel }}</span>
                </td>
                <td class="td-actions">
                  <a class="action-link" [routerLink]="['/manager/policy', p.id, 'edit']">Edit</a>
                </td>
              </tr>
              <tr *ngIf="!policies().length">
                <td colspan="8" class="empty-row">No policies found yet.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>
  `,
  styles: [`
    .policy-library{display:grid;gap:1.5rem;padding:1.75rem 2rem;max-width:1280px;margin:0 auto;color:#1a2b4a}
    .page-header{display:flex;justify-content:space-between;gap:1rem;align-items:flex-end;flex-wrap:wrap;padding-bottom:1.5rem;border-bottom:1px solid #e4ecf7}
    .page-eyebrow{font-size:.72rem;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:#00a79d;margin-bottom:.4rem}
    .page-title{margin:0;font-size:clamp(1.4rem,3vw,1.9rem);font-weight:800;color:#1a3f6f}
    .page-sub{margin:.35rem 0 0;color:#5a6a7e;font-size:.88rem}
    .page-actions{display:flex;gap:.75rem;flex-wrap:wrap}
    .btn-primary,.btn-ghost{display:inline-flex;align-items:center;justify-content:center;padding:.68rem 1.2rem;border-radius:8px;font-weight:700;text-decoration:none}
    .btn-primary{background:#f26b21;color:#fff;box-shadow:0 4px 14px rgba(242,107,33,.28)}
    .btn-ghost{background:#fff;color:#1a3f6f;border:1.5px solid #d6e0ee}
    .stat-row{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:1rem}
    .stat-card{background:#fff;border:1px solid #e4ecf7;border-radius:14px;padding:1.15rem 1.2rem;box-shadow:0 4px 16px rgba(26,63,111,.06)}
    .stat-card--warn{background:#fff8f0}
    .stat-value{font-size:1.9rem;font-weight:900;color:#1a3f6f}
    .stat-label{margin-top:.25rem;font-size:.76rem;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#5a6a7e}
    .panel{background:#fff;border:1px solid #e4ecf7;border-radius:14px;overflow:hidden;box-shadow:0 4px 16px rgba(26,63,111,.06)}
    .panel-head{display:flex;justify-content:space-between;align-items:center;gap:1rem;padding:1.1rem 1.25rem;border-bottom:1px solid #f0f4fb}
    .panel-head h2{margin:0;font-size:1rem;color:#1a3f6f}
    .panel-link{color:#00a79d;font-weight:700;text-decoration:none}
    .table-wrap{overflow:auto}.table{width:100%;border-collapse:collapse;font-size:.875rem}
    .table th{padding:.8rem 1rem;text-align:left;font-size:.72rem;text-transform:uppercase;letter-spacing:.06em;color:#8ea0b8;background:#f8fafd;border-bottom:1px solid #f0f4fb}
    .table td{padding:.9rem 1rem;border-bottom:1px solid #f4f7fb;vertical-align:middle}
    .policy-title{font-weight:800;color:#1a3f6f}.policy-meta{font-size:.78rem;color:#8ea0b8;margin-top:.15rem}
    .pill{display:inline-block;padding:3px 10px;border-radius:999px;font-size:.74rem;font-weight:800;background:#f4f7fb;color:#5a6a7e;border:1px solid #e4ecf7}
    .pill--teal{background:#e6f6f5;color:#00756d;border-color:#b3e8e5}.pill--warn{background:#fff3ec;color:#c14a00;border-color:#fbd0ae}.pill--neutral{background:#e8eef8;color:#1a3f6f;border-color:#d6e0ee}
    .td-actions{text-align:right}.action-link{color:#1a3f6f;font-weight:700;text-decoration:none}
    .empty-row{text-align:center;color:#8ea0b8;padding:2rem}
    @media (max-width:900px){.stat-row{grid-template-columns:repeat(2,minmax(0,1fr))}}
    @media (max-width:680px){.policy-library{padding:1rem}.stat-row{grid-template-columns:1fr}.page-actions{width:100%}.btn-primary,.btn-ghost{width:100%}}
  `]
})
export class PolicyLibraryComponent {
  private policySvc = inject(PolicyService);

  private policies$ = from(this.policySvc.listPolicies({ includeArchived: true })).pipe(
    map(list =>
      list
        .map(policy => ({
          ...policy,
          statusLabel: policy.status === 'archived' ? 'Archived' : 'Active',
          reviewState: this.getReviewState(policy.nextReview),
        }) as PolicyRow)
        .sort((a, b) => (a.title || '').localeCompare(b.title || ''))
    )
  );

  policies = toSignal(this.policies$, { initialValue: [] as PolicyRow[] });

  stats = toSignal(
    this.policies$.pipe(
      map(list => ({
        total: list.length,
        active: list.filter(item => item.status === 'active').length,
        requiringAck: list.filter(item => item.requiresAcknowledgement).length,
        reviewDue: list.filter(item => item.reviewState === 'due' || item.reviewState === 'soon').length,
      }))
    ),
    { initialValue: { total: 0, active: 0, requiringAck: 0, reviewDue: 0 } }
  );

  reviewLabel(policy: PolicyRow) {
    if (!policy.nextReview) return 'No review date';
    if (policy.reviewState === 'due') return 'Review due';
    if (policy.reviewState === 'soon') return 'Review soon';
    return policy.nextReview;
  }

  private getReviewState(nextReview?: string): PolicyRow['reviewState'] {
    if (!nextReview) return 'none';
    const ts = Date.parse(nextReview);
    if (Number.isNaN(ts)) return 'none';
    const days = Math.ceil((ts - Date.now()) / (24 * 60 * 60 * 1000));
    if (days < 0) return 'due';
    if (days <= 30) return 'soon';
    return 'scheduled';
  }
}
