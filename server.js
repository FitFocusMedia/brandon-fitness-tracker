const express = require('express');
const path = require('path');
const fs = require('fs').promises;

const app = express();
const PORT = process.env.PORT || 8896;

// Import auth middleware
const { requireAuth } = require('../shared-auth-middleware');

app.use(express.json());

// Apply authentication to all routes except health check
app.use((req, res, next) => {
  if (req.path === '/api/health' || req.path === '/health') {
    return next();
  }
  requireAuth(req, res, next);
});

app.use(express.static(__dirname));

const DATA_DIR = path.join(__dirname, 'data');

// Ensure data directory exists
async function ensureDataDir() {
    try {
        await fs.mkdir(DATA_DIR, { recursive: true });
    } catch (error) {
        console.error('Error creating data directory:', error);
    }
}

// Load JSON file
async function loadJSON(filename) {
    try {
        const data = await fs.readFile(path.join(DATA_DIR, filename), 'utf8');
        return JSON.parse(data);
    } catch (error) {
        return [];
    }
}

// Save JSON file
async function saveJSON(filename, data) {
    await fs.writeFile(
        path.join(DATA_DIR, filename),
        JSON.stringify(data, null, 2)
    );
}

// Weight Log Endpoints
app.get('/api/weight-log', async (req, res) => {
    try {
        const data = await loadJSON('weight-log.json');
        res.json(data);
    } catch (error) {
        console.error('Error fetching weight log:', error);
        res.status(500).json({ error: 'Failed to fetch weight log' });
    }
});

app.post('/api/weight-log', async (req, res) => {
    try {
        const data = await loadJSON('weight-log.json');
        data.push(req.body);
        await saveJSON('weight-log.json', data);
        
        // Log to memory
        await logToMemory(`Weight logged: ${req.body.weight}kg on ${req.body.date}`);
        
        res.json({ success: true });
    } catch (error) {
        console.error('Error saving weight log:', error);
        res.status(500).json({ error: 'Failed to save weight log' });
    }
});

// Workout Endpoints
app.get('/api/workouts', async (req, res) => {
    try {
        const data = await loadJSON('workouts.json');
        res.json(data);
    } catch (error) {
        console.error('Error fetching workouts:', error);
        res.status(500).json({ error: 'Failed to fetch workouts' });
    }
});

app.post('/api/workouts', async (req, res) => {
    try {
        const data = await loadJSON('workouts.json');
        data.push(req.body);
        await saveJSON('workouts.json', data);
        
        res.json({ success: true });
    } catch (error) {
        console.error('Error saving workout:', error);
        res.status(500).json({ error: 'Failed to save workout' });
    }
});

// Nutrition Endpoints
app.get('/api/meals', async (req, res) => {
    try {
        const data = await loadJSON('meals.json');
        res.json(data);
    } catch (error) {
        console.error('Error fetching meals:', error);
        res.status(500).json({ error: 'Failed to fetch meals' });
    }
});

app.post('/api/meals', async (req, res) => {
    try {
        const data = await loadJSON('meals.json');
        data.push(req.body);
        await saveJSON('meals.json', data);
        
        res.json({ success: true });
    } catch (error) {
        console.error('Error saving meal:', error);
        res.status(500).json({ error: 'Failed to save meal' });
    }
});

// Stats Endpoint
app.get('/api/stats', async (req, res) => {
    try {
        const weights = await loadJSON('weight-log.json');
        const workouts = await loadJSON('workouts.json');
        const meals = await loadJSON('meals.json');

        const now = new Date();
        const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

        // Calculate stats
        const currentWeight = weights.length > 0 ? weights[weights.length - 1].weight : 0;
        
        const workoutsThisWeek = workouts.filter(w => 
            new Date(w.date) >= weekAgo
        ).length;

        // Calculate streak
        let streak = 0;
        const workoutDates = new Set(workouts.map(w => w.date));
        const today = new Date();
        
        for (let i = 0; i < 365; i++) {
            const checkDate = new Date(today);
            checkDate.setDate(checkDate.getDate() - i);
            const dateStr = checkDate.toISOString().split('T')[0];
            
            if (workoutDates.has(dateStr)) {
                streak++;
            } else if (i > 0) {
                break;
            }
        }

        // Calculate today's calories
        const todayStr = today.toISOString().split('T')[0];
        const todaysMeals = meals.filter(m => m.date === todayStr);
        const caloriesToday = todaysMeals.reduce((sum, m) => sum + (m.calories || 0), 0);

        res.json({
            currentWeight,
            workoutsThisWeek,
            streak,
            caloriesToday,
            totalWorkouts: workouts.length,
            totalWeightLogs: weights.length
        });
    } catch (error) {
        console.error('Error calculating stats:', error);
        res.status(500).json({ error: 'Failed to calculate stats' });
    }
});

// Log to memory file
async function logToMemory(message) {
    try {
        const memoryFile = '/Users/clawdbot/clawd/memory/2026-01-29.md';
        const timestamp = new Date().toLocaleTimeString('en-AU');
        const logEntry = `\n- [${timestamp}] ${message}`;
        
        try {
            await fs.appendFile(memoryFile, logEntry);
        } catch (error) {
            // If file doesn't exist, create it with header
            const header = `# Memory Log - January 29, 2026\n\n## Fitness Tracking\n`;
            await fs.writeFile(memoryFile, header + logEntry);
        }
    } catch (error) {
        console.error('Error logging to memory:', error);
    }
}

// Health check endpoints
app.get('/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        app: 'fitness-tracker',
        timestamp: new Date().toISOString() 
    });
});

app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        app: 'fitness-tracker',
        timestamp: new Date().toISOString() 
    });
});

// Data sync endpoint
app.post('/api/sync/data', async (req, res) => {
    try {
        requireAuth(req, res, async () => {
            const syncData = req.body;
            
            if (!syncData || typeof syncData !== 'object') {
                return res.status(400).json({ error: 'Invalid sync data' });
            }
            
            res.json({ 
                success: true, 
                message: 'Data synced successfully',
                timestamp: new Date().toISOString()
            });
        });
    } catch (error) {
        console.error('Sync error:', error);
        res.status(500).json({ error: 'Sync failed' });
    }
});

// Initialize
ensureDataDir().then(() => {
    app.listen(PORT, () => {
        console.log(`💪 FitForce Tracker running at http://localhost:${PORT}`);
        console.log(`📊 Tracking Brandon's fitness journey...`);
    });
});
