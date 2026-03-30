import { Component, OnDestroy, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs';
import { NotificationBellPlainComponent } from '../../../../shared/components/notifications/notification-bell-plain/notification-bell-plain';

@Component({
  selector: 'app-learner-shell',
  imports: [CommonModule, RouterModule, NotificationBellPlainComponent],
  templateUrl: './learner-shell.html',
  styleUrl: './learner-shell.css'
})
export class LearnerShell implements OnDestroy {
  private router = inject(Router);
  private mq = window.matchMedia('(max-width: 860px)');

  isMobile = signal(this.mq.matches);
  sidebarOpen = signal(!this.mq.matches); // open by default on desktop, closed on mobile

  private mediaHandler = (e: MediaQueryListEvent) => {
    this.isMobile.set(e.matches);

    // keep UX natural on breakpoint change
    if (e.matches) {
      this.sidebarOpen.set(false); // mobile => drawer closed by default
    } else {
      this.sidebarOpen.set(true); // desktop => sidebar visible by default
    }
  };

  constructor() {
    this.router.events
      .pipe(filter(e => e instanceof NavigationEnd))
      .subscribe(() => {
        if (this.isMobile()) this.closeSidebar();
      });

    this.mq.addEventListener('change', this.mediaHandler);
  }

  ngOnDestroy(): void {
    this.mq.removeEventListener('change', this.mediaHandler);
  }

  toggleSidebar() {
    this.sidebarOpen.update(v => !v);
  }

  closeSidebar() {
    this.sidebarOpen.set(false);
  }

  openSidebar() {
    this.sidebarOpen.set(true);
  }

  onNavClick() {
    if (this.isMobile()) this.closeSidebar();
  }

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

  logout() {
    console.log('Logging out...');
    this.router.navigate(['/login']);
  }
}