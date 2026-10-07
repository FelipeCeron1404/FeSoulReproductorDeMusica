import './styles/main.css';
import { App } from './ui/App';

const root = document.querySelector<HTMLDivElement>('#app');

if (!root) {
  throw new Error('Root element #app was not found');
}

new App(root);
