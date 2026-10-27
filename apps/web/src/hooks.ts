import { useCallback, useEffect, useState } from "react";

export type Resource<T> = { data?: T; error?: Error; loading: boolean; reload: () => void };

/** Loads data when `key` changes; stale responses from an earlier key are ignored. */
export function useResource<T>(load: () => Promise<T>, key: unknown): Resource<T> {
  const [state, setState] = useState<{ data?: T; error?: Error; loading: boolean }>({ loading: true });
  const [tick, setTick] = useState(0);

  // biome-ignore lint/correctness/useExhaustiveDependencies: `load` is recreated each render; `key` and `tick` decide when to refetch
  useEffect(() => {
    let current = true;
    setState((s) => ({ ...s, loading: true, error: undefined }));
    load().then(
      (data) => current && setState({ data, loading: false }),
      (error: Error) => current && setState({ error, loading: false }),
    );
    return () => {
      current = false;
    };
  }, [key, tick]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { ...state, reload };
}
