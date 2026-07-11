import fs from 'node:fs';
import {
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  where,
} from 'firebase/firestore';

const projectId = 'innovacare-policy-rules-test';
const orgId = 'org-a';
const uid = 'learner-a';
const policyId = 'policy-a';
const assignmentId = `${policyId}_${uid}`;

const environment = await initializeTestEnvironment({
  projectId,
  firestore: {
    host: '127.0.0.1',
    port: 8080,
    rules: fs.readFileSync('firestore.rules', 'utf8'),
  },
});

try {
  await environment.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    await setDoc(doc(db, `users/${uid}`), {
      uid,
      role: 'learner',
      orgId,
      accountType: 'organization',
      active: true,
    });
    await setDoc(doc(db, `organizations/${orgId}`), { id: orgId });
    await setDoc(doc(db, `organizations/${orgId}/policies/${policyId}`), {
      id: policyId,
      orgId,
      scope: 'organization',
      status: 'active',
      title: 'Patient Rights',
      version: '1.0',
      requiresAcknowledgement: true,
    });
    await setDoc(doc(db, `organizations/${orgId}/policyAssignments/${assignmentId}`), {
      id: assignmentId,
      orgId,
      policyId,
      userId: uid,
      active: true,
    });
  });

  const learnerDb = environment.authenticatedContext(uid).firestore();
  const assignmentsQuery = query(
    collection(learnerDb, `organizations/${orgId}/policyAssignments`),
    where('userId', '==', uid),
    where('active', '==', true),
  );

  await assertSucceeds(getDocs(assignmentsQuery));
  await assertSucceeds(getDoc(doc(learnerDb, `organizations/${orgId}/policies/${policyId}`)));
  await assertSucceeds(getDoc(doc(
    learnerDb,
    `organizations/${orgId}/policyAcknowledgements/${assignmentId}`,
  )));
  await assertSucceeds(setDoc(doc(
    learnerDb,
    `organizations/${orgId}/policyAcknowledgements/${assignmentId}`,
  ), {
    id: assignmentId,
    orgId,
    policyId,
    policyVersion: '1.0',
    userId: uid,
    acknowledgedAt: new Date(),
  }));

  console.log('PASS: learner can list assignments, read assigned policy, check and create acknowledgement.');
} finally {
  await environment.cleanup();
}
