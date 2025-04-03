
// Tutorial state
let currentTutorialStep = 1;
let totalTutorialSteps = 0;
let tutorialWidget = null;
let dragStartX = 0;
let dragStartY = 0;
let initialX = 0;
let initialY = 0;
let isDragging = false;

// Initialize tutorial when document is ready
document.addEventListener('DOMContentLoaded', function() {
  tutorialWidget = document.getElementById('tutorial-widget');
  
  // Count the total number of steps
  const steps = document.querySelectorAll('.tutorial-step');
  totalTutorialSteps = steps.length;
  
  // Set up draggable behavior
  const tutorialHeader = document.querySelector('.tutorial-header');
  if (tutorialHeader) {
    tutorialHeader.addEventListener('mousedown', startDrag);
    document.addEventListener('mousemove', drag);
    document.addEventListener('mouseup', endDrag);
  }
  
  // Initialize button states
  updateButtonStates();
});

// Open the tutorial modal
function openTutorialModal() {
  if (!tutorialWidget) return;
  
  // Position the modal in the center of the screen
  centerTutorialModal();
  
  // Display the modal
  tutorialWidget.style.display = 'block';
  
  // Fade in
  setTimeout(() => {
    tutorialWidget.style.opacity = '1';
  }, 50);
  
  // Reset to first step
  goToStep(1);
}

// Center the tutorial modal on the screen
function centerTutorialModal() {
  const windowHeight = window.innerHeight;
  const windowWidth = window.innerWidth;
  const modalWidth = 600; // Fixed width or use tutorialWidget.offsetWidth
  const modalHeight = Math.min(600, windowHeight * 0.8); // Approximate height

  // Set position
  tutorialWidget.style.left = (windowWidth / 2 - modalWidth / 2) + 'px';
  tutorialWidget.style.top = (windowHeight / 2 - modalHeight / 2) + 'px';
}

// Close the tutorial modal
function closeTutorialModal() {
  if (!tutorialWidget) return;
  
  tutorialWidget.style.opacity = '0';
  setTimeout(() => {
    tutorialWidget.style.display = 'none';
  }, 300);
}

// Navigate to next tutorial step
function nextTutorialStep() {
  if (currentTutorialStep < totalTutorialSteps) {
    goToStep(currentTutorialStep + 1);
  }
}

// Navigate to previous tutorial step
function prevTutorialStep() {
  if (currentTutorialStep > 1) {
    goToStep(currentTutorialStep - 1);
  }
}

// Go to a specific step
function goToStep(stepNumber) {
  // Hide all steps
  const steps = document.querySelectorAll('.tutorial-step');
  steps.forEach(step => {
    step.style.display = 'none';
    step.classList.remove('active');
  });
  
  // Show the selected step
  const currentStep = document.querySelector(`.tutorial-step[data-step="${stepNumber}"]`);
  if (currentStep) {
    currentStep.style.display = 'block';
    setTimeout(() => {
      currentStep.classList.add('active');
    }, 50);
  }
  
  // Update the step counter
  const stepIndicator = document.getElementById('tutorial-step-indicator');
  if (stepIndicator) {
    stepIndicator.textContent = `${stepNumber}/${totalTutorialSteps}`;
  }
  
  // Update current step tracker
  currentTutorialStep = stepNumber;
  
  // Update button states
  updateButtonStates();
}

// Update the enabled/disabled state of navigation buttons
function updateButtonStates() {
  const prevButton = document.getElementById('prev-tutorial');
  const nextButton = document.getElementById('next-tutorial');
  
  if (prevButton) {
    prevButton.disabled = (currentTutorialStep === 1);
  }
  
  if (nextButton) {
    nextButton.disabled = (currentTutorialStep === totalTutorialSteps);
  }
}

// Draggable functionality
function startDrag(e) {
  // Only handle left mouse button
  if (e.button !== 0) return;
  
  isDragging = true;
  
  // Get initial positions
  const rect = tutorialWidget.getBoundingClientRect();
  initialX = rect.left;
  initialY = rect.top;
  
  // Get mouse start position
  dragStartX = e.clientX;
  dragStartY = e.clientY;
  
  // Add dragging class for visual feedback
  tutorialWidget.classList.add('dragging');
  
  // Prevent default behavior
  e.preventDefault();
}

function drag(e) {
  if (!isDragging) return;
  
  // Calculate new position
  const dx = e.clientX - dragStartX;
  const dy = e.clientY - dragStartY;
  
  // Get window boundaries
  const maxX = window.innerWidth - tutorialWidget.offsetWidth;
  const maxY = window.innerHeight - tutorialWidget.offsetHeight;
  
  // Set new position with boundaries
  const newX = Math.min(Math.max(0, initialX + dx), maxX);
  const newY = Math.min(Math.max(0, initialY + dy), maxY);
  
  tutorialWidget.style.left = newX + 'px';
  tutorialWidget.style.top = newY + 'px';
  
  // Prevent default
  e.preventDefault();
}

function endDrag() {
  if (isDragging) {
    isDragging = false;
    tutorialWidget.classList.remove('dragging');
  }
}
// Tutorial state
let currentTutorialStep = 1;
let totalTutorialSteps = 0;
let tutorialWidget = null;
let dragStartX = 0;
let dragStartY = 0;
let initialX = 0;
let initialY = 0;
let isDragging = false;

// Initialize tutorial when document is ready
document.addEventListener('DOMContentLoaded', function() {
  tutorialWidget = document.getElementById('tutorial-widget');
  
  // Count the total number of steps
  const steps = document.querySelectorAll('.tutorial-step');
  totalTutorialSteps = steps.length;
  
  // Set up draggable behavior
  const tutorialHeader = document.querySelector('.tutorial-header');
  if (tutorialHeader) {
    tutorialHeader.addEventListener('mousedown', startDrag);
    document.addEventListener('mousemove', drag);
    document.addEventListener('mouseup', endDrag);
  }
  
  // Initialize button states
  updateButtonStates();
});

// Open the tutorial modal
function openTutorialModal() {
  if (!tutorialWidget) return;
  
  // Position the modal in the center of the screen
  centerTutorialModal();
  
  // Display the modal
  tutorialWidget.style.display = 'block';
  
  // Fade in
  setTimeout(() => {
    tutorialWidget.style.opacity = '1';
  }, 50);
  
  // Reset to first step
  goToStep(1);
}

// Center the tutorial modal on the screen
function centerTutorialModal() {
  const windowHeight = window.innerHeight;
  const windowWidth = window.innerWidth;
  const modalWidth = 800; // Fixed width or use tutorialWidget.offsetWidth
  const modalHeight = Math.min(600, windowHeight * 0.8); // Approximate height

  // Set position
  tutorialWidget.style.top = '50%';
  tutorialWidget.style.left = '50%';
  tutorialWidget.style.transform = 'translate(-50%, -50%)';
}

// Close the tutorial modal
function closeTutorialModal() {
  if (!tutorialWidget) return;
  
  tutorialWidget.style.opacity = '0';
  setTimeout(() => {
    tutorialWidget.style.display = 'none';
  }, 300);
}

// Navigate to next tutorial step
function nextTutorialStep() {
  if (currentTutorialStep < totalTutorialSteps) {
    goToStep(currentTutorialStep + 1);
  }
}

// Navigate to previous tutorial step
function prevTutorialStep() {
  if (currentTutorialStep > 1) {
    goToStep(currentTutorialStep - 1);
  }
}

// Go to a specific step
function goToStep(stepNumber) {
  // Hide all steps
  const steps = document.querySelectorAll('.tutorial-step');
  steps.forEach(step => {
    step.style.display = 'none';
    step.classList.remove('active');
  });
  
  // Show the selected step
  const currentStep = document.querySelector(`.tutorial-step[data-step="${stepNumber}"]`);
  if (currentStep) {
    currentStep.style.display = 'block';
    setTimeout(() => {
      currentStep.classList.add('active');
    }, 50);
  }
  
  // Update the step counter
  const stepIndicator = document.getElementById('tutorial-step-indicator');
  if (stepIndicator) {
    stepIndicator.textContent = `${stepNumber}/${totalTutorialSteps}`;
  }
  
  // Update current step tracker
  currentTutorialStep = stepNumber;
  
  // Update button states
  updateButtonStates();
}

// Update the enabled/disabled state of navigation buttons
function updateButtonStates() {
  const prevButton = document.getElementById('prev-tutorial');
  const nextButton = document.getElementById('next-tutorial');
  
  if (prevButton) {
    prevButton.disabled = (currentTutorialStep === 1);
  }
  
  if (nextButton) {
    nextButton.disabled = (currentTutorialStep === totalTutorialSteps);
  }
}

// Create a new file with the editor (placeholder function to be implemented in editor.js)
function createNewFile(fileName, fileType, initialContent) {
  // This function would integrate with your editor's file creation functionality
  console.log(`Creating new file: ${fileName} of type ${fileType}`);
  // Example implementation:
  // 1. Add the file to the file tree
  // 2. Set it as the active file
  // 3. Set its initial content
  // 4. Trigger any necessary UI updates
  
  // For now, just show a message in the console
  console.log("Initial content:", initialContent);
  
  // Return true if successful
  return true;
}

// Highlight specific code in the editor (placeholder function)
function highlightCode(lineStart, lineEnd) {
  console.log(`Highlighting lines ${lineStart} to ${lineEnd}`);
  // Implementation would depend on your editor
}

// Draggable functionality
function startDrag(e) {
  // Only handle left mouse button
  if (e.button !== 0) return;
  
  isDragging = true;
  
  // Get initial positions
  const rect = tutorialWidget.getBoundingClientRect();
  initialX = rect.left;
  initialY = rect.top;
  
  // Get mouse start position
  dragStartX = e.clientX;
  dragStartY = e.clientY;
  
  // Add dragging class for visual feedback
  tutorialWidget.classList.add('dragging');
  
  // Prevent default behavior
  e.preventDefault();
}

function drag(e) {
  if (!isDragging) return;
  
  // Calculate new position
  const dx = e.clientX - dragStartX;
  const dy = e.clientY - dragStartY;
  
  // Get window boundaries
  const maxX = window.innerWidth - tutorialWidget.offsetWidth;
  const maxY = window.innerHeight - tutorialWidget.offsetHeight;
  
  // Set new position with boundaries
  const newX = Math.min(Math.max(0, initialX + dx), maxX);
  const newY = Math.min(Math.max(0, initialY + dy), maxY);
  
  tutorialWidget.style.left = newX + 'px';
  tutorialWidget.style.top = newY + 'px';
  tutorialWidget.style.transform = 'none';
  
  // Prevent default
  e.preventDefault();
}

function endDrag() {
  if (isDragging) {
    isDragging = false;
    tutorialWidget.classList.remove('dragging');
  }
}
