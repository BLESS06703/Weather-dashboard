// WebSocket Server (Node.js with Express and ws)
// Run with: node websocket.js

const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const axios = require('axios');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const API_KEY = '';
const WEATHER_API = 'https://api.openweathermap.org/data/2.5/weather';

// Store connected clients
const clients = new Set();

// Store active city subscriptions
const citySubscriptions = new Map();

// Serve static files
app.use(express.static(path.join(__dirname, '/')));

// WebSocket connection handler
wss.on('connection', (ws) => {
    console.log('New client connected');
    clients.add(ws);
    
    // Send initial connection confirmation
    ws.send(JSON.stringify({
        type: 'connection',
        message: 'Connected to weather WebSocket server',
        timestamp: new Date().toISOString()
    }));
    
    // Handle messages from client
    ws.on('message', async (message) => {
        try {
            const data = JSON.parse(message);
            
            switch (data.type) {
                case 'subscribe':
                    await handleSubscribe(ws, data.city);
                    break;
                    
                case 'unsubscribe':
                    handleUnsubscribe(ws, data.city);
                    break;
                    
                case 'refresh':
                    await handleRefresh(ws, data.city);
                    break;
                    
                default:
                    console.log('Unknown message type:', data.type);
            }
        } catch (error) {
            console.error('Error processing message:', error);
            ws.send(JSON.stringify({
                type: 'error',
                message: 'Failed to process message'
            }));
        }
    });
    
    // Handle client disconnect
    ws.on('close', () => {
        console.log('Client disconnected');
        clients.delete(ws);
        
        // Clean up subscriptions
        citySubscriptions.forEach((subscribers, city) => {
            subscribers.delete(ws);
            if (subscribers.size === 0) {
                citySubscriptions.delete(city);
            }
        });
    });
});

// Handle city subscription
async function handleSubscribe(ws, city) {
    if (!city) return;
    
    // Add to subscriptions
    if (!citySubscriptions.has(city)) {
        citySubscriptions.set(city, new Set());
        // Start polling for this city
        startCityPolling(city);
    }
    
    citySubscriptions.get(city).add(ws);
    
    // Send immediate weather data
    const weather = await fetchWeatherData(city);
    if (weather) {
        ws.send(JSON.stringify({
            type: 'weather_update',
            city: city,
            data: weather,
            timestamp: new Date().toISOString()
        }));
    }
}

// Handle city unsubscription
function handleUnsubscribe(ws, city) {
    if (city && citySubscriptions.has(city)) {
        citySubscriptions.get(city).delete(ws);
        if (citySubscriptions.get(city).size === 0) {
            citySubscriptions.delete(city);
        }
    }
}

// Handle manual refresh
async function handleRefresh(ws, city) {
    if (city) {
        const weather = await fetchWeatherData(city);
        if (weather) {
            ws.send(JSON.stringify({
                type: 'weather_update',
                city: city,
                data: weather,
                timestamp: new Date().toISOString()
            }));
        }
    }
}

// Fetch weather data from API
async function fetchWeatherData(city) {
    try {
        const response = await axios.get(WEATHER_API, {
            params: {
                q: city,
                appid: API_KEY,
                units: 'metric'
            }
        });
        
        return {
            city: response.data.name,
            country: response.data.sys.country,
            temp: response.data.main.temp,
            feelsLike: response.data.main.feels_like,
            humidity: response.data.main.humidity,
            pressure: response.data.main.pressure,
            description: response.data.weather[0].description,
            icon: response.data.weather[0].icon,
            windSpeed: response.data.wind.speed,
            lat: response.data.coord.lat,
            lon: response.data.coord.lon
        };
    } catch (error) {
        console.error(`Error fetching weather for ${city}:`, error.message);
        return null;
    }
}

// Start polling for a city
function startCityPolling(city) {
    // Check if already polling
    if (global.pollingIntervals && global.pollingIntervals[city]) {
        return;
    }
    
    if (!global.pollingIntervals) {
        global.pollingIntervals = {};
    }
    
    // Poll every 30 seconds
    global.pollingIntervals[city] = setInterval(async () => {
        const subscribers = citySubscriptions.get(city);
        if (!subscribers || subscribers.size === 0) {
            // No subscribers, stop polling
            clearInterval(global.pollingIntervals[city]);
            delete global.pollingIntervals[city];
            return;
        }
        
        const weather = await fetchWeatherData(city);
        if (weather) {
            const message = JSON.stringify({
                type: 'weather_update',
                city: city,
                data: weather,
                timestamp: new Date().toISOString()
            });
            
            subscribers.forEach(client => {
                if (client.readyState === WebSocket.OPEN) {
                    client.send(message);
                }
            });
        }
    }, 30000); // 30 seconds
}

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        clients: clients.size,
        subscriptions: citySubscriptions.size,
        timestamp: new Date().toISOString()
    });
});

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`WebSocket server running on port ${PORT}`);
    console.log(`WebSocket URL: ws://localhost:${PORT}`);
    console.log(`HTTP URL: http://localhost:${PORT}`);
});

