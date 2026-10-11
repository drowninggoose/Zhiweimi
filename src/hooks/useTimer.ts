import { useEffect, useReducer } from 'react';
type State = { seconds: number; running: boolean };
type Action =
  { type: 'tick' } | { type: 'seconds'; value: number } | { type: 'running'; value: boolean };
function reduce(state: State, action: Action): State {
  if (action.type === 'seconds')
    return { seconds: Math.max(0, Math.floor(action.value) || 0), running: false };
  if (action.type === 'running') return { ...state, running: action.value && state.seconds > 0 };
  if (!state.running) return state;
  const seconds = Math.max(0, state.seconds - 1);
  return { seconds, running: seconds > 0 };
}
export function useTimer(initialSeconds: number) {
  const [state, dispatch] = useReducer(reduce, { seconds: initialSeconds, running: false });
  useEffect(() => {
    if (!state.running) return;
    const interval = setInterval(() => dispatch({ type: 'tick' }), 1000);
    return () => clearInterval(interval);
  }, [state.running]);
  return {
    ...state,
    setSeconds: (value: number) => dispatch({ type: 'seconds', value }),
    setRunning: (value: boolean) => dispatch({ type: 'running', value }),
  };
}
