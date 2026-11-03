import '../styles/shared.css';

const pages = [
  { id: 'introduction', label: 'Introduction', href: '/' },
  { id: 'layers', label: 'Layers', href: '/layers.html' },
  { id: 'morphology', label: 'Urban morphology', href: '/morphology.html' },
  { id: 'weather', label: 'KNMI data', href: '/weather.html' },
  { id: 'predictions', label: 'Weather predictions', href: '/predictions.html' },
  { id: 'environment', label: 'Wind & noise', href: '/environment.html' },
  { id: 'demographics', label: 'Socio-demographics', href: '/demographics.html' },
  { id: 'scenarios', label: 'Land-use scenarios', href: '/task47.html' },
  { id: 'roads', label: 'Road networks', href: '/roads.html' },
];

let focusStudyArea = () => window.location.assign('/?view=study-area');

export function setStudyAreaFocus(action) {
  focusStudyArea = action;
}

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

  const focusButton = document.createElement('button');
  focusButton.type = 'button';
  focusButton.className = 'header-focus';
  focusButton.textContent = 'Focus on neighbourhood';
  focusButton.addEventListener('click', async () => {
    focusButton.disabled = true;
    try {
      await focusStudyArea();
    } catch (error) {
      console.error(error);
      window.location.assign('/?view=study-area');
    } finally {
      focusButton.disabled = false;
    }
  });

  header.replaceChildren(brand, nav, focusButton);
}
