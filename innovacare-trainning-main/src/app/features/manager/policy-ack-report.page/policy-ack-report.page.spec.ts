import { ComponentFixture, TestBed } from '@angular/core/testing';

import { PolicyAckReportPage } from './policy-ack-report.page';

describe('PolicyAckReportPage', () => {
  let component: PolicyAckReportPage;
  let fixture: ComponentFixture<PolicyAckReportPage>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PolicyAckReportPage]
    })
    .compileComponents();

    fixture = TestBed.createComponent(PolicyAckReportPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
