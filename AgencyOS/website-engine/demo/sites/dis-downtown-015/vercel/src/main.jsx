import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './site.css';
import './site.js';

const root = createRoot(document.getElementById('root'));
root.render(<App />);
