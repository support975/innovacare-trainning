import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { from, Observable } from 'rxjs';
import { map } from 'rxjs/operators';

import { MatTableModule } from '@angular/material/table';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatDividerModule } from '@angular/material/divider';

import { Firestore, doc, getDoc } from '@angular/fire/firestore';

import { Policy, PolicyAcknowledgement } from '../../learner/policy/model/policy.model';
import { PolicyService } from '../../../shared/services/policy';

type UserLabel = { name: string; email: string; role: string };

@Component({
  selector: 'app-policy-ack-report',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule,
    MatCardModule, MatButtonModule, MatFormFieldModule, MatSelectModule, MatDividerModule,
    MatTableModule, MatProgressBarModule
  ],
  template: `
<mat-card>
  <mat-card-title>Policy Acknowledgements Report</mat-card-title>

  <form [formGroup]="form" class="row">
    <mat-form-field appearance="outline" class="field">
      <mat-label>Policy</mat-label>
      <mat-select formControlName="policyId">
        <mat-option *ngFor="let p of (policies$ | async)" [value]="p.id">
          {{ p.title }}
        </mat-option>
      </mat-select>
    </mat-form-field>

    <button mat-raised-button color="primary"
            type="button"
            (click)="run()"
            [disabled]="busy || !form.value.policyId">
      Run
    </button>
  </form>

  <mat-progress-bar *ngIf="busy" mode="indeterminate"></mat-progress-bar>

  <mat-divider></mat-divider>

  <div class="empty" *ngIf="!busy && rows.length === 0">No rows yet.</div>

  <div class="table-wrap" *ngIf="rows.length">
    <table mat-table [dataSource]="rows" class="mat-elevation-z0 full">

      <!-- User -->
      <ng-container matColumnDef="userName">
        <th mat-header-cell *matHeaderCellDef>User</th>
        <td mat-cell *matCellDef="let r">
          {{ r.userName }}
        </td>
      </ng-container>

      <!-- Email -->
      <ng-container matColumnDef="userEmail">
        <th mat-header-cell *matHeaderCellDef>Email</th>
        <td mat-cell *matCellDef="let r">
          {{ r.userEmail }}
        </td>
      </ng-container>

      <!-- Role (optional) -->
      <ng-container matColumnDef="userRole">
        <th mat-header-cell *matHeaderCellDef>Role</th>
        <td mat-cell *matCellDef="let r">
          {{ r.userRole }}
        </td>
      </ng-container>

      <!-- Version -->
      <ng-container matColumnDef="policyVersion">
        <th mat-header-cell *matHeaderCellDef>Version</th>
        <td mat-cell *matCellDef="let r">{{ r.policyVersion }}</td>
      </ng-container>

      <!-- Acknowledged At -->
      <ng-container matColumnDef="acknowledgedAt">
        <th mat-header-cell *matHeaderCellDef>Acknowledged At</th>
        <td mat-cell *matCellDef="let r">{{ r.acknowledgedAt }}</td>
      </ng-container>

      <tr mat-header-row *matHeaderRowDef="displayedColumns"></tr>
      <tr mat-row *matRowDef="let row; columns: displayedColumns;"></tr>

    </table>
  </div>
</mat-card>
`,
  styles: [`
  .row{display:flex;gap:12px;align-items:center;margin-top:12px;flex-wrap:wrap}
  .field{min-width: 320px; flex: 1 1 320px}
  .empty{padding:12px;color:#666}
  .table-wrap{padding:12px 0; overflow:auto}
  table.full{width:100%}
  `]
})
export class PolicyAckReportPage implements OnInit {
  private fb = inject(FormBuilder);
  private policySvc = inject(PolicyService);
  private afs = inject(Firestore);

  // ✅ Columns shown to surveyor
  displayedColumns: Array<'userName'|'userEmail'|'userRole'|'policyVersion'|'acknowledgedAt'> =
    ['userName', 'userEmail', 'userRole', 'policyVersion', 'acknowledgedAt'];

  policies$!: Observable<Policy[]>;
  rows: Array<{
    userId: string;
    userName: string;
    userEmail: string;
    userRole: string;
    policyVersion: string;
    acknowledgedAt: string;
  }> = [];

  busy = false;

  form = this.fb.group({
    policyId: this.fb.control<string>('', { nonNullable: true }),
  });

  ngOnInit(): void {
    this.policies$ = from(this.policySvc.listPolicies({ includeArchived: true })).pipe(
      map(list => list.sort((a, b) => (a.title || '').localeCompare(b.title || '')))
    );
  }

  async run() {
    const policyId = this.form.controls.policyId.value;
    if (!policyId) return;

    this.busy = true;
    this.rows = [];

    try {
      const acks = await this.policySvc.listAcknowledgementsForPolicy(policyId);

      // Unique users
      const uids = Array.from(new Set(
        (acks ?? []).map(a => String((a as any).userId ?? '')).filter(Boolean)
      ));

      // Resolve users once
      const userMap = new Map<string, UserLabel>();
      await Promise.all(uids.map(async (uid) => {
        userMap.set(uid, await this.getUserLabel(uid));
      }));

      // Map rows
      this.rows = (acks ?? []).map((a: PolicyAcknowledgement & any) => {
        const uid = String(a.userId ?? '');
        const u = userMap.get(uid) ?? { name: '', email: '', role: '' };

        return {
          userId: uid,
          userName: u.name || '(Unknown user)',
          userEmail: u.email || '',
          userRole: u.role || '',
          policyVersion: String(a.policyVersion ?? ''),
          acknowledgedAt: this.formatDate(a.acknowledgedAt),
        };
      });

      // Optional: sort by userName then acknowledgedAt desc
      this.rows.sort((x, y) => (x.userName || '').localeCompare(y.userName || ''));
    } finally {
      this.busy = false;
    }
  }

  private async getUserLabel(uid: string): Promise<UserLabel> {
    try {
      const ref = doc(this.afs, `users/${uid}`);
      const snap = await getDoc(ref);

      if (!snap.exists()) return { name: '', email: '', role: '' };

      const d: any = snap.data();

      const name =
        String(
          d.displayName ??
          d.fullName ??
          d.name ??
          d.profile?.displayName ??
          ''
        ).trim();

      const email =
        String(
          d.email ??
          d.profile?.email ??
          ''
        ).trim();

      // role/title/position are often named differently—keep best-effort
      const role =
        String(
          d.role ??
          d.title ??
          d.position ??
          d.jobTitle ??
          d.profile?.role ??
          ''
        ).trim();

      return { name, email, role };
    } catch {
      return { name: '', email: '', role: '' };
    }
  }

  private formatDate(ts: any): string {
    try {
      const d: Date =
        ts?.toDate ? ts.toDate() :
        ts instanceof Date ? ts :
        ts?.seconds ? new Date(ts.seconds * 1000) :
        new Date(ts);

      if (isNaN(d.getTime())) return String(ts ?? '');

      // survey-friendly local format
      return d.toLocaleString(undefined, {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return String(ts ?? '');
    }
  }
}
