/**
 * A simple global serializer: every call made through `throttle()` with the same `queue` runs
 * one at a time, with `minIntervalMs` enforced between the start of consecutive calls - no matter
 * how many concurrent logical requests are trying to fire (e.g. Ethereum + Arbitrum fetching in
 * parallel, each internally paginating 2-3 endpoints at once). This caps the app's own aggregate
 * request rate to a shared upstream budget, which per-call/per-page pacing alone doesn't do once
 * multiple independent call sites overlap. Scoped to one warm process - doesn't coordinate across
 * separate serverless instances, but fixes the common case where a single page load's concurrent
 * fetches already burst well past a provider's per-second limit on their own.
 */
export function createThrottle(minIntervalMs: number) {
  let queue: Promise<void> = Promise.resolve();

  function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  return function throttle<T>(fn: () => Promise<T>): Promise<T> {
    const turn = queue.then(fn);
    queue = turn.then(
      () => sleep(minIntervalMs),
      () => sleep(minIntervalMs),
    );
    return turn;
  };
}
