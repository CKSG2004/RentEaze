const ownerId = localStorage.getItem("userId");
console.log("Fetching my properties for owner ID:", ownerId);
fetchProperties(); // Fetch properties on page load

// Switch visible dashboard section
function showDashboardSection(id, btn) {
  document.querySelectorAll('.dashboard-section').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');

  // Clear results if home tab is selected
  if (id === 'home') document.getElementById('searchResults').innerHTML = '';

  // Update active button styles
  document.querySelectorAll('.dashboard-nav button').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
}

// Search for properties by location
async function searchProperties() {
  const native = document.getElementById('searchNative').value.trim();
  const resultsContainer = document.getElementById('searchResults');
  resultsContainer.innerHTML = ''; // Clear previous results

  if (!native) {
    resultsContainer.innerHTML = '<p>Please enter a location to search.</p>';
    return;
  }

  try {
    const res = await fetch(`/api/properties?native=${encodeURIComponent(native)}`);
    const data = await res.json();

    // Filter out properties with status 'closed'
    const openProperties = data.filter(prop => prop.status === 'open');

    if (!openProperties.length) {
      resultsContainer.innerHTML = '<p>No open properties found for that location.</p>';
      return;
    }

    openProperties.forEach(prop => {
      const card = document.createElement('div');
      card.className = 'search-result';
      card.innerHTML = `
        <h3>${prop.name}</h3>
        <p><strong>Location:</strong> ${prop.address}</p>
        <p><strong>Price:</strong> ₹${prop.price}</p>
        <p><strong>Status:</strong> ${prop.status}</p>
        <button onclick="sendRentalRequest(${prop.id})">Request Rental</button>
      `;
      resultsContainer.appendChild(card);
    });
  } catch (err) {
    console.error(err);
    resultsContainer.innerHTML = '<p>Error fetching properties. Please try again later.</p>';
  }
}


// Fetch and display user's properties
function fetchProperties() {
  console.log('Fetching my properties for owner ID:', ownerId);

  fetch(`/api/my-properties?owner_id=${ownerId}`)
    .then(res => res.json())
    .then(properties => {
      const list = document.getElementById('propertiesList');
      list.innerHTML = '';

      if (!properties.length) {
        list.innerHTML = '<p>You have no properties listed.</p>';
        return;
      }

      properties.forEach(p => {
        const card = document.createElement('div');
        card.className = 'property-card';
        card.innerHTML = `
          <h4>${p.name}</h4>
          <p>Size: ${p.size} sqft</p>
          <p>Rooms: ${p.rooms}</p>
          <p>Address: ${p.address}</p>
          <p>Price: ₹${p.price}</p>
          <p>Status: ${p.status}</p>
          <button class="btn delete-btn" onclick="deleteProperty(${p.id})">Delete</button>
          <!-- Only show toggle button if property status is closed -->
          ${p.status === 'closed' ? `
            <button class="btn toggle-status-btn" onclick="toggleStatus(${p.id})">Set as Open</button>` 
            : ''}
        `;
        list.appendChild(card);
      });
    })
    .catch(err => {
      console.error('Error fetching properties:', err);
      document.getElementById('propertiesList').innerHTML = '<p>Error loading properties. Please try again later.</p>';
    });
}


// Delete a property and refresh the list
function deleteProperty(propId) {
  if (!confirm('Are you sure you want to delete this property?')) return;

  fetch(`/api/properties/${propId}`, {
    method: 'DELETE'
  })
    .then(res => {
      if (!res.ok) throw new Error('Failed to delete');
      return res.json();
    })
    .then(() => {
      alert('Property deleted successfully');
      fetchProperties(); // Refresh list
    })
    .catch(err => {
      console.error('Error deleting property:', err);
      alert('Could not delete property');
    });
}

// Add new property
function handleAddPropertyForm() {
  const addPropertyForm = document.getElementById('addPropertyForm');
  addPropertyForm.addEventListener('submit', function(e) {
    e.preventDefault();

    const propertyData = {
      name: document.getElementById('propertyName').value,
      size: document.getElementById('propertySize').value,
      rooms: document.getElementById('propertyRooms').value,
      address: document.getElementById('propertyAddress').value,
      price: document.getElementById('propertyPrice').value
    };

    fetch('/api/properties', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(propertyData)
    })
    .then(response => response.json())
    .then(data => {
      alert('Property added successfully');
      fetchProperties(); // Refresh list
      addPropertyForm.reset(); // Clear form
    })
    .catch(error => {
      console.error('Error adding property:', error);
      alert('Failed to add property');
    });
  });
}

// Fetch and display rental requests for the owner
function fetchRentalRequests() {
  console.log('Fetching rental requests for owner ID:', ownerId);

  fetch(`/api/rental-requests?owner_id=${ownerId}`)
    .then(res => res.json())
    .then(requests => {
      const requestList = document.getElementById('rentalRequestsList');
      requestList.innerHTML = '';  // Clear previous results

      if (!requests.length) {
        requestList.innerHTML = '<p>No rental requests received.</p>';
        return;
      }

      requests.forEach(req => {
        const card = document.createElement('div');
        card.className = 'rental-request-card';
        card.setAttribute('data-id', req.req_id);  // Add this line to set ID
        const status = req.status || 'open';  // Default to "open" if status is missing

        // Add contact info to the card
        card.innerHTML = `
          <p><strong>Requested by:</strong> ${req.req_user_name}</p>
          <p><strong>Contact:</strong> ${req.req_user_contact}</p>  <!-- Displaying contact info -->
          <p><strong>Property:</strong> ${req.prop_name}</p>
          <p><strong>Status:</strong> ${status}</p>
          <button class="btn accept-btn" onclick="handleRentalRequest(${req.req_id}, 'accept')">Accept</button>
          <button class="btn reject-btn" onclick="handleRentalRequest(${req.req_id}, 'reject')">Reject</button>
        `;
        requestList.appendChild(card);
      });
    })
    .catch(err => {
      console.error('Error fetching rental requests:', err);
      document.getElementById('rentalRequestsList').innerHTML = '<p>Error loading rental requests. Please try again later.</p>';
    });
}


// Define sendRentalRequest function
function sendRentalRequest(propertyId) {
  const userId = localStorage.getItem("userId");

  if (!userId) {
    alert('You must be logged in to request rental');
    return;
  }

  const requestData = { prop_id: propertyId };
  console.log("Sending rental request with data:", requestData);

  fetch('/api/request-rental', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${localStorage.getItem('authToken')}`
    },
    credentials: 'same-origin',
    body: JSON.stringify({
      propId: propertyId,
    })
  })
  .then(response => response.json())
  .then(data => {
    if (data.message) {
      console.log(data.message);
      alert('Rental request sent successfully!'); // ✅ Notification added
    } else {
      console.error('Failed to send rental request', data);
    }
  })
  .catch(error => {
    console.error('Error:', error);
  });
}

// Handle rental request accept/reject
function handleRentalRequest(reqId, action) {
  console.log(`Handling request ${action} for request ID: ${reqId}`);
  const actionUrl = action === 'accept' ? '/api/rental-requests/accept' : '/api/rental-requests/reject';

  fetch(`${actionUrl}/${reqId}`, { method: 'POST' })
    .then(res => res.json())
    .then(data => {
      if (data.success) {
        alert(`Rental request ${action}ed successfully!`);

        // ✅ Update the status text in the card
        const card = document.querySelector(`[data-id="${reqId}"]`);
        if (card) {
          const statusPara = card.querySelector('p:nth-child(3)');
          if (statusPara) {
            statusPara.innerHTML = `<strong>Status:</strong> ${action === 'accept' ? 'closed' : 'rejected'}`;
          }

          // ✅ Optionally disable or hide the action buttons
          const acceptBtn = card.querySelector('.accept-btn');
          const rejectBtn = card.querySelector('.reject-btn');
          if (acceptBtn) acceptBtn.style.display = 'none';
          if (rejectBtn) rejectBtn.style.display = 'none';
        }
      } else {
        alert(`Failed to ${action} rental request.`);
      }
    })
    .catch(error => {
      console.error('Error processing rental request:', error);
      alert('Error processing rental request.');
    });
}


function setAsOpen() {
  const propertyId = getSelectedPropertyId();  // Get the property ID that needs to be updated
  if (!propertyId) {
    alert('No property selected!');
    return;
  }

  fetch(`/api/properties/${propertyId}/set-open`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
  })
  .then(response => response.json())
  .then(data => {
    if (data.success) {
      alert('Property set as open');
      // Update the UI to reflect the change (if needed)
    } else {
      alert('Failed to set as open');
    }
  })
  .catch(error => {
    console.error('Error:', error);
    alert('Error setting property as open');
  });
}

function toggleStatus(propertyId) {
  console.log(`Toggling status for property ID: ${propertyId}`);

  fetch(`/api/properties/${propertyId}/toggle-status`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
  })
  .then(response => {
    if (!response.ok) {
      return response.json().then(data => { throw new Error(data.error || 'Unknown error'); });
    }
    return response.json();
  })
  .then(data => {
    if (data.success) {
      alert('Property status updated to open.');
      fetchProperties(); // Refresh the properties list
    } else {
      alert('Failed to update property status.');
    }
  })
  .catch(error => {
    console.error('Error toggling property status:', error);
    alert(`Error toggling property status: ${error.message}`);
  });
}


// Logout
function logout() {
  // Clear the saved userId (or any other session tokens you might have)
  localStorage.removeItem('userId');
  // Redirect to your login/auth page
  window.location.href = '/auth.html'; 
}

// On page load
document.addEventListener("DOMContentLoaded", function () {
  fetchProperties();
  fetchRentalRequests();
  handleAddPropertyForm();
});
