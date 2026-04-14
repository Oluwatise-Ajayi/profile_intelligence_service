import express from 'express';
import cors from 'cors';
import { v7 as uuidv7 } from 'uuid';
import { dbRun, dbGet, dbAll } from './db.js';
import swaggerUi from 'swagger-ui-express';
import fs from 'fs';
const swaggerDocument = JSON.parse(fs.readFileSync(new URL('./swagger.json', import.meta.url)));

const app = express();
app.use(cors({ origin: '*' }));
app.use(express.json());

// Setup Swagger UI with Vercel/Serverless CDN support for static assets
const CSS_URL = "https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/4.3.0/swagger-ui.min.css";
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument, {
    customCss: '.swagger-ui .opblock .opblock-summary-path-description-wrapper { align-items: center !important; display: flex; flex-wrap: wrap; gap: 0 10px; padding: 0 10px; width: 100%; }',
    customCssUrl: CSS_URL,
    customJs: [
        'https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/4.3.0/swagger-ui-bundle.js',
        'https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/4.3.0/swagger-ui-standalone-preset.js'
    ],
}));


app.post('/api/profiles', async (req, res) => {
    let { name } = req.body;
    
    if (name === undefined) {
        return res.status(400).json({ status: 'error', message: 'Missing or empty name' });
    }
    if (typeof name !== 'string') {
        return res.status(422).json({ status: 'error', message: 'Invalid type' });
    }
    
    name = name.trim().toLowerCase();
    if (name === '') {
        return res.status(400).json({ status: 'error', message: 'Missing or empty name' });
    }
    
    try {
        const existing = await dbGet('SELECT * FROM profiles WHERE lower(name) = ?', [name]);
        if (existing) {
            return res.status(200).json({
                status: 'success',
                message: 'Profile already exists',
                data: formatOutput(existing)
            });
        }
        
        const [genderRes, agifyRes, nativeRes] = await Promise.all([
            fetch(`https://api.genderize.io?name=${encodeURIComponent(name)}`).then(r => r.json()).catch(() => null),
            fetch(`https://api.agify.io?name=${encodeURIComponent(name)}`).then(r => r.json()).catch(() => null),
            fetch(`https://api.nationalize.io?name=${encodeURIComponent(name)}`).then(r => r.json()).catch(() => null),
        ]);
        
        if (!genderRes) return res.status(500).json({ status: 'error', message: 'Upstream or server failure' });
        if (!agifyRes) return res.status(500).json({ status: 'error', message: 'Upstream or server failure' });
        if (!nativeRes) return res.status(500).json({ status: 'error', message: 'Upstream or server failure' });

        if (!genderRes.gender || genderRes.count === 0) {
            return res.status(502).json({ status: '502', message: 'Genderize returned an invalid response' });
        }
        
        if (agifyRes.age === null || agifyRes.age === undefined) {
             return res.status(502).json({ status: '502', message: 'Agify returned an invalid response' });
        }
        
        if (!nativeRes.country || nativeRes.country.length === 0) {
             return res.status(502).json({ status: '502', message: 'Nationalize returned an invalid response' });
        }
        
        let age_group = '';
        if (agifyRes.age <= 12) age_group = 'child';
        else if (agifyRes.age <= 19) age_group = 'teenager';
        else if (agifyRes.age <= 59) age_group = 'adult';
        else age_group = 'senior';
        
        let bestCountry = nativeRes.country[0];
        nativeRes.country.forEach(c => {
            if (c.probability > bestCountry.probability) {
                bestCountry = c;
            }
        });
        
        const id = uuidv7();
        const created_at = new Date().toISOString();
        
        const record = {
            id,
            name: name,
            gender: genderRes.gender,
            gender_probability: genderRes.probability,
            sample_size: genderRes.count,
            age: agifyRes.age,
            age_group,
            country_id: bestCountry.country_id,
            country_probability: bestCountry.probability,
            created_at
        };
        
        await dbRun(
            `INSERT INTO profiles (id, name, gender, gender_probability, sample_size, age, age_group, country_id, country_probability, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                record.id, record.name, record.gender, record.gender_probability, record.sample_size,
                record.age, record.age_group, record.country_id, record.country_probability, record.created_at
            ]
        );
        
        res.status(201).json({
            status: 'success',
            data: formatOutput(record)
        });

    } catch(err) {
        res.status(500).json({ status: 'error', message: 'Upstream or server failure' });
    }
});

app.get('/api/profiles/:id', async (req, res) => {
    try {
        const row = await dbGet('SELECT * FROM profiles WHERE id = ?', [req.params.id]);
        if (!row) {
            return res.status(404).json({ status: 'error', message: 'Profile not found' });
        }
        res.status(200).json({ status: 'success', data: formatOutput(row) });
    } catch(err) {
        res.status(500).json({ status: 'error', message: 'Upstream or server failure' });
    }
});

app.get('/api/profiles', async (req, res) => {
    try {
        let query = 'SELECT * FROM profiles WHERE 1=1';
        const params = [];
        const { gender, country_id, age_group } = req.query;
        
        if (gender && typeof gender === 'string') {
            query += ' AND lower(gender) = ?';
            params.push(gender.toLowerCase());
        }
        if (country_id && typeof country_id === 'string') {
            query += ' AND lower(country_id) = ?';
            params.push(country_id.toLowerCase());
        }
        if (age_group && typeof age_group === 'string') {
            query += ' AND lower(age_group) = ?';
            params.push(age_group.toLowerCase());
        }
        
        const rows = await dbAll(query, params);
        res.status(200).json({
            status: 'success',
            count: rows.length,
            data: rows.map(formatOutputList)
        });
    } catch(err) {
        res.status(500).json({ status: 'error', message: 'Upstream or server failure' });
    }
});

app.delete('/api/profiles/:id', async (req, res) => {
    try {
        const result = await dbRun('DELETE FROM profiles WHERE id = ?', [req.params.id]);
        if (result.changes === 0) {
            return res.status(404).json({ status: 'error', message: 'Profile not found' });
        }
        res.status(204).send();
    } catch(err) {
        res.status(500).json({ status: 'error', message: 'Upstream or server failure' });
    }
});

function formatOutput(row) {
    return {
        id: row.id,
        name: row.name,
        gender: row.gender,
        gender_probability: row.gender_probability,
        sample_size: row.sample_size,
        age: row.age,
        age_group: row.age_group,
        country_id: row.country_id,
        country_probability: row.country_probability,
        created_at: row.created_at
    };
}

function formatOutputList(row) {
    return {
        id: row.id,
        name: row.name,
        gender: row.gender,
        age: row.age,
        age_group: row.age_group,
        country_id: row.country_id
    };
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
});
