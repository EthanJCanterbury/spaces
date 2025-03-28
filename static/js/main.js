document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        e.preventDefault();
        document.querySelector(this.getAttribute('href')).scrollIntoView({
            behavior: 'smooth'
        });
    });
});

window.addEventListener('scroll', () => {
    const navbar = document.querySelector('.navbar');
    if (window.scrollY > 50) {
        navbar.style.background = 'rgba(255, 255, 255, 0.95)';
        navbar.style.backdropFilter = 'blur(12px) saturate(180%)';
        navbar.style.borderBottom = '1px solid rgba(236, 55, 80, 0.1)';
    } else {
        navbar.style.background = 'rgba(255, 255, 255, 0.8)';
        navbar.style.backdropFilter = 'blur(12px) saturate(180%)';
        navbar.style.borderBottom = '1px solid rgba(236, 55, 80, 0.1)';
    }
});

function openNewSiteModal() {
    const modal = document.querySelector('.modal');
    modal.style.display = 'flex';
    setTimeout(() => {
        modal.style.opacity = '1';
    }, 0);
}

function closeNewSiteModal() {
    const modal = document.querySelector('.modal');
    modal.style.opacity = '0';
    setTimeout(() => {
        modal.style.display = 'none';
    }, 200);
}

async function createNewSite(event) {
    event.preventDefault();
    const siteName = document.getElementById('siteName').value;
    
    if (!siteName) {
        alert('Please enter a site name');
        return;
    }

    try {
        const response = await fetch('/api/sites', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ name: siteName })
        });

        const data = await response.json();
        if (response.ok) {
            window.location.href = `/edit/${data.site_id}`;
        } else {
            alert(data.message || 'Failed to create website');
        }
    } catch (error) {
        console.error('Error:', error);
        alert('Failed to create website');
    }
}

function toggleFolder(element) {
    const header = element.closest('.folder-header');
    const folder = header.closest('.folder');
    const content = folder.querySelector('.folder-content');
    const icon = header.querySelector('.fa-chevron-right, .fa-chevron-down');
    
    if (content.style.display === 'none') {
        content.style.display = 'block';
        icon.classList.replace('fa-chevron-right', 'fa-chevron-down');
    } else {
        content.style.display = 'none';
        icon.classList.replace('fa-chevron-down', 'fa-chevron-right');
    }
}

function openFile(element) {
    document.querySelectorAll('.file').forEach(f => f.classList.remove('active'));
    
    element.classList.add('active');
    
}

document.addEventListener('DOMContentLoaded', function() {
    document.body.classList.add('loaded');
    
    document.querySelectorAll('.folder-header').forEach(header => {
        header.addEventListener('click', () => toggleFolder(header));
    });
    
    document.querySelectorAll('.file').forEach(file => {
        file.addEventListener('click', () => openFile(file));
    });
});

const observerOptions = {
    threshold: 0.1
};

const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            entry.target.style.opacity = '1';
            entry.target.style.transform = 'translateY(0)';
        }
    });
}, observerOptions);

document.querySelectorAll('.feature-card').forEach(card => {
    card.style.opacity = '0';
    card.style.transform = 'translateY(20px)';
    card.style.transition = 'opacity 0.5s ease, transform 0.5s ease';
    observer.observe(card);
});
