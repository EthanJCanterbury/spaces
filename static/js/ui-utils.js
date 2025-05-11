
function showToast(type, message) {
  const toastContainer = document.getElementById('toast-container');
  if (!toastContainer) {
    // Create toast container if it doesn't exist
    const newContainer = document.createElement('div');
    newContainer.id = 'toast-container';
    document.body.appendChild(newContainer);
    showToast(type, message);
    return;
  }
  
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `
    <div class="toast-content">
      <i class="fas fa-${type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : type === 'warning' ? 'exclamation-triangle' : 'info-circle'}"></i>
      <span>${message}</span>
    </div>
    <button class="toast-close" onclick="this.parentElement.remove()">&times;</button>
  `;
  
  toastContainer.appendChild(toast);
  
  // Add show class after a small delay to trigger animation
  setTimeout(() => {
    toast.classList.add('show');
  }, 10);
  
  setTimeout(() => {
    if (toast.parentElement) {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 300);
    }
  }, 5000);
}

function openModal(modalId) {
  const modal = document.getElementById(modalId);
  if (!modal) return;
  
  // Prevent body scrolling when modal is open
  document.body.style.overflow = 'hidden';
  
  // Reset modal scroll position
  const modalContent = modal.querySelector('.modal-content');
  if (modalContent) {
    modalContent.scrollTop = 0;
  }
  
  modal.style.display = 'flex';
  modal.offsetHeight; // Trigger reflow
  modal.classList.add('show');
  
  // Ensure modal is centered in viewport
  if (modalContent) {
    const viewportHeight = window.innerHeight;
    const contentHeight = modalContent.offsetHeight;
    
    // If content is taller than viewport, adjust styles for scrolling
    if (contentHeight > viewportHeight * 0.9) {
      modalContent.style.height = '90vh';
      modalContent.style.overflowY = 'auto';
    } else {
      modalContent.style.height = 'auto';
      modalContent.style.overflowY = 'visible';
    }
  }
}

function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (!modal) return;
  
  modal.classList.remove('show');
  setTimeout(() => {
    modal.style.display = 'none';
    // Restore body scrolling
    document.body.style.overflow = '';
  }, 300);
}

function debounce(func, wait) {
  let timeout;
  return function(...args) {
    const context = this;
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(context, args), wait);
  };
}

function deploySite() {
  openModal('deployModal');
}

function closeDeployModal() {
  closeModal('deployModal');
}

function openDeployedSite() {
  const slug = document.getElementById('site-slug').value;
  window.open(`https://hackclub.space/s/${slug}`, '_blank');
}

function initModals() {
  document.querySelectorAll('.modal').forEach(modal => {
    modal.addEventListener('click', function(e) {
      if (e.target === this) {
        this.classList.remove('show');
        setTimeout(() => {
          this.style.display = 'none';
        }, 300);
      }
    });
  });
  
  document.querySelectorAll('.close-btn').forEach(btn => {
    btn.addEventListener('click', function() {
      const modal = this.closest('.modal');
      modal.classList.remove('show');
      setTimeout(() => {
        modal.style.display = 'none';
      }, 300);
    });
  });
}

function initTooltips() {
  const tooltips = document.querySelectorAll('[data-tooltip]');
  tooltips.forEach(element => {
    const tooltipText = element.getAttribute('data-tooltip');
    const tooltip = document.createElement('div');
    tooltip.classList.add('tooltip');
    tooltip.textContent = tooltipText;
    
    element.addEventListener('mouseenter', () => {
      document.body.appendChild(tooltip);
      const rect = element.getBoundingClientRect();
      tooltip.style.left = `${rect.left + rect.width / 2 - tooltip.offsetWidth / 2}px`;
      tooltip.style.top = `${rect.top - tooltip.offsetHeight - 10}px`;
      setTimeout(() => tooltip.classList.add('visible'), 10);
    });
    
    element.addEventListener('mouseleave', () => {
      tooltip.classList.remove('visible');
      setTimeout(() => {
        if (tooltip.parentElement) {
          tooltip.parentElement.removeChild(tooltip);
        }
      }, 300);
    });
  });
}

document.addEventListener('DOMContentLoaded', function() {
  initModals();
  initTooltips();
  
  const splitViewToggle = document.getElementById('splitViewToggle');
  if (splitViewToggle) {
    splitViewToggle.style.position = 'fixed';
    splitViewToggle.style.right = '20px';
    splitViewToggle.style.bottom = '20px';
    splitViewToggle.style.zIndex = '100';
    splitViewToggle.style.backgroundColor = 'var(--primary)';
    splitViewToggle.style.color = 'white';
    splitViewToggle.style.width = '40px';
    splitViewToggle.style.height = '40px';
    splitViewToggle.style.borderRadius = '50%';
    splitViewToggle.style.display = 'flex';
    splitViewToggle.style.alignItems = 'center';
    splitViewToggle.style.justifyContent = 'center';
    splitViewToggle.style.boxShadow = '0 4px 6px rgba(0, 0, 0, 0.1)';
    splitViewToggle.style.cursor = 'pointer';
  }
});
