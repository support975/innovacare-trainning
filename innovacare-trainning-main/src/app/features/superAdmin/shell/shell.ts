import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';

@Component({
  selector: 'app-shell',
  imports: [
    CommonModule,
    RouterModule,
  ],
  templateUrl: './shell.html',
  styleUrl: './shell.css',
})
export class Shell {
  sidebarOpen = signal(true);

 nav = [
  { label: 'Dashboard', path: '/super-admin/dashboard' },
  { label: 'Organizations', path: '/super-admin/organizations' },
  { label: 'Setup', path: '/super-admin/setup' },
  { label: 'Users', path: '/super-admin/users' },
  { label: 'Billing', path: '/super-admin/billing' },
  { label: 'Logs', path: '/super-admin/logs' },
  { label: 'Settings', path: '/super-admin/settings' },
  { label: 'Course Assignments', path: '/super-admin/course-assignments' },
];

  constructor(private router: Router) {}

  toggleSidebar() {
    this.sidebarOpen.update(v => !v);
  }

  logout() {
    this.router.navigate(['/home']);
  }
}