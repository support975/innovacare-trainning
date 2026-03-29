import { TestBed } from '@angular/core/testing';
import { Course } from '../../features/learner/courses/data/course';



describe('Course', () => {
  let service: Course;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(Course);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
