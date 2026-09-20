# Backend Assessment

A RESTful API built with **Node.js** and **Express** for managing tasks, tracking activity, and generating reports. Data is persisted to local JSON files.

## Tech Stack

- **Runtime**: Node.js
- **Framework**: Express 4
- **Storage**: JSON flat-file (no database required)

## Getting Started

### Prerequisites

- Node.js >= 18

### Installation

```bash
npm install
```

### Running the Server

```bash
# Production
npm start

# Development (with file watch)
npm run dev
```

The server starts at `http://localhost:3000` by default.

### Environment Variables

| Variable   | Default          | Description                        |
|------------|------------------|------------------------------------|
| `PORT`     | `3000`           | Port the server listens on         |
| `DATA_DIR` | `./data`         | Directory where JSON files are stored |

## API Endpoints

### Tasks

| Method   | Endpoint       | Description         |
|----------|----------------|---------------------|
| `GET`    | `/tasks`       | List all tasks      |
| `GET`    | `/tasks/:id`   | Get a task by ID    |
| `POST`   | `/tasks`       | Create a new task   |
| `PATCH`  | `/tasks/:id`   | Update a task       |
| `DELETE` | `/tasks/:id`   | Delete a task       |

### Activity

| Method | Endpoint    | Description            |
|--------|-------------|------------------------|
| `GET`  | `/activity` | List all activity logs |
| `POST` | `/activity` | Add a new activity log |

### Reports

| Method | Endpoint           | Description              |
|--------|--------------------|--------------------------|
| `GET`  | `/reports/summary` | Get tasks summary report |

## Project Structure

```
src/
├── app.js              # Express app setup & routing
├── server.js           # Server entry point
├── config.js           # Config & file paths
├── middleware/         # Error handling middleware
├── utils/              # Shared utilities (HttpError, etc.)
└── modules/
    ├── tasks/          # Tasks CRUD
    ├── activity/       # Activity logging
    └── reports/        # Reporting
data/
├── tasks.json
└── activity.json
```
