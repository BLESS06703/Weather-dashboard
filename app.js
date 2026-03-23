// Weather Dashboard Application
class WeatherDashboard {
    constructor() {
        this.apiKey = '';
        this.baseUrl = 'https://api.openweathermap.org/data/2.5';
        this.cities = [];
        this.weatherData = new Map();
        this.unit = 'celsius'; // celsius or fahrenheit
        this.refreshInterval = 300000; // 5 minutes
        this.intervalId = null;
        this.charts = {};
        this.map = null;
        this.mapMarkers = [];
        
        this.init();
    }
    
    async init() {
        this.loadSettings();
        this.loadCities();
        this.setupEventListeners();
        this.setupWebSocket();
        this.startAutoRefresh();
        this.hideLoading();
        
        if (this.cities.length > 0) {
            await this.refreshAllWeather();
        }
        
        this.updateUI();
    }
    
    loadSettings() {
        // Load theme
        const savedTheme = localStorage.getItem('theme') || 'auto';
        this.applyTheme(savedTheme);
        
        // Load unit preference
        const savedUnit = localStorage.getItem('unit') || 'celsius';
        this.setUnit(savedUnit);
        
        // Load refresh interval
        const savedInterval = localStorage.getItem('refreshInterval');
        if (savedInterval) {
            this.refreshInterval = parseInt(savedInterval);
        }
    }
    
    loadCities() {
        const saved = localStorage.getItem('weather_cities');
        if (saved) {
            this.cities = JSON.parse(saved);
        } else {
            this.cities = ['Lilongwe', 'Blantyre', 'Mzuzu', 'Zomba', 'Kalonga', 'Chikwawa', 'Salima', 'Mangochi'];
            this.saveCities();
        }
        this.updateCitySelectors();
    }
    
    saveCities() {
        localStorage.setItem('weather_cities', JSON.stringify(this.cities));
        this.updateCitySelectors();
        this.updateStats();
    }
    
    setupEventListeners() {
        // Navigation
        document.querySelectorAll('.nav-item').forEach(item => {
            item.addEventListener('click', (e) => {
                e.preventDefault();
                const view = item.dataset.view;
                this.switchView(view);
            });
        });
        
        // Add city
        document.getElementById('addCityBtn').addEventListener('click', () => this.addCity());
        document.getElementById('newCityInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.addCity();
        });
        
        // Search
        document.getElementById('searchInput').addEventListener('input', (e) => {
            this.filterCities(e.target.value);
        });
        
        // Refresh
        document.getElementById('refreshBtn').addEventListener('click', () => this.refreshAllWeather());
        
        // Unit toggle
        document.getElementById('unitToggle').addEventListener('click', (e) => {
            if (e.target.classList.contains('unit-btn')) {
                const unit = e.target.dataset.unit;
                this.setUnit(unit);
            }
        });
        
        // Theme toggle
        document.getElementById('themeToggle').addEventListener('click', () => this.toggleTheme());
        
        // Settings
        document.getElementById('refreshInterval').addEventListener('change', (e) => {
            this.refreshInterval = parseInt(e.target.value);
            localStorage.setItem('refreshInterval', this.refreshInterval);
            this.startAutoRefresh();
            this.showToast('Auto-refresh interval updated', 'success');
        });
        
        document.getElementById('exportDataBtn').addEventListener('click', () => this.exportData());
        document.getElementById('clearDataBtn').addEventListener('click', () => this.clearAllData());
        
        // Forecast city selector
        document.getElementById('forecastCitySelect').addEventListener('change', (e) => {
            if (e.target.value) {
                this.loadForecast(e.target.value);
            }
        });
        
        // Map layer controls
        document.querySelectorAll('.map-layer-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.map-layer-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                const layer = btn.dataset.layer;
                this.updateMapLayer(layer);
            });
        });
        
        // Settings options
        document.querySelectorAll('[data-setting]').forEach(option => {
            option.addEventListener('click', (e) => {
                const setting = option.dataset.setting;
                const value = option.dataset.value;
                if (setting === 'unit') {
                    this.setUnit(value);
                } else if (setting === 'theme') {
                    this.applyTheme(value);
                    localStorage.setItem('theme', value);
                }
                
                document.querySelectorAll(`[data-setting="${setting}"]`).forEach(opt => {
                    opt.classList.remove('active');
                });
                option.classList.add('active');
            });
        });
    }
    
    switchView(view) {
        // Update navigation
        document.querySelectorAll('.nav-item').forEach(item => {
            item.classList.remove('active');
            if (item.dataset.view === view) {
                item.classList.add('active');
            }
        });
        
        // Update views
        document.querySelectorAll('.view').forEach(v => {
            v.classList.remove('active');
        });
        document.getElementById(`${view}View`).classList.add('active');
        
        // Initialize map if needed
        if (view === 'map' && !this.map) {
            this.initMap();
        }
        
        // Refresh analytics if needed
        if (view === 'analytics' && this.weatherData.size > 0) {
            this.updateCharts();
        }
    }
    
    async addCity() {
        const input = document.getElementById('newCityInput');
        const cityName = input.value.trim();
        
        if (!cityName) {
            this.showToast('Please enter a city name', 'warning');
            return;
        }
        
        if (this.cities.some(c => c.toLowerCase() === cityName.toLowerCase())) {
            this.showToast(`${cityName} is already in your dashboard`, 'warning');
            return;
        }
        
        this.showToast(`Fetching weather for ${cityName}...`, 'info');
        
        try {
            const weather = await this.fetchWeather(cityName);
            if (weather) {
                this.cities.push(cityName);
                this.saveCities();
                this.weatherData.set(cityName.toLowerCase(), weather);
                await this.renderWeatherGrid();
                this.showToast(`✅ ${cityName} added successfully!`, 'success');
                input.value = '';
                this.updateStats();
            } else {
                this.showToast(`Could not find city: ${cityName}`, 'error');
            }
        } catch (error) {
            this.showToast(`Error fetching weather for ${cityName}`, 'error');
        }
    }
    
    async fetchWeather(cityName) {
        try {
            const url = `${this.baseUrl}/weather?q=${encodeURIComponent(cityName)}&appid=${this.apiKey}&units=metric`;
            const response = await fetch(url);
            
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            
            const data = await response.json();
            return this.formatWeatherData(data);
        } catch (error) {
            console.error(`Error fetching weather for ${cityName}:`, error);
            return null;
        }
    }
    
    async fetchForecast(cityName) {
        try {
            const url = `${this.baseUrl}/forecast?q=${encodeURIComponent(cityName)}&appid=${this.apiKey}&units=metric`;
            const response = await fetch(url);
            
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            
            const data = await response.json();
            return this.formatForecastData(data);
        } catch (error) {
            console.error(`Error fetching forecast for ${cityName}:`, error);
            return null;
        }
    }
    
    formatWeatherData(data) {
        return {
            city: data.name,
            country: data.sys.country,
            temp: data.main.temp,
            feelsLike: data.main.feels_like,
            humidity: data.main.humidity,
            pressure: data.main.pressure,
            description: data.weather[0].description,
            icon: this.getWeatherIcon(data.weather[0].icon),
            windSpeed: data.wind.speed,
            timestamp: new Date().toLocaleTimeString(),
            lat: data.coord.lat,
            lon: data.coord.lon
        };
    }
    
    formatForecastData(data) {
        const dailyForecasts = {};
        
        data.list.forEach(item => {
            const date = new Date(item.dt * 1000);
            const day = date.toLocaleDateString('en-US', { weekday: 'short' });
            const fullDate = date.toLocaleDateString();
            
            if (!dailyForecasts[fullDate]) {
                dailyForecasts[fullDate] = {
                    date: day,
                    fullDate: fullDate,
                    temps: [],
                    humidity: [],
                    descriptions: [],
                    icon: item.weather[0].icon
                };
            }
            
            dailyForecasts[fullDate].temps.push(item.main.temp);
            dailyForecasts[fullDate].humidity.push(item.main.humidity);
            dailyForecasts[fullDate].descriptions.push(item.weather[0].description);
        });
        
        // Process to get daily aggregates
        return Object.values(dailyForecasts).slice(0, 5).map(day => ({
            date: day.date,
            fullDate: day.fullDate,
            tempMax: Math.max(...day.temps),
            tempMin: Math.min(...day.temps),
            tempAvg: day.temps.reduce((a, b) => a + b, 0) / day.temps.length,
            humidity: day.humidity.reduce((a, b) => a + b, 0) / day.humidity.length,
            description: this.getMostFrequent(day.descriptions),
            icon: this.getWeatherIcon(day.icon)
        }));
    }
    
    getMostFrequent(arr) {
        return arr.sort((a, b) =>
            arr.filter(v => v === a).length - arr.filter(v => v === b).length
        ).pop();
    }
    
    getWeatherIcon(iconCode) {
        const iconMap = {
            '01d': '☀️', '01n': '🌙',
            '02d': '⛅', '02n': '☁️',
            '03d': '☁️', '03n': '☁️',
            '04d': '☁️', '04n': '☁️',
            '09d': '🌧️', '09n': '🌧️',
            '10d': '🌦️', '10n': '🌧️',
            '11d': '⛈️', '11n': '⛈️',
            '13d': '❄️', '13n': '❄️',
            '50d': '🌫️', '50n': '🌫️'
        };
        return iconMap[iconCode] || '🌡️';
    }
    
    convertTemp(celsius) {
        if (this.unit === 'fahrenheit') {
            return (celsius * 9/5 + 32).toFixed(1);
        }
        return celsius.toFixed(1);
    }
    
    setUnit(unit) {
        this.unit = unit;
        localStorage.setItem('unit', unit);
        
        // Update UI
        document.querySelectorAll('.unit-btn').forEach(btn => {
            btn.classList.remove('active');
            if (btn.dataset.unit === unit) {
                btn.classList.add('active');
            }
        });
        
        this.renderWeatherGrid();
        this.updateStats();
    }
    
    async refreshAllWeather() {
        this.showToast('Updating all weather data...', 'info');
        
        for (const city of this.cities) {
            const weather = await this.fetchWeather(city);
            if (weather) {
                this.weatherData.set(city.toLowerCase(), weather);
            }
        }
        
        await this.renderWeatherGrid();
        this.updateStats();
        this.updateCharts();
        
        // Update last sync time
        document.getElementById('lastSyncTime').textContent = new Date().toLocaleTimeString();
        
        this.showToast('All weather data updated!', 'success');
    }
    
    async renderWeatherGrid() {
        const grid = document.getElementById('weatherGrid');
        
        if (this.cities.length === 0) {
            grid.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-cloud-sun"></i>
                    <h3>No Cities Added</h3>
                    <p>Start by adding a city to track real-time weather data</p>
                </div>
            `;
            return;
        }
        
        // Fetch missing weather data
        const fetchPromises = this.cities.map(async city => {
            if (!this.weatherData.has(city.toLowerCase())) {
                const weather = await this.fetchWeather(city);
                if (weather) {
                    this.weatherData.set(city.toLowerCase(), weather);
                }
            }
        });
        
        await Promise.all(fetchPromises);
        
        let html = '';
        
        for (const city of this.cities) {
            const weather = this.weatherData.get(city.toLowerCase());
            
            if (!weather) {
                html += `
                    <div class="weather-card">
                        <div class="card-header">
                            <div class="city-name">${city}</div>
                            <button class="remove-btn" onclick="dashboard.removeCity('${city}')">
                                <i class="fas fa-times"></i>
                            </button>
                        </div>
                        <div class="empty-state" style="padding: 40px;">
                            <i class="fas fa-exclamation-triangle"></i>
                            <p>Failed to load data</p>
                        </div>
                    </div>
                `;
            } else {
                const tempDisplay = this.convertTemp(weather.temp);
                const feelsLikeDisplay = this.convertTemp(weather.feelsLike);
                const unitSymbol = this.unit === 'celsius' ? '°C' : '°F';
                
                html += `
                    <div class="weather-card">
                        <div class="card-header">
                            <div class="city-name">
                                ${weather.city} <span style="font-size: 0.875rem;">(${weather.country})</span>
                            </div>
                            <button class="remove-btn" onclick="dashboard.removeCity('${city}')">
                                <i class="fas fa-times"></i>
                            </button>
                        </div>
                        <div class="weather-main">
                            <div class="weather-icon">${weather.icon}</div>
                            <div class="temperature">${tempDisplay}${unitSymbol}</div>
                            <div class="description">${weather.description}</div>
                        </div>
                        <div class="weather-details">
                            <div class="detail">
                                <i class="fas fa-thermometer-half"></i>
                                <div class="detail-label">Feels Like</div>
                                <div class="detail-value">${feelsLikeDisplay}${unitSymbol}</div>
                            </div>
                            <div class="detail">
                                <i class="fas fa-tint"></i>
                                <div class="detail-label">Humidity</div>
                                <div class="detail-value">${weather.humidity}%</div>
                            </div>
                            <div class="detail">
                                <i class="fas fa-wind"></i>
                                <div class="detail-label">Wind</div>
                                <div class="detail-value">${weather.windSpeed} m/s</div>
                            </div>
                        </div>
                        <div class="last-updated">
                            <i class="fas fa-clock"></i> Updated: ${weather.timestamp}
                        </div>
                    </div>
                `;
            }
        }
        
        grid.innerHTML = html;
    }
    
    removeCity(cityName) {
        this.cities = this.cities.filter(c => c.toLowerCase() !== cityName.toLowerCase());
        this.saveCities();
        this.weatherData.delete(cityName.toLowerCase());
        this.renderWeatherGrid();
        this.updateStats();
        this.showToast(`${cityName} removed from dashboard`, 'info');
    }
    
    filterCities(searchTerm) {
        const cards = document.querySelectorAll('.weather-card');
        const term = searchTerm.toLowerCase();
        
        cards.forEach(card => {
            const cityName = card.querySelector('.city-name')?.textContent.toLowerCase();
            if (cityName && cityName.includes(term)) {
                card.style.display = '';
            } else {
                card.style.display = 'none';
            }
        });
    }
    
    updateStats() {
        const totalCities = this.cities.length;
        document.getElementById('totalCities').textContent = totalCities;
        
        let totalTemp = 0;
        let totalHumidity = 0;
        let totalWind = 0;
        let count = 0;
        
        for (const city of this.cities) {
            const weather = this.weatherData.get(city.toLowerCase());
            if (weather) {
                totalTemp += weather.temp;
                totalHumidity += weather.humidity;
                totalWind += weather.windSpeed;
                count++;
            }
        }
        
        const avgTemp = count > 0 ? (totalTemp / count) : 0;
        const avgTempDisplay = this.convertTemp(avgTemp);
        const unitSymbol = this.unit === 'celsius' ? '°C' : '°F';
        
        document.getElementById('avgTemp').textContent = count > 0 ? `${avgTempDisplay}${unitSymbol}` : '--';
        document.getElementById('avgHumidity').textContent = count > 0 ? `${Math.round(totalHumidity / count)}%` : '--';
        document.getElementById('avgWind').textContent = count > 0 ? `${(totalWind / count).toFixed(1)} m/s` : '--';
    }
    
    updateCitySelectors() {
        const select = document.getElementById('forecastCitySelect');
        if (select) {
            select.innerHTML = '<option value="">Select a city to view forecast</option>';
            this.cities.forEach(city => {
                select.innerHTML += `<option value="${city}">${city}</option>`;
            });
        }
    }
    
    async loadForecast(cityName) {
        const forecast = await this.fetchForecast(cityName);
        if (forecast) {
            this.renderForecast(forecast);
        }
    }
    
    renderForecast(forecast) {
        const grid = document.getElementById('forecastGrid');
        
        let html = '';
        forecast.forEach(day => {
            const tempMax = this.convertTemp(day.tempMax);
            const tempMin = this.convertTemp(day.tempMin);
            const unitSymbol = this.unit === 'celsius' ? '°C' : '°F';
            
            html += `
                <div class="forecast-card">
                    <div class="forecast-date">${day.date}</div>
                    <div class="forecast-icon">${day.icon}</div>
                    <div class="forecast-temp">
                        ${tempMax}${unitSymbol} / ${tempMin}${unitSymbol}
                    </div>
                    <div class="forecast-desc">${day.description}</div>
                    <div class="forecast-detail">
                        <i class="fas fa-tint"></i> ${Math.round(day.humidity)}%
                    </div>
                </div>
            `;
        });
        
        grid.innerHTML = html;
    }
    
    initMap() {
        // Initialize Leaflet map
        this.map = L.map('weatherMap').setView([20, 0], 2);
        
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors'
        }).addTo(this.map);
        
        this.updateMapMarkers();
    }
    
    updateMapMarkers() {
        // Clear existing markers
        this.mapMarkers.forEach(marker => marker.remove());
        this.mapMarkers = [];
        
        // Add markers for each city
        this.cities.forEach(city => {
            const weather = this.weatherData.get(city.toLowerCase());
            if (weather && weather.lat && weather.lon) {
                const tempDisplay = this.convertTemp(weather.temp);
                const unitSymbol = this.unit === 'celsius' ? '°C' : '°F';
                
                const marker = L.marker([weather.lat, weather.lon]).addTo(this.map);
                marker.bindPopup(`
                    <strong>${weather.city}</strong><br>
                    ${weather.icon} ${tempDisplay}${unitSymbol}<br>
                    ${weather.description}<br>
                    💧 ${weather.humidity}% | 💨 ${weather.windSpeed} m/s
                `);
                this.mapMarkers.push(marker);
            }
        });
    }
    
    updateMapLayer(layer) {
        // This would integrate with a weather map API like OpenWeatherMap or Windy
        this.showToast('Weather map layer switching coming soon!', 'info');
    }
    
    updateCharts() {
        if (this.cities.length === 0) return;
        
        const cities = [];
        const temps = [];
        const humidities = [];
        
        for (const city of this.cities) {
            const weather = this.weatherData.get(city.toLowerCase());
            if (weather) {
                cities.push(weather.city);
                temps.push(weather.temp);
                humidities.push(weather.humidity);
            }
        }
        
        // Temperature trend chart
        if (this.charts.tempTrend) {
            this.charts.tempTrend.destroy();
        }
        
        const tempCtx = document.getElementById('tempTrendChart').getContext('2d');
        this.charts.tempTrend = new Chart(tempCtx, {
            type: 'bar',
            data: {
                labels: cities,
                datasets: [{
                    label: `Temperature (${this.unit === 'celsius' ? '°C' : '°F'})`,
                    data: temps.map(t => parseFloat(this.convertTemp(t))),
                    backgroundColor: 'rgba(59, 130, 246, 0.5)',
                    borderColor: '#3b82f6',
                    borderWidth: 2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                plugins: {
                    legend: {
                        labels: { color: getComputedStyle(document.body).getPropertyValue('--text-primary') }
                    }
                }
            }
        });
        
        // Humidity chart
        if (this.charts.humidity) {
            this.charts.humidity.destroy();
        }
        
        const humidityCtx = document.getElementById('humidityChart').getContext('2d');
        this.charts.humidity = new Chart(humidityCtx, {
            type: 'line',
            data: {
                labels: cities,
                datasets: [{
                    label: 'Humidity (%)',
                    data: humidities,
                    backgroundColor: 'rgba(16, 185, 129, 0.2)',
                    borderColor: '#10b981',
                    borderWidth: 2,
                    fill: true
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                plugins: {
                    legend: {
                        labels: { color: getComputedStyle(document.body).getPropertyValue('--text-primary') }
                    }
                }
            }
        });
    }
    
    setupWebSocket() {
        const statusEl = document.getElementById('connectionStatus');
        statusEl.innerHTML = '<i class="fas fa-plug"></i><span>WebSocket: Simulated</span>';
        statusEl.classList.add('connected');
        
        // Simulate WebSocket updates every 30 seconds
        setInterval(() => {
            if (this.cities.length > 0) {
                const randomCity = this.cities[Math.floor(Math.random() * this.cities.length)];
                this.fetchWeather(randomCity).then(weather => {
                    if (weather) {
                        this.weatherData.set(randomCity.toLowerCase(), weather);
                        this.renderWeatherGrid();
                        this.updateStats();
                        this.showToast(`Live update: ${randomCity} now ${this.convertTemp(weather.temp)}${this.unit === 'celsius' ? '°C' : '°F'}`, 'info');
                    }
                });
            }
        }, 30000);
    }
    
    startAutoRefresh() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
        }
        
        this.intervalId = setInterval(() => {
            this.refreshAllWeather();
        }, this.refreshInterval);
    }
    
    exportData() {
        const data = {
            exportedAt: new Date().toISOString(),
            cities: this.cities,
            weatherData: Array.from(this.weatherData.entries()),
            settings: {
                unit: this.unit,
                refreshInterval: this.refreshInterval
            }
        };
        
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `weather-dashboard-export-${Date.now()}.json`;
        a.click();
        URL.revokeObjectURL(url);
        
        this.showToast('Data exported successfully!', 'success');
    }
    
    clearAllData() {
        if (confirm('Are you sure you want to clear all data? This will remove all cities and reset settings.')) {
            this.cities = [];
            this.weatherData.clear();
            this.saveCities();
            this.renderWeatherGrid();
            this.updateStats();
            this.updateCitySelectors();
            this.showToast('All data cleared', 'success');
        }
    }
    
    applyTheme(theme) {
        if (theme === 'auto') {
            const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
            document.body.setAttribute('data-theme', isDark ? 'dark' : 'light');
        } else {
            document.body.setAttribute('data-theme', theme);
        }
    }
    
    toggleTheme() {
        const currentTheme = document.body.getAttribute('data-theme');
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
        this.applyTheme(newTheme);
        localStorage.setItem('theme', newTheme);
        this.showToast(`Switched to ${newTheme} theme`, 'success');
    }
    
    updateUI() {
        this.renderWeatherGrid();
        this.updateStats();
    }
    
    showToast(message, type = 'info') {
        const container = document.getElementById('toastContainer');
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        
        const icons = {
            success: '✅',
            error: '❌',
            warning: '⚠️',
            info: 'ℹ️'
        };
        
        toast.innerHTML = `
            <i>${icons[type] || 'ℹ️'}</i>
            <span>${message}</span>
        `;
        
        container.appendChild(toast);
        
        setTimeout(() => {
            toast.style.opacity = '0';
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }
    
    hideLoading() {
        setTimeout(() => {
            const overlay = document.getElementById('loadingOverlay');
            overlay.style.opacity = '0';
            setTimeout(() => overlay.remove(), 500);
        }, 1000);
    }
}

// Initialize dashboard
let dashboard;
document.addEventListener('DOMContentLoaded', () => {
    dashboard = new WeatherDashboard();
    window.dashboard = dashboard; // Make accessible globally
});

