import './intro.css';
import { startGallery } from './main.js';
import { runIntro } from './intro.js';

runIntro({
  startGallery: (data) => startGallery(data).catch((err) => {
    const msg = document.getElementById('loaderMsg');
    if (msg) msg.textContent = 'No se pudo cargar la galería. Intente de nuevo.';
    throw err;
  }),
});
