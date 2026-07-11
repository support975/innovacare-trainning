import {Component, OnInit, OnDestroy, inject} from "@angular/core";
import {CommonModule} from "@angular/common";
import {RouterModule} from "@angular/router";
import {NotificationService, InAppNotification} from "../../../../shared/services/notification.service";
import {Subject} from "rxjs";
import {takeUntil} from "rxjs/operators";

@Component({
  selector: "app-notification-center",
  standalone: true,
  imports: [CommonModule, RouterModule],
  template: `
    <div class="notification-center">
      <div class="header">
        <h1>Notifications</h1>
        <div class="actions" *ngIf="notifications.length > 0">
          <button class="btn btn-ghost" (click)="markAllAsRead()" *ngIf="unreadCount > 0">
            Mark all as read
          </button>
          <button class="btn btn-ghost" (click)="clearAll()">Clear all</button>
        </div>
      </div>

      <div class="filters">
        <button
          class="filter-btn"
          [class.active]="selectedFilter === 'all'"
          (click)="selectedFilter = 'all'"
        >
          All
        </button>
        <button
          class="filter-btn"
          [class.active]="selectedFilter === 'unread'"
          (click)="selectedFilter = 'unread'"
        >
          Unread ({{ unreadCount }})
        </button>
        <button
          class="filter-btn"
          [class.active]="selectedFilter === 'course_assigned'"
          (click)="selectedFilter = 'course_assigned'"
        >
          📚 Courses
        </button>
        <button
          class="filter-btn"
          [class.active]="selectedFilter === 'reward'"
          (click)="selectedFilter = 'reward'"
        >
          🏆 Rewards
        </button>
      </div>

      <div class="notifications-list" *ngIf="filteredNotifications.length > 0">
        <div
          class="notification-item"
          *ngFor="let notification of filteredNotifications"
          [class.unread]="!notification.read"
          (click)="handleNotificationClick(notification)"
        >
          <div class="notification-icon">{{ notification.icon }}</div>
          <div class="notification-content">
            <h3 class="notification-title">{{ notification.title }}</h3>
            <p class="notification-message">{{ notification.message }}</p>
            <span class="notification-time">{{ formatTime(notification.createdAt) }}</span>
          </div>
          <div class="notification-actions">
            <button
              class="btn-icon"
              *ngIf="!notification.read"
              (click)="markAsRead(notification); $event.stopPropagation()"
              title="Mark as read"
            >
              ✓
            </button>
            <button
              class="btn-icon delete"
              (click)="deleteNotification(notification); $event.stopPropagation()"
              title="Delete"
            >
              ✕
            </button>
          </div>
        </div>
      </div>

      <div class="empty-state" *ngIf="filteredNotifications.length === 0">
        <div class="empty-icon">🔔</div>
        <h2>No Notifications</h2>
        <p>You're all caught up! Check back later for updates.</p>
      </div>
    </div>
  `,
  styles: [`
    .notification-center {
      max-width: 800px;
      margin: 0 auto;
      padding: 32px;
      background: linear-gradient(135deg, #f9fafb 0%, #f3f4f6 100%);
      min-height: 100vh;
    }

    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 32px;
      flex-wrap: wrap;
      gap: 16px;
    }

    .header h1 {
      margin: 0;
      font-size: 32px;
      font-weight: 900;
      background: linear-gradient(135deg, #1a3f6f 0%, #00a79d 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
    }

    .actions {
      display: flex;
      gap: 12px;
    }

    .filters {
      display: flex;
      gap: 8px;
      margin-bottom: 24px;
      flex-wrap: wrap;
    }

    .filter-btn {
      padding: 8px 16px;
      border-radius: 999px;
      border: 2px solid #e5e7eb;
      background: white;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.3s ease;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: #1f2937;
    }

    .filter-btn:hover {
      border-color: #00a79d;
      color: #00a79d;
    }

    .filter-btn.active {
      background: linear-gradient(135deg, #1a3f6f, #00a79d);
      border-color: transparent;
      color: white;
      box-shadow: 0 4px 12px rgba(0, 167, 157, 0.3);
    }

    .notifications-list {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .notification-item {
      display: flex;
      gap: 16px;
      align-items: flex-start;
      background: white;
      border: 1px solid #e5e7eb;
      border-radius: 12px;
      padding: 16px;
      cursor: pointer;
      transition: all 0.3s ease;
      border-left: 4px solid #e5e7eb;
    }

    .notification-item:hover {
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.08);
      border-left-color: #00a79d;
    }

    .notification-item.unread {
      background: rgba(0, 167, 157, 0.02);
      border-left-color: #00a79d;
    }

    .notification-icon {
      font-size: 24px;
      flex-shrink: 0;
    }

    .notification-content {
      flex: 1;
      min-width: 0;
    }

    .notification-title {
      margin: 0 0 4px;
      font-size: 14px;
      font-weight: 700;
      color: #1f2937;
    }

    .notification-message {
      margin: 0 0 8px;
      font-size: 13px;
      color: #6b7280;
      line-height: 1.5;
    }

    .notification-time {
      font-size: 11px;
      color: #9ca3af;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      font-weight: 600;
    }

    .notification-actions {
      display: flex;
      gap: 8px;
      flex-shrink: 0;
    }

    .btn-icon {
      background: transparent;
      border: none;
      cursor: pointer;
      font-size: 16px;
      padding: 4px 8px;
      color: #00a79d;
      transition: all 0.3s ease;
      border-radius: 4px;
    }

    .btn-icon:hover {
      background: rgba(0, 167, 157, 0.1);
    }

    .btn-icon.delete {
      color: #ef4444;
    }

    .btn-icon.delete:hover {
      background: rgba(239, 68, 68, 0.1);
    }

    .btn {
      padding: 8px 16px;
      border-radius: 8px;
      border: none;
      font-weight: 600;
      font-size: 12px;
      cursor: pointer;
      transition: all 0.3s ease;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .btn-ghost {
      background: white;
      border: 1px solid #e5e7eb;
      color: #1f2937;
    }

    .btn-ghost:hover {
      background: #f3f4f6;
      border-color: #00a79d;
      color: #00a79d;
    }

    .empty-state {
      text-align: center;
      padding: 60px 20px;
      background: white;
      border: 1px solid #e5e7eb;
      border-radius: 16px;
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.08);
    }

    .empty-icon {
      font-size: 48px;
      margin-bottom: 16px;
    }

    .empty-state h2 {
      margin: 0 0 8px;
      font-size: 18px;
      color: #1f2937;
    }

    .empty-state p {
      margin: 0;
      font-size: 14px;
      color: #6b7280;
    }

    @media (max-width: 768px) {
      .notification-center {
        padding: 16px;
      }

      .header {
        flex-direction: column;
        align-items: flex-start;
      }

      .notification-item {
        gap: 12px;
      }
    }
  `],
})
export class NotificationCenterComponent implements OnInit, OnDestroy {
  private notificationService = inject(NotificationService);
  private destroy$ = new Subject<void>();

  notifications: InAppNotification[] = [];
  selectedFilter: "all" | "unread" | "course_assigned" | "course_completed" | "course_overdue" | "transcript" | "reward" = "all";
  unreadCount = 0;

  get filteredNotifications(): InAppNotification[] {
    if (this.selectedFilter === "all") return this.notifications;
    if (this.selectedFilter === "unread") return this.notifications.filter((n) => !n.read);
    return this.notifications.filter((n) => n.type === this.selectedFilter);
  }

  ngOnInit() {
    this.notificationService.notifications$
      .pipe(takeUntil(this.destroy$))
      .subscribe((notifications) => {
        this.notifications = notifications;
      });

    this.notificationService.unreadCount$
      .pipe(takeUntil(this.destroy$))
      .subscribe((count) => {
        this.unreadCount = count;
      });
  }

  async markAsRead(notification: InAppNotification) {
    if (notification.id) {
      await this.notificationService.markAsRead(notification.id);
    }
  }

  async markAllAsRead() {
    await this.notificationService.markAllAsRead();
  }

  async deleteNotification(notification: InAppNotification) {
    if (notification.id) {
      await this.notificationService.deleteNotification(notification.id);
    }
  }

  async clearAll() {
    if (confirm("Are you sure you want to clear all notifications?")) {
      await this.notificationService.clearAllNotifications();
    }
  }

  handleNotificationClick(notification: InAppNotification) {
    this.markAsRead(notification);
    if (notification.actionUrl) {
      window.location.href = notification.actionUrl;
    }
  }

  formatTime(timestamp: any): string {
    if (!timestamp) return "just now";
    const date = timestamp.toDate?.() || new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
