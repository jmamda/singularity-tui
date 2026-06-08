import { useEffect, useState } from 'react';

export function useTick(fps: number = 8): number {
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    const ms = Math.max(16, Math.floor(1000 / fps));
    const t = setInterval(() => setFrame((f) => (f + 1) % 1_000_000), ms);
    return () => clearInterval(t);
  }, [fps]);
  return frame;
}
