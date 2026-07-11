// Sticky Navbar on Scroll
const navbar = document.getElementById('navbar');

window.addEventListener('scroll', () => {
    if (navbar) {
        if (window.scrollY > 50) {
            navbar.classList.add('scrolled');
        } else {
            navbar.classList.remove('scrolled');
        }

        if (window.scrollY > window.innerHeight * 0.6) {
            navbar.classList.add('past-hero');
        } else {
            navbar.classList.remove('past-hero');
        }
    }
});

// Mobile Menu Toggle
const mobileMenuIcon = document.getElementById('mobile-menu-icon');
const navLinks = document.querySelector('.nav-links');

if (mobileMenuIcon) {
    mobileMenuIcon.addEventListener('click', () => {
        navLinks.classList.toggle('active');
        
        // Change icon between menu and close and update a11y
        const icon = mobileMenuIcon.querySelector('ion-icon');
        if (navLinks.classList.contains('active')) {
            icon.setAttribute('name', 'close-outline');
            mobileMenuIcon.setAttribute('aria-expanded', 'true');
        } else {
            icon.setAttribute('name', 'menu-outline');
            mobileMenuIcon.setAttribute('aria-expanded', 'false');
        }
    });
}

// Close mobile menu when clicking a link
document.querySelectorAll('.nav-links a').forEach(link => {
    link.addEventListener('click', () => {
        navLinks.classList.remove('active');
        if (mobileMenuIcon) {
            const icon = mobileMenuIcon.querySelector('ion-icon');
            if (icon) icon.setAttribute('name', 'menu-outline');
            mobileMenuIcon.setAttribute('aria-expanded', 'false');
        }
    });
});

// Intersection Observer for Scroll Animations
const observerOptions = {
    root: null,
    rootMargin: '0px',
    threshold: 0.15
};

const observer = new IntersectionObserver((entries, observer) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            entry.target.classList.add('visible');
            observer.unobserve(entry.target); // Run animation only once
        }
    });
}, observerOptions);

// Select all elements to animate
const animatedElements = document.querySelectorAll('.fade-up, .fade-in-left, .fade-in-right');
animatedElements.forEach(el => observer.observe(el));

// Give direct WhatsApp buttons useful context instead of opening an empty chat.
const directContactContext = window.location.pathname.includes('corporativo')
    ? 'Olá, vim pela página de Empresas e Governo da NX Projetos e gostaria de falar sobre uma demanda técnica.'
    : 'Olá, vim pela página de Pessoa Física da NX Projetos e gostaria de falar sobre meu imóvel.';

document.querySelectorAll('a[href^="https://wa.me/5598991424677"]').forEach((link) => {
    const whatsappUrl = new URL(link.href);
    if (!whatsappUrl.searchParams.has('text')) {
        whatsappUrl.searchParams.set('text', directContactContext);
        link.href = whatsappUrl.toString();
    }
});

// Open WhatsApp with the contact request already organized for the NX team.
document.querySelectorAll('[data-whatsapp-form]').forEach((contactForm) => {
    contactForm.addEventListener('submit', (event) => {
        event.preventDefault();

        const formData = new FormData(contactForm);
        const origin = contactForm.dataset.origin || 'Site NX Projetos';
        const name = String(formData.get('name') || '').trim();
        const location = String(formData.get('location') || '').trim();
        const service = String(formData.get('service') || '').trim();
        const message = String(formData.get('message') || '').trim();

        const whatsappMessage = [
            'Olá, vim pelo site da NX Projetos.',
            '',
            `Nome: ${name}`,
            `Serviço: ${service}`,
            `Local: ${location}`,
            `Mensagem: ${message}`,
            `Origem: ${origin}`,
        ].join('\n');

        const whatsappUrl = `https://wa.me/5598991424677?text=${encodeURIComponent(whatsappMessage)}`;
        const whatsappWindow = window.open(whatsappUrl, '_blank', 'noopener,noreferrer');

        if (!whatsappWindow) {
            window.location.href = whatsappUrl;
        }
    });
});
