// src/app/features/manager/wound/add-wound-type.component.ts
import { Component, DestroyRef, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, FormArray, ReactiveFormsModule, FormsModule } from '@angular/forms';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatCardModule } from '@angular/material/card';
import { MatDividerModule } from '@angular/material/divider';
import { MatSelectModule } from '@angular/material/select';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { WoundService } from '../services/wound-service';
import { Dressing, Treatment, WoundType } from '../wound.model';
import { AuthService } from '../../../core/auth';

type QuickSheetJson = {
  name: string;
  category?: string;
  shortDescription?: string;
  fullDescription?: string;
  synonyms?: string[];
  tags?: string[];
  characteristics?: string[];
  images?: string[];
  videos?: string[];
  treatmentOptions?: Treatment[];
  dressingOptions?: Dressing[];
  isActive?: boolean;
  resourceKind?: 'quick_sheet';
};

@Component({
  selector: 'app-add-wound',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    FormsModule,
    // Material
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatCardModule,
    MatDividerModule,
    MatSelectModule,
    MatSnackBarModule,
    MatProgressSpinnerModule
  ],
  template: `
  <div class="sa-page">
    <div class="page-header">
      <div>
        <p class="page-eyebrow">Manager · Quick Practice</p>
        <h1 class="page-title">Internal Quick Practice Zone</h1>
        <p class="page-sub">Create organization-only quick sheets for recurring tasks, refreshers and on-the-job reference.</p>
      </div>
      <span class="status-pill">Org protected</span>
    </div>

    <form class="panel form-panel" [formGroup]="form" (ngSubmit)="submit()">
      <div class="panel__head">
        <div>
          <div class="panel__title">Create quick practice sheet</div>
          <div class="panel__sub">Publish a short task sheet that only users in your organization can access.</div>
        </div>
        <label class="check-label">
          <input type="checkbox" formControlName="isActive" />
          Active
        </label>
      </div>

      <div class="org-warning" *ngIf="orgAccessMessage">
        <mat-icon>lock</mat-icon>
        <div>
          <strong>Organization required</strong>
          <span>{{ orgAccessMessage }}</span>
        </div>
      </div>

      <section class="form-section json-section">
        <div class="form-section__head">
          <div>
            <div class="form-section__title">JSON quick sheet</div>
            <div class="field-hint">Paste or upload a quick sheet JSON, validate it, then apply it to the form before creating.</div>
          </div>
          <button class="btn-outline-sm" type="button" (click)="loadSampleJson()">
            <mat-icon>data_object</mat-icon>
            Use sample
          </button>
        </div>

        <div class="json-grid">
          <div class="row">
            <label class="field-label" for="quick-sheet-json">Quick sheet JSON</label>
            <textarea
              id="quick-sheet-json"
              class="field-input json-input"
              rows="10"
              [(ngModel)]="jsonText"
              [ngModelOptions]="{ standalone: true }"
              placeholder='{"name":"Daily Opening Safety Checklist","category":"Operations / Safety","steps":[...]}'
            ></textarea>
          </div>

          <div class="json-side">
            <label class="field-label" for="quick-sheet-json-file">JSON file</label>
            <input id="quick-sheet-json-file" class="file-input" type="file" accept="application/json,.json" (change)="importQuickSheetJsonFile($event)" />

            <div class="json-actions">
              <button class="btn-outline-sm" type="button" (click)="previewQuickSheetJson()">
                Preview JSON
              </button>
              <button class="btn-primary-sm" type="button" [disabled]="!jsonPreview" (click)="applyJsonPreviewToForm()">
                Apply to form
              </button>
              <button class="btn-ghost-sm" type="button" (click)="clearJsonImport()">
                Clear
              </button>
            </div>

            <div class="msg msg--error" *ngIf="jsonImportError">{{ jsonImportError }}</div>
            <div class="msg msg--ok" *ngIf="jsonImportSuccess">{{ jsonImportSuccess }}</div>

            <div class="json-preview-card" *ngIf="jsonPreview as preview">
              <div class="json-preview-card__title">{{ preview.name }}</div>
              <div class="field-hint">{{ preview.category || 'No task area' }}</div>
              <div class="json-preview-card__meta">
                <span>{{ preview.treatmentOptions?.length || 0 }} steps</span>
                <span>{{ preview.dressingOptions?.length || 0 }} items</span>
                <span>{{ preview.images?.length || 0 }} images</span>
                <span>{{ preview.videos?.length || 0 }} videos</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section class="form-section">
        <div class="form-section__head">
          <div class="form-section__title">Basic information</div>
        </div>

        <div class="grid-2">
          <div class="row">
            <label class="field-label" for="wound-name">Sheet title <span class="required">*</span></label>
            <input id="wound-name" class="field-input" formControlName="name" placeholder="Opening checklist, incident report steps, customer handoff..." />
            <div class="msg msg--error" *ngIf="form.get('name')?.invalid && form.get('name')?.touched">
              Name is required.
            </div>
          </div>

          <div class="row">
            <label class="field-label" for="wound-category">Task area</label>
            <input id="wound-category" class="field-input" formControlName="category" placeholder="Operations, safety, documentation, customer service..." />
          </div>
        </div>

        <div class="row">
          <label class="field-label" for="wound-short">Quick purpose</label>
          <input id="wound-short" class="field-input" formControlName="shortDescription" placeholder="What should staff use this sheet for?" />
        </div>

        <div class="row">
          <label class="field-label" for="wound-full">Quick sheet instructions</label>
          <textarea id="wound-full" class="field-input" rows="5" formControlName="fullDescription" placeholder="Write the short instructions, reminders, safety notes or task flow."></textarea>
        </div>

        <div class="grid-2 compact-grid">
          <div class="row">
            <label class="field-label" for="wound-synonyms">Alternate names</label>
            <input id="wound-synonyms" class="field-input" formControlName="synonyms" placeholder="Comma separated search terms" />
          </div>
          <div class="row">
            <label class="field-label" for="wound-tags">Tags</label>
            <input id="wound-tags" class="field-input" formControlName="tags" placeholder="onboarding, safety, compliance, daily task" />
          </div>
        </div>

        <div class="row">
          <label class="field-label" for="wound-characteristics">Key reminders</label>
          <input id="wound-characteristics" class="field-input" formControlName="characteristics" placeholder="Comma separated reminders or checks" />
        </div>
      </section>

      <section class="form-section">
        <div class="form-section__head">
          <div>
            <div class="form-section__title">Short videos</div>
            <div class="field-hint">Add secure links to short practice videos. YouTube, Vimeo and direct video file URLs can be watched by learners.</div>
          </div>
          <button class="btn-outline-sm" type="button" (click)="addVideoUrl()">
            <mat-icon>add</mat-icon>
            Add video
          </button>
        </div>

        <div class="dynamic-list" formArrayName="videoUrls">
          <div class="video-row" *ngFor="let ctrl of videoUrls.controls; let i = index" [formGroupName]="i">
            <div class="video-icon">
              <mat-icon>smart_display</mat-icon>
            </div>
            <div class="image-field">
              <label class="field-label" [for]="'video-url-' + i">Video URL</label>
              <input [id]="'video-url-' + i" class="field-input" formControlName="url" placeholder="https://youtu.be/... or https://.../training.mp4" />
              <div class="msg msg--error" *ngIf="ctrl.get('url')?.hasError('pattern') && ctrl.get('url')?.touched">
                Enter a valid http or https URL.
              </div>
            </div>
            <button class="icon-button icon-button--danger" type="button" (click)="removeVideoUrl(i)" aria-label="Remove video URL">
              <mat-icon>delete</mat-icon>
            </button>
          </div>
        </div>
      </section>

      <section class="form-section">
        <div class="form-section__head">
          <div>
            <div class="form-section__title">Images or examples</div>
            <div class="field-hint">Paste secure public URLs for diagrams, examples or task photos. Content remains visible only to this organization.</div>
          </div>
          <button class="btn-outline-sm" type="button" (click)="addImageUrl()">
            <mat-icon>add</mat-icon>
            Add URL
          </button>
        </div>

        <div class="dynamic-list" formArrayName="imageUrls">
          <div class="image-row" *ngFor="let ctrl of imageUrls.controls; let i = index" [formGroupName]="i">
            <div class="image-preview" [class.image-preview--empty]="!isValidUrl(ctrl.get('url')?.value)">
              <img *ngIf="isValidUrl(ctrl.get('url')?.value)" [src]="ctrl.get('url')?.value" alt="Quick sheet preview" (error)="onImgError($event)" />
              <mat-icon *ngIf="!isValidUrl(ctrl.get('url')?.value)">image</mat-icon>
            </div>
            <div class="image-field">
              <label class="field-label" [for]="'image-url-' + i">Image URL</label>
              <input [id]="'image-url-' + i" class="field-input" formControlName="url" placeholder="https://..." />
              <div class="msg msg--error" *ngIf="ctrl.get('url')?.hasError('pattern') && ctrl.get('url')?.touched">
                Enter a valid http or https URL.
              </div>
            </div>
            <button class="icon-button icon-button--danger" type="button" (click)="removeImageUrl(i)" aria-label="Remove image URL">
              <mat-icon>delete</mat-icon>
            </button>
          </div>
        </div>
      </section>

      <section class="form-section">
        <div class="form-section__head">
          <div>
            <div class="form-section__title">Practice steps</div>
            <div class="field-hint">Add short step-by-step actions staff can review quickly.</div>
          </div>
          <button class="btn-outline-sm" type="button" (click)="addTreatment()">
            <mat-icon>add</mat-icon>
            Add step
          </button>
        </div>

        <div class="dynamic-list" formArrayName="treatmentOptions">
          <div class="entry-card" *ngFor="let t of treatmentOptions.controls; let i = index" [formGroupName]="i">
            <div class="entry-card__head">
              <span>Step {{ i + 1 }}</span>
              <button class="btn-ghost-sm" type="button" (click)="removeTreatment(i)">
                <mat-icon>delete</mat-icon>
                Remove
              </button>
            </div>
            <div class="row">
              <label class="field-label" [for]="'treatment-title-' + i">Step title <span class="required">*</span></label>
              <input [id]="'treatment-title-' + i" class="field-input" formControlName="title" placeholder="Confirm identity, sanitize equipment..." />
              <div class="msg msg--error" *ngIf="t.get('title')?.invalid && t.get('title')?.touched">
                Step title is required.
              </div>
            </div>
            <div class="row">
              <label class="field-label" [for]="'treatment-description-' + i">Description</label>
              <textarea [id]="'treatment-description-' + i" class="field-input" rows="3" formControlName="description" placeholder="Add details, cautions, documentation notes or escalation reminders."></textarea>
            </div>
          </div>
        </div>
      </section>

      <section class="form-section">
        <div class="form-section__head">
          <div>
            <div class="form-section__title">Tools, materials or notes</div>
            <div class="field-hint">Capture required tools, materials, documents or quick reference notes.</div>
          </div>
          <button class="btn-outline-sm" type="button" (click)="addDressing()">
            <mat-icon>add</mat-icon>
            Add item
          </button>
        </div>

        <div class="dynamic-list" formArrayName="dressingOptions">
          <div class="entry-card" *ngFor="let d of dressingOptions.controls; let i = index" [formGroupName]="i">
            <div class="entry-card__head">
              <span>Item {{ i + 1 }}</span>
              <button class="btn-ghost-sm" type="button" (click)="removeDressing(i)">
                <mat-icon>delete</mat-icon>
                Remove
              </button>
            </div>
            <div class="row">
              <label class="field-label" [for]="'dressing-type-' + i">Item title <span class="required">*</span></label>
              <input [id]="'dressing-type-' + i" class="field-input" formControlName="type" placeholder="Form, equipment, required document..." />
              <div class="msg msg--error" *ngIf="d.get('type')?.invalid && d.get('type')?.touched">
                Item title is required.
              </div>
            </div>
            <div class="row">
              <label class="field-label" [for]="'dressing-description-' + i">Description</label>
              <textarea [id]="'dressing-description-' + i" class="field-input" rows="3" formControlName="description" placeholder="Describe when to use it or where staff can find it."></textarea>
            </div>
          </div>
        </div>
      </section>

      <div class="form-actions">
        <button class="btn-primary" type="submit" [disabled]="uploading || !canCreateQuickSheet">
          {{ uploading ? 'Creating...' : 'Create quick sheet' }}
        </button>
        <mat-progress-spinner *ngIf="uploading" diameter="28" mode="indeterminate"></mat-progress-spinner>
      </div>
    </form>
  </div>
  `,
  styles: [`
    :host { display: block; }

    .sa-page {
      max-width: 1120px;
      margin: 0 auto;
      padding: 28px 32px;
      display: flex;
      flex-direction: column;
      gap: 24px;
    }

    .page-header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 16px;
    }

    .page-eyebrow {
      margin: 0 0 6px;
      color: #00a79d;
      font-size: 12px;
      font-weight: 800;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }

    .page-title {
      margin: 0 0 4px;
      color: #1a3f6f;
      font-size: 28px;
      font-weight: 800;
      line-height: 1.2;
    }

    .page-sub {
      margin: 0;
      color: #5a6a7e;
      font-size: 14px;
      line-height: 1.5;
    }

    .status-pill {
      display: inline-flex;
      align-items: center;
      white-space: nowrap;
      border: 1px solid #9ae6d6;
      border-radius: 999px;
      background: #e8f5f5;
      color: #00797a;
      font-size: 12px;
      font-weight: 800;
      padding: 6px 12px;
    }

    .panel {
      overflow: hidden;
      background: #ffffff;
      border: 1px solid #e4ecf7;
      border-radius: 14px;
      box-shadow: 0 2px 12px rgba(26, 63, 111, 0.06);
    }

    .panel__head {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 16px;
      padding: 20px 24px;
      border-bottom: 1px solid #e4ecf7;
      background: #f8faff;
    }

    .panel__title {
      color: #1a3f6f;
      font-size: 16px;
      font-weight: 800;
    }

    .panel__sub {
      margin-top: 2px;
      color: #5a6a7e;
      font-size: 13px;
    }

    .form-section {
      padding: 20px 24px;
      border-bottom: 1px solid #e4ecf7;
    }

    .org-warning {
      display: flex;
      align-items: flex-start;
      gap: 10px;
      margin: 18px 24px 0;
      padding: 12px 14px;
      border: 1px solid #f6c76d;
      border-radius: 10px;
      background: #fff8e8;
      color: #7a4d00;
      font-size: 13px;
      line-height: 1.45;
    }

    .org-warning mat-icon {
      width: 20px;
      height: 20px;
      font-size: 20px;
      flex: 0 0 auto;
      margin-top: 1px;
    }

    .org-warning strong,
    .org-warning span {
      display: block;
    }

    .org-warning strong {
      margin-bottom: 2px;
      color: #573500;
    }

    .json-section {
      background: #fbfcff;
    }

    .form-section__head {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 12px;
      margin-bottom: 16px;
    }

    .form-section__title {
      color: #1a3f6f;
      font-size: 13px;
      font-weight: 800;
      letter-spacing: 0.07em;
      text-transform: uppercase;
    }

    .grid-2 {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 12px;
    }

    .compact-grid {
      margin-top: 4px;
    }

    .row {
      margin-bottom: 14px;
      min-width: 0;
    }

    .row:last-child {
      margin-bottom: 0;
    }

    .field-label {
      display: block;
      margin-bottom: 6px;
      color: #1a2b4a;
      font-size: 13px;
      font-weight: 700;
    }

    .required {
      color: #c53030;
    }

    .field-input {
      width: 100%;
      min-height: 40px;
      padding: 9px 12px;
      border: 1px solid #d6e1f0;
      border-radius: 8px;
      outline: none;
      background: #ffffff;
      color: #1a2b4a;
      font: inherit;
      font-size: 14px;
      transition: border-color 0.15s, box-shadow 0.15s, background 0.15s;
    }

    .field-input:focus {
      border-color: #00a79d;
      background: #ffffff;
      box-shadow: 0 0 0 3px rgba(0, 167, 157, 0.12);
    }

    textarea.field-input {
      min-height: 92px;
      resize: vertical;
      line-height: 1.5;
    }

    .field-hint {
      margin-top: 4px;
      color: #5a6a7e;
      font-size: 12px;
      line-height: 1.5;
    }

    .file-input {
      display: block;
      width: 100%;
      padding: 9px 12px;
      border: 1px dashed #c8d8f0;
      border-radius: 8px;
      background: #ffffff;
      color: #1a2b4a;
      font: inherit;
      font-size: 13px;
    }

    .json-grid {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(260px, 340px);
      gap: 16px;
      align-items: start;
    }

    .json-input {
      min-height: 220px;
      font-family: Consolas, "Courier New", monospace;
      font-size: 12px;
      line-height: 1.55;
    }

    .json-side,
    .json-actions {
      display: grid;
      gap: 10px;
    }

    .json-actions {
      grid-template-columns: 1fr;
      margin-top: 12px;
    }

    .json-preview-card {
      padding: 12px;
      border: 1px solid #e4ecf7;
      border-radius: 10px;
      background: #ffffff;
    }

    .json-preview-card__title {
      color: #1a3f6f;
      font-size: 14px;
      font-weight: 900;
      line-height: 1.35;
    }

    .json-preview-card__meta {
      display: flex;
      gap: 6px;
      flex-wrap: wrap;
      margin-top: 10px;
    }

    .json-preview-card__meta span {
      padding: 3px 8px;
      border: 1px solid #e4ecf7;
      border-radius: 999px;
      background: #f4f7fb;
      color: #5a6a7e;
      font-size: 11px;
      font-weight: 800;
    }

    .msg {
      margin-top: 6px;
      font-size: 12px;
      font-weight: 700;
    }

    .msg--error {
      color: #c53030;
    }

    .dynamic-list {
      display: grid;
      gap: 12px;
    }

    .image-row {
      display: grid;
      grid-template-columns: 92px minmax(0, 1fr) 36px;
      align-items: center;
      gap: 12px;
      padding: 12px;
      border: 1px solid #e4ecf7;
      border-radius: 12px;
      background: #fbfcff;
    }

    .video-row {
      display: grid;
      grid-template-columns: 52px minmax(0, 1fr) 36px;
      align-items: center;
      gap: 12px;
      padding: 12px;
      border: 1px solid #e4ecf7;
      border-radius: 12px;
      background: #fbfcff;
    }

    .video-icon {
      width: 52px;
      height: 52px;
      display: grid;
      place-items: center;
      border: 1px solid #d6e1f0;
      border-radius: 10px;
      background: #ffffff;
      color: #1a3f6f;
    }

    .image-preview {
      width: 92px;
      height: 68px;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
      border: 1px solid #d6e1f0;
      border-radius: 10px;
      background: #ffffff;
      color: #8ea0b8;
    }

    .image-preview--empty {
      background: #f4f7fb;
      border-style: dashed;
    }

    .image-preview img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
    }

    .entry-card {
      padding: 14px;
      border: 1px solid #e4ecf7;
      border-radius: 12px;
      background: #fbfcff;
    }

    .entry-card__head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      margin-bottom: 12px;
      color: #1a3f6f;
      font-size: 13px;
      font-weight: 800;
    }

    .check-label {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      color: #1a2b4a;
      font-size: 13px;
      font-weight: 700;
      cursor: pointer;
      white-space: nowrap;
    }

    .check-label input[type="checkbox"] {
      width: 16px;
      height: 16px;
      accent-color: #00a79d;
    }

    .btn-primary,
    .btn-primary-sm,
    .btn-outline-sm,
    .btn-ghost-sm,
    .icon-button {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      border-radius: 8px;
      font: inherit;
      font-size: 13px;
      font-weight: 800;
      cursor: pointer;
      transition: background 0.15s, border-color 0.15s, color 0.15s, box-shadow 0.15s;
    }

    .btn-primary {
      min-height: 40px;
      padding: 9px 18px;
      border: none;
      background: #1a3f6f;
      color: #ffffff;
    }

    .btn-primary-sm {
      min-height: 34px;
      padding: 6px 12px;
      border: none;
      background: #1a3f6f;
      color: #ffffff;
    }

    .btn-primary:hover:not(:disabled),
    .btn-primary-sm:hover:not(:disabled) {
      background: #0d2240;
    }

    .btn-primary:disabled,
    .btn-primary-sm:disabled {
      background: #8fa8cc;
      cursor: not-allowed;
    }

    .btn-outline-sm {
      min-height: 34px;
      padding: 6px 12px;
      border: 1.5px solid #1a3f6f;
      background: #ffffff;
      color: #1a3f6f;
      white-space: nowrap;
    }

    .btn-outline-sm:hover {
      background: #1a3f6f;
      color: #ffffff;
    }

    .btn-ghost-sm {
      min-height: 32px;
      padding: 5px 10px;
      border: 1px solid #e4ecf7;
      background: #ffffff;
      color: #5a6a7e;
      white-space: nowrap;
    }

    .btn-ghost-sm:hover {
      border-color: #c53030;
      color: #c53030;
    }

    .icon-button {
      width: 36px;
      height: 36px;
      padding: 0;
      border: 1px solid #e4ecf7;
      background: #ffffff;
      color: #5a6a7e;
    }

    .icon-button--danger:hover {
      border-color: #c53030;
      color: #c53030;
      background: #fff5f5;
    }

    .form-actions {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 20px 24px;
      border-top: 1px solid #e4ecf7;
      background: #f8faff;
    }

    @media (max-width: 768px) {
      .sa-page {
        padding: 16px;
      }

      .page-header,
      .panel__head,
      .form-section__head {
        flex-direction: column;
      }

      .grid-2 {
        grid-template-columns: 1fr;
      }

      .json-grid {
        grid-template-columns: 1fr;
      }

      .image-row {
        grid-template-columns: 72px minmax(0, 1fr) 36px;
      }

      .video-row {
        grid-template-columns: 44px minmax(0, 1fr) 36px;
      }

      .image-preview {
        width: 72px;
        height: 58px;
      }

      .video-icon {
        width: 44px;
        height: 44px;
      }
    }

    @media (max-width: 520px) {
      .image-row,
      .video-row {
        grid-template-columns: 1fr 36px;
      }

      .image-preview {
        grid-column: 1 / -1;
        width: 100%;
        height: 140px;
      }

      .video-icon {
        display: none;
      }
    }
  `]
})
export class AddWound implements OnInit {
  private readonly destroyRef = inject(DestroyRef);

  form!: FormGroup;
  uploading = false;
  currentOrgId: string | null = null;
  orgAccessMessage = '';
  jsonText = '';
  jsonImportError = '';
  jsonImportSuccess = '';
  jsonPreview: QuickSheetJson | null = null;

  constructor(private fb: FormBuilder, private svc: WoundService, private snack: MatSnackBar, private auth: AuthService) {}

  ngOnInit(): void {
    this.auth.profile$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(profile => {
        this.currentOrgId = profile?.orgId ?? null;
        this.orgAccessMessage = profile && !this.currentOrgId
          ? 'This manager account is not linked to an organization, so it cannot publish org-protected quick sheets. Assign this user to an organization first.'
          : '';
      });

    this.form = this.fb.group({
      name: ['', [Validators.required, Validators.maxLength(200)]],
      synonyms: [''],
      category: [''],
      shortDescription: [''],
      fullDescription: [''],
      characteristics: [''],
      treatmentOptions: this.fb.array([]),
      dressingOptions: this.fb.array([]),
      tags: [''],
      isActive: [true],
      imageUrls: this.fb.array([ this.urlGroup() ]),
      videoUrls: this.fb.array([ this.urlGroup() ])
    });

    // optionally add initial treatment/dressing as before
    this.addTreatment();
    this.addDressing();
  }

  get canCreateQuickSheet(): boolean {
    return !!this.currentOrgId;
  }

  // Image URL FormArray helpers
  get imageUrls(): FormArray { return this.form.get('imageUrls') as FormArray; }
  get videoUrls(): FormArray { return this.form.get('videoUrls') as FormArray; }

  private urlGroup(url = '') {
    return this.fb.group({ url: [url, [Validators.pattern('^https?://.+')]] });
  }

  addImageUrl(url = '') {
    this.imageUrls.push(this.urlGroup(url));
  }
  removeImageUrl(i: number) {
    if (this.imageUrls.length <= 1) {
      this.imageUrls.at(0).reset({ url: '' });
      return;
    }
    this.imageUrls.removeAt(i);
  }
  addVideoUrl(url = '') {
    this.videoUrls.push(this.urlGroup(url));
  }
  removeVideoUrl(i: number) {
    if (this.videoUrls.length <= 1) {
      this.videoUrls.at(0).reset({ url: '' });
      return;
    }
    this.videoUrls.removeAt(i);
  }

  isValidUrl(val: string | null | undefined) {
    if (!val) return false;
    try {
      const u = new URL(val);
      return (u.protocol === 'http:' || u.protocol === 'https:');
    } catch {
      return false;
    }
  }
  onImgError(ev: Event) {
    // optional: hide broken image by setting src to empty
    const img = ev.target as HTMLImageElement;
    img.style.display = 'none';
  }

  // rest of your treatment/dressing helpers (addTreatment/removeTreatment etc.) go here...
  get treatmentOptions() { return this.form.get('treatmentOptions') as FormArray; }
  get dressingOptions() { return this.form.get('dressingOptions') as FormArray; }
  addTreatment(value?: Partial<Treatment>){ this.treatmentOptions.push(this.fb.group({ title:[value?.title || '', Validators.required], description:[value?.description || ''] })); }
  removeTreatment(i:number){ this.treatmentOptions.removeAt(i); }
  addDressing(value?: Partial<Dressing>){ this.dressingOptions.push(this.fb.group({ type:[value?.type || '', Validators.required], description:[value?.description || ''] })); }
  removeDressing(i:number){ this.dressingOptions.removeAt(i); }

  async importQuickSheetJsonFile(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    this.jsonImportError = '';
    this.jsonImportSuccess = '';
    this.jsonPreview = null;

    try {
      this.jsonText = await file.text();
      this.previewQuickSheetJson(file.name);
    } catch {
      this.jsonImportError = 'Unable to read this JSON file.';
    } finally {
      input.value = '';
    }
  }

  previewQuickSheetJson(source = 'JSON'): void {
    this.jsonImportError = '';
    this.jsonImportSuccess = '';
    this.jsonPreview = null;

    try {
      const parsed = JSON.parse(this.jsonText || '{}');
      const sheet = this.normalizeQuickSheetJson(parsed);
      this.jsonPreview = sheet;
      this.jsonImportSuccess = `${source} is valid. Review the preview, then apply it to the form.`;
    } catch (err) {
      this.jsonImportError = err instanceof Error ? err.message : 'Invalid quick sheet JSON.';
    }
  }

  applyJsonPreviewToForm(): void {
    if (!this.jsonPreview) return;
    const sheet = this.jsonPreview;

    this.form.patchValue({
      name: sheet.name,
      category: sheet.category || '',
      shortDescription: sheet.shortDescription || '',
      fullDescription: sheet.fullDescription || '',
      synonyms: (sheet.synonyms || []).join(', '),
      tags: (sheet.tags || []).join(', '),
      characteristics: (sheet.characteristics || []).join(', '),
      isActive: sheet.isActive !== false
    });

    while (this.imageUrls.length) this.imageUrls.removeAt(0);
    while (this.videoUrls.length) this.videoUrls.removeAt(0);
    while (this.treatmentOptions.length) this.treatmentOptions.removeAt(0);
    while (this.dressingOptions.length) this.dressingOptions.removeAt(0);

    (sheet.images?.length ? sheet.images : ['']).forEach(url => this.addImageUrl(url));
    (sheet.videos?.length ? sheet.videos : ['']).forEach(url => this.addVideoUrl(url));
    (sheet.treatmentOptions?.length ? sheet.treatmentOptions : [{ title: '', description: '' }]).forEach(step => this.addTreatment(step));
    (sheet.dressingOptions?.length ? sheet.dressingOptions : [{ type: '', description: '' }]).forEach(item => this.addDressing(item));

    this.form.markAsDirty();
    this.jsonImportSuccess = `Applied JSON to form: ${sheet.name}`;
  }

  clearJsonImport(): void {
    this.jsonText = '';
    this.jsonPreview = null;
    this.jsonImportError = '';
    this.jsonImportSuccess = '';
  }

  loadSampleJson(): void {
    this.jsonText = JSON.stringify({
      name: 'Daily Opening Safety Checklist',
      category: 'Operations / Safety',
      quickPurpose: 'Confirm the workspace is safe, ready and compliant before daily operations begin.',
      instructions: 'Use this quick sheet at the start of each shift. Complete each check before opening operations. If an item is missing, damaged, unsafe or unclear, report it to the manager before continuing.',
      alternateNames: ['opening checklist', 'daily safety check', 'start of shift readiness'],
      tags: ['safety', 'operations', 'daily task', 'compliance', 'onboarding'],
      keyReminders: ['Check emergency exits', 'Inspect equipment', 'Confirm supplies', 'Report hazards', 'Document issues'],
      images: [],
      videos: [],
      steps: [
        {
          title: 'Check the workspace',
          description: 'Walk through the work area and confirm floors, entrances, exits and workstations are clean, accessible and free from visible hazards.'
        },
        {
          title: 'Inspect required equipment',
          description: 'Verify that required tools, devices, forms or systems are available and working before staff begin daily tasks.'
        },
        {
          title: 'Report any issue',
          description: 'If something is unsafe, missing, broken or unclear, report it immediately and document the issue according to organization policy.'
        }
      ],
      items: [
        {
          title: 'Daily checklist form',
          description: 'Use the organization daily opening checklist form or digital log if available.'
        },
        {
          title: 'Manager contact',
          description: 'Contact the manager or shift lead if any safety or readiness issue is found.'
        }
      ],
      isActive: true
    }, null, 2);
    this.previewQuickSheetJson('Sample JSON');
  }

  private normalizeQuickSheetJson(input: any): QuickSheetJson {
    const data = input?.docData || input?.quickSheet || input?.sheet || input;
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      throw new Error('JSON must contain a quick sheet object.');
    }

    const name = this.stringValue(data.name ?? data.title ?? data.sheetTitle);
    if (!name) {
      throw new Error('Quick sheet JSON must include "name" or "title".');
    }

    return {
      name,
      category: this.stringValue(data.category ?? data.taskArea ?? data.area),
      shortDescription: this.stringValue(data.shortDescription ?? data.quickPurpose ?? data.purpose),
      fullDescription: this.stringValue(data.fullDescription ?? data.instructions ?? data.body ?? data.description),
      synonyms: this.stringList(data.synonyms ?? data.alternateNames ?? data.searchTerms),
      tags: this.stringList(data.tags),
      characteristics: this.stringList(data.characteristics ?? data.keyReminders ?? data.reminders ?? data.checks),
      images: this.imageList(data.images ?? data.imageUrls),
      videos: this.imageList(data.videos ?? data.videoUrls ?? data.videoLinks),
      treatmentOptions: this.stepList(data.treatmentOptions ?? data.steps ?? data.practiceSteps),
      dressingOptions: this.itemList(data.dressingOptions ?? data.items ?? data.tools ?? data.materials),
      isActive: data.isActive !== false && data.active !== false,
      resourceKind: 'quick_sheet'
    };
  }

  private stringValue(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
  }

  private stringList(value: unknown): string[] {
    if (Array.isArray(value)) {
      return value.map(item => String(item || '').trim()).filter(Boolean);
    }
    if (typeof value === 'string') {
      return value.split(/,|\n/).map(item => item.trim()).filter(Boolean);
    }
    return [];
  }

  private imageList(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    return value
      .map(item => {
        if (typeof item === 'string') return item;
        if (!item || typeof item !== 'object') return '';
        return (item as { url?: unknown; src?: unknown }).url ?? (item as { src?: unknown }).src;
      })
      .map(url => String(url || '').trim())
      .filter(Boolean);
  }

  private stepList(value: unknown): Treatment[] {
    if (!Array.isArray(value)) return [];
    return value
      .map(item => {
        const row = item && typeof item === 'object' ? item as Record<string, unknown> : {};
        return {
          title: this.stringValue(row['title'] ?? row['name'] ?? row['step']),
          description: this.stringValue(row['description'] ?? row['details'] ?? row['body'])
        };
      })
      .filter(item => item.title);
  }

  private itemList(value: unknown): Dressing[] {
    if (!Array.isArray(value)) return [];
    return value
      .map(item => {
        const row = item && typeof item === 'object' ? item as Record<string, unknown> : {};
        return {
          type: this.stringValue(row['type'] ?? row['title'] ?? row['name']),
          description: this.stringValue(row['description'] ?? row['details'] ?? row['body'])
        };
      })
      .filter(item => item.type);
  }

  async submit() {
    if (!this.currentOrgId) {
      this.snack.open('This manager account must be linked to an organization before creating quick sheets.', 'Close', { duration: 6000 });
      return;
    }

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.uploading = true;

    const raw = this.form.value;
    const wound: WoundType = {
      name: raw.name,
      synonyms: raw.synonyms ? raw.synonyms.split(',').map((s:string)=>s.trim()).filter(Boolean) : [],
      category: raw.category,
      shortDescription: raw.shortDescription,
      fullDescription: raw.fullDescription,
      characteristics: raw.characteristics ? raw.characteristics.split(',').map((s:string)=>s.trim()).filter(Boolean) : [],
      treatmentOptions: (raw.treatmentOptions || []).map((t:any)=>({ title:t.title, description:t.description })),
      dressingOptions: (raw.dressingOptions || []).map((d:any)=>({ type:d.type, description:d.description })),
      tags: raw.tags ? raw.tags.split(',').map((s:string)=>s.trim()).filter(Boolean) : [],
      images: (raw.imageUrls || []).map((g:any) => (g && g.url) ? g.url.trim() : '').filter(Boolean),
      videos: (raw.videoUrls || []).map((g:any) => (g && g.url) ? g.url.trim() : '').filter(Boolean),
      orgId: this.currentOrgId,
      resourceKind: 'quick_sheet',
      isActive: raw.isActive
    };

    try {
      const id = await this.svc.addWoundType(wound);
      this.snack.open('Quick practice sheet created. id: ' + id, 'Close', { duration: 4000 });
      this.resetForm();
    } catch (err) {
      console.error(err);
      const m = (err instanceof Error) ? err.message : String(err);
      this.snack.open('Failed to create quick sheet: ' + m, 'Close', { duration: 6000 });
    } finally {
      this.uploading = false;
    }
  }

  private resetForm() {
    this.form.reset({
      name: '',
      synonyms: '',
      category: '',
      shortDescription: '',
      fullDescription: '',
      characteristics: '',
      tags: '',
      isActive: true
    });

    while (this.imageUrls.length) this.imageUrls.removeAt(0);
    while (this.videoUrls.length) this.videoUrls.removeAt(0);
    while (this.treatmentOptions.length) this.treatmentOptions.removeAt(0);
    while (this.dressingOptions.length) this.dressingOptions.removeAt(0);

    this.addImageUrl();
    this.addVideoUrl();
    this.addTreatment();
    this.addDressing();
    this.form.markAsPristine();
    this.form.markAsUntouched();
  }
}
