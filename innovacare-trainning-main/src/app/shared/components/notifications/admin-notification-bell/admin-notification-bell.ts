import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { firstValueFrom, take } from 'rxjs';
import { AuthService } from '../../../../core/auth';
import { AdminNotificationService } from '../../../../data/admin-notification.service';
import { AdminNotification } from '../../../../data/models';
import { LanguageService } from '../../../services/language';

/**
 * Admin-facing notification bell — distinct from notification-bell-plain
 * (which is learner-scoped and, when it appears in the manager shell today,
 * silently shows nothing since a manager's uid never matches a learnerId).
 * Auto-detects its audience from the signed-in profile: super_admin sees
 * the global feed, everyone else with an orgId sees their org's feed.
 */
@Component({
  standalone: true,
  selector: 'app-admin-notification-bell',
  imports: [CommonModule],
  templateUrl: './admin-notification-bell.html',
  styleUrls: ['./admin-notification-bell.css'],
})
export class AdminNotificationBellComponent implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly notificationSvc = inject(AdminNotificationService);
  private readonly router = inject(Router);
  readonly lang = inject(LanguageService);

  open = signal(false);
  notifications = signal<AdminNotification[]>([]);
  private uid = '';

  readonly unreadCount = computed(
    () => this.notifications().filter((n) => !n.readBy?.includes(this.uid)).length
  );

  async ngOnInit(): Promise<void> {
    const profile = await firstValueFrom(this.auth.profile$.pipe(take(1)));
    this.uid = this.auth.currentUid ?? '';
    if (!profile) return;

    const feed$ = profile.role === 'super_admin'
      ? this.notificationSvc.listGlobal$()
      : profile.orgId
        ? this.notificationSvc.listForOrg$(profile.orgId)
        : null;

    feed$?.subscribe((list) => this.notifications.set(list));
  }

  toggle(): void {
    this.open.set(!this.open());
  }

  isUnread(n: AdminNotification): boolean {
    return !n.readBy?.includes(this.uid);
  }

  severityIcon(n: AdminNotification): string {
    if (n.severity === 'critical') return '🚨';
    if (n.severity === 'warning') return '⚠️';
    return 'ℹ️';
  }

  async openNotification(n: AdminNotification): Promise<void> {
    this.open.set(false);
    if (n.id && !n.readBy?.includes(this.uid)) {
      void this.notificationSvc.markRead(n.id, this.uid);
    }
    if (n.targetUrl) {
      void this.router.navigateByUrl(n.targetUrl);
    }
  }

  trackById(_i: number, n: AdminNotification): string {
    return n.id || '';
  }
}
