import { WorkoutPlan } from "../types";

export const defaultWorkouts: WorkoutPlan[] = [
  {
    id: "beginner-endurance",
    name: "Beginner Endurance",
    intervals: [
      { duration: 10, targetPower: 0.5 },
      { duration: 20, targetPower: 0.65 },
      { duration: 5, targetPower: 0.45 },
      { duration: 10, targetPower: 0.75 },
      { duration: 5, targetPower: 0.4 },
    ],
  },
  {
    id: "hiit-intervals",
    name: "HIIT Intervals",
    intervals: [
      { duration: 5, targetPower: 0.5 },
      { duration: 1, targetPower: 0.95 },
      { duration: 2, targetPower: 0.4 },
      { duration: 1, targetPower: 1 },
      { duration: 2, targetPower: 0.4 },
      { duration: 1, targetPower: 0.95 },
      { duration: 2, targetPower: 0.4 },
      { duration: 5, targetPower: 0.5 },
    ],
  },
  {
    id: "threshold-training",
    name: "Threshold Training",
    intervals: [
      { duration: 8, targetPower: 0.55 },
      { duration: 7, targetPower: 0.7 },
      { duration: 12, targetPower: 0.9 },
      { duration: 6, targetPower: 0.5 },
      { duration: 7, targetPower: 0.45 },
    ],
  },
];

export default defaultWorkouts;
