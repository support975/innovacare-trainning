import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ManagerSettings } from './manager-settings';

describe('ManagerSettings', () => {
  let component: ManagerSettings;
  let fixture: ComponentFixture<ManagerSettings>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ManagerSettings]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ManagerSettings);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
