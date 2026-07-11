import { Component, DestroyRef, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NavigationEnd, Router, RouterModule } from '@angular/router';
import { BreakpointObserver } from '@angular/cdk/layout';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { filter } from 'rxjs/operators';
import { AuthService } from '../../../core/auth';

type NavItem = {
  label: string;
  path: string;
  icon: string;
  exact?: boolean;
};

type NavSection = {
  label: string;
  items: NavItem[];
};

@Component({
  selector: 'app-shell',
  imports: [CommonModule, RouterModule],
  templateUrl: './shell.html',
  styleUrl: './shell.css',
})
export class Shell {
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly breakpointObserver = inject(BreakpointObserver);
  private readonly authSvc = inject(AuthService);
  private readonly mobileQuery = '(max-width: 920px)';

  isMobile = signal(this.breakpointObserver.isMatched(this.mobileQuery));
  sidebarOpen = signal(!this.breakpointObserver.isMatched(this.mobileQuery));

  sections: NavSection[] = [
    {
      label: 'Platform',
      items: [
        {
          label: 'Overview',
          path: '/super-admin/dashboard',
          exact: true,
          icon: 'M4 5h7v7H4V5Zm9 0h7v4h-7V5ZM4 14h7v5H4v-5Zm9-3h7v8h-7v-8Z',
        },
        {
          label: 'Organizations',
          path: '/super-admin/organizations',
          icon: 'M4 20V8l8-4 8 4v12h-5v-6H9v6H4Zm6-10h4m-4 3h4',
        },
        {
          label: 'Users & Roles',
          path: '/super-admin/users',
          icon: 'M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm6-1a2.5 2.5 0 1 0 0-5M3.5 19a5.5 5.5 0 0 1 11 0M14 17.5a4.5 4.5 0 0 1 6.5 1.5',
        },
      ],
    },
    {
      label: 'Learning',
      items: [
        {
          label: 'Course Library',
          path: '/super-admin/courses',
          icon: 'M5 4h10a4 4 0 0 1 4 4v12H8a3 3 0 0 0-3-3V4Zm3 0v13m3-9h5m-5 4h5',
        },
        {
          label: 'Course Assignment',
          path: '/super-admin/course-assignments',
          icon: 'M5 5h14v14H5V5Zm4 5h6m-6 4h6m-7-4h.01m-.01 4h.01',
        },
        {
          label: 'Learning Paths',
          path: '/super-admin/learning-paths',
          icon: 'M4 6h6v4H4V6Zm10 0h6v4h-6V6ZM7 10v4m0 0h10m0-4v4M4 14h6v4H4v-4Zm10 0h6v4h-6v-4Z',
        },
        {
          label: 'Exam Authoring',
          path: '/super-admin/exam-authoring',
          icon: 'M5 4h14v16H5V4Zm3 4h8m-8 4h8m-8 4h5M16 15l1 1 2-3',
        },
        {
          label: 'Policy Assignment',
          path: '/super-admin/policy-assignments',
          icon: 'M5 4h14v16H5V4Zm3 4h8m-8 4h8m-8 4h5',
        },
      ],
    },
    {
      label: 'Governance',
      items: [
        {
          label: 'Billing',
          path: '/super-admin/billing',
          icon: 'M4 7h16v10H4V7Zm0 3h16m3 4h4',
        },
        {
          label: 'Demo Requests',
          path: '/super-admin/demo-requests',
          icon: 'M4 5h16v11H7l-3 3V5Zm4 4h8M8 12h5',
        },
        {
          label: 'Audit Logs',
          path: '/super-admin/logs',
          icon: 'M7 4h10v16H7V4Zm3 5h4m-4 4h4m-4 4h3',
        },
        {
          label: 'Settings',
          path: '/super-admin/settings',
          icon: 'M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Zm0-5v3m0 11v3M4.2 6.2l2.1 2.1m11.4 7.4 2.1 2.1M1.5 12h3m15 0h3M4.2 17.8l2.1-2.1M17.7 8.3l2.1-2.1',
        },
        {
          label: 'Setup',
          path: '/super-admin/setup',
          icon: 'M12 3 5 6.5v6c0 4.4 2.9 7.4 7 8.5 4.1-1.1 7-4.1 7-8.5v-6L12 3Zm-3 9 2 2 4-4',
        },
      ],
    },
  ];

  constructor() {
    this.router.events
      .pipe(
        filter((event) => event instanceof NavigationEnd),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe(() => {
        if (this.isMobile()) this.closeSidebar();
      });

    this.breakpointObserver
      .observe(this.mobileQuery)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((state) => {
        this.isMobile.set(state.matches);
        this.sidebarOpen.set(!state.matches);
      });
  }

  toggleSidebar() {
    this.sidebarOpen.update((value) => !value);
  }

  closeSidebar() {
    this.sidebarOpen.set(false);
  }

  onNavClick() {
    if (this.isMobile()) this.closeSidebar();
  }

  async logout() {
    await this.authSvc.logout();
    await this.router.navigate(['/home']);
  }
}
