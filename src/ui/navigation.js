import '../styles/shared.css';

const pages = [
  { id: 'layers', label: 'Layers', href: '/' },
  { id: 'scenarios', label: 'Land-use scenarios', href: '/task47.html' },
  { id: 'weather', label: 'KNMI data', href: '/weather.html' },
  { id: 'demographics', label: 'Socio-demographics', href: '/demographics.html' },
];

export function renderNavigation(currentPage) {
  const header = document.querySelector('#projectHeader');
  const brand = document.createElement('a');
  brand.className = 'brand';
  brand.href = '/';
  brand.textContent = 'Schiehaven Noord';

  const nav = document.createElement('nav');
  nav.setAttribute('aria-label', 'Project pages');

  for (const page of pages) {
    const link = document.createElement('a');
    link.href = page.href;
    link.textContent = page.label;
    if (page.id === currentPage) link.setAttribute('aria-current', 'page');
    nav.append(link);
  }

  header.replaceChildren(brand, nav);
}
