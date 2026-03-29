import { TestBed } from '@angular/core/testing';

import { Enrollement } from './enrollement';

describe('Enrollement', () => {
  let service: Enrollement;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(Enrollement);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
