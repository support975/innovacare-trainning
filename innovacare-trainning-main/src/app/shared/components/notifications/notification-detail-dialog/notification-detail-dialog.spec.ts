import { ComponentFixture, TestBed } from '@angular/core/testing';

import { NotificationDetailDialog } from './notification-detail-dialog';

describe('NotificationDetailDialog', () => {
  let component: NotificationDetailDialog;
  let fixture: ComponentFixture<NotificationDetailDialog>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [NotificationDetailDialog]
    })
    .compileComponents();

    fixture = TestBed.createComponent(NotificationDetailDialog);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
