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
