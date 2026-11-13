import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles.css';
import { seedCategories } from './db';

seedCategories().then(() => {
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode><App /></React.StrictMode>,
  );
}).catch((error: unknown) => {
  console.error('Cannot initialize local database', error);
  document.getElementById('root')!.textContent = 'Не удалось открыть локальную базу данных. Проверьте настройки браузера.';
});
