// Toggle visibility of sections and clear forms
function showSection(sectionId) {
  const sections = document.querySelectorAll('.section');

  sections.forEach(section => {
    section.classList.remove('active');
    const form = section.querySelector('form');
    if (form) clearForm(form.id); // Clear values when switching
  });

  document.getElementById(sectionId).classList.add('active');
}


// Clear form values (handles browser autocomplete too)
function clearForm(formId) {
  const form = document.getElementById(formId);
  form.reset(); // Reset form defaults

  // Clear input values explicitly
  const inputs = form.querySelectorAll('input, select, textarea');
  inputs.forEach(input => {
    if (input.type !== 'submit' && input.type !== 'button') {
      input.value = '';
    }
  });
}

// Handle Register Form Submission
document.getElementById('registerForm').addEventListener('submit', async (e) => {
  e.preventDefault();

  const form = e.target;
  const formData = new FormData(form);
  const data = Object.fromEntries(formData.entries());

  try {
    const response = await fetch('/register', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(data)
    });

    if (response.ok) {
      alert('Registration successful!');
      clearForm('registerForm');
      showSection('login');
    } else {
      const errorMessage = await response.text();
      alert(`Error: ${errorMessage}`);
    }
  } catch (error) {
    console.error('Error during registration:', error);
    alert('Registration failed!');
  }
});

// Handle Login Form Submission
// Handle Login Form Submission
document.getElementById('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();

  const form = e.target;
  const formData = new FormData(form);
  const data = Object.fromEntries(formData.entries());

  try {
    const response = await fetch('/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });

    // Parse JSON exactly one time:
    const result = await response.json();

    if (response.ok) {
      // Now result.userId will actually exist (assuming your backend sends it)
      localStorage.setItem('userId', result.userId);
      clearForm('loginForm');
      window.location.href = 'http://localhost:3000/dashboard.html';
    } else {
      alert(`Login failed: ${result.message || 'Unknown error'}`);
    }
  } catch (error) {
    console.error('Error during login:', error);
    alert('Login failed!');
  }
});
