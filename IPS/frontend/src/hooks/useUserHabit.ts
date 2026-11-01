import { useCallback, useState } from 'react';
import { getUserHabit, setUserHabit } from '@/utils/userHabit';

export function useUserHabit<T>(
  key: string,
  defaultValue: T,
): [T, (value: T | ((prev: T) => T)) => void] {
  const [value, setValueState] = useState<T>(() => getUserHabit(key, defaultValue));

  const setValue = useCallback(
    (next: T | ((prev: T) => T)) => {
      setValueState((prev) => {
        const resolved = typeof next === 'function' ? (next as (prev: T) => T)(prev) : next;
        setUserHabit(key, resolved);
        return resolved;
      });
    },
    [key],
  );

  return [value, setValue];
}
