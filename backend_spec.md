# Shield App Backend Specification

## Overview

Build the backend for a Flutter Desktop + Flutter Mobile application
demonstrating Out-of-Band (OOB) authentication using QR code approval.

### Technology Stack

-   Node.js
-   TypeScript
-   Express
-   Mongoose
-   MongoDB
-   Zod for request validation
-   JWT for authentication
-   Socket.IO for realtime communication
-   Jest + Supertest for API tests

The MongoDB connection string will be provided in `.env`.

Write unit/integration tests for all APIs.

------------------------------------------------------------------------

# Authentication Flow

1.  User signs in on the desktop using email/password.
2.  Backend validates credentials.
3.  Backend creates an OOB login session.
4.  Desktop receives a `sessionId` and renders it as a QR code.
5.  Mobile scans the QR code.
6.  Mobile requests a challenge from the backend.
7.  Mobile authenticates the user using biometrics.
8.  Mobile signs the challenge with its private key.
9.  Backend verifies the signature using the stored public key.
10. Backend issues an Access Token and Refresh Token for the desktop.
11. Backend notifies the desktop via Socket.IO.
12. Desktop stores both tokens securely and is authenticated.

------------------------------------------------------------------------

# Database Schemas

## User

-   id
-   email (unique)
-   passwordHash
-   createdAt
-   updatedAt

------------------------------------------------------------------------

## Device

Represents every trusted device.

-   id
-   userId (ref User)
-   type ("mobile" \| "desktop")
-   platform ("android" \| "ios" \| "windows" \| "macos" \| "linux")
-   deviceName
-   publicKey (nullable for desktop)
-   appVersion
-   lastSeen
-   revoked (boolean)
-   createdAt
-   updatedAt

------------------------------------------------------------------------

## OobLoginSession

Temporary login session.

-   id
-   sessionId (UUID)
-   loginDeviceId (ref Device)
-   approvingDeviceId (nullable ref Device)
-   challenge
-   status
    -   PENDING
    -   APPROVED
    -   DECLINED
    -   EXPIRED
-   expiresAt
-   approvedAt
-   ipAddress
-   userAgent
-   createdAt

Challenge requirements:

-   32 random bytes
-   Base64 encoded
-   One-time use
-   60 second expiry

------------------------------------------------------------------------

## RefreshSession

Stores active refresh tokens.

-   id
-   userId (ref User)
-   deviceId (ref Device)
-   tokenHash
-   expiresAt
-   createdAt
-   lastUsedAt
-   revokedAt (nullable)

Never store refresh tokens in plaintext. Store only SHA-256 hashes.

------------------------------------------------------------------------

# JWT Policy

## Access Token

-   JWT
-   Lifetime: 15 minutes

Payload:

-   userId
-   deviceId
-   refreshSessionId

------------------------------------------------------------------------

## Refresh Token

-   Lifetime: 30 days
-   Rotating
-   One refresh token per device
-   Stored hashed

------------------------------------------------------------------------

# REST APIs

## Public

POST /auth/signup

POST /auth/login

POST /auth/oob/create-session

GET /auth/oob/challenge/:sessionId

POST /auth/oob/approve

POST /auth/oob/reject

POST /auth/refresh

POST /auth/logout

------------------------------------------------------------------------

## Authenticated

GET /devices

PATCH /devices/:id/name

DELETE /devices/:id

------------------------------------------------------------------------

# Socket.IO

Use Socket.IO instead of long polling.

Each desktop application maintains a single Socket.IO connection.

When `/auth/oob/create-session` is called:

-   associate the socket ID with the OOB session

When approval occurs:

Emit:

-   oob.approved
-   oob.declined
-   oob.expired

Example payload:

``` json
{
  "event": "oob.approved",
  "accessToken": "...",
  "refreshToken": "..."
}
```

The desktop waits for these events instead of polling the backend.

------------------------------------------------------------------------

# Security Requirements

-   HTTPS only
-   JWT signing secret from environment
-   Passwords hashed using bcrypt
-   Refresh tokens hashed before storage
-   Public/private key challenge-response authentication
-   Device revocation support
-   Rotate refresh tokens
-   Expire OOB sessions after 60 seconds
-   Reject reused challenges
-   Reject expired sessions

------------------------------------------------------------------------

# Error Codes

-   INVALID_CREDENTIALS
-   INVALID_SIGNATURE
-   SESSION_NOT_FOUND
-   SESSION_ALREADY_APPROVED
-   SESSION_EXPIRED
-   DEVICE_REVOKED
-   CHALLENGE_EXPIRED
-   INVALID_REFRESH_TOKEN

------------------------------------------------------------------------

# Testing

Write tests for:

-   User signup
-   User login
-   OOB session creation
-   Challenge retrieval
-   Signature approval
-   Session rejection
-   Session expiration
-   Refresh token rotation
-   Logout
-   Device listing
-   Device deletion
-   Device rename
-   JWT authentication middleware
-   Socket.IO approval events
