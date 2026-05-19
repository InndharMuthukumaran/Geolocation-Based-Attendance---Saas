# Geolocation-Based Attendance SaaS

A robust, full-stack attendance management system designed for multi-tenant organizations. This platform uses geographical boundaries (geofences) and biometric device binding (WebAuthn) to ensure high-integrity attendance records.

## 🚀 Key Features

### 1. Security & Authentication
- **Role-Based Access Control (RBAC)**: Distinct permissions for Admin, Manager, Sub-Manager, and Member roles.
- **Biometric Device Binding**: WebAuthn/Passkey integration to lock accounts to a specific physical device, preventing proxy attendance.
- **Secure Verification**: Two-step email verification workflow with a 15-day account activation window.
- **Anti-Spoofing**: IP-based VPN/Proxy detection and location-coordinate validation.
- **JWT Session Management**: Secure access and refresh token workflow.

### 2. Multi-Site Geofencing
- **Dynamic Boundaries**: Manage multiple circular geofences with customizable radii.
- **Interactive Map Picker**: Precision location selection for site deployment.
- **Operational Status**: Real-time toggling of sites as Active, Disabled, or on Holiday.
- **Scheduling Logic**: "Safe Windows" to pause auto-checkout during breaks or transitions.

### 3. Attendance Logic
- **Precision Enforcement**: Check-in restricted to within 15m of site boundaries (with buffer).
- **Intelligent Auto-Checkout**: 5-minute delayed countdown when leaving a site to handle GPS drift and prevent accidental checkouts.
- **Manual Override Removal**: Production build uses strictly verified GPS data for high integrity.
- **Attendance Locking**: Records are locked once forwarded to a superior to ensure data immutability.

### 4. Management & Analytics
- **Hierarchical Management**: Full organizational tree drill-down (Admins -> Managers -> Subordinates).
- **Bulk Operations**: Rapid user onboarding via Excel template uploads.
- **Data-Driven Insights**:
    - Presence/Absence pie charts for daily monitoring.
    - Hourly check-in distribution bar charts.
    - 30-day individual performance history line charts.
- **Global Reporting**: Daily report inbox and full historical Excel exports.

### 5. Creator Feedback Channel
- Integrated "Give Feedback" system allowing any user (including Admins) to submit recommendations directly to the system creator via the database.

## 🛠️ Tech Stack
- **Frontend**: React, Vite, Leaflet (Maps), Recharts (Analytics), Axios.
- **Backend**: Node.js, Express, Mongoose (MongoDB), Nodemailer, Multer.
- **Security**: WebAuthn (SimpleWebAuthn), JWT, Bcrypt.

## ⚙️ Setup Instructions

### Backend Setup
1. Navigate to the `backend/` directory.
2. Install dependencies: `npm install`.
3. Create a `.env` file based on `.env.example`.
4. Required environment variables:
   - `MONGODB_URI`: Your MongoDB connection string.
   - `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET`: Secure strings for token signing.
   - `SMTP_USER` / `SMTP_PASS`: For email notifications and verification.
5. Start the server: `npm run dev`.

### Frontend Setup
1. Navigate to the `frontend/` directory.
2. Install dependencies: `npm install`.
3. Create a `.env` file based on the template.
4. Required environment variables:
   - `VITE_API_URL`: URL of your backend API (e.g., `http://localhost:4002/api`).
5. Start the application: `npm run dev`.

## 📁 Project Structure
- `/backend`: Express API, Mongoose models, and security middleware.
- `/frontend`: React application with role-based routing and map integrations.

---
*Created with focus on Security, Transparency, and Scalability.*
