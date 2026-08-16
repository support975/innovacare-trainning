import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';                 // ✅ pour *ngIf, *ngFor
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms'; // ✅ pour formGroup
import { RouterLink } from '@angular/router';
import { AuthService } from '../../../core/auth';
import { PublicTranslateDirective } from '../../../shared/directives/public-translate.directive';


@Component({
  standalone: true,
  selector: 'app-reset',
  imports: [CommonModule, ReactiveFormsModule, RouterLink, PublicTranslateDirective],     // ✅ AJOUTS ICI
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
      this.success.set('Courriel de réinitialisation envoyé. Vérifiez votre boîte de réception.');
    } catch {
      this.error.set('Impossible d\'envoyer le courriel de réinitialisation. Vérifiez l\'adresse et réessayez.');
    } finally {
      this.loading.set(false);
    }
  }
}
