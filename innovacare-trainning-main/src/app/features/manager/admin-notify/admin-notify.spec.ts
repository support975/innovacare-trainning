import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AdminNotify } from './admin-notify';

describe('AdminNotify', () => {
  let component: AdminNotify;
  let fixture: ComponentFixture<AdminNotify>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AdminNotify]
    })
    .compileComponents();

    fixture = TestBed.createComponent(AdminNotify);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
