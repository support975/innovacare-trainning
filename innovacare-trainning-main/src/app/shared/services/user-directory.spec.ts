import { TestBed } from '@angular/core/testing';

import { UserDirectory } from './user-directory';

describe('UserDirectory', () => {
  let service: UserDirectory;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(UserDirectory);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
