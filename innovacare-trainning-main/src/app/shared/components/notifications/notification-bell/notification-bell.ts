import {Component, inject, signal} from "@angular/core";
import {CommonModule} from "@angular/common";
import {Router, RouterModule} from "@angular/router";
import {toSignal} from "@angular/core/rxjs-interop";

import {MatButtonModule} from "@angular/material/button";
import {MatIconModule} from "@angular/material/icon";
import {MatMenuModule} from "@angular/material/menu";
import {MatBadgeModule} from "@angular/material/badge";
import {MatDividerModule} from "@angular/material/divider";
import {MatListModule} from "@angular/material/list";
import {MatProgressSpinnerModule} from "@angular/material/progress-spinner";
import {MatTooltipModule} from "@angular/material/tooltip";
import { AppNotification, NotificationService } from "../../../services/notification";



@Component({
  standalone: true,
  selector: "app-notification-bell",
  imports: [
    CommonModule,
    RouterModule,
    MatButtonModule,
    MatIconModule,
    MatMenuModule,
    MatBadgeModule,
    MatDividerModule,
    MatListModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
  ],
  templateUrl: "./notification-bell.html",
  styleUrls: ["./notification-bell.css"],
})
export class NotificationBell {
  private notifSvc = inject(NotificationService);
  private router = inject(Router);

  menuOpen = signal(false);

  // Visible notifications for current user (already filtered by role/audience)
  notifs = toSignal(this.notifSvc.visibleNotifications$(50), {initialValue: [] as AppNotification[]});
  unreadCount = toSignal(this.notifSvc.unreadCount$(50), {initialValue: 0});

  async openNotif(n: AppNotification) {
    await this.notifSvc.markAsRead(n.id);
    if (n.link) {
      await this.router.navigateByUrl(n.link);
    }
  }

  async markAllRead() {
    await this.notifSvc.markAllVisibleAsRead(this.notifs());
  }
}
