import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/ma-shan-zheng/400.css';
import '@fontsource/zcool-xiaowei/400.css';
import './styles/global.css';
import './styles/animation-enhancements.css';
import { App } from './app/App';
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
