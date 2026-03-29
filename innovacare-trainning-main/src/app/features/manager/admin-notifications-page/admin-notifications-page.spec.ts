import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AdminNotificationsPage } from './admin-notifications-page';

describe('AdminNotificationsPage', () => {
  let component: AdminNotificationsPage;
  let fixture: ComponentFixture<AdminNotificationsPage>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AdminNotificationsPage]
    })
    .compileComponents();

    fixture = TestBed.createComponent(AdminNotificationsPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
