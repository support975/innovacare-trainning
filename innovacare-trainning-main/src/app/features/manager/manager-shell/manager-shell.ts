import { Component, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs/operators';

import { NotificationBell } from '../../../shared/components/notifications/notification-bell/notification-bell';
import { NotificationBellPlainComponent } from '../../../shared/components/notifications/notification-bell-plain/notification-bell-plain';

@Component({
  selector: 'app-manager-shell',
  standalone: true,
  imports: [CommonModule, RouterModule, NotificationBellPlainComponent],
  templateUrl: './manager-shell.html',
  styleUrl: './manager-shell.css'
})
export class ManagerShell {
  private router = inject(Router);

  sidebarOpen = signal(false);
  toggleSidebar() { this.sidebarOpen.update(v => !v); }
  closeSidebar()  { this.sidebarOpen.set(false); }

  nav = signal([
    { path: '/manager/dashboard', label: 'Dashboard', active: true },
    { path: '/manager/assign',    label: 'Assign',    active: false },
    { path: '/manager/courses',   label: 'Courses',   active: false }
  ]);

  resources = signal([
    { path: '/manager/reports', label: 'Reports' },
    { path: '/manager/wounds', label: 'Wounds' },
    { path: '/manager/setting', label: 'Setting' }
  ]);

  constructor() {
    // auto-close on route change for small screens
    this.router.events.pipe(filter(e => e instanceof NavigationEnd)).subscribe(() => {
      if (window.matchMedia('(max-width: 768px)').matches) this.closeSidebar();
    });
  }

  logout() {
    // TODO: hook to Firebase/AuthService
    this.router.navigate(['/home']);
  }
}
