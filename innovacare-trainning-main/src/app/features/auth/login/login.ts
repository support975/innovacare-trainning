import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';

import { firstValueFrom } from 'rxjs';
import { AuthService } from '../../../core/auth';

@Component({
  standalone: true,
  selector: 'app-login',
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  templateUrl: './login.html',
  styleUrls: ['./login.css'],
})
export class LoginComponent {
  private fb = inject(FormBuilder);
  private auth = inject(AuthService);
  private router = inject(Router);

  loading = signal(false);
  error = signal<string | null>(null);

  form = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(6)]],
  });

  async submit() {
    if (this.form.invalid) return;
    this.loading.set(true);
    this.error.set(null);
    try {
      const { email, password } = this.form.value;
      await this.auth.loginWithEmail(email!, password!);
      // route selon rôle
      const profile = await firstValueFrom(this.auth.profile$);
      if (profile?.role === 'manager' || profile?.role === 'admin') {
        this.router.navigateByUrl('/manager');
      } else {
        this.router.navigateByUrl('/learner');
      }
    } catch (e: any) {
      this.error.set(e?.message ?? 'Login failed');
    } finally {
      this.loading.set(false);
    }
  }

  async google() {
    this.loading.set(true);
    this.error.set(null);
    try {
      await this.auth.loginWithGoogle();
      const profile = await firstValueFrom(this.auth.profile$);
      if (profile?.role === 'manager' || profile?.role === 'admin') {
        this.router.navigateByUrl('/manager');
      } else {
        this.router.navigateByUrl('/learner');
      }
    } catch (e: any) {
      this.error.set(e?.message ?? 'Google sign-in failed');
    } finally {
      this.loading.set(false);
    }
  }
}
