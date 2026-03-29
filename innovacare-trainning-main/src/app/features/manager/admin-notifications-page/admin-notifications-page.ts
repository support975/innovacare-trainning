import {Component, inject, signal} from "@angular/core";
import {CommonModule} from "@angular/common";
import {FormsModule} from "@angular/forms";
import {Auth} from "@angular/fire/auth";
import {Firestore, addDoc, collection, serverTimestamp, query, orderBy, limit, collectionData} from "@angular/fire/firestore";
import {toSignal} from "@angular/core/rxjs-interop";

import {MatCardModule} from "@angular/material/card";
import {MatFormFieldModule} from "@angular/material/form-field";
import {MatInputModule} from "@angular/material/input";
import {MatSelectModule} from "@angular/material/select";
import {MatButtonModule} from "@angular/material/button";
import {MatDividerModule} from "@angular/material/divider";
import {MatListModule} from "@angular/material/list";
import { Observable } from "rxjs";

type Role = "learner" | "nurse" | "staff" | "admin" | "manager";
type AudienceType = "all" | "role" | "user";
type Severity = "info" | "warning" | "error" | "success";

@Component({
  standalone: true,
  selector: 'app-admin-notifications-page',
  imports: [ CommonModule,
    FormsModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    MatDividerModule,
    MatListModule,],
  templateUrl: './admin-notifications-page.html',
  styleUrl: './admin-notifications-page.css',
})
export class AdminNotificationsPage {
 private afs = inject(Firestore);
  private auth = inject(Auth);

  // Form state (signals)
  title = signal<string>("");
  body = signal<string>("");
  link = signal<string>("");
  severity = signal<Severity>("info");

  audienceType = signal<AudienceType>("all");
  audienceRole = signal<Role>("learner");
  audienceUid = signal<string>("");

  busy = signal<boolean>(false);
  notice = signal<string>("");

  // Recent notifications (typed)
  recent = toSignal<Notification[]>(
    (collectionData(
      query(collection(this.afs, "notifications"), orderBy("createdAt", "desc"), limit(20)),
      {idField: "id"},
    ) as unknown as Observable<Notification[]>),
  );

  async send() {
    this.notice.set("");
    this.busy.set(true);

    try {
      const user = this.auth.currentUser;
      if (!user) throw new Error("Not authenticated.");

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
        throw new Error("Audience UID is required for type=user.");
      }

      await addDoc(collection(this.afs, "notifications"), {
        title: t,
        body: b,
        link: this.link().trim() || null,
        severity: this.severity(),
        audience,
        createdAt: serverTimestamp(),
        createdBy: {uid: user.uid, name: user.displayName || ""},
      });

      this.notice.set("Notification sent.");

      // reset
      this.title.set("");
      this.body.set("");
      this.link.set("");
      this.audienceUid.set("");
      this.audienceType.set("all");
      this.audienceRole.set("learner");
      this.severity.set("info");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      this.notice.set(msg || "Failed to send notification.");
    } finally {
      this.busy.set(false);
    }
  }
}