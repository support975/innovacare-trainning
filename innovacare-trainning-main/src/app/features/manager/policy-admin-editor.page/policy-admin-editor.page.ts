import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';

import { from, map, of, switchMap } from 'rxjs';

import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatDividerModule } from '@angular/material/divider';

import { AuthService } from '../../../core/auth';

import { Policy } from '../../learner/policy/model/policy.model';
import { PolicyService } from '../../../shared/services/policy';

@Component({
  selector: 'app-policy-admin-editor',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule, RouterModule,
    MatCardModule, MatButtonModule, MatFormFieldModule,
    MatInputModule, MatSelectModule, MatSlideToggleModule, MatDividerModule
  ],
  template: `
  <mat-card>
    <mat-card-title>Policy Admin Editor</mat-card-title>
    <mat-card-subtitle *ngIf="policyId">Editing: {{ policyId }}</mat-card-subtitle>

    <div class="warn" *ngIf="!isAdmin">
      Admin access required.
    </div>

    <form [formGroup]="form" class="form" *ngIf="isAdmin">
      <div class="row">
        <mat-form-field appearance="outline">
          <mat-label>Status</mat-label>
          <mat-select formControlName="status">
            <mat-option value="active">active</mat-option>
            <mat-option value="archived">archived</mat-option>
          </mat-select>
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>Language</mat-label>
          <mat-select formControlName="language">
            <mat-option value="en">en</mat-option>
            <mat-option value="fr">fr</mat-option>
          </mat-select>
        </mat-form-field>
      </div>

      <mat-form-field appearance="outline">
        <mat-label>Title</mat-label>
        <input matInput formControlName="title" />
      </mat-form-field>

      <div class="row">
        <mat-form-field appearance="outline">
          <mat-label>Category</mat-label>
          <input matInput formControlName="category" />
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>Area</mat-label>
          <input matInput formControlName="area" />
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>Owner</mat-label>
          <input matInput formControlName="owner" />
        </mat-form-field>
      </div>

      <div class="row">
        <mat-form-field appearance="outline">
          <mat-label>Version</mat-label>
          <input matInput formControlName="version" />
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>Effective Date</mat-label>
          <input matInput type="date" formControlName="effectiveDate" />
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>Last Revised</mat-label>
          <input matInput type="date" formControlName="lastRevised" />
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>Next Review</mat-label>
          <input matInput type="date" formControlName="nextReview" />
        </mat-form-field>
      </div>

      <div class="row">
        <mat-slide-toggle formControlName="requiresAcknowledgement">Requires Acknowledgement</mat-slide-toggle>
        <mat-slide-toggle formControlName="blocking">Blocking</mat-slide-toggle>
      </div>

      <mat-form-field appearance="outline">
        <mat-label>Content HTML</mat-label>
        <textarea matInput rows="10" formControlName="contentHtml"></textarea>
      </mat-form-field>

      <mat-form-field appearance="outline">
        <mat-label>References HTML</mat-label>
        <textarea matInput rows="6" formControlName="referencesHtml"></textarea>
      </mat-form-field>

      <mat-divider></mat-divider>

      <div class="actions">
        <button mat-raised-button color="primary" (click)="save()" [disabled]="busy || form.invalid">
          {{ policyId ? 'Update' : 'Create' }}
        </button>

        <button mat-stroked-button (click)="back()" [disabled]="busy">Back</button>

        <button mat-stroked-button color="warn" (click)="remove()" *ngIf="policyId" [disabled]="busy">
          Delete
        </button>
      </div>
    </form>
  </mat-card>
  `,
  styles: [`
    .form{display:flex;flex-direction:column;gap:12px;margin-top:12px}
    .row{display:flex;gap:12px;flex-wrap:wrap}
    .actions{display:flex;gap:12px;margin-top:12px}
    .warn{padding:12px;color:#b00020}
  `]
})
export class PolicyAdminEditorPage implements OnInit {
  private fb = inject(FormBuilder);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private policySvc = inject(PolicyService);
  private auth = inject(AuthService);

  isAdmin = false;
  busy = false;
  policyId: string | null = null;

  form = this.fb.group({
    status: this.fb.control<'active'|'archived'>('active', { nonNullable: true }),
    title: this.fb.control('', { nonNullable: true, validators: [Validators.required] }),
    category: this.fb.control('Infection Control', { nonNullable: true, validators: [Validators.required] }),
    area: this.fb.control('', { nonNullable: true }),
    owner: this.fb.control('', { nonNullable: true }),

    version: this.fb.control('v1.0', { nonNullable: true, validators: [Validators.required] }),
    effectiveDate: this.fb.control('', { nonNullable: true, validators: [Validators.required] }),
    lastRevised: this.fb.control('', { nonNullable: true }),
    nextReview: this.fb.control('', { nonNullable: true }),

    language: this.fb.control<'en'|'fr'>('en', { nonNullable: true }),
    requiresAcknowledgement: this.fb.control(true, { nonNullable: true }),
    blocking: this.fb.control(false, { nonNullable: true }),

    contentHtml: this.fb.control('', { nonNullable: true, validators: [Validators.required] }),
    referencesHtml: this.fb.control('', { nonNullable: true }),
  });

  ngOnInit(): void {
    this.auth.profile$.subscribe(p => {
      this.isAdmin = p?.role === 'admin' || p?.role === 'manager';
    });

    this.route.paramMap.pipe(
      map(pm => pm.get('id')),
      switchMap(id => {
        this.policyId = id;
        if (!id) return of(null);
        return from(this.policySvc.getPolicy(id));
      })
    ).subscribe(p => {
      if (!p) return;
      this.form.patchValue({
        status: p.status,
        title: p.title,
        category: p.category,
        area: p.area ?? '',
        owner: p.owner ?? '',
        version: p.version,
        effectiveDate: p.effectiveDate,
        lastRevised: p.lastRevised ?? '',
        nextReview: p.nextReview ?? '',
        language: p.language,
        requiresAcknowledgement: p.requiresAcknowledgement,
        blocking: !!p.blocking,
        contentHtml: p.contentHtml,
        referencesHtml: p.referencesHtml ?? '',
      }, { emitEvent: true });
    });
  }

  async save() {
    if (!this.isAdmin) return;
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.busy = true;
    try {
      const payload: Omit<Policy, 'id'> = {
        status: this.form.value.status!,
        title: this.form.value.title!,
        category: this.form.value.category!,
        area: this.form.value.area!,
        owner: this.form.value.owner!,
        version: this.form.value.version!,
        effectiveDate: this.form.value.effectiveDate!,
        lastRevised: this.form.value.lastRevised || undefined,
        nextReview: this.form.value.nextReview || undefined,
        language: this.form.value.language!,
        requiresAcknowledgement: !!this.form.value.requiresAcknowledgement,
        blocking: !!this.form.value.blocking,
        contentHtml: this.form.value.contentHtml!,
        referencesHtml: this.form.value.referencesHtml || undefined,
      };

      if (!this.policyId) {
        await this.policySvc.createPolicy(payload);
        this.router.navigate(['/manager/policies']);
      } else {
        await this.policySvc.updatePolicy(this.policyId, payload);
        this.router.navigate(['/manager/policies']);
      }
    } finally {
      this.busy = false;
    }
  }

  async remove() {
    if (!this.isAdmin || !this.policyId) return;
    this.busy = true;
    try {
      await this.policySvc.deletePolicy(this.policyId);
      this.router.navigate(['/manager/policies']);
    } finally {
      this.busy = false;
    }
  }

  back() {
    this.router.navigate(['/manager/policies']);
  }
}
