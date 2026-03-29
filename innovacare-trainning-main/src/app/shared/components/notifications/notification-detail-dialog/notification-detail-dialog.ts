import {Component, HostBinding, inject, signal} from "@angular/core";
import {CommonModule, DatePipe} from "@angular/common";
import {Router} from "@angular/router";
import { NotificationService } from "../../../services/notification";


@Component({
  standalone: true,
  selector: "app-notification-detail-dialog",
  imports: [CommonModule, DatePipe],
  templateUrl: "./notification-detail-dialog.html",
  styleUrls: ["./notification-detail-dialog.css"],
})
export class NotificationDetailDialogComponent {
  private notifSvc = inject(NotificationService);
  private router = inject(Router);

  private _open = signal(false);
  n = signal<any | null>(null);

  @HostBinding("class.open") get opened() { return this._open(); }

  openWithItem(item: any) {
    this.n.set(item);
    this._open.set(true);
  }

  close() { this._open.set(false); }

  async markReadAndClose() {
    const item = this.n();
    if (item?.id) await this.notifSvc.markAsRead(item.id);
    this.close();
  }

  openLink(link: string) {
    this.close();
    // route interne si c'est "/learner/..."
    if (link.startsWith("/")) this.router.navigateByUrl(link);
    else window.open(link, "_blank");
  }
}
