import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Firestore, collection, collectionData, query, where } from '@angular/fire/firestore';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, from, map, of, switchMap } from 'rxjs';
import { AuthService } from '../../../core/auth';
import { PolicyService } from '../../../shared/services/policy';
import type { Policy } from '../../learner/policy/model/policy.model';

type Learner = { id: string; displayName?: string; email?: string };

@Component({
  selector: 'app-policy-assignments',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="page">
      <header>
        <div class="eyebrow">Manager · Tenant compliance</div>
        <h1>Assign Policies</h1>
        <p>Assign policies from your organization only to learners in the same organization.</p>
      </header>

      <div class="notice" *ngIf="notice()" [class.error]="error()">{{ notice() }}</div>

      <section class="summary">
        <div><strong>{{ selectedPolicyTitle() || 'No policy selected' }}</strong><span>Policy</span></div>
        <div class="arrow">→</div>
        <div><strong>{{ selectedUsers().size }} learner(s)</strong><span>Same organization</span></div>
        <button (click)="assign()" [disabled]="busy() || !selectedPolicy() || !selectedUsers().size">
          {{ busy() ? 'Assigning…' : 'Assign Policy' }}
        </button>
      </section>

      <div class="grid">
        <section class="panel">
          <h2>Organization policies</h2>
          <label *ngFor="let policy of policies()" class="row" [class.selected]="selectedPolicy() === policy.id">
            <input type="radio" name="policy" [value]="policy.id" [ngModel]="selectedPolicy()" (ngModelChange)="selectedPolicy.set($event)" />
            <span><strong>{{ policy.title }}</strong><small>{{ policy.version }} · {{ policy.category }}</small></span>
          </label>
          <div class="empty" *ngIf="!policies().length">Create or receive a policy from the super admin first.</div>
        </section>

        <section class="panel">
          <h2>Learners</h2>
          <label *ngFor="let learner of learners()" class="row" [class.selected]="selectedUsers().has(learner.id)">
            <input type="checkbox" [checked]="selectedUsers().has(learner.id)" (change)="toggleUser(learner.id, $any($event.target).checked)" />
            <span><strong>{{ learner.displayName || learner.email || learner.id }}</strong><small>{{ learner.email }}</small></span>
          </label>
          <div class="empty" *ngIf="!learners().length">No learners in this organization.</div>
        </section>
      </div>
    </div>
  `,
  styles: [`
    .page{display:grid;gap:1.25rem;padding:1.75rem 2rem;max-width:1180px;margin:auto;color:#1a2b4a}
    header{border-bottom:1px solid #e4ecf7;padding-bottom:1.2rem}h1{margin:.2rem 0;color:#1a3f6f}.eyebrow{color:#00a79d;font-size:.72rem;font-weight:800;text-transform:uppercase;letter-spacing:.1em}p{margin:0;color:#64748b}
    .notice{padding:.8rem 1rem;border-radius:9px;background:#e6f4ec;color:#166534;border:1px solid #b3ddb3}.notice.error{background:#fff3ec;color:#c14a00;border-color:#fbd0ae}
    .summary{display:flex;align-items:center;gap:1rem;padding:1rem 1.2rem;border:1px solid #bce8e5;background:#f5fffe;border-radius:12px}.summary div{display:grid}.summary span{font-size:.75rem;color:#64748b}.arrow{font-size:1.3rem}
    button{margin-left:auto;padding:.7rem 1.1rem;border:0;border-radius:8px;background:#f26b21;color:#fff;font-weight:800;cursor:pointer}button:disabled{background:#cbd5e1;cursor:not-allowed}
    .grid{display:grid;grid-template-columns:1fr 1fr;gap:1rem}.panel{background:#fff;border:1px solid #e4ecf7;border-radius:14px;padding:1rem;max-height:620px;overflow:auto}.panel h2{margin:.1rem 0 1rem;color:#1a3f6f;font-size:1rem}
    .row{display:flex;gap:.75rem;align-items:center;padding:.8rem;border:1px solid #edf2f7;border-radius:9px;margin-bottom:.55rem;cursor:pointer}.row.selected{background:#eaf8f7;border-color:#7dd3cc}.row span{display:grid}.row small{color:#64748b;margin-top:.15rem}.empty{text-align:center;color:#94a3b8;padding:2rem}
    @media(max-width:760px){.page{padding:1rem}.grid{grid-template-columns:1fr}.summary{align-items:stretch;flex-direction:column}.arrow{display:none}button{margin:0}}
  `],
})
export class PolicyAssignmentsComponent {
  private firestore = inject(Firestore);
  private auth = inject(AuthService);
  private policyService = inject(PolicyService);

  selectedPolicy = signal('');
  selectedUsers = signal<Set<string>>(new Set());
  busy = signal(false);
  notice = signal('');
  error = signal(false);

  policies = toSignal(
    from(this.policyService.listPolicies({ includeArchived: false })).pipe(
      map(items => items.filter(item => item.status === 'active'))
    ),
    { initialValue: [] as Policy[] }
  );

  learners = toSignal(
    this.auth.profile$.pipe(
      filter(Boolean),
      switchMap(profile => {
        if (!profile.orgId) return of([] as Learner[]);
        return collectionData(query(
          collection(this.firestore, 'users'),
          where('orgId', '==', profile.orgId),
          where('role', '==', 'learner')
        ), { idField: 'id' }) as any;
      }),
      map(items => (items ?? []) as Learner[])
    ),
    { initialValue: [] as Learner[] }
  );

  selectedPolicyTitle = computed(
    () => this.policies().find(item => item.id === this.selectedPolicy())?.title ?? ''
  );

  toggleUser(uid: string, checked: boolean) {
    const next = new Set(this.selectedUsers());
    checked ? next.add(uid) : next.delete(uid);
    this.selectedUsers.set(next);
  }

  async assign() {
    if (!this.selectedPolicy() || !this.selectedUsers().size) return;
    this.busy.set(true);
    this.notice.set('');
    this.error.set(false);
    try {
      await this.policyService.assignPolicyToUsers(
        this.selectedPolicy(),
        Array.from(this.selectedUsers())
      );
      this.notice.set('Policy assigned within the organization.');
      this.selectedUsers.set(new Set());
    } catch (error: any) {
      this.notice.set(error?.message || 'Policy assignment failed.');
      this.error.set(true);
    } finally {
      this.busy.set(false);
    }
  }
}
