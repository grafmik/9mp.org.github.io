// === Language Toggle ===

const langToggle = document.getElementById('langToggle');
let currentLang = localStorage.getItem('lang') || 'fr';

function setLanguage(lang) {
    currentLang = lang;
    localStorage.setItem('lang', lang);
    document.documentElement.lang = lang;
    document.body.dataset.lang = lang;
    langToggle.textContent = lang === 'fr' ? 'EN' : 'FR';

    document.querySelectorAll('[data-fr]').forEach(el => {
        const text = el.getAttribute(`data-${lang}`);
        if (text !== null) {
            el.innerHTML = text;
        }
    });
}

setLanguage(currentLang);

langToggle.addEventListener('click', () => {
    setLanguage(currentLang === 'fr' ? 'en' : 'fr');
});

// === Active Navigation on Scroll ===

const sections = document.querySelectorAll('section[id]');
const navLinks = document.querySelectorAll('#mainNav a');

function updateActiveNav() {
    const scrollY = window.scrollY + 100;

    sections.forEach(section => {
        const top = section.offsetTop;
        const height = section.offsetHeight;
        const id = section.getAttribute('id');

        if (scrollY >= top && scrollY < top + height) {
            navLinks.forEach(link => {
                link.classList.remove('active');
                if (link.getAttribute('href') === `#${id}`) {
                    link.classList.add('active');
                }
            });
        }
    });
}

window.addEventListener('scroll', updateActiveNav, { passive: true });
updateActiveNav();

// === Lightbox ===

const lightboxOverlay = document.createElement('div');
lightboxOverlay.className = 'lightbox-overlay';
document.body.appendChild(lightboxOverlay);

function createLightboxImage(src) {
    lightboxOverlay.innerHTML = '';
    const img = document.createElement('img');
    img.src = src;
    img.alt = '';
    lightboxOverlay.appendChild(img);
    lightboxOverlay.classList.add('active');
}

lightboxOverlay.addEventListener('click', () => {
    lightboxOverlay.classList.remove('active');
});

document.querySelectorAll('.amenity-photo-grid img, .amenity-photo img').forEach(img => {
    img.addEventListener('click', () => {
        createLightboxImage(img.src);
    });
});

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && lightboxOverlay.classList.contains('active')) {
        lightboxOverlay.classList.remove('active');
    }
});

// === Copy to Clipboard ===

document.querySelectorAll('.copy-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const textEl = btn.previousElementSibling;
        if (textEl) {
            navigator.clipboard.writeText(textEl.textContent.trim()).then(() => {
                const original = btn.textContent;
                btn.textContent = '✓';
                btn.style.opacity = '1';
                setTimeout(() => {
                    btn.textContent = original;
                    btn.style.opacity = '0.5';
                }, 1500);
            });
        }
    });
});

// === Smooth Scroll Offset ===

document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        e.preventDefault();
        const target = document.querySelector(this.getAttribute('href'));
        if (target) {
            const offset = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--nav-height')) || 56;
            const top = target.getBoundingClientRect().top + window.scrollY - offset;
            window.scrollTo({ top, behavior: 'smooth' });
        }
    });
});
