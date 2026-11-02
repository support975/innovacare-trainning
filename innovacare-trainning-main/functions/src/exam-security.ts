/* eslint max-len: ["error", { "code": 120, "ignoreUrls": true }] */
/**
 * Official (blueprint) exam security.
 *
 * - Correct answers and explanations never live in the published
 *   examBlueprints/{id} document that candidates read. They are kept in
 *   examBlueprints/{id}/private/answerKey, readable only by the
 *   certification authority (see firestore.rules).
 * - submitBlueprintExam grades on the server against that key, writes the
 *   examAttempts record (clients can no longer create one) and marks the
 *   candidate's verification / application as completed in one transaction.
 * - onExamBlueprintWritten moves any answers that still reach a blueprint
 *   (older app versions, imports) into the private key.
 * - secureExamData is a one-time, super-admin-only migration for data that
 *   predates these rules.
 */
import * as admin from "firebase-admin";
import {onCall, CallableRequest, HttpsError} from "firebase-functions/v2/https";
import {onDocumentWritten} from "firebase-functions/v2/firestore";
import {
  AnswerKey, DocData, gradeBlueprintAnswers, normalizeAnswers, splitBlueprintQuestions, str,
} from "./exam-grading";

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

const answerKeyRef = (blueprintId: string) => db.doc(`examBlueprints/${blueprintId}/private/answerKey`);

// Move answers embedded in a blueprint document into its private key.
const secureBlueprint = async (blueprintId: string, data: DocData): Promise<boolean> => {
  const {publicQuestions, answers, changed} = splitBlueprintQuestions(data.questions);
  if (!changed) return false;
  await answerKeyRef(blueprintId).set(
    {orgId: data.orgId ?? null, answers, updatedAt: nowTs()},
    {merge: true},
  );
  await db.doc(`examBlueprints/${blueprintId}`).update({questions: publicQuestions});
  return true;
};

const loadAnswerKey = async (blueprintId: string): Promise<AnswerKey> => {
  const snap = await answerKeyRef(blueprintId).get();
  const answers = snap.exists ? snap.get("answers") : null;
  return answers && typeof answers === "object" ? answers as AnswerKey : {};
};

interface SubmitBlueprintExamPayload {
  blueprintId?: string;
  answers?: Record<string, unknown>;
  /** In-app certification application flow. */
  applicationId?: string;
  /** Kiosk or remote exam-session flow. */
  sessionId?: string;
  mode?: "kiosk" | "remote";
  proctoringViolations?: number;
}

export const submitBlueprintExam = onCall(
  {cors: callableCors, invoker: "public"},
  async (request: CallableRequest<SubmitBlueprintExamPayload>) => {
    const uid = request.auth?.uid;
    const provider = request.auth?.token?.firebase?.sign_in_provider;
    if (!uid || provider === "anonymous") {
      throw new HttpsError("unauthenticated", "Sign in as the candidate to submit this exam.");
    }

    const data = request.data || {};
    const blueprintId = str(data.blueprintId);
    const sessionId = str(data.sessionId);
    const applicationId = str(data.applicationId);
    if (!blueprintId) throw new HttpsError("invalid-argument", "blueprintId is required.");
    if (!!sessionId === !!applicationId) {
      throw new HttpsError("invalid-argument", "Provide either a sessionId or an applicationId.");
    }

    const blueprintSnap = await db.doc(`examBlueprints/${blueprintId}`).get();
    const blueprint = blueprintSnap.data();
    if (!blueprintSnap.exists || !blueprint || blueprint.status !== "published") {
      throw new HttpsError("failed-precondition", "This exam is not available.");
    }

    const grade = gradeBlueprintAnswers(blueprint, await loadAnswerKey(blueprintId), normalizeAnswers(data.answers));

    const userSnap = await db.doc(`users/${uid}`).get();
    const user = userSnap.data() || {};
    const violations = Math.max(0, Math.min(1000, Math.floor(Number(data.proctoringViolations) || 0)));
    const attemptRef = db.collection("examAttempts").doc();
    const attemptBase = {
      candidateUid: uid,
      candidateEmail: str(user.email) || null,
      candidateName: str(user.displayName) || str(user.email) || null,
      blueprintId,
      orgId: blueprint.orgId ?? null,
      score: grade.percent,
      passed: grade.passed,
      correctCount: grade.correct,
      totalQuestions: grade.total,
      details: grade.details,
      gradedBy: "server",
      completedAt: nowTs(),
    };

    if (sessionId) {
      const sessionRef = db.doc(`examSessions/${sessionId}`);
      const verificationRef = db.doc(`examSessions/${sessionId}/candidateVerifications/${uid}`);
      await db.runTransaction(async (tx) => {
        const [sessionSnap, verificationSnap] = await Promise.all([tx.get(sessionRef), tx.get(verificationRef)]);
        const session = sessionSnap.data();
        if (!sessionSnap.exists || !session) throw new HttpsError("not-found", "Exam session not found.");
        if (str(session.examId) && str(session.examId) !== blueprintId) {
          throw new HttpsError("failed-precondition", "This exam does not belong to that session.");
        }
        const verification = verificationSnap.data() || {};
        const enrolled = Array.isArray(session.enrolledCandidateIds) && session.enrolledCandidateIds.includes(uid);
        if (verification.examCompleted === true) {
          throw new HttpsError("already-exists", "You have already submitted this exam.");
        }
        if (verification.candidacyApproved === false) {
          throw new HttpsError("permission-denied", "Your candidacy was not approved for this session.");
        }
        if (!enrolled && verification.verified !== true) {
          throw new HttpsError("permission-denied", "You are not registered for this exam session.");
        }
        tx.set(attemptRef, {
          ...attemptBase,
          applicationId: null,
          sessionId,
          proctoringViolations: data.mode === "kiosk" ? 0 : violations,
          proctoringMode: data.mode === "kiosk" ? "onsite_kiosk" : "online_remote",
        });
        tx.set(verificationRef, {
          candidateUid: uid,
          verified: false,
          examCompleted: true,
          examCompletedAt: nowTs(),
          examAttemptId: attemptRef.id,
        }, {merge: true});
      });
      // Session candidates never see their score in the app; results are
      // published by the exam center.
      return {attemptId: attemptRef.id, resultsWithheld: true};
    }

    const applicationRef = db.doc(`candidateApplications/${applicationId}`);
    await db.runTransaction(async (tx) => {
      const appSnap = await tx.get(applicationRef);
      const application = appSnap.data();
      if (!appSnap.exists || !application || application.candidateUserId !== uid) {
        throw new HttpsError("permission-denied", "This exam is not available for your application.");
      }
      if (!["eligible", "approved_for_exam"].includes(String(application.status))) {
        throw new HttpsError("failed-precondition", "This exam is not available for your application.");
      }
      if (str(application.sessionId) && str(blueprint.certificationSessionId) &&
          str(application.sessionId) !== str(blueprint.certificationSessionId)) {
        throw new HttpsError("failed-precondition", "This exam does not belong to your certification session.");
      }
      tx.set(attemptRef, {
        ...attemptBase,
        applicationId,
        sessionId: null,
        proctoringViolations: violations,
        proctoringMode: "online_remote",
      });
      tx.update(applicationRef, {
        status: "exam_completed",
        examResult: {
          blueprintId,
          percent: grade.percent,
          passed: grade.passed,
          correct: grade.correct,
          total: grade.total,
          completedAt: Date.now(),
        },
        examCompletedAt: nowTs(),
        examAttemptId: attemptRef.id,
        updatedAt: nowTs(),
      });
    });

    return {
      attemptId: attemptRef.id,
      resultsWithheld: false,
      percent: grade.percent,
      passed: grade.passed,
      correct: grade.correct,
      total: grade.total,
      details: grade.details,
    };
  },
);

/** Keeps answers out of published blueprints, whatever wrote them. */
export const onExamBlueprintWritten = onDocumentWritten("examBlueprints/{blueprintId}", async (event) => {
  const blueprintId = String(event.params.blueprintId);
  const after = event.data?.after;
  if (!after?.exists) {
    // Blueprint deleted: remove its private answer key too.
    await answerKeyRef(blueprintId).delete().catch(() => undefined);
    return;
  }
  await secureBlueprint(blueprintId, after.data() || {});
});

const isSuperAdminUid = async (uid: string | undefined): Promise<boolean> => {
  if (!uid) return false;
  const role = (await db.doc(`users/${uid}`).get()).get("role");
  return role === "super_admin" || role === "superAdmin";
};

/**
 * One-time migration (safe to re-run) after deploying the exam security rules:
 * moves embedded answers into private keys and stamps orgId on exam attempts
 * and proctor records so organization staff keep seeing their own history.
 */
export const secureExamData = onCall(
  {cors: callableCors, timeoutSeconds: 540, memory: "512MiB"},
  async (request: CallableRequest<unknown>) => {
    if (!(await isSuperAdminUid(request.auth?.uid))) {
      throw new HttpsError("permission-denied", "Only a super admin can run this.");
    }

    const blueprintOrg = new Map<string, string | null>();
    let blueprintsSecured = 0;
    for (const snap of (await db.collection("examBlueprints").get()).docs) {
      const data = snap.data();
      blueprintOrg.set(snap.id, data.orgId ?? null);
      if (await secureBlueprint(snap.id, data)) blueprintsSecured++;
    }

    const sessionOrg = new Map<string, string | null>();
    const orgForSession = async (sessionId: string): Promise<string | null> => {
      if (!sessionOrg.has(sessionId)) {
        sessionOrg.set(sessionId, (await db.doc(`examSessions/${sessionId}`).get()).get("orgId") ?? null);
      }
      return sessionOrg.get(sessionId) ?? null;
    };

    const writer = db.bulkWriter();
    let attemptsStamped = 0;
    for (const snap of (await db.collection("examAttempts").get()).docs) {
      const data = snap.data();
      if (data.orgId) continue;
      const orgId = (data.blueprintId && blueprintOrg.get(String(data.blueprintId))) ||
        (data.sessionId ? await orgForSession(String(data.sessionId)) : null);
      if (!orgId) continue;
      writer.update(snap.ref, {orgId});
      attemptsStamped++;
    }

    let proctorRecordsStamped = 0;
    for (const collectionName of ["proctorVerifications", "proctorAuditLogs"]) {
      for (const snap of (await db.collection(collectionName).get()).docs) {
        const data = snap.data();
        if (data.orgId || !data.sessionId) continue;
        const orgId = await orgForSession(String(data.sessionId));
        if (!orgId) continue;
        writer.update(snap.ref, {orgId});
        proctorRecordsStamped++;
      }
    }
    await writer.close();

    return {blueprintsSecured, attemptsStamped, proctorRecordsStamped};
  },
);
