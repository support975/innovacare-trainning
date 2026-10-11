import fs from 'node:fs';
import assert from 'node:assert/strict';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import {
  collection, doc, getDoc, getDocs, query, setDoc, where,
  writeBatch, arrayUnion, arrayRemove,
} from 'firebase/firestore';

const emulator = new URL(`http://${process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080'}`);
const environment = await initializeTestEnvironment({
  projectId: 'innovacare-org-course-check',
  firestore: {
    host: emulator.hostname,
    port: Number(emulator.port),
    rules: fs.readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8'),
  },
});

try {
  await environment.clearFirestore();
  await environment.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    for (const [uid, role, orgId] of [
      ['super-a', 'super_admin', null], ['manager-a', 'manager', 'org-a'],
      ['admin-a', 'admin', 'org-a'], ['manager-b', 'manager', 'org-b'],
    ]) await setDoc(doc(db, 'users', uid), { uid, role, orgId, active: true });
    await setDoc(doc(db, 'courses', 'private-course'), {
      id: '', title: 'Assigned training', active: true, isPublic: false,
      assignedOrgIds: [], orgId: null,
    });
    await setDoc(doc(db, 'courses', 'mapped-only'), {
      title: 'Legacy training', active: true, isPublic: false,
    });
    await setDoc(doc(db, 'organizationCourseAssignments', 'org-a_mapped-only'), {
      orgId: 'org-a', courseId: 'mapped-only', active: true,
    });
    await setDoc(doc(db, 'courses', 'owned-course'), {
      title: 'Organization training', active: true, orgId: 'org-a',
    });
    await setDoc(doc(db, 'courses', 'public-course'), {
      title: 'Public training', active: true, isPublic: true,
    });
    await setDoc(doc(db, 'courses', 'invalid-list'), {
      title: 'Invalid grant', active: true, assignedOrgIds: { 'org-a': true },
    });
  });
  const superDb = environment.authenticatedContext('super-a').firestore();
  const managerDb = environment.authenticatedContext('manager-a').firestore();
  const adminDb = environment.authenticatedContext('admin-a').firestore();
  const otherDb = environment.authenticatedContext('manager-b').firestore();

  const grant = writeBatch(superDb);
  grant.set(doc(superDb, 'organizationCourseAssignments', 'org-a_private-course'), {
    orgId: 'org-a', courseId: 'private-course', active: true,
  });
  grant.update(doc(superDb, 'courses', 'private-course'), { assignedOrgIds: arrayUnion('org-a') });
  await assertSucceeds(grant.commit());
  for (const db of [managerDb, adminDb]) {
    await assertSucceeds(getDoc(doc(db, 'courses', 'private-course')));
    await assertSucceeds(getDoc(doc(db, 'courses', 'mapped-only')));
    const courses = await assertSucceeds(getDocs(query(
      collection(db, 'courses'), where('assignedOrgIds', 'array-contains', 'org-a')
    )));
    assert.equal(courses.size, 1);
    await assertSucceeds(getDocs(query(collection(db, 'courses'), where('orgId', '==', 'org-a'))));
    await assertSucceeds(getDocs(query(
      collection(db, 'organizationCourseAssignments'), where('orgId', '==', 'org-a')
    )));
  }
  await assertFails(getDoc(doc(otherDb, 'courses', 'private-course')));
  await assertFails(getDoc(doc(managerDb, 'courses', 'invalid-list')));
  await assertFails(getDocs(collection(managerDb, 'courses')));
  await assertFails(getDocs(query(
    collection(otherDb, 'organizationCourseAssignments'), where('orgId', '==', 'org-a')
  )));
  await assertFails(setDoc(doc(managerDb, 'organizationCourseAssignments', 'org-a_unauthorized'), {
    orgId: 'org-a', courseId: 'unauthorized', active: true,
  }));
  const publicCourses = await assertSucceeds(getDocs(query(
    collection(environment.unauthenticatedContext().firestore(), 'courses'),
    where('active', '==', true), where('isPublic', '==', true)
  )));
  assert.equal(publicCourses.size, 1);

  const failedGrant = writeBatch(superDb);
  failedGrant.set(doc(superDb, 'organizationCourseAssignments', 'org-a_missing'), {
    orgId: 'org-a', courseId: 'missing', active: true,
  });
  failedGrant.update(doc(superDb, 'courses', 'missing'), { assignedOrgIds: arrayUnion('org-a') });
  await assert.rejects(failedGrant.commit(), error => error.code === 'not-found');
  assert.equal((await getDoc(doc(superDb, 'organizationCourseAssignments', 'org-a_missing'))).exists(), false);

  const revoke = writeBatch(superDb);
  revoke.delete(doc(superDb, 'organizationCourseAssignments', 'org-a_private-course'));
  revoke.update(doc(superDb, 'courses', 'private-course'), { assignedOrgIds: arrayRemove('org-a') });
  await assertSucceeds(revoke.commit());
  await assertFails(getDoc(doc(managerDb, 'courses', 'private-course')));
  console.log('PASS: organization catalogue, legacy/public reads, atomic grant/revoke and rollback, tenant isolation.');
} finally {
  await environment.cleanup();
}
