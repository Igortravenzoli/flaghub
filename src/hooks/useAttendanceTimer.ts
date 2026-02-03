import { useState, useEffect, useCallback } from 'react';

export function useAttendanceTimer() {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const interval = setInterval(() => {
      setNow(Date.now());
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  const formatDuration = useCallback((seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (hours > 0) {
      return `${hours}h ${minutes.toString().padStart(2, '0')}m ${secs.toString().padStart(2, '0')}s`;
    }
    if (minutes > 0) {
      return `${minutes}m ${secs.toString().padStart(2, '0')}s`;
    }
    return `${secs}s`;
  }, []);

  const getElapsedSeconds = useCallback((startTime: Date): number => {
    return Math.floor((now - startTime.getTime()) / 1000);
  }, [now]);

  const formatTime = useCallback((date: Date): string => {
    return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  }, []);

  return { now, formatDuration, getElapsedSeconds, formatTime };
}
