import * as jwt from "jsonwebtoken";
import * as dotenv from "dotenv";
dotenv.config();

const JWT_SECRET = process.env.JWT_SECRET as string;
const JWT_EXPIRES_IN = (process.env.JWT_EXPIRES_IN || "8h") as jwt.SignOptions["expiresIn"];

export interface JwtPayload {
    id: number;
    email: string;
    rol: string;
    empresa_id?: number;
    centro_costo_id?: number;
}

export function signJwt(
    payload: JwtPayload,
    expiresIn: jwt.SignOptions["expiresIn"] = JWT_EXPIRES_IN
): string {
    return jwt.sign(
        { ...payload },
        JWT_SECRET,
        { expiresIn }
    );
}
