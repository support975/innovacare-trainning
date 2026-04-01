import { CommonModule } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { DemoRequestService } from '../demo-request';

interface DemoDialogData {
  source?: string;
  selectedPlan?: string | null;
}

@Component({
  selector: 'app-demo-request-dialog',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatIconModule,
    MatSnackBarModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './demo-request-dialog.html',
  styleUrl: './demo-request-dialog.css',
})
export class DemoRequestDialog {
  private readonly fb = inject(FormBuilder);
  private readonly dialogRef = inject(MatDialogRef<DemoRequestDialog>);
  private readonly demoRequestService = inject(DemoRequestService);
  private readonly snackBar = inject(MatSnackBar);
    readonly data = inject<DemoDialogData>(MAT_DIALOG_DATA, { optional: true }) ?? {};

  readonly loading = signal(false);

  readonly organizationTypes = [
    'Home Care',
    'Home Health',
    'Skilled Nursing',
    'Hospice',
    'Hospital',
    'Private Practice',
    'Autre structure de santé',
  ];

  readonly form = this.fb.nonNullable.group({
    fullName: ['', [Validators.required, Validators.minLength(2)]],
    workEmail: ['', [Validators.required, Validators.email]],
    phone: [''],
    organizationName: ['', Validators.required],
    organizationType: ['', Validators.required],
    selectedPlan: [this.data.selectedPlan ?? ''],
    message: [
      this.data.selectedPlan
        ? `Bonjour, je souhaite une démo pour le plan ${this.data.selectedPlan}.`
        : '',
      [Validators.required, Validators.minLength(12)],
    ],
  });
  
  close(): void {
    this.dialogRef.close();
  }

  submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.loading.set(true);

    this.demoRequestService.createDemoRequest(this.form.getRawValue()).subscribe({
      next: () => {
        this.loading.set(false);
        this.snackBar.open('Demande envoyée avec succès.', 'Fermer', { duration: 5000 });
        this.dialogRef.close(true);
      },
      error: () => {
        this.loading.set(false);
        this.snackBar.open('Impossible d’envoyer la demande pour le moment.', 'Fermer', { duration: 7000 });
      },
    });
  }

  hasError(controlName: keyof typeof this.form.controls, errorKey: string): boolean {
    const control = this.form.controls[controlName];
    return control.hasError(errorKey) && (control.touched || control.dirty);
  }
}