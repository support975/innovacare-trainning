import { ComponentFixture, TestBed } from '@angular/core/testing';

import { NotificationBellPlain } from './notification-bell-plain';

describe('NotificationBellPlain', () => {
  let component: NotificationBellPlain;
  let fixture: ComponentFixture<NotificationBellPlain>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [NotificationBellPlain]
    })
    .compileComponents();

    fixture = TestBed.createComponent(NotificationBellPlain);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
