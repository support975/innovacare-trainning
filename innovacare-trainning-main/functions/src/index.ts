/* eslint max-len: ["error", { "code": 120, "ignoreUrls": true, "ignoreStrings":
true, "ignoreTemplateLiterals": true }] */
/* eslint-disable require-jsdoc */
/* functions/src/index.ts (Firebase Functions v2) */
import * as admin from "firebase-admin";
import {onCall, CallableRequest, HttpsError} from "firebase-functions/v2/https";
import {setGlobalOptions} from "firebase-functions/v2/options";
import {PDFDocument, StandardFonts} from "pdf-lib";
import {nanoid} from "nanoid";

/* ─────────── Init & global opts ─────────── */
admin.initializeApp();
const db = admin.firestore();
const storage = admin.storage();
// Set your region (or pass { region: 'us-central1' } per onCall below)
setGlobalOptions({region: "us-central1"});

/* ─────────── Helpers & types ─────────── */
const setEq = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x));

const nowTs = () => admin.firestore.FieldValue.serverTimestamp();

type GradeExamPayload = {
  courseId: string;
  examId: string;
  answers: Record<string, string[]>; // qid -> array of selected option ids
};

type QuestionDoc = {
  order?: number;
  prompt?: string;
  mode?: "single" | "multi";
  options?: Array<{ id: string; text: string }>;
  explanation?: string;
};

type ExamDoc = {
  title?: string;
  available?: boolean;
  pointsPerQuestion?: number;
  passPct?: number;
};

/* ─────────── Callable: gradeExam ───────────
   Reads questions from:
     /courses/{courseId}/exams/{examId}/questions/{qid}
   Reads correct answers from staff-only:
     /courses/{courseId}/exams/{examId}/answerKey/{qid}  -> { correctIds: string[] }
   Returns grading details and marks enrollment completed on pass.
*/
export const gradeExam = onCall(async (request: CallableRequest<GradeExamPayload>) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Sign in required.");

  const courseId = String(request.data?.courseId || "").trim();
  const examId = String(request.data?.examId || "").trim();
  const answers = (request.data?.answers ?? {}) as Record<string, string[]>;

  if (!courseId || !examId || typeof answers !== "object") {
    throw new HttpsError("invalid-argument", "courseId, examId, answers are required.");
  }

  // Load exam meta
  const examRef = db.doc(`courses/${courseId}/exams/${examId}`);
  const examSnap = await examRef.get();
  if (!examSnap.exists) throw new HttpsError("not-found", "Exam not found.");
  const exam = (examSnap.data() || {}) as ExamDoc;

  const passPct = typeof exam.passPct === "number" ? exam.passPct : 80;
  const pointsPer = typeof exam.pointsPerQuestion === "number" ? exam.pointsPerQuestion : 10;

  // Load questions (visible to learners)
  const qsSnap = await db
    .collection(`courses/${courseId}/exams/${examId}/questions`)
    .orderBy("order", "asc")
    .get();

  // Load answer key (staff-only; Admin SDK can read it)
  const keySnap = await db.collection(`courses/${courseId}/exams/${examId}/answerKey`).get();

  const keyMap = new Map<string, string[]>();
  keySnap.forEach((doc) => {
    const corr = doc.get("correctIds");
    keyMap.set(doc.id, Array.isArray(corr) ? corr : []);
  });

  let total = 0;
  let correct = 0;

  const details: Array<{
    id: string;
    order: number;
    prompt: string;
    your: string[];
    correct: string[];
    isCorrect: boolean;
    explanation?: string;
  }> = [];

  qsSnap.forEach((qdoc) => {
    const q = (qdoc.data() || {}) as QuestionDoc;
    const qid = qdoc.id;

    const your = Array.isArray(answers[qid]) ? answers[qid] : [];
    const correctIds = keyMap.get(qid) || [];

    total += 1;
    const ok = setEq([...your].sort(), [...correctIds].sort());
    if (ok) correct += 1;

    details.push({
      id: qid,
      order: typeof q.order === "number" ? q.order : total,
      prompt: typeof q.prompt === "string" ? q.prompt : "",
      your,
      correct: correctIds,
      isCorrect: ok,
      explanation: typeof q.explanation === "string" ? q.explanation : undefined,
    });
  });

  const percent = total ? Math.round((correct / total) * 100) : 0;
  const passed = percent >= passPct;

  // Mark completion on pass
  if (passed) {
    await db.doc(`users/${uid}/enrollments/${courseId}`).set(
      {
        status: "completed",
        completedAt: nowTs(),
      },
      {merge: true},
    );
  }

  return {
    courseId,
    examId,
    total,
    correct,
    percent,
    passPct,
    passed,
    pointsPerQuestion: pointsPer,
    details,
  };
});

/* ─────────── Certificate generator (helper) ───────────
   You can call it from another callable if you want certificates on pass.
*/
async function generateCertificate(
  uid: string,
  courseId: string,
  examId: string,
  scorePct: number,
) {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([612, 396]); // landscape small
  const font = await pdf.embedFont(StandardFonts.Helvetica);

  page.drawText("Certificate of Completion", {x: 170, y: 320, size: 20, font});
  page.drawText(`Awarded to: ${uid}`, {x: 60, y: 260, size: 14, font});
  page.drawText(`Course: ${courseId}`, {x: 60, y: 230, size: 12, font});
  page.drawText(`Exam: ${examId}   Score: ${scorePct}%`, {x: 60, y: 200, size: 12, font});

  const bytes = await pdf.save();
  const path = `certificates/${uid}_${courseId}_${Date.now()}.pdf`;
  const bucket = storage.bucket();
  const file = bucket.file(path);

  await file.save(Buffer.from(bytes), {contentType: "application/pdf"});
  const [url] = await file.getSignedUrl({
    action: "read",
    // 1 year
    expires: Date.now() + 1000 * 60 * 60 * 24 * 365,
  });

  const token = nanoid(12);
  const certRef = db.collection("certificates").doc();
  await certRef.set({
    id: certRef.id,
    uid,
    courseId,
    examId,
    issuedAt: admin.firestore.FieldValue.serverTimestamp(),
    scorePct,
    verifyToken: token,
    fileUrl: url,
  });

  return url;
}

/* ─────────── Optional callable: generateCertificateForResult ───────────
   Call this after a successful pass if you want a certificate URL.
*/
export const generateCertificateForResult = onCall(
  async (request: CallableRequest<{ courseId: string; examId: string; scorePct: number }>) => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "Sign in required.");

    const courseId = String(request.data?.courseId || "").trim();
    const examId = String(request.data?.examId || "").trim();
    const scorePct = Number(request.data?.scorePct ?? 0);

    if (!courseId || !examId) {
      throw new HttpsError("invalid-argument", "courseId, examId required.");
    }
    if (Number.isNaN(scorePct)) {
      throw new HttpsError("invalid-argument", "scorePct must be a number.");
    }

    const url = await generateCertificate(uid, courseId, examId, scorePct);
    return {url};
  },
);

/* ─────────── Optional: seed a demo course/exam ───────────
   Creates a small demo under /courses/demo-course/exams/demo-exam
*/
export const seedDemoData = onCall(async (request) => {
  if (!request.auth?.uid) throw new HttpsError("unauthenticated", "Sign in required.");
  const now = admin.firestore.FieldValue.serverTimestamp();

  const courseId = "demo-course";
  const examId = "demo-exam";

  await db.doc(`courses/${courseId}`).set(
    {
      title: "Demo Course",
      subtitle: "Sample",
      description: "Demo content for testing exam runner",
      lang: "EN",
      durationMin: 10,
      ceCredit: 0,
      active: true,
      kind: "Course",
      tags: ["demo"],
      createdAt: now,
      updatedAt: now,
    },
    {merge: true},
  );

  await db.doc(`courses/${courseId}/exams/${examId}`).set(
    {
      title: "Demo Exam",
      available: true,
      passPct: 80,
      pointsPerQuestion: 10,
      createdAt: now,
      updatedAt: now,
    },
    {merge: true},
  );

  await db.doc(`courses/${courseId}/exams/${examId}/questions/q1`).set(
    {
      order: 1,
      mode: "single",
      prompt: "2 + 2 = ?",
      options: [
        {id: "a", text: "3"},
        {id: "b", text: "4"},
        {id: "c", text: "5"},
      ],
      explanation: "Basic math 🙂",
      createdAt: now,
      updatedAt: now,
    },
    {merge: true},
  );

  await db
    .doc(`courses/${courseId}/exams/${examId}/answerKey/q1`)
    .set({correctIds: ["b"]}, {merge: true});

  return {ok: true, courseId, examId};
});
