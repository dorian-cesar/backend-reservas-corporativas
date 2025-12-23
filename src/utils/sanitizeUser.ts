import { User } from "../models/user.model";

export const sanitizeUser = (user: User | any) => {
    if (!user) return null;

    const plain = typeof user.toJSON === "function"
        ? user.toJSON()
        : user;

    const {
        password,
        twoFactorSecret,
        ...safeUser
    } = plain;

    return safeUser;
};
