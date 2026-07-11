import {Component, inject, signal, computed, OnInit} from "@angular/core";
import {CommonModule} from "@angular/common";
import {RouterModule} from "@angular/router";
import {toSignal} from "@angular/core/rxjs-interop";

import {NotificationService} from "../../../services/notification.service";

@Component({
  standalone: true,
  selector: "app-notification-bell-plain",
  imports: [CommonModule, RouterModule],
  templateUrl: "./notification-bell-plain.html",
  styleUrls: ["./notification-bell-plain.css"],
})
export class NotificationBellPlainComponent implements OnInit {
  private notificationService = inject(NotificationService);

  open = signal(false);
  unread = toSignal(this.notificationService.notifications$.pipe(), {
    initialValue: [],
  });
  unreadCount = computed(() => this.unread().filter((n) => !n.read).length);

  ngOnInit() {
    this.notificationService.initializeNotifications();
  }

  toggle() {
    this.open.set(!this.open());
  }

  openDetail(id: string | undefined) {
    if (id) {
      this.notificationService.markAsRead(id);
    }
    this.open.set(false);
  }

  navigateTo(actionUrl?: string) {
    if (actionUrl) {
      window.location.href = actionUrl;
      this.open.set(false);
    }
  }
}
