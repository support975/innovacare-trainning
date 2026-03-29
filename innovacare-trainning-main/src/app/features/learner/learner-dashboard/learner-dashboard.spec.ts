import { ComponentFixture, TestBed } from '@angular/core/testing';

import { LearnerDashboard } from './learner-dashboard';

describe('LearnerDashboard', () => {
  let component: LearnerDashboard;
  let fixture: ComponentFixture<LearnerDashboard>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LearnerDashboard]
    })
    .compileComponents();

    fixture = TestBed.createComponent(LearnerDashboard);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
