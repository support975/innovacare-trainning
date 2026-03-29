import { Component, inject, signal } from '@angular/core';
import { ManagerRoutingModule } from "../../../manager/manager.routes";
import { CommonModule } from '@angular/common';
import { NavigationEnd, Router, RouterModule } from '@angular/router';
import { filter } from 'rxjs';
import { NotificationBellPlainComponent } from '../../../../shared/components/notifications/notification-bell-plain/notification-bell-plain';



@Component({
  selector: 'app-learner-shell',
  imports: [ManagerRoutingModule, CommonModule, RouterModule, NotificationBellPlainComponent],
  templateUrl: './learner-shell.html',
  styleUrl: './learner-shell.css'
})
export class LearnerShell {
  private router = inject(Router);

  // signals
  sidebarOpen = signal(false);
  isMobile = signal(window.matchMedia('(max-width: 768px)').matches);

  constructor() {
    // Auto-close on route change for small screens
    this.router.events
      .pipe(filter(e => e instanceof NavigationEnd))
      .subscribe(() => {
        if (this.isMobile()) this.closeSidebar();
      });

    // Update mobile flag on viewport change
    const mq = window.matchMedia('(max-width: 768px)');
    const handler = (e: MediaQueryListEvent) => this.isMobile.set(e.matches);
    mq.addEventListener('change', handler);
  }

  // called by the hamburger
  toggleSidebar() { this.sidebarOpen.update(v => !v); }

  // called by backdrop and programmatically
  closeSidebar() { this.sidebarOpen.set(false); }

  // called by menu links in the template
  onNavClick() {
    if (this.isMobile()) this.closeSidebar();
  }

  // data
  links = [
    { path: '/learner', label: 'Dashboard' },
    { path: '/learner/assignments', label: 'Assignments' },
    { path: '/learner/wound', label: 'Wound Library' },
    { path: '/learner/profile', label: 'Your Profile' },
    { path: '/learner/policies', label: 'Policies and Procedures' }
  ];

  resources = [
    { path: '/learner/certifications', label: 'Certifications' },
    { path: '/learner/library', label: 'Library' },
    { path: '/learner/transcript', label: 'Transcripts' },
    { path: '/learner/rewards', label: 'Rewards' }
  ];

  // ✅ Add Router injection here
  logout() {
    // TODO: Replace with your Firebase/AuthService logout
    console.log('Logging out...');
    this.router.navigate(['/login']);
  }
}
