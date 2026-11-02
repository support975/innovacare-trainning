// Security-rules tests for the exam / multi-tenant fixes.
// Run inside the emulators, e.g.:
//   npx firebase-tools emulators:exec --project demo-innovacare --only firestore,storage \
//     "node tools/test-exam-security-rules.mjs"
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import {
  addDoc, collection, collectionGroup, doc, getDoc, getDocs, orderBy, query, serverTimestamp, setDoc, updateDoc, where,
} from 'firebase/firestore';
import { ref, uploadString, getBytes } from 'firebase/storage';

const projectId = process.env.GCLOUD_PROJECT || 'demo-innovacare';
const firestoreHost = new URL(`http://${process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080'}`);
const storageHostRaw = process.env.FIREBASE_STORAGE_EMULATOR_HOST || process.env.STORAGE_EMULATOR_HOST;
const storageHost = storageHostRaw ? new URL(storageHostRaw.startsWith('http') ? storageHostRaw : `http://${storageHostRaw}`) : null;

const environment = await initializeTestEnvironment({
  projectId,
  firestore: {
    host: firestoreHost.hostname,
    port: Number(firestoreHost.port),
    rules: fs.readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8'),
  },
  ...(storageHost
    ? {
        storage: {
          host: storageHost.hostname,
          port: Number(storageHost.port),
          rules: fs.readFileSync(new URL('../storage.rules', import.meta.url), 'utf8'),
        },
      }
    : {}),
});

let checks = 0;
const ok = async (label, promise) => {
  checks++;
  try {
    await assertSucceeds(promise);
  } catch (e) {
    throw new Error(`expected ALLOW: ${label}\n${e?.message ?? e}`);
  }
};
const denied = async (label, promise) => {
  checks++;
  try {
    await assertFails(promise);
  } catch (e) {
    throw new Error(`expected DENY: ${label}\n${e?.message ?? e}`);
  }
};

const USERS = [
  ['super', 'super_admin', null],
  ['admin-a', 'admin', 'org-a'],
  ['manager-a', 'manager', 'org-a'],
  ['proctor-a', 'proctor', 'org-a'],
  ['admin-b', 'admin', 'org-b'],
  ['proctor-b', 'proctor', 'org-b'],
  ['learner-a', 'learner', 'org-a'],
  ['learner-b', 'learner', 'org-b'],
  ['cand-1', 'learner', 'org-a'],
  ['cand-2', 'learner', 'org-a'],
];

try {
  await environment.clearFirestore();
  await environment.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    for (const [uid, role, orgId] of USERS) {
      await setDoc(doc(db, 'users', uid), { uid, role, orgId, email: `${uid}@example.com`, active: true });
    }
    for (const orgId of ['org-a', 'org-b']) {
      await setDoc(doc(db, 'organizations', orgId), { name: orgId, certificationAuthorityEnabled: true });
    }

    await setDoc(doc(db, 'examBlueprints', 'bp-a'), {
      orgId: 'org-a', status: 'published', title: 'Official exam', certificationSessionId: 'cs-1',
      passingScore: 70, pointsPerQuestion: 10,
      questions: [{ id: 'q1', order: 1, prompt: 'Q1', mode: 'single', options: [{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }] }],
    });
    await setDoc(doc(db, 'examBlueprints/bp-a/private/answerKey'), {
      orgId: 'org-a', answers: { q1: { correctAnswers: ['a'] } },
    });

    await setDoc(doc(db, 'examSessions', 'sess-a'), {
      orgId: 'org-a', examId: 'bp-a', enrolledCandidateIds: ['cand-1'],
    });
    await setDoc(doc(db, 'examSessions/sess-a/candidateVerifications/cand-1'), {
      candidateUid: 'cand-1', email: 'cand-1@example.com', verified: true, examCompleted: false,
    });
    await setDoc(doc(db, 'examSessions/sess-a/candidateVerifications/cand-2'), {
      candidateUid: 'cand-2', email: 'cand-2@example.com', verified: true, examCompleted: false,
    });

    await setDoc(doc(db, 'examAttempts', 'att-a'), {
      orgId: 'org-a', candidateUid: 'cand-1', sessionId: 'sess-a', blueprintId: 'bp-a',
      score: 50, passed: false, completedAt: new Date(),
    });

    await setDoc(doc(db, 'users/learner-a/enrollments/course-1'), { orgId: 'org-a', uid: 'learner-a', status: 'started' });
    await setDoc(doc(db, 'users/learner-a/examSubmissions/sub-1'), { uid: 'learner-a', status: 'graded' });
    await setDoc(doc(db, 'certificates', 'cert-a'), { uid: 'learner-a', courseId: 'course-1' });

    await setDoc(doc(db, 'candidateApplications', 'app-1'), {
      organizationId: 'org-a', candidateUserId: 'cand-1', status: 'eligible', sessionId: 'cs-1',
    });

    await setDoc(doc(db, 'proctorVerifications', 'pv-a'), {
      orgId: 'org-a', sessionId: 'sess-a', candidateUid: 'cand-1', verified: true, verifiedAt: new Date(),
    });
  });

  const as = (uid, claims) => environment.authenticatedContext(uid, claims).firestore();
  const kiosk = environment.authenticatedContext('kiosk-station', { firebase: { sign_in_provider: 'anonymous' } }).firestore();
  const superDb = as('super');
  const adminA = as('admin-a');
  const managerA = as('manager-a');
  const proctorA = as('proctor-a');
  const adminB = as('admin-b');
  const proctorB = as('proctor-b');
  const learnerA = as('learner-a');
  const cand1 = as('cand-1');
  const cand2 = as('cand-2');

  // ── 1. Answer keys are private ────────────────────────────────────────────
  await ok('candidate reads a published blueprint', getDoc(doc(cand1, 'examBlueprints/bp-a')));
  await denied('candidate reads the answer key', getDoc(doc(cand1, 'examBlueprints/bp-a/private/answerKey')));
  await denied('kiosk station reads the answer key', getDoc(doc(kiosk, 'examBlueprints/bp-a/private/answerKey')));
  await ok('certification authority reads its answer key', getDoc(doc(adminA, 'examBlueprints/bp-a/private/answerKey')));
  await denied('another org reads the answer key', getDoc(doc(adminB, 'examBlueprints/bp-a/private/answerKey')));
  await ok('certification authority writes its answer key',
    setDoc(doc(adminA, 'examBlueprints/bp-a/private/answerKey'), { orgId: 'org-a', answers: { q1: { correctAnswers: ['b'] } } }, { merge: true }));
  await denied('another org writes the answer key',
    setDoc(doc(adminB, 'examBlueprints/bp-a/private/answerKey'), { orgId: 'org-b', answers: {} }, { merge: true }));

  // ── 2. Exam attempts are server-written and org-scoped ────────────────────
  await denied('candidate creates their own (forged) attempt',
    addDoc(collection(cand1, 'examAttempts'), { candidateUid: 'cand-1', orgId: 'org-a', score: 100, passed: true }));
  await denied('kiosk creates a session attempt',
    addDoc(collection(kiosk, 'examAttempts'), { candidateUid: 'cand-2', sessionId: 'sess-a', score: 100, passed: true }));
  await ok('candidate reads own attempt', getDoc(doc(cand1, 'examAttempts/att-a')));
  await denied('another candidate reads the attempt', getDoc(doc(cand2, 'examAttempts/att-a')));
  await ok('org admin reads own org attempt', getDoc(doc(adminA, 'examAttempts/att-a')));
  await ok('org proctor reads own org attempt', getDoc(doc(proctorA, 'examAttempts/att-a')));
  await denied('other org admin reads the attempt', getDoc(doc(adminB, 'examAttempts/att-a')));
  await ok('org staff list own org attempts',
    getDocs(query(collection(adminA, 'examAttempts'), where('orgId', '==', 'org-a'), orderBy('completedAt', 'desc'))));
  await denied('org staff list all attempts', getDocs(query(collection(adminA, 'examAttempts'), orderBy('completedAt', 'desc'))));
  await ok('manager publishes a result', updateDoc(doc(managerA, 'examAttempts/att-a'), { resultPublishedAt: serverTimestamp() }));
  await denied('manager changes a score', updateDoc(doc(managerA, 'examAttempts/att-a'), { score: 100, passed: true }));
  await denied('other org manages the attempt', updateDoc(doc(adminB, 'examAttempts/att-a'), { resultPublishedAt: serverTimestamp() }));

  // ── 3. Candidate verifications are not public ─────────────────────────────
  await denied('kiosk station reads a candidate record', getDoc(doc(kiosk, 'examSessions/sess-a/candidateVerifications/cand-1')));
  await denied('kiosk station lists candidates', getDocs(collection(kiosk, 'examSessions/sess-a/candidateVerifications')));
  await denied('unauthenticated read',
    getDoc(doc(environment.unauthenticatedContext().firestore(), 'examSessions/sess-a/candidateVerifications/cand-1')));
  await ok('candidate reads own record', getDoc(doc(cand1, 'examSessions/sess-a/candidateVerifications/cand-1')));
  await denied('candidate reads another record', getDoc(doc(cand2, 'examSessions/sess-a/candidateVerifications/cand-1')));
  await denied('candidate locks out another candidate',
    setDoc(doc(cand2, 'examSessions/sess-a/candidateVerifications/cand-1'), { verified: false, examCompleted: true }, { merge: true }));
  await denied('kiosk locks out a candidate',
    setDoc(doc(kiosk, 'examSessions/sess-a/candidateVerifications/cand-1'), { verified: false, examCompleted: true }, { merge: true }));
  await denied('candidate marks own exam completed',
    setDoc(doc(cand1, 'examSessions/sess-a/candidateVerifications/cand-1'), { verified: false, examCompleted: true }, { merge: true }));
  await ok('org proctor lists session candidates', getDocs(collection(proctorA, 'examSessions/sess-a/candidateVerifications')));
  await denied('other org proctor lists session candidates', getDocs(collection(proctorB, 'examSessions/sess-a/candidateVerifications')));
  await ok('org proctor verifies a candidate',
    setDoc(doc(proctorA, 'examSessions/sess-a/candidateVerifications/cand-2'), { verified: true, examCompleted: false }, { merge: true }));
  await ok('member self-registers (unverified)',
    setDoc(doc(learnerA, 'examSessions/sess-a/candidateVerifications/learner-a'),
      { candidateUid: 'learner-a', verified: false, examCompleted: false }));
  await denied('member self-approves candidacy',
    setDoc(doc(learnerA, 'examSessions/sess-a/candidateVerifications/learner-a'),
      { candidateUid: 'learner-a', verified: false, examCompleted: false, candidacyApproved: true }));

  // Rule agreements: written by the signed-in candidate themselves.
  await ok('candidate records own rule agreement',
    addDoc(collection(cand1, 'examSessions/sess-a/ruleAgreements'), { candidateUid: 'cand-1', agreedAt: serverTimestamp() }));
  await denied('candidate records an agreement for someone else',
    addDoc(collection(cand1, 'examSessions/sess-a/ruleAgreements'), { candidateUid: 'cand-2' }));
  await denied('kiosk station records an agreement',
    addDoc(collection(kiosk, 'examSessions/sess-a/ruleAgreements'), { candidateUid: 'cand-1' }));
  await ok('org proctor reads agreements', getDocs(collection(proctorA, 'examSessions/sess-a/ruleAgreements')));
  await denied('other org proctor reads agreements', getDocs(collection(proctorB, 'examSessions/sess-a/ruleAgreements')));

  // Proctor verification log: org-scoped, must be queried by orgId.
  await ok('org proctor queries own org verifications',
    getDocs(query(collection(proctorA, 'proctorVerifications'), where('orgId', '==', 'org-a'), where('sessionId', '==', 'sess-a'))));
  await denied('other org proctor reads a verification', getDoc(doc(proctorB, 'proctorVerifications/pv-a')));
  await ok('org proctor logs a verification',
    addDoc(collection(proctorA, 'proctorVerifications'), { orgId: 'org-a', sessionId: 'sess-a', candidateUid: 'cand-2', verified: true }));
  await denied('other org proctor logs a verification for the session',
    addDoc(collection(proctorB, 'proctorVerifications'), { orgId: 'org-b', sessionId: 'sess-a', candidateUid: 'cand-2', verified: true }));
  await denied('candidate reads the verification log', getDoc(doc(cand1, 'proctorVerifications/pv-a')));

  // ── 4. Organization admins are scoped to their own organization ───────────
  await ok('org admin lists own org learners',
    getDocs(query(collection(adminA, 'users'), where('orgId', '==', 'org-a'), where('role', '==', 'learner'))));
  await ok('org manager lists own org learners',
    getDocs(query(collection(managerA, 'users'), where('orgId', '==', 'org-a'))));
  await denied('org admin lists another org', getDocs(query(collection(adminA, 'users'), where('orgId', '==', 'org-b'))));
  await denied('org admin lists all users', getDocs(collection(adminA, 'users')));
  await ok('org manager lists own org enrollments (collection group)',
    getDocs(query(collectionGroup(managerA, 'enrollments'), where('orgId', '==', 'org-a'))));
  await denied('org manager lists all enrollments', getDocs(collectionGroup(managerA, 'enrollments')));
  await ok('org admin reads own org learner', getDoc(doc(adminA, 'users/learner-a')));
  await denied('org admin reads another org learner', getDoc(doc(adminA, 'users/learner-b')));
  await denied('other org admin reads the learner', getDoc(doc(adminB, 'users/learner-a')));
  await denied('org admin promotes themselves to super admin', updateDoc(doc(adminA, 'users/admin-a'), { role: 'super_admin' }));
  await denied('org admin edits a learner profile directly', updateDoc(doc(adminA, 'users/learner-a'), { role: 'admin' }));
  await ok('org admin reads own org enrollment', getDoc(doc(adminA, 'users/learner-a/enrollments/course-1')));
  await denied('other org admin reads the enrollment', getDoc(doc(adminB, 'users/learner-a/enrollments/course-1')));
  await ok('org admin reads own org exam submission', getDoc(doc(adminA, 'users/learner-a/examSubmissions/sub-1')));
  await denied('other org admin reads the exam submission', getDoc(doc(adminB, 'users/learner-a/examSubmissions/sub-1')));
  await denied('org admin reads certificates platform-wide', getDoc(doc(adminB, 'certificates/cert-a')));
  await ok('learner reads own certificate', getDoc(doc(learnerA, 'certificates/cert-a')));
  await ok('super admin reads any certificate', getDoc(doc(superDb, 'certificates/cert-a')));
  await denied('org admin issues a certificate', setDoc(doc(adminA, 'certificates/forged'), { uid: 'learner-a' }));
  await ok('org admin reads own organization', getDoc(doc(adminA, 'organizations/org-a')));
  await denied('org admin reads another organization', getDoc(doc(adminA, 'organizations/org-b')));
  await ok('super admin reads any user', getDoc(doc(superDb, 'users/learner-b')));

  // ── 5. Exam results can't be self-reported on an application ─────────────
  await denied('candidate marks own application exam_completed',
    updateDoc(doc(cand1, 'candidateApplications/app-1'), { status: 'exam_completed', examResult: { passed: true, percent: 100 } }));
  await ok('candidate updates own renewal progress',
    updateDoc(doc(cand1, 'candidateApplications/app-1'), { renewalStatus: 'in_progress', updatedAt: serverTimestamp() }));

  console.log(`PASS (firestore): ${checks} checks — answer keys, attempts, verifications, org scoping, applications.`);

  // ── Storage ──────────────────────────────────────────────────────────────
  if (storageHost) {
    const st = (uid) => environment.authenticatedContext(uid).storage();
    const bytes = 'x';
    await environment.withSecurityRulesDisabled(async (context) => {
      const s = context.storage();
      await uploadString(ref(s, 'proctorVerifications/sess-a/id.jpg'), bytes);
      await uploadString(ref(s, 'onsiteExamDocs/sess-a/cand-1/id.pdf'), bytes);
      await uploadString(ref(s, 'candidateApplications/app-1/receipt.pdf'), bytes);
    });
    await ok('org proctor views an ID photo', getBytes(ref(st('proctor-a'), 'proctorVerifications/sess-a/id.jpg')));
    await denied('other org proctor views an ID photo', getBytes(ref(st('proctor-b'), 'proctorVerifications/sess-a/id.jpg')));
    await denied('other org admin uploads to the session', uploadString(ref(st('admin-b'), 'proctorVerifications/sess-a/x.jpg'), bytes));
    await ok('candidate views own onsite document', getBytes(ref(st('cand-1'), 'onsiteExamDocs/sess-a/cand-1/id.pdf')));
    await ok('org admin views onsite document', getBytes(ref(st('admin-a'), 'onsiteExamDocs/sess-a/cand-1/id.pdf')));
    await denied('other org admin views onsite document', getBytes(ref(st('admin-b'), 'onsiteExamDocs/sess-a/cand-1/id.pdf')));
    await denied('another candidate views onsite document', getBytes(ref(st('cand-2'), 'onsiteExamDocs/sess-a/cand-1/id.pdf')));
    await ok('applicant views own receipt', getBytes(ref(st('cand-1'), 'candidateApplications/app-1/receipt.pdf')));
    await ok('authority admin views receipt', getBytes(ref(st('admin-a'), 'candidateApplications/app-1/receipt.pdf')));
    await denied('other org admin views receipt', getBytes(ref(st('admin-b'), 'candidateApplications/app-1/receipt.pdf')));
    await denied('org admin uploads course materials', uploadString(ref(st('admin-a'), 'courseMaterials/course-1/x.pdf'), bytes));
    await ok('super admin uploads course materials', uploadString(ref(st('super'), 'courseMaterials/course-1/x.pdf'), bytes));
    console.log(`PASS (storage): exam documents and ID photos are organization-scoped. Total checks: ${checks}.`);
  } else {
    console.log('SKIP (storage): no storage emulator running.');
  }

  assert.ok(checks > 50);
} finally {
  await environment.cleanup();
}
