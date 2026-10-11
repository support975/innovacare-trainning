import { firstValueFrom, Observable } from 'rxjs';
import { CoursesRepo } from './courses.repo';
import { Course } from './models';

describe('Organization course mapping resolution', () => {
  let repo: CoursesRepo;
  let load: jasmine.Spy;
  let mapped: (assignments: Array<{ courseId: string; active?: boolean }>) => Observable<Course[]>;

  beforeEach(() => {
    // Exercise mapping resolution without starting the repository's unrelated catalogue listeners.
    repo = Object.create(CoursesRepo.prototype) as CoursesRepo;
    load = spyOn(repo, 'load');
    mapped = (repo as any).loadMappedCourses.bind(repo);
  });

  it('keeps the assigned Firestore ID even if imported course data contains an empty ID', async () => {
    load.and.resolveTo({ id: '', title: 'Safety training', active: true });
    const rows = await firstValueFrom(mapped([{ courseId: 'course-a' }]));
    expect(rows[0].id).toBe('course-a');
    expect(rows[0].title).toBe('Safety training');
  });

  it('uses the assigned ID rather than an ID from another imported course', async () => {
    load.and.resolveTo({ id: 'old-import-id', title: 'Training', active: true });
    const rows = await firstValueFrom(mapped([{ courseId: 'course-a' }]));
    expect(rows[0].id).toBe('course-a');
  });

  it('ignores inactive mappings and loads duplicate active mappings only once', async () => {
    load.and.resolveTo({ title: 'Training', active: true });
    const rows = await firstValueFrom(mapped([
      { courseId: 'course-a' }, { courseId: 'course-a' }, { courseId: 'course-b', active: false },
    ]));
    expect(rows.length).toBe(1);
    expect(load).toHaveBeenCalledOnceWith('course-a');
  });

  it('omits deleted and inactive course documents', async () => {
    load.and.callFake((id: string) => Promise.resolve(id === 'deleted' ? null : { active: false }));
    const rows = await firstValueFrom(mapped([{ courseId: 'deleted' }, { courseId: 'inactive' }]));
    expect(rows).toEqual([]);
  });
});
