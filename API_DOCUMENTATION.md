# Ambulance Management System
# Backend API Documentation

## 1. Project Overview

The Ambulance Management System backend provides REST APIs for three main user roles:

- Patient
- Driver
- Hospital

The backend handles user authentication, ambulance requests, driver assignment, GPS location tracking, driver availability and hospital dashboard operations.

## 2. Technology Stack

- Node.js
- Express.js
- MongoDB
- Mongoose
- JWT Authentication
- Socket.IO

## 3. Base URL

Local development:

`http://localhost:5000`

API routes use the following base paths:

- `/api/auth`
- `/api/users`
- `/api/ambulance`

## 4. Authentication

Protected APIs require JWT authentication.

Add the following header to protected requests:

`Authorization: Bearer YOUR_JWT_TOKEN`

### User Roles

| Role | Access |
|---|---|
| patient | Patient APIs |
| driver | Driver APIs |
| hospital | Hospital APIs |

The backend verifies the JWT and checks the user's role before allowing access.

---

# 5. Authentication and User APIs

## API 1: Register User

- Method: POST
- Endpoint: `/api/auth/register`
- Access: Public
- Authentication: Not required

Purpose:
Registers a new user in the system.

Success status: `201 Created`

Note: Request fields and detailed response format must match the registration route implementation.

## API 2: Login User

- Method: POST
- Endpoint: `/api/auth/login`
- Access: Public
- Authentication: Not required

Purpose:
Authenticates a registered user and provides a JWT token.

Success status: `200 OK`

The returned JWT is used to access protected APIs.

## API 3: Get User Profile

- Method: GET
- Endpoint: `/api/users/profile`
- Access: Authenticated users
- Authentication: JWT required

Purpose:
Fetches the profile of the currently logged-in user.

Success status: `200 OK`

---

# 6. Patient APIs

All Patient APIs require JWT authentication and the `patient` role.

## API 4: Create Ambulance Request

- Method: POST
- Endpoint: `/api/ambulance/request`
- Access: Patient
- Authentication: JWT required

Purpose:
Creates a new ambulance request.

### Request Body

```json
{
  "pickupLocation": "Dehradun",
  "destination": "AIIMS Rishikesh",
  "emergencyType": "Medical Emergency",
  "description": "Patient needs urgent medical assistance",
  "longitude": 78.0322,
  "latitude": 30.3165
}
```

### Validation

- `pickupLocation` is required and maximum 200 characters.
- `destination` is required and maximum 200 characters.
- `emergencyType` must be one of:
  - Medical Emergency
  - Accident
  - Critical Care
  - Other
- `description` is optional and maximum 1000 characters.
- Latitude must be between -90 and 90.
- Longitude must be between -180 and 180.

### Success Response

Status: `201 Created`

```json
{
  "message": "Ambulance request created successfully",
  "request": {
    "_id": "REQUEST_ID",
    "status": "pending"
  }
}
```

### Error Responses

- `400` — Invalid or missing input.
- `500` — Server error.

## API 5: Get Patient Requests

- Method: GET
- Endpoint: `/api/ambulance/my-requests`
- Access: Patient
- Authentication: JWT required

Purpose:
Fetches all ambulance requests created by the logged-in patient.

Requests are sorted by creation date, newest first.

### Success Response

Status: `200 OK`

```json
{
  "message": "Ambulance requests fetched successfully",
  "requests": []
}
```

### Error Response

- `500` — Server error.

## API 6: Cancel Ambulance Request

- Method: PATCH
- Endpoint: `/api/ambulance/:requestId/cancel`
- Access: Patient
- Authentication: JWT required

Purpose:
Allows a patient to cancel their own ambulance request.

### URL Parameter

`requestId`: MongoDB ambulance request ID.

### Business Rules

- Patient can cancel only their own request.
- Allowed statuses: `pending`, `accepted`, `assigned`.
- Completed or already cancelled requests cannot be cancelled.
- If a driver was assigned, driver availability is recalculated.
- Database updates are performed inside a MongoDB transaction.

### Success Response

Status: `200 OK`

```json
{
  "message": "Ambulance request cancelled successfully.",
  "request": {},
  "driverAvailability": true
}
```

`driverAvailability` can be `null` when no driver was assigned.

### Error Responses

- `400` — Invalid request ID.
- `404` — Request not found or cannot be cancelled.
- `500` — Server error.

## API 7: Get Driver Location

- Method: GET
- Endpoint: `/api/ambulance/:requestId/location`
- Access: Patient
- Authentication: JWT required

Purpose:
Fetches the assigned driver's current location.

### URL Parameter

`requestId`: MongoDB ambulance request ID.

### Business Rules

- Patient can access only their own request.
- Request must have an assigned driver.
- Request status must be `accepted` or `assigned`.

### Success Response

Status: `200 OK`

```json
{
  "message": "Driver location fetched successfully.",
  "driver": {
    "name": "Driver Name",
    "phone": "9876543210",
    "location": {
      "type": "Point",
      "coordinates": [78.0322, 30.3165]
    }
  }
}
```

### Error Responses

- `400` — Invalid request ID.
- `404` — Request or assigned driver not found.
- `500` — Server error.

---

# 7. Driver APIs

All Driver APIs require JWT authentication and the `driver` role.

## API 8: Get Available Ambulance Requests

- Method: GET
- Endpoint: `/api/ambulance/available`
- Access: Driver
- Authentication: JWT required

Purpose:
Fetches all pending ambulance requests that have not been assigned to a driver.

Patient details included:
- Name
- Phone
- Email

Requests are sorted newest first.

### Success Response

Status: `200 OK`

```json
{
  "message": "Available ambulance requests fetched successfully",
  "requests": []
}
```

### Error Response

- `500` — Server error.

## API 9: Accept Ambulance Request

- Method: PATCH
- Endpoint: `/api/ambulance/:requestId/accept`
- Access: Driver
- Authentication: JWT required

Purpose:
Allows a driver to accept a pending ambulance request.

### Business Rules

- Driver must be available.
- Driver cannot accept another request if they already have an active request.
- Only pending and unassigned requests can be accepted.
- Driver availability is updated to `false`.
- Assignment and availability updates use a MongoDB transaction.

### Success Response

Status: `200 OK`

```json
{
  "message": "Ambulance request accepted successfully.",
  "request": {}
}
```

### Error Responses

- `400` — Invalid request ID.
- `409` — Driver unavailable, has an active request, or request is already assigned.
- `500` — Server error.

## API 10: Get Assigned Requests

- Method: GET
- Endpoint: `/api/ambulance/my-assigned`
- Access: Driver
- Authentication: JWT required

Purpose:
Fetches ambulance requests assigned to the logged-in driver.

Patient details included:
- Name
- Phone
- Email

Requests are sorted newest first.

### Success Response

Status: `200 OK`

```json
{
  "message": "Your assigned ambulance requests fetched successfully",
  "requests": []
}
```

### Error Response

- `500` — Server error.

## API 11: Complete Ambulance Request

- Method: PATCH
- Endpoint: `/api/ambulance/:requestId/complete`
- Access: Driver
- Authentication: JWT required

Purpose:
Allows the assigned driver to mark an accepted ambulance request as completed.

### Business Rules

- Only the assigned driver can complete the request.
- Request status must be `accepted`.
- Request status changes to `completed`.
- Driver availability is recalculated based on other active requests.
- Updates are performed inside a MongoDB transaction.

### Success Response

Status: `200 OK`

```json
{
  "message": "Ambulance request completed successfully.",
  "request": {},
  "driverAvailability": true
}
```

### Error Responses

- `400` — Invalid request ID.
- `404` — Matching active request not found.
- `500` — Server error.

## API 12: Update Driver Availability

- Method: PATCH
- Endpoint: `/api/ambulance/availability`
- Access: Driver
- Authentication: JWT required

Purpose:
Allows a driver to go online or offline.

### Request Body

```json
{
  "isAvailable": true
}
```

`isAvailable` must be a boolean (`true` or `false`).

### Business Rules

- A driver with an active request cannot become available.
- Driver availability is updated in the database.
- Password is excluded from the returned driver object.

### Success Response

Status: `200 OK`

```json
{
  "message": "Driver availability updated successfully.",
  "driver": {
    "name": "Driver Name",
    "role": "driver",
    "isAvailable": true
  }
}
```

### Error Responses

- `400` — Invalid availability value.
- `404` — Driver not found.
- `409` — Driver has an active request.
- `500` — Server error.

## API 13: Get Driver Availability

- Method: GET
- Endpoint: `/api/ambulance/availability`
- Access: Driver
- Authentication: JWT required

Purpose:
Fetches the current availability status of the logged-in driver.

### Success Response

Status: `200 OK`

```json
{
  "message": "Driver availability fetched successfully.",
  "driver": {
    "name": "Driver Name",
    "email": "driver@example.com",
    "role": "driver",
    "isAvailable": true
  }
}
```

### Error Responses

- `404` — Driver not found.
- `500` — Server error.

## API 14: Update Driver GPS Location

- Method: PATCH
- Endpoint: `/api/ambulance/location`
- Access: Driver
- Authentication: JWT required

Purpose:
Updates the driver's current GPS coordinates.

### Request Body

```json
{
  "latitude": 30.3165,
  "longitude": 78.0322
}
```

### Validation

- Latitude must be between -90 and 90.
- Longitude must be between -180 and 180.
- Both values must be numbers.

### Success Response

Status: `200 OK`

```json
{
  "message": "Driver location updated successfully.",
  "location": {
    "type": "Point",
    "coordinates": [78.0322, 30.3165]
  }
}
```

### Error Responses

- `400` — Invalid latitude or longitude.
- `404` — Driver not found.
- `500` — Server error.

---

# 8. Hospital APIs

All Hospital APIs require JWT authentication and the `hospital` role.

## API 15: Find Nearby Available Drivers

- Method: GET
- Endpoint: `/api/ambulance/nearby-drivers`
- Access: Hospital
- Authentication: JWT required

Purpose:
Finds available drivers near the hospital's given GPS coordinates.

### Query Parameters

| Parameter | Required | Description |
|---|---|---|
| longitude | Yes | Hospital longitude |
| latitude | Yes | Hospital latitude |
| maxDistance | No | Search radius in meters; default 10000 |

### Example Request

`GET /api/ambulance/nearby-drivers?longitude=78.0322&latitude=30.3165&maxDistance=10000`

### Business Rules

- Only drivers with `isAvailable: true` are searched.
- Uses MongoDB `$geoNear` aggregation.
- Maximum search distance defaults to 10 km.
- Maximum 20 drivers are returned.
- Results are ordered by geographic distance.

### Success Response

Status: `200 OK`

```json
{
  "message": "Nearby available drivers fetched successfully.",
  "count": 1,
  "drivers": [
    {
      "name": "Driver Name",
      "phone": "9876543210",
      "isAvailable": true,
      "distanceInMeters": 500,
      "distanceInKm": 0.5
    }
  ]
}
```

### Error Responses

- `400` — Invalid coordinates or distance.
- `500` — Server error.

## API 16: Automatically Assign Nearest Driver

- Method: PATCH
- Endpoint: `/api/ambulance/:requestId/auto-assign`
- Access: Hospital
- Authentication: JWT required

Purpose:
Automatically assigns the nearest available driver to a pending ambulance request.

### URL Parameter

`requestId`: MongoDB ambulance request ID.

### Business Rules

1. Checks whether the request is pending and unassigned.
2. Reads the request's pickup coordinates.
3. Searches available drivers within 10 km.
4. Checks up to 20 nearby candidates.
5. Skips drivers who already have an active request.
6. Locks the selected driver by setting `isAvailable: false`.
7. Assigns the driver and changes request status to `accepted`.
8. Uses MongoDB transactions to maintain consistency.
9. Tries the next candidate if a driver cannot be assigned.

### Success Response

Status: `200 OK`

```json
{
  "message": "Nearest driver assigned successfully.",
  "distanceInMeters": 500,
  "distanceInKm": 0.5,
  "request": {},
  "driver": {
    "_id": "DRIVER_ID",
    "name": "Driver Name",
    "phone": "9876543210",
    "isAvailable": false
  }
}
```

### Error Responses

- `400` — Invalid request ID.
- `404` — Pending request not found or no nearby drivers found.
- `409` — Request changed concurrently or no driver available for assignment.
- `500` — Server error.

## API 17: Get Hospital Dashboard Requests

- Method: GET
- Endpoint: `/api/ambulance/hospital/requests`
- Access: Hospital
- Authentication: JWT required

Purpose:
Fetches all ambulance requests for the hospital dashboard.

### Included Patient Details

- Name
- Phone
- Email

### Included Assigned Driver Details

- Name
- Phone
- Email
- Availability status

Requests are sorted newest first.

### Success Response

Status: `200 OK`

```json
{
  "message": "Hospital dashboard requests fetched successfully",
  "totalRequests": 1,
  "requests": []
}
```

### Error Response

- `500` — Server error.

---

# 9. Important Technical Details

## GeoJSON Location Format

The backend stores GPS locations using GeoJSON Point format.

```json
{
  "type": "Point",
  "coordinates": [78.0322, 30.3165]
}
```

Important:

- First value = Longitude
- Second value = Latitude

Always send coordinates in this order when storing GeoJSON.

## Ambulance Request Status Flow

The main request lifecycle is:

`pending → accepted → completed`

A patient can cancel an eligible pending or active request, changing its status to `cancelled`.

## Driver Availability

- `true` = Driver is available.
- `false` = Driver is unavailable or has an active assignment.

## MongoDB Transactions

Transactions are used in important assignment, cancellation and completion workflows to keep related database updates consistent.

---

# 10. API Summary

| Module | Number of APIs |
|---|---:|
| Authentication and User | 3 |
| Patient | 4 |
| Driver | 7 |
| Hospital | 3 |
| Total | 17 |

### HTTP Method Summary

| Method | Count |
|---|---:|
| GET | 8 |
| POST | 3 |
| PATCH | 6 |
| Total | 17 |

---

# 11. Android App Integration

For Android integration:

1. Use the backend Base URL.
2. Use the registration and login APIs for authentication.
3. Store the JWT securely on the Android side.
4. Send the JWT in the Authorization header for protected APIs.
5. Use role-specific endpoints for Patient, Driver and Hospital apps.
6. Send GPS coordinates as numeric latitude and longitude values.
7. Use the request ID returned by the backend when accepting, cancelling, completing or tracking a request.
8. Use the driver location endpoint for REST





# 8. Socket.IO Documentation

## Connection URL

Local backend:
http://localhost:5000

Transport: Socket.IO

## 8.1 Authentication

Socket.IO connection requires a valid JWT token.

Pass the token through the Socket.IO authentication object:

```javascript
const socket = io("http://localhost:5000", {
  auth: {
    token: "YOUR_JWT_TOKEN"
  }
});
```

The server verifies the JWT and validates:
- userId must be a valid MongoDB ObjectId.
- role must be patient, driver, or hospital.

Connection errors:
- Authentication required.
- Invalid token payload.
- Invalid or expired token.

## 8.2 Client-to-Server Events

### Event 1: join-ambulance-request

Purpose: Join the tracking room for an active ambulance request.

Used by: Patient and assigned driver.

Event payload:

```javascript
socket.emit("join-ambulance-request", "MONGODB_REQUEST_ID");
```

Authorization:
- Patient can join only their own request.
- Driver can join only the request assigned to them.
- Request status must be accepted or assigned.

Room format:

```text
ambulance:<requestId>
```

Success event: `tracking-joined`

Response:

```json
{
  "message": "Successfully joined ambulance tracking room.",
  "requestId": "MONGODB_REQUEST_ID"
}
```

### Event 2: update-driver-location

Purpose: Send the driver's latest GPS coordinates.

Used by: Driver only.

Event payload:

```javascript
socket.emit("update-driver-location", {
  requestId: "MONGODB_REQUEST_ID",
  latitude: 30.3165,
  longitude: 78.0322
});
```

Validation:
- Only driver role can update location.
- Request ID must be valid.
- Latitude must be between -90 and 90.
- Longitude must be between -180 and 180.
- Request must be actively assigned to that driver.

The server saves the driver's location in MongoDB using GeoJSON coordinates:

```json
{
  "type": "Point",
  "coordinates": [78.0322, 30.3165]
}
```

Note: GeoJSON coordinate order is [longitude, latitude].

## 8.3 Server-to-Client Events

### Event 1: tracking-joined

Sent when the client successfully joins the tracking room.

```json
{
  "message": "Successfully joined ambulance tracking room.",
  "requestId": "MONGODB_REQUEST_ID"
}
```

### Event 2: driver-location-updated

Purpose: Broadcast updated driver GPS location to everyone in the corresponding tracking room.

Received by: Patient and assigned driver clients in that room.

Payload:

```json
{
  "driverId": "DRIVER_USER_ID",
  "latitude": 30.3165,
  "longitude": 78.0322,
  "updatedAt": "2026-11-23T10:30:00.000Z"
}
```

`updatedAt` is a server-generated date/time.

### Event 3: tracking-error

Sent when authentication, authorization, request validation, or location update fails.

Possible error messages:
- Invalid request ID.
- Active ambulance request not found.
- You are not authorized to join this tracking room.
- Unable to join tracking room.
- Only drivers can update location.
- Invalid latitude or longitude.
- No active assigned request found.
- Driver not found.
- Unable to update live location.

## 8.4 Socket.IO Workflow

### Patient App
1. Login and receive JWT token.
2. Connect to Socket.IO using the JWT token.
3. Emit `join-ambulance-request` with the request ID.
4. Listen for `tracking-joined`.
5. Listen for `driver-location-updated`.
6. Update the driver's marker on the map using latitude and longitude.
7. Listen for `tracking-error`.

### Driver App
1. Login and receive JWT token.
2. Connect to Socket.IO using the JWT token.
3. Emit `join-ambulance-request` with the assigned request ID.
4. Listen for `tracking-joined`.
5. Get GPS coordinates from the Android device.
6. Emit `update-driver-location` with requestId, latitude, and longitude.
7. Listen for `tracking-error`.

## 8.5 Important Notes for Android Integration

- Patient app receives live GPS updates; it must not send driver location updates.
- Driver app sends GPS updates only for its active assigned request.
- Both apps must use the same request ID for tracking.
- Send latitude and longitude as numeric values, not strings.
- Do not share JWT tokens in documentation or public repositories.
- Socket.IO `disconnect` is a built-in lifecycle event.

## 8.6 Event Summary

| Direction | Event |
|---|---|
| Client → Server | join-ambulance-request |
| Client → Server | update-driver-location |
| Server → Client | tracking-joined |
| Server → Client | driver-location-updated |
| Server → Client | tracking-error |
| Built-in lifecycle | connect, disconnect, connect_error |
