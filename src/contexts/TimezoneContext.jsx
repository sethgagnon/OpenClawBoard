import { createContext, useContext, useState, useEffect } from 'react';

const TimezoneContext = createContext(undefined);

export function TimezoneProvider({ children }) {
  const [timezone, setTimezone] = useState(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone
  );
  const [hour12, setHour12] = useState(true);

  // Load saved time format from settings
  useEffect(() => {
    fetch('/api/settings', { credentials: 'include' })
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (data?.timeFormat) setHour12(data.timeFormat === '12h');
        if (data?.timezone) setTimezone(data.timezone);
      })
      .catch(() => {});
  }, []);

  return (
    <TimezoneContext.Provider value={{ timezone, setTimezone, hour12, setHour12 }}>
      {children}
    </TimezoneContext.Provider>
  );
}

export function useTimezone() {
  const ctx = useContext(TimezoneContext);
  if (!ctx) throw new Error('useTimezone must be used within TimezoneProvider');
  return ctx;
}
