// Import required modules
const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bodyParser = require('body-parser');
const bcrypt = require('bcrypt');
const session = require('express-session');

const app = express();
const port = 3000;

app.use(session({
  secret: 'sessionSecret',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false }
}));

// Middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static('public'));

// Connect to SQLite
const db = new sqlite3.Database('./db/database.db', err => {
  if (err) console.error('Error connecting to DB:', err.message);
  else console.log('Connected to SQLite database.');
});

// Register route
app.post('/register', async (req, res) => {
  const { user_name, user_contact, user_address, user_occupation, user_password } = req.body;
  if (!user_name || !user_contact || !user_address || !user_occupation || !user_password) {
    return res.status(400).send('All fields are required!');
  }
  try {
    const hash = await bcrypt.hash(user_password, 10);
    db.run(
      `INSERT INTO user (user_name, user_contact, user_address, user_occupation, user_password)
       VALUES (?,?,?,?,?)`,
      [user_name, user_contact, user_address, user_occupation, hash],
      function(err) {
        if (err) {
          console.error('Register error:', err.message);
          return res.status(500).send('Error registering user.');
        }
        res.send('User registered successfully!');
      }
    );
  } catch (e) {
    console.error(e);
    res.status(500).send('Server error.');
  }
});

// Login route
app.post('/login', (req, res) => {
  const { user_name, user_password } = req.body;
  if (!user_name || !user_password) {
    return res.status(400).send('Username and password are required!');
  }

  db.get(
    `SELECT * FROM user WHERE user_name = ?`,
    [user_name],
    async (err, user) => {
      if (err) {
        console.error('Login lookup error:', err.message);
        return res.status(500).send('Error logging in.');
      }
      if (!user) {
        return res.status(401).send('User not found.');
      }

      const match = await bcrypt.compare(user_password, user.user_password);
      if (!match) {
        return res.status(401).send('Invalid password.');
      }

      // ← Add this line to remember the logged-in user:
      req.session.userId = user.user_id;

      res.json({ message: 'Login successful', userId: user.user_id });
    }
  );
});

// Search properties by address
app.get('/api/properties', (req, res) => {
  const address = req.query.native;
  if (!address) return res.status(400).json({ error: 'Missing location parameter' });

  db.all(
    `SELECT
       prop_id    AS id,
       prop_name  AS name,
       prop_address AS address,
       prop_price AS price,
       prop_status AS status  -- Include prop_status in the result
     FROM property
     WHERE prop_address LIKE ?`,
    [`%${address}%`],
    (err, rows) => {
      if (err) {
        console.error('Search error:', err.message);
        return res.status(500).json({ error: 'Database error' });
      }
      res.json(rows);
    }
  );
});

// Add a new property (uses prop_owner_id correctly)
app.post('/api/properties', (req, res) => {
  const ownerId = req.session.userId;
  if (!ownerId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const { name, size, rooms, address, price } = req.body;
  if (!name || !size || !rooms || !address || !price) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const sql = `
    INSERT INTO property
      (prop_name, prop_size, prop_rooms, prop_address, prop_owner_id, prop_price, prop_status)
    VALUES (?, ?, ?, ?, ?, ?, 'open')  -- 'open' as the default value for prop_status
  `;
  const params = [name, size, rooms, address, ownerId, price];

  db.run(sql, params, function(err) {
    if (err) {
      console.error('Insert property error:', err.message);
      return res.status(500).json({ error: 'Failed to add property' });
    }
    res.status(201).json({
      message: 'Property added successfully',
      propertyId: this.lastID
    });
  });
});

// Get properties owned by a specific user (filters on prop_owner_id)
app.get('/api/my-properties', (req, res) => {
  const ownerId = req.query.owner_id;
  if (!ownerId) return res.status(400).json({ error: 'Missing owner_id parameter' });

  db.all(
    `SELECT
       prop_id       AS id,
       prop_name     AS name,
       prop_size     AS size,
       prop_rooms    AS rooms,
       prop_address  AS address,
       prop_price    AS price,
       prop_status   AS status  -- Include prop_status in the result
     FROM property
     WHERE prop_owner_id = ?`,
    [ownerId],
    (err, rows) => {
      if (err) {
        console.error('Fetch my-properties error:', err.message);
        return res.status(500).json({ error: 'Database error' });
      }
      res.json(rows);
    }
  );
});

// DELETE a property by ID (only its owner may delete it)
app.delete('/api/properties/:id', (req, res) => {
  const ownerId = req.session.userId;
  const propId   = req.params.id;

  if (!ownerId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  // Ensure this property belongs to the logged-in user
  db.get(
    `SELECT prop_owner_id FROM property WHERE prop_id = ?`,
    [propId],
    (err, row) => {
      if (err) {
        console.error('Lookup delete error:', err.message);
        return res.status(500).json({ error: 'Database error' });
      }
      if (!row) {
        return res.status(404).json({ error: 'Property not found' });
      }
      if (row.prop_owner_id !== ownerId) {
        return res.status(403).json({ error: 'Forbidden' });
      }

      // Perform the deletion
      db.run(
        `DELETE FROM property WHERE prop_id = ?`,
        [propId],
        function(err) {
          if (err) {
            console.error('Delete property error:', err.message);
            return res.status(500).json({ error: 'Failed to delete property' });
          }
          res.json({ message: 'Property deleted' });
        }
      );
    }
  );
});

// Send a rental request for a property
app.post('/api/request-rental', (req, res) => {
  const userId = req.session.userId;
  const { propId } = req.body;

  if (!userId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  if (!propId) {
    return res.status(400).json({ error: 'Missing property ID' });
  }

  db.get(`SELECT user_name, user_contact FROM user WHERE user_id = ?`, [userId], (err, userRow) => {
    if (err || !userRow) {
      console.error('User lookup error:', err?.message);
      return res.status(500).json({ error: 'User not found' });
    }

    const { user_name, user_contact } = userRow;

    db.run(
      `INSERT INTO requests (req_user_id, req_user_name, req_user_contact, req_prop_id)
       VALUES (?, ?, ?, ?)`,
      [userId, user_name, user_contact, propId],
      function(err) {
        if (err) {
          console.error('Rental request insert error:', err.message);
          return res.status(500).json({ error: 'Failed to send request' });
        }
        res.status(201).json({ message: 'Rental request sent successfully', reqId: this.lastID });
      }
    );
  });
});

// Get rental requests for a specific owner
app.get('/api/rental-requests', (req, res) => {
  const ownerId = req.query.owner_id;

  if (!ownerId) {
    return res.status(400).json({ error: 'Missing owner_id in query' });
  }

  db.all(
    `SELECT r.req_id, r.req_user_name, r.req_user_id, r.req_prop_id, p.prop_name, u.user_contact AS req_user_contact
     FROM requests r
     JOIN property p ON r.req_prop_id = p.prop_id
     JOIN user u ON r.req_user_id = u.user_id
     WHERE p.prop_owner_id = ?`,
    [ownerId],
    (err, rows) => {
      if (err) {
        console.error('Fetch rental requests error:', err.message);
        return res.status(500).json({ error: 'Database error' });
      }
      res.json(rows);
    }
  );
});


// Accept rental request
app.post('/api/rental-requests/accept/:id', (req, res) => {
  const reqId = req.params.id;

  // First, find the property ID from this request
  db.get("SELECT req_prop_id FROM requests WHERE req_id = ?", [reqId], (err, row) => {
    if (err || !row) {
      console.error("Error fetching request:", err?.message);
      return res.status(500).json({ success: false, error: "Request not found" });
    }

    const propertyId = row.req_prop_id;

    // Start transaction-like operations
    db.serialize(() => {
      // Step 1: Update the property status to 'closed'
      db.run("UPDATE property SET prop_status = 'closed' WHERE prop_id = ?", [propertyId], function(err) {
        if (err) {
          console.error("Error updating property status:", err.message);
          return res.status(500).json({ success: false, error: err.message });
        }

        // Step 2: Delete all rental requests for this property
        db.run("DELETE FROM requests WHERE req_prop_id = ?", [propertyId], function(err) {
          if (err) {
            console.error("Error deleting rental requests:", err.message);
            return res.status(500).json({ success: false, error: "Failed to clean up rental requests" });
          }

          // All is good: send success response
          res.json({ success: true, message: "Rental request accepted, property closed and other requests deleted" });
        });
      });
    });
  });
});


// Reject a rental request
app.post('/api/rental-requests/reject/:reqId', (req, res) => {
  const reqId = req.params.reqId;

  db.run(
    `DELETE FROM requests WHERE req_id = ?`,
    [reqId],
    (err) => {
      if (err) {
        console.error('Error rejecting rental request:', err.message);
        return res.status(500).json({ success: false, message: 'Error rejecting rental request.' });
      }
      res.json({ success: true });
    }
  );
});

app.post('/api/properties/:id/set-open', (req, res) => {
  const propertyId = req.params.id;

  db.run(
    `UPDATE property SET prop_status = 'open' WHERE prop_id = ?`,
    [propertyId],
    function(err) {
      if (err) {
        console.error('Error updating property status:', err.message);
        return res.status(500).json({ success: false, error: 'Error setting property as open' });
      }
      res.json({ success: true });
    }
  );
});

app.post('/api/properties/:id/toggle-status', (req, res) => {
  const propertyId = req.params.id;

  // Fetch the property from the database to get its current status
  db.get(`SELECT prop_status FROM property WHERE prop_id = ?`, [propertyId], (err, row) => {
    if (err) {
      console.error('Error fetching property status:', err.message);
      return res.status(500).json({ success: false, message: 'Error fetching property status' });
    }

    if (!row) {
      return res.status(404).json({ success: false, message: 'Property not found' });
    }

    // Toggle the status
    const newStatus = row.prop_status === 'closed' ? 'open' : 'closed';

    // Update the property status in the database
    db.run(`UPDATE property SET prop_status = ? WHERE prop_id = ?`, [newStatus, propertyId], function(err) {
      if (err) {
        console.error('Error updating property status:', err.message);
        return res.status(500).json({ success: false, message: 'Error updating property status' });
      }

      // Send a success response
      res.json({ success: true, message: `Property status updated to ${newStatus}` });
    });
  });
});




// Start server
app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}//auth.html`);
});
