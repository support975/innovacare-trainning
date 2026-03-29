import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ExamRunner } from './exam-runner';

describe('ExamRunner', () => {
  let component: ExamRunner;
  let fixture: ComponentFixture<ExamRunner>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ExamRunner]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ExamRunner);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
