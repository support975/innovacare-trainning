import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CourseExam } from './course-exam';

describe('CourseExam', () => {
  let component: CourseExam;
  let fixture: ComponentFixture<CourseExam>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CourseExam]
    })
    .compileComponents();

    fixture = TestBed.createComponent(CourseExam);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
