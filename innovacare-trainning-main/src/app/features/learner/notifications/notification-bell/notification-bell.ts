import {Component, OnInit, inject} from "@angular/core";
import {CommonModule} from "@angular/common";
import {RouterModule} from "@angular/router";
import {NotificationService} from "../../../../shared/services/notification.service";

@Component({
  selector: "app-notification-bell",
  standalone: true,
  imports: [CommonModule, RouterModule],
  template: `
    <div class="notification-bell">
      <a routerLink="/learner/notifications" class="bell-button" [class.has-unread]="unreadCount > 0">
        <span class="bell-icon">🔔</span>
        <span class="unread-badge" *ngIf="unreadCount > 0">{{ unreadCount > 9 ? "9+" : unreadCount }}</span>
      </a>
    </div>
  `,
  styles: [`
    .notification-bell {
      position: relative;
    }

    .bell-button {
      position: relative;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 44px;
      height: 44px;
      border-radius: 12px;
      background: rgba(0, 167, 157, 0.1);
      border: 2px solid transparent;
      text-decoration: none;
      transition: all 0.3s ease;
      cursor: pointer;
    }

    .bell-button:hover {
      background: rgba(0, 167, 157, 0.2);
      border-color: #00a79d;
    }

    .bell-button.has-unread {
      background: rgba(239, 68, 68, 0.1);
      border-color: #ef4444;
    }

    .bell-button.has-unread:hover {
      background: rgba(239, 68, 68, 0.2);
    }

    .bell-icon {
      font-size: 20px;
    }

    .unread-badge {
      position: absolute;
      top: -8px;
      right: -8px;
      background: #ef4444;
      color: white;
      font-size: 10px;
      font-weight: 700;
      padding: 2px 6px;
      border-radius: 999px;
      min-width: 20px;
      text-align: center;
      border: 2px solid white;
      animation: pulse 2s infinite;
    }

    @keyframes pulse {
      0%, 100% {
        transform: scale(1);
      }
      50% {
        transform: scale(1.1);
      }
    }

    @media (max-width: 768px) {
      .bell-button {
        width: 40px;
        height: 40px;
      }

      .bell-icon {
        font-size: 18px;
      }
    }
  `],
})
export class NotificationBellComponent implements OnInit {
  private notificationService = inject(NotificationService);
  unreadCount = 0;

  ngOnInit() {
    this.notificationService.unreadCount$.subscribe((count) => {
      this.unreadCount = count;
    });
    this.notificationService.initializeNotifications();
  }
}
