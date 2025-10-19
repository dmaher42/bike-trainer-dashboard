# Bike Trainer Dashboard

## Project Description
Bike Trainer Dashboard is a web-based application designed to transform raw indoor cycling data into actionable insights. Whether you are training for a race or simply tracking your fitness, the dashboard provides real-time telemetry, historical trends, and personalized metrics so you can understand every workout at a glance.

## Features
- **Live Ride Metrics**: Monitor cadence, power, heart rate, and speed through an intuitive dashboard.
- **Custom Workouts**: Build interval sessions and track compliance to targeted zones.
- **Historical Analytics**: Compare performance across sessions with charts, summaries, and PR tracking.
- **Device Connectivity**: Integrate with smart trainers and ANT+/Bluetooth sensors for seamless data capture.
- **Session Notes**: Log how each ride felt and highlight equipment or environmental factors.
- **Responsive UI**: Optimized layout adapts to desktops, tablets, and mobile devices.

## Installation
1. Ensure you have **Node.js (>=18)** and **npm** installed.
2. Clone the repository:
   ```bash
   git clone https://github.com/your-org/bike-trainer-dashboard.git
   cd bike-trainer-dashboard
   ```
3. Install dependencies:
   ```bash
   npm install
   ```

## Usage
1. Start the development server:
   ```bash
   npm run dev
   ```
2. Open your browser and navigate to `http://localhost:5173` (or the port shown in the terminal).
3. Configure your trainer connection through the device settings panel.
4. Start a ride to visualize live metrics, or explore past sessions from the analytics section.

For production builds, run:
```bash
npm run build
npm run preview
```

## Technology Stack
- **React** for building interactive UI components.
- **TypeScript** for type-safe application logic.
- **Tailwind CSS** for utility-first styling and rapid UI development.

## Browser Compatibility
Bike Trainer Dashboard is tested on the latest versions of Chrome, Firefox, Safari, and Edge. For the best experience, use an up-to-date browser with Web Bluetooth or ANT+ adapter support when connecting hardware devices.

## License
This project is distributed under the MIT License. See the [LICENSE](LICENSE) file for details.
