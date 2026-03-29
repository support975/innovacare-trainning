import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ManagerShell } from './manager-shell';

describe('ManagerShell', () => {
  let component: ManagerShell;
  let fixture: ComponentFixture<ManagerShell>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ManagerShell]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ManagerShell);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
