import test from 'node:test';
import assert from 'node:assert/strict';

test('Hardware scanner buffer simulation: fast keystroke burst ending in Enter is recognized as scan', () => {
  let scannedBarcode: string | null = null;
  const bufferRef = { current: '' };
  const lastKeyTimeRef = { current: 0 };
  const maxDelay = 150;
  const minLength = 3;

  const simulateKeyPress = (char: string, timestamp: number) => {
    const timeSinceLast = timestamp - lastKeyTimeRef.current;
    lastKeyTimeRef.current = timestamp;

    if (char === 'Enter') {
      const code = bufferRef.current.trim();
      bufferRef.current = '';
      if (code.length >= minLength) {
        scannedBarcode = code;
      }
      return;
    }

    if (timeSinceLast > maxDelay && bufferRef.current.length > 0) {
      bufferRef.current = '';
    }

    if (char.length === 1) {
      bufferRef.current += char;
    }
  };

  // Simulate hardware scanner sending "7501000101010" with 10ms between chars
  const hardwareBarcode = '7501000101010';
  let t = 1000;
  for (const c of hardwareBarcode) {
    t += 10;
    simulateKeyPress(c, t);
  }
  t += 10;
  simulateKeyPress('Enter', t);

  assert.equal(scannedBarcode, '7501000101010');
});

test('Hardware scanner tolerates Android Bluetooth/USB jitter (70ms gap) without dropping buffer', () => {
  let scannedBarcode: string | null = null;
  const bufferRef = { current: '' };
  const lastKeyTimeRef = { current: 0 };
  const maxDelay = 150;
  const minLength = 3;

  const simulateKeyPress = (char: string, timestamp: number) => {
    const timeSinceLast = timestamp - lastKeyTimeRef.current;
    lastKeyTimeRef.current = timestamp;

    if (char === 'Enter') {
      const code = bufferRef.current.trim();
      bufferRef.current = '';
      if (code.length >= minLength) {
        scannedBarcode = code;
      }
      return;
    }

    if (timeSinceLast > maxDelay && bufferRef.current.length > 0) {
      bufferRef.current = '';
    }

    if (char.length === 1) {
      bufferRef.current += char;
    }
  };

  // Simulate barcode with occasional 70ms Bluetooth delay (previous 60ms threshold dropped this)
  simulateKeyPress('7', 1000);
  simulateKeyPress('5', 1015);
  simulateKeyPress('0', 1085); // 70ms gap from Android Bluetooth jitter
  simulateKeyPress('1', 1100);
  simulateKeyPress('Enter', 1115);

  assert.equal(scannedBarcode, '7501');
});

test('Hardware scanner deduplication prevents double-registration on gun trigger bounce or CR/LF', () => {
  const scanCalls: string[] = [];
  const bufferRef = { current: '' };
  const lastProcessedRef = { barcode: '', timestamp: 0 };
  const debounceMs = 600;

  const commitScan = (timestamp: number) => {
    const rawBarcode = bufferRef.current.trim();
    bufferRef.current = '';
    if (rawBarcode.length < 3) return;

    if (lastProcessedRef.barcode === rawBarcode && timestamp - lastProcessedRef.timestamp < debounceMs) {
      return; // Ignore duplicate within 600ms
    }

    lastProcessedRef.barcode = rawBarcode;
    lastProcessedRef.timestamp = timestamp;
    scanCalls.push(rawBarcode);
  };

  // Scan 1 at t=1000
  bufferRef.current = '7501000101010';
  commitScan(1000);

  // Immediate second Enter at t=1020 (from \r\n or laser bounce)
  bufferRef.current = '7501000101010';
  commitScan(1020);

  // Third trigger at t=1200 (within 600ms bounce)
  bufferRef.current = '7501000101010';
  commitScan(1200);

  // Exactly ONE call recorded during the rapid burst!
  assert.equal(scanCalls.length, 1);

  // Deliberate user scan after 1 second (t=2100)
  bufferRef.current = '7501000101010';
  commitScan(2100);

  assert.equal(scanCalls.length, 2);
});

test('Hardware scanner ignores human slow typing without Enter', () => {
  let scannedBarcode: string | null = null;
  const bufferRef = { current: '' };
  const lastKeyTimeRef = { current: 0 };
  const maxDelay = 150;
  const minLength = 3;

  const simulateKeyPress = (char: string, timestamp: number) => {
    const timeSinceLast = timestamp - lastKeyTimeRef.current;
    lastKeyTimeRef.current = timestamp;

    if (char === 'Enter') {
      const code = bufferRef.current.trim();
      bufferRef.current = '';
      if (code.length >= minLength) {
        scannedBarcode = code;
      }
      return;
    }

    if (timeSinceLast > maxDelay && bufferRef.current.length > 0) {
      bufferRef.current = '';
    }

    if (char.length === 1) {
      bufferRef.current += char;
    }
  };

  // Human types slowly (300ms delay between keys)
  simulateKeyPress('a', 1000);
  simulateKeyPress('b', 1350);
  simulateKeyPress('c', 1700);

  // Buffer gets reset because interval > 150ms
  assert.equal(scannedBarcode, null);
});

