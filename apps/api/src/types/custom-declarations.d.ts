// Type declarations for packages without bundled types

declare module 'express' {
  export interface Request {
    user?: { id: string; email: string; role: string };
    headers: Record<string, string | string[]>;
    body: any;
    query: any;
    params: any;
    ip: string;
  }
  export interface Response {
    status(code: number): Response;
    json(data: any): Response;
    setHeader(name: string, value: string | string[]): Response;
    getHeader(name: string): string | string[] | undefined;
    flushHeaders(): void;
    write(data: string | Buffer | Uint8Array): boolean;
    end(): Response;
    end(data: any): Response;
  }
  export interface NextFunction {
    (err?: any): void;
  }
  export function json(): any;
  export function urlencoded(options?: any): any;
  export function static(root: string): any;
}

declare module 'bcryptjs' {
  const bcrypt: {
    hashSync(password: string, saltOrRounds: number | string): string;
    compareSync(password: string, hash: string): boolean;
    genSaltSync(rounds?: number): string;
    hash(password: string, saltOrRounds: number | string): Promise<string>;
    compare(password: string, hash: string): Promise<boolean>;
    genSalt(rounds?: number): Promise<string>;
  };
  export default bcrypt;
}

declare module 'passport-jwt' {
  export interface StrategyOptions {
    jwtFromRequest: any;
    secretOrKey: string;
  }
  export class Strategy {
    constructor(options: StrategyOptions, verify: (payload: any, done: any) => void);
    name?: string;
    authenticate?: (req: any, options?: any) => void;
  }
  export const ExtractJwt: {
    fromAuthHeaderAsBearerToken(): any;
    fromHeader(header_name: string): any;
    fromUrlQueryParameter(param_name: string): any;
  };
}

// Minimal type declarations for puppeteer-core.
// The package is declared as a dependency in package.json but is installed at
// deploy time (it relies on a system-installed Chromium). These ambient types
// allow `tsc --noEmit` to succeed in environments where puppeteer-core has not
// yet been installed, covering only the API surface used by ScreenshotService.
declare module 'puppeteer-core' {
  export interface BrowserLaunchOptions {
    executablePath?: string;
    headless?: boolean | 'new';
    args?: string[];
    defaultViewport?: Record<string, unknown> | null;
    ignoreHTTPSErrors?: boolean;
    timeout?: number;
  }

  export interface Viewport {
    width?: number;
    height?: number;
    deviceScaleFactor?: number;
    isMobile?: boolean;
    hasTouch?: boolean;
    isLandscape?: boolean;
  }

  export interface WaitForOptions {
    waitUntil?: 'load' | 'domcontentloaded' | 'networkidle0' | 'networkidle2';
    timeout?: number;
  }

  export interface DirectNavigationOptions extends WaitForOptions {
    referer?: string;
  }

  export interface ScreenshotOptions {
    type?: 'png' | 'jpeg' | 'webp';
    fullPage?: boolean;
    quality?: number;
    omitBackground?: boolean;
    encoding?: 'base64' | 'binary';
    captureBeyondViewport?: boolean;
  }

  export interface Page {
    setViewport(viewport: Viewport): Promise<void>;
    goto(url: string, options?: DirectNavigationOptions): Promise<unknown>;
    screenshot(options?: ScreenshotOptions): Promise<string | Buffer>;
    close(): Promise<void>;
    setDefaultTimeout(timeout: number): void;
  }

  export interface Browser {
    newPage(): Promise<Page>;
    close(): Promise<void>;
    isConnected(): boolean;
  }

  export function launch(options?: BrowserLaunchOptions): Promise<Browser>;
  const _default: { launch: typeof launch };
  export default _default;
}
