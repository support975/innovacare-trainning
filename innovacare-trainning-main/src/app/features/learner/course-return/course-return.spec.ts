import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CourseReturn } from './course-return';

describe('CourseReturn', () => {
  let component: CourseReturn;
  let fixture: ComponentFixture<CourseReturn>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CourseReturn]
    })
    .compileComponents();

    fixture = TestBed.createComponent(CourseReturn);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
