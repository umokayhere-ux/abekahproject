"use client";

import { useCallback, useEffect, useState } from "react";
import { ApiError, apiFetch } from "@/lib/client";

interface ResourceState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

export interface Resource<T> extends ResourceState<T> {
  /** Re-runs the request, e.g. after a mutation or from a retry button. */
  refetch: () => void;
  /** Replaces the cached value locally, for optimistic updates. */
  setData: (updater: T | ((current: T | null) => T | null)) => void;
}

/**
 * Fetches an API resource and tracks its loading and error state.
 *
 * All state transitions happen asynchronously — inside the debounce timer or
 * after an await — never synchronously in the effect body, which is what
 * causes the cascading re-renders React warns about.
 *
 * In-flight requests are aborted when `path` changes or the component
 * unmounts, so a slow response cannot overwrite newer data.
 *
 * @param path     The API path to fetch. Pass `null` to skip fetching.
 * @param debounce Milliseconds to wait before firing; useful for search inputs.
 */
export function useApiResource<T>(
  path: string | null,
  { debounce = 0, fallbackMessage = "We could not load this. Please try again." } = {},
): Resource<T> {
  const [state, setState] = useState<ResourceState<T>>({
    data: null,
    loading: path !== null,
    error: null,
  });

  // Bumping this re-runs the effect without changing the path.
  const [nonce, setNonce] = useState(0);
  const refetch = useCallback(() => setNonce((value) => value + 1), []);

  useEffect(() => {
    if (path === null) return;

    const controller = new AbortController();

    const timer = setTimeout(() => {
      // Inside the timer callback, so this runs asynchronously.
      setState((current) => ({ ...current, loading: true, error: null }));

      apiFetch<T>(path, { signal: controller.signal })
        .then((data) => {
          if (controller.signal.aborted) return;
          setState({ data, loading: false, error: null });
        })
        .catch((error: unknown) => {
          if (controller.signal.aborted) return;
          setState((current) => ({
            ...current,
            loading: false,
            error: error instanceof ApiError ? error.message : fallbackMessage,
          }));
        });
    }, debounce);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [path, nonce, debounce, fallbackMessage]);

  const setData = useCallback(
    (updater: T | ((current: T | null) => T | null)) => {
      setState((current) => ({
        ...current,
        data:
          typeof updater === "function"
            ? (updater as (value: T | null) => T | null)(current.data)
            : updater,
      }));
    },
    [],
  );

  return { ...state, refetch, setData };
}
