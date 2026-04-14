# Profile Intelligence Service

This service automatically enriches a given name by calling three external APIs (Genderize, Agify, Nationalize) to compute age prediction, gender probabilities, and nationality. It uses SQLite for persistent storage, assigning UUIDv7 identifiers to records. 

## Features
- Integrates multiple third-party API concurrently (`api.genderize.io`, `api.agify.io`, `api.nationalize.io`).
- Idempotent API endpoints (prevents dupes, guarantees consistency).
- Case-insensitive filtering.
- Extensive, structured error handling including failover cascades for external API failures.

## Setup Instructions

1. Clone or download the repository.
2. Install dependencies:
   ```bash
   npm install
   ```
3. Run the development server:
   ```bash
   npm start
   # or natively with node: node index.js
   ```

## Swagger Documentation

To browse the endpoints comfortably using a GUI:
Open [http://localhost:3000/api-docs](http://localhost:3000/api-docs) when the server runs.

## Endpoints Summary

- **POST `/api/profiles`**: Enrich and save a name securely.
- **GET `/api/profiles`**: List stored profiles with filters (`gender`, `country_id`, `age_group`).
- **GET `/api/profiles/{id}`**: Fetch an exact profile's full enriched payload.
- **DELETE `/api/profiles/{id}`**: Erase profile data.
