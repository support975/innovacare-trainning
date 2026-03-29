import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CoursesEditor } from './courses-editor';

describe('CoursesEditor', () => {
  let component: CoursesEditor;
  let fixture: ComponentFixture<CoursesEditor>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CoursesEditor]
    })
    .compileComponents();

    fixture = TestBed.createComponent(CoursesEditor);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
