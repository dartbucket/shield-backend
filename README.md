# Shield Backend

Backend for Shield — a Flutter app demonstrating Out-of-Band (OOB) authentication using QR code approval.

## Tech Stack

- **Runtime:** Node.js
- **Language:** TypeScript
- **Framework:** Express
- **Database:** MongoDB (Mongoose ODM)
- **Validation:** Zod
- **Auth:** JWT + bcrypt
- **Realtime:** Socket.IO
- **Testing:** Jest + Supertest

## Project Structure

```
src/
├── index.ts                # Server entry point (Express + Socket.IO)
├── config.ts               # Environment config and token lifetimes
├── errors.ts               # AppError class and error codes
├── validators.ts           # Zod request schemas
├── middleware/
│   ├── auth.ts             # JWT authentication middleware
│   ├── asyncHandler.ts     # Express async error wrapper
│   └── errorHandler.ts     # Global error handler
├── models/
│   ├── User.ts             # User schema
│   ├── Device.ts           # Device schema
│   ├── OobLoginSession.ts  # OOB login session schema
│   ├── RefreshSession.ts   # Refresh token session schema
│   └── index.ts
├── services/
│   └── auth.ts             # Token generation, bcrypt, challenge helpers
└── routes/
    ├── auth.ts             # Auth endpoints
    └── devices.ts          # Device management endpoints
__tests/
├── helpers.ts              # Test utilities and setup
├── auth.test.ts            # Signup and login tests
├── oob.test.ts             # OOB flow and socket tests
├── refresh.test.ts         # Token refresh and logout tests
└── devices.test.ts         # Device CRUD and middleware tests
```

## Quick Start

```bash
cp .env.example .env     # Set MONGODB_URI and JWT_SECRET
npm ci
NODE_ENV=development npm run dev
```

## Environment Variables

| Variable       | Default                             | Description          |
|----------------|-------------------------------------|----------------------|
| `PORT`         | `3000`                              | Server port          |
| `MONGODB_URI`  | `mongodb://localhost:27017/shield`  | MongoDB connection   |
| `JWT_SECRET`   | `dev-secret-change-me`              | JWT signing secret   |

## Token Policy

| Token         | Type       | Lifetime  | Rotation   |
|---------------|------------|-----------|------------|
| Access Token  | JWT        | 15 min    | —          |
| Refresh Token | Opaque     | 30 days   | Per-use    |

Refresh tokens are stored as SHA-256 hashes. One active refresh token per device — previous tokens are revoked on rotation.

## Authentication Flow (OOB)

1. Desktop signs in with email/password → receives a `sessionId`
2. Desktop renders `sessionId` as a QR code
3. Mobile scans the QR code
4. Mobile fetches the challenge via `GET /auth/oob/challenge/:sessionId`
5. Mobile signs the challenge with its private key
6. Mobile posts the signature to `POST /auth/oob/approve`
7. Backend verifies the signature, issues tokens, and emits `oob.approved` to the desktop via Socket.IO
8. Desktop stores tokens and is authenticated

Challenges are 32 random bytes (Base64), one-time use, with a 60-second expiry.

## API Reference

### Public Endpoints

#### `POST /auth/signup`

Register a new user and device.

```json
{
  "email": "user@example.com",
  "password": "password123",
  "deviceName": "My Phone",
  "platform": "ios",
  "appVersion": "1.0.0"
}
```

**Response** `201`

```json
{
  "accessToken": "eyJ...",
  "refreshToken": "a1b2c3...",
  "user": {
    "id": "60f...",
    "email": "user@example.com",
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-01-01T00:00:00.000Z"
  },
  "device": {
    "id": "60f...",
    "type": "mobile",
    "platform": "ios",
    "deviceName": "My Phone",
    "appVersion": "1.0.0",
    "lastSeen": "2024-01-01T00:00:00.000Z",
    "createdAt": "2024-01-01T00:00:00.000Z"
  }
}
```

#### `POST /auth/login`

Direct login — creates a new device and returns tokens immediately.

```json
{
  "email": "user@example.com",
  "password": "password123",
  "deviceName": "Desktop",
  "platform": "macos",
  "appVersion": "1.0.0"
}
```

**Response** `200`

```json
{
  "accessToken": "eyJ...",
  "refreshToken": "a1b2c3...",
  "user": {
    "id": "60f...",
    "email": "user@example.com",
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-01-01T00:00:00.000Z"
  },
  "device": {
    "id": "60f...",
    "type": "desktop",
    "platform": "macos",
    "deviceName": "Desktop",
    "appVersion": "1.0.0",
    "lastSeen": "2024-01-01T00:00:00.000Z",
    "createdAt": "2024-01-01T00:00:00.000Z"
  }
}
```

#### `POST /auth/oob/create-session`

Creates an OOB login session for a desktop device. Requires `x-socket-id` header (the desktop's Socket.IO connection ID).

**Headers**

```
x-socket-id: <socket-id>
```

**Body**

```json
{
  "email": "user@example.com",
  "password": "password123",
  "deviceName": "Desktop",
  "platform": "windows",
  "appVersion": "1.0.0"
}
```

**Response** `201`

```json
{
  "sessionId": "550e8400-e29b-41d4-a716-446655440000",
  "deviceId": "60f..."
}
```

#### `GET /auth/oob/challenge/:sessionId`

Fetch the challenge for a pending OOB session.

**Response** `200`

```json
{
  "sessionId": "550e8400-e29b-41d4-a716-446655440000",
  "challenge": "dGhpcyBpcyBhIDMyIGJ5dGUgcmFuZG9tIGNoYWxsZW5nZSE="
}
```

#### `POST /auth/oob/approve`

Approve an OOB session by presenting the signed challenge.

```json
{
  "sessionId": "550e8400-e29b-41d4-a716-446655440000",
  "challenge": "dGhpcyBpcyBhIDMyIGJ5dGUgcmFuZG9tIGNoYWxsZW5nZSE=",
  "signature": "base64-encoded-signature",
  "deviceId": "60f..."
}
```

**Response** `200`

```json
{
  "message": "Session approved"
}
```

**Socket.IO event** (emitted to the desktop)

```json
{
  "event": "oob.approved",
  "accessToken": "eyJ...",
  "refreshToken": "a1b2c3..."
}
```

#### `POST /auth/oob/reject`

Reject an OOB session.

```json
{
  "sessionId": "550e8400-e29b-41d4-a716-446655440000",
  "deviceId": "60f..."
}
```

**Response** `200`

```json
{
  "message": "Session declined"
}
```

**Socket.IO event**

```json
{
  "event": "oob.declined"
}
```

#### `POST /auth/refresh`

Rotate the refresh token and get a new access token.

```json
{
  "refreshToken": "a1b2c3..."
}
```

**Response** `200`

```json
{
  "accessToken": "eyJ...",
  "refreshToken": "d4e5f6..."
}
```

#### `POST /auth/logout`

Revoke the refresh token.

```json
{
  "refreshToken": "a1b2c3..."
}
```

**Response** `200`

```json
{
  "message": "Logged out successfully"
}
```

### Authenticated Endpoints

All require `Authorization: Bearer <accessToken>`.

#### `GET /devices`

List all devices for the authenticated user.

**Response** `200`

```json
{
  "devices": [
    {
      "_id": "60f...",
      "userId": "60f...",
      "type": "mobile",
      "platform": "ios",
      "deviceName": "My Phone",
      "publicKey": "base64-encoded-public-key",
      "appVersion": "1.0.0",
      "lastSeen": "2024-01-01T00:00:00.000Z",
      "revoked": false,
      "createdAt": "2024-01-01T00:00:00.000Z",
      "updatedAt": "2024-01-01T00:00:00.000Z"
    }
  ]
}
```

#### `PATCH /devices/:id/name`

Rename a device.

```json
{
  "deviceName": "New Name"
}
```

**Response** `200`

```json
{
  "device": { "...": "..." }
}
```

#### `DELETE /devices/:id`

Revoke a device (soft delete).

**Response** `200`

```json
{
  "message": "Device revoked"
}
```

## Socket.IO Events

The desktop maintains a single Socket.IO connection. Events are emitted by the server:

| Event           | Payload                                                   | Triggered When            |
|-----------------|-----------------------------------------------------------|---------------------------|
| `oob.approved`  | `{ event, accessToken, refreshToken }`                    | Session approved          |
| `oob.declined`  | `{ event }`                                               | Session rejected          |

## Error Responses

All errors return with a `code` and `message`:

```json
{
  "code": "INVALID_CREDENTIALS",
  "message": "Invalid email or password"
}
```

**Error codes:**

| Code                      | HTTP Status | Description                        |
|---------------------------|-------------|------------------------------------|
| `INVALID_CREDENTIALS`     | 401         | Wrong email or password            |
| `INVALID_SIGNATURE`       | 401         | Challenge signature verification failed |
| `SESSION_NOT_FOUND`       | 404         | OOB session does not exist         |
| `SESSION_ALREADY_APPROVED`| 409         | Session already approved/declined  |
| `SESSION_EXPIRED`         | 410         | Session exceeded 60-second expiry  |
| `DEVICE_REVOKED`          | 403         | Device has been revoked            |
| `CHALLENGE_EXPIRED`       | 400         | Challenge mismatch or reused       |
| `INVALID_REFRESH_TOKEN`   | 401         | Token not found, expired, or reused|
| `DEVICE_NOT_FOUND`        | 404         | Device does not exist              |
| `VALIDATION_ERROR`        | 400         | Invalid request body               |
| `UNAUTHORIZED`            | 401         | Missing or invalid JWT             |

## Scripts

| Script         | Description                     |
|----------------|---------------------------------|
| `npm run dev`  | Start server with ts-node       |
| `npm run build`| Compile TypeScript              |
| `npm test`     | Run tests (requires `NODE_ENV=development`) |
| `npm run test:watch` | Run tests in watch mode   |

## Testing

Tests use an in-memory MongoDB via `mongodb-memory-server`. No external database needed.

```bash
NODE_ENV=development npm test
```
