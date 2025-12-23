export function validarPassword(password: string): boolean {
    const regex = /^(?=.*[A-Z])(?=.*\d)(?=.*[^\w\s]).{8,}$/;
    return regex.test(password);
}