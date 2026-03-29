import {Component, inject, signal, computed} from "@angular/core";
import {CommonModule} from "@angular/common";
import {toSignal} from "@angular/core/rxjs-interop";
import {Observable, map, startWith} from "rxjs";

import {NotificationDetailDialogComponent} from "../notification-detail-dialog/notification-detail-dialog";
import { NotificationService } from "../../../services/notification";


export type AppNotification = {
  id: string;
  title?: string;
  body?: string;
  severity?: "info" | "warning" | "critical";
  isRead?: boolean;
  createdAt?: any;
};

@Component({
  standalone: true,
  selector: "app-notification-bell-plain",
  imports: [CommonModule, NotificationDetailDialogComponent],
  templateUrl: "./notification-bell-plain.html",
  styleUrls: ["./notification-bell-plain.css"],
})
export class NotificationBellPlainComponent {
  private notifSvc = inject(NotificationService);

  open = signal(false);

  // ✅ 1) On force un Observable<AppNotification[]> SANS undefined
  private unreadSafe$: Observable<AppNotification[]> = (this.notifSvc.unread$ as Observable<unknown>).pipe(
    map((v) => (Array.isArray(v) ? (v as AppNotification[]) : [])),
    startWith([] as AppNotification[]),
  );

  // ✅ 2) toSignal ne peut plus choisir la mauvaise surcharge
  unread = toSignal(this.unreadSafe$, {initialValue: [] as AppNotification[]});

  unreadCount = computed(() => this.unread().length);

  toggle() { this.open.set(!this.open()); }

  openDetail(n: AppNotification, dlg: NotificationDetailDialogComponent) {
    dlg.openWithItem(n as any);
    this.open.set(false);
  }
}
