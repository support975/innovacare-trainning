import { TestBed } from '@angular/core/testing';
import { CanMatchFn } from '@angular/router';

import { examReadyGuard } from './exam-ready-guard';

describe('examReadyGuard', () => {
  const executeGuard: CanMatchFn = (...guardParameters) => 
      TestBed.runInInjectionContext(() => examReadyGuard(...guardParameters));

  beforeEach(() => {
    TestBed.configureTestingModule({});
  });

  it('should be created', () => {
    expect(executeGuard).toBeTruthy();
  });
});
