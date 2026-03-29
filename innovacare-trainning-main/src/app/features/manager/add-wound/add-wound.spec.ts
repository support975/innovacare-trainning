import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AddWound } from './add-wound';

describe('AddWound', () => {
  let component: AddWound;
  let fixture: ComponentFixture<AddWound>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AddWound]
    })
    .compileComponents();

    fixture = TestBed.createComponent(AddWound);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
