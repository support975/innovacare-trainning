/* eslint max-len: ["error", { "code": 120, "ignoreUrls": true }] */
import * as admin from "firebase-admin";
import {onCall, CallableRequest, HttpsError} from "firebase-functions/v2/https";
import {onDocumentWritten} from "firebase-functions/v2/firestore";
import {nanoid} from "nanoid";

const db = admin.firestore();
const nowTs = () => admin.firestore.FieldValue.serverTimestamp();

const callableCors = [
  "https://www.innovacaretrainning.com",
  "https://innovacaretrainning.com",
  "https://innovacare-training.web.app",
  "https://innovacare-training.firebaseapp.com",
  "http://localhost:4200",
  "http://127.0.0.1:4200",
];

type ManualRewardType = "points" | "badge" | "credit_hours";

export interface GrantManualRewardInput {
  learnerUid: string;
  type: ManualRewardType;
  title: string;
  note?: string;
  points?: number;
  badge?: string;
  hours?: number;
  creditUnit?: string;
  licenseId?: string;
}

export interface GrantManualRewardResult {
  rewardId: string;
  awarded: boolean;
}

const MAX_POINTS = 5000;
const MAX_HOURS = 200;

/**
 * Manager/admin-initiated recognition: grants a one-off points, badge, or
 * continuing-education-hours reward to a learner. Writes the same
 * users/{uid}/rewards + users/{uid}/wallet/main shape the automatic rewards
 * engine (onCourseCompletedReward/onExamPassedReward in index.ts) uses, so it
 * shows up in the learner's existing /learner/rewards page unmodified.
 */
export const grantManualReward = onCall(
  {cors: callableCors},
  async (request: CallableRequest<GrantManualRewardInput>): Promise<GrantManualRewardResult> => {
    const actorUid = request.auth?.uid;
    if (!actorUid) {
      throw new HttpsError("unauthenticated", "Sign in required.");
    }

    const input = request.data || ({} as GrantManualRewardInput);
    const learnerUid = String(input.learnerUid || "").trim();
    const type = input.type;
    const title = String(input.title || "").trim();

    if (!learnerUid) {
      throw new HttpsError("invalid-argument", "learnerUid is required.");
    }
    if (!["points", "badge", "credit_hours"].includes(type)) {
      throw new HttpsError("invalid-argument", "Invalid reward type.");
    }
    if (!title) {
      throw new HttpsError("invalid-argument", "Title is required.");
    }

    const actorSnap = await db.doc(`users/${actorUid}`).get();
    if (!actorSnap.exists) {
      throw new HttpsError("permission-denied", "Manager profile not found.");
    }
    const actorRole = String(actorSnap.get("role") || "").trim();
    const actorOrgId = String(actorSnap.get("orgId") || "").trim();

    if (!["manager", "admin", "super_admin"].includes(actorRole)) {
      throw new HttpsError("permission-denied", "Manager or admin access required.");
    }

    const learnerSnap = await db.doc(`users/${learnerUid}`).get();
    if (!learnerSnap.exists) {
      throw new HttpsError("not-found", "Learner not found.");
    }

    const isSuperOrAdmin = ["admin", "super_admin"].includes(actorRole);
    if (!isSuperOrAdmin) {
      const learnerOrgId = String(learnerSnap.get("orgId") || "").trim();
      if (!actorOrgId || learnerOrgId !== actorOrgId) {
        throw new HttpsError("permission-denied", "You can only reward learners in your organization.");
      }
    }

    let points = 0;
    let badge: string | undefined;
    let hours: number | undefined;
    let creditUnit: string | undefined;
    let licenseId: string | undefined;

    if (type === "points") {
      points = Number(input.points || 0);
      if (!(points > 0 && points <= MAX_POINTS)) {
        throw new HttpsError("invalid-argument", `points must be between 1 and ${MAX_POINTS}.`);
      }
    } else if (type === "badge") {
      badge = String(input.badge || "").trim();
      if (!badge) {
        throw new HttpsError("invalid-argument", "badge is required.");
      }
      if (input.points !== undefined) {
        points = Number(input.points || 0);
        if (!(points >= 0 && points <= MAX_POINTS)) {
          throw new HttpsError("invalid-argument", `points must be between 0 and ${MAX_POINTS}.`);
        }
      }
    } else {
      hours = Number(input.hours || 0);
      if (!(hours > 0 && hours <= MAX_HOURS)) {
        throw new HttpsError("invalid-argument", `hours must be between 1 and ${MAX_HOURS}.`);
      }
      creditUnit = input.creditUnit ? String(input.creditUnit).trim() : undefined;
      licenseId = input.licenseId ? String(input.licenseId).trim() : undefined;
      if (licenseId) {
        const licenseSnap = await db.doc(`users/${learnerUid}/licenses/${licenseId}`).get();
        if (!licenseSnap.exists) {
          throw new HttpsError("not-found", "License not found for this learner.");
        }
      }
    }

    const note = input.note ? String(input.note).trim().slice(0, 500) : undefined;
    const rewardId = `manual_${nanoid()}`;
    const rewardRef = db.doc(`users/${learnerUid}/rewards/${rewardId}`);

    const rewardDoc: Record<string, unknown> = {
      type,
      title,
      courseId: "",
      points,
      grantedBy: actorUid,
      grantedByRole: actorRole,
      manual: true,
      issuedAt: nowTs(),
    };
    if (note) rewardDoc.note = note;
    if (badge) rewardDoc.badge = badge;
    if (hours !== undefined) rewardDoc.hours = hours;
    if (creditUnit) rewardDoc.creditUnit = creditUnit;
    if (licenseId) rewardDoc.licenseId = licenseId;

    let awarded = true;
    try {
      await rewardRef.create(rewardDoc);
    } catch (error) {
      const code = (error as {code?: number | string})?.code;
      if (code === 6 || code === "already-exists") {
        awarded = false;
      } else {
        throw error;
      }
    }

    if (awarded && points > 0) {
      await db.doc(`users/${learnerUid}/wallet/main`).set(
        {totalPoints: admin.firestore.FieldValue.increment(points), updatedAt: nowTs()},
        {merge: true},
      );
    }

    return {rewardId, awarded};
  },
);

/**
 * Maintains a privacy-safe, org-scoped leaderboard projection
 * (organizations/{orgId}/leaderboard/{uid} -- displayName + totalPoints only,
 * no PII) whenever a learner's wallet changes, regardless of which code path
 * changed it (automatic rewards engine or grantManualReward above). Learners
 * cannot read each other's users/{uid} or rewards/* docs -- this is the only
 * thing peer learners are ever allowed to see about a coworker.
 */
export const onWalletUpdated = onDocumentWritten(
  "users/{uid}/wallet/main",
  async (event) => {
    const uid = event.params.uid;
    const after = event.data?.after;
    if (!after?.exists) return;

    const totalPoints = Number(after.data()?.totalPoints || 0);

    const userSnap = await db.doc(`users/${uid}`).get();
    if (!userSnap.exists) return;

    const orgId = String(userSnap.get("orgId") || "").trim();
    if (!orgId) return; // individual learners have no org leaderboard

    const displayName = String(userSnap.get("displayName") || userSnap.get("email") || "Learner");

    await db.doc(`organizations/${orgId}/leaderboard/${uid}`).set(
      {displayName, totalPoints, updatedAt: nowTs()},
      {merge: true},
    );
  },
);

/**
 * One-time migration: the onWalletUpdated trigger above only fires on future
 * wallet writes, so it never backfills learners who already had points before
 * this feature existed. Run this once after deploying to seed the leaderboard
 * collection from existing wallet balances. Super admin only.
 */
export const backfillLeaderboardProjections = onCall(
  {cors: callableCors},
  async (request: CallableRequest<Record<string, never>>): Promise<{seeded: number}> => {
    const actorUid = request.auth?.uid;
    if (!actorUid) {
      throw new HttpsError("unauthenticated", "Sign in required.");
    }
    const actorSnap = await db.doc(`users/${actorUid}`).get();
    const actorRole = String(actorSnap.get("role") || "").trim();
    if (!["super_admin", "superAdmin"].includes(actorRole)) {
      throw new HttpsError("permission-denied", "Super admin access required.");
    }

    const usersSnap = await db.collection("users").get();
    let seeded = 0;

    for (const userDoc of usersSnap.docs) {
      const orgId = String(userDoc.get("orgId") || "").trim();
      if (!orgId) continue;

      const walletSnap = await db.doc(`users/${userDoc.id}/wallet/main`).get();
      if (!walletSnap.exists) continue;

      const totalPoints = Number(walletSnap.get("totalPoints") || 0);
      const displayName = String(userDoc.get("displayName") || userDoc.get("email") || "Learner");

      await db.doc(`organizations/${orgId}/leaderboard/${userDoc.id}`).set(
        {displayName, totalPoints, updatedAt: nowTs()},
        {merge: true},
      );
      seeded++;
    }

    return {seeded};
  },
);
