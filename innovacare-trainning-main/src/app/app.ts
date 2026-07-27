import { Component, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, map } from 'rxjs';
import { CookieConsentComponent } from './shared/cookie-consent/cookie-consent';
import { MaintenanceBanner } from './shared/maintenance/maintenance-banner/maintenance-banner';
import { MaintenancePage } from './shared/maintenance/maintenance-page/maintenance-page';
import { AuthService } from './core/auth';
import { MaintenanceService } from './core/maintenance.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, RouterOutlet, CookieConsentComponent, MaintenanceBanner, MaintenancePage],
  templateUrl: './app.html',
  styleUrls: ['./app.css']
})
export class App {
  private readonly authSvc = inject(AuthService);
  private readonly router = inject(Router);
  readonly maintenanceSvc = inject(MaintenanceService);

  private readonly authReady = toSignal(this.authSvc.ready$, { initialValue: false });
  private readonly profile = toSignal(this.authSvc.profile$, { initialValue: null });

  // The block screen must never swallow /login — otherwise nobody (not even
  // a super admin) could ever sign in to turn it back off again.
  private readonly currentUrl = toSignal(
    this.router.events.pipe(
      filter((e) => e instanceof NavigationEnd),
      map((e) => (e as NavigationEnd).urlAfterRedirects)
    ),
    { initialValue: this.router.url }
  );
  private readonly onLoginRoute = computed(() => this.currentUrl().split('?')[0] === '/login');

  // Only super_admin can use the app while a full block is active. Wait for
  // auth to resolve before blocking, so a super admin isn't flashed the
  // block screen for the split second before their role is known.
  readonly isBlocked = computed(() =>
    this.authReady()
    && this.maintenanceSvc.blockEnabled()
    && this.profile()?.role !== 'super_admin'
    && !this.onLoginRoute()
  );
}
