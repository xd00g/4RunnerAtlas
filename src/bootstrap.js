document.querySelector('#reload-viewer').addEventListener('click',()=>location.reload());
import('./app.js').catch((error) => {
  document.querySelector('#loading').hidden = true;
  document.querySelector('#load-error').hidden = false;
  document.querySelector('#error-detail').textContent = 'The viewer could not start. Reload the page. If this continues, check that all local viewer files are present.';
  console.error(error);
});
