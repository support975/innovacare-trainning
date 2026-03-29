import { ComponentFixture, TestBed } from '@angular/core/testing';

import { PolicyDetails } from './policy-details';

describe('PolicyDetails', () => {
  let component: PolicyDetails;
  let fixture: ComponentFixture<PolicyDetails>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PolicyDetails]
    })
    .compileComponents();

    fixture = TestBed.createComponent(PolicyDetails);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
