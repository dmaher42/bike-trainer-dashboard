const DEFAULT_PASSIVE_EVENTS = new Set<keyof GlobalEventHandlersEventMap>([
  'touchstart',
  'touchmove',
  'wheel',
]);

let isPatched = false;

export function enablePassiveEventListeners(): void {
  if (typeof window === 'undefined' || isPatched) {
    return;
  }

  const originalAddEventListener = EventTarget.prototype.addEventListener;

  EventTarget.prototype.addEventListener = function (
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | AddEventListenerOptions
  ): void {
    let normalizedOptions = options;

    if (DEFAULT_PASSIVE_EVENTS.has(type as keyof GlobalEventHandlersEventMap)) {
      if (options === undefined) {
        normalizedOptions = { passive: true };
      } else if (typeof options === 'boolean') {
        normalizedOptions = { capture: options, passive: true };
      } else if (typeof options === 'object' && options !== null) {
        if (options.passive === undefined) {
          normalizedOptions = { ...options, passive: true };
        }
      }
    }

    return originalAddEventListener.call(
      this,
      type,
      listener,
      normalizedOptions as boolean | AddEventListenerOptions | undefined
    );
  };

  isPatched = true;
}
