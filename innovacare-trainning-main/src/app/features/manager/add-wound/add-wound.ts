// src/app/features/manager/wound/add-wound-type.component.ts
import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, FormArray, ReactiveFormsModule } from '@angular/forms';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatCardModule } from '@angular/material/card';
import { MatDividerModule } from '@angular/material/divider';
import { MatSelectModule } from '@angular/material/select';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { WoundService } from '../services/wound-service';
import { WoundType } from '../wound.model';

@Component({
  selector: 'app-add-wound',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
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
  <mat-card class="card">
    <h2>Create wound type (Library)</h2>

    <form [formGroup]="form" (ngSubmit)="submit()">
      <mat-form-field appearance="fill" class="full">
        <mat-label>Name</mat-label>
        <input matInput formControlName="name" required>
      </mat-form-field>

      <!-- other fields omitted for brevity (synonyms, category, descriptions...) -->
      <mat-form-field appearance="fill" class="full">
        <mat-label>Short description</mat-label>
        <input matInput formControlName="shortDescription">
      </mat-form-field>

      <mat-form-field appearance="fill" class="full">
        <mat-label>Full description</mat-label>
        <textarea matInput rows="5" formControlName="fullDescription"></textarea>
      </mat-form-field>

      <!-- Image URL inputs -->
      <mat-card class="section">
        <mat-card-title>Images (enter image URLs)</mat-card-title>

        <div formArrayName="imageUrls">
          <div *ngFor="let ctrl of imageUrls.controls; let i = index" [formGroupName]="i" class="image-row">
            <mat-form-field appearance="fill" class="image-input">
              <mat-label>Image URL</mat-label>
              <input matInput formControlName="url" placeholder="https://..." />
              <mat-error *ngIf="ctrl.get('url')?.hasError('pattern')">Invalid URL</mat-error>
            </mat-form-field>

            <div class="preview">
              <img *ngIf="isValidUrl(ctrl.get('url')?.value)" [src]="ctrl.get('url')?.value" (error)="onImgError($event)" />
            </div>

            <button mat-icon-button color="warn" type="button" (click)="removeImageUrl(i)" aria-label="Remove image">
              <mat-icon>delete</mat-icon>
            </button>
          </div>
        </div>

        <button mat-flat-button color="primary" type="button" (click)="addImageUrl()">
          <mat-icon>add</mat-icon> Add image URL
        </button>
        <p class="hint">Paste secure public URLs (https). You can add many images for each wound type.</p>
      </mat-card>

     <!-- Treatments -->
     <mat-card class="section">
        <mat-card-title>Treatment Options</mat-card-title>
        <div formArrayName="treatmentOptions">
          <div *ngFor="let t of treatmentOptions.controls; let i = index" [formGroupName]="i" class="item">
            <mat-form-field appearance="fill" class="full">
              <mat-label>Treatment title</mat-label>
              <input matInput formControlName="title">
            </mat-form-field>

            <mat-form-field appearance="fill" class="full">
              <mat-label>Description</mat-label>
              <textarea matInput rows="2" formControlName="description"></textarea>
            </mat-form-field>

            <div class="row">
              <button mat-mini-button color="warn" type="button" (click)="removeTreatment(i)"><mat-icon>delete</mat-icon> Remove</button>
            </div>
            <mat-divider></mat-divider>
          </div>
        </div>
        <button mat-flat-button color="primary" type="button" (click)="addTreatment()">Add treatment</button>
      </mat-card>

      <!-- Dressings -->
      <mat-card class="section">
        <mat-card-title>Dressing Options</mat-card-title>
        <div formArrayName="dressingOptions">
          <div *ngFor="let d of dressingOptions.controls; let i = index" [formGroupName]="i" class="item">
            <mat-form-field appearance="fill" class="full">
              <mat-label>Dressing type</mat-label>
              <input matInput formControlName="type">
            </mat-form-field>

            <mat-form-field appearance="fill" class="full">
              <mat-label>Description/indications</mat-label>
              <textarea matInput rows="2" formControlName="description"></textarea>
            </mat-form-field>

            <div class="row">
              <button mat-mini-button color="warn" type="button" (click)="removeDressing(i)"><mat-icon>delete</mat-icon> Remove</button>
            </div>
            <mat-divider></mat-divider>
          </div>
        </div>
        <button mat-flat-button color="primary" type="button" (click)="addDressing()">Add dressing</button>
      </mat-card>

      <div class="actions">
        <button mat-raised-button color="primary" type="submit" [disabled]="uploading">Create Wound Type</button>
        <mat-progress-spinner *ngIf="uploading" diameter="30" mode="indeterminate"></mat-progress-spinner>
      </div>
    </form>
  </mat-card>
  `,
  styles: [`
    .card { max-width: 900px; margin: 20px auto; padding: 16px; }
    .full { width: 100%; }
    .section { margin-top: 16px; padding: 12px; }
    .image-row { display:flex; align-items:center; gap:12px; margin-bottom:8px; }
    .image-input { flex: 1; }
    .preview img { height: 72px; width: auto; border-radius:4px; border:1px solid #ddd; }
    .hint { font-size: .85rem; color:#666; margin-top:8px; }
    .actions { margin-top: 18px; display:flex; align-items:center; gap:12px; }
  `]
})
export class AddWound implements OnInit {
  form!: FormGroup;
  uploading = false;

  constructor(private fb: FormBuilder, private svc: WoundService, private snack: MatSnackBar) {}

  ngOnInit(): void {
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
      imageUrls: this.fb.array([ this.fb.group({ url: ['', [Validators.pattern('^https?://.+')]] }) ])
    });

    // optionally add initial treatment/dressing as before
    this.addTreatment();
    this.addDressing();
  }

  // Image URL FormArray helpers
  get imageUrls(): FormArray { return this.form.get('imageUrls') as FormArray; }
  addImageUrl() {
    this.imageUrls.push(this.fb.group({ url: ['', [Validators.pattern('^https?://.+')]] }));
  }
  removeImageUrl(i: number) {
    this.imageUrls.removeAt(i);
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
  addTreatment(){ this.treatmentOptions.push(this.fb.group({ title:['', Validators.required], description:[''] })); }
  removeTreatment(i:number){ this.treatmentOptions.removeAt(i); }
  addDressing(){ this.dressingOptions.push(this.fb.group({ type:['', Validators.required], description:[''] })); }
  removeDressing(i:number){ this.dressingOptions.removeAt(i); }

  async submit() {
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
      isActive: raw.isActive
    };

    try {
      const id = await this.svc.addWoundType(wound);
      this.snack.open('Wound type created. id: ' + id, 'Close', { duration: 4000 });
      this.form.reset({ isActive: true, imageUrls: [ this.fb.group({ url: ['', [Validators.pattern('^https?://.+')]] }) ] });
      // clear arrays and re-add defaults
      while (this.treatmentOptions.length) this.treatmentOptions.removeAt(0);
      while (this.dressingOptions.length) this.dressingOptions.removeAt(0);
      this.addTreatment(); this.addDressing();
    } catch (err) {
      console.error(err);
      const m = (err instanceof Error) ? err.message : String(err);
      this.snack.open('Failed to create wound type: ' + m, 'Close', { duration: 6000 });
    } finally {
      this.uploading = false;
    }
  }
}