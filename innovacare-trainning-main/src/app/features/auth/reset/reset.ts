import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';                 // ✅ pour *ngIf, *ngFor
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms'; // ✅ pour formGroup
import { RouterLink } from '@angular/router';
import { AuthService } from '../../../core/auth';


@Component({
  standalone: true,
  selector: 'app-reset',
  imports: [CommonModule, ReactiveFormsModule, RouterLink],     // ✅ AJOUTS ICI
  templateUrl: './reset.html',
  styleUrls: ['./reset.css'],
})
export class ResetComponent {
  private fb = inject(FormBuilder);
  private auth = inject(AuthService);

  loading = signal(false);
  success = signal<string | null>(null);
  error = signal<string | null>(null);

  form = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
  });

  async submit() {
    if (this.form.invalid) return;
    this.loading.set(true);
    this.error.set(null);
    this.success.set(null);
    try {
      await this.auth.resetPassword(this.form.value.email!);
      this.success.set('Password reset email sent. Check your inbox.');
    } catch {
      this.error.set('Unable to send reset email. Verify the address and try again.');
    } finally {
      this.loading.set(false);
    }
  }
}
