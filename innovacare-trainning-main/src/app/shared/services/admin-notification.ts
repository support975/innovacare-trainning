import {inject, Injectable} from "@angular/core";
import {Auth} from "@angular/fire/auth";
import {Firestore, collection, addDoc, serverTimestamp} from "@angular/fire/firestore";

type Role = "learner" | "nurse" | "staff" | "admin" | "manager";
type AudienceType = "all" | "role" | "user";
type Severity = "info" | "warning" | "critical";

export type CreateNotificationInput = {
  title: string;
  body: string;
  link?: string | null;
  severity?: Severity;
  audience:
    | {type: "all"}
    | {type: "role"; role: Role}
    | {type: "user"; uid: string};
};

@Injectable({providedIn: "root"})
export class AdminNotificationService {
  private afs = inject(Firestore);
  private auth = inject(Auth);

  async createNotification(input: CreateNotificationInput) {
    const user = this.auth.currentUser;
    if (!user) throw new Error("Not authenticated.");

    const title = (input.title || "").trim();
    const body = (input.body || "").trim();
    if (!title || !body) throw new Error("title/body required.");

    await addDoc(collection(this.afs, "notifications"), {
      title,
      body,
      link: (input.link || "").trim() || null,
      severity: input.severity ?? "info",
      audience: input.audience,
      createdAt: serverTimestamp(),
      createdBy: {uid: user.uid, name: user.displayName || ""},
    });

    return true;
  }
}
