import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { from } from 'rxjs';
import { PolicyService } from '../../../shared/services/policy';
import { SuperAdminOrganizationsService } from '../services/super-admin-organizations';
import type { SuperAdminOrganization } from '../models/super-admin.models';
import type { Policy } from '../../learner/policy/model/policy.model';

@Component({
  selector: 'app-super-admin-policy-assignments',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="page">
      <header>
        <div class="eyebrow">Super Admin · Governance catalogue</div>
        <h1>Assign Policies to Organizations</h1>
        <p>Legacy and platform policies are copied into the selected tenant. Organizations never share policy documents.</p>
      </header>

      <div class="notice" *ngIf="notice()" [class.error]="error()">{{ notice() }}</div>

      <section class="summary">
        <div><span>Organization</span><strong>{{ selectedOrgName() || 'Not selected' }}</strong></div>
        <div class="arrow">→</div>
        <div><span>Platform policy</span><strong>{{ selectedPolicyTitle() || 'Not selected' }}</strong></div>
        <button (click)="assign()" [disabled]="busy() || !selectedOrg() || !selectedPolicy()">
          {{ busy() ? 'Assigning…' : 'Assign Policy' }}
        </button>
      </section>

      <div class="grid">
        <section class="panel">
          <h2>Organizations</h2>
          <label *ngFor="let org of organizations()" class="row" [class.selected]="selectedOrg() === org.id">
            <input type="radio" name="org" [value]="org.id" [ngModel]="selectedOrg()" (ngModelChange)="selectedOrg.set($event)" />
            <span><strong>{{ org.name }}</strong><small>{{ org.ownerEmail || org.id }}</small></span>
          </label>
        </section>

        <section class="panel">
          <h2>Platform and legacy policies</h2>
          <label *ngFor="let policy of policies()" class="row" [class.selected]="selectedPolicy() === policy.id">
            <input type="radio" name="policy" [value]="policy.id" [ngModel]="selectedPolicy()" (ngModelChange)="selectedPolicy.set($event)" />
            <span><strong>{{ policy.title }}</strong><small>{{ policy.version }} · {{ policy.category }}</small></span>
          </label>
          <div class="empty" *ngIf="!policies().length">No platform policies found.</div>
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
export class SuperAdminPolicyAssignmentsComponent {
  private orgService = inject(SuperAdminOrganizationsService);
  private policyService = inject(PolicyService);

  organizations = toSignal(this.orgService.list(), {
    initialValue: [] as SuperAdminOrganization[],
  });
  policies = toSignal(from(this.policyService.listPlatformPolicies()), {
    initialValue: [] as Policy[],
  });

  selectedOrg = signal('');
  selectedPolicy = signal('');
  busy = signal(false);
  notice = signal('');
  error = signal(false);

  selectedOrgName = computed(
    () => this.organizations().find(item => item.id === this.selectedOrg())?.name ?? ''
  );
  selectedPolicyTitle = computed(
    () => this.policies().find(item => item.id === this.selectedPolicy())?.title ?? ''
  );

  async assign() {
    if (!this.selectedOrg() || !this.selectedPolicy()) return;
    this.busy.set(true);
    this.notice.set('');
    this.error.set(false);
    try {
      await this.policyService.assignPlatformPolicyToOrganization(
        this.selectedPolicy(),
        this.selectedOrg()
      );
      this.notice.set('Policy copied into the organization tenant.');
      this.selectedPolicy.set('');
    } catch (error: any) {
      this.notice.set(error?.message || 'Policy assignment failed.');
      this.error.set(true);
    } finally {
      this.busy.set(false);
    }
  }
}
