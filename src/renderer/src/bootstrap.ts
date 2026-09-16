// Keep feedback available while the renderer dependency graph loads.
void import('./main').catch(() => {
  const root = document.getElementById('root');
  if (!root) return;
  const message = document.createElement('div');
  message.setAttribute('role', 'alert');
  message.style.cssText = 'padding:32px;font:16px Segoe UI,sans-serif';
  message.textContent = 'CIF Crystal Data could not start. ';
  const retry = document.createElement('button');
  retry.textContent = 'Reload workspace';
  retry.addEventListener('click', () => window.location.reload());
  message.append(retry);
  root.replaceChildren(message);
});
