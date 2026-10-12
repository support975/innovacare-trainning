import { initializeTestEnvironment, RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, Firestore, getDoc, setDoc } from 'firebase/firestore';
import { SuperAdminOrganizationsService } from './super-admin-organizations';

describe('Organization course grant transaction (Firestore emulator)', () => {
  let environment: RulesTestEnvironment;
  let service: SuperAdminOrganizationsService;
  let db: Firestore;
  const runtime = globalThis as typeof globalThis & { process?: { env: Record<string, string> } };
  const originalProcess = runtime.process;

  beforeAll(async () => {
    // rules-unit-testing probes optional emulator environment variables even in a browser.
    runtime.process ??= { env: {} };
    environment = await initializeTestEnvironment({
      projectId: 'demo-course-activation-writes',
      firestore: {
        host: '127.0.0.1', port: 18080,
        rules: 'rules_version = "2"; service cloud.firestore { match /databases/{db}/documents/{path=**} { allow read, write: if request.auth != null; } }',
      },
    });
    db = environment.authenticatedContext('super-admin').firestore() as unknown as Firestore;
    service = Object.create(SuperAdminOrganizationsService.prototype);
    Object.assign(service, { afs: db, logs: { audit: async () => undefined } });
  }, 30000);

  beforeEach(async () => {
    await environment.clearFirestore();
    await setDoc(doc(db, 'courses', 'imported-course'), {
      title: 'Atypical Wounds, Dermatology & Skin Integrity',
      active: false, isPublic: false, assignedOrgIds: ['existing-org'],
      sections: [{ id: 'section-1', title: 'Original content', lessons: [] }],
    });
  }, 30000);

  afterAll(async () => {
    await environment?.cleanup();
    if (!originalProcess) delete runtime.process;
  }, 30000);

  it('rejects an inactive course without explicit activation and leaves no assignment', async () => {
    await expectAsync(service.assignCourseToOrganization({ orgId: 'org-a', courseId: 'imported-course' }))
      .toBeRejectedWithError('This course is inactive. Activate it before assigning it to an organization.');
    expect((await getDoc(doc(db, 'organizationCourseAssignments', 'org-a_imported-course'))).exists()).toBeFalse();
    expect((await getDoc(doc(db, 'courses', 'imported-course'))).data()?.['active']).toBeFalse();
  });

  it('activates and grants atomically without publishing, replacing content, or losing existing organizations', async () => {
    await service.assignCourseToOrganization({ orgId: 'org-a', courseId: 'imported-course', activateCourse: true });
    const course = (await getDoc(doc(db, 'courses', 'imported-course'))).data()!;
    const assignment = (await getDoc(doc(db, 'organizationCourseAssignments', 'org-a_imported-course'))).data()!;
    expect(course['active']).toBeTrue();
    expect(course['isPublic']).toBeFalse();
    expect(course['assignedOrgIds']).toEqual(['existing-org', 'org-a']);
    expect(course['sections']).toEqual([{ id: 'section-1', title: 'Original content', lessons: [] }]);
    expect(assignment['active']).toBeTrue();
    expect(assignment['courseId']).toBe('imported-course');
  });

  it('rejects a deleted course without creating an orphan assignment', async () => {
    await expectAsync(service.assignCourseToOrganization({ orgId: 'org-a', courseId: 'missing', activateCourse: true }))
      .toBeRejectedWithError('This course no longer exists.');
    expect((await getDoc(doc(db, 'organizationCourseAssignments', 'org-a_missing'))).exists()).toBeFalse();
  });

  it('repairs an existing inactive course grant and remains idempotent', async () => {
    await setDoc(doc(db, 'organizationCourseAssignments', 'org-a_imported-course'), {
      orgId: 'org-a', courseId: 'imported-course', active: true,
    });
    await service.assignCourseToOrganization({ orgId: 'org-a', courseId: 'imported-course', activateCourse: true });
    await service.assignCourseToOrganization({ orgId: 'org-a', courseId: 'imported-course' });
    const course = (await getDoc(doc(db, 'courses', 'imported-course'))).data()!;
    expect(course['assignedOrgIds']).toEqual(['existing-org', 'org-a']);
    expect(course['active']).toBeTrue();
    expect(course['isPublic']).toBeFalse();
  });
});
