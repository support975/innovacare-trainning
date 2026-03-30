import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { combineLatest, firstValueFrom } from 'rxjs';
import { filter, map, take } from 'rxjs/operators';
import { AuthService, AppProfile } from '../../../core/auth';

function defaultRouteForRole(role: AppProfile['role']): string {
  switch (role) {
    case 'super_admin':
      return '/super-admin/dashboard';
    case 'admin':
    case 'manager':
      return '/manager/dashboard';
    case 'learner':
      return '/learner';
    case 'guest':
      return '/guest';
    default:
      return '/login';
  }
}

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

  private async waitForFreshProfile(): Promise<AppProfile> {
    return firstValueFrom(
      combineLatest([this.auth.ready$, this.auth.profile$]).pipe(
        filter(([ready, profile]) =>
          ready &&
          !!profile &&
          !!this.auth.currentUid &&
          profile.uid === this.auth.currentUid
        ),
        map(([_, profile]) => profile as AppProfile),
        take(1)
      )
    );
  }

  async submit() {
    if (this.form.invalid) return;

    this.loading.set(true);
    this.error.set(null);

    try {
      const { email, password } = this.form.getRawValue();
      await this.auth.loginWithEmail(email!, password!);

      const profile = await this.waitForFreshProfile();
      await this.router.navigateByUrl(defaultRouteForRole(profile.role), { replaceUrl: true });
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

      const profile = await this.waitForFreshProfile();
      await this.router.navigateByUrl(defaultRouteForRole(profile.role), { replaceUrl: true });
    } catch (e: any) {
      this.error.set(e?.message ?? 'Google sign-in failed');
    } finally {
      this.loading.set(false);
    }
  }
}