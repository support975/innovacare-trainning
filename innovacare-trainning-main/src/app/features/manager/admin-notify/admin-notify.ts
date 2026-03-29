import {Component, inject, signal, computed} from "@angular/core";
import {CommonModule} from "@angular/common";
import {FormsModule} from "@angular/forms";
import {Firestore, collection, collectionData, query, orderBy} from "@angular/fire/firestore";
import {Observable} from "rxjs";
import { AdminNotificationService } from "../../../shared/services/admin-notification";



type Role = "learner" | "nurse" | "staff" | "admin" | "manager";
type AudienceType = "all" | "role" | "user";
type Severity = "info" | "warning" | "critical";

type UserItem = {
  id: string;
  displayName?: string;
  email?: string;
  role?: string;
};

@Component({
  selector: 'app-admin-notify',
  imports: [CommonModule, FormsModule],
  templateUrl: './admin-notify.html',
  styleUrl: './admin-notify.css',
})
export class AdminNotify {
   private afs = inject(Firestore);
  private notif = inject(AdminNotificationService);

  // form
  title = signal("");
  body = signal("");
  link = signal("");
  severity = signal<Severity>("info");

  audienceType = signal<AudienceType>("role");
  audienceRole = signal<Role>("learner");
  audienceUid = signal<string>("");

  // user picker
  uQuery = signal("");
  selectedUser = signal<UserItem | null>(null);

  // ui
  busy = signal(false);
  notice = signal("");
  isError = signal(false);

  // users list
  users$ = collectionData(
    query(collection(this.afs, "users"), orderBy("displayName", "asc")),
    {idField: "id"},
  ) as Observable<UserItem[]>;

  users = signal<UserItem[]>([]);
  constructor() {
    // simple subscription without rxjs-interop (keeps it straightforward)
    this.users$.subscribe((list) => this.users.set(Array.isArray(list) ? list : []));
  }

  filteredUsers = computed(() => {
    const q = this.uQuery().toLowerCase().trim();
    const list = this.users();
    if (!q) return list.slice(0, 25);
    return list
      .filter((u) =>
        (u.displayName || "").toLowerCase().includes(q) ||
        (u.email || "").toLowerCase().includes(q) ||
        (u.id || "").toLowerCase().includes(q),
      )
      .slice(0, 25);
  });

  pickUser(u: UserItem) {
    this.selectedUser.set(u);
    this.audienceUid.set(u.id);
  }

  clearUser() {
    this.selectedUser.set(null);
    this.audienceUid.set("");
    this.uQuery.set("");
  }

  async send() {
    this.notice.set("");
    this.isError.set(false);
    this.busy.set(true);

    try {
      const t = this.title().trim();
      const b = this.body().trim();
      if (!t || !b) throw new Error("Title and body are required.");

      const type = this.audienceType();

      const audience =
        type === "all"
          ? {type: "all" as const}
          : type === "role"
            ? {type: "role" as const, role: this.audienceRole()}
            : {type: "user" as const, uid: this.audienceUid().trim()};

      if (audience.type === "user" && !audience.uid) {
        throw new Error("Please select a user (or provide UID).");
      }

      await this.notif.createNotification({
        title: t,
        body: b,
        link: this.link().trim() || null,
        severity: this.severity(),
        audience,
      });

      this.notice.set("Notification sent.");
      this.title.set("");
      this.body.set("");
      this.link.set("");
      this.severity.set("info");
      this.audienceType.set("role");
      this.audienceRole.set("learner");
      this.clearUser();
    } catch (e: unknown) {
      this.notice.set(e instanceof Error ? e.message : String(e));
      this.isError.set(true);
    } finally {
      this.busy.set(false);
    }
  }
}