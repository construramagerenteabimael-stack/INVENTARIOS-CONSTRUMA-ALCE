import { useEffect, useRef, useState, useCallback } from 'react';

interface UseHardwareScannerOptions {
  onScan: (barcode: string) => void;
  enabled?: boolean;
  maxDelayBetweenKeysMs?: number;
  minBarcodeLength?: number;
  debounceMs?: number;
}

export function useHardwareScanner({
  onScan,
  enabled = true,
  maxDelayBetweenKeysMs = 150,
  minBarcodeLength = 3,
  debounceMs = 600,
}: UseHardwareScannerOptions) {
  const bufferRef = useRef<string>('');
  const lastKeyTimeRef = useRef<number>(0);
  const lastProcessedRef = useRef<{ barcode: string; timestamp: number }>({
    barcode: '',
    timestamp: 0,
  });
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [lastScannedBarcode, setLastScannedBarcode] = useState<string | null>(null);
  const [scannerDetected, setScannerDetected] = useState(false);

  // Safe commit function with debounce and deduplication
  const commitScan = useCallback(
    (codeToProcess?: string) => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }

      const rawBarcode = (codeToProcess !== undefined ? codeToProcess : bufferRef.current).trim();
      bufferRef.current = '';

      if (rawBarcode.length < minBarcodeLength) return;

      const now = Date.now();
      const last = lastProcessedRef.current;

      // CRITICAL FIX FOR "lo registra por 2":
      // If the identical barcode was processed within debounceMs (default 600ms),
      // ignore duplicate event caused by \r\n, CR+LF, or gun trigger bounce.
      if (last.barcode === rawBarcode && now - last.timestamp < debounceMs) {
        return;
      }

      lastProcessedRef.current = { barcode: rawBarcode, timestamp: now };
      setScannerDetected(true);
      setLastScannedBarcode(rawBarcode);
      onScan(rawBarcode);
    },
    [minBarcodeLength, debounceMs, onScan]
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!enabled) return;

      const now = Date.now();
      const timeSinceLastKey = now - lastKeyTimeRef.current;
      lastKeyTimeRef.current = now;

      // Check if user is typing in a standard input or textarea
      const target = e.target as HTMLElement | null;
      const isInputFocused =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable);

      // Handle barcode scanner terminator ('Enter' or 'Tab')
      if (e.key === 'Enter' || e.key === 'Tab') {
        if (bufferRef.current.trim().length >= minBarcodeLength) {
          // If triggered while an input is focused, prevent default form submission or navigation
          if (isInputFocused) {
            e.preventDefault();
            e.stopPropagation();
            if (target && 'value' in target && typeof (target as HTMLInputElement).value === 'string') {
              (target as HTMLInputElement).value = '';
            }
          }

          commitScan();
        }
        return;
      }

      // If time since last key is too long (human typing speed) and buffer already has text, reset buffer
      if (timeSinceLastKey > maxDelayBetweenKeysMs && bufferRef.current.length > 0) {
        bufferRef.current = '';
      }

      // Capture single printable characters
      if (e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
        bufferRef.current += e.key;

        // If buffer is accumulating very quickly, confirm hardware scanner presence
        if (bufferRef.current.length >= 4 && timeSinceLastKey < maxDelayBetweenKeysMs) {
          setScannerDetected(true);
        }

        // Auto-commit timer: handles scanners configured with no suffix (no Enter)
        // If 75ms of silence passes after high-speed input (>= 6 chars), commit automatically
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
        }
        if (bufferRef.current.length >= 6) {
          timeoutRef.current = setTimeout(() => {
            if (bufferRef.current.length >= minBarcodeLength) {
              commitScan();
            }
          }, 75);
        }
      }
    },
    [enabled, maxDelayBetweenKeysMs, minBarcodeLength, commitScan]
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown, true);
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      window.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [handleKeyDown]);

  return {
    isHardwareScannerReady: true,
    hasDetectedScanner: scannerDetected,
    lastScannedBarcode,
  };
}
