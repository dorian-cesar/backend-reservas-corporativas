import * as bcrypt from "bcrypt";

/**
 * Lista de contraseñas comunes que deben ser rechazadas
 */
const COMMON_PASSWORDS = [
    "password", "123456", "12345678", "123456789", "12345",
    "qwerty", "abc123", "password1", "admin", "letmein",
    "welcome", "monkey", "dragon", "sunshine", "master",
    "football", "iloveyou", "trustno1", "123123", "1234"
];


export const validatePasswordForNewLogin = (
    password: string,
    userEmail?: string
): { isValid: boolean; message?: string } => {
    if (password.length < 14) {
        return {
            isValid: false,
            message: "La contraseña debe tener al menos 14 caracteres"
        };
    }

    if (!/[A-Z]/.test(password)) {
        return {
            isValid: false,
            message: "La contraseña debe incluir al menos una letra mayúscula"
        };
    }

    if (!/[a-z]/.test(password)) {
        return {
            isValid: false,
            message: "La contraseña debe incluir al menos una letra minúscula"
        };
    }

    if (!/\d/.test(password)) {
        return {
            isValid: false,
            message: "La contraseña debe incluir al menos un número"
        };
    }

    if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
        return {
            isValid: false,
            message: "La contraseña debe incluir al menos un símbolo especial"
        };
    }

    //   const lowerPassword = password.toLowerCase();
    //   if (COMMON_PASSWORDS.some(common => lowerPassword.includes(common.toLowerCase()))) {
    //     return {
    //       isValid: false,
    //       message: "La contraseña es demasiado común. Por favor, elige una más segura"
    //     };
    //   }

    //   const sequences = [
    //     "123456", "234567", "345678", "456789", "567890",
    //     "abcdef", "bcdefg", "cdefgh", "defghi", "efghij",
    //     "qwerty", "asdfgh", "zxcvbn"
    //   ];

    //   if (sequences.some(seq => lowerPassword.includes(seq))) {
    //     return {
    //       isValid: false,
    //       message: "La contraseña contiene secuencias simples no permitidas"
    //     };
    //   }

    //   const repeatingChars = /(.)\1{3,}/;
    //   if (repeatingChars.test(password)) {
    //     return {
    //       isValid: false,
    //       message: "La contraseña contiene demasiados caracteres repetidos"
    //     };
    //   }

    //   if (userEmail) {
    //     const emailLocalPart = userEmail.split('@')[0];
    //     if (lowerPassword.includes(emailLocalPart.toLowerCase())) {
    //       return {
    //         isValid: false,
    //         message: "La contraseña no puede contener tu nombre de usuario o email"
    //       };
    //     }
    //   }

    const hasLetters = /[a-zA-Z]/.test(password);
    const hasNumbers = /\d/.test(password);
    const hasSymbols = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password);

    if (!(hasLetters && hasNumbers && hasSymbols)) {
        return {
            isValid: false,
            message: "La contraseña debe incluir una combinación de letras, números y símbolos"
        };
    }

    return { isValid: true };
};

export const isPasswordExpired = (lastChangePassWord?: Date): boolean => {
    if (!lastChangePassWord) {
        return true;
    }

    const now = new Date();
    const passwordDate = new Date(lastChangePassWord);
    const daysSinceChange = Math.floor(
        (now.getTime() - passwordDate.getTime()) / (1000 * 60 * 60 * 24)
    );
    return daysSinceChange > 90;
};

export const getDaysUntilExpiration = (lastChangePassWord?: Date): number => {
    if (!lastChangePassWord) {
        return -90;
    }

    const now = new Date();
    const passwordDate = new Date(lastChangePassWord);
    const daysSinceChange = Math.floor(
        (now.getTime() - passwordDate.getTime()) / (1000 * 60 * 60 * 24)
    );
    return 90 - daysSinceChange;
};


export const hashPassword = async (password: string): Promise<string> => {
    const saltRounds = 10;
    return await bcrypt.hash(password, saltRounds);
};

export const comparePassword = async (
    plainPassword: string,
    hashedPassword: string
): Promise<boolean> => {
    return await bcrypt.compare(plainPassword, hashedPassword);
};