import * as bcrypt from "bcrypt";

export async function crearPassword(password: string) {
    const hashed = await bcrypt.hash(password, 10);
    console.log(`Password hashed: ${hashed}`);
}
export function validarPassword(password: string): boolean {
    const regex = /^(?=.*[A-Z])(?=.*\d)(?=.*[^\w\s]).{8,}$/;
    return regex.test(password);
}