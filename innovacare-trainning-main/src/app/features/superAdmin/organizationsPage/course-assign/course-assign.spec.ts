import { computed, signal } from '@angular/core';
import { CourseAssign } from './course-assign';
import { Courses } from '../../../manager/courses/courses';

describe('Inactive imported course assignments', () => {
  let component: CourseAssign;
  let assign: jasmine.Spy;
  let confirm: jasmine.Spy;

  beforeEach(() => {
    // Exercise actions without starting catalogue listeners or requiring authentication.
    component = Object.create(CourseAssign.prototype);
    assign = jasmine.createSpy('assignCourseToOrganization').and.resolveTo('org-a_course-a');
    Object.assign(component, {
      orgSvc: { assignCourseToOrganization: assign },
      lang: { t: (key: string) => key },
      busy: signal(false), syncing: signal(false), notice: signal(''), isError: signal(false),
      selectedOrg: signal('org-a'), selectedCourse: signal('course-a'),
      selectedOrgName: () => 'Organization A', selectedCourseName: () => 'Training',
      selectedCourseAlreadyAssigned: () => false,
      courses: signal([{ id: 'course-a', title: 'Training', active: false }]),
    });
    component.selectedCourseInactive = computed(() => component.courseInactive(component.selectedCourse()));
    confirm = spyOn(window, 'confirm').and.returnValue(true);
  });

  it('requires confirmation and explicitly activates an inactive course when assigning it', async () => {
    await component.assign();
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(assign).toHaveBeenCalledOnceWith({ orgId: 'org-a', courseId: 'course-a', activateCourse: true });
    expect(component.busy()).toBeFalse();
    expect(component.selectedCourse()).toBe('');
  });

  it('leaves a draft and its assignment untouched when activation is cancelled', async () => {
    confirm.and.returnValue(false);
    await component.assign();
    expect(assign).not.toHaveBeenCalled();
    expect(component.selectedCourse()).toBe('course-a');
  });

  it('assigns an active course without an activation confirmation', async () => {
    (component.courses as any).set([{ id: 'course-a', active: true }]);
    await component.assign();
    expect(confirm).not.toHaveBeenCalled();
    expect(assign).toHaveBeenCalledOnceWith({ orgId: 'org-a', courseId: 'course-a', activateCourse: false });
  });

  it('activates an existing assignment using that row, not the current course selection', async () => {
    component.selectedCourse.set('other-course');
    await component.activateAssignedCourse({ orgId: 'org-b', courseId: 'course-a' });
    expect(assign).toHaveBeenCalledOnceWith({ orgId: 'org-b', courseId: 'course-a', activateCourse: true });
    expect(component.selectedCourse()).toBe('other-course');
  });

  it('does not submit another assignment while a write is in progress', async () => {
    component.busy.set(true);
    await component.assign();
    await component.activateAssignedCourse({ orgId: 'org-a', courseId: 'course-a' });
    expect(assign).not.toHaveBeenCalled();
    expect(confirm).not.toHaveBeenCalled();
  });

  it('preserves the selection and displays a failed activation', async () => {
    assign.and.rejectWith(new Error('Write failed'));
    await component.assign();
    expect(component.isError()).toBeTrue();
    expect(component.notice()).toBe('Write failed');
    expect(component.busy()).toBeFalse();
    expect(component.selectedCourse()).toBe('course-a');
  });

  it('keeps an explicit draft flag from a docData JSON import', () => {
    const editor = Object.create(Courses.prototype);
    Object.assign(editor, { lang: { t: (key: string) => key }, courses: () => [] });
    const imported = (editor as any).normalizeImportedCourse({ docData: {
      title: 'Atypical Wounds, Dermatology & Skin Integrity',
      sections: [], active: false, isPublic: false,
    } });
    expect(imported.active).toBeFalse();
    expect(imported.isPublic).toBeFalse();
  });
});
