import { createContext, useContext } from 'react';
import { DEFAULT_TIME_ZONE } from '../utils/timezone';

/** The zone all replay times are displayed in. Provided by the replay page from the session setup. */
export const TimeZoneContext = createContext<string>(DEFAULT_TIME_ZONE);

export function useTimeZone(): string {
  return useContext(TimeZoneContext);
}
