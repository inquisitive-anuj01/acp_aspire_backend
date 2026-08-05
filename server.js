const express = require('express');
const cors = require('cors');
const path = require('path');
const { google } = require('googleapis');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const app = express();
const PORT = process.env.PORT || 5000;

// Allow all origins — this is a public lead-capture form, no restriction needed.
// This handles file://, Live Server (127.0.0.1:5500), localhost, and production equally.
app.use(cors());
app.use(express.json());


// Google Sheets setup
const SPREADSHEET_ID = process.env.GOOGLE_SHEET_ID;
const SHEET_NAME = 'Sheet1';

// Initialize Google Sheets API
const auth = new google.auth.GoogleAuth({
  credentials: {
    client_email: process.env.GOOGLE_CLIENT_EMAIL,
    private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
  },
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});

// Test Google Sheets connection
async function testConnection() {
  try {
    const sheets = google.sheets({ version: 'v4', auth });

    // Try to get sheet info
    const response = await sheets.spreadsheets.get({
      spreadsheetId: SPREADSHEET_ID,
    });

    console.log('✅ Connected to Google Sheets:', response.data.properties.title);
    return true;
  } catch (error) {
    console.error('❌ Google Sheets connection failed:', error.message);
    return false;
  }
}


async function prepareSheet() {
  try {
    const sheets = google.sheets({ version: 'v4', auth });

    // Check if headers exist
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_NAME}!A1:I1`,
    });

    // If no headers, create them
    if (!response.data.values) {
      const headers = [
        ['Timestamp', 'Name', 'Email', 'Phone', 'City', 'Details', 'Form Type', 'Source', 'Submission Time']
      ];

      await sheets.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range: `${SHEET_NAME}!A1:I1`,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: headers }
      });

      console.log('✅ Headers created in Google Sheet');
    } else {
      console.log('✅ Headers already exist in Google Sheet');
    }
  } catch (error) {
    console.error(' Error preparing sheet:', error.message);
  }
}

// API endpoint to submit form data
app.post('/api/submit-form', async (req, res) => {
  try {
    console.log('📥 Received form submission:', req.body);

    const {
      name,
      email,
      phone,
      city,
      details,
      formType = 'general',
      timestamp = new Date().toISOString(),
      source = 'website'
    } = req.body;

    // Validate required fields
    if (!name || !email || !phone || !city) {
      return res.status(400).json({
        error: 'Please fill all required fields: Name, Email, Phone, City'
      });
    }

    // Format phone number (remove non-numeric)
    const cleanPhone = phone.toString().replace(/\D/g, '');

    // Format data for Google Sheets
    const values = [[
      timestamp,
      name,
      email,
      cleanPhone,
      city,
      details || '',
      formType,
      source,
      new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })
    ]];

    console.log('📝 Preparing to save to Google Sheets:', { name, email, city });

    // Append data to Google Sheet
    const sheets = google.sheets({ version: 'v4', auth });

    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_NAME}!A:I`,
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values },
    });

    console.log('✅ Data written to Google Sheets:', { name, email, city });

    // Return success response
    res.status(200).json({
      success: true,
      message: 'Form submitted successfully',
      data: {
        name,
        email,
        phone: cleanPhone,
        city,
        formType
      }
    });

  } catch (error) {
    console.error('❌ Error submitting form:', error);

    res.status(500).json({
      error: 'Failed to submit form. Please try again later.',
      details: error.message,
      code: error.code
    });
  }
});

// Test endpoint
app.get('/api/test', async (req, res) => {
  try {
    const sheets = google.sheets({ version: 'v4', auth });

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_NAME}!A1:I10`,
    });

    res.status(200).json({
      success: true,
      message: 'Google Sheets connection successful',
      data: response.data.values || []
    });
  } catch (error) {
    res.status(500).json({
      error: 'Google Sheets connection failed',
      details: error.message
    });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    message: 'Server is running',
    timestamp: new Date().toISOString()
  });
});

// Get all submissions (for admin)
app.get('/api/submissions', async (req, res) => {
  try {
    const sheets = google.sheets({ version: 'v4', auth });

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_NAME}!A:I`,
    });

    res.status(200).json({
      success: true,
      data: response.data.values || []
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to fetch submissions',
      details: error.message
    });
  }
});

// Serve frontend static files (index.html + assets) from parent directory
app.use(express.static(path.join(__dirname, '..')));

// Start server
async function startServer() {
  // Test connection
  const connected = await testConnection();

  if (connected) {
    // Prepare sheet (create headers if needed)
    await prepareSheet();

    app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`📊 Google Sheet: https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}`);
      console.log(`🔗 Test API: http://localhost:${PORT}/api/test`);
      console.log(`🔗 Health: http://localhost:${PORT}/health`);
      console.log(`📝 Submit form: http://localhost:${PORT}/api/submit-form`);
    });
  } else {
    console.error('Cannot start server due to Google Sheets connection failure');
    process.exit(1);
  }
}

startServer();