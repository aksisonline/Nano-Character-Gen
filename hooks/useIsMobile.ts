import { useEffect, useState } from 'react';

const QUERY = '(max-width: 768px)';

/** True at phone/small-tablet widths. Mirrors the `max-md` Tailwind breakpoint. */
export function useIsMobile(): boolean {
  const [mobile, setMobile] = useState(() => typeof window !== 'undefined' && window.matchMedia(QUERY).matches);
  useEffect(() => {
    const mq = window.matchMedia(QUERY);
    const update = () => setMobile(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);
  return mobile;
}
