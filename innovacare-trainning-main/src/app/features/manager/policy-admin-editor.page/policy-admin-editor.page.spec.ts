import { ComponentFixture, TestBed } from '@angular/core/testing';

import { PolicyAdminEditorPage } from './policy-admin-editor.page';

describe('PolicyAdminEditorPage', () => {
  let component: PolicyAdminEditorPage;
  let fixture: ComponentFixture<PolicyAdminEditorPage>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PolicyAdminEditorPage]
    })
    .compileComponents();

    fixture = TestBed.createComponent(PolicyAdminEditorPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
