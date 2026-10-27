import { useCallback, useEffect, useState } from "react";
/** Loads data when `key` changes; stale responses from an earlier key are ignored. */
export function useResource(load, key) {
  const [state, setState] = useState({ loading: true });
  const [tick, setTick] = useState(0);
  // biome-ignore lint/correctness/useExhaustiveDependencies: `load` is recreated each render; `key` and `tick` decide when to refetch
  useEffect(() => {
    let current = true;
    setState((s) => ({ ...s, loading: true, error: undefined }));
    load().then(
      (data) => current && setState({ data, loading: false }),
      (error) => current && setState({ error, loading: false }),
    );
    return () => {
      current = false;
    };
  }, [key, tick]);
  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { ...state, reload };
}
