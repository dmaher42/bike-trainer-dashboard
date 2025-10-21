export {};

declare global {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    google: any;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const google: any;
}
