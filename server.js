// Load environment variables from .env
const path = require('path');
// The .env file is now in the same directory as server.js, so path.join(__dirname, '.env') is correct
require('dotenv').config({ path: path.join(__dirname, '.env') });

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Serve static files (frontend) from the 'public' directory
// Since server.js is in the root, and 'public' is a direct child
app.use(express.static(path.join(__dirname, 'public')));

// MongoDB connection
console.log("Loaded MONGO_URI:", process.env.MONGO_URI ? "****** (URI loaded)" : "Not Loaded"); // Mask URI for security
mongoose.connect(process.env.MONGO_URI, {
    // useNewUrlParser and useUnifiedTopology are deprecated and have no effect since Node.js Driver version 4.0.0
    // They are no longer needed and can be safely removed for cleaner console output.
    // The driver defaults to the new parser and unified topology.
});

const db = mongoose.connection;
db.on('error', console.error.bind(console, 'MongoDB connection error:'));
db.once('open', () => {
    console.log('Connected to MongoDB Atlas');
});

// Schemas
const donorSchema = new mongoose.Schema({
    name: { type: String, required: true },
    bloodType: { type: String, required: true },
    phone: { type: String, required: true },
    email: { type: String, required: true },
    address: { type: String, required: true },
    lastDonation: { type: Date, default: null },
    createdAt: { type: Date, default: Date.now }
});

const inventorySchema = new mongoose.Schema({
    bloodType: { type: String, required: true },
    donorId: { type: String, required: true },
    collectionDate: { type: Date, required: true },
    expiryDate: { type: Date, required: true },
    status: { type: String, default: 'Available', enum: ['Available', 'Used', 'Expired'] },
    createdAt: { type: Date, default: Date.now }
});

const requestSchema = new mongoose.Schema({
    patientName: { type: String, required: true },
    bloodType: { type: String, required: true },
    unitsNeeded: { type: Number, required: true },
    priority: { type: String, required: true, enum: ['Low', 'Medium', 'High', 'Critical'] },
    hospital: { type: String, required: true },
    status: { type: String, default: 'Pending', enum: ['Pending', 'Fulfilled', 'Cancelled'] },
    requestDate: { type: Date, default: Date.now }
});

// Models
const Donor = mongoose.model('Donor', donorSchema);
const Inventory = mongoose.model('Inventory', inventorySchema);
const Request = mongoose.model('Request', requestSchema);

// API Routes

// Donors
app.get('/api/donors', async (req, res) => {
    try {
        const donors = await Donor.find().sort({ createdAt: -1 });
        res.json(donors);
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

app.post('/api/donors', async (req, res) => {
    try {
        const donor = new Donor(req.body);
        await donor.save();
        res.status(201).json({ success: true, donor });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
});

app.delete('/api/donors/:id', async (req, res) => {
    try {
        const result = await Donor.findByIdAndDelete(req.params.id);
        if (!result) {
            return res.status(404).json({ success: false, message: 'Donor not found' });
        }
        res.json({ success: true, message: 'Donor deleted successfully' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Inventory
app.get('/api/inventory', async (req, res) => {
    try {
        const inventory = await Inventory.find().sort({ createdAt: -1 });
        res.json(inventory);
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

app.post('/api/inventory', async (req, res) => {
    try {
        const { bloodType, donorId, collectionDate } = req.body;

        // Calculate expiry date (35 days from collection for whole blood)
        const expiryDate = new Date(collectionDate);
        expiryDate.setDate(expiryDate.getDate() + 35);

        const bloodUnit = new Inventory({
            bloodType,
            donorId,
            collectionDate,
            expiryDate
        });

        await bloodUnit.save();

        // Update donor's last donation date
        try {
            const donor = await Donor.findById(donorId);
            if (donor) {
                donor.lastDonation = collectionDate;
                await donor.save();
            } else {
                console.warn(`Donor with ID ${donorId} not found when updating lastDonation.`);
            }
        } catch (donorError) {
            console.error('Failed to update donor last donation date:', donorError);
        }

        res.status(201).json({ success: true, bloodUnit });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
});

app.delete('/api/inventory/:id', async (req, res) => {
    try {
        const result = await Inventory.findByIdAndDelete(req.params.id);
        if (!result) {
            return res.status(404).json({ success: false, message: 'Blood unit not found' });
        }
        res.json({ success: true, message: 'Blood unit deleted successfully' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Requests
app.get('/api/requests', async (req, res) => {
    try {
        const requests = await Request.find().sort({ requestDate: -1 });
        res.json(requests);
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

app.post('/api/requests', async (req, res) => {
    try {
        const request = new Request(req.body);
        await request.save();
        res.status(201).json({ success: true, request });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
});

app.put('/api/requests/:id', async (req, res) => {
    try {
        const request = await Request.findByIdAndUpdate(
            req.params.id,
            req.body,
            { new: true, runValidators: true }
        );
        if (!request) {
            return res.status(404).json({ success: false, message: 'Request not found' });
        }
        res.json({ success: true, request });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

app.delete('/api/requests/:id', async (req, res) => {
    try {
        const result = await Request.findByIdAndDelete(req.params.id);
        if (!result) {
            return res.status(404).json({ success: false, message: 'Request not found' });
        }
        res.json({ success: true, message: 'Request deleted successfully' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Serve the frontend HTML file for the root route
// Since server.js is in the root, and index.html is in public/index.html
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Catch-all handler: send back index.html for any non-API routes
// This handles client-side routing for SPAs.
app.get(/^\/(?!api).*/, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});


app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Frontend available at: http://localhost:${PORT}/`);
    console.log(`API available at: http://localhost:${PORT}/api`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});