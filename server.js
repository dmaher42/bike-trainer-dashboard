const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');

const app = express();
const PORT = process.env.PORT || 3001;

// Your actual Google Maps API key (stored securely on server)
const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY;

app.use(cors());
app.use(express.json());

// Proxy endpoint for Street View images
app.post('/api/streetview', async (req, res) => {
  try {
    const { location, heading, pitch, fov, size } = req.body;
    
    const url = `https://maps.googleapis.com/maps/api/streetview?` +
      `size=${size}&` +
      `location=${location}&` +
      `heading=${heading}&` +
      `pitch=${pitch}&` +
      `fov=${fov}&` +
      `key=${GOOGLE_MAPS_API_KEY}`;
    
    // Return the URL directly (client will fetch it)
    res.json({ imageUrl: url });
  } catch (error) {
    res.status(500).json({ error: 'Failed to generate Street View URL' });
  }
});

// Validate API key
app.get('/api/validate-key', (req, res) => {
  if (GOOGLE_MAPS_API_KEY) {
    res.json({ valid: true });
  } else {
    res.status(500).json({ valid: false });
  }
});

app.listen(PORT, () => {
  console.log(`Map proxy server running on port ${PORT}`);
});
