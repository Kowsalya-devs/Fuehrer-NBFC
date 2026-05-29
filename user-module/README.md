# Fuehrer NBFC User Module

Node.js + Express + Prisma backend for the Fuehrer NBFC user module. This module handles:

- user registration with phone number
- OTP generation and verification
- JWT authentication
- user profile APIs
- KYC flow for PAN, Aadhaar, selfie, eSign
- eNACH mandate registration and status
- token blacklist on logout

## Tech Stack

- Node.js
- Express
- PostgreSQL
- Prisma ORM
- JWT
- bcrypt
- express-validator
- express-rate-limit
- Winston

## Project Structure

```text
src/
  app.js
  config/
  controllers/
  middleware/
  routes/
  services/
  utils/
  validations/
  vendors/
prisma/
postman/
server.js
```

## Environment Setup

Copy `.env.example` to `.env` and fill in the correct values.

Required variables:

- `PORT`
- `NODE_ENV`
- `DATABASE_URL`
- `JWT_SECRET`
- `JWT_EXPIRES_IN`
- `ENCRYPTION_KEY`

## Install And Run

From [`C:\Users\harikrishnan\OneDrive\Documents\Feuhrer user module`](C:/Users/harikrishnan/OneDrive/Documents/Feuhrer%20user%20module):

```powershell
npm install
npm run prisma:generate
npm run prisma:validate
npm run prisma:push
npm start
```

Base URL:

```text
http://localhost:3000
```

## Prisma Note

This project uses a shared PostgreSQL database that already contains business-module tables.

Use:

```powershell
npm run prisma:push
```

Do not use `prisma migrate reset` on the shared database.

## Authentication Flow

1. Register user with phone number.
2. Send OTP to that phone number.
3. Verify OTP.
4. Receive JWT token.
5. Use `Authorization: Bearer <token>` for protected routes.
6. Logout invalidates the token.

## Postman Collection

Import:

[`C:\Users\harikrishnan\OneDrive\Documents\Feuhrer user module\postman\Fuehrer NBFC - User Module.postman_collection.json`](C:/Users/harikrishnan/OneDrive/Documents/Feuhrer%20user%20module/postman/Fuehrer%20NBFC%20-%20User%20Module.postman_collection.json)

Collection variables used:

- `baseUrl`
- `phone`
- `otp`
- `token`
- `userId`

## Exact Postman Request Order

### 1. Register

`POST /api/users/register`

```json
{
  "phone": "9876543210"
}
```

Expected:

- status `201`
- response contains `data.user.id`

### 2. Send OTP

`POST /api/users/send-otp`

```json
{
  "phone": "9876543210"
}
```

Expected:

- status `200`
- in development mode response contains `data.otp`
- response contains `data.expiresAt`

### 3. Verify OTP

`POST /api/users/verify-otp`

```json
{
  "phone": "9876543210",
  "otp": "123456"
}
```

Expected:

- status `200`
- response contains `data.token`
- response contains `data.user.id`

Save these values:

- `token = data.token`
- `userId = data.user.id`

### 4. Get Profile

`GET /api/users/profile`

Header:

```text
Authorization: Bearer {{token}}
```

Expected:

- status `200`
- returns logged-in user details

### 5. Update Profile

`PUT /api/users/profile`

Headers:

```text
Authorization: Bearer {{token}}
Content-Type: application/json
```

Body:

```json
{
  "name": "Hari Krishnan",
  "email": "hari@example.com"
}
```

Expected:

- status `200`
- updated `name` and `email`

### 6. Get User By ID

`GET /api/users/{{userId}}`

Header:

```text
Authorization: Bearer {{token}}
```

Expected:

- status `200`

### 7. Verify PAN

`POST /api/kyc/verify-pan`

Headers:

```text
Authorization: Bearer {{token}}
Content-Type: application/json
```

Body:

```json
{
  "panNumber": "ABCDE1234F"
}
```

Expected:

- status `200`
- `data.kycStatus` remains `PENDING` until all KYC checks are done

### 8. Verify Aadhaar

`POST /api/kyc/verify-aadhaar`

Body:

```json
{
  "aadhaarNumber": "123456789012"
}
```

Expected:

- status `200`

### 9. Verify Selfie

`POST /api/kyc/verify-selfie`

Body:

```json
{
  "selfieData": "base64-selfie-payload"
}
```

Expected:

- status `200`
- once PAN + Aadhaar + selfie are all verified, `data.kycStatus` becomes `VERIFIED`

### 10. Get KYC Status

`GET /api/kyc/status`

Expected:

- status `200`
- returns `panVerified`, `aadhaarVerified`, `selfieVerified`, `eSignStatus`, `kycStatus`

### 11. eSign

`POST /api/kyc/esign`

Body:

```json
{
  "documentId": "loan-agreement-001"
}
```

Expected:

- status `200`
- `data.eSignStatus = SIGNED`

### 12. Register eNACH

`POST /api/kyc/enach`

Body:

```json
{
  "accountNumber": "123456789012",
  "ifscCode": "HDFC0001234",
  "accountHolderName": "Hari Krishnan",
  "bankName": "HDFC Bank"
}
```

Expected:

- status `200`
- returns `data.mandateId`
- returns `data.status`

### 13. Get eNACH Status

`GET /api/kyc/enach/status`

Expected:

- status `200`
- returns latest mandate status

### 14. Login

`POST /api/users/login`

```json
{
  "phone": "9876543210"
}
```

Expected:

- status `200`
- sends new OTP for existing user

### 15. Logout

`POST /api/users/logout`

Header:

```text
Authorization: Bearer {{token}}
```

Expected:

- status `200`
- token is blacklisted

### 16. Verify Logout

Call again:

`GET /api/users/profile`

Expected:

- status `401`
- message says token is invalidated

## Important Behavior

- OTP expires after 10 minutes.
- Older OTPs for the same phone are marked used when a new OTP is generated.
- OTP is returned in API response only in development mode.
- PAN and Aadhaar are encrypted before storage.
- `POST /api/users/send-otp` and `POST /api/users/login` are rate limited to 3 requests per 10 minutes.
- JWT payload is `{ userId, phone }`.
- JWT expiry is `7d`.

## Protected Routes

- `GET /api/users/profile`
- `PUT /api/users/profile`
- `GET /api/users/:userId`
- `POST /api/kyc/verify-pan`
- `POST /api/kyc/verify-aadhaar`
- `POST /api/kyc/verify-selfie`
- `GET /api/kyc/status`
- `POST /api/kyc/esign`
- `POST /api/kyc/enach`
- `GET /api/kyc/enach/status`
- `POST /api/users/logout`

## Vendor Mocks

The following are mocked for now and can be replaced later without changing route/controller logic:

- Karza
- HyperVerge
- Signzy
- eNACH provider

## Handoff Notes

- Shared database is already connected through Prisma.
- Use Prisma commands only.
- Keep the business-module tables untouched.
- Replace mock vendor files only when real credentials arrive.
