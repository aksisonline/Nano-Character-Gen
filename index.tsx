import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import './styles/pixel-game.css';
import App from './App';
import FunPage from './components/FunPage';
import OutagePage from './components/OutagePage';

type Outage = { reason?: string; eta?: string; since?: string };
const outage = (window as unknown as { __PF_OUTAGE__?: Outage }).__PF_OUTAGE__;
const isFun = /^\/fun\/?$/.test(window.location.pathname);
const Root = isFun ? <FunPage /> : outage ? <OutagePage {...outage} /> : <App />;

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    {Root}
  </React.StrictMode>
);