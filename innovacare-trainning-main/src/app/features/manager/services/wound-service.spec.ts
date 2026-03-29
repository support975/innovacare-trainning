import { TestBed } from '@angular/core/testing';

import { WoundService } from './wound-service';

describe('WoundService', () => {
  let service: WoundService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(WoundService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
