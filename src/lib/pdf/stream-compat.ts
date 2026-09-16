/** Safari versions without ReadableStream async iteration need this for PDF.js text layers. */
export function ensureStreamIteration(): void {
  if (
    typeof ReadableStream === "undefined" ||
    Reflect.get(ReadableStream.prototype, Symbol.asyncIterator)
  )
    return;
  Object.defineProperty(ReadableStream.prototype, Symbol.asyncIterator, {
    configurable: true,
    writable: true,
    value: async function* (this: ReadableStream<unknown>, options?: { preventCancel?: boolean }) {
      const reader = this.getReader();
      let completed = false;
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) {
            completed = true;
            return;
          }
          yield value;
        }
      } finally {
        try {
          if (!completed && !options?.preventCancel) await reader.cancel();
        } finally {
          reader.releaseLock();
        }
      }
    },
  });
}
