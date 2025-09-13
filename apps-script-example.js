/**
 * Google Apps Script Example for AI-lure Orchestrator
 * 
 * Copy this code into Google Apps Script (script.google.com)
 * Replace YOUR_API_KEY with your actual API key from the dashboard
 * Replace YOUR_REPLIT_URL with your deployed Replit app URL
 */

// Configuration
const API_BASE_URL = 'https://YOUR_REPLIT_URL'; // e.g., 'https://your-app.replit.app'
const API_KEY = 'YOUR_API_KEY'; // Get this from your dashboard

/**
 * Function to call AI-lure Orchestrator from Google Sheets
 * Usage in a cell: =orchestrateAPI(["weather", "news"], "London", "technology")
 */
function orchestrateAPI(integrations, location = "San Francisco", category = "general") {
  try {
    const payload = {
      integrations: Array.isArray(integrations) ? integrations : [integrations],
      data: {
        location: location,
        category: category
      }
    };

    const options = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': API_KEY
      },
      payload: JSON.stringify(payload)
    };

    const response = UrlFetchApp.fetch(`${API_BASE_URL}/api/v1/orchestrate`, options);
    
    if (response.getResponseCode() !== 200) {
      throw new Error(`API Error: ${response.getResponseCode()} - ${response.getContentText()}`);
    }

    const data = JSON.parse(response.getContentText());
    
    // Return simplified data for Sheets
    if (data.success && data.results && data.results.length > 0) {
      // If single integration, return just the data
      if (data.results.length === 1) {
        return JSON.stringify(data.results[0].data);
      }
      // If multiple integrations, return combined results
      return JSON.stringify(data.results.map(r => ({
        integration: r.integration,
        status: r.status,
        data: r.data
      })));
    }
    
    return "No data available";
    
  } catch (error) {
    console.error('Orchestrator API Error:', error);
    return `Error: ${error.message}`;
  }
}

/**
 * Simple weather function for Google Sheets
 * Usage: =getWeather("Paris")
 */
function getWeather(location) {
  const result = orchestrateAPI(["weather"], location);
  try {
    const data = JSON.parse(result);
    return `${data.location}: ${data.temperature}°C, ${data.condition}`;
  } catch (e) {
    return result; // Return error message if parsing fails
  }
}

/**
 * Simple news function for Google Sheets
 * Usage: =getNews("technology")
 */
function getNews(category) {
  const result = orchestrateAPI(["news"], "N/A", category);
  try {
    const data = JSON.parse(result);
    if (data.articles && data.articles.length > 0) {
      return data.articles[0].title; // Return first headline
    }
    return "No news available";
  } catch (e) {
    return result; // Return error message if parsing fails
  }
}

/**
 * Test function - run this to verify your setup
 */
function testConnection() {
  const result = orchestrateAPI(["hello"]);
  console.log('Test Result:', result);
  return result;
}

/**
 * Advanced: Bulk data import to Google Sheets
 * This function fills multiple rows with data
 */
function importDataToSheet() {
  const sheet = SpreadsheetApp.getActiveSheet();
  
  // Example: Get weather for multiple cities
  const cities = ["London", "Paris", "Tokyo", "New York", "Sydney"];
  
  // Clear existing data and add headers
  sheet.clear();
  sheet.getRange(1, 1, 1, 4).setValues([["City", "Temperature", "Condition", "Humidity"]]);
  
  cities.forEach((city, index) => {
    try {
      const result = orchestrateAPI(["weather"], city);
      const data = JSON.parse(result);
      
      sheet.getRange(index + 2, 1, 1, 4).setValues([[
        data.location || city,
        data.temperature || "N/A",
        data.condition || "N/A", 
        data.humidity || "N/A"
      ]]);
      
      // Small delay to avoid rate limiting
      Utilities.sleep(100);
      
    } catch (error) {
      console.error(`Error for ${city}:`, error);
      sheet.getRange(index + 2, 1, 1, 4).setValues([[city, "Error", "Error", "Error"]]);
    }
  });
}