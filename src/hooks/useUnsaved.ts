import { useEffect, useRef } from 'react';
import { useBlocker } from 'react-router-dom';
export function useUnsaved(dirty: boolean, message = '还有未保存内容，确认离开？') {
  const permitted = useRef(false);
  const blocker = useBlocker(() => dirty && !permitted.current);
  useEffect(() => {
    if (blocker.state === 'blocked') {
      if (window.confirm(message)) blocker.proceed();
      else blocker.reset();
    }
  }, [blocker, message]);
  useEffect(() => {
    if (!dirty) return;
    const unload = (e: BeforeUnloadEvent) => {
      if (permitted.current) return;
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', unload);
    return () => window.removeEventListener('beforeunload', unload);
  }, [dirty]);
  return () => {
    permitted.current = true;
  };
}
