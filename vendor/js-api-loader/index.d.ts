export interface LoaderOptions {
  apiKey: string;
  version?: string;
  libraries?: string[];
  language?: string;
  region?: string;
  id?: string;
}

export declare class Loader {
  constructor(options: LoaderOptions);
  load(): Promise<typeof google>;
}

export default Loader;
