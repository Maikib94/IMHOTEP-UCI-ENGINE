// tests/setup.ts
import '@testing-library/jest-dom/vitest';
import { beforeEach } from 'vitest';
import { mockOffscreenCanvas } from './helpers/mockOffscreenCanvas';
import { resetAllStores }      from './helpers/storeReset';

mockOffscreenCanvas();

beforeEach(() => {
  resetAllStores();
});
